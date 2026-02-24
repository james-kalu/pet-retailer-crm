"use client";

import { useState, useTransition } from "react";

import {
  applyRetailerPlan,
  generateRetailerPlan
} from "@/app/(app)/ai/actions";
import {
  BLOCKER_LABEL,
  STAGE_LABEL,
  TASK_ACTION_LABEL,
  type Blocker,
  type TaskActionType
} from "@/lib/constants";
import {
  UPDATE_SELECTION_KEYS,
  type AIPlan,
  type UpdateSelectionKey
} from "@/lib/ai/planSchema";

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

export function RetailerAssistant({ retailerId }: { retailerId: number }) {
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [selectedUpdates, setSelectedUpdates] = useState<UpdateSelectionKey[]>([]);
  const [selectedTaskIndexes, setSelectedTaskIndexes] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isApplying, startApplying] = useTransition();

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

      const response = await generateRetailerPlan(retailerId, note);
      if (!response.ok) {
        setPlan(null);
        setSelectedUpdates([]);
        setSelectedTaskIndexes([]);
        setError(response.error);
        setValidationErrors("validationIssues" in response ? (response.validationIssues ?? []) : []);
        return;
      }

      setPlan(response.plan);
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

      const response = await applyRetailerPlan(retailerId, plan, {
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
    <section className="card space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">AI Assist</h2>
      <p className="text-sm text-slate-600">
        Paste new updates about this retailer. AI suggests structured updates and next actions for review.
      </p>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Retailer note</span>
        <textarea
          rows={5}
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Example: Staff cannot explain benefits, shelves are tucked away, buyer asked for sampling support..."
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={isGenerating || !note.trim()}
          onClick={onGenerate}
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>

        <button
          type="button"
          className="btn-secondary"
          disabled={isApplying || !plan}
          onClick={onApply}
        >
          {isApplying ? "Applying..." : "Apply Selected"}
        </button>
      </div>

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

      {plan ? (
        <div className="space-y-4">
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

          <div>
            <p className="text-sm font-medium text-slate-800">Questions</p>
            {plan.questions.length === 0 ? (
              <p className="text-sm text-slate-600">No clarifying questions.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                {plan.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-slate-500">
            AI proposes only. Changes are saved only when you click Apply Selected.
          </p>
        </div>
      ) : null}
    </section>
  );
}
