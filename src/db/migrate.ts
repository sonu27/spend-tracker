import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

async function main() {
  const db = drizzle({ connection: { url: process.env.DB_FILE_NAME || "file:local.db" } });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
