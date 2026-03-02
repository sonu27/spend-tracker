"use client";

import { useEffect, useState, useCallback } from "react";

interface CategoryRule {
  id: number;
  categoryId: number;
  pattern: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  transactionCount: number;
  rules: CategoryRule[];
}

const DEFAULT_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#84cc16", "#e11d48",
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(DEFAULT_COLORS[0]);
  const [formRules, setFormRules] = useState<{ pattern: string }[]>([]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) setCategories(await res.json());
    } catch (err) {
      console.error("Failed to load categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function resetForm() {
    setFormName("");
    setFormColor(DEFAULT_COLORS[categories.length % DEFAULT_COLORS.length]);
    setFormRules([]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(cat: Category) {
    setFormName(cat.name);
    setFormColor(cat.color);
    setFormRules(cat.rules.map((r) => ({ pattern: r.pattern })));
    setEditingId(cat.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload = {
      name: formName.trim(),
      color: formColor,
      rules: formRules.filter((r) => r.pattern.trim()),
    };

    try {
      if (editingId) {
        await fetch(`/api/categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      loadCategories();
    } catch (err) {
      console.error("Failed to save category:", err);
    }
  }

  async function deleteCategory(id: number) {
    if (!confirm("Delete this category? Transactions will become uncategorized.")) return;
    try {
      await fetch(`/api/categories/${id}`, { method: "DELETE" });
      loadCategories();
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  }

  function addRule() {
    setFormRules([...formRules, { pattern: "" }]);
  }

  function updateRule(index: number, key: string, value: string) {
    setFormRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  }

  function removeRule(index: number) {
    setFormRules((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
        >
          New Category
        </button>
      </div>

      {/* Category form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
        >
          <h2 className="text-lg font-medium">
            {editingId ? "Edit Category" : "New Category"}
          </h2>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-muted mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Groceries"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Color</label>
              <div className="flex gap-1.5">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      formColor === c ? "ring-2 ring-offset-2 ring-accent scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Auto-categorization rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted">
                Auto-categorization Rules (optional)
              </label>
              <button
                type="button"
                onClick={addRule}
                className="text-xs text-accent hover:text-accent-hover"
              >
                + Add Rule
              </button>
            </div>
            <p className="text-xs text-muted mb-2">
              Transactions matching these patterns will be automatically assigned this category when synced.
            </p>
            {formRules.map((rule, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={rule.pattern}
                  onChange={(e) => updateRule(i, "pattern", e.target.value)}
                  placeholder="matches merchant name or description..."
                  className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
                <button
                  type="button"
                  onClick={() => removeRule(i)}
                  className="px-2 text-danger hover:text-danger/80 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              {editingId ? "Save Changes" : "Create Category"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-border text-sm font-medium rounded-lg hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Category list */}
      {loading ? (
        <p className="text-muted">Loading categories...</p>
      ) : categories.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-muted text-lg">No categories yet.</p>
          <p className="text-muted text-sm mt-2">
            Create categories to organize your spending.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <div>
                  <p className="font-medium">{cat.name}</p>
                  <p className="text-xs text-muted">
                    {cat.transactionCount} transaction
                    {cat.transactionCount !== 1 ? "s" : ""}
                    {cat.rules.length > 0 && (
                      <span>
                        {" "}
                        &middot; {cat.rules.length} auto-rule
                        {cat.rules.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(cat)}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-black/5 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="px-3 py-1.5 border border-danger/30 text-danger rounded-lg text-xs font-medium hover:bg-danger/5 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
