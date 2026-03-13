"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { useChartColors } from "@/lib/use-chart-colors";
import { format, subMonths, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
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

type Period = "daily" | "weekly" | "monthly";

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

export default function SpendingPage() {
  const chartColors = useChartColors();
  const [period, setPeriod] = useState<Period>("weekly");
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantSpending[]>([]);
  const [loading, setLoading] = useState(true);

  const getRange = useCallback(() => {
    const now = new Date();
    if (period === "daily") {
      const from = format(subWeeks(now, offset > 0 ? offset : 0), "yyyy-MM-dd");
      const to = format(now, "yyyy-MM-dd");
      // For daily, show last 14 days by default
      const daysBack = 14 * (offset + 1);
      return {
        from: format(new Date(now.getTime() - daysBack * 86400000), "yyyy-MM-dd"),
        to: format(new Date(now.getTime() - (offset * 14) * 86400000), "yyyy-MM-dd"),
        groupBy: "day",
        label: "Daily Spending",
      };
    } else if (period === "weekly") {
      const target = subWeeks(now, offset * 4);
      const weeksBack = 8;
      return {
        from: format(subWeeks(target, weeksBack), "yyyy-MM-dd"),
        to: format(target, "yyyy-MM-dd"),
        groupBy: "week",
        label: "Weekly Spending",
      };
    } else {
      const target = subMonths(now, offset * 6);
      return {
        from: format(subMonths(target, 6), "yyyy-MM-dd"),
        to: format(target, "yyyy-MM-dd"),
        groupBy: "month",
        label: "Monthly Spending",
      };
    }
  }, [period, offset]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const range = getRange();
      const [summaryRes, merchantRes] = await Promise.all([
        fetch(
          `/api/spending/summary?dateFrom=${range.from}&dateTo=${range.to}&groupBy=${range.groupBy}`
        ),
        fetch(
          `/api/spending/merchants?dateFrom=${range.from}&dateTo=${range.to}&limit=20`
        ),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (merchantRes.ok) setMerchants(await merchantRes.json());
    } catch (error) {
      console.error("Failed to load spending:", error);
    } finally {
      setLoading(false);
    }
  }, [getRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const range = getRange();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Spending</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => o + 1)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-foreground/5 transition-colors"
          >
            Older
          </button>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50"
          >
            Newer
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPeriod(p);
              setOffset(0);
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              period === p
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted">
          Loading...
        </div>
      ) : (
        <>
          {/* Average per period */}
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-sm text-muted">
              Average / {period === "monthly" ? "month" : period === "weekly" ? "week" : "day"}
            </p>
            <p className="text-3xl font-semibold mt-1">
              {formatCurrency(
                (summary?.total || 0) / Math.max(summary?.byPeriod?.length || 1, 1)
              )}
            </p>
            <p className="text-sm text-muted mt-1">
              {summary?.transactionCount || 0} transactions &middot;{" "}
              {range.from} to {range.to}
            </p>
          </div>

          {/* Bar chart */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-medium text-muted mb-4">
              Spending Over Time
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={summary?.byPeriod || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `\u00A3${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: chartColors.cardBg, borderColor: chartColors.border, borderRadius: "0.5rem" }}
                  labelStyle={{ color: chartColors.foreground }}
                  formatter={(value: number | undefined) => [
                    formatCurrency(value ?? 0),
                    "Spent",
                  ]}
                />
                <Bar dataKey="total" fill={chartColors.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Category breakdown */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-medium text-muted mb-4">
                By Category
              </h2>
              {summary?.byCategory && summary.byCategory.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={summary.byCategory}
                        dataKey="total"
                        nameKey="categoryName"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                      >
                        {summary.byCategory.map((entry, i) => (
                          <Cell key={i} fill={entry.categoryColor} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: chartColors.cardBg, borderColor: chartColors.border, borderRadius: "0.5rem" }}
                        formatter={(value: number | undefined) =>
                          formatCurrency(value ?? 0)
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-4">
                    {summary.byCategory
                      .sort((a, b) => b.total - a.total)
                      .map((cat, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: cat.categoryColor }}
                            />
                            <span>{cat.categoryName}</span>
                          </div>
                          <span className="font-medium">
                            {formatCurrency(cat.total)}
                          </span>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <p className="text-muted text-sm">No category data.</p>
              )}
            </div>

            {/* Merchant breakdown */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-medium text-muted mb-4">
                By Merchant
              </h2>
              {merchants.length > 0 ? (
                <div className="space-y-2.5">
                  {merchants.map((m, i) => {
                    const maxTotal = merchants[0]?.total || 1;
                    const pct = (m.total / maxTotal) * 100;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="truncate mr-2">{m.merchant}</span>
                          <span className="font-medium whitespace-nowrap">
                            {formatCurrency(m.total)}
                          </span>
                        </div>
                        <div className="w-full bg-border/50 rounded-full h-1.5">
                          <div
                            className="bg-accent rounded-full h-1.5 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted text-sm">No merchant data.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
