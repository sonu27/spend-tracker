import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const tokenCache = sqliteTable("token_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accessToken: text("access_token").notNull(),
  accessExpires: integer("access_expires").notNull(),
  refreshToken: text("refresh_token").notNull(),
  refreshExpires: integer("refresh_expires").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const requisitions = sqliteTable("requisitions", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  status: text("status").notNull().default("CR"),
  reference: text("reference"),
  link: text("link"),
  maxHistoricalDays: integer("max_historical_days"),
  accessValidForDays: integer("access_valid_for_days"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  requisitionId: text("requisition_id")
    .notNull()
    .references(() => requisitions.id),
  institutionId: text("institution_id").notNull(),
  iban: text("iban"),
  ownerName: text("owner_name"),
  name: text("name"),
  nickname: text("nickname"),
  product: text("product"),
  currency: text("currency"),
  institutionName: text("institution_name"),
  institutionLogo: text("institution_logo"),
  accountType: text("account_type"),
  balance: real("balance"),
  balanceDate: text("balance_date"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6B7280"),
  icon: text("icon"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: text("transaction_id").notNull().unique(),
  internalTransactionId: text("internal_transaction_id"),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  bookingDate: text("booking_date").notNull(),
  valueDate: text("value_date"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("GBP"),
  creditorName: text("creditor_name"),
  debtorName: text("debtor_name"),
  merchantName: text("merchant_name"),
  remittanceInfo: text("remittance_info"),
  bankTransactionCode: text("bank_transaction_code"),
  merchantCategoryCode: text("merchant_category_code"),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("booked"),
  rawData: text("raw_data"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
