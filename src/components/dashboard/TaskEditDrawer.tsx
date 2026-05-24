"use client";

import { useEffect, useRef, useState } from "react";

type Scope = "pessoal" | "trabalho";
type ScheduledTo = "hoje" | "amanha" | "esta_semana" | "este_mes" | "data_especifica";

export type EditableTask = {
  id: string;
  title: string;
  description?: string;
  scheduled_to: ScheduledTo;
  due_date: string | null;
  key: boolean;
  scope: Scope;
  project: string | null;
  tags: string[];
  completed: boolean;
};

const SCHEDULED_OPTS: { value: ScheduledTo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "amanha", label: "Amanhã" },
  { value: "esta_semana", label: "Esta semana" },
  { value: "este_mes", label: "Este mês" },
  { value: "data_especifica", label: "Data específica" },
];

const SCOPE_OPTS: { value: Scope; label: string }[] = [
  { value: "pessoal", label: "Pessoal" },
  { value: "trabalho", label: "Trabalho" },
];

type Props = {
  task: EditableTask;
  onClose(): void;
  onSaved(updated: EditableTask): void;
  onDeleted(id: string): void;
};

export function TaskEditDrawer({ task, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState<EditableTask>(task);
  const [tagsInput, setTagsInput] = useState((task.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Esc fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current && !busy) onClose();
  }

  function setScheduled(v: ScheduledTo) {
    setForm((f) => {
      const updated = { ...f, scheduled_to: v };
      // se trocou pra hoje/amanha/buckets, limpa due_date (server vai calcular)
      if (v !== "data_especifica") updated.due_date = null;
      return updated;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        title: form.title,
        description: form.description ?? "",
        scheduled_to: form.scheduled_to,
        due_date: form.scheduled_to === "data_especifica" ? form.due_date : null,
        key: form.key,
        scope: form.scope,
        project: form.project,
        tags,
        completed: form.completed,
      };
      const res = await fetch(`/api/tasks/${form.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `erro ${res.status}`);
        return;
      }
      onSaved({ ...form, tags });
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${form.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `erro ${res.status}`);
        return;
      }
      onDeleted(form.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center md:justify-end"
    >
      <div className="panel w-full md:w-[440px] md:h-[calc(100vh-2rem)] md:m-4 p-5 flex flex-col gap-4 overflow-y-auto">
        <header className="flex items-center justify-between">
          <span className="label-xs">EDITAR TAREFA</span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-[var(--ink-3)] hover:text-[var(--ink-4)] text-sm"
          >
            ✕
          </button>
        </header>

        {/* Título */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] mono text-[var(--ink-3)]">TÍTULO</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            disabled={busy}
            className="bg-[var(--ink-1)]/40 border hairline rounded px-3 py-2 text-sm outline-none focus:border-[var(--ink-3)]"
          />
        </label>

        {/* Descrição */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] mono text-[var(--ink-3)]">DESCRIÇÃO</span>
          <textarea
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            disabled={busy}
            rows={3}
            className="bg-[var(--ink-1)]/40 border hairline rounded px-3 py-2 text-sm outline-none focus:border-[var(--ink-3)] resize-none"
          />
        </label>

        {/* Scheduled_to */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] mono text-[var(--ink-3)]">AGENDADA PARA</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SCHEDULED_OPTS.map((opt) => {
              const active = form.scheduled_to === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScheduled(opt.value)}
                  disabled={busy}
                  className={`text-xs py-1.5 rounded border transition ${
                    active
                      ? "bg-[var(--ink-2)] border-[var(--ink-3)] text-[var(--ink-5)]"
                      : "hairline bg-[var(--ink-1)]/30 text-[var(--ink-4)] hover:bg-[var(--ink-1)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {form.scheduled_to === "data_especifica" && (
            <input
              type="date"
              value={form.due_date ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value || null }))}
              disabled={busy}
              className="mt-1 bg-[var(--ink-1)]/40 border hairline rounded px-3 py-2 text-sm outline-none focus:border-[var(--ink-3)]"
            />
          )}
        </div>

        {/* Scope */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] mono text-[var(--ink-3)]">ESCOPO</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SCOPE_OPTS.map((opt) => {
              const active = form.scope === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, scope: opt.value }))}
                  disabled={busy}
                  className={`text-xs py-1.5 rounded border transition ${
                    active
                      ? "bg-[var(--ink-2)] border-[var(--ink-3)] text-[var(--ink-5)]"
                      : "hairline bg-[var(--ink-1)]/30 text-[var(--ink-4)] hover:bg-[var(--ink-1)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Project */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] mono text-[var(--ink-3)]">PROJETO</span>
          <input
            value={form.project ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, project: e.target.value || null }))}
            disabled={busy}
            placeholder="ex: mevo, casa, personal-os"
            className="bg-[var(--ink-1)]/40 border hairline rounded px-3 py-2 text-sm outline-none focus:border-[var(--ink-3)]"
          />
        </label>

        {/* Tags */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] mono text-[var(--ink-3)]">TAGS (separadas por vírgula)</span>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            disabled={busy}
            placeholder="ex: contrato, urgente"
            className="bg-[var(--ink-1)]/40 border hairline rounded px-3 py-2 text-sm outline-none focus:border-[var(--ink-3)]"
          />
        </label>

        {/* KEY + Completed */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, key: !f.key }))}
            disabled={busy}
            className={`text-xs py-2 rounded border transition ${
              form.key
                ? "bg-[var(--hot)]/15 border-[var(--hot)]/40 text-[var(--hot)]"
                : "hairline bg-[var(--ink-1)]/30 text-[var(--ink-4)] hover:bg-[var(--ink-1)]"
            }`}
          >
            {form.key ? "★ KEY" : "Marcar KEY"}
          </button>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, completed: !f.completed }))}
            disabled={busy}
            className={`text-xs py-2 rounded border transition ${
              form.completed
                ? "bg-[var(--ok)]/20 border-[var(--ok)]/40 text-[var(--ok)]"
                : "hairline bg-[var(--ink-1)]/30 text-[var(--ink-4)] hover:bg-[var(--ink-1)]"
            }`}
          >
            {form.completed ? "✓ Feita" : "Marcar feita"}
          </button>
        </div>

        {error && (
          <p className="text-[11px] mono text-[var(--danger)]">{error}</p>
        )}

        <footer className="flex items-center justify-between gap-2 mt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className={`text-xs px-3 py-2 rounded border transition ${
              confirmDelete
                ? "bg-[var(--danger)]/20 border-[var(--danger)]/50 text-[var(--danger)]"
                : "hairline text-[var(--ink-3)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40"
            }`}
          >
            {confirmDelete ? "Confirmar exclusão" : "Excluir"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="text-xs px-3 py-2 rounded border hairline text-[var(--ink-3)] hover:text-[var(--ink-4)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !form.title.trim()}
              className="text-xs px-4 py-2 rounded bg-[var(--accent)] text-[var(--ink-0)] font-medium disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
