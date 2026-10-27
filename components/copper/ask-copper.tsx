"use client";

// Module 2: the Ask Copper chat panel. A floating launcher opens a side
// sheet; each question goes to the askCopper Server Action, and its answer
// streams back step by step. Tools on and tools off are separate chats.
import { ArrowUpIcon, MessageCircleIcon } from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Answer } from "@/components/copper/ask-copper-answer";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const ASK_HASH = "#ask";

type Turn = { id: number; question: string; progress: Progress };
type Chats = { on: Turn[]; off: Turn[] };
type ChatKey = keyof Chats;

const WORKING: Progress = { steps: [], reply: "", status: "working" };
const FAILED: Progress = {
  steps: [],
  reply: "Sorry, I couldn't reach Copper just now. Please try again.",
  status: "error",
};

/** The conversation so far as plain turns: questions and finished replies. */
function historyOf(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn): ChatMessage[] =>
    turn.progress.reply
      ? [
          { role: "user", content: turn.question },
          { role: "assistant", content: turn.progress.reply },
        ]
      : [{ role: "user", content: turn.question }],
  );
}

function Starters({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      {STARTERS.map((starter) => (
        <button
          key={starter}
          type="button"
          onClick={() => onAsk(starter)}
          className="bg-background hover:border-primary hover:text-primary rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
        >
          {starter}
        </button>
      ))}
    </div>
  );
}

type ChatProps = {
  useTools: boolean;
  onToggle: (on: boolean) => void;
  chats: Chats;
  setChats: Dispatch<SetStateAction<Chats>>;
};

function Chat({ useTools, onToggle, chats, setChats }: ChatProps) {
  const [draft, setDraft] = useState("");
  const nextId = useRef(chats.on.length + chats.off.length);
  const busy = [...chats.on, ...chats.off].some(
    (turn) => turn.progress.status === "working",
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const key: ChatKey = useTools ? "on" : "off";
  const turns = chats[key];

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [chats, key]);

  const setProgress = (chat: ChatKey, id: number, progress: Progress) =>
    setChats((current) => ({
      ...current,
      [chat]: current[chat].map((turn) =>
        turn.id === id ? { ...turn, progress } : turn,
      ),
    }));

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const chat = key;
    const id = nextId.current++;
    const messages: ChatMessage[] = [
      ...historyOf(chats[chat]),
      { role: "user", content: question },
    ];
    setDraft("");
    setChats((current) => ({
      ...current,
      [chat]: [...current[chat], { id, question, progress: WORKING }],
    }));
    try {
      const { progress } = await askCopper({
        messages,
        useTools: chat === "on",
      });
      for await (const update of readLive(progress))
        setProgress(chat, id, update);
    } catch {
      setProgress(chat, id, FAILED);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <>
      <div className="bg-chart-5 -mt-px flex items-center gap-3 px-4 pb-3 text-white">
        <div className="flex flex-1 items-center gap-3 rounded-md bg-white/10 px-3 py-2">
          <div className="flex-1">
            <p className="text-sm font-medium">Use tools</p>
            <p className="text-xs text-white/70">
              {useTools ? "Checks every answer" : "Model guesses alone"}
            </p>
          </div>
          <Switch
            aria-label="Use tools"
            checked={useTools}
            onCheckedChange={onToggle}
          />
        </div>
      </div>
      <div
        ref={bodyRef}
        className="bg-secondary flex-1 space-y-6 overflow-y-auto px-4 py-4"
      >
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <p className="bg-chart-5 ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-sm text-white">
              {turn.question}
            </p>
            <Answer progress={turn.progress} useTools={useTools} />
          </div>
        ))}
        {!busy && <Starters onAsk={(question) => void ask(question)} />}
      </div>
      <form
        onSubmit={submit}
        className="bg-background flex items-center gap-2 border-t p-3"
      >
        <input
          aria-label="Your question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about prices or stock…"
          className="focus-visible:ring-ring/50 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-3"
        />
        <Button
          type="submit"
          aria-label="Send"
          size="icon"
          disabled={busy}
          className="bg-primary rounded-full"
        >
          <ArrowUpIcon />
        </Button>
      </form>
    </>
  );
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  // Kept here, not in the panel, so closing the panel keeps the conversation.
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });

  // The header's #ask link and loading the site at /#ask open the panel. A
  // repeat click on the link fires no hashchange, so listen for clicks too.
  useEffect(() => {
    const openIfAsked = () => {
      if (window.location.hash === ASK_HASH) setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (link?.getAttribute("href")?.endsWith(ASK_HASH)) setOpen(true);
    };
    const frame = requestAnimationFrame(openIfAsked);
    window.addEventListener("hashchange", openIfAsked);
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openIfAsked);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary fixed right-4 bottom-4 z-40 h-12 rounded-full px-5 shadow-lg"
      >
        <MessageCircleIcon />
        Ask Copper
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md [&>[data-slot=sheet-close]]:text-white"
        >
          <SheetHeader className="bg-chart-5 flex-row items-center gap-3 text-white">
            <span className="bg-primary flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <Image
                src="/assets/brand/copper-mascot.png"
                alt="Copper the mascot"
                width={40}
                height={40}
              />
            </span>
            <div>
              <SheetTitle className="text-white">Ask Copper</SheetTitle>
              <SheetDescription className="text-white/70">
                Prices, totals and stock, checked with tools.
              </SheetDescription>
            </div>
          </SheetHeader>
          {aiConfigured ? (
            <Chat
              useTools={useTools}
              onToggle={setUseTools}
              chats={chats}
              setChats={setChats}
            />
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
