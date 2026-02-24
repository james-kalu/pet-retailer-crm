import { BLOCKER_OPTIONS, STAGE_OPTIONS, SUPPORT_NEEDED_OPTIONS } from "@/lib/constants";
import { createRetailerAction } from "@/app/(app)/actions";

export default function NewRetailerPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const hasNameError = searchParams?.error === "name";
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Quick-add retailer</h1>
        <p className="mt-1 text-sm text-slate-600">Fast entry form for new independent accounts.</p>
      </header>

      {hasNameError ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Retailer name is required.</p>
      ) : null}

      <form action={createRetailerAction} className="card space-y-5">
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Retailer name *</span>
            <input name="name" required className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Phone</span>
            <input name="phone" className="input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Address</span>
            <input name="address" className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">City</span>
            <input name="city" className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Region / State</span>
            <input name="region" className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Postal code</span>
            <input name="postal_code" className="input" />
          </label>
        </section>

        <section className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Primary contact name</span>
            <input name="primary_contact_name" className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Primary contact phone</span>
            <input name="primary_contact_phone" className="input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Primary contact email</span>
            <input name="primary_contact_email" type="email" className="input" />
          </label>
        </section>

        <section className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Stage</span>
            <select name="stage" className="select" defaultValue="LEAD_IDENTIFIED">
              {STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Blocker</span>
            <select name="blocker" className="select" defaultValue="">
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
            <input type="date" name="last_order_date" className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">First order date</span>
            <input type="date" name="first_order_date" className="input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Tags (comma-separated)</span>
            <input name="tags" className="input" placeholder="independent, premium, urban" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Products carried (comma-separated)</span>
            <input name="products_carried" className="input" placeholder="Chicken Formula, Salmon Formula" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Support needed</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUPPORT_NEEDED_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="support_needed" value={option} className="h-4 w-4" />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Notes</span>
            <textarea name="notes" rows={4} className="input" />
          </label>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">
            Save retailer
          </button>
        </div>
      </form>
    </div>
  );
}
