import Link from "next/link";


import { SAVED_VIEWS, STAGE_OPTIONS, type Stage } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addDays, formatDate } from "@/lib/utils";
import { StagePill } from "@/components/stage-pill";

export default async function DashboardPage() {
  const riskThreshold = addDays(new Date(), -60);

  const [stageCounts, overdueTasks, atRiskRetailers, atRiskCount, openTasks] = await Promise.all([
    prisma.retailer.groupBy({ by: ["stage"], _count: { _all: true } }),
    prisma.task.count({
      where: {
        status: "OPEN",
        due_date: { lt: new Date() }
      }
    }),
    prisma.retailer.findMany({
      where: {
        stage: { not: "LOST_NOT_A_FIT" },
        last_order_date: { lt: riskThreshold }
      },
      orderBy: [{ last_order_date: "asc" }, { updated_at: "desc" }],
      take: 8
    }),
    prisma.retailer.count({
      where: {
        stage: { not: "LOST_NOT_A_FIT" },
        last_order_date: { lt: riskThreshold }
      }
    }),
    prisma.task.count({ where: { status: "OPEN" } })
  ]);

  const countByStage = new Map(stageCounts.map((item) => [item.stage, item._count._all]));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-600">Open tasks</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{openTasks}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">Overdue tasks</p>
          <p className="mt-2 text-3xl font-semibold text-rose-700">{overdueTasks}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">At-risk accounts</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">{atRiskCount}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Counts by stage</h2>
            <Link href="/retailers" className="text-sm text-brand-700 hover:text-brand-600">
              View retailers
            </Link>
          </div>

          <div className="space-y-2">
            {STAGE_OPTIONS.map((stage) => (
              <div key={stage.value} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <StagePill stage={stage.value} />
                <span className="text-sm font-medium text-slate-700">{countByStage.get(stage.value) ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900">Saved views</h2>
          <div className="mt-4 space-y-2">
            {SAVED_VIEWS.filter((view) => view.key !== "all").map((view) => (
              <Link
                key={view.key}
                href={`/retailers?view=${view.key}`}
                className="block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50"
              >
                {view.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">At-risk accounts</h2>
          <Link href="/retailers?view=dormant" className="text-sm text-brand-700 hover:text-brand-600">
            Open dormant view
          </Link>
        </div>

        {atRiskRetailers.length === 0 ? (
          <p className="text-sm text-slate-600">No at-risk accounts right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">Retailer</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
                  <th className="py-2 pr-4 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {atRiskRetailers.map((retailer) => (
                  <tr key={retailer.id}>
                    <td className="py-2 pr-4">
                      <Link href={`/retailers/${retailer.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {retailer.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <StagePill stage={retailer.stage as Stage} />
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{formatDate(retailer.last_order_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
