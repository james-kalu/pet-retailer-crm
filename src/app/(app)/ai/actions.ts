"use server";

import { revalidatePath } from "next/cache";

import { runStageAutomations } from "@/lib/automations";
import { requireAuth } from "@/lib/auth";
import { generateJsonObject } from "@/lib/ai/openai";
import { aiPlanSchema, planSelectionsSchema, type AIPlan, type UpdateSelectionKey } from "@/lib/ai/planSchema";
import {
  BLOCKER_OPTIONS,
  STAGE_OPTIONS,
  SUPPORT_NEEDED_OPTIONS,
  TASK_ACTION_OPTIONS,
  type Stage
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addDays, asStringArray, startOfDay, toJsonStringArray } from "@/lib/utils";

type Mode = "global_inbox" | "retailer_detail";

function stageValues(): string {
  return STAGE_OPTIONS.map((option) => option.value).join(", ");
}

function blockerValues(): string {
  return BLOCKER_OPTIONS.map((option) => option.value).join(", ");
}

function taskActionValues(): string {
  return TASK_ACTION_OPTIONS.map((option) => option.value).join(", ");
}

function truncate(input: string, max = 220): string {
  if (input.length <= max) {
    return input;
  }
  return `${input.slice(0, max)}...`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

function parseDateStringToLocalDate(input: string | null): Date | null {
  if (!input) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((item) => item.trim()).filter(Boolean));

  for (const item of incoming.map((value) => value.trim()).filter(Boolean)) {
    seen.add(item);
  }

  return [...seen];
}

function computeIsAtRisk(stage: string, lastOrderDate: Date | null): boolean {
  if (!lastOrderDate || stage === "LOST_NOT_A_FIT") {
    return false;
  }

  return lastOrderDate < addDays(new Date(), -60);
}

function cleanNullableText(input: string | null | undefined): string | null {
  const value = input?.trim();
  return value ? value : null;
}

function inferNewRetailerIntent(note: string): boolean {
  return /\b(add|create|new)\b.{0,32}\b(retailer|store|shop|account)\b/i.test(note);
}

