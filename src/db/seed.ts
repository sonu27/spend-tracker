import { drizzle } from "drizzle-orm/libsql";
import { categories, categoryRules } from "./schema";

const db = drizzle({ connection: { url: process.env.DB_FILE_NAME || "file:local.db" } });

const defaultCategories = [
  {
    name: "Groceries",
    color: "#22c55e",
    rules: [
      "tesco", "sainsbury", "asda", "aldi", "lidl",
      "waitrose", "morrisons", "co-op", "ocado", "iceland",
    ],
  },
  {
    name: "Transport",
    color: "#3b82f6",
    rules: [
      "tfl", "uber", "bolt", "trainline", "national rail",
    ],
  },
  {
    name: "Eating Out",
    color: "#f59e0b",
    rules: [
      "deliveroo", "uber eats", "just eat", "nandos", "mcdonalds",
      "pret", "costa", "starbucks", "greggs",
    ],
  },
  {
    name: "Shopping",
    color: "#8b5cf6",
    rules: [
      "amazon", "ebay", "john lewis", "argos", "primark", "asos",
      "uniqlo", "aliexpress", "decathlon",
    ],
  },
  {
    name: "Bills & Utilities",
    color: "#ef4444",
    rules: [
      "british gas", "edf", "thames water", "council tax",
      "tv licence", "sky", "netflix", "spotify",
    ],
  },
  {
    name: "Health & Fitness",
    color: "#06b6d4",
    rules: [
      "gym", "pharmacy", "boots",
    ],
  },
  {
    name: "Entertainment",
    color: "#ec4899",
    rules: [
      "cinema", "vue", "odeon", "ticketmaster",
    ],
  },
  {
    name: "Transfers",
    color: "#6366f1",
    rules: [
      "credit card payment", "balance transfer", "from savings",
      "to savings", "direct debit payment",
    ],
  },
  {
    name: "Income",
    color: "#14b8a6",
    rules: ["salary", "wages", "interest earned"],
  },
  {
    name: "Travel",
    color: "#f97316",
    rules: [
      "booking.com", "trip.com", "easyjet", "ryanair", "british airways",
    ],
  },
  {
    name: "Investments",
    color: "#84cc16",
    rules: [
      "trading 212", "vanguard", "hargreaves lansdown",
    ],
  },
];

async function seed() {
  console.log("Seeding default categories...");

  for (const cat of defaultCategories) {
    try {
      const result = await db
        .insert(categories)
        .values({
          name: cat.name,
          color: cat.color,
        })
        .onConflictDoNothing()
        .returning();

      if (result.length > 0 && cat.rules.length > 0) {
        for (const pattern of cat.rules) {
          await db.insert(categoryRules).values({
            categoryId: result[0].id,
            pattern,
          });
        }
      }

      console.log(
        `  ${result.length > 0 ? "Created" : "Skipped"}: ${cat.name}${
          cat.rules.length > 0 ? ` (${cat.rules.length} rules)` : ""
        }`
      );
    } catch (err) {
      console.log(`  Skipped: ${cat.name} (already exists)`);
    }
  }

  console.log("Done!");
}

seed().catch(console.error);
