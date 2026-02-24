"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ACTIVITY_OPTIONS,
  BLOCKER_OPTIONS,
  SLOW_SELL_PLAYBOOK,
  STAGE_OPTIONS,
  SUPPORT_NEEDED_OPTIONS,
  TASK_ACTION_OPTIONS,
  type ActivityType,
  type Blocker,
  type Stage,
  type TaskActionType
} from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { logRetailerActivity, runStageAutomations } from "@/lib/automations";
import { prisma } from "@/lib/prisma";
import { addDays, parseCsv, startOfDay, toJsonStringArray } from "@/lib/utils";

function parseStage(value: FormDataEntryValue | null): Stage {
  if (typeof value !== "string") {
    return "LEAD_IDENTIFIED";
  }

  return STAGE_OPTIONS.find((option) => option.value === value)?.value ?? "LEAD_IDENTIFIED";
}

function parseBlocker(value: FormDataEntryValue | null): Blocker | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  return BLOCKER_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

function parseTaskActionType(value: FormDataEntryValue | null): TaskActionType {
  if (typeof value !== "string") {
    return "CALL";
  }

  return TASK_ACTION_OPTIONS.find((option) => option.value === value)?.value ?? "CALL";
}

function parseActivityType(value: FormDataEntryValue | null): ActivityType {
  if (typeof value !== "string") {
    return "NOTE";
  }

  return ACTIVITY_OPTIONS.find((option) => option === value) ?? "NOTE";
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseSupportNeeded(values: FormDataEntryValue[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .filter((value) => SUPPORT_NEEDED_OPTIONS.includes(value as (typeof SUPPORT_NEEDED_OPTIONS)[number]));
}

function computeIsAtRisk(stage: Stage, lastOrderDate: Date | null): boolean {
  if (!lastOrderDate || stage === "LOST_NOT_A_FIT") {
    return false;
  }

  return lastOrderDate < addDays(new Date(), -60);
}

function revalidateCorePaths(retailerId?: number) {
  revalidatePath("/");
  revalidatePath("/retailers");
  revalidatePath("/work-queue");

  if (retailerId) {
    revalidatePath(`/retailers/${retailerId}`);
  }
}

export async function createRetailerAction(formData: FormData) {
  requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/retailers/new?error=name");
  }

  const stage = parseStage(formData.get("stage"));
  const support_needed = parseSupportNeeded(formData.getAll("support_needed"));
  const firstOrderDate = parseDate(formData.get("first_order_date"));
  const lastOrderDate = parseDate(formData.get("last_order_date"));

  const retailer = await prisma.retailer.create({
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      region: String(formData.get("region") ?? "").trim() || null,
      postal_code: String(formData.get("postal_code") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      primary_contact_name: String(formData.get("primary_contact_name") ?? "").trim() || null,
      primary_contact_email: String(formData.get("primary_contact_email") ?? "").trim() || null,
      primary_contact_phone: String(formData.get("primary_contact_phone") ?? "").trim() || null,
      stage,
      tags: toJsonStringArray(parseCsv(String(formData.get("tags") ?? ""))),
      products_carried: toJsonStringArray(parseCsv(String(formData.get("products_carried") ?? ""))),
      blocker: parseBlocker(formData.get("blocker")),
      support_needed: toJsonStringArray(support_needed),
      notes: String(formData.get("notes") ?? "").trim(),
      first_order_date: firstOrderDate,
      last_order_date: lastOrderDate,
      is_at_risk: computeIsAtRisk(stage, lastOrderDate)
    }
  });

  await logRetailerActivity({
    retailer_id: retailer.id,
    type: "NOTE",
    summary: `Retailer added at stage ${stage}.`
  });

  await runStageAutomations({
    retailer_id: retailer.id,
    previous_stage: "LEAD_IDENTIFIED",
    new_stage: stage
  });

  revalidateCorePaths(retailer.id);
  redirect(`/retailers/${retailer.id}`);
}

export async function updateRetailerQuickAction(formData: FormData) {
  requireAuth();

  const retailerId = Number(formData.get("retailer_id"));
  if (!retailerId) {
    return;
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { stage: true }
  });

  if (!retailer) {
    return;
  }

  const newStage = parseStage(formData.get("stage"));
  const blocker = parseBlocker(formData.get("blocker"));
  const support_needed = parseSupportNeeded(formData.getAll("support_needed"));
  const last_order_date = parseDate(formData.get("last_order_date"));

  await prisma.retailer.update({
    where: { id: retailerId },
    data: {
      stage: newStage,
      blocker,
      support_needed: toJsonStringArray(support_needed),
      last_order_date,
      is_at_risk: computeIsAtRisk(newStage, last_order_date),
      notes: String(formData.get("notes") ?? "").trim()
    }
  });

  if (retailer.stage !== newStage) {
    await logRetailerActivity({
      retailer_id: retailerId,
      type: "NOTE",
      summary: `Stage updated from ${retailer.stage} to ${newStage}.`
    });
  }

  await runStageAutomations({
    retailer_id: retailerId,
    previous_stage: retailer.stage,
    new_stage: newStage
  });

  revalidateCorePaths(retailerId);
}

