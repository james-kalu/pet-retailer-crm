import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/constants";

const COLOR_BY_STATUS: Record<TaskStatus, string> = {
  OPEN: "bg-brand-50 text-brand-700",
  DONE: "bg-emerald-100 text-emerald-700",
  SNOOZED: "bg-clay-50 text-clay-600"
};

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${COLOR_BY_STATUS[status]}`}>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}
