import { z } from "zod";

import {
  BLOCKER_OPTIONS,
  STAGE_OPTIONS,
  SUPPORT_NEEDED_OPTIONS,
  TASK_ACTION_OPTIONS,
  type Blocker,
  type Stage,
  type TaskActionType
} from "@/lib/constants";

const STAGE_VALUES = STAGE_OPTIONS.map((option) => option.value) as [Stage, ...Stage[]];
const BLOCKER_VALUES = BLOCKER_OPTIONS.map((option) => option.value) as [Blocker, ...Blocker[]];
const TASK_ACTION_VALUES = TASK_ACTION_OPTIONS.map((option) => option.value) as [TaskActionType, ...TaskActionType[]];
const SUPPORT_VALUES = [...SUPPORT_NEEDED_OPTIONS] as [
  (typeof SUPPORT_NEEDED_OPTIONS)[number],
  ...(typeof SUPPORT_NEEDED_OPTIONS)[number][]
];

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable();

const updatesSchema = z
  .object({
    retailer_name: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    postal_code: z.string().nullable(),
    phone: z.string().nullable(),
    stage: z.enum(STAGE_VALUES).nullable(),
    blocker: z.enum(BLOCKER_VALUES).nullable(),
    support_needed: z.array(z.enum(SUPPORT_VALUES)),
    primary_contact_name: z.string().nullable(),
    primary_contact_email: z.string().nullable(),
    primary_contact_phone: z.string().nullable(),
    last_order_date: dateStringSchema,
    first_order_date: dateStringSchema,
    notes_append: z.string().nullable(),
    tags_add: z.array(z.string())
  })
  .strict();

const taskSchema = z
  .object({
    title: z.string(),
    action_type: z.enum(TASK_ACTION_VALUES),
    due_in_days: z.number().int().min(0),
    why: z.string()
  })
  .strict();

const retailerAlternativeSchema = z
  .object({
    retailer_id: z.number().int().positive(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string()
  })
  .strict();

export const aiPlanSchema = z
  .object({
    mode: z.enum(["global_inbox", "retailer_detail"]),
    retailer_match: z
      .object({
        retailer_id: z.number().int().positive().nullable(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
        alternatives: z.array(retailerAlternativeSchema)
      })
      .strict(),
    summary: z.string(),
    updates: updatesSchema,
    tasks: z.array(taskSchema),
    questions: z.array(z.string()),
    confidence: z
      .object({
        stage: z.number().min(0).max(1),
        blocker: z.number().min(0).max(1),
        tasks: z.number().min(0).max(1)
      })
      .strict()
  })
  .strict();

export type AIPlan = z.infer<typeof aiPlanSchema>;

export const UPDATE_SELECTION_KEYS = [
  "retailer_name",
  "address",
  "city",
  "region",
  "postal_code",
  "phone",
  "stage",
  "blocker",
  "support_needed",
  "primary_contact_name",
  "primary_contact_email",
  "primary_contact_phone",
  "last_order_date",
  "first_order_date",
  "notes_append",
  "tags_add"
] as const;

export type UpdateSelectionKey = (typeof UPDATE_SELECTION_KEYS)[number];

export const planSelectionsSchema = z
  .object({
    raw_note: z.string().min(1),
    selected_update_keys: z.array(z.enum(UPDATE_SELECTION_KEYS)),
    selected_task_indexes: z.array(z.number().int().nonnegative())
  })
  .strict();

export type PlanSelections = z.infer<typeof planSelectionsSchema>;
