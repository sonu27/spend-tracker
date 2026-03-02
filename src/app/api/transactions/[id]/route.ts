import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txId = parseInt(id);

  try {
    const body = await request.json();
    const { categoryId } = body;

    await db
      .update(transactions)
      .set({ categoryId: categoryId ?? null })
      .where(eq(transactions.id, txId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}
