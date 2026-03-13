import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { sql, and, gte, lte, gt, eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const accountId = searchParams.get("accountId");
    const groupBy = searchParams.get("groupBy") || "day";

    const conditions = [];
    if (dateFrom) conditions.push(gte(transactions.bookingDate, dateFrom));
    if (dateTo) conditions.push(lte(transactions.bookingDate, dateTo));
    if (accountId) conditions.push(eq(transactions.accountId, accountId));
    // Only count incoming (positive amounts = income/credits)
    conditions.push(gt(transactions.amount, 0));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Income by date period
    let dateGroupExpr;
    if (groupBy === "week") {
      dateGroupExpr = sql<string>`strftime('%Y-W%W', ${transactions.bookingDate})`;
    } else if (groupBy === "month") {
      dateGroupExpr = sql<string>`strftime('%Y-%m', ${transactions.bookingDate})`;
    } else {
      dateGroupExpr = sql<string>`${transactions.bookingDate}`;
    }

    const byPeriod = await db
      .select({
        period: dateGroupExpr.as("period"),
        total: sql<number>`sum(${transactions.amount})`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where)
      .groupBy(dateGroupExpr)
      .orderBy(dateGroupExpr);

    // Income by source
    const sourceExpr = sql<string>`COALESCE(${transactions.debtorName}, ${transactions.creditorName}, ${transactions.remittanceInfo}, 'Unknown')`;
    const bySource = await db
      .select({
        source: sourceExpr.as("source"),
        total: sql<number>`sum(${transactions.amount})`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where)
      .groupBy(sourceExpr)
      .orderBy(sql`sum(${transactions.amount}) desc`);

    // Total income
    const totalResult = await db
      .select({
        total: sql<number>`sum(${transactions.amount})`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where);

    return NextResponse.json({
      total: totalResult[0]?.total || 0,
      transactionCount: totalResult[0]?.count || 0,
      byPeriod: byPeriod.map((row) => ({
        period: row.period,
        total: row.total,
        count: row.count,
      })),
      bySource: bySource.map((row) => ({
        source: row.source,
        total: row.total,
        count: row.count,
      })),
    });
  } catch (error) {
    console.error("Failed to get cashflow summary:", error);
    return NextResponse.json(
      { error: "Failed to get cashflow summary" },
      { status: 500 }
    );
  }
}
