// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;
const PLAN_IDS = ["free", "copper-plus"] as const;

/** Units under this count as low stock (Product Bible Section 10). */
const LOW_STOCK_UNDER = 10;

/** Rounds to whole cents. */
const cents = (usd: number) => Math.round((usd + Number.EPSILON) * 100) / 100;

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z.array(z.enum(PRODUCT_IDS)).max(5),
  plan: z.enum(PLAN_IDS),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const deviceLines = input.products.map((id) => {
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    return { item: product.name, usd: cents(product.priceUsd) };
  });

  // Copper Plus covers the whole household, so it's counted once. The free
  // plan costs nothing and adds no line.
  const plan = getPlans().find((p) => p.id === input.plan);
  if (!plan) throw new Error(`Unknown plan: ${input.plan}`);
  const planUsd =
    input.billing === "monthly"
      ? plan.monthlyUsd * 12 * input.years
      : plan.annualUsd * input.years;
  const yearsLabel = input.years === 1 ? "1 year" : `${input.years} years`;
  const planLines =
    planUsd > 0
      ? [
          {
            item: `${plan.name}, ${input.billing}, ${yearsLabel}`,
            usd: cents(planUsd),
          },
        ]
      : [];

  const lines = [...deviceLines, ...planLines];
  return {
    lines,
    totalUsd: cents(lines.reduce((sum, line) => sum + line.usd, 0)),
  };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: z.enum(PRODUCT_IDS),
    color: z.string().trim().min(1).optional(),
  });

const sameColor = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function stockFor(units: number): Stock {
  if (units <= 0) return "backordered";
  if (units < LOW_STOCK_UNDER) return "low_stock";
  return "in_stock";
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product);
  if (!product) {
    return { status: "unavailable", message: "That isn't a Copper product." };
  }

  // A color the product doesn't come in is a catalog fact, so check it
  // before reading stock at all.
  const wanted = input.color
    ? product.colors.find((color) => sameColor(color, input.color!))
    : undefined;
  if (input.color && !wanted) {
    return {
      status: "not_a_color",
      product: product.name,
      color: input.color,
      colors: product.colors,
    };
  }

  const rows = await readInventory();
  if (!rows) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now. Please try again soon.",
    };
  }

  // Stock rows hold the product's display name, not its id.
  const colors = (wanted ? [wanted] : product.colors).flatMap((color) => {
    const row = rows.find(
      (r) => r.product === product.name && sameColor(r.color, color),
    );
    if (!row) return [];
    const stock = stockFor(row.units_in_stock);
    return [
      {
        color,
        stock,
        restockDate: stock === "backordered" ? row.next_shipment : null,
      },
    ];
  });
  return { status: "ok", product: product.name, colors };
}

/** The tools the model can call. They only read; nothing here changes data. */
export const copperTools: ToolSet = {
  get_products: tool({
    description:
      "Lists every Copper product with its type, price and the colors it comes in (not whether they are in stock).",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Gets the price of every Copper product and every plan, monthly and annual.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Works out the total cost of some devices plus a plan, billed monthly or annually, over 1 to 5 years.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Checks today's stock for a Copper product, for every color or just one, including the restock date when back-ordered.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
};
