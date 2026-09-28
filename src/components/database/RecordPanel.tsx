"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, ChevronDown, ChevronsRight, ChevronUp, Link as LinkIcon, Maximize2, MessageSquare, MoreHorizontal, Trash2, X } from "lucide-react";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, MentionMenu, subirArchivo, type NotionoPartialBlock } from "@/components/editor/mention";
import { isTyping } from "@/lib/shortcuts";
import { toast } from "@/components/Toast";
import { trpc } from "@/trpc/react";
import { useTheme } from "@/lib/theme";
import { Cell } from "./Cell";
import { type FieldLite } from "@/lib/cellText";
import { RelationCell } from "./RelationCell";
import { AddFieldButton, FieldTypeIcon } from "./shared";
import { Popover } from "./Popover";
import { TituloGrande } from "@/components/TituloGrande";
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
  borrarAlPie = true,
}: {
  pageId: string;
  collectionId?: string;
  record: Rec;
  fields: FieldLite[];
  /** Qué hacer cuando el registro se borra (cerrar el panel, volver a la BD…). */
  onDeleted: () => void;
  /** En el panel, borrar va en su «⋯»; como página completa, al pie. */
  borrarAlPie?: boolean;
}) {
  const utils = trpc.useUtils();
  const theme = useTheme();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  // Sin invalidar, reabrir la ficha montaba el cuerpo viejo de la caché y el
  // autosave siguiente machacaba en el servidor lo recién escrito.
  const saveContent = trpc.db.updateRecordContent.useMutation({ onSuccess: invalidate });
  const deleteRecord = trpc.db.deleteRecord.useMutation({
    onSuccess: async () => {
      await invalidate();
      onDeleted();
    },
  });
  const restoreRecord = trpc.db.restoreRecord.useMutation({ onSuccess: invalidate });

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

  // Con debounce: una mutación por tecla podía pisarse a sí misma si las
  // respuestas llegaban desordenadas (quedaba guardado un prefijo viejo).
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTitleChange = (v: string) => {
    setTitle(v);
    if (!titleField) return;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    const fieldId = titleField.id;
    titleTimer.current = setTimeout(
      () => updateCell.mutate({ recordId: record.id, fieldId, value: v || null }),
      500,
    );
  };

  return (
    <>
      <TituloGrande
        value={title}
        onChange={onTitleChange}
        onEnter={() => editor.focus()}
        readOnly={!collectionId}
        className="mb-5 text-[1.75rem] md:text-[2rem]"
      />

      <div className="ficha space-y-1">
        {propFields.map((f) => (
          // items-start: con texto envuelto la etiqueta va arriba, como en Notion
          // (centrada quedaba flotando en medio de un valor de varias líneas).
          <div key={f.id} className="grid grid-cols-[110px_1fr] items-start gap-3 md:grid-cols-[130px_1fr]">
            <span
              className="flex min-w-0 items-center gap-1.5 py-1 text-sm text-[var(--muted)]"
              title={(f.config as { description?: string } | null)?.description || undefined}
            >
              <FieldTypeIcon type={f.type} className="shrink-0" />
              <span className="truncate">{f.name}</span>
            </span>
            <div className="min-w-0 rounded px-1 py-0.5 hover:bg-[var(--hover)]">
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
                  // En la ficha el texto largo envuelve siempre, como en Notion.
                  wrap
                  rollupValue={computed?.rollups?.[record.id]?.[f.id]}
                  createdAt={record.createdAt}
                  updatedAt={record.updatedAt}
                  createdById={record.createdById}
                  updatedById={record.updatedById}
                  seq={record.seq}
                  recordId={record.id}
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

      {/* Sin confirmación: el borrado es reversible desde el propio aviso. */}
      {borrarAlPie && collectionId && (
        <button
          onClick={() => {
            deleteRecord.mutate({ id: record.id });
            toast("Fila borrada", { etiqueta: "Deshacer", onClick: () => restoreRecord.mutate({ id: record.id }) });
          }}
          className="mt-8 flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-red-500"
        >
          <Trash2 size={14} /> Borrar registro
        </button>
      )}
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
    onSuccess: () => {
      utils.db.get.invalidate({ pageId });
      toast("Plantilla guardada");
    },
  });
  const deleteRecord = trpc.db.deleteRecord.useMutation({
    onSuccess: async () => {
      await utils.db.get.invalidate({ pageId });
      onClose();
    },
  });
  const restoreRecord = trpc.db.restoreRecord.useMutation({ onSuccess: () => utils.db.get.invalidate({ pageId }) });

  // Escape cierra el panel (en window: un menú abierto dentro lo consume antes
  // con stopPropagation, y el editor puede marcarlo con defaultPrevented).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Escribiendo en un campo, Escape solo sale del campo: cerrar el panel
      // desmontaría el input SIN blur (el navegador no lo dispara al quitar el
      // nodo) y lo escrito se perdería sin commitear. Otro Escape ya cierra.
      if (isTyping(e.target)) return (e.target as HTMLElement).blur();
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
        {/* Cabecera como el «peek» de Notion: cerrar, abrir en grande y moverse
            entre filas a la izquierda; lo demás, en el «⋯» de la derecha. */}
        <div className="zona-segura-arriba sticky top-0 z-10 flex items-center gap-0.5 bg-[var(--background)] px-2 pb-1 md:px-4">
          <button
            onClick={onClose}
            className="toque flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            title="Cerrar"
            aria-label="Cerrar"
          >
            {centro ? <X size={18} /> : <ChevronsRight size={18} />}
          </button>
          {onExpand && (
            <button
              onClick={onExpand}
              className="toque flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
              title="Abrir como página completa"
              aria-label="Abrir como página completa"
            >
              <Maximize2 size={16} />
            </button>
          )}
          {nav && (
            <>
              <button
                onClick={nav.prev}
                disabled={!nav.prev}
                className="toque flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-30"
                title="Fila anterior"
                aria-label="Fila anterior"
              >
                <ChevronUp size={18} />
              </button>
              <button
                onClick={nav.next}
                disabled={!nav.next}
                className="toque flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-30"
                title="Fila siguiente"
                aria-label="Fila siguiente"
              >
                <ChevronDown size={18} />
              </button>
            </>
          )}
          <span className="flex-1" />
          <MenuFicha
            onPlantilla={
              collectionId
                ? () => {
                    const name = prompt("Nombre de la plantilla", tituloDe(record, fields) || "Plantilla");
                    if (name?.trim()) saveTemplate.mutate({ recordId: record.id, name: name.trim() });
                  }
                : undefined
            }
            onEnlace={() => {
              navigator.clipboard.writeText(`${location.origin}/p/${pageId}?r=${record.id}`);
              toast("Enlace copiado");
            }}
            onBorrar={
              collectionId
                ? () => {
                    deleteRecord.mutate({ id: record.id });
                    toast("Fila borrada", { etiqueta: "Deshacer", onClick: () => restoreRecord.mutate({ id: record.id }) });
                  }
                : undefined
            }
          />
        </div>

          <div className="px-4 pb-10 pt-2 md:px-8">
            <RecordCard pageId={pageId} collectionId={collectionId} record={record} fields={fields} onDeleted={onClose} borrarAlPie={false} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** El «⋯» de la ficha: guardar como plantilla, copiar el enlace y borrar la fila. */
function MenuFicha({ onPlantilla, onEnlace, onBorrar }: { onPlantilla?: () => void; onEnlace: () => void; onBorrar?: () => void }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]";
  const hacer = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="toque flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        title="Más acciones"
        aria-label="Más acciones"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="right-0 w-60 p-1">
          <button onClick={hacer(onEnlace)} className={item}>
            <LinkIcon size={15} /> Copiar enlace
          </button>
          {onPlantilla && (
            <button onClick={hacer(onPlantilla)} className={item} title="Las filas nuevas podrán empezar con estos valores">
              <BookmarkPlus size={15} /> Guardar como plantilla
            </button>
          )}
          {onBorrar && (
            <button onClick={hacer(onBorrar)} className={`${item} text-red-500`}>
              <Trash2 size={15} /> Borrar
            </button>
          )}
        </Popover>
      )}
    </div>
  );
}
