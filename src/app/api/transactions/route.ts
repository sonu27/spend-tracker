import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { desc, eq, gte, lte, and, like, isNull, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const accountId = searchParams.get("accountId");
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const uncategorized = searchParams.get("uncategorized");
    const limit = parseInt(searchParams.get("limit") || "200");
    const offset = parseInt(searchParams.get("offset") || "0");

    const conditions = [];

    if (dateFrom) {
      conditions.push(gte(transactions.bookingDate, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(transactions.bookingDate, dateTo));
    }
    if (accountId) {
      conditions.push(eq(transactions.accountId, accountId));
    }
    if (categoryId) {
      conditions.push(eq(transactions.categoryId, parseInt(categoryId)));
    }
    if (uncategorized === "true") {
      conditions.push(isNull(transactions.categoryId));
    }
    if (search) {
      conditions.push(
        sql`(${transactions.creditorName} LIKE ${"%" + search + "%"} OR ${transactions.debtorName} LIKE ${"%" + search + "%"} OR ${transactions.remittanceInfo} LIKE ${"%" + search + "%"} OR ${transactions.merchantName} LIKE ${"%" + search + "%"})`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: transactions.id,
        transactionId: transactions.transactionId,
        accountId: transactions.accountId,
        bookingDate: transactions.bookingDate,
        valueDate: transactions.valueDate,
        amount: transactions.amount,
        currency: transactions.currency,
        creditorName: transactions.creditorName,
        debtorName: transactions.debtorName,
        merchantName: transactions.merchantName,
        remittanceInfo: transactions.remittanceInfo,
        bankTransactionCode: transactions.bankTransactionCode,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        status: transactions.status,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.bookingDate), desc(transactions.id))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(where);

    return NextResponse.json({
      transactions: rows,
      total: countResult[0].count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to list transactions:", error);
    return NextResponse.json(
      { error: "Failed to list transactions" },
      { status: 500 }
    );
  }
}
