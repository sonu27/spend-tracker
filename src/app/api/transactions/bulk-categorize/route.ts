import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categoryRules } from "@/db/schema";
import { matchesPattern, normalizeText } from "@/lib/categorize";
import { inArray } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { categoryId, pattern, createRule } = body;

    if (!categoryId || !pattern) {
      return NextResponse.json(
        { error: "categoryId and pattern are required" },
        { status: 400 }
      );
    }

    const lowerPattern = pattern.toLowerCase();

    if (!normalizeText(lowerPattern)) {
      return NextResponse.json(
        { error: "pattern must contain letters or numbers" },
        { status: 400 }
      );
    }

    // Match with the same logic sync uses, so what's applied now is what
    // the saved rule will do to future transactions
    const candidates = await db
      .select({
        id: transactions.id,
        merchantName: transactions.merchantName,
        creditorName: transactions.creditorName,
        debtorName: transactions.debtorName,
        remittanceInfo: transactions.remittanceInfo,
      })
      .from(transactions);
    const matchedIds = candidates
      .filter((tx) => matchesPattern(tx, lowerPattern))
      .map((tx) => tx.id);

    // Update all matching transactions
    const result = matchedIds.length > 0
      ? await db
        .update(transactions)
        .set({ categoryId })
        .where(inArray(transactions.id, matchedIds))
        .returning({ id: transactions.id })
      : [];

    // Optionally create a category rule for future syncs
    let ruleId: number | null = null;
    if (createRule !== false) {
      const ruleResult = await db
        .insert(categoryRules)
        .values({
          categoryId,
          pattern: lowerPattern,
        })
        .returning({ id: categoryRules.id });

      ruleId = ruleResult[0]?.id ?? null;
    }

    return NextResponse.json({
      updated: result.length,
      ruleId,
    });
  } catch (error) {
    console.error("Failed to bulk categorize:", error);
    return NextResponse.json(
      { error: "Failed to bulk categorize" },
      { status: 500 }
    );
  }
}
