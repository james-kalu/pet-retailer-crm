import { InboxAssistant } from "@/components/ai/InboxAssistant";

export default function InboxPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inbox Assist</h1>
        <p className="mt-1 text-sm text-slate-600">
          Convert unstructured notes into reviewed CRM updates and actionable tasks.
        </p>
      </div>

      <InboxAssistant />
    </div>
  );
}
