import { STAGE_LABEL, type Stage } from "@/lib/constants";

const COLOR_BY_STAGE: Partial<Record<Stage, string>> = {
  LEAD_IDENTIFIED: "bg-stone-100 text-stone-700",
  CONTACTED: "bg-brand-50 text-brand-700",
  INTERESTED_NEEDS_INFO: "bg-emerald-50 text-emerald-700",
  MEETING_BOOKED: "bg-teal-50 text-teal-700",
  PRICE_LIST_SENT: "bg-cyan-50 text-cyan-700",
  SAMPLES_REQUESTED: "bg-amber-50 text-amber-700",
  SAMPLES_SENT: "bg-orange-50 text-orange-700",
  WAITING_DECISION: "bg-yellow-50 text-yellow-700",
  WON_FIRST_PO_PLACED: "bg-green-100 text-green-800",
  ONBOARDING_NEEDED: "bg-lime-50 text-lime-800",
  SLOW_SELL_THROUGH: "bg-rose-50 text-rose-700",
  IN_STORE_EVENT_PLANNED: "bg-fuchsia-50 text-fuchsia-700",
  REORDER_LIKELY: "bg-moss-100 text-moss-700",
  DORMANT: "bg-clay-50 text-clay-600",
  LOST_NOT_A_FIT: "bg-zinc-200 text-zinc-700"
};

export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        COLOR_BY_STAGE[stage] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
