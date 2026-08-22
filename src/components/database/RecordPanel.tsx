"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Maximize2, MessageSquare, Trash2, X } from "lucide-react";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, MentionMenu, subirArchivo, type NotionoPartialBlock } from "@/components/editor/mention";
import { confirmar } from "@/components/Confirmar";
import { trpc } from "@/trpc/react";
import { useTheme } from "@/lib/theme";
import { Cell } from "./Cell";
import { type FieldLite } from "@/lib/cellText";
import { RelationCell } from "./RelationCell";
import { AddFieldButton } from "./shared";
import { CommentThread } from "@/components/CommentsPanel";

type Rec = {
  id: string;
  cells: Record<string, unknown>;
  order: string;
  content?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdById?: string | null;
  updatedById?: string | null;
  seq?: number;
};

/** El primer campo de texto hace de título de la fila, como en la Tabla. */
const tituloDe = (record: Rec, fields: FieldLite[]) => {
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const v = titleField ? record.cells?.[titleField.id] : undefined;
  return typeof v === "string" ? v : "";
};

/**
 * El interior de la ficha de una fila: título + propiedades + cuerpo de bloques +
 * borrar. Lo comparten el panel (peek) y la fila abierta como página completa.
 */
export function RecordCard({
  pageId,
  collectionId,
  record,
  fields,
  onDeleted,
}: {
  pageId: string;
  collectionId?: string;
  record: Rec;
  fields: FieldLite[];
  /** Qué hacer cuando el registro se borra (cerrar el panel, volver a la BD…). */
  onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const theme = useTheme();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const saveContent = trpc.db.updateRecordContent.useMutation();
  const deleteRecord = trpc.db.deleteRecord.useMutation({
    onSuccess: async () => {
      await invalidate();
      onDeleted();
    },
  });

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const [title, setTitle] = useState(tituloDe(record, fields));
  const propFields = fields.filter((f) => f.id !== titleField?.id);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useMemo<NotionoPartialBlock[] | undefined>(() => {
    const c = record.content as NotionoPartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);
  const editor = useCreateBlockNote({ dictionary: es, schema: editorSchema, initialContent: initial, uploadFile: subirArchivo });

  const onBodyChange = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveContent.mutate({ id: record.id, content: editor.document }), 800);
  };

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (titleField) updateCell.mutate({ recordId: record.id, fieldId: titleField.id, value: v || null });
  };

  return (
    <>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Sin título"
        className="font-display mb-5 w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-3xl"
      />

      <div className="space-y-2">
        {propFields.map((f) => (
          <div key={f.id} className="grid grid-cols-[110px_1fr] items-center gap-3 md:grid-cols-[130px_1fr]">
            <span
              className="truncate text-sm text-[var(--muted)]"
              title={(f.config as { description?: string } | null)?.description || undefined}
            >
              {f.name}
            </span>
            <div className="min-w-0 rounded px-1 hover:bg-[var(--border)]/20">
              {f.type === "relation" ? (
                <RelationCell
                  field={f}
                  value={record.cells?.[f.id]}
                  onCommit={(value) => updateCell.mutate({ recordId: record.id, fieldId: f.id, value })}
                />
              ) : (
                <Cell
                  field={f}
                  value={record.cells?.[f.id]}
                  rollupValue={computed?.rollups?.[record.id]?.[f.id]}
                  createdAt={record.createdAt}
                  updatedAt={record.updatedAt}
                  createdById={record.createdById}
                  updatedById={record.updatedById}
                  seq={record.seq}
                  onCommit={(value) => updateCell.mutate({ recordId: record.id, fieldId: f.id, value })}
                />
              )}
            </div>
          </div>
        ))}
        {collectionId && (
          <div className="grid grid-cols-[110px_1fr] items-center gap-3 md:grid-cols-[130px_1fr]">
            <span className="text-sm text-[var(--muted)]">
              <AddFieldButton collectionId={collectionId} fields={fields} onDone={invalidate} />
            </span>
            <span />
          </div>
        )}
      </div>

      {/* Comentarios de la fila, entre las propiedades y el cuerpo, como en Notion. */}
      <div className="mt-5 border-t border-[var(--border)] pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
          <MessageSquare size={13} /> Comentarios
        </div>
        <CommentThread pageId={pageId} recordId={record.id} />
      </div>

      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <BlockNoteView editor={editor} onChange={onBodyChange} theme={theme}>
          <MentionMenu editor={editor} pageId={pageId} />
        </BlockNoteView>
      </div>

      <button
        onClick={async () => {
          if (await confirmar("¿Borrar este registro?")) deleteRecord.mutate({ id: record.id });
        }}
        className="mt-8 flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-red-500"
      >
        <Trash2 size={14} /> Borrar registro
      </button>
    </>
  );
}

