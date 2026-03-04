# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

A local-only Next.js 16 application for tracking UK bank transactions via the GoCardless Bank Account Data API. No authentication. SQLite database. Client-rendered pages that call API routes.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build -- **use this to verify changes** |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm run db:push` | Push Drizzle schema changes to SQLite |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:seed` | Seed default categories and rules |
| `npm run db:studio` | Open Drizzle Studio GUI |

There is no test framework configured. **Always run `npm run build`** after making changes to verify the build passes.

## Project Structure

```
src/
  app/
    layout.tsx                  # Root layout (only server component)
    page.tsx                    # Dashboard
    accounts/page.tsx           # Bank connections, QR auth flow
    transactions/page.tsx       # Transaction list, filters, categorization
    spending/page.tsx           # Spending charts (daily/weekly/monthly)
    categories/page.tsx         # Category CRUD with auto-rules
    api/
      gocardless/               # GoCardless proxy routes (token, institutions, requisitions, callback)
      accounts/                 # Account listing, deletion, transaction sync
      transactions/             # List, update category, bulk-categorize
      categories/               # CRUD
      spending/                 # Summary and merchant aggregations
  components/
    layout/sidebar.tsx          # Navigation sidebar
    transactions/categorize-panel.tsx  # Categorization dropdown panel
  db/
    schema.ts                   # Drizzle table definitions
    index.ts                    # DB singleton
    seed.ts                     # Default categories seed script
  lib/
    gocardless.ts               # GoCardless API client with token management
    utils.ts                    # Shared utilities (formatCurrency, cn, derivePattern, etc.)
```

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **Tailwind CSS v4** with `@tailwindcss/postcss` and `@theme inline` in `globals.css`
- **Drizzle ORM** with SQLite via `@libsql/client`
- **Recharts** for charts
- **qrcode.react** for QR code bank auth
- **Base UI** (`@base-ui/react`) installed but not yet used
- **TypeScript** with `strict: true`

## Code Style

### Formatting
- 2-space indentation
- Double quotes for all strings
- Semicolons always
- Trailing commas in multi-line structures

### Imports
Order: framework imports, then `@/` project imports, then `drizzle-orm` operators. No blank lines between groups.

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
```

### Types
- Use `interface` for object shapes (`interface Transaction { ... }`)
- Use `type` only for unions and simple aliases (`type Mode = "choose" | "single" | "bulk"`)
- Define interfaces locally in the file that uses them (no shared types file)
- Props interfaces: `interface XxxProps { ... }` directly above the component

### Naming
- **Files**: kebab-case (`categorize-panel.tsx`, `bulk-categorize/`)
- **Components**: PascalCase, named exports for shared components, default exports for pages
- **Page components**: `export default function XxxPage()`
- **Functions/variables**: camelCase (`loadTransactions`, `syncResults`)
- **Constants**: UPPER_SNAKE_CASE for scalars (`BASE_URL`, `PAGE_SIZE`), camelCase for complex objects (`navItems`)
- **DB schema**: camelCase JS names mapping to snake_case SQL (`accessToken` -> `"access_token"`)

### Components
- All pages and interactive components use `"use client"` -- this is a client-rendered app
- The only server component is `layout.tsx`
- Data fetching pattern:
```typescript
const loadData = useCallback(async () => {
  const res = await fetch("/api/...");
  if (res.ok) setData(await res.json());
}, [deps]);

useEffect(() => { loadData(); }, [loadData]);
```
- No global state, no context, no Server Actions -- all data flows through API routes

### API Routes
- Export named functions matching HTTP methods: `GET`, `POST`, `PATCH`, `DELETE`
- Always wrap in try/catch:
```typescript
export async function GET(request: Request) {
  try {
    // ... logic
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to X:", error);
    return NextResponse.json({ error: "Failed to X" }, { status: 500 });
  }
}
```
- Validate required inputs early, return 400: `if (!field) return NextResponse.json({ error: "field is required" }, { status: 400 });`
- Dynamic route params use `{ params }: { params: Promise<{ id: string }> }` (Next.js 16 async params)
- Query params via `new URL(request.url).searchParams`
- Body via `await request.json()`

### Database (Drizzle)
- Schema in `src/db/schema.ts`, singleton in `src/db/index.ts`
- Tables use `sqliteTable()` with snake_case SQL column names
- Timestamps: `integer("col", { mode: "timestamp" }).$defaultFn(() => new Date())`
- Foreign keys: `.references(() => table.column, { onDelete: "cascade" | "set null" })`
- After schema changes, run `npm run db:push`

### Styling
- Tailwind v4 with semantic CSS custom properties: `--background`, `--card-bg`, `--border`, `--muted`, `--accent`, `--danger`, `--success`
- Card pattern: `bg-card border border-border rounded-xl p-6`
- Primary button: `bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover`
- Danger button: `border border-danger/30 text-danger rounded-lg hover:bg-danger/5`
- `cn()` utility for conditional classes (simple `filter(Boolean).join(" ")`, not clsx)
- Inline SVG icons (no icon library)

### Error Handling
- API routes: try/catch with `console.error()` and JSON error response
- Client: try/catch with `console.error()` (no toast notifications)
- No custom error classes or error boundaries

## Key Architecture Patterns

### GoCardless Integration (`src/lib/gocardless.ts`)
- Token management: auto-creates, caches in SQLite, auto-refreshes with 60s buffer
- Generic `gcFetch<T>(path, options)` handles auth headers
- Flow: agreement -> requisition -> bank auth link -> callback -> save accounts -> sync transactions

### Transaction Sync
- Only **booked** transactions are imported — pending transactions are intentionally excluded to prevent duplicates (pending txns reappear as booked with different IDs)
- `transactionId` is unique in the DB
- Sync skips existing transactions by checking before insert

### Auto-Categorization
- `categoryRules` table stores patterns with field targets
- On sync, each new transaction is matched against all rules
- Pattern matching: word-by-word substring (`"google cloud"` matches `"GOOGLE*CLOUD"`)
- Bulk categorize uses SQL `LIKE '%word1%word2%'` format

### Environment Variables
| Variable | Required | Default |
|---|---|---|
| `GOCARDLESS_SECRET_ID` | Yes | -- |
| `GOCARDLESS_SECRET_KEY` | Yes | -- |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` |
| `DB_FILE_NAME` | No | `file:local.db` |
