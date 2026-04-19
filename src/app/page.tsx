"use client";

import { useEffect, useState, useCallback } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { useChartColors } from "@/lib/use-chart-colors";
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
  Legend,
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

interface CashflowSummary {
  total: number;
  transactionCount: number;
  byPeriod: { period: string; total: number; count: number }[];
  bySource: { source: string; total: number; count: number }[];
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
  const [cashflow, setCashflow] = useState<CashflowSummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory | null>(null);
  const [categoryTxs, setCategoryTxs] = useState<Transaction[]>([]);
  const [categoryTxLoading, setCategoryTxLoading] = useState(false);

  const chartColors = useChartColors();
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthRange(selectedMonth);
      const prev = monthRange(subMonths(selectedMonth, 1));

      const [summaryRes, prevRes, merchantRes, catRes, cashflowRes] = await Promise.all([
        fetch(`/api/spending/summary?dateFrom=${from}&dateTo=${to}&groupBy=day`),
        fetch(`/api/spending/summary?dateFrom=${prev.from}&dateTo=${prev.to}&groupBy=day`),
        fetch(`/api/spending/merchants?dateFrom=${from}&dateTo=${to}&limit=10`),
        fetch("/api/categories"),
        fetch(`/api/cashflow/summary?dateFrom=${from}&dateTo=${to}&groupBy=day`),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (prevRes.ok) setPrevSummary(await prevRes.json());
      if (merchantRes.ok) setMerchants(await merchantRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (cashflowRes.ok) setCashflow(await cashflowRes.json());
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

  const hasData = (summary && summary.transactionCount > 0) || (cashflow && cashflow.transactionCount > 0);
  const monthLabel = format(selectedMonth, "MMMM yyyy");

  // Compute month-over-month change
  const prevTotal = prevSummary?.total || 0;
  const currentTotal = summary?.total || 0;
  const changePercent =
    prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : null;

  const daysWithSpending = summary?.byPeriod?.length || 1;
  const dailyAvg = currentTotal / Math.max(daysWithSpending, 1);

  // Income & cash flow
  const incomeTotal = cashflow?.total || 0;
  const netCashFlow = incomeTotal - currentTotal;

  // Merge spending and income by period for combined chart
  const combinedPeriodData = (() => {
    const map = new Map<string, { period: string; spending: number; income: number }>();
    for (const s of summary?.byPeriod || []) {
      map.set(s.period, { period: s.period, spending: s.total, income: 0 });
    }
    for (const i of cashflow?.byPeriod || []) {
      const existing = map.get(i.period);
      if (existing) {
        existing.income = i.total;
      } else {
        map.set(i.period, { period: i.period, spending: 0, income: i.total });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
  })();

  async function handleCategoryClick(cat: SelectedCategory) {
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
            className="p-2 rounded-lg hover:bg-foreground/5 transition-colors text-muted hover:text-foreground"
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
            className="p-2 rounded-lg hover:bg-foreground/5 transition-colors text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
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
          <div className="grid grid-cols-5 gap-4">
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
              <p className="text-sm text-muted">Total Income</p>
              <p className="text-2xl font-semibold mt-1 text-success">
                {formatCurrency(incomeTotal)}
              </p>
              <p className="text-xs text-muted mt-1">
                {cashflow?.transactionCount || 0} transactions
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <p className="text-sm text-muted">Net Cash Flow</p>
              <p className={cn(
                "text-2xl font-semibold mt-1",
                netCashFlow >= 0 ? "text-success" : "text-danger"
              )}>
                {netCashFlow >= 0 ? "+" : ""}{formatCurrency(netCashFlow)}
              </p>
              <p className="text-xs text-muted mt-1">
                {netCashFlow >= 0 ? "surplus" : "deficit"}
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
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
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
                    contentStyle={{ backgroundColor: chartColors.cardBg, borderColor: chartColors.border, borderRadius: "0.5rem" }}
                    labelStyle={{ color: chartColors.foreground }}
                    formatter={(value: number | undefined) => [formatCurrency(value ?? 0), "Spent"]}
                    labelFormatter={(label) => {
                      try {
                        return format(new Date(String(label)), "EEE dd MMM");
                      } catch {
                        return String(label);
                      }
                    }}
                  />
                  <Bar dataKey="total" fill={chartColors.accent} radius={[4, 4, 0, 0]} />
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
                  <Tooltip
                    contentStyle={{ backgroundColor: chartColors.cardBg, borderColor: chartColors.border, borderRadius: "0.5rem" }}
                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Income vs Spending chart */}
          {combinedPeriodData.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-medium text-muted mb-4">
                Income vs Spending
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={combinedPeriodData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
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
                    contentStyle={{ backgroundColor: chartColors.cardBg, borderColor: chartColors.border, borderRadius: "0.5rem" }}
                    labelStyle={{ color: chartColors.foreground }}
                    formatter={(value: number | undefined, name?: string) => [
                      formatCurrency(value ?? 0),
                      name === "spending" ? "Spending" : "Income",
                    ]}
                    labelFormatter={(label) => {
                      try {
                        return format(new Date(String(label)), "EEE dd MMM");
                      } catch {
                        return String(label);
                      }
                    }}
                  />
                  <Legend formatter={(value) => value === "spending" ? "Spending" : "Income"} />
                  <Bar dataKey="spending" fill={chartColors.accent} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="income" fill={chartColors.success} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category transactions modal */}
          <Dialog.Root
            open={!!selectedCategory}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedCategory(null);
                setCategoryTxs([]);
              }
            }}
          >
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
              <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1100px,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] flex flex-col bg-card border border-border rounded-xl shadow-xl z-50 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:scale-95 transition-[opacity,transform] duration-150">
                {selectedCategory && (
                  <>
                    <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: selectedCategory.categoryColor }}
                        />
                        <Dialog.Title className="text-sm font-medium">
                          {selectedCategory.categoryName}
                        </Dialog.Title>
                        <span className="text-xs text-muted">
                          {selectedCategory.count} transaction{selectedCategory.count !== 1 ? "s" : ""}
                          {" "}&middot; {formatCurrency(selectedCategory.total)}
                        </span>
                      </div>
                      <Dialog.Close
                        className="p-1 rounded hover:bg-foreground/5 text-muted hover:text-foreground transition-colors"
                        aria-label="Close"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </Dialog.Close>
                    </div>
                    <div className="overflow-y-auto p-6 pt-4">
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
                            if (selectedCategory) handleCategoryClick(selectedCategory);
                          }}
                        />
                      )}
                    </div>
                  </>
                )}
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Top merchants & Income sources */}
          <div className="grid grid-cols-2 gap-6">
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

            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-medium text-muted mb-4">
                Income Sources
              </h2>
              {!cashflow?.bySource?.length ? (
                <p className="text-muted text-sm">No income data available.</p>
              ) : (
                <div className="space-y-3">
                  {cashflow.bySource.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-xs text-muted text-right">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium">{s.source}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-success">
                          {formatCurrency(s.total)}
                        </span>
                        <span className="text-xs text-muted ml-2">
                          ({s.count} txn{s.count !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
