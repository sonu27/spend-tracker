import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requisitions, accounts } from "@/db/schema";
import { getRequisition, getAccountMetadata, getAccountDetails, getInstitution } from "@/lib/gocardless";
import { eq } from "drizzle-orm";

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
      }

      // Drop any prior requisitions left orphaned by the re-pointing above,
      // so repeated reconnects don't accumulate dead requisition rows.
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
