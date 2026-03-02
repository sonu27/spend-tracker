"use client";

import { useState, useRef, useEffect } from "react";
import { derivePattern, getMerchantName, cn } from "@/lib/utils";

interface Transaction {
  id: number;
  creditorName: string | null;
  debtorName: string | null;
  merchantName: string | null;
  remittanceInfo: string | null;
  categoryId: number | null;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

type Mode = "choose" | "single" | "bulk";

interface CategorizePanelProps {
  transaction: Transaction;
  categories: Category[];
  onSingle: (txId: number, categoryId: number | null) => Promise<void>;
  onBulk: (
    categoryId: number,
    pattern: string
  ) => Promise<{ updated: number }>;
  onClose: () => void;
}

export function CategorizePanel({
  transaction,
  categories,
  onSingle,
  onBulk,
  onClose,
}: CategorizePanelProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(
    transaction.categoryId
  );
  const merchantDisplay = getMerchantName(transaction);
  // Use merchant name fields first, fall back to remittance info
  const rawSource =
    transaction.merchantName ||
    transaction.creditorName ||
    transaction.debtorName ||
    transaction.remittanceInfo ||
    "";
  const [pattern, setPattern] = useState(() =>
    rawSource ? derivePattern(rawSource) : ""
  );
  const [saving, setSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  async function handleSingle(categoryId: number | null) {
    setSaving(true);
    await onSingle(transaction.id, categoryId);
    setSaving(false);
    onClose();
  }

  async function handleBulk() {
    if (!selectedCategory || !pattern.trim()) return;
    setSaving(true);
    const result = await onBulk(selectedCategory, pattern.trim());
    setBulkResult(result.updated);
    setSaving(false);
    // Auto-close after showing result
    setTimeout(onClose, 1500);
  }

  return (
    <div
      ref={panelRef}
      className="absolute z-50 mt-1 bg-card border border-border rounded-xl shadow-lg w-80 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-background/50">
        <p className="text-sm font-medium truncate">{merchantDisplay}</p>
        {transaction.remittanceInfo &&
          transaction.remittanceInfo !== merchantDisplay && (
            <p className="text-xs text-muted truncate mt-0.5">
              {transaction.remittanceInfo}
            </p>
          )}
      </div>

      {bulkResult !== null ? (
        <div className="px-4 py-6 text-center">
          <div className="w-10 h-10 mx-auto bg-success/10 rounded-full flex items-center justify-center mb-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-success"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm font-medium">
            {bulkResult} transaction{bulkResult !== 1 ? "s" : ""} updated
          </p>
          <p className="text-xs text-muted mt-1">
            Future matching transactions will be auto-categorized.
          </p>
        </div>
      ) : mode === "choose" ? (
        <div className="p-3 space-y-1.5">
          <button
            onClick={() => setMode("single")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-accent"
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">Just this transaction</p>
              <p className="text-xs text-muted">
                Categorize only this single transaction
              </p>
            </div>
          </button>

          <button
            onClick={() => setMode("bulk")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-accent"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">All similar transactions</p>
              <p className="text-xs text-muted">
                Categorize all matching &amp; future ones too
              </p>
            </div>
          </button>
        </div>
      ) : mode === "single" ? (
        <div className="p-2 max-h-64 overflow-y-auto">
          <button
            onClick={() => handleSingle(null)}
            disabled={saving}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              transaction.categoryId === null
                ? "bg-accent/10 text-accent"
                : "hover:bg-black/5 text-muted"
            )}
          >
            Uncategorized
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleSingle(cat.id)}
              disabled={saving}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                transaction.categoryId === cat.id
                  ? "bg-accent/10 text-accent"
                  : "hover:bg-black/5"
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
            </button>
          ))}
        </div>
      ) : (
        /* bulk mode */
        <div className="p-4 space-y-4">
          {/* Pattern */}
          <div>
            <label className="block text-xs text-muted mb-1">
              Match transactions containing
            </label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-muted mt-1">
              Matches in merchant name and description
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-muted mb-1">
              Assign category
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors text-left border",
                    selectedCategory === cat.id
                      ? "border-accent bg-accent/10 text-accent font-medium"
                      : "border-transparent hover:bg-black/5"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleBulk}
              disabled={saving || !selectedCategory || !pattern.trim()}
              className="flex-1 px-3 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? "Applying..." : "Apply to all"}
            </button>
            <button
              onClick={() => setMode("choose")}
              className="px-3 py-2 border border-border text-sm rounded-lg hover:bg-black/5 transition-colors"
            >
              Back
            </button>
          </div>

          <p className="text-xs text-muted">
            This will update all existing transactions matching
            &quot;{pattern}&quot; and create a rule so future syncs are
            auto-categorized.
          </p>
        </div>
      )}
    </div>
  );
}
