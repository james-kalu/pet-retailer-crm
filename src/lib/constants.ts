// src/lib/constants.ts
// We removed Prisma enums (SQLite compatibility), so we use string constants everywhere.

export type Stage =
  | "LEAD_IDENTIFIED"
  | "CONTACTED"
  | "INTERESTED_NEEDS_INFO"
  | "MEETING_BOOKED"
  | "PRICE_LIST_SENT"
  | "SAMPLES_REQUESTED"
  | "SAMPLES_SENT"
  | "WAITING_DECISION"
  | "WON_FIRST_PO_PLACED"
  | "ONBOARDING_NEEDED"
  | "SLOW_SELL_THROUGH"
  | "IN_STORE_EVENT_PLANNED"
  | "REORDER_LIKELY"
  | "DORMANT"
  | "LOST_NOT_A_FIT";

export type Blocker =
  | "AWARENESS"
  | "PRICE"
  | "PLACEMENT"
  | "STAFF_KNOWLEDGE"
  | "WRONG_SKU_MIX"
  | "LOW_TRAFFIC"
  | "COMPETITOR_PRESSURE"
  | "OTHER";

export type TaskActionType =
  | "CALL"
  | "EMAIL"
  | "VISIT"
  | "SEND_SAMPLES"
  | "TRAINING"
  | "IN_STORE_SAMPLING"
  | "SEND_ASSETS"
  | "REVIEW_SELL_THROUGH"
  | "REORDER_ASK";

export type TaskStatus = "OPEN" | "DONE" | "SNOOZED";

export type ActivityType = "CALL" | "EMAIL" | "VISIT" | "NOTE";

export const STAGE_OPTIONS: Array<{ value: Stage; label: string }> = [
  { value: "LEAD_IDENTIFIED", label: "Lead Identified" },
  { value: "CONTACTED", label: "Contacted (intro done)" },
  { value: "INTERESTED_NEEDS_INFO", label: "Interested / Needs info" },
  { value: "MEETING_BOOKED", label: "Meeting booked" },
  { value: "PRICE_LIST_SENT", label: "Price list sent" },
  { value: "SAMPLES_REQUESTED", label: "Samples requested" },
  { value: "SAMPLES_SENT", label: "Samples sent" },
  { value: "WAITING_DECISION", label: "Waiting decision" },
  { value: "WON_FIRST_PO_PLACED", label: "Won (first PO placed)" },
  { value: "ONBOARDING_NEEDED", label: "Onboarding needed" },
  { value: "SLOW_SELL_THROUGH", label: "Slow sell-through" },
  { value: "IN_STORE_EVENT_PLANNED", label: "In-store event planned" },
  { value: "REORDER_LIKELY", label: "Reorder likely" },
  { value: "DORMANT", label: "Dormant" },
  { value: "LOST_NOT_A_FIT", label: "Lost / Not a fit" }
];

export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(
  STAGE_OPTIONS.map((option) => [option.value, option.label])
) as Record<Stage, string>;

export const BLOCKER_OPTIONS: Array<{ value: Blocker; label: string }> = [
  { value: "AWARENESS", label: "Awareness" },
  { value: "PRICE", label: "Price" },
  { value: "PLACEMENT", label: "Placement" },
  { value: "STAFF_KNOWLEDGE", label: "Staff knowledge" },
  { value: "WRONG_SKU_MIX", label: "Wrong SKU mix" },
  { value: "LOW_TRAFFIC", label: "Low traffic" },
  { value: "COMPETITOR_PRESSURE", label: "Competitor pressure" },
  { value: "OTHER", label: "Other" }
];

export const BLOCKER_LABEL: Record<Blocker, string> = Object.fromEntries(
  BLOCKER_OPTIONS.map((option) => [option.value, option.label])
) as Record<Blocker, string>;

export const SUPPORT_NEEDED_OPTIONS = [
  "Training",
  "Samples",
  "Signage",
  "Visit",
  "In-store sampling",
  "Digital assets",
  "Reorder check-in"
] as const;

export type SupportNeeded = (typeof SUPPORT_NEEDED_OPTIONS)[number];

export const TASK_ACTION_OPTIONS: Array<{ value: TaskActionType; label: string }> = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "VISIT", label: "Visit" },
  { value: "SEND_SAMPLES", label: "Send samples" },
  { value: "TRAINING", label: "Training" },
  { value: "IN_STORE_SAMPLING", label: "In-store sampling" },
  { value: "SEND_ASSETS", label: "Send assets" },
  { value: "REVIEW_SELL_THROUGH", label: "Review sell-through" },
  { value: "REORDER_ASK", label: "Reorder ask" }
];

export const TASK_ACTION_LABEL: Record<TaskActionType, string> = Object.fromEntries(
  TASK_ACTION_OPTIONS.map((option) => [option.value, option.label])
) as Record<TaskActionType, string>;

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "Open",
  DONE: "Done",
  SNOOZED: "Snoozed"
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  VISIT: "Visit",
  NOTE: "Note"
};

export const ACTIVITY_OPTIONS: ActivityType[] = ["CALL", "EMAIL", "VISIT", "NOTE"];

export const SAVED_VIEWS = [
  { key: "today", label: "Today's follow-ups" },
  { key: "overdue", label: "Overdue" },
  { key: "new-leads", label: "New leads to call" },
  { key: "know-us-not-bought", label: "Know us, not bought" },
  { key: "bought-needs-help", label: "Bought but needs help" },
  { key: "dormant", label: "Dormant accounts" },
  { key: "all", label: "All retailers" }
] as const;

export type SavedViewKey = (typeof SAVED_VIEWS)[number]["key"];

export const SLOW_SELL_PLAYBOOK: Array<{
  key: string;
  title: string;
  description: string;
  actionType: TaskActionType;
  dueInDays: number;
}> = [
  {
    key: "training",
    title: "Run staff training",
    description: "Refresh talking points and feeding-transition objections.",
    actionType: "TRAINING",
    dueInDays: 3
  },
  {
    key: "signage",
    title: "Install new signage",
    description: "Improve visibility with shelf-talkers and end-cap assets.",
    actionType: "SEND_ASSETS",
    dueInDays: 2
  },
  {
    key: "sampling",
    title: "Schedule in-store sampling",
    description: "Book sampling event to drive trial and basket conversion.",
    actionType: "IN_STORE_SAMPLING",
    dueInDays: 7
  },
  {
    key: "follow-up",
    title: "Follow-up on sell-through",
    description: "Review unit velocity, SKU mix, and reorder timing.",
    actionType: "REVIEW_SELL_THROUGH",
    dueInDays: 10
  }
];
