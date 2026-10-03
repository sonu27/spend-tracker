import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requisitions, accounts, transactions } from "@/db/schema";
import { getRequisition, getAccountMetadata, getAccountDetails, getInstitution } from "@/lib/gocardless";
import { desc, eq } from "drizzle-orm";

type Account = typeof accounts.$inferSelect;

// Some banks (e.g. Amex) issue a fresh account ID when the user
// re-authenticates, so an account we already track can come back looking
// brand new. Find the existing account it replaces, if any, so it can be
// merged into rather than duplicated.
async function findReplacedAccount(
  iban: string | null,
  reconnectAccountId: string | null,
  requisitionId: string,
  returnedAccountIds: string[],
  unseenCount: number
): Promise<Account | null> {
  // Same account identifier under a different ID. Deliberately not limited to
  // the same institution: e.g. a Halifax card that moved to Lloyds kept its
  // identifier but came back under LLOYDS_LOYDGB2L.
  if (iban) {
    const matches = (
      await db.select().from(accounts).where(eq(accounts.iban, iban))
    ).filter((a) => !returnedAccountIds.includes(a.id));
    if (matches.length === 1) return matches[0];
  }

  // Started via "Reconnect" on a specific account: if the bank returned
  // exactly one unrecognised account, it must be the replacement. With
  // several there's no safe way to tell which is which.
  if (reconnectAccountId && unseenCount === 1) {
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, reconnectAccountId))
      .limit(1);
    const target = rows[0];
    // Skip if the target already came back under its own ID (re-pointed below)
    if (target && target.requisitionId !== requisitionId) return target;
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get("ref");

  try {
    // Find the requisition by reference
    let requisition;
    if (ref) {
      const rows = await db
        .select()
        .from(requisitions)
        .where(eq(requisitions.reference, ref))
        .limit(1);
      requisition = rows[0];
    }

    if (!requisition) {
      // Try to find the most recent CR requisition
      const rows = await db
        .select()
        .from(requisitions)
        .where(eq(requisitions.status, "CR"))
        .orderBy(desc(requisitions.createdAt))
        .limit(1);
      requisition = rows[0];
    }

    if (!requisition) {
      return NextResponse.redirect(
        new URL("/accounts?error=no_requisition", request.url)
      );
    }

    // Fetch the updated requisition from GoCardless
    const gcReq = await getRequisition(requisition.id);

    // Update status
    await db
      .update(requisitions)
      .set({ status: gcReq.status })
      .where(eq(requisitions.id, requisition.id));

    // If linked (status LN), save the accounts
    if (gcReq.status === "LN" && gcReq.accounts.length > 0) {
      let institutionName: string | null = null;
      let institutionLogo: string | null = null;
      try {
        const institution = await getInstitution(requisition.institutionId);
        institutionName = institution.name;
        institutionLogo = institution.logo;
      } catch {
        // Institution fetch failed — falls back to null
      }

      const replacedRequisitionIds = new Set<string>();
      const unseenAccountIds: string[] = [];

      for (const accountId of gcReq.accounts) {
        // Check if account already exists
        const existing = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .limit(1);

        if (existing.length > 0) {
          // Reconnect flow: the same account came back under a new
          // requisition. Re-point it to the fresh requisition so its access
          // window resets and syncing resumes — without touching the
          // account's transactions or user-set nickname/type.
          if (existing[0].requisitionId !== requisition.id) {
            replacedRequisitionIds.add(existing[0].requisitionId);
            await db
              .update(accounts)
              .set({ requisitionId: requisition.id })
              .where(eq(accounts.id, accountId));
          }
        } else {
          unseenAccountIds.push(accountId);
        }
      }

      for (const accountId of unseenAccountIds) {
        let iban: string | null = null;
        let ownerName: string | null = null;
        let name: string | null = null;
        let product: string | null = null;
        let currency: string | null = null;

        try {
          const metadata = await getAccountMetadata(accountId);
          iban = metadata.iban || null;
          ownerName = metadata.owner_name || null;

          const details = await getAccountDetails(accountId);
          product = details.account?.product || null;
          name =
            details.account?.displayName ||
            details.account?.name ||
            product ||
            null;
          currency = details.account?.currency || null;
        } catch {
          // Some banks may not provide all details
        }

        const replaced = await findReplacedAccount(
          iban,
          requisition.reconnectAccountId,
          requisition.id,
          gcReq.accounts,
          unseenAccountIds.length
        );

        if (replaced) {
          // Move the old account over to the new ID: keep its user-set
          // nickname/type, balance and sync state, take fresh details from
          // the bank where available, and carry its transactions across.
          replacedRequisitionIds.add(replaced.requisitionId);
          await db.transaction(async (tx) => {
            await tx.insert(accounts).values({
              ...replaced,
              id: accountId,
              requisitionId: requisition.id,
              institutionId: requisition.institutionId,
              iban: iban ?? replaced.iban,
              ownerName: ownerName ?? replaced.ownerName,
              name: name ?? replaced.name,
              product: product ?? replaced.product,
              currency: currency ?? replaced.currency,
              institutionName: institutionName ?? replaced.institutionName,
              institutionLogo: institutionLogo ?? replaced.institutionLogo,
            });
            await tx
              .update(transactions)
              .set({ accountId })
              .where(eq(transactions.accountId, replaced.id));
            await tx.delete(accounts).where(eq(accounts.id, replaced.id));
          });
          continue;
        }

        await db.insert(accounts).values({
          id: accountId,
          requisitionId: requisition.id,
          institutionId: requisition.institutionId,
          iban,
          ownerName,
          name,
          product,
          currency,
          institutionName,
          institutionLogo,
        });
      }

      // Drop any prior requisitions left orphaned by the re-pointing and
      // merging above, so repeated reconnects don't accumulate dead rows.
      for (const oldId of replacedRequisitionIds) {
        const remaining = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.requisitionId, oldId))
          .limit(1);
        if (remaining.length === 0) {
          await db.delete(requisitions).where(eq(requisitions.id, oldId));
        }
      }
    }
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.redirect(
      new URL("/accounts?error=callback_failed", request.url)
    );
  }

  redirect("/accounts?success=true");
}