export function RecordPanel({
  pageId,
  collectionId,
  record,
  fields,
  onClose,
  nav,
  mode = "side",
  onExpand,
}: {
  pageId: string;
  collectionId?: string;
  record: Rec;
  fields: FieldLite[];
  onClose: () => void;
  /** Navegación anterior/siguiente entre las filas de la vista; undefined = sin flecha. */
  nav?: { prev?: () => void; next?: () => void };
  /** Peek lateral (por defecto) o modal centrado, como el «Open pages in» de Notion. */
  mode?: "side" | "center";
  /** Abrir la fila como página completa (botón de expandir en la cabecera). */
  onExpand?: () => void;
}) {
  const utils = trpc.useUtils();
  const saveTemplate = trpc.db.saveTemplate.useMutation({
    onSuccess: () => utils.db.get.invalidate({ pageId }),
  });

  // Escape cierra el panel (en window: un menú abierto dentro lo consume antes
  // con stopPropagation, y el editor puede marcarlo con defaultPrevented).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Ancho del peek, arrastrando su borde izquierdo (solo ratón, como el tirador
  // del sidebar); persiste en local: es ergonomía del dispositivo, no
  // configuración compartida de la vista.
  const [ancho, setAncho] = useState(576);
  useEffect(() => {
    const v = Number(localStorage.getItem("notiono.peek-width"));
    if (v >= 360 && v <= 900) setAncho(v);
  }, []);
  const empezarArrastre = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = ancho;
    const clamp = (n: number) => Math.min(900, Math.max(360, n));
    const move = (ev: MouseEvent) => setAncho(clamp(w0 - (ev.clientX - x0)));
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      localStorage.setItem("notiono.peek-width", String(clamp(w0 - (ev.clientX - x0))));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up, { once: true });
  };

  const centro = mode === "center";
  return (
    <div
      className={`fixed inset-0 z-40 flex bg-black/20 ${centro ? "items-center justify-center p-4" : "justify-end"}`}
      onClick={onClose}
    >
      <div
        className={`relative bg-[var(--background)] shadow-2xl ${
          centro
            ? "w-full max-w-2xl rounded-xl border border-[var(--border)]"
            : "h-dvh border-l border-[var(--border)]"
        }`}
        style={centro ? undefined : { width: ancho, maxWidth: "100vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tirador de ancho: cosa de ratón, escondido en táctil a propósito. */}
        {!centro && (
          <span
            onMouseDown={empezarArrastre}
            className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize hover:bg-brand/40 md:block"
            title="Arrastra para ajustar el ancho"
          />
        )}
        <div className={centro ? "max-h-[90dvh] overflow-y-auto rounded-xl" : "h-full overflow-y-auto"}>
        <div className="zona-segura-arriba flex items-center justify-between px-4 md:px-8">
          <button
            onClick={() => {
              const name = prompt("Nombre de la plantilla", tituloDe(record, fields) || "Plantilla");
              if (name?.trim()) saveTemplate.mutate({ recordId: record.id, name: name.trim() });
            }}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            title="Guardar estos valores como plantilla de fila"
          >
            Guardar como plantilla
          </button>
          <div className="flex items-center gap-1">
            {onExpand && (
              <button
                onClick={onExpand}
                className="toque-estrecho rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Abrir como página completa"
              >
                <Maximize2 size={15} />
              </button>
            )}
            {nav && (
              <>
                <button
                  onClick={nav.prev}
                  disabled={!nav.prev}
                  className="toque-estrecho rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                  title="Fila anterior"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={nav.next}
                  disabled={!nav.next}
                  className="toque-estrecho rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                  title="Fila siguiente"
                >
                  <ChevronDown size={16} />
                </button>
              </>
            )}
            <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar"><X size={16} /></button>
          </div>
        </div>

          <div className="px-4 pb-10 pt-2 md:px-8">
            <RecordCard pageId={pageId} collectionId={collectionId} record={record} fields={fields} onDeleted={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
}
