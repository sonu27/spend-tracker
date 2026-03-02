import { NextResponse } from "next/server";
import { db } from "@/db";
import { requisitions } from "@/db/schema";
import { createRequisition, getRequisition, createAgreement } from "@/lib/gocardless";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(requisitions)
      .orderBy(desc(requisitions.createdAt));
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to list requisitions:", error);
    return NextResponse.json(
      { error: "Failed to list requisitions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { institutionId, maxHistoricalDays } = body;

    if (!institutionId) {
      return NextResponse.json(
        { error: "institutionId is required" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirect = `${appUrl}/api/gocardless/callback`;
    const reference = `ref-${Date.now()}`;

    // Create an end user agreement requesting the max transaction history
    // the bank supports (passed from the frontend via the institution's
    // transaction_total_days field). Without this, GoCardless defaults to 90 days.
    let agreementId: string | undefined;
    let agreedHistoricalDays = 90;
    let agreedAccessDays = 90;

    if (maxHistoricalDays && maxHistoricalDays > 90) {
      try {
        const agreement = await createAgreement(institutionId, maxHistoricalDays);
        agreementId = agreement.id;
        agreedHistoricalDays = agreement.max_historical_days;
        agreedAccessDays = agreement.access_valid_for_days;
      } catch (err) {
        // If agreement creation fails (e.g. bank doesn't support the
        // requested days), fall back to default 90-day terms
        console.warn("Agreement creation failed, using defaults:", err);
      }
    }

    const result = await createRequisition(institutionId, redirect, reference, agreementId);

    await db.insert(requisitions).values({
      id: result.id,
      institutionId: result.institution_id,
      status: result.status,
      reference: result.reference,
      link: result.link,
      maxHistoricalDays: agreedHistoricalDays,
      accessValidForDays: agreedAccessDays,
      createdAt: new Date(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create requisition:", error);
    return NextResponse.json(
      { error: "Failed to create requisition" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { requisitionId } = body;

    if (!requisitionId) {
      return NextResponse.json(
        { error: "requisitionId is required" },
        { status: 400 }
      );
    }

    const result = await getRequisition(requisitionId);

    await db
      .update(requisitions)
      .set({ status: result.status })
      .where(eq(requisitions.id, requisitionId));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to refresh requisition:", error);
    return NextResponse.json(
      { error: "Failed to refresh requisition" },
      { status: 500 }
    );
  }
}
