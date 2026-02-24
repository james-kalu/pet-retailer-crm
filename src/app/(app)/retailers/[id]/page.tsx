import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addActivityAction,
  completeTaskAction,
  createPlaybookTaskAction,
  createTaskAction,
  deleteActivityAction,
  deleteRetailerAction,
  snoozeTaskAction,
  updateRetailerQuickAction
} from "@/app/(app)/actions";
import { RetailerAssistant } from "@/components/ai/RetailerAssistant";
import { StagePill } from "@/components/stage-pill";
import { TaskStatusPill } from "@/components/task-pill";
import {
  ACTIVITY_LABEL,
  ACTIVITY_OPTIONS,
  type Blocker,
  BLOCKER_LABEL,
  BLOCKER_OPTIONS,
  SLOW_SELL_PLAYBOOK,
  STAGE_OPTIONS,
  SUPPORT_NEEDED_OPTIONS,
  TASK_ACTION_LABEL,
  TASK_ACTION_OPTIONS,
  type ActivityType,
  type Stage,
  type TaskActionType,
  type TaskStatus
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addDays, asStringArray, formatDate, toDateInputValue } from "@/lib/utils";

function collapsedPreview(summary: string, max = 140): string {
  const clean = summary.replace(/\s+/g, " ").trim();
  if (clean.length <= max) {
    return clean;
  }
  return `${clean.slice(0, max)}...`;
}

