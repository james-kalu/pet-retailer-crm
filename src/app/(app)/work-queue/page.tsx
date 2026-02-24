import { createTaskAction, markDoneAndCreateNextTaskAction } from "@/app/(app)/actions";
import { StagePill } from "@/components/stage-pill";
import { TASK_ACTION_LABEL, TASK_ACTION_OPTIONS, type Stage, type TaskActionType } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addDays, formatDate, toDateInputValue } from "@/lib/utils";

type QueueSort = "priority" | "due_soon" | "retailer";

type ActionFilter = TaskActionType | "ALL";

// Treat stage as plain string values (no Prisma runtime enums)
type StageValue =
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

const ACTION_TYPE_ALLOWLIST: readonly TaskActionType[] = [
  "CALL",
  "EMAIL",
  "VISIT",
  "SEND_SAMPLES",
  "TRAINING",
  "IN_STORE_SAMPLING",
  "SEND_ASSETS",
  "REVIEW_SELL_THROUGH",
  "REORDER_ASK"
] as const;

function parseFilter(value?: string): ActionFilter {
  if (!value || value === "ALL") return "ALL";
  return (ACTION_TYPE_ALLOWLIST as readonly string[]).includes(value) ? (value as TaskActionType) : "ALL";
}

function parseSort(value?: string): QueueSort {
  if (value === "due_soon" || value === "retailer") return value;
  return "priority";
}

function stageWeight(stage: string): number {
  const map: Record<StageValue, number> = {
    LEAD_IDENTIFIED: 30,
    CONTACTED: 25,
    INTERESTED_NEEDS_INFO: 35,
    MEETING_BOOKED: 40,
    PRICE_LIST_SENT: 45,
    SAMPLES_REQUESTED: 50,
    SAMPLES_SENT: 60,
    WAITING_DECISION: 55,
    WON_FIRST_PO_PLACED: 42,
    ONBOARDING_NEEDED: 65,
    SLOW_SELL_THROUGH: 75,
    IN_STORE_EVENT_PLANNED: 62,
    REORDER_LIKELY: 50,
    DORMANT: 72,
    LOST_NOT_A_FIT: 0
  };

  return (map as Record<string, number>)[stage] ?? 0;
}

export default async function WorkQueuePage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const selectedAction = parseFilter(typeof searchParams.action_type === "string" ? searchParams.action_type : undefined);
  const rawQuery = (typeof searchParams.q === "string" ? searchParams.q : "").trim();
  const query = rawQuery.toLowerCase();
  const sort = parseSort(typeof searchParams.sort === "string" ? searchParams.sort : undefined);

  const tasks = await prisma.task.findMany({
    where: {
      status: "OPEN",
      ...(selectedAction === "ALL" ? {} : { action_type: selectedAction })
    },
    include: {
      retailer: true
    }
  });

  const queue = tasks
    .map((task) => {
      const now = Date.now();
      const dueTs = task.due_date.getTime();
      const daysLate = Math.max(0, Math.floor((now - dueTs) / (24 * 60 * 60 * 1000)));
      const dueSoonBonus = dueTs <= now + 2 * 24 * 60 * 60 * 1000 ? 10 : 0;

      const priority = daysLate * 100 + dueSoonBonus + stageWeight(task.retailer.stage as unknown as string);

      return { task, priority, daysLate };
    })
    .filter(({ task }) => {
      if (!query) return true;

      return (
        task.title.toLowerCase().includes(query) ||
        task.retailer.name.toLowerCase().includes(query) ||
        (task.retailer.city ?? "").toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sort === "due_soon") return a.task.due_date.getTime() - b.task.due_date.getTime();
      if (sort === "retailer") return a.task.retailer.name.localeCompare(b.task.retailer.name);
      return b.priority - a.priority;
    });

  const callWithoutTask =
    selectedAction === "ALL" || selectedAction === "CALL"
      ? await prisma.retailer.findMany({
          where: {
            stage: { in: ["LEAD_IDENTIFIED", "CONTACTED"] },
            ...(query
              ? {
                  OR: [{ name: { contains: rawQuery } }, { city: { contains: rawQuery } }]
                }
              : {}),
            tasks: {
              none: {
                status: "OPEN",
                action_type: "CALL"
              }
            }
          },
          orderBy: { updated_at: "asc" },
          take: 10
        })
      : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Work Queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            Process prioritized tasks in order. Complete one item and roll into the next follow-up instantly.
          </p>
        </div>
      </header>

      <section className="card">
        <form action="/work-queue" className="grid gap-3 md:grid-cols-4">
          <label className="block md:col-span-1">
            <span className="mb-1 block text-sm font-medium">Action type</span>
            <select name="action_type" defaultValue={selectedAction} className="select">
              <option value="ALL">All actions</option>
              {TASK_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block md:col-span-1">
            <span className="mb-1 block text-sm font-medium">Sort by</span>
            <select name="sort" defaultValue={sort} className="select">
              <option value="priority">Priority</option>
              <option value="due_soon">Due soon</option>
              <option value="retailer">Retailer name</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Search</span>
            <input name="q" defaultValue={rawQuery} className="input" placeholder="Task title, retailer, city..." />
          </label>

          <div className="md:col-span-4">
            <button type="submit" className="btn-secondary">
              Apply
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        {queue.map(({ task, priority, daysLate }, index) => (
          <article key={task.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Queue #{index + 1}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{task.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {TASK_ACTION_LABEL[task.action_type as TaskActionType]} | Due {formatDate(task.due_date)}
                  {daysLate > 0 ? ` | ${daysLate} day(s) overdue` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{task.retailer.name}</span>
                  <StagePill stage={task.retailer.stage as Stage} />
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">Score {priority}</span>
                </div>
              </div>

              <form action={markDoneAndCreateNextTaskAction} className="sm:min-w-64">
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="retailer_id" value={task.retailer_id} />
                <input type="hidden" name="next_action_type" value={task.action_type} />
                <input
                  type="hidden"
                  name="next_title"
                  value={`Follow-up: ${TASK_ACTION_LABEL[task.action_type as TaskActionType]}`}
                />
                <input type="hidden" name="due_in_days" value="7" />
                <button type="submit" className="btn-primary w-full">
                  Mark done + create next task
                </button>
              </form>
            </div>
          </article>
        ))}

        {queue.length === 0 ? <p className="card text-sm text-slate-600">No open tasks for this filter.</p> : null}
      </section>

      {callWithoutTask.length > 0 ? (
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900">Suggested outreach (no call task yet)</h2>
          <div className="mt-3 space-y-2">
            {callWithoutTask.map((retailer) => (
              <div key={retailer.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{retailer.name}</p>
                    <div className="mt-1">
                      <StagePill stage={retailer.stage as Stage} />
                    </div>
                  </div>

                  <form action={createTaskAction}>
                    <input type="hidden" name="retailer_id" value={retailer.id} />
                    <input type="hidden" name="title" value="Intro call" />
                    <input type="hidden" name="action_type" value="CALL" />
                    <input type="hidden" name="due_date" value={toDateInputValue(addDays(new Date(), 0))} />
                    <button type="submit" className="btn-secondary text-xs">
                      Create intro call task
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
