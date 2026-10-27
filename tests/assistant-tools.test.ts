// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryRow } from "@/lib/copper/inventory";

let rows: InventoryRow[] | null = null;
vi.mock("@/lib/copper/inventory", () => ({
  readInventory: async () => structuredClone(rows),
}));

const {
  calculateCost,
  calculateCostInput,
  checkAvailability,
  checkAvailabilityInput,
  copperTools,
} = await import("@/lib/copper/assistant/tools");

const row = (
  product: string,
  color: string,
  units: number,
  next = "2026-12-01",
): InventoryRow => ({
  sku: `${product}-${color}`,
  product,
  color,
  units_in_stock: units,
  next_shipment: next,
});

beforeEach(() => {
  rows = [
    row("Copper Home", "Polished Copper", 10),
    row("Copper Home", "Patina Teal", 9),
    row("Copper Home", "Night Sky", 0, "2026-11-20"),
  ];
});

describe("calculate_cost", () => {
  const cost = (input: unknown) =>
    calculateCost(calculateCostInput.parse(input));

  it("counts Copper Plus once for the whole household", () => {
    const result = cost({
      products: ["copper-home", "copper-home"],
      plan: "copper-plus",
      billing: "annual",
      years: 2,
    });
    expect(result.lines.map((l) => l.usd)).toEqual([149, 149, 158]);
    expect(result.totalUsd).toBe(456);
  });

  it("adds no line for the free plan", () => {
    const result = cost({
      products: ["copper-notes"],
      plan: "free",
      billing: "annual",
      years: 5,
    });
    expect(result.lines).toEqual([{ item: "Copper Notes", usd: 129 }]);
    expect(result.totalUsd).toBe(129);
  });

  it("rounds monthly billing to cents", () => {
    // 7.99 x 12 x 3 = 287.64
    expect(
      cost({ products: [], plan: "copper-plus", billing: "monthly", years: 3 })
        .totalUsd,
    ).toBe(287.64);
  });

  it("accepts the edges of the contract and nothing past them", () => {
    const ok = {
      products: Array(5).fill("copper-notes"),
      plan: "free",
      billing: "annual",
      years: 5,
    };
    expect(calculateCostInput.safeParse(ok).success).toBe(true);
    expect(calculateCostInput.safeParse({ ...ok, years: "2" }).success).toBe(
      false,
    );
    expect(
      calculateCostInput.safeParse({ ...ok, products: undefined }).success,
    ).toBe(false);
  });
});

describe("check_availability", () => {
  it("draws the stock lines at 0, under 10, and 10 or more", async () => {
    expect(await checkAvailability({ product: "copper-home" })).toEqual({
      status: "ok",
      product: "Copper Home",
      colors: [
        { color: "Polished Copper", stock: "in_stock", restockDate: null },
        { color: "Patina Teal", stock: "low_stock", restockDate: null },
        { color: "Night Sky", stock: "backordered", restockDate: "2026-11-20" },
      ],
    });
  });

  it("leaves out a color with no stock row, and is still ok", async () => {
    rows = [row("Copper Home", "Night Sky", 50)];
    const result = await checkAvailability({ product: "copper-home" });
    expect(result).toEqual({
      status: "ok",
      product: "Copper Home",
      colors: [{ color: "Night Sky", stock: "in_stock", restockDate: null }],
    });
  });

  it("says not_a_color before it tries to read stock", async () => {
    rows = null;
    const result = await checkAvailability({
      product: "copper-home",
      color: "  desert sand ",
    });
    expect(result).toMatchObject({
      status: "not_a_color",
      color: "  desert sand ",
    });
  });

  it("rejects an empty color", () => {
    expect(
      checkAvailabilityInput.safeParse({ product: "copper-home", color: " " })
        .success,
    ).toBe(false);
  });
});

describe("copperTools", () => {
  it("runs calculate_cost through its execute", async () => {
    const execute = copperTools.calculate_cost.execute!;
    const result = await execute(
      {
        products: ["copper-home"],
        plan: "copper-plus",
        billing: "annual",
        years: 2,
      },
      { toolCallId: "t1", messages: [] },
    );
    expect(result).toMatchObject({ totalUsd: 307 });
  });
});
