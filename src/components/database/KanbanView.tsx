"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { formatNumber, OPTION_COLORS, optionsOf, type FieldLite, type Option } from "@/lib/cellText";
import { usePeople } from "./Cell";
import { RecordPanel } from "./RecordPanel";
import { ScrollHorizontal } from "./ScrollHorizontal";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const SIZES: Record<string, { col: string; card: string }> = {
  small: { col: "w-52", card: "px-2 py-1.5 text-xs" },
  medium: { col: "w-64", card: "px-3 py-2 text-sm" },
  large: { col: "w-80", card: "px-4 py-3 text-base" },
};

export function KanbanView({
  pageId,
  collectionId,
  fields,
  records,
  groupByFieldId,
  cardSize,
  cardPreview,
  openIn = "side",
  openFull,
  canReorder = false,
  sumFieldId,
  view,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  groupByFieldId?: string;
  cardSize?: string;
  cardPreview?: string;
  /** Cómo abrir la ficha (lateral/centrado/página completa). */
  openIn?: "side" | "center" | "full";
  openFull?: (recId: string) => void;
  /** Reordenar tarjetas dentro de la columna (solo sin orden activo en la vista). */
  canReorder?: boolean;
  /** Campo número cuya SUMA se enseña en la cabecera de cada columna (si no, contar). */
  sumFieldId?: string;
  view: { id: string; config: unknown };
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({ onSuccess: invalidate });
  const moveRecord = trpc.db.moveRecord.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const [dragId, setDragId] = useState<string | null>(null);
  // Soltar sobre una tarjeta coloca la arrastrada encima/debajo (orden manual).
  const [dropCard, setDropCard] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  // El clic abre la ficha; el drag es HTML5 nativo y no dispara click tras arrastrar.
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const abrir = (r: Rec) => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r));
  // «+ Añadir grupo»: crea una opción nueva del campo select/estado desde el tablero.
  const [groupName, setGroupName] = useState<string | null>(null);
  // Carriles del subagrupado plegados (solo estado de cliente, como en la Tabla).
  const [foldedLanes, setFoldedLanes] = useState<Set<string>>(new Set());
  const people = usePeople();

  // Además de Selección y Estado, el tablero puede repartirse por responsable
  // (una columna por miembro) o por una casilla (hecho / sin hacer).
  const groupable = (f: FieldLite) =>
    f.type === "select" || f.type === "status" || f.type === "person" || f.type === "checkbox";
  const groupField =
    fields.find((f) => f.id === groupByFieldId && groupable(f)) ?? fields.find(groupable);
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const size = SIZES[cardSize ?? "medium"] ?? SIZES.medium;
  const previewField = cardPreview && cardPreview !== "none" ? fields.find((f) => f.id === cardPreview) : undefined;

  if (!groupField) {
    return (
      <p className="px-2 py-6 text-[var(--muted)]">
        Añade un campo de tipo <b>Selección</b>, <b>Estado</b>, <b>Persona</b> o <b>Casilla</b> para
        usar la vista Kanban.
      </p>
    );
  }

  // Cada tipo arma sus grupos de forma distinta, pero todos son { id, label, color }.
  // Sirve para las columnas y para los carriles del subagrupado.
  const gruposDe = (f: FieldLite) =>
    f.type === "person"
      ? [
          ...[...people.entries()].map(([id, name]) => ({ id, label: name, color: "blue" })),
          { id: "", label: "Sin asignar", color: "gray" },
        ]
      : f.type === "checkbox"
        ? [
            { id: "true", label: "Hecho", color: "green" },
            { id: "", label: "Sin hacer", color: "gray" },
          ]
        : [
            ...optionsOf(f).map((o) => ({ id: o.id, label: o.label, color: o.color ?? "gray" })),
            { id: "", label: "Sin asignar", color: "gray" },
          ];

  const columns = gruposDe(groupField);

  // Columnas escondidas (view.config.hiddenGroups): sus tarjetas no se ven,
  // como en Notion; se recuperan desde «Ocultas» al final del tablero.
  const cfgV = (view.config ?? {}) as Record<string, unknown>;
  const hiddenGroups: string[] = Array.isArray(cfgV.hiddenGroups) ? (cfgV.hiddenGroups as string[]) : [];
  const setHiddenGroups = (next: string[]) => updateView.mutate({ id: view.id, config: { ...cfgV, hiddenGroups: next } });
  const visibleColumns = columns.filter((c) => !hiddenGroups.includes(c.id));
  const hiddenColumns = columns.filter((c) => hiddenGroups.includes(c.id));

  const cardTitle = (r: Rec) => {
    const v = titleField ? r.cells?.[titleField.id] : undefined;
    return (typeof v === "string" && v) || "Sin título";
  };

  /** Valor que hay que guardar al soltar una tarjeta en un grupo, según el tipo del campo. */
  function valorDeGrupo(f: FieldLite, id: string): unknown {
    if (!id) return null;
    if (f.type === "person") return [id]; // el campo Persona guarda una lista
    if (f.type === "checkbox") return true;
    return id;
  }
  const valueForColumn = (colId: string) => valorDeGrupo(groupField!, colId);

  /** ¿A qué grupo de `grupos` pertenece una fila según el campo `f`? */
  function claveDe(f: FieldLite, grupos: { id: string }[], r: Rec): string {
    const v = r.cells?.[f.id];
    const id =
      f.type === "person"
        ? Array.isArray(v) && v.length
          ? String(v[0])
          : ""
        : f.type === "checkbox"
          ? v
            ? "true"
            : ""
          : String(v ?? "");
    // Valor huérfano (opción borrada, miembro que se fue): a «Sin asignar»;
    // si no, la fila no caería en ningún grupo y desaparecería sin aviso.
    return grupos.some((c) => c.id === id) ? id : "";
  }
  const columnOf = (r: Rec) => claveDe(groupField!, columns, r);

  // Subagrupar: carriles horizontales por un segundo campo agrupable, como Notion.
  const subField = fields.find(
    (f) => f.id === cfgV.subGroupByFieldId && groupable(f) && f.id !== groupField.id,
  );
  const lanes = subField ? gruposDe(subField) : null;
  const toggleLane = (id: string) =>
    setFoldedLanes((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function drop(colId: string, laneId: string | null) {
    if (!dragId) return;
    updateCell.mutate({ recordId: dragId, fieldId: groupField!.id, value: valueForColumn(colId) });
    // Soltar dentro de un carril también adopta su valor de subgrupo.
    if (subField && lanes && laneId !== null) {
      const dragged = records.find((r) => r.id === dragId);
      if (dragged && claveDe(subField, lanes, dragged) !== laneId)
        updateCell.mutate({ recordId: dragId, fieldId: subField.id, value: valorDeGrupo(subField, laneId) });
    }
    setDragId(null);
  }

  // Mismo alta de opción que la celda (Cell.tsx): id aleatorio, color rotando y
  // grupo «todo» si el campo es de Estado.
  function addGroup() {
    const label = groupName?.trim();
    setGroupName(null);
    if (!label) return;
    const opts = optionsOf(groupField!);
    if (opts.some((o) => o.label.toLowerCase() === label.toLowerCase())) return;
    const names = Object.keys(OPTION_COLORS);
    const option: Option = {
      id: "opt_" + Math.random().toString(36).slice(2, 9),
      label,
      color: names[opts.length % names.length],
      ...(groupField!.type === "status" ? { group: "todo" } : {}),
    };
    const cfg = (groupField!.config as { options?: Option[] }) ?? {};
    updateField.mutate({ id: groupField!.id, config: { ...cfg, options: [...opts, option] } });
  }

  /** Una fila de columnas (el tablero); con subagrupado, una por carril. */
  const filaColumnas = (recs: Rec[], laneId: string | null, conExtras: boolean) => (
    <div className="flex w-max min-w-full gap-3">
      {visibleColumns.map((col) => {
        const cards = recs.filter((r) => columnOf(r) === col.id);
        return (
          <div
            key={col.id || "none"}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(col.id, laneId)}
            className={`${size.col} shrink-0 rounded-lg p-2`}
            // Tinte suave: el color de la etiqueta rebajado con el fondo del tema.
            style={{ background: `color-mix(in srgb, ${OPTION_COLORS[col.color] ?? "var(--tag-default)"} 45%, var(--background))` }}
          >
            <div className="mb-2 flex items-center justify-between gap-1 px-1 text-sm font-medium">
              <span className="min-w-0 truncate">{col.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {(() => {
                  const sumField = fields.find((f) => f.id === sumFieldId && f.type === "number");
                  if (!sumField) return <span className="text-[var(--muted)]">{cards.length}</span>;
                  const total = cards.reduce((a, r) => a + (Number(r.cells?.[sumField.id]) || 0), 0);
                  return (
                    <span className="text-[var(--muted)]" title={`${cards.length} tarjetas`}>
                      {formatNumber(total, sumField)}
                    </span>
                  );
                })()}
                <button
                  onClick={() => setHiddenGroups([...hiddenGroups, col.id])}
                  className="al-pasar toque-estrecho rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                  title="Ocultar esta columna"
                >
                  <EyeOff size={13} />
                </button>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {cards.map((r) => {
                const preview = previewField ? String(r.cells?.[previewField.id] ?? "") : "";
                return (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropCard(null);
                    }}
                    onDragOver={(e) => {
                      if (!canReorder || !dragId || dragId === r.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDropCard({ id: r.id, pos: e.clientY - rect.top < rect.height / 2 ? "before" : "after" });
                    }}
                    onDragLeave={() => setDropCard((d) => (d?.id === r.id ? null : d))}
                    onDrop={(e) => {
                      if (!canReorder || !dragId) return;
                      e.preventDefault();
                      e.stopPropagation(); // que no caiga también en el drop de la columna
                      const target = dropCard;
                      setDropCard(null);
                      if (!target || dragId === target.id) return;
                      const dragged = records.find((x) => x.id === dragId);
                      if (dragged && columnOf(dragged) !== col.id) {
                        updateCell.mutate({ recordId: dragId, fieldId: groupField!.id, value: valueForColumn(col.id) });
                      }
                      moveRecord.mutate(
                        target.pos === "before" ? { id: dragId, beforeId: target.id } : { id: dragId, afterId: target.id },
                      );
                      setDragId(null);
                    }}
                    onClick={() => abrir(r)}
                    className={`cursor-grab rounded-md border border-[var(--border)] bg-[var(--background)] ${size.card} shadow-sm hover:bg-[var(--hover)] active:cursor-grabbing ${
                      dropCard?.id === r.id
                        ? dropCard.pos === "before"
                          ? "border-t-2 border-t-brand"
                          : "border-b-2 border-b-brand"
                        : ""
                    }`}
                  >
                    <RichText texto={cardTitle(r)} />
                    {preview && (
                      <div className="mt-1 line-clamp-3 break-words rounded bg-[var(--border)]/30 px-2 py-1 text-[0.9em] text-[var(--muted)]">
                        {preview}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() =>
                addRecord.mutate({
                  collectionId,
                  // La fila nueva nace en su columna y, con carriles, también en su carril.
                  cells: {
                    ...(col.id ? { [groupField.id]: valueForColumn(col.id) } : {}),
                    ...(subField && laneId ? { [subField.id]: valorDeGrupo(subField, laneId) } : {}),
                  },
                })
              }
              className="mt-2 w-full rounded px-2 py-1 text-left text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              + Nueva
            </button>
          </div>
        );
      })}
      {conExtras && hiddenColumns.length > 0 && (
        <div className={`${size.col} shrink-0 rounded-lg border border-dashed border-[var(--border)] p-2`}>
          <div className="mb-2 px-1 text-sm font-medium text-[var(--muted)]">Ocultas</div>
          <div className="flex flex-col gap-1">
            {hiddenColumns.map((col) => (
              <button
                key={col.id || "none"}
                onClick={() => setHiddenGroups(hiddenGroups.filter((id) => id !== col.id))}
                className="toque-estrecho flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                title="Volver a mostrar"
              >
                <span className="min-w-0 truncate">{col.label}</span>
                <Eye size={13} className="shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
      {conExtras && (groupField.type === "select" || groupField.type === "status") && (
        <div className={`${size.col} shrink-0`}>
          {groupName === null ? (
            <button
              onClick={() => setGroupName("")}
              className="toque-estrecho w-full rounded-lg px-2 py-1.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              + Añadir grupo
            </button>
          ) : (
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onBlur={addGroup}
              onKeyDown={(e) => {
                if (e.key === "Enter") addGroup();
                if (e.key === "Escape") setGroupName(null);
              }}
              placeholder="Nombre del grupo…"
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
          )}
        </div>
      )}
    </div>
  );

  // Carriles no vacíos del subagrupado (uno vacío no ocupa sitio).
  const carriles =
    subField && lanes
      ? lanes
          .map((l) => ({ ...l, recs: records.filter((r) => claveDe(subField, lanes, r) === l.id) }))
          .filter((l) => l.recs.length)
      : null;

  return (
    <ScrollHorizontal className="pb-4">
      {carriles ? (
        <div className="w-max min-w-full space-y-5">
          {carriles.map((l, i) => {
            const plegado = foldedLanes.has(l.id);
            return (
              <div key={l.id || "none"}>
                <button
                  onClick={() => toggleLane(l.id)}
                  className="toque-estrecho mb-1.5 flex items-center gap-1.5 text-sm font-medium"
                  title={plegado ? "Desplegar el carril" : "Plegar el carril"}
                >
                  {plegado ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ background: OPTION_COLORS[l.color] ?? "var(--tag-default)", color: "var(--tag-fg)" }}
                  >
                    {l.label}
                  </span>
                  <span className="text-xs font-normal text-[var(--muted)]">{l.recs.length}</span>
                </button>
                {!plegado && filaColumnas(l.recs, l.id, i === 0)}
              </div>
            );
          })}
        </div>
      ) : (
        filaColumnas(records, null, true)
      )}

      {openRec &&
        (() => {
          const fresh = records.find((r) => r.id === openRec.id) ?? openRec;
          return (
            <RecordPanel
              key={fresh.id}
              pageId={pageId}
              collectionId={collectionId}
              record={fresh}
              fields={fields}
              onClose={() => setOpenRec(null)}
              mode={openIn === "center" ? "center" : "side"}
              onExpand={openFull ? () => openFull(fresh.id) : undefined}
            />
          );
        })()}
    </ScrollHorizontal>
  );
}
