import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { sql, and, gte, lte, lt, eq, not, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const accountId = searchParams.get("accountId");
    const limit = parseInt(searchParams.get("limit") || "30");

    // Find categories to exclude from spending (e.g. Transfers, Income)
    const excludedCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.name, ["Transfers", "Income", "Investments"]));
    const excludedIds = excludedCategories.map((c) => c.id);

    const conditions = [];
    if (dateFrom) conditions.push(gte(transactions.bookingDate, dateFrom));
    if (dateTo) conditions.push(lte(transactions.bookingDate, dateTo));
    if (accountId) conditions.push(eq(transactions.accountId, accountId));
    conditions.push(lt(transactions.amount, 0));
    // Exclude transfers and income
    if (excludedIds.length > 0) {
      conditions.push(
        sql`(${transactions.categoryId} IS NULL OR ${not(inArray(transactions.categoryId, excludedIds))})`
      );
    }

    const where = and(...conditions);

    const merchantExpr = sql<string>`COALESCE(${transactions.merchantName}, ${transactions.creditorName}, ${transactions.debtorName}, 'Unknown')`;

    const rows = await db
      .select({
        merchant: merchantExpr.as("merchant"),
        total: sql<number>`sum(abs(${transactions.amount}))`,
        count: sql<number>`count(*)`,
        avgAmount: sql<number>`avg(abs(${transactions.amount}))`,
      })
      .from(transactions)
      .where(where)
      .groupBy(merchantExpr)
      .orderBy(sql`sum(abs(${transactions.amount})) DESC`)
      .limit(limit);

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to get merchant spending:", error);
    return NextResponse.json(
      { error: "Failed to get merchant spending" },
      { status: 500 }
    );
  }
}
