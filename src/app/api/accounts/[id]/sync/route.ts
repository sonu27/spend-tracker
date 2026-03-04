import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, accounts, categoryRules, categories } from "@/db/schema";
import { getTransactions, type RawTransaction } from "@/lib/gocardless";
import { eq } from "drizzle-orm";

function extractMerchantName(tx: RawTransaction): string | null {
  return tx.creditorName || tx.debtorName || null;
}

function getTransactionUniqueId(tx: RawTransaction, accountId: string): string {
  if (tx.transactionId) return tx.transactionId;
  if (tx.internalTransactionId) return `gc-${tx.internalTransactionId}`;
  // Fallback: hash from date + amount + info
  const parts = [
    accountId,
    tx.bookingDate || tx.valueDate || "",
    tx.transactionAmount.amount,
    tx.transactionAmount.currency,
    tx.remittanceInformationUnstructured || "",
  ];
  return `derived-${parts.join("-")}`;
}

function getRemittanceInfo(tx: RawTransaction): string | null {
  if (tx.remittanceInformationUnstructured) {
    return tx.remittanceInformationUnstructured;
  }
  if (
    tx.remittanceInformationUnstructuredArray &&
    tx.remittanceInformationUnstructuredArray.length > 0
  ) {
    return tx.remittanceInformationUnstructuredArray.join(" | ");
  }
  if (tx.additionalInformation) {
    return tx.additionalInformation;
  }
  return null;
}

async function matchCategory(
  merchantName: string | null,
  creditorName: string | null,
  debtorName: string | null,
  remittanceInfo: string | null
): Promise<number | null> {
  // All fields empty — nothing to match
  if (!merchantName && !creditorName && !debtorName && !remittanceInfo) return null;

  const rules = await db
    .select({
      id: categoryRules.id,
      categoryId: categoryRules.categoryId,
      pattern: categoryRules.pattern,
    })
    .from(categoryRules)
    .innerJoin(categories, eq(categoryRules.categoryId, categories.id));

  // Always check every rule against ALL text fields — banks put
  // merchant info in different fields inconsistently
  const targets = [merchantName, creditorName, debtorName, remittanceInfo];

  for (const rule of rules) {
    const words = rule.pattern.toLowerCase().split(/\s+/).filter(Boolean);

    for (const target of targets) {
      if (!target) continue;
      const lower = target.toLowerCase();
      if (words.every((word) => lower.includes(word))) {
        return rule.categoryId;
      }
    }
  }

  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  try {
    // Check account exists
    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (account.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Optionally accept date range from request body
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    try {
      const body = await request.json();
      dateFrom = body.dateFrom;
      dateTo = body.dateTo;
    } catch {
      // No body is fine
    }

    const data = await getTransactions(accountId, dateFrom, dateTo);

    let inserted = 0;
    let skipped = 0;

    const allTransactions = [
      ...data.transactions.booked.map((tx) => ({ ...tx, _status: "booked" as const })),
    ];

    for (const tx of allTransactions) {
      const txId = getTransactionUniqueId(tx, accountId);

      // Check for duplicate
      const existing = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.transactionId, txId))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const merchantName = extractMerchantName(tx);
      const creditorName = tx.creditorName || null;
      const debtorName = tx.debtorName || null;
      const remittanceInfo = getRemittanceInfo(tx);
      const categoryId = await matchCategory(merchantName, creditorName, debtorName, remittanceInfo);

      await db.insert(transactions).values({
        transactionId: txId,
        internalTransactionId: tx.internalTransactionId || null,
        accountId,
        bookingDate: tx.bookingDate || tx.valueDate || new Date().toISOString().slice(0, 10),
        valueDate: tx.valueDate || null,
        amount: parseFloat(tx.transactionAmount.amount),
        currency: tx.transactionAmount.currency,
        creditorName: tx.creditorName || null,
        debtorName: tx.debtorName || null,
        merchantName,
        remittanceInfo,
        bankTransactionCode: tx.bankTransactionCode || null,
        merchantCategoryCode: tx.merchantCategoryCode || null,
        categoryId,
        status: tx._status,
        rawData: JSON.stringify(tx),
        createdAt: new Date(),
      });

      inserted++;
    }

    // Update last synced
    await db
      .update(accounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(accounts.id, accountId));

    return NextResponse.json({
      inserted,
      skipped,
      total: allTransactions.length,
    });
  } catch (error) {
    console.error("Failed to sync transactions:", error);
    return NextResponse.json(
      { error: "Failed to sync transactions" },
      { status: 500 }
    );
  }
}
