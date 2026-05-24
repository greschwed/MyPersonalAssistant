"use client";

import { useState } from "react";

type Hit = {
  ref: string;
  chunkId: string;
  sourceType: string;
  sourceId: string;
  capture: {
    rawText: string;
    kind: string;
    urgency: string;
    key: boolean;
    createdAt: string | null;
  } | null;
};

type AskResp = {
  ok?: boolean;
  answer?: string;
  hits?: Hit[];
  error?: string;
};

export function BrainConsole() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setHits([]);
    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data: AskResp = await resp.json();
      if (!resp.ok || !data.ok) {
        setError(data.error ?? resp.statusText);
        return;
      }
      setAnswer(data.answer ?? "");
      setHits(data.hits ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ask();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="panel p-4 flex flex-col gap-3">
        <span className="label-xs">BRAIN // PERGUNTAR</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder='Ex: "o que tem na lista de mercado?", "que tarefas tenho pra hoje?", "o que eu disse sobre yoga?"'
          disabled={busy}
          className="bg-transparent resize-none outline-none text-sm placeholder:text-[var(--ink-3)] disabled:opacity-50 leading-relaxed"
        />
        <div className="flex justify-between items-center">
          <span className="text-[10px] mono text-[var(--ink-3)]">⌘/Ctrl+Enter pra enviar</span>
          <button
            type="button"
            onClick={ask}
            disabled={busy || !question.trim()}
            className="rounded-md bg-[var(--accent)] text-[var(--ink-0)] px-4 py-1.5 text-xs font-medium disabled:opacity-40 disabled:bg-[var(--ink-2)] disabled:text-[var(--ink-3)]"
          >
            {busy ? "Pensando…" : "Perguntar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="panel p-4 text-xs text-[var(--danger)] font-mono whitespace-pre-wrap">
          ✗ {error}
        </div>
      )}

      {answer !== null && (
        <div className="panel p-5 flex flex-col gap-3">
          <span className="label-xs">RESPOSTA</span>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>
      )}

      {hits.length > 0 && (
        <div className="panel p-4 flex flex-col gap-3">
          <span className="label-xs">FONTES ({hits.length})</span>
          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.chunkId} className="border-l-2 border-[var(--ink-2)] pl-3 py-1">
                <div className="flex items-center gap-2 text-[10px] mono text-[var(--ink-3)]">
                  <span className="text-[var(--accent)]">[{h.ref}]</span>
                  {h.capture && (
                    <>
                      <span>{h.capture.kind}</span>
                      <span>·</span>
                      <span>{h.capture.urgency}</span>
                      {h.capture.key && <span className="text-[var(--hot)]">· KEY</span>}
                      <span>·</span>
                      <span>{h.capture.createdAt?.slice(0, 16).replace("T", " ") ?? "?"}</span>
                    </>
                  )}
                </div>
                <p className="text-xs mt-1 text-[var(--ink-4)]">
                  {h.capture?.rawText ?? "(sem texto original)"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
