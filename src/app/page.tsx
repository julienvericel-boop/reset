"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type ChatMode = "ASK" | "REPAIR" | "STABILIZE" | "END_CHOICE" | "ENDED";

type QuestionType =
  | "DQ_ANCHOR"
  | "DQ_INTENSITY"
  | "DQ_ONE_WORD"
  | "DQ_HEAD_BODY"
  | "DQ_LOCATION_CHOICE"
  | "RP_TIME"
  | "RP_MODALITY"
  | "ED_LABEL"
  | "ED_LOCATION"
  | "SOMATIC_QUALITY"
  | "SOMATIC_MOVEMENT"
  | "SOMATIC_SHAPE"
  | "SOMATIC_BREATH"
  | "STAG_TWO_WORDS"
  | "STAG_NEUTRAL_ZONE"
  | "STAG_CHOICE"
  | "GENERIC_ASK";

type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      mode?: ChatMode;
      meta?: { qtype?: QuestionType; endChoice?: boolean };
    };

const PAUSE_DURATION_MS = 8000;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pauseActive, setPauseActive] = useState(false);
  const [showEndChoice, setShowEndChoice] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const endPause = useCallback(() => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    setPauseActive(false);
  }, []);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, []);

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || isLoading) return;

      setInput("");
      setShowEndChoice(false);
      const newMessages: Message[] = [...messages, { role: "user", content: text }];
      setMessages(newMessages);
      setIsLoading(true);
      focusInput();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) =>
              m.role === "user"
                ? { role: m.role, content: m.content }
                : {
                    role: m.role,
                    content: m.content,
                    ...(m.mode != null && { mode: m.mode }),
                    ...(m.meta != null && { meta: m.meta }),
                  }
            ),
          }),
        });
        const data = await res.json();
        const reply = data.reply ?? "Une erreur s'est produite.";
        const mode: ChatMode = data.mode ?? "ASK";
        const meta = data.meta;
        const resetSession = data.resetSession === true;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reply, mode, ...(meta && { meta }) },
        ]);

        if (mode === "END_CHOICE" || meta?.endChoice) {
          setShowEndChoice(true);
        }

        if (mode === "ENDED" || resetSession) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last?.role === "assistant" ? [last] : [];
          });
        }

        const shouldPause = data.shouldPause === true || mode === "STABILIZE";
        if (shouldPause) {
          setPauseActive(true);
          pauseTimeoutRef.current = setTimeout(() => {
            pauseTimeoutRef.current = null;
            setPauseActive(false);
          }, PAUSE_DURATION_MS);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Une erreur s'est produite.",
            mode: "ASK",
          },
        ]);
      } finally {
        setIsLoading(false);
        focusInput();
      }
    },
    [messages, input, isLoading, focusInput]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="flex flex-col h-[100dvh] max-h-[100dvh] bg-[var(--bg)]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
      >
        {messages.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center py-8">
            Écrivez quelque chose pour commencer.
          </p>
        )}
        <ul className="space-y-4">
          {messages.map((m, i) => (
            <li
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <span
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${
                  m.role === "user"
                    ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                }`}
              >
                {m.content}
              </span>
            </li>
          ))}
          {isLoading && (
            <li className="flex justify-start">
              <span className="rounded-2xl px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] text-sm">
                …
              </span>
            </li>
          )}
        </ul>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-3 safe-area-pb">
        {pauseActive && (
          <div className="max-w-2xl mx-auto mb-2 flex items-center gap-2">
            <div
              className="h-0.5 flex-1 bg-[var(--border)] rounded-full overflow-hidden"
              role="presentation"
            >
              <div
                className="h-full w-0 bg-neutral-400 dark:bg-neutral-500 rounded-full"
                style={{ animation: "pause-progress 8s linear forwards" }}
              />
            </div>
            <button
              type="button"
              onClick={endPause}
              className="shrink-0 text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded"
            >
              Continuer
            </button>
          </div>
        )}
        {showEndChoice && (
          <div className="max-w-2xl mx-auto mb-2 flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => setShowEndChoice(false)}
              className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm hover:bg-[var(--surface)]"
            >
              Continuer
            </button>
            <button
              type="button"
              onClick={() => sendMessage("termine")}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-sm disabled:opacity-40 dark:bg-neutral-200 dark:text-neutral-900"
            >
              Terminer
            </button>
          </div>
        )}
        <div className="flex gap-2 max-w-2xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Votre message"
            rows={1}
            disabled={isLoading}
            className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[15px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
            autoFocus
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="shrink-0 self-end h-11 px-4 rounded-xl bg-neutral-800 text-white disabled:opacity-40 dark:bg-neutral-200 dark:text-neutral-900"
          >
            Envoyer
          </button>
        </div>
      </div>
    </main>
  );
}
