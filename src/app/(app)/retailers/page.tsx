import Link from "next/link";

import { SAVED_VIEWS, SavedViewKey, SUPPORT_NEEDED_OPTIONS, type Stage } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { asStringArray, formatDate, startOfDay, endOfDay, isOlderThanDays } from "@/lib/utils";
import { StagePill } from "@/components/stage-pill";

type SortField = "name" | "stage" | "city" | "next_due" | "last_order_date" | "updated_at";
type SortDir = "asc" | "desc";

function parseSavedView(value?: string): SavedViewKey {
  if (!value) return "today";
  const match = SAVED_VIEWS.find((view) => view.key === value);
  return match?.key ?? "today";
}

function parseSortField(value?: string): SortField {
  const allowed: SortField[] = ["name", "stage", "city", "next_due", "last_order_date", "updated_at"];
  if (value && allowed.includes(value as SortField)) return value as SortField;
  return "next_due";
}

function parseSortDir(value?: string): SortDir {
  return value === "desc" ? "desc" : "asc";
}

export default async function RetailersPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const view = parseSavedView(typeof searchParams.view === "string" ? searchParams.view : undefined);
  const query = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const sort = parseSortField(typeof searchParams.sort === "string" ? searchParams.sort : undefined);
  const dir = parseSortDir(typeof searchParams.dir === "string" ? searchParams.dir : undefined);
  const deleted = typeof searchParams.deleted === "string" ? searchParams.deleted : "";

  const buildHref = (params: Record<string, string>) => {
    const search = new URLSearchParams();
    search.set("view", view);
    if (query) search.set("q", query);
    search.set("sort", sort);
    search.set("dir", dir);
    Object.entries(params).forEach(([key, value]) => search.set(key, value));
    return `/retailers?${search.toString()}`;
  };

  const sortLink = (field: SortField) => {
    const isCurrent = sort === field;
    const nextDir: SortDir = isCurrent && dir === "asc" ? "desc" : "asc";
    return buildHref({ sort: field, dir: nextDir });
  };

  const retailers = await prisma.retailer.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query } },
            { city: { contains: query } },
            { region: { contains: query } },
            { primary_contact_name: { contains: query } },
            { primary_contact_email: { contains: query } }
          ]
        }
      : undefined,
    include: {
      tasks: {
        where: { status: "OPEN" },
        orderBy: { due_date: "asc" }
      }
    },
    orderBy: { updated_at: "desc" }
  });

  const start = startOfDay();
  const end = endOfDay();

  const filtered = retailers.filter((retailer) => {
    const stage = retailer.stage as unknown as string; // <- treat as string
    const hasOpenTask = retailer.tasks.length > 0;
    const hasTaskToday = retailer.tasks.some((task) => task.due_date >= start && task.due_date <= end);
    const hasOverdueTask = retailer.tasks.some((task) => task.due_date < start);
    const supportNeeded = asStringArray(retailer.support_needed);

    if (view === "today") return hasTaskToday;
    if (view === "overdue") return hasOverdueTask;

    if (view === "new-leads") {
      return (stage === "LEAD_IDENTIFIED" || stage === "CONTACTED") && !hasOpenTask;
    }

    if (view === "know-us-not-bought") {
      return [
        "CONTACTED",
        "INTERESTED_NEEDS_INFO",
        "MEETING_BOOKED",
        "PRICE_LIST_SENT",
        "SAMPLES_REQUESTED",
        "SAMPLES_SENT",
        "WAITING_DECISION"
      ].includes(stage);
    }

    if (view === "bought-needs-help") {
      return (
        ["ONBOARDING_NEEDED", "SLOW_SELL_THROUGH", "IN_STORE_EVENT_PLANNED"].includes(stage) || supportNeeded.length > 0
      );
    }

    if (view === "dormant") {
      return stage === "DORMANT" || isOlderThanDays(retailer.last_order_date, 60);
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const mult = dir === "asc" ? 1 : -1;
    const aNextDue = a.tasks[0]?.due_date?.getTime() ?? Number.POSITIVE_INFINITY;
    const bNextDue = b.tasks[0]?.due_date?.getTime() ?? Number.POSITIVE_INFINITY;

    if (sort === "name") return a.name.localeCompare(b.name) * mult;
    if (sort === "stage") return a.stage.localeCompare(b.stage) * mult;
    if (sort === "city") return (a.city ?? "").localeCompare(b.city ?? "") * mult;

    if (sort === "last_order_date") {
      return ((a.last_order_date?.getTime() ?? 0) - (b.last_order_date?.getTime() ?? 0)) * mult;
    }

    if (sort === "updated_at") {
      return (a.updated_at.getTime() - b.updated_at.getTime()) * mult;
    }

    return (aNextDue - bNextDue) * mult;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Retailers</h1>
        <Link href="/retailers/new" className="btn-primary">
          + Quick add retailer
        </Link>
      </div>

      <section className="card space-y-4">
        {deleted === "1" ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Retailer deleted.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {SAVED_VIEWS.map((option) => (
            <Link
              key={option.key}
              href={buildHref({ view: option.key })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                option.key === view
                  ? "bg-brand-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <form action="/retailers" className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name, city, contact..."
            className="input"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">
                <Link href={sortLink("name")} className="hover:text-brand-700">
                  Retailer
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Link href={sortLink("stage")} className="hover:text-brand-700">
                  Stage
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Link href={sortLink("city")} className="hover:text-brand-700">
                  City
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Link href={sortLink("next_due")} className="hover:text-brand-700">
                  Next task due
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Link href={sortLink("last_order_date")} className="hover:text-brand-700">
                  Last order
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">Support needed</th>
              <th className="py-2 pr-4 font-medium">
                <Link href={sortLink("updated_at")} className="hover:text-brand-700">
                  Updated
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((retailer) => {
              const support = asStringArray(retailer.support_needed)
                .filter((item) => SUPPORT_NEEDED_OPTIONS.includes(item as (typeof SUPPORT_NEEDED_OPTIONS)[number]))
                .join(", ");

              return (
                <tr key={retailer.id} className="align-top">
                  <td className="py-3 pr-4">
                    <Link href={`/retailers/${retailer.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {retailer.name}
                    </Link>
                    <div className="mt-1 text-xs text-slate-500">
                      {retailer.primary_contact_name ?? "No primary contact"}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <StagePill stage={retailer.stage as Stage} />
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {[retailer.city, retailer.region].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{formatDate(retailer.tasks[0]?.due_date)}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatDate(retailer.last_order_date)}</td>
                  <td className="py-3 pr-4 text-slate-700">{support || "-"}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatDate(retailer.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sorted.length === 0 ? <p className="py-6 text-sm text-slate-600">No retailers match this filter.</p> : null}
      </section>
    </div>
  );
}