export async function createTaskAction(formData: FormData) {
  requireAuth();

  const retailerId = Number(formData.get("retailer_id"));
  if (!retailerId) {
    return;
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return;
  }

  const action_type = parseTaskActionType(formData.get("action_type"));
  const due_date = parseDate(formData.get("due_date")) ?? startOfDay();

  await prisma.task.create({
    data: {
      retailer_id: retailerId,
      title,
      action_type,
      due_date,
      status: "OPEN"
    }
  });

  await logRetailerActivity({
    retailer_id: retailerId,
    type: "NOTE",
    summary: `Task created: ${title}`
  });

  revalidateCorePaths(retailerId);
}

export async function completeTaskAction(formData: FormData) {
  requireAuth();

  const taskId = Number(formData.get("task_id"));
  const retailerId = Number(formData.get("retailer_id"));

  if (!taskId) {
    return;
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "DONE",
      completed_at: new Date()
    },
    select: {
      title: true,
      retailer_id: true
    }
  });

  await logRetailerActivity({
    retailer_id: task.retailer_id,
    type: "NOTE",
    summary: `Task completed: ${task.title}`
  });

  revalidateCorePaths(retailerId || task.retailer_id);
}

export async function snoozeTaskAction(formData: FormData) {
  requireAuth();

  const taskId = Number(formData.get("task_id"));
  const retailerId = Number(formData.get("retailer_id"));
  const snoozeDays = Number(formData.get("days") ?? 2);

  if (!taskId) {
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      due_date: true,
      retailer_id: true,
      title: true
    }
  });

  if (!task) {
    return;
  }

  const baseDate = task.due_date ?? new Date();

  await prisma.task.update({
    where: { id: taskId },
    data: {
      due_date: addDays(baseDate, snoozeDays),
      status: "OPEN"
    }
  });

  await logRetailerActivity({
    retailer_id: task.retailer_id,
    type: "NOTE",
    summary: `Task snoozed by ${snoozeDays} days: ${task.title}`
  });

  revalidateCorePaths(retailerId || task.retailer_id);
}

export async function addActivityAction(formData: FormData) {
  requireAuth();

  const retailerId = Number(formData.get("retailer_id"));
  if (!retailerId) {
    return;
  }

  const rawType = formData.get("type");
  const summary = String(formData.get("summary") ?? "").trim();

  if (!summary) {
    return;
  }

  const type = parseActivityType(rawType);

  await prisma.activity.create({
    data: {
      retailer_id: retailerId,
      type,
      summary
    }
  });

  revalidateCorePaths(retailerId);
}

export async function deleteActivityAction(formData: FormData) {
  requireAuth();

  const activityId = Number(formData.get("activity_id"));
  const retailerId = Number(formData.get("retailer_id"));

  if (!activityId || !retailerId) {
    return;
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      retailer_id: true,
      type: true
    }
  });

  if (!activity || activity.retailer_id !== retailerId || activity.type !== "NOTE") {
    return;
  }

  await prisma.activity.delete({
    where: { id: activity.id }
  });

  revalidateCorePaths(retailerId);
}

export async function markDoneAndCreateNextTaskAction(formData: FormData) {
  requireAuth();

  const taskId = Number(formData.get("task_id") ?? 0);
  const retailerId = Number(formData.get("retailer_id"));
  if (!retailerId) {
    return;
  }

  if (taskId) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        completed_at: new Date()
      }
    });
  }

  const actionType = parseTaskActionType(formData.get("next_action_type"));
  const nextTitle = String(formData.get("next_title") ?? "").trim() || "Next follow-up";
  const dueInDays = Number(formData.get("due_in_days") ?? 7);

  await prisma.task.create({
    data: {
      retailer_id: retailerId,
      title: nextTitle,
      action_type: actionType,
      due_date: addDays(new Date(), dueInDays),
      status: "OPEN"
    }
  });

  await logRetailerActivity({
    retailer_id: retailerId,
    type: "NOTE",
    summary: `Work Queue: next task created (${nextTitle}).`
  });

  revalidateCorePaths(retailerId);
}

export async function createPlaybookTaskAction(formData: FormData) {
  requireAuth();

  const retailerId = Number(formData.get("retailer_id"));
  const templateKey = String(formData.get("template_key") ?? "");

  if (!retailerId || !templateKey) {
    return;
  }

  const template = SLOW_SELL_PLAYBOOK.find((item) => item.key === templateKey);
  if (!template) {
    return;
  }

  await prisma.task.create({
    data: {
      retailer_id: retailerId,
      title: template.title,
      action_type: template.actionType,
      due_date: addDays(new Date(), template.dueInDays),
      status: "OPEN"
    }
  });

  await logRetailerActivity({
    retailer_id: retailerId,
    type: "NOTE",
    summary: `Playbook task created: ${template.title}`
  });

  revalidateCorePaths(retailerId);
}

export async function deleteRetailerAction(formData: FormData) {
  requireAuth();

  const retailerId = Number(formData.get("retailer_id"));
  const confirmName = String(formData.get("confirm_name") ?? "").trim();

  if (!retailerId) {
    return;
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      id: true,
      name: true
    }
  });

  if (!retailer) {
    redirect("/retailers");
  }

  if (confirmName.toLowerCase() !== retailer.name.trim().toLowerCase()) {
    redirect(`/retailers/${retailer.id}?error=delete_confirm`);
  }

  await prisma.retailer.delete({
    where: { id: retailer.id }
  });

  revalidatePath("/");
  revalidatePath("/retailers");
  revalidatePath("/work-queue");
  revalidatePath("/inbox");

  redirect("/retailers?deleted=1");
}