function inferRetailerNameFromNote(note: string): string | null {
  const patterns = [
    /\b(?:called|named)\s+([^.\n,]+)/i,
    /\b(?:add|create)\s+(?:new\s+)?(?:retailer|store|shop|account)\s+(?:called|named)?\s*([^.\n,]+)/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(note);
    if (!match?.[1]) {
      continue;
    }

    const value = match[1].trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeGlobalInboxPlan(note: string, plan: AIPlan): {
  plan: AIPlan;
  recommendCreateNew: boolean;
} {
  const normalizedUpdates = {
    ...plan.updates,
    retailer_name: cleanNullableText(plan.updates.retailer_name),
    address: cleanNullableText(plan.updates.address),
    city: cleanNullableText(plan.updates.city),
    region: cleanNullableText(plan.updates.region),
    postal_code: cleanNullableText(plan.updates.postal_code),
    phone: cleanNullableText(plan.updates.phone),
    primary_contact_name: cleanNullableText(plan.updates.primary_contact_name),
    primary_contact_email: cleanNullableText(plan.updates.primary_contact_email),
    primary_contact_phone: cleanNullableText(plan.updates.primary_contact_phone),
    notes_append: cleanNullableText(plan.updates.notes_append)
  };

  const relatedReasoning = `${plan.retailer_match.reasoning} ${plan.retailer_match.alternatives
    .map((option) => option.reasoning)
    .join(" ")}`.toLowerCase();
  const bestConfidence = Math.max(
    plan.retailer_match.confidence,
    ...plan.retailer_match.alternatives.map((option) => option.confidence)
  );
  const newRetailerIntent = inferNewRetailerIntent(note);
  const clearlyUnrelated = /(unrelated|no match|not related|different retailer|does not match)/.test(relatedReasoning);
  const recommendCreateNew = newRetailerIntent || clearlyUnrelated || bestConfidence < 0.35;

  const normalizedPlan: AIPlan = {
    ...plan,
    retailer_match:
      recommendCreateNew || plan.retailer_match.confidence < 0.2
        ? {
            ...plan.retailer_match,
            retailer_id: null
          }
        : plan.retailer_match,
    updates: {
      ...normalizedUpdates,
      stage: plan.updates.stage ?? (newRetailerIntent ? "LEAD_IDENTIFIED" : null)
    }
  };

  return {
    plan: normalizedPlan,
    recommendCreateNew
  };
}

const SYSTEM_PROMPT = `You are an assistant for a pet-food retailer CRM.
Return JSON only, no markdown, no prose outside JSON.
Be conservative. If unsure, keep fields null and add questions.
Never invent facts.

Allowed stage values:
${stageValues()}

Allowed blocker values:
${blockerValues()}

Allowed task action_type values:
${taskActionValues()}

Behavior rules:
- Prefer actionable tasks over vague suggestions.
- Do not change stage unless the note clearly indicates a change.
- If note mentions samples requested/sent: propose CALL follow-up in 7 days.
- If staff confusion/objections: propose TRAINING in 3 days.
- If placement/visibility/signage issues: propose SEND_ASSETS in 2 days and/or VISIT in 5 days.
- If last order seems old or reorder likely: propose REORDER_ASK in 1-3 days.
- Always include short why for each task.
- Global inbox mode: if retailer confidence < 0.6, include 2-3 alternatives and a clarifying question.
- Global inbox mode: if note indicates adding a brand-new retailer not in candidates, set retailer_match.retailer_id to null and fill updates.retailer_name/address/city/region/postal_code/phone if present.

Output must match exactly this JSON shape:
{
  "mode": "global_inbox" | "retailer_detail",
  "retailer_match": {
    "retailer_id": number | null,
    "confidence": number,
    "reasoning": string,
    "alternatives": [{ "retailer_id": number, "confidence": number, "reasoning": string }]
  },
  "summary": string,
  "updates": {
    "retailer_name": string | null,
    "address": string | null,
    "city": string | null,
    "region": string | null,
    "postal_code": string | null,
    "phone": string | null,
    "stage": string | null,
    "blocker": string | null,
    "support_needed": string[],
    "primary_contact_name": string | null,
    "primary_contact_email": string | null,
    "primary_contact_phone": string | null,
    "last_order_date": string | null,
    "first_order_date": string | null,
    "notes_append": string | null,
    "tags_add": string[]
  },
  "tasks": [{
    "title": string,
    "action_type": "CALL"|"EMAIL"|"VISIT"|"SEND_SAMPLES"|"TRAINING"|"IN_STORE_SAMPLING"|"SEND_ASSETS"|"REVIEW_SELL_THROUGH"|"REORDER_ASK",
    "due_in_days": number,
    "why": string
  }],
  "questions": string[],
  "confidence": { "stage": number, "blocker": number, "tasks": number }
}`;

async function logAiAudit(params: {
  retailerId: number;
  mode: Mode;
  phase: "generation" | "apply";
  summary: string;
  rawNote: string;
  planPayload: unknown;
  appliedSummary?: string;
}) {
  const messageParts = [
    `AI Assist (${params.mode}) ${params.phase}: ${params.summary}`,
    `Applied: ${params.appliedSummary ?? "n/a"}`,
    "Raw note:",
    params.rawNote,
    "Plan:",
    typeof params.planPayload === "string" ? params.planPayload : safeStringify(params.planPayload)
  ];

  await prisma.activity.create({
    data: {
      retailer_id: params.retailerId,
      type: "NOTE",
      summary: messageParts.join("\n")
    }
  });
}

function buildGlobalUserPrompt(params: {
  note: string;
  sourceUrl?: string;
  retailers: Array<{
    id: number;
    name: string;
    city: string | null;
    region: string | null;
    stage: string;
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    tags: string;
    last_order_date: Date | null;
    notes: string;
    updated_at: Date;
  }>;
}): string {
  const compactRetailers = params.retailers.map((retailer) => ({
    id: retailer.id,
    n: retailer.name,
    c: retailer.city,
    r: retailer.region,
    s: retailer.stage,
    pcn: retailer.primary_contact_name,
    pce: retailer.primary_contact_email,
    pcp: retailer.primary_contact_phone,
    tags: asStringArray(retailer.tags),
    lod: retailer.last_order_date ? retailer.last_order_date.toISOString().slice(0, 10) : null,
    notes: truncate(retailer.notes || ""),
    u: retailer.updated_at.toISOString().slice(0, 10)
  }));

  return [
    "Mode: global_inbox",
    params.sourceUrl ? `Source URL: ${params.sourceUrl}` : "Source URL: none",
    "Global note:",
    params.note,
    "Retailer candidates JSON:",
    JSON.stringify(compactRetailers)
  ].join("\n\n");
}

function buildRetailerUserPrompt(params: {
  note: string;
  retailer: {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    phone: string | null;
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    stage: string;
    blocker: string | null;
    support_needed: string;
    tags: string;
    notes: string;
    first_order_date: Date | null;
    last_order_date: Date | null;
  };
  recentTasks: Array<{
    title: string;
    action_type: string;
    due_date: Date;
    status: string;
    completed_at: Date | null;
    created_at: Date;
  }>;
  recentActivities: Array<{
    type: string;
    summary: string;
    created_at: Date;
  }>;
}): string {
  const retailerState = {
    id: params.retailer.id,
    name: params.retailer.name,
    address: params.retailer.address,
    city: params.retailer.city,
    region: params.retailer.region,
    postal_code: params.retailer.postal_code,
    phone: params.retailer.phone,
    primary_contact_name: params.retailer.primary_contact_name,
    primary_contact_email: params.retailer.primary_contact_email,
    primary_contact_phone: params.retailer.primary_contact_phone,
    stage: params.retailer.stage,
    blocker: params.retailer.blocker,
    support_needed: asStringArray(params.retailer.support_needed),
    tags: asStringArray(params.retailer.tags),
    notes: truncate(params.retailer.notes || "", 400),
    first_order_date: params.retailer.first_order_date ? params.retailer.first_order_date.toISOString().slice(0, 10) : null,
    last_order_date: params.retailer.last_order_date ? params.retailer.last_order_date.toISOString().slice(0, 10) : null
  };

  const tasks = params.recentTasks.map((task) => ({
    title: task.title,
    action_type: task.action_type,
    due_date: task.due_date.toISOString().slice(0, 10),
    status: task.status,
    completed_at: task.completed_at ? task.completed_at.toISOString().slice(0, 10) : null,
    created_at: task.created_at.toISOString().slice(0, 10)
  }));

  const activities = params.recentActivities.map((activity) => ({
    type: activity.type,
    summary: truncate(activity.summary, 240),
    created_at: activity.created_at.toISOString().slice(0, 10)
  }));

  return [
    "Mode: retailer_detail",
    "Retailer state JSON:",
    JSON.stringify(retailerState),
    "Recent tasks JSON:",
    JSON.stringify(tasks),
    "Recent activities JSON:",
    JSON.stringify(activities),
    "New note:",
    params.note
  ].join("\n\n");
}

function parsePlanResult(expectedMode: Mode, parsed: unknown):
  | { ok: true; plan: AIPlan }
  | { ok: false; error: string; issues: string[] } {
  const validation = aiPlanSchema.safeParse(normalizeAiPlanInput(parsed));
  if (!validation.success) {
    return {
      ok: false,
      error: "AI output did not match required schema.",
      issues: validation.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    };
  }

  if (validation.data.mode !== expectedMode) {
    return {
      ok: false,
      error: `AI mode mismatch. Expected ${expectedMode} but got ${validation.data.mode}.`,
      issues: []
    };
  }

  return {
    ok: true,
    plan: validation.data
  };
}

function normalizeSupportNeededValue(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[_-]/g, " ");

  const aliasMap: Record<string, (typeof SUPPORT_NEEDED_OPTIONS)[number]> = {
    training: "Training",
    samples: "Samples",
    signage: "Signage",
    visit: "Visit",
    "in store sampling": "In-store sampling",
    "instore sampling": "In-store sampling",
    "digital assets": "Digital assets",
    "reorder check in": "Reorder check-in",
    "reorder check-in": "Reorder check-in"
  };

  return aliasMap[normalized] ?? value;
}

function normalizeAiPlanInput(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  const root = parsed as Record<string, unknown>;
  const updates = root.updates;

  if (!updates || typeof updates !== "object") {
    return parsed;
  }

  const updatesObject = updates as Record<string, unknown>;
  const supportNeeded = updatesObject.support_needed;

  if (!Array.isArray(supportNeeded)) {
    return parsed;
  }

  return {
    ...root,
    updates: {
      ...updatesObject,
      support_needed: supportNeeded
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeSupportNeededValue(item))
    }
  };
}

