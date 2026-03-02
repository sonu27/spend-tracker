import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { transactions } from "@/db/schema";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
        transactionCount: sql<number>`(
          SELECT count(*) FROM ${transactions}
          WHERE ${transactions.categoryId} = ${categories.id}
        )`,
      })
      .from(categories)
      .orderBy(categories.name);

    // Also fetch rules for each category
    const rules = await db.select().from(categoryRules);
    const rulesByCategory = rules.reduce(
      (acc, rule) => {
        if (!acc[rule.categoryId]) acc[rule.categoryId] = [];
        acc[rule.categoryId].push(rule);
        return acc;
      },
      {} as Record<number, typeof rules>
    );

    const result = rows.map((cat) => ({
      ...cat,
      rules: rulesByCategory[cat.id] || [],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list categories:", error);
    return NextResponse.json(
      { error: "Failed to list categories" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, color, icon, rules } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const result = await db
      .insert(categories)
      .values({
        name,
        color: color || "#6B7280",
        icon: icon || null,
      })
      .returning();

    const category = result[0];

    // Insert rules if provided
    if (rules && Array.isArray(rules)) {
      for (const rule of rules) {
        if (rule.pattern) {
          await db.insert(categoryRules).values({
            categoryId: category.id,
            pattern: rule.pattern,
          });
        }
      }
    }

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
