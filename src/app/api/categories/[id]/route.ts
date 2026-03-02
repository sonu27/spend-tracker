import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const categoryId = parseInt(id);

  try {
    const body = await request.json();
    const { name, color, icon, rules } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (icon !== undefined) updates.icon = icon;

    if (Object.keys(updates).length > 0) {
      await db
        .update(categories)
        .set(updates)
        .where(eq(categories.id, categoryId));
    }

    // Replace rules if provided
    if (rules && Array.isArray(rules)) {
      await db
        .delete(categoryRules)
        .where(eq(categoryRules.categoryId, categoryId));

      for (const rule of rules) {
        if (rule.pattern) {
          await db.insert(categoryRules).values({
            categoryId,
            pattern: rule.pattern,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update category:", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const categoryId = parseInt(id);

  try {
    await db.delete(categories).where(eq(categories.id, categoryId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
