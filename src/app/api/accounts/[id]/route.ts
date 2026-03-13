import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, transactions, requisitions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  try {
    const body = await request.json();
    const updates: { nickname?: string | null; accountType?: string | null } = {};

    if ("nickname" in body) {
      if (typeof body.nickname !== "string") {
        return NextResponse.json({ error: "nickname must be a string" }, { status: 400 });
      }
      updates.nickname = body.nickname || null;
    }

    if ("accountType" in body) {
      if (body.accountType !== null && body.accountType !== "credit_card") {
        return NextResponse.json({ error: "accountType must be null or \"credit_card\"" }, { status: 400 });
      }
      updates.accountType = body.accountType;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const result = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, accountId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Failed to update account:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  try {
    // Check the account exists
    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (account.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const requisitionId = account[0].requisitionId;

    // Delete all transactions for this account first
    const deletedTx = await db
      .delete(transactions)
      .where(eq(transactions.accountId, accountId))
      .returning({ id: transactions.id });

    // Delete the account
    await db.delete(accounts).where(eq(accounts.id, accountId));

    // If no other accounts reference this requisition, clean it up too
    const siblingAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.requisitionId, requisitionId));

    if (siblingAccounts.length === 0) {
      await db.delete(requisitions).where(eq(requisitions.id, requisitionId));
    }

    return NextResponse.json({
      success: true,
      transactionsDeleted: deletedTx.length,
    });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