export default async function RetailerDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const id = Number(params.id);

  if (!id) {
    notFound();
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { due_date: "asc" }]
      },
      activities: {
        orderBy: { created_at: "desc" }
      }
    }
  });

  if (!retailer) {
    notFound();
  }

  const supportNeeded = asStringArray(retailer.support_needed);
  const tags = asStringArray(retailer.tags);
  const products = asStringArray(retailer.products_carried);
  const defaultDueDate = toDateInputValue(addDays(new Date(), 1));
  const openTasks = retailer.tasks.filter((task) => task.status !== "DONE");
  const doneTasks = retailer.tasks.filter((task) => task.status === "DONE");
  const deleteError = typeof searchParams?.error === "string" ? searchParams.error : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2">
            <Link href="/retailers" className="text-sm text-brand-700 hover:text-brand-600">
              Back to retailers
            </Link>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{retailer.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StagePill stage={retailer.stage as Stage} />
            <span>{[retailer.city, retailer.region].filter(Boolean).join(", ") || "No location set"}</span>
            <span>|</span>
            <span>{retailer.primary_contact_name ?? "No primary contact"}</span>
          </div>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-4 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Quick update</h2>
          <form action={updateRetailerQuickAction} className="space-y-4">
            <input type="hidden" name="retailer_id" value={retailer.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Stage</span>
                <select name="stage" className="select" defaultValue={retailer.stage}>
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Blocker</span>
                <select name="blocker" className="select" defaultValue={retailer.blocker ?? ""}>
                  <option value="">-</option>
                  {BLOCKER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Last order date</span>
                <input
                  type="date"
                  name="last_order_date"
                  className="input"
                  defaultValue={toDateInputValue(retailer.last_order_date)}
                />
              </label>

              <div className="text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">Current blocker:</span>{" "}
                  {retailer.blocker ? BLOCKER_LABEL[retailer.blocker as Blocker] : "None"}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-slate-800">Last order:</span> {formatDate(retailer.last_order_date)}
                </p>
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Support needed</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUPPORT_NEEDED_OPTIONS.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="support_needed"
                      value={option}
                      className="h-4 w-4"
                      defaultChecked={supportNeeded.includes(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Notes</span>
              <textarea name="notes" rows={4} className="input" defaultValue={retailer.notes} />
            </label>

            <button type="submit" className="btn-primary">
              Save updates
            </button>
          </form>
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Retailer snapshot</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="text-slate-800">{retailer.phone ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Primary email</dt>
              <dd className="text-slate-800">{retailer.primary_contact_email ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Address</dt>
              <dd className="text-slate-800">
                {[retailer.address, retailer.city, retailer.region, retailer.postal_code].filter(Boolean).join(", ") || "-"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Tags</dt>
              <dd className="text-slate-800">{tags.join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Products carried</dt>
              <dd className="text-slate-800">{products.join(", ") || "-"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <RetailerAssistant retailerId={retailer.id} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
            <span className="text-sm text-slate-500">{openTasks.length} open</span>
          </div>

          <div className="space-y-3">
            {openTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{task.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {TASK_ACTION_LABEL[task.action_type as TaskActionType]} | Due {formatDate(task.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TaskStatusPill status={task.status as TaskStatus} />
                    <form action={completeTaskAction}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input type="hidden" name="retailer_id" value={retailer.id} />
                      <button type="submit" className="btn-primary px-2.5 py-1.5 text-xs">
                        Mark done
                      </button>
                    </form>
                    <form action={snoozeTaskAction}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input type="hidden" name="retailer_id" value={retailer.id} />
                      <input type="hidden" name="days" value="2" />
                      <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">
                        Snooze +2d
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}

            {openTasks.length === 0 ? <p className="text-sm text-slate-600">No open tasks.</p> : null}
          </div>

          {doneTasks.length > 0 ? (
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                Completed tasks ({doneTasks.length})
              </summary>
              <div className="mt-3 space-y-2">
                {doneTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between text-sm text-slate-700">
                    <span>{task.title}</span>
                    <span>{formatDate(task.completed_at)}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900">Next action</h2>
          <p className="mt-1 text-sm text-slate-600">Create a follow-up task in under 10 seconds.</p>

          <form action={createTaskAction} className="mt-4 space-y-3">
            <input type="hidden" name="retailer_id" value={retailer.id} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Title</span>
              <input name="title" required className="input" placeholder="What is the next action?" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Action type</span>
              <select name="action_type" className="select" defaultValue="CALL">
                {TASK_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Due date</span>
              <input type="date" name="due_date" className="input" defaultValue={defaultDueDate} />
            </label>
            <button type="submit" className="btn-primary w-full">
              Add task
            </button>
          </form>
        </div>
      </section>

      {retailer.stage === "SLOW_SELL_THROUGH" ? (
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900">Slow sell-through playbook</h2>
          <p className="mt-1 text-sm text-slate-600">
            Suggested actions for this stage. Each button creates a ready-to-run task.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SLOW_SELL_PLAYBOOK.map((playbook) => (
              <div key={playbook.key} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-900">{playbook.title}</p>
                <p className="mt-1 text-sm text-slate-600">{playbook.description}</p>
                <form action={createPlaybookTaskAction} className="mt-3">
                  <input type="hidden" name="retailer_id" value={retailer.id} />
                  <input type="hidden" name="template_key" value={playbook.key} />
                  <button type="submit" className="btn-secondary w-full">
                    Create task
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Activity timeline</h2>
          <div className="mt-4 space-y-3">
            {retailer.activities.map((activity) => {
              const isNote = activity.type === "NOTE";

              if (!isNote) {
                return (
                  <div key={activity.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {ACTIVITY_LABEL[activity.type as ActivityType]}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(activity.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">{activity.summary}</p>
                  </div>
                );
              }

              return (
                <details key={activity.id} className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {ACTIVITY_LABEL[activity.type as ActivityType]}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{collapsedPreview(activity.summary)}</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(activity.created_at)}</span>
                    </div>
                  </summary>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="text-sm text-slate-800">{activity.summary}</p>
                    <form action={deleteActivityAction} className="mt-3">
                      <input type="hidden" name="activity_id" value={activity.id} />
                      <input type="hidden" name="retailer_id" value={retailer.id} />
                      <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">
                        Discard note
                      </button>
                    </form>
                  </div>
                </details>
              );
            })}
            {retailer.activities.length === 0 ? <p className="text-sm text-slate-600">No activity logged yet.</p> : null}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900">Add activity</h2>
          <form action={addActivityAction} className="mt-4 space-y-3">
            <input type="hidden" name="retailer_id" value={retailer.id} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Type</span>
              <select name="type" className="select" defaultValue="NOTE">
                {ACTIVITY_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_LABEL[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Summary</span>
              <textarea name="summary" rows={4} className="input" required />
            </label>
            <button type="submit" className="btn-primary w-full">
              Log activity
            </button>
          </form>
        </div>
      </section>

      <section className="card border-rose-200 bg-rose-50/30">
        <h2 className="text-lg font-semibold text-rose-800">Danger zone</h2>
        <p className="mt-1 text-sm text-rose-700">
          Delete this retailer and permanently remove related tasks and activity logs.
        </p>

        {deleteError === "delete_confirm" ? (
          <p className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-800">
            Confirmation failed. Type the retailer name exactly, then submit again.
          </p>
        ) : null}

        <form action={deleteRetailerAction} className="mt-4 max-w-md space-y-3">
          <input type="hidden" name="retailer_id" value={retailer.id} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-rose-800">
              Type <span className="font-semibold">{retailer.name}</span> to confirm
            </span>
            <input
              name="confirm_name"
              required
              className="input border-rose-300 bg-white"
              placeholder={retailer.name}
            />
          </label>
          <button type="submit" className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600">
            Delete retailer
          </button>
        </form>
      </section>
    </div>
  );
}