function uniqueTaskIndexes(indexes: number[], max: number): number[] {
  return [...new Set(indexes)].filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < max);
}

function selectedSet(keys: UpdateSelectionKey[]): Set<UpdateSelectionKey> {
  return new Set(keys);
}

async function applyPlanToRetailer(params: {
  retailerId: number;
  plan: AIPlan;
  mode: Mode;
  rawNote: string;
  selectedUpdateKeys: UpdateSelectionKey[];
  selectedTaskIndexes: number[];
}) {
  const retailer = await prisma.retailer.findUnique({
    where: { id: params.retailerId },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      region: true,
      postal_code: true,
      phone: true,
      stage: true,
      blocker: true,
      support_needed: true,
      tags: true,
      notes: true,
      last_order_date: true,
      first_order_date: true,
      primary_contact_name: true,
      primary_contact_email: true,
      primary_contact_phone: true
    }
  });

  if (!retailer) {
    return {
      ok: false as const,
      error: "Retailer not found."
    };
  }

  const selection = selectedSet(params.selectedUpdateKeys);
  const updateData: Record<string, unknown> = {};
  const appliedFields: string[] = [];

  if (selection.has("retailer_name") && params.plan.updates.retailer_name?.trim()) {
    updateData.name = params.plan.updates.retailer_name.trim();
    appliedFields.push("retailer_name");
  }

  if (selection.has("address") && params.plan.updates.address?.trim()) {
    updateData.address = params.plan.updates.address.trim();
    appliedFields.push("address");
  }

  if (selection.has("city") && params.plan.updates.city?.trim()) {
    updateData.city = params.plan.updates.city.trim();
    appliedFields.push("city");
  }

  if (selection.has("region") && params.plan.updates.region?.trim()) {
    updateData.region = params.plan.updates.region.trim();
    appliedFields.push("region");
  }

  if (selection.has("postal_code") && params.plan.updates.postal_code?.trim()) {
    updateData.postal_code = params.plan.updates.postal_code.trim();
    appliedFields.push("postal_code");
  }

  if (selection.has("phone") && params.plan.updates.phone?.trim()) {
    updateData.phone = params.plan.updates.phone.trim();
    appliedFields.push("phone");
  }

  if (selection.has("stage") && params.plan.updates.stage) {
    updateData.stage = params.plan.updates.stage;
    appliedFields.push(`stage=${params.plan.updates.stage}`);
  }

  if (selection.has("blocker") && params.plan.updates.blocker) {
    updateData.blocker = params.plan.updates.blocker;
    appliedFields.push(`blocker=${params.plan.updates.blocker}`);
  }

  if (selection.has("support_needed") && params.plan.updates.support_needed.length > 0) {
    const mergedSupport = mergeUniqueStrings(asStringArray(retailer.support_needed), params.plan.updates.support_needed);
    updateData.support_needed = toJsonStringArray(mergedSupport);
    appliedFields.push(`support_needed(+${params.plan.updates.support_needed.join(", ")})`);
  }

  if (selection.has("tags_add") && params.plan.updates.tags_add.length > 0) {
    const mergedTags = mergeUniqueStrings(asStringArray(retailer.tags), params.plan.updates.tags_add);
    updateData.tags = toJsonStringArray(mergedTags);
    appliedFields.push(`tags_add(+${params.plan.updates.tags_add.join(", ")})`);
  }

  if (selection.has("notes_append") && params.plan.updates.notes_append?.trim()) {
    const appendText = params.plan.updates.notes_append.trim();
    updateData.notes = retailer.notes?.trim() ? `${retailer.notes.trim()}\n\n${appendText}` : appendText;
    appliedFields.push("notes_append");
  }

  if (selection.has("primary_contact_name") && params.plan.updates.primary_contact_name?.trim()) {
    updateData.primary_contact_name = params.plan.updates.primary_contact_name.trim();
    appliedFields.push("primary_contact_name");
  }

  if (selection.has("primary_contact_email") && params.plan.updates.primary_contact_email?.trim()) {
    updateData.primary_contact_email = params.plan.updates.primary_contact_email.trim();
    appliedFields.push("primary_contact_email");
  }

  if (selection.has("primary_contact_phone") && params.plan.updates.primary_contact_phone?.trim()) {
    updateData.primary_contact_phone = params.plan.updates.primary_contact_phone.trim();
    appliedFields.push("primary_contact_phone");
  }

  if (selection.has("last_order_date") && params.plan.updates.last_order_date) {
    const parsedDate = parseDateStringToLocalDate(params.plan.updates.last_order_date);
    if (parsedDate) {
      updateData.last_order_date = parsedDate;
      appliedFields.push(`last_order_date=${params.plan.updates.last_order_date}`);
    }
  }

  if (selection.has("first_order_date") && params.plan.updates.first_order_date) {
    const parsedDate = parseDateStringToLocalDate(params.plan.updates.first_order_date);
    if (parsedDate) {
      updateData.first_order_date = parsedDate;
      appliedFields.push(`first_order_date=${params.plan.updates.first_order_date}`);
    }
  }

  const nextStage = (updateData.stage as string | undefined) ?? retailer.stage;
  const nextLastOrderDate = (updateData.last_order_date as Date | undefined) ?? retailer.last_order_date;
  updateData.is_at_risk = computeIsAtRisk(nextStage, nextLastOrderDate);

  if (Object.keys(updateData).length > 1 || (Object.keys(updateData).length === 1 && !Object.hasOwn(updateData, "is_at_risk"))) {
    await prisma.retailer.update({
      where: { id: retailer.id },
      data: updateData
    });

    if (retailer.stage !== nextStage) {
      await runStageAutomations({
        retailer_id: retailer.id,
        previous_stage: retailer.stage,
        new_stage: nextStage as Stage
      });
    }
  }

  const selectedTaskIndexes = uniqueTaskIndexes(params.selectedTaskIndexes, params.plan.tasks.length);
  let createdTaskCount = 0;

  for (const idx of selectedTaskIndexes) {
    const task = params.plan.tasks[idx];
    if (!task) {
      continue;
    }

    const existing = await prisma.task.findFirst({
      where: {
        retailer_id: retailer.id,
        title: task.title,
        action_type: task.action_type,
        status: "OPEN"
      }
    });

    if (existing) {
      continue;
    }

    await prisma.task.create({
      data: {
        retailer_id: retailer.id,
        title: task.title,
        action_type: task.action_type,
        due_date: addDays(startOfDay(), task.due_in_days),
        status: "OPEN"
      }
    });

    createdTaskCount += 1;
    appliedFields.push(`task:${task.title}`);
  }

  const appliedSummary = appliedFields.length > 0 ? appliedFields.join(", ") : "no changes applied";

  await logAiAudit({
    retailerId: retailer.id,
    mode: params.mode,
    phase: "apply",
    summary: params.plan.summary,
    rawNote: params.rawNote,
    planPayload: params.plan,
    appliedSummary
  });

  revalidatePath("/");
  revalidatePath("/retailers");
  revalidatePath(`/retailers/${retailer.id}`);
  revalidatePath("/work-queue");
  revalidatePath("/inbox");

  return {
    ok: true as const,
    message: `Applied ${appliedFields.length} change(s), created ${createdTaskCount} task(s).`,
    appliedSummary,
    createdTaskCount
  };
}

