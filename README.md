# Pet Retail CRM (Next.js + Prisma + SQLite)

Custom CRM web app for managing independent pet food retailers across prospecting, onboarding, and sell-through support.

## Tech Stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS
- Backend: Next.js Server Actions
- Database: SQLite with Prisma ORM
- Auth: Single-password login (v1)

## Features Implemented
- Retailer list with saved views:
  - Today's follow-ups
  - Overdue
  - New leads to call
  - Know us, not bought
  - Bought but needs help
  - Dormant accounts
- Retailer detail page:
  - Timeline of activities
  - Tasks list (create / complete / snooze)
  - Quick edit: stage, blocker, support needed, notes, last order date
  - "Next action" quick task widget
- Quick-add retailer page
- Dashboard:
  - Counts by stage
  - Overdue tasks
  - At-risk accounts (older than 60 days and not lost)
- Automations:
  - Stage -> `SAMPLES_SENT` => auto follow-up call task due in 7 days
  - Stage -> `WON_FIRST_PO_PLACED` => auto onboarding task due in 3 days
  - Last order > 60 days => at-risk flag sync for dashboard
- Work Queue page:
  - Filter by action type
  - Search + sort
  - Prioritized queue
  - "Mark done + create next task" action
- Slow sell-through Playbook:
  - Suggested one-click tasks (training, signage/assets, sampling, follow-up)
- Assistant CRM:
  - Inbox Assist page (`/inbox`) for global unstructured notes
  - Retailer AI Assist panel on retailer detail pages
  - AI proposes retailer match, structured updates, tasks, and clarifying questions
  - User review + approve before applying any change
  - Full audit trail via `Activity` logs for generation and apply

## Data Model
Defined in `/Users/jameslynn/Documents/New project 2/prisma/schema.prisma`:
- `Retailer`
- `Task`
- `Activity`
- Stage/blocker/action/status/type are stored as string values

Multi-select/string-list fields (`tags`, `products_carried`, `support_needed`) are stored as JSON-serialized strings in SQLite.

## Project Structure
- `/Users/jameslynn/Documents/New project 2/src/app/(app)/page.tsx` - Dashboard
- `/Users/jameslynn/Documents/New project 2/src/app/(app)/retailers/page.tsx` - Retailer list + views + search + sort
- `/Users/jameslynn/Documents/New project 2/src/app/(app)/retailers/new/page.tsx` - Quick-add form
- `/Users/jameslynn/Documents/New project 2/src/app/(app)/retailers/[id]/page.tsx` - Retailer detail, tasks, timeline, playbook
- `/Users/jameslynn/Documents/New project 2/src/app/(app)/work-queue/page.tsx` - Prioritized work queue
- `/Users/jameslynn/Documents/New project 2/src/app/(app)/actions.ts` - Server actions (retailers, tasks, queue, playbook)
- `/Users/jameslynn/Documents/New project 2/src/lib/automations.ts` - Automation logic
- `/Users/jameslynn/Documents/New project 2/src/lib/auth.ts` - Password auth/session cookie
- `/Users/jameslynn/Documents/New project 2/prisma/seed.ts` - Seed script with realistic sample data

## Local Setup
1. Install Node.js 20+.
2. From project root:
   ```bash
   npm install
   cp .env.example .env
   ```
3. Generate Prisma client:
   ```bash
   npm run db:generate
   ```
4. Run migration (creates SQLite DB + schema):
   ```bash
   npm run db:migrate -- --name init
   ```
5. Seed sample data:
   ```bash
   npm run db:seed
   ```
6. Start dev server:
   ```bash
   npm run dev
   ```
7. Open [http://localhost:3000](http://localhost:3000)

Default password is read from `.env` as `APP_PASSWORD`.
Set `OPENAI_API_KEY` and optional `OPENAI_MODEL` in `.env` to enable AI Assist.

## AI Assist Usage
- Inbox Assist:
  - Go to `/inbox`
  - Paste a messy note (optional source URL)
  - Click `Generate`
  - Review suggested retailer match, updates, tasks, and questions
  - Select what you want and click `Apply Selected`
- Retailer AI Assist:
  - Open `/retailers/[id]`
  - Use the `AI Assist` panel
  - Paste update note, generate proposal, review selections, then apply
- Safety model:
  - AI never writes directly on generation
  - AI outputs are validated with Zod
  - Invalid outputs are surfaced in UI and logged to Activity
  - Apply always logs what was selected and applied

## Runtime Convention
- Stage/blocker/action/status are handled as plain strings in runtime code.
- Do not use Prisma runtime enums in Next.js code.

## Desktop App (Mac / Electron)
This project now supports a standalone desktop build using Electron.

- Dev desktop mode (runs Next dev server + Electron shell):
  ```bash
  npm run desktop:dev
  ```
- Build Mac `.dmg`:
  ```bash
  npm run desktop:build:mac
  ```
- Run built desktop app locally (without Next dev server):
  ```bash
  npm run desktop:start
  ```
- Build Windows `.exe` (NSIS target config included):
  ```bash
  npm run desktop:build:win
  ```

Build outputs go to `/Users/jameslynn/Documents/New project 2/dist-desktop`.
The build now runs an `afterPack` hook that ensures Prisma runtime files are copied into the packaged app.

### How standalone DB works
- During desktop build, `prisma/dev.db` is bundled with the app.
- On first launch, Electron copies it to the user data directory and sets `DATABASE_URL` to that runtime copy.
- Your desktop app then reads/writes the local DB without running `npm run dev` or `next start` manually.

### Desktop Packaging Notes
- If you change schema/data before packaging, run:
  ```bash
  npx prisma generate
  npx prisma db push --force-reset
  npm run db:seed
  ```
- If desktop UI shows stale cache/build behavior:
  ```bash
  rm -rf .next
  npm run desktop:build:mac
  ```
- Optional app icon:
  - Add `build/icon.icns` for macOS and `build/icon.ico` for Windows.
- Windows builds are most reliable from a Windows machine or CI runner.
- Verify Prisma runtime was bundled:
  ```bash
  npm run desktop:verify:prisma
  ```
- Desktop runtime logs (for startup/500 debugging):
  - `~/Library/Application Support/pet-retailer-crm/logs/desktop.log`

## Migration Commands (Reference)
- Create/apply a new migration:
  ```bash
  npm run db:migrate -- --name <migration_name>
  ```
- Push schema without migration files (dev-only alternative):
  ```bash
  npm run db:push
  ```
- Prisma Studio:
  ```bash
  npm run db:studio
  ```

## Deployment Later
- Recommended: Vercel for Next.js hosting.
- For persistent production data, move from SQLite to Postgres and update `DATABASE_URL` + Prisma datasource provider.
- Keep `APP_PASSWORD` in deployment secrets.
