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
    const groupBy = searchParams.get("groupBy") || "day"; // day | week | month

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
    // Only count outgoing (negative amounts = spending)
    conditions.push(lt(transactions.amount, 0));
    // Exclude transfers and income
    if (excludedIds.length > 0) {
      conditions.push(
        sql`(${transactions.categoryId} IS NULL OR ${not(inArray(transactions.categoryId, excludedIds))})`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Spending by category
    const byCategory = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        total: sql<number>`sum(abs(${transactions.amount}))`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .groupBy(transactions.categoryId, categories.name, categories.color);

    // Spending by date period
    let dateGroupExpr;
    if (groupBy === "week") {
      // ISO week: group by year-week
      dateGroupExpr = sql<string>`strftime('%Y-W%W', ${transactions.bookingDate})`;
    } else if (groupBy === "month") {
      dateGroupExpr = sql<string>`strftime('%Y-%m', ${transactions.bookingDate})`;
    } else {
      dateGroupExpr = sql<string>`${transactions.bookingDate}`;
    }

    const byPeriod = await db
      .select({
        period: dateGroupExpr.as("period"),
        total: sql<number>`sum(abs(${transactions.amount}))`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where)
      .groupBy(dateGroupExpr)
      .orderBy(dateGroupExpr);

    // Total spending
    const totalResult = await db
      .select({
        total: sql<number>`sum(abs(${transactions.amount}))`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where);

    return NextResponse.json({
      total: totalResult[0]?.total || 0,
      transactionCount: totalResult[0]?.count || 0,
      byCategory: byCategory.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName || "Uncategorized",
        categoryColor: row.categoryColor || "#9CA3AF",
        total: row.total,
        count: row.count,
      })),
      byPeriod: byPeriod.map((row) => ({
        period: row.period,
        total: row.total,
        count: row.count,
      })),
    });
  } catch (error) {
    console.error("Failed to get spending summary:", error);
    return NextResponse.json(
      { error: "Failed to get spending summary" },
      { status: 500 }
    );
  }
}
