import Link from "next/link";

import { logoutAction } from "@/app/auth-actions";
import { requireAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  requireAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf7]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-brand-700">
              <span className="h-2.5 w-2.5 rounded-full bg-clay-500" />
              Pet Retail CRM
            </Link>
            <nav className="flex items-center gap-2 text-sm text-slate-700">
              <Link href="/" className="rounded-full px-3 py-1.5 transition hover:bg-brand-50 hover:text-brand-700">
                Dashboard
              </Link>
              <Link href="/retailers" className="rounded-full px-3 py-1.5 transition hover:bg-brand-50 hover:text-brand-700">
                Retailers
              </Link>
              <Link href="/retailers/new" className="rounded-full px-3 py-1.5 transition hover:bg-brand-50 hover:text-brand-700">
                Quick Add
              </Link>
              <Link href="/work-queue" className="rounded-full px-3 py-1.5 transition hover:bg-brand-50 hover:text-brand-700">
                Work Queue
              </Link>
              <Link href="/inbox" className="rounded-full px-3 py-1.5 transition hover:bg-brand-50 hover:text-brand-700">
                Inbox
              </Link>
            </nav>
          </div>

          <form action={logoutAction}>
            <button type="submit" className="btn-secondary">
              Logout
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
