// One Ask Copper answer, drawn as stations on a rail in the order they
// happened: the tools on offer, Copper's thinking, each tool call, what it's
// doing now, then the reply (spec.md section 5).
import {
  BrainIcon,
  TriangleAlertIcon,
  WrenchIcon,
  BoxIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { ToolCard } from "@/components/copper/ask-copper-tool-card";
import {
  TOOL_LABELS,
  type Progress,
  type Step,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

const TOOL_NAMES = Object.keys(TOOL_LABELS);

/** Renders the **bold** and `code` marks that thought summaries arrive with. */
function Marked({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-foreground not-italic">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="font-mono not-italic">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function Station({
  node,
  label,
  children,
}: {
  node: ReactNode;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative pl-9">
      <span className="ring-secondary absolute top-0 left-0 flex size-6 items-center justify-center rounded-full text-white ring-4">
        {node}
      </span>
      {label && (
        <p className="text-muted-foreground pt-1 text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </p>
      )}
      {children && <div className="mt-2">{children}</div>}
    </li>
  );
}

function ToolsOnOffer({
  steps,
  useTools,
}: {
  steps: Step[];
  useTools: boolean;
}) {
  if (!useTools) {
    return (
      <Station
        node={
          <span className="bg-chart-3 flex size-6 items-center justify-center rounded-full">
            <BoxIcon className="size-3.5" />
          </span>
        }
        label="Tools given to Copper: none"
      >
        <div className="flex flex-wrap gap-1">
          {TOOL_NAMES.map((name) => (
            <span
              key={name}
              className="text-muted-foreground font-mono text-xs line-through"
            >
              {name}
            </span>
          ))}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Copper has to answer from memory alone.
        </p>
      </Station>
    );
  }
  const used = new Set(
    steps.filter((s): s is ToolStep => s.type === "tool").map((s) => s.name),
  );
  return (
    <Station
      node={
        <span className="bg-primary flex size-6 items-center justify-center rounded-full">
          <BoxIcon className="size-3.5" />
        </span>
      }
      label="Tools Copper can use"
    >
      <div className="flex flex-wrap gap-1">
        {TOOL_NAMES.map((name) => (
          <span
            key={name}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-xs",
              used.has(name)
                ? "bg-accent font-bold text-white"
                : "bg-muted-foreground/10 text-muted-foreground",
            )}
          >
            {name}
          </span>
        ))}
      </div>
    </Station>
  );
}

function nowText(progress: Progress, useTools: boolean) {
  if (progress.reply) return "Writing the answer…";
  if (!useTools) return "Answering from memory…";
  if (progress.steps.length > 0) return "Deciding what to do next…";
  return "Reading your question…";
}

function Dots() {
  return (
    <span className="bg-primary/80 flex size-6 animate-pulse items-center justify-center gap-0.5 rounded-full">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1 animate-bounce rounded-full bg-white"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function Reply({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const streaming = progress.status === "working";
  return (
    <div className="bg-background ml-9 rounded-xl rounded-tl-sm border p-3 shadow-sm">
      <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
      {!useTools && (
        <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-md border p-2 text-xs">
          <p className="flex items-center gap-1 font-semibold">
            <TriangleAlertIcon className="text-chart-3 size-3.5" />
            Answered without tools: may be made up
          </p>
          <p className="text-muted-foreground mt-1">
            With tools off, Copper can&apos;t see today&apos;s prices or stock.
            The AI only has what it learned in training, so it fills the gaps
            with guesses that sound right. That&apos;s a hallucination.
          </p>
        </div>
      )}
      <p className="whitespace-pre-wrap">
        <Marked text={progress.reply} />
        {streaming && (
          <span className="bg-primary ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom" />
        )}
      </p>
    </div>
  );
}

export function Answer({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const working = progress.status === "working";
  // Number each tool call in the order it was made.
  const toolNumbers = new Map(
    progress.steps
      .filter((s): s is ToolStep => s.type === "tool")
      .map((step, i) => [step.id, i + 1]),
  );
  const nodeTone = useTools ? "bg-primary" : "bg-chart-3";

  return (
    <div className="space-y-3">
      <ol className="relative space-y-4">
        <span
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-[11px] w-0.5 bg-gradient-to-b",
            useTools
              ? "from-primary via-accent to-accent"
              : "from-chart-3 to-chart-3",
          )}
        />
        <ToolsOnOffer steps={progress.steps} useTools={useTools} />
        {progress.steps.map((step, i) =>
          step.type === "thinking" ? (
            <Station
              key={`thinking-${i}`}
              node={
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full",
                    nodeTone,
                  )}
                >
                  <BrainIcon className="size-3.5" />
                </span>
              }
              label="Copper is thinking"
            >
              <p
                data-testid="thinking"
                className="text-muted-foreground border-l-2 pl-3 text-sm whitespace-pre-wrap italic"
              >
                <Marked text={step.text} />
              </p>
            </Station>
          ) : (
            <Station
              key={step.id}
              node={
                <span className="bg-accent flex size-6 items-center justify-center rounded-full">
                  <WrenchIcon className="size-3.5" />
                </span>
              }
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={toolNumbers.get(step.id) ?? 1} />
            </Station>
          ),
        )}
        {working && (
          <Station node={<Dots />}>
            <p className="text-muted-foreground -mt-1 text-sm">
              {nowText(progress, useTools)}
            </p>
          </Station>
        )}
      </ol>
      {(progress.reply || !working) && (
        <Reply progress={progress} useTools={useTools} />
      )}
    </div>
  );
}
