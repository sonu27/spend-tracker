# Spend Tracker

**Your finances, your machine, your data.** A local-first spending tracker that runs entirely on your own computer. No cloud. No accounts. No telemetry. Your transaction data never leaves your machine.

Spend Tracker connects to UK bank accounts via the [GoCardless Bank Account Data API](https://gocardless.com/bank-account-data/) to pull transactions, then stores and processes everything locally in a SQLite database on your filesystem. There is no backend server, no third-party analytics, and no data shared with anyone. The GoCardless API is used solely as a read-only bridge to fetch your bank data -- nothing is sent back.

## Why Local-First?

Most budgeting apps require you to hand over your financial data to a company's servers. Spend Tracker takes a different approach:

- **All data stays on disk** -- Transactions are stored in a local SQLite file. No cloud database, no sync service.
- **No accounts or auth** -- There's no login, no user system. It's your machine, so it's your app.
- **No telemetry or tracking** -- Zero analytics, zero phone-home behaviour. Nothing runs unless you run it.
- **Fully offline after sync** -- Once transactions are pulled from your bank, everything works without an internet connection.
- **Open source** -- Inspect every line. Verify that your data goes nowhere.

## Features

- **Bank connections** -- Link UK bank accounts via GoCardless with QR code auth flow
- **Transaction sync** -- Pull and deduplicate transactions from connected accounts
- **Categorization** -- Manual and rule-based auto-categorization of transactions
- **Spending analysis** -- Daily, weekly, and monthly spending charts
- **Category management** -- CRUD categories with pattern-matching auto-rules

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- SQLite via Drizzle ORM
- Tailwind CSS v4
- Recharts
- TypeScript

## Prerequisites

- Node.js 24+
- GoCardless Bank Account Data API credentials ([sign up here](https://bankaccountdata.gocardless.com/))

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file:

```
GOCARDLESS_SECRET_ID=your_secret_id
GOCARDLESS_SECRET_KEY=your_secret_key
```

3. Push the database schema:

```bash
npm run db:push
```

4. Seed default categories:

```bash
npm run db:seed
```

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema changes to SQLite |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:seed` | Seed default categories and rules |
| `npm run db:studio` | Open Drizzle Studio GUI |

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `GOCARDLESS_SECRET_ID` | Yes | -- |
| `GOCARDLESS_SECRET_KEY` | Yes | -- |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` |
| `DB_FILE_NAME` | No | `file:local.db` |

## License

MIT