export async function generateGlobalInboxPlan(note: string, sourceUrl?: string) {
  requireAuth();

  const trimmedNote = note.trim();
  if (!trimmedNote) {
    return {
      ok: false as const,
      error: "Please enter a note before generating."
    };
  }

  const retailers = await prisma.retailer.findMany({
    take: 50,
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      name: true,
      city: true,
      region: true,
      stage: true,
      primary_contact_name: true,
      primary_contact_email: true,
      primary_contact_phone: true,
      tags: true,
      last_order_date: true,
      notes: true,
      updated_at: true
    }
  });

  const userPrompt = buildGlobalUserPrompt({ note: trimmedNote, sourceUrl, retailers });

  let rawOutput = "";
  try {
    const ai = await generateJsonObject({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt
    });

    rawOutput = ai.raw;
    const parsed = parsePlanResult("global_inbox", ai.parsed);

    if (!parsed.ok) {
      if (retailers[0]?.id) {
        await logAiAudit({
          retailerId: retailers[0].id,
          mode: "global_inbox",
          phase: "generation",
          summary: "Invalid AI schema output",
          rawNote: trimmedNote,
          planPayload: {
            rawOutput,
            issues: parsed.issues
          },
          appliedSummary: "no changes applied"
        });
      }

      return {
        ok: false as const,
        error: parsed.error,
        validationIssues: parsed.issues,
        rawOutput
      };
    }

    const normalized = normalizeGlobalInboxPlan(trimmedNote, parsed.plan);

    const auditRetailerId =
      normalized.plan.retailer_match.retailer_id ??
      normalized.plan.retailer_match.alternatives[0]?.retailer_id ??
      retailers[0]?.id;

    if (auditRetailerId) {
      await logAiAudit({
        retailerId: auditRetailerId,
        mode: "global_inbox",
        phase: "generation",
        summary: normalized.plan.summary,
        rawNote: trimmedNote,
        planPayload: normalized.plan,
        appliedSummary: "generation only"
      });
    }

    return {
      ok: true as const,
      plan: normalized.plan,
      recommendCreateNew: normalized.recommendCreateNew,
      model: ai.model,
      rawOutput,
      retailerContext: retailers.map((retailer) => ({
        id: retailer.id,
        name: retailer.name,
        city: retailer.city,
        region: retailer.region,
        stage: retailer.stage,
        primary_contact_name: retailer.primary_contact_name,
        updated_at: retailer.updated_at.toISOString()
      }))
    };
  } catch (error) {
    if (retailers[0]?.id) {
      await logAiAudit({
        retailerId: retailers[0].id,
        mode: "global_inbox",
        phase: "generation",
        summary: "Generation error",
        rawNote: trimmedNote,
        planPayload: {
          rawOutput,
          error: error instanceof Error ? error.message : String(error)
        },
        appliedSummary: "no changes applied"
      });
    }

    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to generate AI plan."
    };
  }
}

