import type { Prisma } from "@prisma/client";

import { type TaskActionType } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/utils";

async function createAutoTaskIfMissing(params: {
  retailer_id: number;
  title: string;
  action_type: TaskActionType;
  due_in_days: number;
  activity_note: string;
}) {
  const existing = await prisma.task.findFirst({
    where: {
      retailer_id: params.retailer_id,
      title: params.title,
      action_type: params.action_type,
      status: "OPEN"
    }
  });

  if (existing) return;

  await prisma.task.create({
    data: {
      retailer_id: params.retailer_id,
      title: params.title,
      action_type: params.action_type,
      due_date: addDays(new Date(), params.due_in_days)
    }
  });

  await prisma.activity.create({
    data: {
      retailer_id: params.retailer_id,
      type: "NOTE",
      summary: params.activity_note
    }
  });
}

export async function runStageAutomations(params: {
  retailer_id: number;
  previous_stage: string;
  new_stage: string;
}) {
  if (params.previous_stage === params.new_stage) return;

  if (params.new_stage === "SAMPLES_SENT") {
    await createAutoTaskIfMissing({
      retailer_id: params.retailer_id,
      title: "Follow up on sample feedback",
      action_type: "CALL",
      due_in_days: 7,
      activity_note: "Automation: Sample follow-up call scheduled for +7 days."
    });
  }

  if (params.new_stage === "WON_FIRST_PO_PLACED") {
    await createAutoTaskIfMissing({
      retailer_id: params.retailer_id,
      title: "Onboarding task",
      action_type: "TRAINING",
      due_in_days: 3,
      activity_note: "Automation: Onboarding task scheduled for +3 days after first PO."
    });
  }
}

export async function syncAtRiskFlags() {
  const threshold = addDays(new Date(), -60);

  await prisma.retailer.updateMany({
    where: {
      stage: "LOST_NOT_A_FIT",
      is_at_risk: true
    },
    data: { is_at_risk: false }
  });

  await prisma.retailer.updateMany({
    where: {
      stage: { not: "LOST_NOT_A_FIT" },
      last_order_date: {
        lt: threshold
      }
    },
    data: {
      is_at_risk: true
    }
  });

  await prisma.retailer.updateMany({
    where: {
      OR: [
        { last_order_date: null },
        {
          last_order_date: {
            gte: threshold
          }
        }
      ]
    },
    data: {
      is_at_risk: false
    }
  });
}

export async function logRetailerActivity(data: Prisma.ActivityUncheckedCreateInput) {
  await prisma.activity.create({ data });
}
