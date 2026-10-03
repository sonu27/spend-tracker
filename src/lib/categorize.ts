import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { asc } from "drizzle-orm";

export interface MatchableTransaction {
  merchantName?: string | null;
  creditorName?: string | null;
  debtorName?: string | null;
  remittanceInfo?: string | null;
  merchantCategoryCode?: string | null;
}

interface RuleInput {
  categoryId: number;
  pattern: string;
}

interface CompiledRule {
  categoryId: number;
  wordCount: number;
  length: number;
  regex: RegExp;
}

/**
 * Normalise bank text so rules match regardless of punctuation and accents:
 *   "DOMINO'S PIZZA"      →  "dominos pizza"
 *   "Hotel Gótico"        →  "hotel gotico"
 *   "FORTNUM & MASON"     →  "fortnum mason"
 *   "GOOGLE*CLOUD 6NJZ32" →  "google cloud 6njz32"
 * "&" and the word "and" are dropped so "Marks and Spencer", "MARKS & SPENCER"
 * and "MARKS SPENCER" all normalise the same.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && word !== "and")
    .join(" ");
}

/**
 * Compile a rule pattern into a whole-word phrase matcher. The phrase must
 * start and end on word boundaries, so "tfl" no longer matches "netflix".
 * Trailing digits are allowed because banks glue store numbers and
 * references onto names ("ASHISHSAMPAT61", "TESCO STORE 4359").
 */
function compileRule(rule: RuleInput): CompiledRule | null {
  const phrase = normalizeText(rule.pattern);
  if (!phrase) return null;
  return {
    categoryId: rule.categoryId,
    wordCount: phrase.split(" ").length,
    length: phrase.length,
    regex: new RegExp(`(?:^| )${phrase}\\d*(?: |$)`),
  };
}

/**
 * Compile rules and order them most-specific first (more words, then longer),
 * so "uber eats" wins over "uber" regardless of which was created first.
 */
export function compileRules(rules: RuleInput[]): CompiledRule[] {
  return rules
    .map(compileRule)
    .filter((rule): rule is CompiledRule => rule !== null)
    .sort((a, b) => b.wordCount - a.wordCount || b.length - a.length);
}

function matchTargets(tx: MatchableTransaction): string[] {
  return [tx.merchantName, tx.creditorName, tx.debtorName, tx.remittanceInfo]
    .filter((text): text is string => !!text)
    .map(normalizeText);
}

export function matchesPattern(tx: MatchableTransaction, pattern: string): boolean {
  const rule = compileRule({ categoryId: 0, pattern });
  if (!rule) return false;
  return matchTargets(tx).some((target) => rule.regex.test(target));
}

/**
 * Fallback categories keyed by ISO 18245 merchant category code (MCC), used
 * when no rule matches. Only 4-digit codes are standard -- Amex sends its own
 * 3-character industry codes, which are ignored.
 */
const mccCategories: Record<string, string> = {
  // Eating out: restaurants, bars, fast food, bakeries, sweets & ice cream
  "5811": "Eating Out", "5812": "Eating Out", "5813": "Eating Out", "5814": "Eating Out",
  "5441": "Eating Out", "5451": "Eating Out", "5462": "Eating Out",
  // Groceries: supermarkets, convenience and specialist food stores
  "5411": "Groceries", "5422": "Groceries", "5499": "Groceries",
  // Transport: local transit, rail, taxis, buses, fuel, parking, tolls
  "4111": "Transport", "4112": "Transport", "4121": "Transport", "4131": "Transport",
  "4784": "Transport", "4789": "Transport", "5541": "Transport", "5542": "Transport",
  "7523": "Transport",
  // Travel: airlines, travel agents, hotels, cruises, car hire
  "4411": "Travel", "4457": "Travel", "4511": "Travel", "4722": "Travel",
  "7011": "Travel", "7512": "Travel",
  // Health & fitness: pharmacies, medical, dental, gyms, spas, beauty
  "5122": "Health & Fitness", "5912": "Health & Fitness", "7230": "Health & Fitness",
  "7297": "Health & Fitness", "7298": "Health & Fitness", "7997": "Health & Fitness",
  "8011": "Health & Fitness", "8021": "Health & Fitness", "8041": "Health & Fitness",
  "8042": "Health & Fitness", "8043": "Health & Fitness", "8049": "Health & Fitness",
  "8062": "Health & Fitness", "8099": "Health & Fitness",
  // Entertainment: cinema, theatre, attractions, sport
  "7832": "Entertainment", "7922": "Entertainment", "7929": "Entertainment",
  "7941": "Entertainment", "7991": "Entertainment", "7992": "Entertainment",
  "7996": "Entertainment", "7999": "Entertainment",
  // Shopping: department, clothing, electronics, home and general retail
  "5200": "Shopping", "5251": "Shopping", "5310": "Shopping", "5311": "Shopping",
  "5331": "Shopping", "5399": "Shopping", "5651": "Shopping", "5655": "Shopping",
  "5661": "Shopping", "5691": "Shopping", "5699": "Shopping", "5712": "Shopping",
  "5722": "Shopping", "5732": "Shopping", "5941": "Shopping", "5942": "Shopping",
  "5943": "Shopping", "5944": "Shopping", "5945": "Shopping", "5947": "Shopping",
  "5948": "Shopping", "5969": "Shopping", "5977": "Shopping", "5999": "Shopping",
  // Subscriptions: digital goods, streaming, software
  "4899": "Subscriptions", "5815": "Subscriptions", "5816": "Subscriptions",
  "5817": "Subscriptions", "5818": "Subscriptions", "5968": "Subscriptions",
  "7372": "Subscriptions",
  // Bills: telecoms and utilities
  "4814": "Bills & Utilities", "4900": "Bills & Utilities",
  // Insurance
  "5960": "Insurance", "6300": "Insurance",
  // Tax & government services
  "9211": "Tax & Government", "9222": "Tax & Government", "9311": "Tax & Government",
  "9399": "Tax & Government",
};

function mccCategoryName(code: string | null | undefined): string | null {
  if (!code || !/^\d{4}$/.test(code)) return null;
  if (mccCategories[code]) return mccCategories[code];
  const n = Number(code);
  if (n >= 3000 && n <= 3350) return "Travel"; // airlines
  if (n >= 3351 && n <= 3500) return "Travel"; // car rental
  if (n >= 3501 && n <= 3999) return "Travel"; // hotels
  return null;
}

export type CategoryMatcher = (tx: MatchableTransaction) => number | null;

export function buildCategoryMatcher(
  rules: RuleInput[],
  categoryIdsByName: Map<string, number>
): CategoryMatcher {
  const compiled = compileRules(rules);

  return (tx) => {
    // Check every rule against ALL text fields -- banks put merchant info
    // in different fields inconsistently
    const targets = matchTargets(tx);
    for (const rule of compiled) {
      if (targets.some((target) => rule.regex.test(target))) {
        return rule.categoryId;
      }
    }

    const mccName = mccCategoryName(tx.merchantCategoryCode);
    return mccName ? categoryIdsByName.get(mccName) ?? null : null;
  };
}

export async function loadCategoryMatcher(): Promise<CategoryMatcher> {
  const [rules, cats] = await Promise.all([
    db
      .select({ categoryId: categoryRules.categoryId, pattern: categoryRules.pattern })
      .from(categoryRules)
      .orderBy(asc(categoryRules.id)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
  ]);
  return buildCategoryMatcher(rules, new Map(cats.map((c) => [c.name, c.id])));
}
