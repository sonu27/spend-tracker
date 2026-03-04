import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, requisitions } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { getRequisition, getAgreement, getInstitution } from "@/lib/gocardless";

async function backfillRequisitionDetails() {
  // Find requisitions missing agreement data
  const stale = await db
    .select({ id: requisitions.id })
    .from(requisitions)
    .where(isNull(requisitions.maxHistoricalDays));

  for (const row of stale) {
    try {
      const gcReq = await getRequisition(row.id);

      let maxHistoricalDays = 90;
      let accessValidForDays = 90;

      if (gcReq.agreement) {
        try {
          const agreement = await getAgreement(gcReq.agreement);
          maxHistoricalDays = agreement.max_historical_days;
          accessValidForDays = agreement.access_valid_for_days;
        } catch {
          // Agreement fetch failed -- the requisition may have used
          // default terms (no explicit agreement), so 90/90 is correct
        }
      }

      await db
        .update(requisitions)
        .set({ maxHistoricalDays, accessValidForDays })
        .where(eq(requisitions.id, row.id));
    } catch (err) {
      console.warn(`Backfill failed for requisition ${row.id}:`, err);
    }
  }
}

async function backfillInstitutionDetails() {
  const stale = await db
    .select({ id: accounts.id, institutionId: accounts.institutionId })
    .from(accounts)
    .where(isNull(accounts.institutionName));

  // Group by institutionId to avoid duplicate API calls
  const byInstitution = new Map<string, string[]>();
  for (const row of stale) {
    const ids = byInstitution.get(row.institutionId) || [];
    ids.push(row.id);
    byInstitution.set(row.institutionId, ids);
  }

  for (const [institutionId, accountIds] of byInstitution) {
    try {
      const institution = await getInstitution(institutionId);
      for (const accountId of accountIds) {
        await db
          .update(accounts)
          .set({
            institutionName: institution.name,
            institutionLogo: institution.logo,
          })
          .where(eq(accounts.id, accountId));
      }
    } catch (err) {
      console.warn(`Backfill failed for institution ${institutionId}:`, err);
    }
  }
}

export async function GET() {
  try {
    // Lazily backfill any requisitions that are missing agreement details
    await backfillRequisitionDetails();
    await backfillInstitutionDetails();

    const rows = await db
      .select({
        id: accounts.id,
        requisitionId: accounts.requisitionId,
        institutionId: accounts.institutionId,
        iban: accounts.iban,
        ownerName: accounts.ownerName,
        name: accounts.name,
        nickname: accounts.nickname,
        currency: accounts.currency,
        institutionName: accounts.institutionName,
        institutionLogo: accounts.institutionLogo,
        balance: accounts.balance,
        balanceDate: accounts.balanceDate,
        lastSyncedAt: accounts.lastSyncedAt,
        requisitionStatus: requisitions.status,
        maxHistoricalDays: requisitions.maxHistoricalDays,
        accessValidForDays: requisitions.accessValidForDays,
        connectedAt: requisitions.createdAt,
      })
      .from(accounts)
      .leftJoin(requisitions, eq(accounts.requisitionId, requisitions.id));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to list accounts:", error);
    return NextResponse.json(
      { error: "Failed to list accounts" },
      { status: 500 }
    );
  }
}
