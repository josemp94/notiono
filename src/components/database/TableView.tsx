"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, ChevronDown, ChevronRight, Copy, EyeOff, Filter as FilterIcon, GripVertical, Info, Maximize2, Plus, Star, Trash2, X } from "lucide-react";
import { confirmar } from "@/components/Confirmar";
import { trpc } from "@/trpc/react";
import { Cell, usePeople } from "./Cell";
import { frozenOffsets, FROZEN_WIDTH, GUTTER_WIDTH, groupBy, NUMBER_FORMATS, OPTION_COLORS, optionsOf, rowColor, type FieldLite } from "@/lib/cellText";
import { CALC_OPTS, computeCalc } from "@/lib/calc";
import { colorByRules, opsFor, wrapOf, type DbField, type DbRecord, type Sort } from "@/lib/viewData";
import { FILTER_MENU_EVENT, type FilterMenuDetail } from "@/lib/shortcuts";
import { FIELD_LABELS, AddFieldButton } from "./shared";
import { Popover } from "./Popover";
import { RelationCell } from "./RelationCell";
import { RecordPanel } from "./RecordPanel";

export type RowTemplate = { id: string; name: string; cells: Record<string, unknown>; porDefecto?: boolean };

type Rec = {
  id: string;
  cells: Record<string, unknown>;
  order: string;
  parentId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdById?: string | null;
  updatedById?: string | null;
  seq?: number;
};

