"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { format, subMonths, subDays } from "date-fns";
import { TransactionTable } from "@/components/transactions/transaction-table";
import type { Transaction, Category } from "@/components/transactions/transaction-table";

interface Account {
  id: string;
  name: string | null;
  nickname: string | null;
  ownerName: string | null;
  iban: string | null;
  institutionId: string;
  institutionName: string | null;
}

const PAGE_SIZE = 500;

const DATE_PRESETS = [
  { label: "All time", from: "", to: "" },
  { label: "Last 7 days", from: () => format(subDays(new Date(), 7), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Last 30 days", from: () => format(subDays(new Date(), 30), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Last 3 months", from: () => format(subMonths(new Date(), 3), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Last 6 months", from: () => format(subMonths(new Date(), 6), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Last year", from: () => format(subMonths(new Date(), 12), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
];

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-muted">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}

function TransactionsContent() {
  const searchParams = useSearchParams();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get("categoryId") || "");
  const [showUncategorized, setShowUncategorized] = useState(() => searchParams.get("uncategorized") === "true");
  const [page, setPage] = useState(0);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (search) params.set("search", search);
      if (filterAccount) params.set("accountId", filterAccount);
      if (filterCategory) params.set("categoryId", filterCategory);
      if (showUncategorized) params.set("uncategorized", "true");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search, filterAccount, filterCategory, showUncategorized, page]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error("Failed to load accounts:", err);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    loadAccounts();
  }, [loadCategories, loadAccounts]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, search, filterAccount, filterCategory, showUncategorized]);

  function applyPreset(preset: (typeof DATE_PRESETS)[number]) {
    setDateFrom(typeof preset.from === "function" ? preset.from() : preset.from);
    setDateTo(typeof preset.to === "function" ? preset.to() : preset.to);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      {/* Date presets */}
      <div className="flex gap-1.5 flex-wrap">
        {DATE_PRESETS.map((preset) => {
          const presetFrom = typeof preset.from === "function" ? preset.from() : preset.from;
          const isActive = dateFrom === presetFrom && (preset.from === "" || dateTo === (typeof preset.to === "function" ? preset.to() : preset.to));
          return (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                isActive
                  ? "bg-accent text-white"
                  : "bg-card border border-border text-muted hover:text-foreground"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-muted mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Account</label>
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">All</option>
            {accounts.map((acc) => {
              const bank = acc.institutionName || acc.institutionId;
              const label = acc.nickname ?? acc.name ?? acc.ownerName ?? acc.iban ?? acc.id.slice(0, 8);
              return (
                <option key={acc.id} value={acc.id}>
                  {bank} — {label}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Category</label>
          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value);
              setShowUncategorized(false);
            }}
            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">All</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Search</label>
          <input
            type="text"
            placeholder="Search merchants, descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-0.5">
          <input
            type="checkbox"
            checked={showUncategorized}
            onChange={(e) => {
              setShowUncategorized(e.target.checked);
              if (e.target.checked) setFilterCategory("");
            }}
            className="rounded"
          />
          Uncategorized only
        </label>
      </div>

      {/* Results count and pagination info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {total} transaction{total !== 1 ? "s" : ""} found
          {total > 0 && (
            <span>
              {" "}&middot; showing {showingFrom}&ndash;{showingTo}
            </span>
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-border rounded-lg text-sm hover:bg-foreground/5 transition-colors disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 border border-border rounded-lg text-sm hover:bg-foreground/5 transition-colors disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Transaction table */}
      {loading ? (
        <div className="text-center py-12 text-muted">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-muted">No transactions found for this period.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl">
          <TransactionTable
            transactions={transactions}
            categories={categories}
            onCategoryChange={loadTransactions}
          />

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-background/50">
              <p className="text-xs text-muted">
                Showing {showingFrom}&ndash;{showingTo} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 border border-border rounded-lg text-xs hover:bg-foreground/5 transition-colors disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-muted">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 border border-border rounded-lg text-xs hover:bg-foreground/5 transition-colors disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