export async function applyGlobalInboxPlan(
  selectedRetailerId: number | null,
  plan: unknown,
  selections: unknown
) {
  requireAuth();

  const parsedPlan = parsePlanResult("global_inbox", plan);
  if (!parsedPlan.ok) {
    return {
      ok: false as const,
      error: parsedPlan.error,
      validationIssues: parsedPlan.issues
    };
  }

  const parsedSelections = planSelectionsSchema.safeParse(selections);
  if (!parsedSelections.success) {
    return {
      ok: false as const,
      error: "Invalid apply selection payload.",
      validationIssues: parsedSelections.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    };
  }

  if (selectedRetailerId === null) {
    const inferredName =
      cleanNullableText(parsedPlan.plan.updates.retailer_name) ??
      inferRetailerNameFromNote(parsedSelections.data.raw_note);

    if (!inferredName) {
      return {
        ok: false as const,
        error: "Could not determine a retailer name. Enter the name in the note and regenerate, or choose an existing retailer."
      };
    }

    const createdRetailer = await prisma.retailer.create({
      data: {
        name: inferredName,
        stage: "LEAD_IDENTIFIED",
        is_at_risk: false
      },
      select: {
        id: true,
        name: true
      }
    });

    await prisma.activity.create({
      data: {
        retailer_id: createdRetailer.id,
        type: "NOTE",
        summary: `AI Assist (global_inbox) apply: created retailer "${createdRetailer.name}" from inbox note.`
      }
    });

    const applied = await applyPlanToRetailer({
      retailerId: createdRetailer.id,
      plan: parsedPlan.plan,
      mode: "global_inbox",
      rawNote: parsedSelections.data.raw_note,
      selectedUpdateKeys: parsedSelections.data.selected_update_keys,
      selectedTaskIndexes: parsedSelections.data.selected_task_indexes
    });

    if (!applied.ok) {
      return applied;
    }

    return {
      ...applied,
      message: `Created "${createdRetailer.name}". ${applied.message}`
    };
  }

  if (!Number.isInteger(selectedRetailerId) || selectedRetailerId <= 0) {
    return {
      ok: false as const,
      error: "Choose a retailer or Create New before applying."
    };
  }

  return applyPlanToRetailer({
    retailerId: selectedRetailerId,
    plan: parsedPlan.plan,
    mode: "global_inbox",
    rawNote: parsedSelections.data.raw_note,
    selectedUpdateKeys: parsedSelections.data.selected_update_keys,
    selectedTaskIndexes: parsedSelections.data.selected_task_indexes
  });
}

