import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { loadCategoryMatcher } from "@/lib/categorize";
import { eq, isNull } from "drizzle-orm";

export async function POST() {
  try {
    const matchCategory = await loadCategoryMatcher();

    // Load all uncategorized transactions
    const uncategorized = await db
      .select({
        id: transactions.id,
        merchantName: transactions.merchantName,
        creditorName: transactions.creditorName,
        debtorName: transactions.debtorName,
        remittanceInfo: transactions.remittanceInfo,
        merchantCategoryCode: transactions.merchantCategoryCode,
      })
      .from(transactions)
      .where(isNull(transactions.categoryId));

    let updated = 0;

    for (const tx of uncategorized) {
      const matchedCategoryId = matchCategory(tx);

      if (matchedCategoryId) {
        await db
          .update(transactions)
          .set({ categoryId: matchedCategoryId })
          .where(eq(transactions.id, tx.id));
        updated++;
      }
    }

    return NextResponse.json({
      updated,
      total: uncategorized.length,
    });
  } catch (error) {
    console.error("Failed to recategorize:", error);
    return NextResponse.json(
      { error: "Failed to recategorize" },
      { status: 500 }
    );
  }
}