export function TableView({
  pageId,
  collectionId,
  fields,
  records,
  view,
  templates = [],
  openIn = "side",
  openFull,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  view: { id: string; config: unknown };
  templates?: RowTemplate[];
  /** Cómo abrir la ficha (lateral/centrado/página completa). */
  openIn?: "side" | "center" | "full";
  openFull?: (recId: string) => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });

  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const addSubRecord = trpc.db.addSubRecord.useMutation({ onSuccess: invalidate });
  const deleteRecord = trpc.db.deleteRecord.useMutation({ onSuccess: invalidate });
  const restoreRecord = trpc.db.restoreRecord.useMutation({
    onSuccess: () => {
      setDeleted(null);
      invalidate();
    },
  });
  const duplicateRecord = trpc.db.duplicateRecord.useMutation({ onSuccess: invalidate });
  const moveRecord = trpc.db.moveRecord.useMutation({ onSuccess: invalidate });
  const deleteTemplate = trpc.db.deleteTemplate.useMutation({ onSuccess: invalidate });
  const setDefaultTemplate = trpc.db.setDefaultTemplate.useMutation({ onSuccess: invalidate });
  const deleteField = trpc.db.deleteField.useMutation({ onSuccess: invalidate });
  const duplicateField = trpc.db.duplicateField.useMutation({ onSuccess: invalidate });
  const addField = trpc.db.addField.useMutation({ onSuccess: invalidate });
  const moveField = trpc.db.moveField.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({ onSuccess: invalidate });
  const setFieldType = trpc.db.setFieldType.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });

  const [menuField, setMenuField] = useState<string | null>(null);
  const [newMenu, setNewMenu] = useState(false);
  // Borrar una fila es reversible: se guarda cuál fue para poder deshacerlo.
  const [deleted, setDeleted] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  // Ancho de columna: se arrastra en local y se guarda en la vista al soltar.
  const [drag, setDrag] = useState<{ fieldId: string; startX: number; startW: number; w: number } | null>(null);
  // Arrastre de filas: solo con el orden natural (sin orden ni agrupación activos).
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropRow, setDropRow] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  // Arrastre de columnas: la cabecera es el asa; mitad izquierda/derecha decide el lado.
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const abrir = (r: Rec) => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r));
  // Selección múltiple de filas: checkbox por fila + barra de acciones en lote.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // El filtrado y el orden se aplican en Database (barra de herramientas superior).
  // Sub-elementos: los hijos se agrupan indentados bajo su padre si el padre pasa el
  // filtro; si no, se muestran a nivel raíz. El plegado vive solo en el cliente.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set());
  const people = usePeople();
  const idSet = new Set(records.map((r) => r.id));
  const byParent = new Map<string, Rec[]>();
  for (const r of records) {
    const key = r.parentId && idSet.has(r.parentId) ? r.parentId : "";
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const rows: { rec: Rec; depth: number; hasChildren: boolean }[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const r of byParent.get(parentId) ?? []) {
      const hasChildren = byParent.has(r.id);
      rows.push({ rec: r, depth, hasChildren });
      if (hasChildren && !collapsed.has(r.id)) walk(r.id, depth + 1);
    }
  };
  walk("", 0);
  const [rowLimit, setRowLimit] = useState(80);
  const moreRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting) setRowLimit((n) => n + 120); },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, rowLimit]);
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addSub = (parentRecordId: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      next.delete(parentRecordId);
      return next;
    });
    addSubRecord.mutate({ parentRecordId });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (view.config ?? {}) as any;
  const calcs: Record<string, string> = cfg.calcs ?? {};
  const setCalc = (fieldId: string, calc: string) =>
    updateView.mutate({ id: view.id, config: { ...cfg, calcs: { ...calcs, [fieldId]: calc } } });

  const widths: Record<string, number> = cfg.widths ?? {};

  const widthOf = (fieldId: string) =>
    drag?.fieldId === fieldId ? drag.w : widths[fieldId];

  // Columnas congeladas: las N primeras se quedan fijas al desplazar en horizontal.
  // Por defecto una, como en Notion (la que identifica la fila).
  const frozen: number = Math.max(0, Math.min(fields.length, cfg.frozen ?? 1));
  const setFrozen = (n: number) => updateView.mutate({ id: view.id, config: { ...cfg, frozen: n } });
  const lefts = frozenOffsets(fields.map((f) => widthOf(f.id)), frozen, GUTTER_WIDTH);
  // El margen se fuerza a ese mismo ancho en TODAS sus celdas: es el punto de
  // partida del que cuelgan las congeladas.
  const margen = { width: GUTTER_WIDTH, minWidth: GUTTER_WIDTH, maxWidth: GUTTER_WIDTH };
  // Una columna congelada necesita ancho fijo; si no se le ha puesto, se le supone uno.
  const anchoDe = (i: number) => (lefts[i] !== null ? (widthOf(fields[i].id) ?? FROZEN_WIDTH) : widthOf(fields[i].id));

  // El arrastre se sigue en window para que no se pierda al salir de la cabecera.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag({ ...d, w: Math.max(80, Math.round(d.startW + (e.clientX - d.startX))) });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d) updateView.mutate({ id: view.id, config: { ...cfg, widths: { ...widths, [d.fieldId]: d.w } } });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // Solo debe re-suscribirse al empezar o terminar el arrastre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.fieldId]);

  // Agrupar en secciones plegables. Como en Notion, agrupar aplana la jerarquía de
  // subtareas: cada fila cae en el grupo de su propio valor, sin sangría.
  const groupField = fields.find((f) => f.id === cfg.groupByFieldId);
  const canReorder = !groupField && !(cfg.sorts?.length > 0);
  const colorField = fields.find((f) => f.id === cfg.rowColorFieldId);
  // Primero las reglas («si vence hoy, en rojo»); si ninguna casa, el color de la etiqueta.
  const colorOf = (r: Rec) =>
    colorByRules(r as unknown as DbRecord, fields as unknown as DbField[], cfg.colorRules) ??
    rowColor(colorField, r.cells);
  const groups = groupBy(records, groupField, people);
  // Segundo nivel: solo tiene sentido si ya hay un primero y es otro campo.
  const subGroupField =
    groupField && cfg.subGroupByFieldId !== groupField.id
      ? fields.find((f) => f.id === cfg.subGroupByFieldId)
      : undefined;
  const hasCalcs = fields.some((f) => calcs[f.id]);
  // Envolver texto: por columna (wrapCols), con el ajuste por vista como default.
  const setWrapCol = (fieldId: string, v: boolean) =>
    updateView.mutate({ id: view.id, config: { ...cfg, wrapCols: { ...(cfg.wrapCols ?? {}), [fieldId]: v } } });

  // Se ignoran ids que ya no están (filtrados o borrados) sin tener que podar el estado.
  const selectedIds = [...selected].filter((id) => idSet.has(id));
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // ponytail: en lote = Promise.all sobre los endpoints de a uno; con miles de filas haría falta un endpoint bulk.
  const bulkDelete = async () => {
    await Promise.all(selectedIds.map((id) => deleteRecord.mutateAsync({ id })));
    setSelected(new Set());
  };
  const bulkSet = (fieldId: string, value: unknown) =>
    selectedIds.forEach((id) => updateCell.mutate({ recordId: id, fieldId, value }));

  /** Una fila de la tabla; `depth`/`hasChildren` solo se usan sin agrupar (árbol de subtareas). */
  const renderRow = ({ rec: r, depth, hasChildren }: { rec: Rec; depth: number; hasChildren: boolean }) => (
    <tr
      key={r.id}
      style={colorOf(r) ? { background: colorOf(r) } : undefined}
      className={`group border-b border-[var(--border)] hover:bg-[var(--border)]/20 ${
        dropRow?.id === r.id
          ? dropRow.pos === "before"
            ? "border-t-2 border-t-brand"
            : "border-b-2 border-b-brand"
          : ""
      }`}
      onDragOver={(e) => {
        if (!canReorder || !dragRow || dragRow === r.id) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropRow({ id: r.id, pos: e.clientY - rect.top < rect.height / 2 ? "before" : "after" });
      }}
      onDragLeave={() => setDropRow((d) => (d?.id === r.id ? null : d))}
      onDrop={(e) => {
        e.preventDefault();
        const target = dropRow;
        setDropRow(null);
        if (!canReorder || !dragRow || !target || dragRow === target.id) return;
        moveRecord.mutate(
          target.pos === "before" ? { id: dragRow, beforeId: target.id } : { id: dragRow, afterId: target.id },
        );
        setDragRow(null);
      }}
    >
      <td
        className="sticky left-0 z-10 py-1.5 text-center"
        style={{ ...margen, background: colorOf(r) ?? "var(--background)" }}
      >
        {/* Con selección activa el margen es solo checkboxes, como en Notion. */}
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => toggleSelect(r.id)}
            className={`${selected.size ? "" : "al-pasar"} size-3.5 shrink-0 cursor-pointer accent-[var(--color-brand,#ff5c28)]`}
            title="Seleccionar fila"
          />
          {canReorder && !selected.size && (
            <span
              draggable
              onDragStart={(e) => {
                setDragRow(r.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragRow(null);
                setDropRow(null);
              }}
              className="cursor-grab text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100"
              title="Arrastra para reordenar"
            >
              <GripVertical size={13} />
            </span>
          )}
        </div>
      </td>
      {fields.map((f, i) => {
        const cell =
          f.type === "relation" ? (
            <RelationCell
              field={f}
              value={r.cells?.[f.id]}
              onCommit={(value) => updateCell.mutate({ recordId: r.id, fieldId: f.id, value })}
            />
          ) : f.type === "rollup" || f.type === "formula" ? (
            <Cell field={f} value={null} rollupValue={computed?.rollups?.[r.id]?.[f.id]} onCommit={() => {}} />
          ) : (
            <Cell
              field={f}
              value={r.cells?.[f.id]}
              wrap={wrapOf(cfg, f.id)}
              createdAt={r.createdAt}
              updatedAt={r.updatedAt}
              createdById={r.createdById}
              updatedById={r.updatedById}
              seq={r.seq}
              onCommit={(value) => updateCell.mutate({ recordId: r.id, fieldId: f.id, value })}
            />
          );
        const w = anchoDe(i);
        const left = lefts[i];
        // Las congeladas llevan fondo propio, o se transparentarían sobre lo que pasa por debajo.
        const style = {
          ...(w ? { maxWidth: w, width: w } : {}),
          ...(left === null ? {} : { left, background: colorOf(r) ?? "var(--background)" }),
        };
        if (i !== 0)
          return (
            <td
              key={f.id}
              className={`px-2 py-1.5 ${wrapOf(cfg, f.id) ? "align-top" : "overflow-hidden"} ${left === null ? "" : "sticky z-10"}`}
              style={style}
            >
              {cell}
            </td>
          );
        // La primera columna además lleva el árbol de subtareas.
        return (
          <td
            key={f.id}
            className={`px-2 py-1.5 ${wrapOf(cfg, f.id) ? "align-top" : "overflow-hidden"} ${left === null ? "" : "sticky z-10"}`}
            style={style}
          >
            <div className="flex items-center" style={{ paddingLeft: depth * 20 }}>
              {hasChildren ? (
                <button
                  onClick={() => toggle(r.id)}
                  className="flex w-4 shrink-0 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)]"
                  title={collapsed.has(r.id) ? "Expandir subtareas" : "Plegar subtareas"}
                >
                  {collapsed.has(r.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">{cell}</div>
              {/* ABRIR al pasar el ratón por la celda del título, como en Notion. */}
              <button
                onClick={() => abrir(r)}
                className="al-pasar ml-1 flex shrink-0 items-center gap-1 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] shadow-sm hover:text-[var(--foreground)]"
              >
                <Maximize2 size={11} /> ABRIR
              </button>
            </div>
          </td>
        );
      })}
      <td className="whitespace-nowrap px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => addSub(r.id)}
            className="text-[var(--muted)] al-pasar hover:text-[var(--foreground)]"
            title="Añadir subtarea"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              deleteRecord.mutate({ id: r.id });
              setDeleted(r.id);
            }}
            className="text-[var(--muted)] al-pasar hover:text-red-500"
            title="Borrar fila"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-left text-[var(--muted)]">
            <th className="group sticky left-0 z-20 bg-[var(--background)] text-center" style={margen}>
              <input
                type="checkbox"
                checked={records.length > 0 && selectedIds.length === records.length}
                onChange={() =>
                  setSelected(selectedIds.length === records.length ? new Set() : new Set(records.map((r) => r.id)))
                }
                className={`${selected.size ? "" : "al-pasar"} size-3.5 cursor-pointer accent-[var(--color-brand,#ff5c28)]`}
                title="Seleccionar todo"
              />
            </th>
            {fields.map((f, i) => (
              <th
                key={f.id}
                className={`group relative px-2 py-1 font-medium ${anchoDe(i) ? "" : "min-w-40"} ${
                  lefts[i] === null ? "" : "sticky z-20 bg-[var(--background)]"
                } ${
                  dropCol?.id === f.id
                    ? dropCol.pos === "before"
                      ? "border-l-2 border-l-brand"
                      : "border-r-2 border-r-brand"
                    : ""
                }`}
                style={{
                  ...(anchoDe(i) ? { width: anchoDe(i), minWidth: anchoDe(i), maxWidth: anchoDe(i) } : {}),
                  ...(lefts[i] === null ? {} : { left: lefts[i] }),
                }}
                onDragOver={(e) => {
                  if (!dragCol || dragCol === f.id) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropCol({ id: f.id, pos: e.clientX - rect.left < rect.width / 2 ? "before" : "after" });
                }}
                onDragLeave={() => setDropCol((d) => (d?.id === f.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  const target = dropCol;
                  setDropCol(null);
                  if (!dragCol || !target || dragCol === target.id) return;
                  moveField.mutate(
                    target.pos === "before" ? { id: dragCol, beforeId: target.id } : { id: dragCol, afterId: target.id },
                  );
                  setDragCol(null);
                }}
              >
                {/* Toda la cabecera abre el menú de la columna, como en Notion, y
                    arrastrándola se reordena (el drag HTML5 no dispara el click). */}
                <button
                  draggable
                  onDragStart={(e) => {
                    setDragCol(f.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragCol(null);
                    setDropCol(null);
                  }}
                  onClick={() => setMenuField(menuField === f.id ? null : f.id)}
                  className="flex w-full min-w-0 cursor-pointer items-center gap-1 text-left"
                  title={
                    (f.config as { description?: string })?.description ||
                    "Opciones de la columna · arrastra para reordenar"
                  }
                >
                  <span className="truncate">{f.name}</span>
                  {(f.config as { description?: string })?.description && (
                    <Info size={12} className="shrink-0 text-[var(--muted)]" />
                  )}
                  <span className="shrink-0 text-[10px] uppercase opacity-50">{FIELD_LABELS[f.type] ?? f.type}</span>
                </button>
                {/* Tirador para ajustar el ancho (doble clic vuelve al automático). */}
                <span
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const th = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setDrag({ fieldId: f.id, startX: e.clientX, startW: th.width, w: th.width });
                  }}
                  onDoubleClick={() => {
                    const next = { ...widths };
                    delete next[f.id];
                    updateView.mutate({ id: view.id, config: { ...cfg, widths: next } });
                  }}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-brand/40 group-hover:opacity-100"
                  title="Arrastra para ajustar el ancho"
                />
                {menuField === f.id && (
                  <FieldMenu
                    field={f}
                    onClose={() => setMenuField(null)}
                    onRename={(name) => updateField.mutate({ id: f.id, name })}
                    frozen={i < frozen}
                    onFreeze={() => { setFrozen(i < frozen ? i : i + 1); setMenuField(null); }}
                    wrap={wrapOf(cfg, f.id)}
                    onWrap={(v) => setWrapCol(f.id, v)}
                    onSort={(dir) => {
                      const sorts: Sort[] = Array.isArray(cfg.sorts) ? cfg.sorts : [];
                      const idx = sorts.findIndex((s) => s.fieldId === f.id);
                      const ns = idx >= 0 ? sorts.map((s, j) => (j === idx ? { ...s, dir } : s)) : [...sorts, { fieldId: f.id, dir }];
                      updateView.mutate({ id: view.id, config: { ...cfg, sorts: ns } });
                      setMenuField(null);
                    }}
                    onFilter={() => {
                      const filters = Array.isArray(cfg.filters) ? cfg.filters : [];
                      updateView.mutate({
                        id: view.id,
                        config: { ...cfg, filters: [...filters, { fieldId: f.id, op: opsFor(f.type)[0].value, value: "" }] },
                      });
                      setMenuField(null);
                      window.dispatchEvent(
                        new CustomEvent<FilterMenuDetail>(FILTER_MENU_EVENT, { detail: { collectionId } }),
                      );
                    }}
                    onHide={() => {
                      const hidden: string[] = Array.isArray(cfg.hiddenFields) ? cfg.hiddenFields : [];
                      if (!hidden.includes(f.id))
                        updateView.mutate({ id: view.id, config: { ...cfg, hiddenFields: [...hidden, f.id] } });
                      setMenuField(null);
                    }}
                    onDuplicate={() => {
                      duplicateField.mutate({ id: f.id });
                      setMenuField(null);
                    }}
                    onInsert={(lado) => {
                      addField.mutate({
                        collectionId,
                        name: "Campo",
                        type: "text",
                        ...(lado === "izquierda" ? { beforeFieldId: f.id } : { afterFieldId: f.id }),
                      });
                      setMenuField(null);
                    }}
                    onConfig={(config) => updateField.mutate({ id: f.id, config: { ...(f.config as object), ...config } })}
                    onType={async (type) => {
                      if (await confirmar(`Cambiar «${f.name}» a ${FIELD_LABELS[type] ?? type}. Los valores se convertirán y lo que no se pueda convertir se perderá. ¿Seguir?`, "Cambiar")) {
                        setFieldType.mutate({ id: f.id, type });
                        setMenuField(null);
                      }
                    }}
                    onDelete={async () => {
                      if (await confirmar(`¿Borrar la columna "${f.name}"?`)) deleteField.mutate({ id: f.id });
                      setMenuField(null);
                    }}
                  />
                )}
              </th>
            ))}
            <th className="px-2 py-1">
              <AddFieldButton collectionId={collectionId} fields={fields} onDone={invalidate} />
            </th>
          </tr>
        </thead>
        {groupField ? (
          groups.map((g) => {
            const folded = foldedGroups.has(g.key);
            return (
              <tbody key={g.key}>
                <tr className="border-b border-[var(--border)] bg-[var(--border)]/20">
                  <td colSpan={fields.length + 2} className="px-1 py-1">
                    <button
                      onClick={() =>
                        setFoldedGroups((s) => {
                          const next = new Set(s);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      className="flex items-center gap-1 text-sm font-medium hover:text-[var(--foreground)]"
                    >
                      {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {g.label}
                      <span className="text-xs font-normal text-[var(--muted)]">{g.records.length}</span>
                    </button>
                  </td>
                </tr>
                {!folded &&
                  (subGroupField
                    ? groupBy(g.records, subGroupField, people).map((sg) => (
                        <Fragment key={sg.key}>
                          <tr className="border-b border-[var(--border)]">
                            <td colSpan={fields.length + 2} className="px-1 py-0.5 pl-6">
                              <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                                {sg.label}
                                <span className="opacity-70">{sg.records.length}</span>
                              </span>
                            </td>
                          </tr>
                          {sg.records.map((r) => renderRow({ rec: r, depth: 0, hasChildren: false }))}
                        </Fragment>
                      ))
                    : g.records.map((r) => renderRow({ rec: r, depth: 0, hasChildren: false })))}
                {!folded && hasCalcs && (
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
                    <td className="sticky left-0 z-10 bg-[var(--background)]" style={margen} />
                    {fields.map((f, i) => (
                      <td
                        key={f.id}
                        className={`px-2 py-1 text-right tabular-nums ${
                          lefts[i] === null ? "" : "sticky z-10 bg-[var(--background)]"
                        }`}
                        style={lefts[i] === null ? undefined : { left: lefts[i] }}
                      >
                        {calcs[f.id] ? computeCalc(calcs[f.id], f, g.records) : ""}
                      </td>
                    ))}
                    <td />
                  </tr>
                )}
              </tbody>
            );
          })
        ) : (
        <tbody>
          {rows.slice(0, rowLimit).map(renderRow)}
          {rows.length > rowLimit && (
            <tr ref={moreRef}>
              <td colSpan={fields.length + 2} className="px-2 py-3 text-center text-xs text-[var(--muted)]">
                Cargando más… ({rowLimit} de {rows.length})
              </td>
            </tr>
          )}
        </tbody>
        )}
        <tfoot>
          <tr className="border-t border-[var(--border)] text-xs text-[var(--muted)]">
            <td className="sticky left-0 z-10 bg-[var(--background)]" style={margen} />
            {fields.map((f, i) => (
              <td
                key={f.id}
                className={`px-2 py-1 ${lefts[i] === null ? "" : "sticky z-10 bg-[var(--background)]"}`}
                style={lefts[i] === null ? undefined : { left: lefts[i] }}
              >
                <CalcCell field={f} calc={calcs[f.id] ?? ""} records={records} onChange={(c) => setCalc(f.id, c)} />
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
      </div>

      <div className="relative mt-2 flex items-center">
        <button
          // Si hay una plantilla marcada por defecto, «+ Nueva fila» nace con sus valores.
          onClick={() => addRecord.mutate({ collectionId, cells: templates.find((t) => t.porDefecto)?.cells })}
          className="toque inline-flex items-center px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          + Nueva fila
        </button>
        {templates.length > 0 && (
          <button
            onClick={() => setNewMenu((o) => !o)}
            className="rounded px-1 py-1 text-[var(--muted)] hover:text-[var(--foreground)]"
            title="Crear desde una plantilla"
          >
            <ChevronDown size={14} />
          </button>
        )}
        {newMenu && (
          <div className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl">
            {templates.map((t) => (
              <div key={t.id} className="group/tpl flex items-center">
                <button
                  onClick={() => {
                    addRecord.mutate({ collectionId, cells: t.cells });
                    setNewMenu(false);
                  }}
                  className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
                >
                  {t.name}
                </button>
                <button
                  onClick={() => setDefaultTemplate.mutate({ collectionId, templateId: t.porDefecto ? null : t.id })}
                  className={`px-1 ${t.porDefecto ? "text-brand" : "al-pasar text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                  title={t.porDefecto ? "Quitar como predeterminada" : "Usarla en «+ Nueva fila»"}
                >
                  <Star size={13} fill={t.porDefecto ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => deleteTemplate.mutate({ collectionId, templateId: t.id })}
                  className="al-pasar px-1 text-[var(--muted)] hover:text-red-500"
                  title="Borrar plantilla"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 px-2 text-xs text-[var(--muted)]">
        <span>{rows.length} de {records.length} filas</span>
        <button onClick={() => setTrashOpen(true)} className="toque flex items-center gap-1 hover:text-[var(--foreground)]">
          <Trash2 size={12} /> Papelera
        </button>
      </div>
      {trashOpen && <RecordTrash collectionId={collectionId} onClose={() => setTrashOpen(false)} onChange={invalidate} />}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm shadow-xl md:bottom-4">
          <span className="font-medium">
            {selectedIds.length} fila{selectedIds.length > 1 ? "s" : ""}
          </span>
          <BulkEditButton fields={fields} onApply={bulkSet} />
          <button onClick={bulkDelete} className="flex items-center gap-1 text-red-500 hover:underline">
            <Trash2 size={14} /> Borrar
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
            title="Quitar la selección"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {deleted && (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm shadow-xl md:bottom-4">
          <span>Fila borrada</span>
          <button
            onClick={() => restoreRecord.mutate({ id: deleted })}
            className="font-medium text-brand hover:underline"
          >
            Deshacer
          </button>
          <button onClick={() => setDeleted(null)} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={14} />
          </button>
        </div>
      )}

      {openRec &&
        (() => {
          const fresh = records.find((r) => r.id === openRec.id) ?? openRec;
          // El índice se busca en `rows` (el orden visible, con subtareas); la key
          // remonta el panel al navegar, que el título y el cuerpo llevan estado propio.
          const i = rows.findIndex((x) => x.rec.id === openRec.id);
          return (
            <RecordPanel
              key={fresh.id}
              pageId={pageId}
              collectionId={collectionId}
              record={fresh}
              fields={fields}
              onClose={() => setOpenRec(null)}
              nav={{
                prev: i > 0 ? () => setOpenRec(rows[i - 1].rec) : undefined,
                next: i >= 0 && i < rows.length - 1 ? () => setOpenRec(rows[i + 1].rec) : undefined,
              }}
              mode={openIn === "center" ? "center" : "side"}
              onExpand={openFull ? () => openFull(fresh.id) : undefined}
            />
          );
        })()}
    </div>
  );
}

function CalcCell({
  field,
  calc,
  records,
  onChange,
}: {
  field: FieldLite;
  calc: string;
  records: Rec[];
  onChange: (c: string) => void;
}) {
  const val = computeCalc(calc, field, records);
  const label = CALC_OPTS.find((o) => o[0] === calc)?.[1] ?? "Calcular";
  return (
    <div className="group/calc flex items-center justify-end gap-1">
      {calc && (
        <span className="tabular-nums">
          {label}: <b className="text-[var(--foreground)]">{val}</b>
        </span>
      )}
      <select
        value={calc}
        onChange={(e) => onChange(e.target.value)}
        className={`cursor-pointer rounded bg-transparent text-xs outline-none ${calc ? "opacity-0 group-hover/calc:opacity-100" : "opacity-40 group-hover/calc:opacity-100"}`}
        title="Calcular"
      >
        {CALC_OPTS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}


/**
 * «Editar propiedad» de la barra de selección: elige un campo de etiquetas o
 * casilla y el valor que se pondrá en TODAS las filas seleccionadas.
 */
function BulkEditButton({ fields, onApply }: { fields: FieldLite[]; onApply: (fieldId: string, value: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const editable = fields.filter((f) => ["select", "multiselect", "status", "checkbox"].includes(f.type));
  const field = editable.find((f) => f.id === fieldId);
  if (!editable.length) return null;
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]";
  const close = () => {
    setOpen(false);
    setFieldId(null);
  };
  const apply = (value: unknown) => {
    if (field) onApply(field.id, value);
    close();
  };
  return (
    <span className="relative">
      <button onClick={() => (open ? close() : setOpen(true))} className="text-brand hover:underline">
        Editar propiedad
      </button>
      {open && (
        <Popover onClose={close} className="left-0 w-56 p-1">
          {!field ? (
            editable.map((f) => (
              <button key={f.id} onClick={() => setFieldId(f.id)} className={item}>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-[10px] uppercase text-[var(--muted)]">{FIELD_LABELS[f.type] ?? f.type}</span>
              </button>
            ))
          ) : field.type === "checkbox" ? (
            <>
              <button onClick={() => apply(true)} className={item}>Marcada</button>
              <button onClick={() => apply(false)} className={item}>Sin marcar</button>
            </>
          ) : (
            <>
              {optionsOf(field).map((o) => (
                <button key={o.id} onClick={() => apply(field.type === "multiselect" ? [o.id] : o.id)} className={item}>
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ background: OPTION_COLORS[o.color ?? "gray"], color: "var(--tag-fg)" }}
                  >
                    {o.label}
                  </span>
                </button>
              ))}
              <button onClick={() => apply(field.type === "multiselect" ? [] : null)} className={`${item} text-[var(--muted)]`}>
                Vaciar
              </button>
            </>
          )}
        </Popover>
      )}
    </span>
  );
}

/** Tipos a los que se puede convertir una columna (los que guardan su valor en la celda). */
const CONVERTIBLE_TYPES = [
  "text", "number", "select", "multiselect", "status", "person", "files", "checkbox",
  "date", "url", "email", "phone", "created_time", "last_edited_time", "created_by", "last_edited_by", "id",
] as const;
type ConvertibleType = (typeof CONVERTIBLE_TYPES)[number];

/** Menú ⋯ de una columna: renombrar, ajustes propios del tipo y borrar. */
function FieldMenu({
  field,
  onClose,
  onRename,
  frozen,
  onFreeze,
  wrap,
  onWrap,
  onSort,
  onFilter,
  onHide,
  onDuplicate,
  onInsert,
  onConfig,
  onType,
  onDelete,
}: {
  field: FieldLite;
  onClose: () => void;
  onRename: (name: string) => void;
  frozen: boolean;
  onFreeze: () => void;
  wrap: boolean;
  onWrap: (v: boolean) => void;
  onSort: (dir: "asc" | "desc") => void;
  onFilter: () => void;
  onHide: () => void;
  onDuplicate: () => void;
  onInsert: (lado: "izquierda" | "derecha") => void;
  onConfig: (config: Record<string, unknown>) => void;
  onType: (type: ConvertibleType) => void;
  onDelete: () => void;
}) {
  const cfg = (field.config as { prefix?: string; format?: string; max?: number; time?: boolean; range?: boolean; description?: string } | null) ?? {};
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]";
  return (
    <Popover onClose={onClose} className="left-0 w-64 p-2 font-normal normal-case">
      {/* El nombre se edita aquí mismo, como en Notion (sin autoFocus: en el
          móvil abriría el teclado nada más tocar la cabecera). */}
      <input
        defaultValue={field.name}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== field.name) onRename(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="mb-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
      />
      {/* Descripción de la propiedad (el ℹ de Notion): se enseña en el tooltip de la cabecera. */}
      <textarea
        defaultValue={cfg.description ?? ""}
        rows={2}
        placeholder="Descripción (para qué es esta columna)…"
        onBlur={(e) => onConfig({ description: e.target.value.trim() })}
        className="mb-1 w-full resize-none rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none placeholder:text-[var(--muted)] focus:border-brand"
      />
      <button onClick={() => onSort("asc")} className={item}>
        <ArrowUp size={14} /> Ordenar ascendente
      </button>
      <button onClick={() => onSort("desc")} className={item}>
        <ArrowDown size={14} /> Ordenar descendente
      </button>
      <button onClick={onFilter} className={item}>
        <FilterIcon size={14} /> Filtrar por esta columna
      </button>
      <button onClick={onHide} className={item}>
        <EyeOff size={14} /> Ocultar en la vista
      </button>
      <button onClick={onFreeze} className={item} title="Las columnas congeladas no se mueven al desplazar la tabla en horizontal">
        {frozen ? "Descongelar desde aquí" : "Congelar hasta esta columna"}
      </button>

      {/* Como en Notion, el wrap se decide por columna (solo tiene efecto en texto). */}
      {field.type === "text" && (
        <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
          <span>Ajustar texto</span>
          <input
            type="checkbox"
            checked={wrap}
            onChange={(e) => onWrap(e.target.checked)}
            className="size-4 accent-[var(--color-brand,#ff5c28)]"
          />
        </label>
      )}

      {/* Los campos calculados no se pueden convertir: su valor no vive en la celda. */}
      {!["relation", "rollup", "formula"].includes(field.type) && (
        <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
          <span>Tipo</span>
          <select
            value={field.type}
            onChange={(e) => onType(e.target.value as ConvertibleType)}
            className="max-w-[140px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
          >
            {CONVERTIBLE_TYPES.map((t) => (
              <option key={t} value={t}>{FIELD_LABELS[t] ?? t}</option>
            ))}
          </select>
        </label>
      )}

      {field.type === "id" && (
        <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
          <span>Prefijo</span>
          <input
            defaultValue={cfg.prefix ?? ""}
            placeholder="TAREA-"
            onBlur={(e) => onConfig({ prefix: e.target.value })}
            className="w-24 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
          />
        </label>
      )}

      {field.type === "date" && (
        <>
          <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Incluir hora</span>
            <input
              type="checkbox"
              defaultChecked={Boolean(cfg.time)}
              onChange={(e) => onConfig({ time: e.target.checked })}
              className="size-4 accent-[var(--color-brand,#ff5c28)]"
            />
          </label>
          <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Rango de fechas</span>
            <input
              type="checkbox"
              defaultChecked={Boolean(cfg.range)}
              onChange={(e) => onConfig({ range: e.target.checked })}
              className="size-4 accent-[var(--color-brand,#ff5c28)]"
            />
          </label>
        </>
      )}

      {field.type === "number" && (
        <>
          <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Formato</span>
            <select
              value={cfg.format ?? "plain"}
              onChange={(e) => onConfig({ format: e.target.value })}
              className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
            >
              {NUMBER_FORMATS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          {cfg.format === "bar" && (
            <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
              <span>Máximo de la barra</span>
              <input
                type="number"
                defaultValue={cfg.max ?? 100}
                onBlur={(e) => onConfig({ max: Number(e.target.value) || 100 })}
                className="w-20 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
              />
            </label>
          )}
        </>
      )}

      <button onClick={() => onInsert("izquierda")} className={item}>
        <ArrowLeftToLine size={14} /> Insertar a la izquierda
      </button>
      <button onClick={() => onInsert("derecha")} className={item}>
        <ArrowRightToLine size={14} /> Insertar a la derecha
      </button>
      <button onClick={onDuplicate} className={item}>
        <Copy size={14} /> Duplicar propiedad
      </button>
      <button onClick={onDelete} className={`${item} text-red-500`}>
        <Trash2 size={14} /> Borrar columna
      </button>
    </Popover>
  );
}

/** Papelera de filas: lo borrado en los últimos 30 días, para restaurar o rematar. */
function RecordTrash({
  collectionId,
  onClose,
  onChange,
}: {
  collectionId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.db.archivedRecords.useQuery({ collectionId });
  const refresh = () => {
    utils.db.archivedRecords.invalidate({ collectionId });
    onChange();
  };
  const restore = trpc.db.restoreRecord.useMutation({ onSuccess: refresh });
  const purge = trpc.db.purgeRecord.useMutation({ onSuccess: refresh });

  // Purga perezosa al abrir, como la papelera de páginas.
  const purgeExpired = trpc.db.purgeExpiredRecords.useMutation({
    onSuccess: (r) => {
      if (r.purged > 0) refresh();
    },
    onError: () => {},
  });
  const purgeExpiredMutate = purgeExpired.mutate;
  useEffect(() => purgeExpiredMutate({ collectionId }), [purgeExpiredMutate, collectionId]);

  const daysLeft = (archivedAt: string | Date) =>
    Math.max(1, Math.ceil(30 - (Date.now() - new Date(archivedAt).getTime()) / 864e5));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display font-bold">Papelera de filas</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        {isLoading && <p className="py-6 text-center text-sm text-[var(--muted)]">Cargando…</p>}
        {!isLoading && !items?.length && (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No has borrado ninguna fila.</p>
        )}
        <ul className="divide-y divide-[var(--border)]">
          {(items ?? []).map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {it.title}
                {it.isSubtask && <span className="ml-1 text-xs text-[var(--muted)]">(subtarea)</span>}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">se borra en {daysLeft(it.archivedAt)} días</span>
              <button onClick={() => restore.mutate({ id: it.id })} className="shrink-0 text-brand hover:underline">
                Restaurar
              </button>
              <button
                onClick={async () => {
                  if (await confirmar(`¿Borrar «${it.title}» para siempre?`)) purge.mutate({ id: it.id });
                }}
                className="shrink-0 text-[var(--muted)] hover:text-red-500"
                title="Borrar para siempre"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
