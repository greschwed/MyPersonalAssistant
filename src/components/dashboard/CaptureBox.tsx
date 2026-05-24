"use client";

import { useState } from "react";

type CaptureResp = {
  ok: boolean;
  capture_id?: string;
  routed_to?: string | null;
  classification?: {
    kind: string;
    urgency: string;
    key: boolean;
    title: string;
    tags: string[];
  };
  error?: string;
};

export function CaptureBox() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const resp = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data: CaptureResp = await resp.json();
      if (!resp.ok || !data.ok) {
        setFeedback(`✗ ${data.error ?? resp.statusText}`);
        return;
      }
      const c = data.classification;
      setFeedback(
        c
          ? `✓ ${c.kind} / ${c.urgency}${c.key ? " · KEY" : ""} — ${c.title}`
          : "✓ capturado",
      );
      setText("");
    } catch (err) {
      setFeedback(`✗ ${err instanceof Error ? err.message : "erro"}`);
    } finally {
      setBusy(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
      <div className="panel px-3 py-2 flex items-center gap-2 shadow-2xl">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Captura rápida — texto, ideia, tarefa, refeição… (⌘/Ctrl+Enter para enviar)"
          rows={1}
          disabled={busy}
          className="flex-1 bg-transparent resize-none outline-none text-sm py-1.5 px-2 placeholder:text-[var(--ink-3)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-md bg-[var(--accent)] text-[var(--ink-0)] px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:bg-[var(--ink-2)] disabled:text-[var(--ink-3)]"
        >
          {busy ? "…" : "Capturar"}
        </button>
      </div>
      {feedback && (
        <p className="mt-2 text-[11px] font-mono text-[var(--ink-3)] text-center">{feedback}</p>
      )}
    </div>
  );
}
