import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { derivePattern } from "@/lib/utils";
import { eq, sql, asc } from "drizzle-orm";

const MIN_PATTERN_LENGTH = 4;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Derive a search pattern from the raw merchant name.
    // If the pattern is too short / generic (e.g. "nw" from "NW MASTERCARD"),
    // fall back to exact case-insensitive matching on the raw name.
    const pattern = derivePattern(name);
    const useExact = pattern.length < MIN_PATTERN_LENGTH;

    let whereClause;
    if (useExact) {
      const lower = name.toLowerCase();
      whereClause = sql`(
        LOWER(${transactions.merchantName}) = ${lower}
        OR LOWER(${transactions.creditorName}) = ${lower}
        OR LOWER(${transactions.debtorName}) = ${lower}
        OR LOWER(${transactions.remittanceInfo}) = ${lower}
      )`;
    } else {
      const words = pattern.split(/\s+/).filter(Boolean);
      const likePattern = "%" + words.join("%") + "%";
      whereClause = sql`(
        LOWER(${transactions.merchantName}) LIKE ${likePattern}
        OR LOWER(${transactions.creditorName}) LIKE ${likePattern}
        OR LOWER(${transactions.debtorName}) LIKE ${likePattern}
        OR LOWER(${transactions.remittanceInfo}) LIKE ${likePattern}
      )`;
    }

    const rows = await db
      .select({
        id: transactions.id,
        bookingDate: transactions.bookingDate,
        amount: transactions.amount,
        currency: transactions.currency,
        creditorName: transactions.creditorName,
        debtorName: transactions.debtorName,
        merchantName: transactions.merchantName,
        remittanceInfo: transactions.remittanceInfo,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(whereClause)
      .orderBy(asc(transactions.bookingDate), asc(transactions.id));

    // Compute summary stats
    const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
    const count = rows.length;

    return NextResponse.json({
      transactions: rows,
      summary: {
        count,
        totalAmount,
        avgAmount: count > 0 ? totalAmount / count : 0,
        firstDate: rows[0]?.bookingDate ?? null,
        lastDate: rows[rows.length - 1]?.bookingDate ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to load merchant history:", error);
    return NextResponse.json(
      { error: "Failed to load merchant history" },
      { status: 500 }
    );
  }
}
