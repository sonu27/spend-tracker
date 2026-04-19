"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

interface Institution {
  id: string;
  name: string;
  bic: string;
  logo: string;
  transaction_total_days: string;
  countries: string[];
}

interface Account {
  id: string;
  requisitionId: string;
  institutionId: string;
  iban: string | null;
  ownerName: string | null;
  name: string | null;
  nickname: string | null;
  currency: string | null;
  institutionName: string | null;
  institutionLogo: string | null;
  accountType: string | null;
  balance: number | null;
  balanceDate: string | null;
  creditLeft: number | null;
  lastSyncedAt: string | null;
  requisitionStatus: string | null;
  maxHistoricalDays: number | null;
  accessValidForDays: number | null;
  connectedAt: string | null;
}

interface InstitutionGroup {
  institutionId: string;
  name: string;
  logo: string | null;
  accounts: Account[];
}

function groupByInstitution(accounts: Account[]): InstitutionGroup[] {
  const map = new Map<string, InstitutionGroup>();
  for (const account of accounts) {
    const key = account.institutionId;
    if (!map.has(key)) {
      map.set(key, {
        institutionId: key,
        name: account.institutionName || key,
        logo: account.institutionLogo,
        accounts: [],
      });
    }
    map.get(key)!.accounts.push(account);
  }
  return Array.from(map.values());
}

function formatCurrency(amount: number, currency: string = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount);
}

interface SyncResult {
  inserted: number;
  skipped: number;
  total: number;
}

type ConnectMethod = "browser" | "phone";

interface PendingRequisition {
  id: string;
  link: string;
  institutionId: string;
  institutionName: string;
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="text-muted">Loading...</div>}>
      <AccountsContent />
    </Suspense>
  );
}

function AccountsContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const error = searchParams.get("error");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [showBankSelector, setShowBankSelector] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [connecting, setConnecting] = useState(false);
  const [connectMethod, setConnectMethod] = useState<ConnectMethod>("phone");
  const [pendingRequisition, setPendingRequisition] = useState<PendingRequisition | null>(null);
  const [pollStatus, setPollStatus] = useState<string>("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) setAccounts(await res.json());
    } catch (err) {
      console.error("Failed to load accounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function loadInstitutions() {
    try {
      const res = await fetch("/api/gocardless/institutions?country=gb");
      if (res.ok) {
        const data = await res.json();
        setInstitutions(data);
      }
    } catch (err) {
      console.error("Failed to load institutions:", err);
    }
  }

  function startPolling(requisitionId: string) {
    setPollStatus("waiting");

    // Poll every 3 seconds to check if the user completed auth on their phone
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/gocardless/requisitions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requisitionId }),
        });

        if (res.ok) {
          const data = await res.json();

          if (data.status === "LN") {
            // Linked - user completed auth on phone
            if (pollRef.current) clearInterval(pollRef.current);
            setPollStatus("linked");

            // Save the accounts from the requisition
            if (data.accounts && data.accounts.length > 0) {
              // Trigger the callback logic server-side
              await fetch(
                `/api/gocardless/callback?ref=${encodeURIComponent(
                  data.reference || ""
                )}`
              );
            }

            // Refresh accounts list
            await loadAccounts();
            setPendingRequisition(null);
          } else if (data.status === "EX" || data.status === "RJ" || data.status === "SA" || data.status === "GA") {
            // Expired, Rejected, Suspended, or Giving Access - could be transient
            if (data.status === "EX" || data.status === "RJ") {
              if (pollRef.current) clearInterval(pollRef.current);
              setPollStatus("failed");
            }
          }
          // CR (Created) or GR (Granting) means still waiting
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 3000);
  }

  async function connectBank(institutionId: string, institutionName: string, transactionTotalDays?: string) {
    setConnecting(true);
    try {
      const maxHistoricalDays = transactionTotalDays
        ? parseInt(transactionTotalDays, 10)
        : undefined;

      const res = await fetch("/api/gocardless/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId, maxHistoricalDays }),
      });
      if (res.ok) {
        const data = await res.json();

        if (connectMethod === "browser") {
          // Direct redirect in browser
          window.location.href = data.link;
        } else {
          // Show QR code and start polling
          setPendingRequisition({
            id: data.id,
            link: data.link,
            institutionId,
            institutionName,
          });
          setShowBankSelector(false);
          startPolling(data.id);
        }
      }
    } catch (err) {
      console.error("Failed to connect bank:", err);
    } finally {
      setConnecting(false);
    }
  }

  function cancelQrFlow() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPendingRequisition(null);
    setPollStatus("waiting");
  }

  async function syncAccount(accountId: string) {
    setSyncing((prev) => ({ ...prev, [accountId]: true }));
    try {
      const res = await fetch(`/api/accounts/${accountId}/sync`, {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        setSyncResults((prev) => ({ ...prev, [accountId]: result }));
      }
    } catch (err) {
      console.error("Failed to sync:", err);
    } finally {
      setSyncing((prev) => ({ ...prev, [accountId]: false }));
    }
  }

  const [editingNickname, setEditingNickname] = useState<string | null>(null);

  async function saveNickname(accountId: string, nickname: string) {
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId ? { ...a, nickname: nickname || null } : a
          )
        );
      }
    } catch (err) {
      console.error("Failed to save nickname:", err);
    }
    setEditingNickname(null);
  }

  async function saveAccountType(accountId: string, accountType: string | null) {
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType }),
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId ? { ...a, accountType } : a
          )
        );
      }
    } catch (err) {
      console.error("Failed to save account type:", err);
    }
  }

  const [syncingAll, setSyncingAll] = useState(false);

  async function syncAll() {
    if (accounts.length === 0) return;
    setSyncingAll(true);
    await Promise.all(accounts.map((account) => syncAccount(account.id)));
    await loadAccounts();
    setSyncingAll(false);
  }

  async function removeAccount(accountId: string, accountName: string) {
    const confirmed = confirm(
      `Remove "${accountName}"?\n\nThis will permanently delete the account and all its transactions. This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts((prev) => prev.filter((a) => a.id !== accountId));
        setSyncResults((prev) => {
          const next = { ...prev };
          delete next[accountId];
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to remove account:", err);
    }
  }

  function handleShowBanks() {
    setShowBankSelector(true);
    if (institutions.length === 0) {
      loadInstitutions();
    }
  }

  const filteredInstitutions = institutions.filter((inst) =>
    inst.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bank Accounts</h1>
        <div className="flex gap-2">
          {accounts.length > 0 && (
            <button
              onClick={syncAll}
              disabled={syncingAll}
              className="px-4 py-2 border border-border text-sm font-medium rounded-lg hover:bg-foreground/5 transition-colors disabled:opacity-50"
            >
              {syncingAll ? "Syncing All..." : "Sync All"}
            </button>
          )}
          <button
            onClick={handleShowBanks}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
          >
            Connect Bank
          </button>
        </div>
      </div>

      {/* Status messages */}
      {success && (
        <div className="bg-success/10 border border-success/30 text-success rounded-lg p-4 text-sm">
          Bank account connected successfully. You can now sync your transactions.
        </div>
      )}
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg p-4 text-sm">
          Failed to connect bank account. Please try again.
        </div>
      )}

      {/* QR code flow - shown when waiting for phone auth */}
      {pendingRequisition && (
        <div className="bg-card border border-border rounded-xl p-8">
          <div className="max-w-md mx-auto text-center space-y-6">
            <h2 className="text-lg font-semibold">
              Connect {pendingRequisition.institutionName}
            </h2>

            {pollStatus === "waiting" && (
              <>
                <p className="text-sm text-muted">
                  Scan this QR code with your phone to authenticate with your
                  banking app. The page will update automatically once you
                  complete the process.
                </p>

                <div className="flex justify-center p-6 bg-white rounded-xl inline-block mx-auto">
                  <QRCodeSVG
                    value={pendingRequisition.link}
                    size={200}
                    level="M"
                    marginSize={2}
                  />
                </div>

                <div className="flex items-center gap-2 justify-center text-sm text-muted">
                  <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  Waiting for you to authenticate on your phone...
                </div>

                <p className="text-xs text-muted">
                  Or{" "}
                  <a
                    href={pendingRequisition.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    open the link directly
                  </a>{" "}
                  if you prefer to authenticate in your browser.
                </p>
              </>
            )}

            {pollStatus === "linked" && (
              <div className="space-y-3">
                <div className="w-12 h-12 mx-auto bg-success/10 rounded-full flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-success">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-success font-medium">Account connected successfully!</p>
                <p className="text-sm text-muted">
                  You can now sync your transactions below.
                </p>
              </div>
            )}

            {pollStatus === "failed" && (
              <div className="space-y-3">
                <p className="text-danger font-medium">
                  Connection failed or expired.
                </p>
                <p className="text-sm text-muted">
                  Please try again. The link may have expired if you took too long.
                </p>
              </div>
            )}

            <button
              onClick={cancelQrFlow}
              className="px-4 py-2 border border-border text-sm font-medium rounded-lg hover:bg-foreground/5 transition-colors"
            >
              {pollStatus === "waiting" ? "Cancel" : "Close"}
            </button>
          </div>
        </div>
      )}

      {/* Bank selector modal */}
      {showBankSelector && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-border space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Select Your Bank</h2>
                <button
                  onClick={() => setShowBankSelector(false)}
                  className="text-muted hover:text-foreground"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Connect method toggle */}
              <div className="flex gap-1 bg-background rounded-lg p-1">
                <button
                  onClick={() => setConnectMethod("phone")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectMethod === "phone"
                      ? "bg-accent text-white"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  Phone (QR Code)
                </button>
                <button
                  onClick={() => setConnectMethod("browser")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectMethod === "browser"
                      ? "bg-accent text-white"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  Browser
                </button>
              </div>

              <p className="text-xs text-muted">
                {connectMethod === "phone"
                  ? "A QR code will appear for you to scan with your phone. Authenticate using your banking app directly."
                  : "You'll be redirected to your bank's website to authenticate in this browser."}
              </p>

              <input
                type="text"
                placeholder="Search banks..."
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {institutions.length === 0 ? (
                <p className="text-center text-muted py-8">Loading banks...</p>
              ) : filteredInstitutions.length === 0 ? (
                <p className="text-center text-muted py-8">No banks found.</p>
              ) : (
                filteredInstitutions.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => connectBank(inst.id, inst.name, inst.transaction_total_days)}
                    disabled={connecting}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-foreground/5 transition-colors text-left disabled:opacity-50"
                  >
                    <img
                      src={inst.logo}
                      alt=""
                      className="w-8 h-8 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{inst.name}</p>
                      <p className="text-xs text-muted">
                        Up to {inst.transaction_total_days} days of history
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connected accounts */}
      {loading ? (
        <p className="text-muted">Loading accounts...</p>
      ) : accounts.length === 0 && !pendingRequisition ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-muted text-lg">No bank accounts connected yet.</p>
          <p className="text-muted text-sm mt-2">
            Click &quot;Connect Bank&quot; to link your first UK bank account.
            You can scan a QR code with your phone to use your banking app directly.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupByInstitution(accounts).map((group) => (
            <div key={group.institutionId}>
              <div className="flex items-center gap-3 mb-3">
                {group.logo && (
                  <img
                    src={group.logo}
                    alt=""
                    className="w-8 h-8 rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div>
                  <h2 className="text-sm font-semibold">{group.name}</h2>
                  <p className="text-xs text-muted">
                    {group.accounts.length} account{group.accounts.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="grid gap-4">
                {group.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="bg-card border border-border rounded-xl p-6 flex items-center justify-between"
                  >
                    <div>
                      {editingNickname === account.id ? (
                        <NicknameInput
                          defaultValue={account.nickname ?? account.name ?? account.ownerName ?? ""}
                          onSave={(value) => saveNickname(account.id, value)}
                          onCancel={() => setEditingNickname(null)}
                        />
                      ) : (
                        <p
                          className="font-medium cursor-pointer hover:text-accent transition-colors"
                          onClick={() => setEditingNickname(account.id)}
                          title="Click to rename"
                        >
                          {account.nickname ?? account.name ?? account.ownerName ?? "Bank Account"}
                        </p>
                      )}
                      {account.nickname && (account.name || account.ownerName) && (
                        <p className="text-xs text-muted">
                          {account.name ?? account.ownerName}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted">Type:</span>
                        <select
                          value={account.accountType || ""}
                          onChange={(e) =>
                            saveAccountType(account.id, e.target.value || null)
                          }
                          className="text-xs text-muted bg-transparent border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                        >
                          <option value="">Current account</option>
                          <option value="credit_card">Credit card</option>
                        </select>
                      </div>
                      {account.balance != null && (
                        <p className="text-lg font-semibold mt-1">
                          {formatCurrency(account.balance, account.currency || "GBP")}
                          {account.balanceDate && (
                            <span className="text-xs font-normal text-muted ml-2">
                              as of {account.balanceDate}
                            </span>
                          )}
                        </p>
                      )}
                      {account.accountType === "credit_card" && account.creditLeft != null && (
                        <p className="text-xs text-muted">
                          {formatCurrency(account.creditLeft, account.currency || "GBP")} credit left
                        </p>
                      )}
                      <p className="text-sm text-muted mt-0.5">
                        {account.iban
                          ? `${account.iban.slice(0, 4)} •••• ${account.iban.slice(-4)}`
                          : account.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {account.lastSyncedAt
                          ? `Last synced: ${new Date(account.lastSyncedAt).toLocaleString()}`
                          : "Never synced"}
                      </p>
                      <div className="flex gap-3 mt-2">
                        {account.maxHistoricalDays != null && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            {account.maxHistoricalDays} days history
                          </span>
                        )}
                        {account.accessValidForDays != null && account.connectedAt && (
                          <AccessBadge
                            accessValidForDays={account.accessValidForDays}
                            connectedAt={account.connectedAt}
                          />
                        )}
                      </div>
                      {syncResults[account.id] && (
                        <p className="text-xs text-success mt-2">
                          Synced: {syncResults[account.id].inserted} new,{" "}
                          {syncResults[account.id].skipped} existing
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => { await syncAccount(account.id); loadAccounts(); }}
                        disabled={syncing[account.id]}
                        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        {syncing[account.id] ? "Syncing..." : "Sync"}
                      </button>
                      <button
                        onClick={() =>
                          removeAccount(
                            account.id,
                            account.nickname || account.name || account.ownerName || "this account"
                          )
                        }
                        className="px-3 py-2 border border-danger/30 text-danger text-sm font-medium rounded-lg hover:bg-danger/5 transition-colors"
                        title="Remove account and all its transactions"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface NicknameInputProps {
  defaultValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

function NicknameInput({ defaultValue, onSave, onCancel }: NicknameInputProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      onSave(value.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onSave(value.trim())}
      className="font-medium px-2 py-0.5 -ml-2 border border-accent rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-64"
      autoFocus
    />
  );
}

function AccessBadge({
  accessValidForDays,
  connectedAt,
}: {
  accessValidForDays: number;
  connectedAt: string;
}) {
  const connected = new Date(connectedAt);
  const expiresAt = new Date(connected.getTime() + accessValidForDays * 86400000);
  const now = new Date();
  const daysRemaining = Math.max(
    0,
    Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)
  );
  const isExpiringSoon = daysRemaining <= 7;
  const isExpired = daysRemaining === 0;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isExpired
          ? "bg-danger/10 text-danger"
          : isExpiringSoon
            ? "bg-amber-500/10 text-amber-600"
            : "bg-success/10 text-success"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {isExpired
        ? "Access expired"
        : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} access left`}
    </span>
  );
}
