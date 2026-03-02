import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categoryRules } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

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

    // Turn "google cloud" into "%google%cloud%" so it matches
    // "GOOGLE*CLOUD", "GOOGLE CLOUD", "GOOGLECLOUD" etc.
    const words = lowerPattern.split(/\s+/).filter(Boolean);
    const likePattern = "%" + words.join("%") + "%";

    // Always match against ALL text fields — banks put merchant info
    // in different fields inconsistently
    const whereClause = sql`(
      LOWER(${transactions.merchantName}) LIKE ${likePattern}
      OR LOWER(${transactions.creditorName}) LIKE ${likePattern}
      OR LOWER(${transactions.debtorName}) LIKE ${likePattern}
      OR LOWER(${transactions.remittanceInfo}) LIKE ${likePattern}
    )`;

    // Update all matching transactions
    const result = await db
      .update(transactions)
      .set({ categoryId })
      .where(whereClause)
      .returning({ id: transactions.id });

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
