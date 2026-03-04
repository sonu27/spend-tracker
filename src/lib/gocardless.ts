import { db } from "@/db";
import { tokenCache } from "@/db/schema";
import { desc } from "drizzle-orm";

const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

interface TokenResponse {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

interface RefreshResponse {
  access: string;
  access_expires: number;
}

async function createNewToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/token/new/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create token: ${res.status} ${error}`);
  }

  const data: TokenResponse = await res.json();
  const now = new Date();

  await db.insert(tokenCache).values({
    accessToken: data.access,
    accessExpires: Math.floor(now.getTime() / 1000) + data.access_expires,
    refreshToken: data.refresh,
    refreshExpires: Math.floor(now.getTime() / 1000) + data.refresh_expires,
    createdAt: now,
  });

  return data.access;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/token/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!res.ok) {
    // Refresh token expired, create entirely new token
    return createNewToken();
  }

  const data: RefreshResponse = await res.json();
  const now = new Date();
  const cached = await db
    .select()
    .from(tokenCache)
    .orderBy(desc(tokenCache.createdAt))
    .limit(1);

  if (cached.length > 0) {
    const { eq } = await import("drizzle-orm");
    await db
      .update(tokenCache)
      .set({
        accessToken: data.access,
        accessExpires: Math.floor(now.getTime() / 1000) + data.access_expires,
      })
      .where(eq(tokenCache.id, cached[0].id));
  }

  return data.access;
}

export async function getAccessToken(): Promise<string> {
  const cached = await db
    .select()
    .from(tokenCache)
    .orderBy(desc(tokenCache.createdAt))
    .limit(1);

  if (cached.length === 0) {
    return createNewToken();
  }

  const token = cached[0];
  const now = Math.floor(Date.now() / 1000);

  // Access token still valid (with 60s buffer)
  if (token.accessExpires > now + 60) {
    return token.accessToken;
  }

  // Refresh token still valid
  if (token.refreshExpires > now + 60) {
    return refreshAccessToken(token.refreshToken);
  }

  // Both expired, create new
  return createNewToken();
}

async function gcFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GoCardless API error: ${res.status} ${error}`);
  }

  return res.json();
}

// --- Institution types ---
export interface Institution {
  id: string;
  name: string;
  bic: string;
  transaction_total_days: string;
  countries: string[];
  logo: string;
  max_access_valid_for_days: string;
}

export async function getInstitutions(
  country: string = "gb"
): Promise<Institution[]> {
  return gcFetch<Institution[]>(`/institutions/?country=${country}`);
}

export async function getInstitution(
  institutionId: string
): Promise<Institution> {
  return gcFetch<Institution>(`/institutions/${institutionId}/`);
}

export interface BalancesResponse {
  balances: {
    balanceAmount: { amount: string; currency: string };
    balanceType: string;
    referenceDate?: string;
  }[];
}

export async function getBalances(
  accountId: string
): Promise<BalancesResponse> {
  return gcFetch<BalancesResponse>(`/accounts/${accountId}/balances/`);
}

// --- Requisition types ---
export interface RequisitionResponse {
  id: string;
  created: string;
  redirect: string;
  status: string;
  institution_id: string;
  agreement: string;
  reference: string;
  accounts: string[];
  link: string;
  account_selection: boolean;
  redirect_immediate: boolean;
}

// --- End User Agreement types ---
export interface AgreementResponse {
  id: string;
  created: string;
  max_historical_days: number;
  access_valid_for_days: number;
  access_scope: string[];
  accepted: string;
  institution_id: string;
}

export async function getAgreement(
  agreementId: string
): Promise<AgreementResponse> {
  return gcFetch<AgreementResponse>(`/agreements/enduser/${agreementId}/`);
}

export async function createAgreement(
  institutionId: string,
  maxHistoricalDays: number,
  accessValidForDays?: number
): Promise<AgreementResponse> {
  return gcFetch<AgreementResponse>("/agreements/enduser/", {
    method: "POST",
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: maxHistoricalDays,
      access_valid_for_days: accessValidForDays || 90,
      access_scope: ["balances", "details", "transactions"],
    }),
  });
}

export async function createRequisition(
  institutionId: string,
  redirect: string,
  reference?: string,
  agreementId?: string
): Promise<RequisitionResponse> {
  const body: Record<string, unknown> = {
    institution_id: institutionId,
    redirect,
    reference: reference || `ref-${Date.now()}`,
    user_language: "EN",
  };

  if (agreementId) {
    body.agreement = agreementId;
  }

  return gcFetch<RequisitionResponse>("/requisitions/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getRequisition(
  requisitionId: string
): Promise<RequisitionResponse> {
  return gcFetch<RequisitionResponse>(`/requisitions/${requisitionId}/`);
}

// --- Account types ---
export interface AccountDetails {
  account: {
    resourceId?: string;
    iban?: string;
    bban?: string;
    currency?: string;
    ownerName?: string;
    name?: string;
    displayName?: string;
    product?: string;
    status?: string;
  };
}

export async function getAccountDetails(
  accountId: string
): Promise<AccountDetails> {
  return gcFetch<AccountDetails>(`/accounts/${accountId}/details/`);
}

export interface AccountMetadata {
  id: string;
  created: string;
  last_accessed: string;
  iban: string;
  institution_id: string;
  status: string;
  owner_name: string;
}

export async function getAccountMetadata(
  accountId: string
): Promise<AccountMetadata> {
  return gcFetch<AccountMetadata>(`/accounts/${accountId}/`);
}

// --- Transaction types ---
export interface TransactionAmount {
  currency: string;
  amount: string;
}

export interface RawTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  bookingDateTime?: string;
  valueDate?: string;
  transactionAmount: TransactionAmount;
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  bankTransactionCode?: string;
  merchantCategoryCode?: string;
  additionalInformation?: string;
  [key: string]: unknown;
}

export interface TransactionsResponse {
  transactions: {
    booked: RawTransaction[];
    pending: RawTransaction[];
  };
}

export async function getTransactions(
  accountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TransactionsResponse> {
  let path = `/accounts/${accountId}/transactions/`;
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString();
  if (qs) path += `?${qs}`;

  return gcFetch<TransactionsResponse>(path);
}
