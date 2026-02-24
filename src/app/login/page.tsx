import { redirectIfAuthenticated } from "@/lib/auth";
import { loginAction } from "@/app/auth-actions";

export default function LoginPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  redirectIfAuthenticated();
  const hasError = typeof searchParams?.error === "string";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-[#f7f3e7] to-[#f3efe3] px-4">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-[#fffdf7] p-8 shadow-lg shadow-stone-300/20">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
          <span className="h-2 w-2 rounded-full bg-clay-500" />
          Retail Partner Hub
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Pet Retail CRM</h1>
        <p className="mt-1 text-sm text-slate-600">Enter your password to continue.</p>

        {hasError ? (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Invalid password.</p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <input type="password" name="password" required className="input" />
          </label>
          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
