"use client";

import { useState } from "react";
import { History, X } from "lucide-react";
import { diffLineas, lineasDe } from "@/lib/diff";
import { createPortal } from "react-dom";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { editorSchema, type NotionoPartialBlock } from "@/components/editor/mention";
import { trpc } from "@/trpc/react";
import { useTheme } from "@/lib/theme";

function rel(d: Date) {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

function when(d: Date) {
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Botón de historial para la cabecera de la página. */
export function HistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="toque inline-flex items-center justify-center rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
      title="Historial de versiones"
    >
      <History size={16} />
    </button>
  );
}

/** Modal con la lista de versiones, vista previa de solo lectura y restauración. */
export function VersionHistoryModal({
  pageId,
  canEdit,
  onClose,
  onRestored,
}: {
  pageId: string;
  canEdit: boolean;
  onClose: () => void;
  onRestored: () => void | Promise<void>;
}) {
  const { data: versions } = trpc.pages.versions.list.useQuery({ pageId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verDiff, setVerDiff] = useState(false);
  const selected = versions?.find((v) => v.id === selectedId) ?? versions?.[0];
  // La versión inmediatamente anterior a la seleccionada (la lista va de nueva a vieja).
  const idx = versions?.findIndex((v) => v.id === selected?.id) ?? -1;
  const anterior = idx >= 0 ? versions?.[idx + 1] : undefined;

  const restore = trpc.pages.versions.restore.useMutation({
    onSuccess: async () => {
      await onRestored();
      onClose();
    },
  });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1 overflow-y-auto py-6">
          {!versions ? (
            <p className="px-8 text-sm text-[var(--muted)]">Cargando…</p>
          ) : selected ? (
            <>
              {anterior && (
                <div className="mb-3 flex justify-end px-8">
                  <button
                    onClick={() => setVerDiff((v) => !v)}
                    className={`rounded-md border border-[var(--border)] px-2 py-1 text-xs ${
                      verDiff ? "bg-[var(--active)] font-medium" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {verDiff ? "Ver la versión" : "Ver los cambios"}
                  </button>
                </div>
              )}
              {verDiff && anterior ? (
                <Diff key={selected.id} a={anterior.snapshot} b={selected.snapshot} />
              ) : (
                <Preview key={selected.id} content={selected.snapshot} />
              )}
            </>
          ) : (
            <p className="px-8 text-sm text-[var(--muted)]">Todavía no hay versiones de esta página.</p>
          )}
        </div>

        <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--border)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold">
              <History size={16} /> Historial de versiones
            </h2>
            <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {(versions ?? []).map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left ${
                  selected?.id === v.id ? "bg-[var(--active)] font-medium" : "hover:bg-[var(--hover)]"
                }`}
              >
                <div className="text-sm font-medium">{rel(v.createdAt)}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {when(v.createdAt)}
                  {v.author ? ` · ${v.author}` : ""}
                </div>
              </button>
            ))}
            {versions?.length === 0 && <p className="px-2 py-1 text-sm text-[var(--muted)]">Sin versiones todavía.</p>}
          </div>
          {canEdit && selected && (
            <div className="border-t border-[var(--border)] p-3">
              <button
                onClick={() => restore.mutate({ versionId: selected.id })}
                disabled={restore.isPending}
                className="w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {restore.isPending ? "Restaurando…" : "Restaurar esta versión"}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/** Qué cambió respecto a la versión anterior, línea a línea (verde entra, rojo sale). */
function Diff({ a, b }: { a: unknown; b: unknown }) {
  const lineas = diffLineas(lineasDe(a), lineasDe(b));
  if (!lineas.some((l) => l.tipo !== "igual")) {
    return <p className="px-8 text-sm text-[var(--muted)]">Sin cambios de texto respecto a la anterior.</p>;
  }
  return (
    <div className="space-y-0.5 px-8 text-sm">
      {lineas.map((l, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap rounded px-1.5 ${
            l.tipo === "mas"
              ? "bg-green-500/15"
              : l.tipo === "menos"
                ? "bg-red-500/15 line-through opacity-70"
                : "text-[var(--muted)]"
          }`}
        >
          {/* El +/− acompaña al color: legible también sin distinguirlos. */}
          <span className="mr-1 inline-block w-3 select-none text-xs text-[var(--muted)]">
            {l.tipo === "mas" ? "+" : l.tipo === "menos" ? "−" : ""}
          </span>
          {l.texto || " "}
        </div>
      ))}
    </div>
  );
}

/** Render de solo lectura de un snapshot (remontar con `key` por versión). */
function Preview({ content }: { content: unknown }) {
  const theme = useTheme();
  const blocks = content as NotionoPartialBlock[];
  const editor = useCreateBlockNote({
    dictionary: es,
    schema: editorSchema,
    initialContent: Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined,
  });
  return <BlockNoteView editor={editor} editable={false} theme={theme} />;
}
