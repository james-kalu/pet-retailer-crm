"use client";

import { useMemo, useState, useTransition } from "react";

import {
  applyGlobalInboxPlan,
  generateGlobalInboxPlan
} from "@/app/(app)/ai/actions";
import {
  STAGE_LABEL,
  BLOCKER_LABEL,
  TASK_ACTION_LABEL,
  type Blocker,
  type TaskActionType
} from "@/lib/constants";
import {
  UPDATE_SELECTION_KEYS,
  type AIPlan,
  type UpdateSelectionKey
} from "@/lib/ai/planSchema";

type RetailerContextItem = {
  id: number;
  name: string;
  city: string | null;
  region: string | null;
  stage: string;
  primary_contact_name: string | null;
  updated_at: string;
};

type MatchOption = { id: number; confidence: number; reasoning: string };
type MatchSelection = number | "NEW" | null;

function defaultUpdateSelections(plan: AIPlan): UpdateSelectionKey[] {
  const selections: UpdateSelectionKey[] = [];

  if (plan.updates.retailer_name?.trim()) selections.push("retailer_name");
  if (plan.updates.address?.trim()) selections.push("address");
  if (plan.updates.city?.trim()) selections.push("city");
  if (plan.updates.region?.trim()) selections.push("region");
  if (plan.updates.postal_code?.trim()) selections.push("postal_code");
  if (plan.updates.phone?.trim()) selections.push("phone");
  if (plan.updates.stage) selections.push("stage");
  if (plan.updates.blocker) selections.push("blocker");
  if (plan.updates.support_needed.length > 0) selections.push("support_needed");
  if (plan.updates.primary_contact_name?.trim()) selections.push("primary_contact_name");
  if (plan.updates.primary_contact_email?.trim()) selections.push("primary_contact_email");
  if (plan.updates.primary_contact_phone?.trim()) selections.push("primary_contact_phone");
  if (plan.updates.last_order_date) selections.push("last_order_date");
  if (plan.updates.first_order_date) selections.push("first_order_date");
  if (plan.updates.notes_append?.trim()) selections.push("notes_append");
  if (plan.updates.tags_add.length > 0) selections.push("tags_add");

  return selections;
}

function updatePreview(plan: AIPlan, key: UpdateSelectionKey): string {
  if (key === "retailer_name") {
    return plan.updates.retailer_name ?? "-";
  }

  if (key === "address") {
    return plan.updates.address ?? "-";
  }

  if (key === "city") {
    return plan.updates.city ?? "-";
  }

  if (key === "region") {
    return plan.updates.region ?? "-";
  }

  if (key === "postal_code") {
    return plan.updates.postal_code ?? "-";
  }

  if (key === "phone") {
    return plan.updates.phone ?? "-";
  }

  if (key === "stage") {
    return plan.updates.stage ? STAGE_LABEL[plan.updates.stage] : "-";
  }

  if (key === "blocker") {
    return plan.updates.blocker ? BLOCKER_LABEL[plan.updates.blocker as Blocker] : "-";
  }

  if (key === "support_needed") {
    return plan.updates.support_needed.join(", ") || "-";
  }

  if (key === "primary_contact_name") {
    return plan.updates.primary_contact_name ?? "-";
  }

  if (key === "primary_contact_email") {
    return plan.updates.primary_contact_email ?? "-";
  }

  if (key === "primary_contact_phone") {
    return plan.updates.primary_contact_phone ?? "-";
  }

  if (key === "last_order_date") {
    return plan.updates.last_order_date ?? "-";
  }

  if (key === "first_order_date") {
    return plan.updates.first_order_date ?? "-";
  }

  if (key === "notes_append") {
    return plan.updates.notes_append ?? "-";
  }

  if (key === "tags_add") {
    return plan.updates.tags_add.join(", ") || "-";
  }

  return "-";
}

