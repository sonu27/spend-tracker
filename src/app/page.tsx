"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { TransactionTable } from "@/components/transactions/transaction-table";
import type { Transaction, Category } from "@/components/transactions/transaction-table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  isSameMonth,
} from "date-fns";

interface SpendingSummary {
  total: number;
  transactionCount: number;
  byCategory: {
    categoryId: number | null;
    categoryName: string;
    categoryColor: string;
    total: number;
    count: number;
  }[];
  byPeriod: { period: string; total: number; count: number }[];
}

interface MerchantSpending {
  merchant: string;
  total: number;
  count: number;
  avgAmount: number;
}

interface SelectedCategory {
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  total: number;
  count: number;
}

function monthRange(date: Date): { from: string; to: string } {
  return {
    from: format(startOfMonth(date), "yyyy-MM-dd"),
    to: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export default function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<SpendingSummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory | null>(null);
  const [categoryTxs, setCategoryTxs] = useState<Transaction[]>([]);
  const [categoryTxLoading, setCategoryTxLoading] = useState(false);

  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthRange(selectedMonth);
      const prev = monthRange(subMonths(selectedMonth, 1));

      const [summaryRes, prevRes, merchantRes, catRes] = await Promise.all([
        fetch(`/api/spending/summary?dateFrom=${from}&dateTo=${to}&groupBy=day`),
        fetch(`/api/spending/summary?dateFrom=${prev.from}&dateTo=${prev.to}&groupBy=day`),
        fetch(`/api/spending/merchants?dateFrom=${from}&dateTo=${to}&limit=10`),
        fetch("/api/categories"),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (prevRes.ok) setPrevSummary(await prevRes.json());
      if (merchantRes.ok) setMerchants(await merchantRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (error) {
      console.error("Failed to load dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function goToPrevMonth() {
    setSelectedMonth((m) => subMonths(m, 1));
    setSelectedCategory(null);
    setCategoryTxs([]);
  }

  function goToNextMonth() {
    if (!isCurrentMonth) {
      setSelectedMonth((m) => addMonths(m, 1));
      setSelectedCategory(null);
      setCategoryTxs([]);
    }
  }

  const hasData = summary && summary.transactionCount > 0;
  const monthLabel = format(selectedMonth, "MMMM yyyy");

  // Compute month-over-month change
  const prevTotal = prevSummary?.total || 0;
  const currentTotal = summary?.total || 0;
  const changePercent =
    prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : null;

  const daysWithSpending = summary?.byPeriod?.length || 1;
  const dailyAvg = currentTotal / Math.max(daysWithSpending, 1);

  async function handleCategoryClick(cat: SelectedCategory) {
    // Toggle off if clicking the same category
    if (selectedCategory?.categoryId === cat.categoryId) {
      setSelectedCategory(null);
      setCategoryTxs([]);
      return;
    }

    setSelectedCategory(cat);
    setCategoryTxs([]);
    setCategoryTxLoading(true);

    try {
      const { from, to } = monthRange(selectedMonth);
      const params = new URLSearchParams({
        dateFrom: from,
        dateTo: to,
        limit: "100",
      });
      if (cat.categoryId !== null) {
        params.set("categoryId", String(cat.categoryId));
      } else {
        params.set("uncategorized", "true");
      }
      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCategoryTxs(data.transactions);
      }
    } catch (err) {
      console.error("Failed to load category transactions:", err);
    } finally {
      setCategoryTxLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors text-muted hover:text-foreground"
            title="Previous month"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next month"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted">Loading...</div>
      ) : !hasData ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-muted text-lg">No spending data for {monthLabel}.</p>
          <p className="text-muted text-sm mt-2">
            {isCurrentMonth
              ? "Connect a bank account and sync your transactions to see spending insights."
              : "Try navigating to a different month."}
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <p className="text-sm text-muted">Total Spending</p>
              <p className="text-2xl font-semibold mt-1">
                {formatCurrency(currentTotal)}
              </p>
              <p className="text-xs text-muted mt-1">
                {summary?.transactionCount || 0} transactions
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <p className="text-sm text-muted">vs Previous Month</p>
              {changePercent !== null ? (
                <>
                  <p className={cn(
                    "text-2xl font-semibold mt-1",
                    changePercent > 0 ? "text-danger" : changePercent < 0 ? "text-success" : "text-foreground"
                  )}>
                    {changePercent > 0 ? "+" : ""}{changePercent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {format(subMonths(selectedMonth, 1), "MMM")}: {formatCurrency(prevTotal)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold mt-1 text-muted">&mdash;</p>
                  <p className="text-xs text-muted mt-1">no previous data</p>
                </>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <p className="text-sm text-muted">Daily Average</p>
              <p className="text-2xl font-semibold mt-1">
                {formatCurrency(dailyAvg)}
              </p>
              <p className="text-xs text-muted mt-1">
                across {daysWithSpending} day{daysWithSpending !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Daily spending bar chart */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-medium text-muted mb-4">
                Daily Spending
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary?.byPeriod || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => {
                      try {
                        return format(new Date(v), "d");
                      } catch {
                        return v;
                      }
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `\u00A3${v}`} />
                  <Tooltip
                    formatter={(value: number | undefined) => [formatCurrency(value ?? 0), "Spent"]}
                    labelFormatter={(label) => {
                      try {
                        return format(new Date(String(label)), "EEE dd MMM");
                      } catch {
                        return String(label);
                      }
                    }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Category pie chart */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-medium text-muted mb-4">
                Spending by Category
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={summary?.byCategory || []}
                    dataKey="total"
                    nameKey="categoryName"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                    style={{ cursor: "pointer" }}
                  >
                    {summary?.byCategory?.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.categoryColor}
                        onClick={() => handleCategoryClick(entry)}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category transactions (inline, below charts) */}
          {selectedCategory && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedCategory.categoryColor }}
                  />
                  <h2 className="text-sm font-medium">
                    {selectedCategory.categoryName}
                  </h2>
                  <span className="text-xs text-muted">
                    {selectedCategory.count} transaction{selectedCategory.count !== 1 ? "s" : ""}
                    {" "}&middot; {formatCurrency(selectedCategory.total)}
                  </span>
                </div>
                <button
                  onClick={() => { setSelectedCategory(null); setCategoryTxs([]); }}
                  className="p-1 rounded hover:bg-black/5 text-muted hover:text-foreground transition-colors"
                  title="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {categoryTxLoading ? (
                <p className="text-sm text-muted py-4">Loading transactions...</p>
              ) : categoryTxs.length === 0 ? (
                <p className="text-sm text-muted py-4">No transactions found.</p>
              ) : (
                <TransactionTable
                  transactions={categoryTxs}
                  categories={categories}
                  onCategoryChange={() => {
                    loadData();
                    // Re-fetch the category transactions too
                    if (selectedCategory) handleCategoryClick(selectedCategory);
                  }}
                />
              )}
            </div>
          )}

          {/* Top merchants */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-medium text-muted mb-4">
              Top Merchants
            </h2>
            {merchants.length === 0 ? (
              <p className="text-muted text-sm">No merchant data available.</p>
            ) : (
              <div className="space-y-3">
                {merchants.map((m, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-xs text-muted text-right">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">{m.merchant}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        {formatCurrency(m.total)}
                      </span>
                      <span className="text-xs text-muted ml-2">
                        ({m.count} txn{m.count !== 1 ? "s" : ""})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
