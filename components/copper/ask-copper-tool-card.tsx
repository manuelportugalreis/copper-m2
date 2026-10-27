// One tool call in an Ask Copper answer, drawn as a round trip: what Copper
// sent to the tool, then what the app's code sent back (spec.md section 5).
import { format, parseISO } from "date-fns";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd } from "@/lib/copper/catalog";
import { TOOL_LABELS, type ToolStep } from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

type Row = { label: string; value: string };

const NO_INPUT: Record<string, string> = {
  get_prices: "Nothing, it just asked for the price list",
  get_products: "Nothing, it just asked what Copper sells",
};

/** "copper-home" → "Copper Home", "copper-plus" → "Copper Plus". */
const titleCase = (id: string) =>
  id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function inputRows(input: unknown): Row[] {
  if (!isRecord(input)) return [];
  const rows: Row[] = [];
  if (Array.isArray(input.products)) {
    const names = input.products.map((id) => titleCase(String(id)));
    rows.push({ label: "Products", value: names.join(", ") || "None" });
  }
  if (typeof input.product === "string") {
    rows.push({ label: "Product", value: titleCase(input.product) });
  }
  if (typeof input.color === "string") {
    rows.push({ label: "Color", value: input.color });
  }
  if (typeof input.plan === "string") {
    rows.push({ label: "Plan", value: titleCase(input.plan) });
  }
  if (typeof input.billing === "string") {
    rows.push({ label: "Billing", value: input.billing });
  }
  if (typeof input.years === "number") {
    rows.push({ label: "Years", value: String(input.years) });
  }
  return rows;
}

function Sent({ step }: { step: ToolStep }) {
  if (step.input === undefined && step.state === "calling") {
    return (
      <p className="text-muted-foreground italic">filling in the details…</p>
    );
  }
  const rows = inputRows(step.input);
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground">
        {NO_INPUT[step.name] ?? "Nothing"}
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CostResult({ output }: { output: Record<string, unknown> }) {
  const lines = Array.isArray(output.lines)
    ? (output.lines as { item: string; usd: number }[])
    : [];
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <div key={line.item} className="flex justify-between gap-4">
          <span>{line.item}</span>
          <span className="tabular-nums">{formatUsd(line.usd)}</span>
        </div>
      ))}
      <div className="border-accent/30 mt-2 flex items-baseline justify-between border-t pt-2">
        <span className="font-semibold">Total</span>
        <span className="text-primary text-xl font-bold tabular-nums">
          {formatUsd(Number(output.totalUsd))}
        </span>
      </div>
    </div>
  );
}

type ProductOut = {
  id: string;
  name: string;
  type?: string;
  priceUsd: number;
  colors?: string[];
};
type PlanOut = {
  id: string;
  name: string;
  monthlyUsd: number;
  annualUsd: number;
};

function ProductsResult({ products }: { products: ProductOut[] }) {
  return (
    <div className="space-y-3">
      {products.map((product) => (
        <div key={product.id}>
          <div className="flex justify-between gap-4 font-medium">
            <span>{product.name}</span>
            <span className="tabular-nums">{formatUsd(product.priceUsd)}</span>
          </div>
          {product.type && (
            <p className="text-muted-foreground text-xs">{product.type}</p>
          )}
          {product.colors && (
            <div className="mt-1 flex flex-wrap gap-1">
              {product.colors.map((color) => (
                <span
                  key={color}
                  className="bg-accent/15 text-foreground rounded-full px-2 py-0.5 text-xs"
                >
                  {color}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PricesResult({
  products,
  plans,
}: {
  products: ProductOut[];
  plans: PlanOut[];
}) {
  const paid = plans.filter(
    (plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0,
  );
  return (
    <div className="space-y-1">
      {products.map((product) => (
        <div key={product.id} className="flex justify-between gap-4">
          <span>{product.name}</span>
          <span className="tabular-nums">{formatUsd(product.priceUsd)}</span>
        </div>
      ))}
      {paid.map((plan) => (
        <div key={plan.id} className="flex justify-between gap-4">
          <span>{plan.name}</span>
          <span className="tabular-nums">
            {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
          </span>
        </div>
      ))}
    </div>
  );
}

type ColorStock = {
  color: string;
  stock: "in_stock" | "low_stock" | "backordered";
  restockDate: string | null;
};

function stockPill({ stock, restockDate }: ColorStock) {
  if (stock === "in_stock")
    return { text: "In stock", tone: "bg-accent text-white" };
  if (stock === "low_stock")
    return { text: "Low stock", tone: "bg-chart-4 text-foreground" };
  const until = restockDate
    ? ` until ${format(parseISO(restockDate), "MMM d, yyyy")}`
    : "";
  return { text: `Back-ordered${until}`, tone: "bg-chart-3 text-white" };
}

function AvailabilityResult({ output }: { output: Record<string, unknown> }) {
  if (output.status === "not_a_color") {
    const colors = Array.isArray(output.colors) ? output.colors.join(", ") : "";
    return (
      <p>
        {String(output.product)} doesn&apos;t come in {String(output.color)}. It
        comes in {colors}.
      </p>
    );
  }
  if (output.status === "unavailable") return <p>{String(output.message)}</p>;
  const colors = Array.isArray(output.colors)
    ? (output.colors as ColorStock[])
    : [];
  return (
    <div className="space-y-1">
      <p className="font-medium">{String(output.product)}</p>
      {colors.map((entry) => {
        const pill = stockPill(entry);
        return (
          <div
            key={entry.color}
            className="flex items-center justify-between gap-4"
          >
            <span>{entry.color}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                pill.tone,
              )}
            >
              {pill.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CameBack({ step }: { step: ToolStep }) {
  if (step.state === "calling") {
    return (
      <p className="text-muted-foreground flex items-center gap-2">
        <Spinner className="size-3" /> the app is running the code…
      </p>
    );
  }
  const output = step.output;
  if (step.state === "error" || !isRecord(output)) {
    return <p>{String(output ?? "The tool didn't send anything back.")}</p>;
  }
  if (step.name === "calculate_cost") return <CostResult output={output} />;
  if (step.name === "check_availability")
    return <AvailabilityResult output={output} />;
  const products = Array.isArray(output.products)
    ? (output.products as ProductOut[])
    : [];
  if (step.name === "get_prices") {
    const plans = Array.isArray(output.plans)
      ? (output.plans as PlanOut[])
      : [];
    return <PricesResult products={products} plans={plans} />;
  }
  return <ProductsResult products={products} />;
}

export function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-background overflow-hidden rounded-lg border text-sm"
    >
      <div className="bg-accent flex items-center gap-2 px-3 py-2 text-white">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded-full bg-white/20 px-1.5 text-[10px]">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name] ?? ""}</span>
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
          <ArrowRightIcon className="size-3" /> What Copper sent
        </p>
        <Sent step={step} />
      </div>
      <div className="bg-accent/10 space-y-2 border-t px-3 py-3">
        <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
          <ArrowLeftIcon className="size-3" /> What came back
        </p>
        <CameBack step={step} />
      </div>
    </div>
  );
}