export function InboxAssistant() {
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [retailerContext, setRetailerContext] = useState<RetailerContextItem[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchSelection>(null);
  const [recommendCreateNew, setRecommendCreateNew] = useState(false);
  const [selectedUpdates, setSelectedUpdates] = useState<UpdateSelectionKey[]>([]);
  const [selectedTaskIndexes, setSelectedTaskIndexes] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isApplying, startApplying] = useTransition();

  const retailerLookup = useMemo(() => {
    return new Map(retailerContext.map((item) => [item.id, item]));
  }, [retailerContext]);

  const matchOptions = useMemo(() => {
    if (!plan) {
      return [] as MatchOption[];
    }

    const options: MatchOption[] = [];

    if (plan.retailer_match.retailer_id) {
      options.push({
        id: plan.retailer_match.retailer_id,
        confidence: plan.retailer_match.confidence,
        reasoning: plan.retailer_match.reasoning
      });
    }

    for (const alt of plan.retailer_match.alternatives) {
      if (options.some((option) => option.id === alt.retailer_id)) {
        continue;
      }
      options.push({
        id: alt.retailer_id,
        confidence: alt.confidence,
        reasoning: alt.reasoning
      });
    }

    return options;
  }, [plan]);

  const toggleUpdate = (key: UpdateSelectionKey) => {
    setSelectedUpdates((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const toggleTask = (taskIndex: number) => {
    setSelectedTaskIndexes((prev) =>
      prev.includes(taskIndex) ? prev.filter((item) => item !== taskIndex) : [...prev, taskIndex]
    );
  };

  const onGenerate = () => {
    startGenerating(async () => {
      setError(null);
      setValidationErrors([]);
      setResultMessage(null);

      const response = await generateGlobalInboxPlan(note, sourceUrl || undefined);
      if (!response.ok) {
        setPlan(null);
        setRetailerContext([]);
        setSelectedMatch(null);
        setRecommendCreateNew(false);
        setSelectedUpdates([]);
        setSelectedTaskIndexes([]);
        setError(response.error);
        setValidationErrors("validationIssues" in response ? (response.validationIssues ?? []) : []);
        return;
      }

      setPlan(response.plan);
      setRetailerContext(response.retailerContext ?? []);
      const shouldCreateNew = response.recommendCreateNew ?? false;
      setRecommendCreateNew(shouldCreateNew);
      setSelectedMatch(
        shouldCreateNew
          ? "NEW"
          : response.plan.retailer_match.retailer_id ??
              response.plan.retailer_match.alternatives[0]?.retailer_id ??
              null
      );
      setSelectedUpdates(defaultUpdateSelections(response.plan));
      setSelectedTaskIndexes(response.plan.tasks.map((_, index) => index));
    });
  };

  const onApply = () => {
    if (!plan) {
      return;
    }

    startApplying(async () => {
      setError(null);
      setValidationErrors([]);
      setResultMessage(null);

      if (!selectedMatch) {
        setError("Choose a retailer match or Create New before applying.");
        return;
      }

      const selectedRetailerId = selectedMatch === "NEW" ? null : selectedMatch;

      const response = await applyGlobalInboxPlan(selectedRetailerId, plan, {
        raw_note: note,
        selected_update_keys: selectedUpdates,
        selected_task_indexes: selectedTaskIndexes
      });

      if (!response.ok) {
        setError(response.error);
        setValidationErrors("validationIssues" in response ? (response.validationIssues ?? []) : []);
        return;
      }

      setResultMessage(response.message);
    });
  };

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Global Inbox Notes</h2>
        <p className="text-sm text-slate-600">
          Drop rough notes here. AI suggests retailer match, structured updates, and next-step tasks.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Note</span>
          <textarea
            rows={8}
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Paste call notes, screenshot text, email summary, event recap..."
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Source URL (optional)</span>
          <input
            className="input"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>

        <button
          type="button"
          className="btn-primary"
          disabled={isGenerating || !note.trim()}
          onClick={onGenerate}
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>

        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {validationErrors.length > 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-medium">Validation details</p>
            <ul className="mt-1 list-disc pl-4">
              {validationErrors.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {resultMessage ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resultMessage}</p>
        ) : null}
      </section>

      {plan ? (
        <section className="grid gap-5 lg:grid-cols-3">
          <div className="card lg:col-span-2 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Suggested retailer match</h3>
            <div className="space-y-2">
              <label className="block rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="retailer_match"
                    value="NEW"
                    checked={selectedMatch === "NEW"}
                    onChange={() => setSelectedMatch("NEW")}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-emerald-900">Create new retailer</p>
                    <p className="text-emerald-800">
                      {plan.updates.retailer_name
                        ? `Name: ${plan.updates.retailer_name}`
                        : "AI did not extract a name yet. Include retailer name in the note and regenerate."}
                    </p>
                    <p className="text-xs text-emerald-700">
                      {recommendCreateNew
                        ? "Recommended for this note."
                        : "Use this when your note is for a brand-new store not already in CRM."}
                    </p>
                  </div>
                </div>
              </label>

              {matchOptions.length === 0 ? (
                <p className="text-sm text-slate-600">No confident match found. Select Create new retailer above.</p>
              ) : (
              <div className="space-y-2">
                {matchOptions.map((option) => {
                  const retailer = retailerLookup.get(option.id);
                  return (
                    <label key={option.id} className="block rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="retailer_match"
                          value={option.id}
                          checked={selectedMatch === option.id}
                          onChange={() => setSelectedMatch(option.id)}
                          className="mt-1"
                        />
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">
                            {retailer ? retailer.name : `Retailer #${option.id}`}
                          </p>
                          <p className="text-slate-600">
                            {retailer ? [retailer.city, retailer.region].filter(Boolean).join(", ") : "Unknown location"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Confidence: {option.confidence.toFixed(2)} | {option.reasoning}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-800">AI summary</p>
              <p className="mt-1 text-sm text-slate-700">{plan.summary}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">Proposed updates</p>
              {UPDATE_SELECTION_KEYS.map((key) => (
                <label key={key} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedUpdates.includes(key)}
                    onChange={() => toggleUpdate(key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-slate-900">{key}</span>: {updatePreview(plan, key)}
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">Proposed tasks</p>
              {plan.tasks.length === 0 ? (
                <p className="text-sm text-slate-600">No tasks suggested.</p>
              ) : (
                plan.tasks.map((task, index) => (
                  <label key={`${task.title}-${index}`} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTaskIndexes.includes(index)}
                      onChange={() => toggleTask(index)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-slate-900">{task.title}</span>
                      <span className="text-slate-600">
                        {` | ${TASK_ACTION_LABEL[task.action_type as TaskActionType]} | due in ${task.due_in_days} day(s)`}
                      </span>
                      <span className="block text-xs text-slate-500">Why: {task.why}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="card space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Questions</h3>
            {plan.questions.length === 0 ? (
              <p className="text-sm text-slate-600">No clarifying questions.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                {plan.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className="btn-primary w-full"
              disabled={isApplying || !selectedMatch}
              onClick={onApply}
            >
              {isApplying ? "Applying..." : "Apply Selected"}
            </button>

            <p className="text-xs text-slate-500">
              AI proposes only. Nothing is saved until you click Apply Selected.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
