import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categoryRules, categories } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

export async function POST() {
  try {
    // Load all rules
    const rules = await db
      .select({
        id: categoryRules.id,
        categoryId: categoryRules.categoryId,
        pattern: categoryRules.pattern,
      })
      .from(categoryRules)
      .innerJoin(categories, eq(categoryRules.categoryId, categories.id));

    if (rules.length === 0) {
      return NextResponse.json({ updated: 0, message: "No rules found" });
    }

    // Load all uncategorized transactions
    const uncategorized = await db
      .select({
        id: transactions.id,
        merchantName: transactions.merchantName,
        creditorName: transactions.creditorName,
        debtorName: transactions.debtorName,
        remittanceInfo: transactions.remittanceInfo,
      })
      .from(transactions)
      .where(isNull(transactions.categoryId));

    let updated = 0;

    for (const tx of uncategorized) {
      const targets = [
        tx.merchantName,
        tx.creditorName,
        tx.debtorName,
        tx.remittanceInfo,
      ];

      let matchedCategoryId: number | null = null;

      for (const rule of rules) {
        const words = rule.pattern.toLowerCase().split(/\s+/).filter(Boolean);

        for (const target of targets) {
          if (!target) continue;
          const lower = target.toLowerCase();
          if (words.every((word) => lower.includes(word))) {
            matchedCategoryId = rule.categoryId;
            break;
          }
        }
        if (matchedCategoryId) break;
      }

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
