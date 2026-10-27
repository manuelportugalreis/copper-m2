"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const EMPTY_REPLY =
  "Sorry, I couldn't come up with an answer. Could you ask that another way?";
const ERROR_REPLY =
  "Sorry, something went wrong on my end. Please try again in a moment.";

/** A copy the panel can keep: a new steps array with a new object per step. */
const snapshot = (progress: Progress): Progress => ({
  ...progress,
  steps: progress.steps.map((step) => ({ ...step })),
});

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const messages = request.messages.map(({ role, content }) => ({
    role,
    content,
  }));
  const { live, update, done } = createLive<Progress>();
  let progress: Progress = { steps: [], reply: "", status: "working" };

  const send = (next: Progress) => {
    progress = next;
    update(snapshot(progress));
  };
  const setStep = (id: string, change: Partial<ToolStep>) =>
    send({
      ...progress,
      steps: progress.steps.map((step) =>
        step.type === "tool" && step.id === id ? { ...step, ...change } : step,
      ),
    });

  const run = async () => {
    // Tools off sends just the conversation: no instructions, no tools, so
    // the model answers from memory with nothing telling it to check.
    const result = request.useTools
      ? callStream(
          { module: 2, feature: "ask-copper" },
          {
            instructions: COPPER_INSTRUCTIONS,
            messages,
            tools: copperTools,
            stopWhen: stepCountIs(MAX_STEPS),
            providerOptions: THOUGHT_SUMMARIES,
          },
        )
      : callStream(
          { module: 2, feature: "ask-copper" },
          { messages, providerOptions: THOUGHT_SUMMARIES },
        );

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta": {
          const last = progress.steps.at(-1);
          const steps: Step[] =
            last?.type === "thinking"
              ? [
                  ...progress.steps.slice(0, -1),
                  { ...last, text: last.text + part.text },
                ]
              : [...progress.steps, { type: "thinking", text: part.text }];
          send({ ...progress, steps });
          break;
        }
        case "tool-input-start":
          send({
            ...progress,
            steps: [
              ...progress.steps,
              {
                type: "tool",
                id: part.id,
                name: part.toolName,
                state: "calling",
              },
            ],
          });
          break;
        case "tool-call":
          setStep(part.toolCallId, { input: part.input });
          break;
        case "tool-result":
          setStep(part.toolCallId, { output: part.output, state: "done" });
          break;
        case "tool-error":
          setStep(part.toolCallId, {
            output: errorText(part.error),
            state: "error",
          });
          break;
        case "text-delta":
          send({ ...progress, reply: progress.reply + part.text });
          break;
        case "error":
          throw part.error;
      }
    }

    done(
      snapshot({
        ...progress,
        reply: progress.reply.trim() ? progress.reply : EMPTY_REPLY,
        status: "done",
      }),
    );
  };

  // Hand the live value back straight away and read the stream behind it.
  run().catch((error: unknown) => {
    console.error("[ask-copper]", errorText(error));
    done(
      snapshot({
        ...progress,
        reply: progress.reply || ERROR_REPLY,
        status: "error",
      }),
    );
  });

  return { progress: live };
}
