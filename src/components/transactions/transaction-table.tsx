"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { formatCurrency, formatDate, getMerchantName, cn } from "@/lib/utils";
import { CategorizePanel } from "@/components/transactions/categorize-panel";

export interface Transaction {
  id: number;
  bookingDate: string;
  amount: number;
  currency: string;
  creditorName: string | null;
  debtorName: string | null;
  merchantName: string | null;
  remittanceInfo: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

interface MerchantHistoryTx {
  id: number;
  bookingDate: string;
  amount: number;
  currency: string;
  creditorName: string | null;
  debtorName: string | null;
  merchantName: string | null;
  remittanceInfo: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}

interface MerchantHistory {
  transactions: MerchantHistoryTx[];
  summary: {
    count: number;
    totalAmount: number;
    avgAmount: number;
    firstDate: string | null;
    lastDate: string | null;
  };
}

const HISTORY_COLLAPSED_COUNT = 10;

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onCategoryChange: () => void;
}

export function TransactionTable({
  transactions,
  categories,
  onCategoryChange,
}: TransactionTableProps) {
  // Local copy allows optimistic updates while parent refetches
  const [localTxs, setLocalTxs] = useState(transactions);
  useEffect(() => setLocalTxs(transactions), [transactions]);

  const [editingTx, setEditingTx] = useState<number | null>(null);
  const [expandedTx, setExpandedTx] = useState<number | null>(null);
  const [merchantHistory, setMerchantHistory] = useState<MerchantHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const updateCategory = useCallback(async (txId: number, categoryId: number | null) => {
    try {
      await fetch(`/api/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      // Optimistic local update
      setLocalTxs((prev) =>
        prev.map((tx) => {
          if (tx.id === txId) {
            const cat = categories.find((c) => c.id === categoryId);
            return {
              ...tx,
              categoryId,
              categoryName: cat?.name || null,
              categoryColor: cat?.color || null,
            };
          }
          return tx;
        })
      );
      setEditingTx(null);
      onCategoryChange();
    } catch (err) {
      console.error("Failed to update category:", err);
    }
  }, [categories, onCategoryChange]);

  const bulkCategorize = useCallback(async (
    categoryId: number,
    pattern: string
  ): Promise<{ updated: number }> => {
    try {
      const res = await fetch("/api/transactions/bulk-categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, pattern, createRule: true }),
      });
      if (res.ok) {
        const data = await res.json();
        onCategoryChange();
        return data;
      }
      return { updated: 0 };
    } catch (err) {
      console.error("Failed to bulk categorize:", err);
      return { updated: 0 };
    }
  }, [onCategoryChange]);

  async function toggleMerchantHistory(tx: Transaction) {
    if (expandedTx === tx.id) {
      setExpandedTx(null);
      setMerchantHistory(null);
      return;
    }

    setExpandedTx(tx.id);
    setMerchantHistory(null);
    setHistoryLoading(true);

    try {
      const name = getMerchantName(tx);
      const params = new URLSearchParams({ name });
      const res = await fetch(`/api/transactions/merchant-history?${params}`);
      if (res.ok) {
        const data: MerchantHistory = await res.json();
        setMerchantHistory(data);
      }
    } catch (err) {
      console.error("Failed to load merchant history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-background/50">
          <th className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">
            Date
          </th>
          <th className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">
            Merchant / Description
          </th>
          <th className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">
            Category
          </th>
          <th className="text-right px-4 py-3 text-xs font-medium text-muted uppercase">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {localTxs.map((tx) => {
          const isExpanded = expandedTx === tx.id;
          return (
            <Fragment key={tx.id}>
              <tr
                onClick={() => toggleMerchantHistory(tx)}
                className={cn(
                  "border-b border-border/50 hover:bg-black/[0.02] cursor-pointer",
                  isExpanded && "bg-accent/[0.04]"
                )}
              >
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  {formatDate(tx.bookingDate)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{getMerchantName(tx)}</p>
                  {tx.remittanceInfo && tx.remittanceInfo !== getMerchantName(tx) && (
                    <p className="text-xs text-muted mt-0.5 truncate max-w-md">
                      {tx.remittanceInfo}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() =>
                      setEditingTx(editingTx === tx.id ? null : tx.id)
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                      tx.categoryName
                        ? "hover:opacity-80"
                        : "text-muted border border-dashed border-border hover:border-accent hover:text-accent"
                    )}
                    style={
                      tx.categoryColor
                        ? {
                            backgroundColor: tx.categoryColor + "20",
                            color: tx.categoryColor,
                          }
                        : undefined
                    }
                  >
                    {tx.categoryName || "+ Categorize"}
                  </button>
                  {editingTx === tx.id && (
                    <CategorizePanel
                      transaction={tx}
                      categories={categories}
                      onSingle={updateCategory}
                      onBulk={bulkCategorize}
                      onClose={() => setEditingTx(null)}
                    />
                  )}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-mono whitespace-nowrap",
                    tx.amount < 0 ? "text-foreground" : "text-success"
                  )}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {formatCurrency(tx.amount, tx.currency)}
                </td>
              </tr>
              {isExpanded && (
                <tr className="border-b border-border/50">
                  <td colSpan={4} className="px-4 py-4 bg-background/50">
                    {historyLoading ? (
                      <p className="text-sm text-muted py-2">Loading merchant history...</p>
                    ) : merchantHistory ? (
                      <MerchantHistoryPanel
                        history={merchantHistory}
                        currentTxId={tx.id}
                        currency={tx.currency}
                      />
                    ) : (
                      <p className="text-sm text-muted py-2">Failed to load history.</p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function MerchantHistoryPanel({
  history,
  currentTxId,
  currency,
}: {
  history: MerchantHistory;
  currentTxId: number;
  currency: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const { transactions: allTxs, summary } = history;

  if (allTxs.length <= 1) {
    return (
      <p className="text-sm text-muted py-1">No other payments found for this merchant.</p>
    );
  }

  const currentIdx = allTxs.findIndex((t) => t.id === currentTxId);

  let displayTxs = allTxs;
  let truncated = false;
  if (!showAll && allTxs.length > HISTORY_COLLAPSED_COUNT) {
    const half = Math.floor(HISTORY_COLLAPSED_COUNT / 2);
    let start = Math.max(0, currentIdx - half);
    let end = start + HISTORY_COLLAPSED_COUNT;
    if (end > allTxs.length) {
      end = allTxs.length;
      start = Math.max(0, end - HISTORY_COLLAPSED_COUNT);
    }
    displayTxs = allTxs.slice(start, end);
    truncated = true;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="font-medium text-foreground">
          {summary.count} payment{summary.count !== 1 ? "s" : ""}
        </span>
        <span>&middot;</span>
        <span>{formatCurrency(summary.totalAmount, currency)} total</span>
        <span>&middot;</span>
        <span>{formatCurrency(summary.avgAmount, currency)} avg</span>
        {summary.firstDate && summary.lastDate && (
          <>
            <span>&middot;</span>
            <span>{formatDate(summary.firstDate)} &rarr; {formatDate(summary.lastDate)}</span>
          </>
        )}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {displayTxs.map((htx) => {
              const isCurrent = htx.id === currentTxId;
              return (
                <tr
                  key={htx.id}
                  className={cn(
                    "border-b border-border/30 last:border-b-0",
                    isCurrent ? "bg-accent/10 font-medium" : "bg-card"
                  )}
                >
                  <td className="px-3 py-1.5 text-muted whitespace-nowrap w-28">
                    {formatDate(htx.bookingDate)}
                  </td>
                  <td className="px-3 py-1.5 truncate max-w-xs">
                    {getMerchantName(htx)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {htx.categoryName ? (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: (htx.categoryColor || "#6B7280") + "20",
                          color: htx.categoryColor || "#6B7280",
                        }}
                      >
                        {htx.categoryName}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right font-mono whitespace-nowrap",
                      htx.amount < 0 ? "text-foreground" : "text-success"
                    )}
                  >
                    {htx.amount > 0 ? "+" : ""}
                    {formatCurrency(htx.amount, htx.currency)}
                  </td>
                  <td className="px-3 py-1.5 w-6">
                    {isCurrent && (
                      <span className="text-accent" title="Current transaction">&larr;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {truncated && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
          className="text-xs text-accent hover:underline"
        >
          Show all {allTxs.length} payments
        </button>
      )}
      {showAll && allTxs.length > HISTORY_COLLAPSED_COUNT && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAll(false); }}
          className="text-xs text-accent hover:underline"
        >
          Show less
        </button>
      )}
    </div>
  );
}
