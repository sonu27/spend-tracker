import { drizzle } from "drizzle-orm/libsql";
import { accounts } from "../src/db/schema";
import { like } from "drizzle-orm";
import { readFileSync } from "fs";

// Parse .env.local manually
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const db = drizzle({ connection: { url: process.env.DB_FILE_NAME || "file:local.db" } });

// Inline GoCardless token fetch
const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });
  const data = await res.json();
  return data.access;
}

async function fetchBalances(accountId: string, token: string) {
  const res = await fetch(`${BASE_URL}/accounts/${accountId}/balances/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function main() {
  const token = await getToken();

  const rows = await db
    .select({ id: accounts.id, name: accounts.institutionName, nickname: accounts.nickname })
    .from(accounts);

  for (const row of rows) {
    console.log(`\n=== ${row.name}${row.nickname ? ` (${row.nickname})` : ""} ===`);
    try {
      const data = await fetchBalances(row.id, token);
      console.log(JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("Error:", e);
    }
  }
}

main();