export async function generateRetailerPlan(retailerId: number, note: string) {
  requireAuth();

  const trimmedNote = note.trim();
  if (!trimmedNote) {
    return {
      ok: false as const,
      error: "Please enter a note before generating."
    };
  }

  if (!Number.isInteger(retailerId) || retailerId <= 0) {
    return {
      ok: false as const,
      error: "Invalid retailer id."
    };
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      region: true,
      postal_code: true,
      phone: true,
      primary_contact_name: true,
      primary_contact_email: true,
      primary_contact_phone: true,
      stage: true,
      blocker: true,
      support_needed: true,
      tags: true,
      notes: true,
      first_order_date: true,
      last_order_date: true
    }
  });

  if (!retailer) {
    return {
      ok: false as const,
      error: "Retailer not found."
    };
  }

  const [recentTasks, recentActivities] = await Promise.all([
    prisma.task.findMany({
      where: { retailer_id: retailer.id },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        title: true,
        action_type: true,
        due_date: true,
        status: true,
        completed_at: true,
        created_at: true
      }
    }),
    prisma.activity.findMany({
      where: { retailer_id: retailer.id },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        type: true,
        summary: true,
        created_at: true
      }
    })
  ]);

  const userPrompt = buildRetailerUserPrompt({
    note: trimmedNote,
    retailer,
    recentTasks,
    recentActivities
  });

  let rawOutput = "";
  try {
    const ai = await generateJsonObject({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt
    });

    rawOutput = ai.raw;
    const parsed = parsePlanResult("retailer_detail", ai.parsed);

    if (!parsed.ok) {
      await logAiAudit({
        retailerId: retailer.id,
        mode: "retailer_detail",
        phase: "generation",
        summary: "Invalid AI schema output",
        rawNote: trimmedNote,
        planPayload: {
          rawOutput,
          issues: parsed.issues
        },
        appliedSummary: "no changes applied"
      });

      return {
        ok: false as const,
        error: parsed.error,
        validationIssues: parsed.issues,
        rawOutput
      };
    }

    await logAiAudit({
      retailerId: retailer.id,
      mode: "retailer_detail",
      phase: "generation",
      summary: parsed.plan.summary,
      rawNote: trimmedNote,
      planPayload: parsed.plan,
      appliedSummary: "generation only"
    });

    return {
      ok: true as const,
      plan: parsed.plan,
      model: ai.model,
      rawOutput
    };
  } catch (error) {
    await logAiAudit({
      retailerId: retailer.id,
      mode: "retailer_detail",
      phase: "generation",
      summary: "Generation error",
      rawNote: trimmedNote,
      planPayload: {
        rawOutput,
        error: error instanceof Error ? error.message : String(error)
      },
      appliedSummary: "no changes applied"
    });

    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to generate AI plan."
    };
  }
}

export async function applyRetailerPlan(retailerId: number, plan: unknown, selections: unknown) {
  requireAuth();

  const parsedPlan = parsePlanResult("retailer_detail", plan);
  if (!parsedPlan.ok) {
    return {
      ok: false as const,
      error: parsedPlan.error,
      validationIssues: parsedPlan.issues
    };
  }

  const parsedSelections = planSelectionsSchema.safeParse(selections);
  if (!parsedSelections.success) {
    return {
      ok: false as const,
      error: "Invalid apply selection payload.",
      validationIssues: parsedSelections.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    };
  }

  if (!Number.isInteger(retailerId) || retailerId <= 0) {
    return {
      ok: false as const,
      error: "Invalid retailer id."
    };
  }

  return applyPlanToRetailer({
    retailerId,
    plan: parsedPlan.plan,
    mode: "retailer_detail",
    rawNote: parsedSelections.data.raw_note,
    selectedUpdateKeys: parsedSelections.data.selected_update_keys,
    selectedTaskIndexes: parsedSelections.data.selected_task_indexes
  });
}
