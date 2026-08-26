"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, BarChart3, Calendar, ClipboardList, Columns3, Copy, Download, Eye, EyeOff, Filter as FilterIcon, GanttChart, LayoutGrid, Link as LinkIcon, List, Pencil, Plus, Table, Trash2, Upload, X } from "lucide-react";
import { confirmar } from "@/components/Confirmar";
import { toast } from "@/components/Toast";
import { trpc } from "@/trpc/react";
import { Popover } from "./Popover";
import { usePeople } from "./Cell";
import { downloadText } from "@/lib/download";
import { parseCsv } from "@/lib/csv";
import { FILTER_MENU_EVENT, VIEW_MENU_EVENT, type FilterMenuDetail, type ViewMenuDetail } from "@/lib/shortcuts";
import {
  countFilters,
  DATE_ANCHORS,
  isFilterGroup,
  type ColorRule,
  NO_VALUE_OPS,
  openInOf,
  opsFor,
  type DbField,
  type Filter,
  type FilterNode,
  type Sort,
} from "@/lib/viewData";
import { STATUS_GROUPS } from "@/lib/cellText";

type View = { id: string; name: string; type: string; config: any };

const VIEW_TYPES: { type: "table" | "kanban" | "calendar" | "timeline" | "gallery" | "chart" | "list" | "form"; label: string; icon: typeof Table }[] = [
  { type: "table", label: "Tabla", icon: Table },
  { type: "kanban", label: "Kanban", icon: Columns3 },
  { type: "list", label: "Lista", icon: List },
  { type: "gallery", label: "Galería", icon: LayoutGrid },
  { type: "calendar", label: "Calendario", icon: Calendar },
  { type: "timeline", label: "Cronograma", icon: GanttChart },
  { type: "chart", label: "Gráfica", icon: BarChart3 },
  { type: "form", label: "Formulario", icon: ClipboardList },
];

/** Icono lucide del tipo de vista (Tabla por defecto). */
export function ViewIcon({ type, size = 14 }: { type: string; size?: number }) {
  const I = VIEW_TYPES.find((v) => v.type === type)?.icon ?? Table;
  return <I size={size} />;
}

export function DbToolbar({
  pageId,
  collectionId,
  view,
  fields,
  onViewCreated,
  onViewDeleted,
}: {
  pageId: string;
  collectionId: string;
  view: View;
  fields: DbField[];
  onViewCreated: (id: string) => void;
  onViewDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState<null | "filter" | "sort" | "props" | "add" | "cfg">(null);
  // La gráfica agrega en el servidor respetando los filtros de la vista: al tocar
  // cualquier config hay que refrescar también sus datos, no solo db.get.
  const refresh = () => {
    utils.db.chartData.invalidate();
    return utils.db.get.invalidate({ pageId });
  };

  const update = trpc.db.updateView.useMutation({ onSuccess: refresh });
  const addView = trpc.db.addView.useMutation({
    onSuccess: async (v) => {
      await refresh();
      onViewCreated(v.id);
      setOpen(null);
    },
  });
  const renameView = trpc.db.renameView.useMutation({ onSuccess: refresh });
  const duplicateView = trpc.db.duplicateView.useMutation({
    onSuccess: async (v) => {
      await refresh();
      onViewCreated(v.id); // la copia queda seleccionada, como al crear una vista
      setOpen(null);
    },
  });
  const setViewType = trpc.db.setViewType.useMutation({ onSuccess: async () => { await refresh(); setOpen(null); } });
  const deleteView = trpc.db.deleteView.useMutation({
    onSuccess: async () => {
      await refresh();
      onViewDeleted();
      setOpen(null);
    },
  });

  // El clic derecho sobre la pestaña de una vista abre este mismo menú: la acción
  // viaja por un evento de ventana, como los atajos, para no tener que subir el
  // estado del menú hasta la tabla y volver a bajarlo.
  const [cfgAt, setCfgAt] = useState<ViewMenuDetail | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => {
      setCfgAt((e as CustomEvent<ViewMenuDetail>).detail ?? null);
      setOpen("cfg");
    };
    window.addEventListener(VIEW_MENU_EVENT, abrir);
    return () => window.removeEventListener(VIEW_MENU_EVENT, abrir);
  }, []);

  // «Filtrar» desde el menú de una columna: la tabla añade la condición y avisa
  // por un evento de ventana para que la barra abra su popover de filtros.
  useEffect(() => {
    const abrir = (e: Event) => {
      if ((e as CustomEvent<FilterMenuDetail>).detail?.collectionId !== collectionId) return;
      setOpen("filter");
    };
    window.addEventListener(FILTER_MENU_EVENT, abrir);
    return () => window.removeEventListener(FILTER_MENU_EVENT, abrir);
  }, [collectionId]);

  const filters: FilterNode[] = Array.isArray(view.config?.filters) ? view.config.filters : [];
  const nFilters = countFilters(filters);
  const filterOp: "and" | "or" = view.config?.filterOp === "or" ? "or" : "and";
  const sorts: Sort[] = Array.isArray(view.config?.sorts) ? view.config.sorts : [];
  const hidden: string[] = Array.isArray(view.config?.hiddenFields) ? view.config.hiddenFields : [];
  // El config se acumula en un ref: hacer spread de props pisaba el cambio
  // anterior si llegaba un segundo antes del round-trip (p. ej. dos ajustes
  // seguidos del menú, o dos teclas de un valor de filtro).
  const cfgRef = useRef<any>(view.config ?? {});
  useEffect(() => {
    cfgRef.current = view.config ?? {};
  }, [view.config]);
  const saveConfig = (patch: any) => {
    cfgRef.current = { ...cfgRef.current, ...patch };
    update.mutate({ id: view.id, config: cfgRef.current });
  };
  const toggleHidden = (id: string) =>
    saveConfig({ hiddenFields: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });

  return (
    <div className="flex items-center gap-1 text-sm">
      {/* Filtrar */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "filter" ? null : "filter")}
          className={`toque flex items-center justify-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] ${nFilters ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          title={nFilters ? `Filtrar (${nFilters})` : "Filtrar"}
          aria-label="Filtrar"
        >
          <FilterIcon size={15} />
          {!!nFilters && <span className="text-[11px] font-medium">{nFilters}</span>}
        </button>
        {open === "filter" && (
          <Popover onClose={() => setOpen(null)} className="right-0 w-96 p-3">
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Filtros</div>
            {filters.length >= 2 && (
              <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
                <span>Coincidir con</span>
                <select
                  value={filterOp}
                  onChange={(e) => saveConfig({ filterOp: e.target.value })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--foreground)]"
                >
                  <option value="and">todos</option>
                  <option value="or">cualquiera</option>
                </select>
                <span>los filtros</span>
              </div>
            )}
            <FilterNodesEditor
              nodes={filters}
              onChange={(nf) => saveConfig({ filters: nf })}
              fields={fields}
              depth={0}
            />
          </Popover>
        )}
      </div>

      {/* Ordenar */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "sort" ? null : "sort")}
          className={`toque flex items-center justify-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] ${sorts.length ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          title={sorts.length ? `Ordenar (${sorts.length})` : "Ordenar"}
          aria-label="Ordenar"
        >
          <ArrowUpDown size={15} />
          {!!sorts.length && <span className="text-[11px] font-medium">{sorts.length}</span>}
        </button>
        {open === "sort" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Orden</div>
            {sorts.length === 0 && <p className="mb-2 text-xs text-[var(--muted)]">Sin orden.</p>}
            <div className="space-y-2">
              {sorts.map((so, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select
                    value={so.fieldId}
                    onChange={(e) => {
                      const ns = [...sorts];
                      ns[i] = { ...so, fieldId: e.target.value };
                      saveConfig({ sorts: ns });
                    }}
                    className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
                  >
                    {fields.map((fl) => (
                      <option key={fl.id} value={fl.id}>{fl.name}</option>
                    ))}
                  </select>
                  <select
                    value={so.dir}
                    onChange={(e) => {
                      const ns = [...sorts];
                      ns[i] = { ...so, dir: e.target.value as "asc" | "desc" };
                      saveConfig({ sorts: ns });
                    }}
                    className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
                  >
                    <option value="asc">A→Z ↑</option>
                    <option value="desc">Z→A ↓</option>
                  </select>
                  <button
                    onClick={() => saveConfig({ sorts: sorts.filter((_, j) => j !== i) })}
                    className="shrink-0 px-1 text-[var(--muted)] hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const fl = fields[0];
                if (!fl) return;
                saveConfig({ sorts: [...sorts, { fieldId: fl.id, dir: "asc" }] });
              }}
              className="mt-2 flex items-center gap-1 text-xs text-brand hover:underline"
            >
              <Plus size={12} /> Añadir orden
            </button>
          </Popover>
        )}
      </div>

      {/* Propiedades (mostrar/ocultar columnas) */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "props" ? null : "props")}
          className={`toque flex items-center justify-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] ${hidden.length ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          title="Propiedades: qué columnas se ven"
          aria-label="Propiedades"
        >
          <Eye size={15} />
          {!!hidden.length && (
            <span className="text-[11px] font-medium">{fields.length - hidden.length}</span>
          )}
        </button>
        {open === "props" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Mostrar en esta vista</div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {fields.map((f) => {
                const visible = !hidden.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleHidden(f.id)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--hover)]"
                  >
                    <span className={visible ? "" : "opacity-40"}>{f.name}</span>
                    <span className="ml-auto text-[var(--muted)]">{visible ? <Eye size={14} /> : <EyeOff size={14} />}</span>
                  </button>
                );
              })}
            </div>
          </Popover>
        )}
      </div>

      {/* Opciones de la vista. No hay botón: se abren pinchando su pestaña, que es
          donde uno mira. Antes había un engranaje aquí a la derecha y el menú salía
          en la otra punta de la barra, lejos de la vista a la que se refería. */}
      <div className="relative">
        {open === "cfg" && (
          <Popover onClose={() => setOpen(null)} at={cfgAt ?? undefined} className="w-80 p-3">
            <button
              onClick={() => {
                const name = window.prompt("Nuevo nombre de la vista:", view.name);
                if (name && name.trim()) renameView.mutate({ id: view.id, name: name.trim() });
                setOpen(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <Pencil size={14} /> Renombrar vista
            </button>
            <div className="my-1 border-t border-[var(--border)] pt-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Mostrar como</div>
              <div className="flex flex-wrap gap-1 px-1">
                {VIEW_TYPES.map((vt) => (
                  <button
                    key={vt.type}
                    onClick={() => setViewType.mutate({ id: view.id, type: vt.type })}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-[var(--hover)] ${view.type === vt.type ? "bg-[var(--active)] font-medium" : ""}`}
                    title={vt.label}
                  >
                    <vt.icon size={13} /> {vt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Cómo se abre la ficha de una fila, como el «Open pages in» de Notion. */}
            {["table", "kanban", "list", "gallery", "calendar", "timeline"].includes(view.type) && (
              <label className="my-1 flex items-center justify-between gap-2 border-t border-[var(--border)] px-2 pt-2 text-sm">
                <span>Abrir filas en</span>
                <select
                  value={openInOf(view.type, view.config)}
                  onChange={(e) => saveConfig({ openIn: e.target.value })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                >
                  <option value="side">Panel lateral</option>
                  <option value="center">Centrado</option>
                  <option value="full">Página completa</option>
                </select>
              </label>
            )}
            {["table", "kanban", "list", "gallery"].includes(view.type) && (
              <div className="my-1 border-t border-[var(--border)] pt-1">
                <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Agrupar</div>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Agrupar por</span>
                  <select
                    value={view.config?.groupByFieldId ?? ""}
                    onChange={(e) => saveConfig({ groupByFieldId: e.target.value || null })}
                    className="max-w-[150px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    {/* El Kanban necesita columnas sí o sí: sin campo elige el primero de Selección/Estado. */}
                    <option value="">{view.type === "kanban" ? "Automático" : "Sin agrupar"}</option>
                    {fields
                      .filter((f) =>
                        view.type === "kanban"
                          ? ["select", "status", "person", "checkbox"].includes(f.type)
                          : !["rollup", "formula", "relation", "files", "created_by", "last_edited_by", "created_time", "last_edited_time"].includes(
                              f.type,
                            ),
                      )
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                  </select>
                </label>
                {/* Segundo nivel: secciones anidadas en la Tabla, carriles horizontales en el Kanban. */}
                {((view.type === "table" && view.config?.groupByFieldId) || view.type === "kanban") && (
                  <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                    <span>{view.type === "kanban" ? "Carriles por" : "Y después por"}</span>
                    <select
                      value={view.config?.subGroupByFieldId ?? ""}
                      onChange={(e) => saveConfig({ subGroupByFieldId: e.target.value || null })}
                      className="max-w-[150px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    >
                      <option value="">Sin subagrupar</option>
                      {fields
                        .filter((f) =>
                          view.type === "kanban"
                            ? ["select", "status", "person", "checkbox"].includes(f.type) && f.id !== view.config?.groupByFieldId
                            : f.id !== view.config?.groupByFieldId &&
                              !["rollup", "formula", "relation", "files", "created_by", "last_edited_by", "created_time", "last_edited_time"].includes(
                                f.type,
                              ),
                        )
                        .map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {view.type === "table" && (
              <label className="my-1 flex items-center justify-between gap-2 border-t border-[var(--border)] px-2 pt-2 text-sm">
                <span>Envolver texto</span>
                <input
                  type="checkbox"
                  checked={Boolean(view.config?.wrapText)}
                  onChange={(e) => saveConfig({ wrapText: e.target.checked })}
                  className="size-4 accent-[var(--color-brand,#ff5c28)]"
                />
              </label>
            )}
            {(view.type === "table" || view.type === "gallery") && (
              <div className="my-1 border-t border-[var(--border)] pt-1">
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Color por</span>
                  <select
                    value={view.config?.rowColorFieldId ?? ""}
                    onChange={(e) => saveConfig({ rowColorFieldId: e.target.value || null })}
                    className="max-w-[150px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    <option value="">Sin color</option>
                    {fields
                      .filter((f) => f.type === "select" || f.type === "status" || f.type === "multiselect")
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                  </select>
                </label>
                <ColorRulesEditor
                  fields={fields}
                  rules={view.config?.colorRules ?? []}
                  onChange={(colorRules) => saveConfig({ colorRules })}
                />
              </div>
            )}
            {(view.type === "kanban" || view.type === "gallery") && (
              <div className="my-1 border-t border-[var(--border)] pt-1">
                <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Tarjetas</div>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Tamaño de tarjeta</span>
                  <select
                    value={view.config?.cardSize ?? "medium"}
                    onChange={(e) => saveConfig({ cardSize: e.target.value })}
                    className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    <option value="small">Pequeño</option>
                    <option value="medium">Mediano</option>
                    <option value="large">Grande</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Vista previa</span>
                  <select
                    value={view.config?.cardPreview ?? "none"}
                    onChange={(e) => saveConfig({ cardPreview: e.target.value })}
                    className="max-w-[140px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    <option value="none">Ninguna</option>
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </label>
                {/* Resumen de la cabecera de cada columna: contar, o la suma de un número. */}
                {view.type === "kanban" && (
                  <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                    <span>Resumen de columna</span>
                    <select
                      value={view.config?.kanbanSum ?? ""}
                      onChange={(e) => saveConfig({ kanbanSum: e.target.value || null })}
                      className="max-w-[140px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    >
                      <option value="">Contar tarjetas</option>
                      {fields
                        .filter((f) => f.type === "number")
                        .map((f) => (
                          <option key={f.id} value={f.id}>Suma de {f.name}</option>
                        ))}
                    </select>
                  </label>
                )}
                {/* Solo la Galería pinta la vista previa como imagen. */}
                {view.type === "gallery" && (
                  <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                    <span>Ajuste de imagen</span>
                    <select
                      value={view.config?.imageFit ?? "cover"}
                      onChange={(e) => saveConfig({ imageFit: e.target.value })}
                      className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    >
                      <option value="cover">Recortar</option>
                      <option value="contain">Imagen entera</option>
                    </select>
                  </label>
                )}
              </div>
            )}
            <button
              onClick={() => {
                // El enlace abre la BD con ESTA vista activa (?v=), como en Notion.
                navigator.clipboard.writeText(`${location.origin}/p/${pageId}?v=${view.id}`);
                toast("Enlace a la vista copiado");
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <LinkIcon size={14} /> Copiar enlace a la vista
            </button>
            <button
              onClick={() => duplicateView.mutate({ id: view.id })}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <Copy size={14} /> Duplicar vista
            </button>
            <button
              onClick={async () => {
                if (await confirmar(`¿Borrar la vista "${view.name}"?`)) deleteView.mutate({ id: view.id });
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-500 hover:bg-[var(--hover)]"
            >
              <Trash2 size={14} /> Borrar vista
            </button>
          </Popover>
        )}
      </div>

      {/* Exportar CSV */}
      <button
        onClick={async () => {
          const { name, csv } = await utils.db.exportCsv.fetch({ collectionId });
          downloadText(`${name}.csv`, csv, "text/csv");
        }}
        className="toque flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        title="Exportar a CSV"
        aria-label="Exportar a CSV"
      >
        <Download size={15} />
      </button>

      <ImportarCsvButton pageId={pageId} collectionId={collectionId} />

    </div>
  );
}

/**
 * Importa un CSV como filas de ESTA base de datos (el «Merge with CSV» de
 * Notion): las cabeceras casan con las columnas por nombre y las desconocidas
 * crean columna nueva.
 */
function ImportarCsvButton({ pageId, collectionId }: { pageId: string; collectionId: string }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const importar = trpc.db.importCsvInto.useMutation({
    onSuccess: (r) => {
      utils.db.get.invalidate({ pageId });
      toast(
        `${r.filas} fila${r.filas === 1 ? "" : "s"} importada${r.filas === 1 ? "" : "s"}` +
          (r.columnasNuevas ? ` (${r.columnasNuevas} columna${r.columnasNuevas === 1 ? "" : "s"} nueva${r.columnasNuevas === 1 ? "" : "s"})` : ""),
      );
    },
  });
  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importar.isPending}
        className="toque flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-50"
        title="Importar CSV a esta base de datos (las cabeceras casan con las columnas por nombre)"
        aria-label="Importar CSV"
      >
        <Upload size={15} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // permite reelegir el mismo archivo
          if (!f) return;
          const filas = parseCsv(await f.text());
          const [headers, ...rows] = filas;
          if (!headers?.length) {
            toast("El CSV está vacío o no tiene cabeceras.");
            return;
          }
          importar.mutate({ collectionId, headers, rows });
        }}
      />
    </>
  );
}

/**
 * Botón «+» de añadir vista. Va pegado a las pestañas, que es donde se busca, y por
 * eso no necesita decir «Vista»: se entiende por dónde está. Antes vivía al final de
 * la barra de acciones, lejos de lo que crea.
 */
export function AddViewButton({
  pageId,
  collectionId,
  onViewCreated,
}: {
  pageId: string;
  collectionId: string;
  onViewCreated: (id: string) => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const addView = trpc.db.addView.useMutation({
    onSuccess: async (v) => {
      await utils.db.get.invalidate({ pageId });
      onViewCreated(v.id);
      setOpen(false);
    },
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="toque flex items-center justify-center rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        title="Añadir una vista"
        aria-label="Añadir una vista"
      >
        <Plus size={15} />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <div className="mb-1 text-xs font-medium text-[var(--muted)]">Nueva vista</div>
          {VIEW_TYPES.map((vt) => (
            <button
              key={vt.type}
              onClick={() => addView.mutate({ collectionId, type: vt.type })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <vt.icon size={14} /> {vt.label}
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

/** Editor recursivo de filtros: condiciones sueltas y grupos anidados and/or. */
function FilterNodesEditor({
  nodes,
  onChange,
  fields,
  depth,
}: {
  nodes: FilterNode[];
  onChange: (nodes: FilterNode[]) => void;
  fields: DbField[];
  depth: number;
}) {
  const set = (i: number, n: FilterNode) => onChange(nodes.map((x, j) => (j === i ? n : x)));
  const remove = (i: number) => onChange(nodes.filter((_, j) => j !== i));
  const newCondition = (): Filter | null => {
    const fl = fields[0];
    return fl ? { fieldId: fl.id, op: opsFor(fl.type)[0].value, value: "" } : null;
  };
  return (
    <div>
      {nodes.length === 0 && <p className="mb-2 text-xs text-[var(--muted)]">Sin filtros.</p>}
      <div className="space-y-2">
        {nodes.map((node, i) =>
          isFilterGroup(node) ? (
            <div
              key={i}
              className="rounded-md border border-[var(--border)] border-l-2 border-l-brand/60 p-2"
            >
              <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
                <span>Coincidir con</span>
                <select
                  value={node.op}
                  onChange={(e) => set(i, { ...node, op: e.target.value as "and" | "or" })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--foreground)]"
                >
                  <option value="and">todos</option>
                  <option value="or">cualquiera</option>
                </select>
                <button
                  onClick={() => remove(i)}
                  className="ml-auto shrink-0 px-1 text-[var(--muted)] hover:text-red-500"
                  title="Borrar grupo"
                >
                  <X size={14} />
                </button>
              </div>
              <FilterNodesEditor
                nodes={node.filters}
                onChange={(f) => set(i, { ...node, filters: f })}
                fields={fields}
                depth={depth + 1}
              />
            </div>
          ) : (
            <ConditionRow
              key={i}
              filter={node}
              fields={fields}
              onChange={(f) => set(i, f)}
              onRemove={() => remove(i)}
            />
          ),
        )}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <button
          onClick={() => {
            const c = newCondition();
            if (c) onChange([...nodes, c]);
          }}
          className="flex items-center gap-1 text-brand hover:underline"
        >
          <Plus size={12} /> Añadir filtro
        </button>
        {/* Hasta 3 niveles de grupos anidados, el mismo tope que la UI de Notion. */}
        {depth < 3 && (
          <button
            onClick={() => {
              const c = newCondition();
              onChange([...nodes, { type: "group", op: "and", filters: c ? [c] : [] }]);
            }}
            className="flex items-center gap-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
          >
            <Plus size={12} /> Añadir grupo
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  filter,
  fields,
  onChange,
  onRemove,
}: {
  filter: Filter;
  fields: DbField[];
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.id === filter.fieldId);
  const ops = opsFor(field?.type ?? "text");
  return (
    // flex-wrap: el operador y el input de fecha no pueden encoger por debajo de su
    // contenido, y dentro de un grupo anidado la fila se salía del recuadro; mejor
    // que salte de línea a que se corte.
    <div className="flex flex-wrap items-center gap-1">
      <select
        value={filter.fieldId}
        onChange={(e) => {
          const nt = fields.find((f) => f.id === e.target.value)?.type ?? "text";
          onChange({ fieldId: e.target.value, op: opsFor(nt)[0].value, value: "" });
        }}
        className="min-w-[90px] flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
      >
        {fields.map((fl) => (
          <option key={fl.id} value={fl.id}>{fl.name}</option>
        ))}
      </select>
      <select
        value={filter.op}
        onChange={(e) => onChange({ ...filter, op: e.target.value })}
        className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <FilterValue field={field} op={filter.op} value={filter.value} onChange={(v) => onChange({ ...filter, value: v })} />
      <button onClick={onRemove} className="shrink-0 px-1 text-[var(--muted)] hover:text-red-500">
        <X size={14} />
      </button>
    </div>
  );
}

function FilterValue({ field, op, value, onChange }: { field?: DbField; op: string; value: any; onChange: (v: any) => void }) {
  if (!field) return null;
  if (NO_VALUE_OPS.has(op)) return <span className="flex-1" />;
  if (field.type === "checkbox") {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value === "true")} className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs">
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (["person", "created_by", "last_edited_by"].includes(field.type))
    return <PersonFilterValue value={value} onChange={onChange} />;
  if (field.type === "relation") return <RelationFilterValue field={field} value={value} onChange={onChange} />;
  if (field.type === "select" || field.type === "multiselect" || field.type === "status") {
    const opts: any[] = field.config?.options ?? [];
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="min-w-[90px] flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs">
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
        {/* En Estado también se puede filtrar por grupo entero, como en Notion. */}
        {field.type === "status" && (
          <optgroup label="Grupos">
            {STATUS_GROUPS.map(([g, l]) => (
              <option key={g} value={`group:${g}`}>{l}</option>
            ))}
          </optgroup>
        )}
      </select>
    );
  }
  if (["date", "created_time", "last_edited_time"].includes(field.type)) {
    // Fecha exacta o ancla relativa (Hoy, Mañana…), que se guarda como {rel:"today"}.
    const rel = value && typeof value === "object" ? ((value as { rel?: string }).rel ?? "") : "";
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <select
          value={rel}
          onChange={(e) => onChange(e.target.value ? { rel: e.target.value } : "")}
          className="min-w-0 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
        >
          <option value="">Fecha exacta</option>
          {DATE_ANCHORS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {!rel && (
          <TextFilterValue
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            className="min-w-[110px] flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
          />
        )}
      </span>
    );
  }
  const inputType = field.type === "number" || field.type === "id" ? "number" : "text";
  return <TextFilterValue type={inputType} value={value ?? ""} onChange={onChange} />;
}

/**
 * Valor de filtro que se teclea (texto, número, fecha): buffer local con
 * debounce. Controlado directo contra la config del servidor se comía teclas:
 * cada una re-renderizaba al valor viejo hasta completar el round-trip.
 */
function TextFilterValue({
  type,
  value,
  onChange,
  className = "min-w-[90px] flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs",
}: {
  type: string;
  value: any;
  onChange: (v: any) => void;
  className?: string;
}) {
  const [v, setV] = useState<string>(value == null ? "" : String(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = (nv: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      onChange(nv);
    }, 400);
  };
  return (
    <input
      type={type}
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        flush(e.target.value);
      }}
      onBlur={() => {
        // Salir del campo manda lo pendiente sin esperar al debounce.
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
          onChange(v);
        }
      }}
      className={className}
    />
  );
}

/** Valor de filtro para campos de persona: miembros del espacio + el especial "Yo". */
function PersonFilterValue({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const { data } = trpc.workspace.members.useQuery();
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
    >
      <option value="">—</option>
      <option value="me">Yo</option>
      {(data?.members ?? []).map((m) => (
        <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
      ))}
    </select>
  );
}

/** Valor de filtro para relaciones: registros de la BD destino. */
function RelationFilterValue({ field, value, onChange }: { field: DbField; value: any; onChange: (v: any) => void }) {
  const targetCollectionId = (field.config as { targetCollectionId?: string })?.targetCollectionId;
  const { data } = trpc.db.relationOptions.useQuery(
    { collectionId: targetCollectionId ?? "" },
    { enabled: !!targetCollectionId },
  );
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
    >
      <option value="">—</option>
      {(data ?? []).map((o) => (
        <option key={o.id} value={o.id}>{o.title}</option>
      ))}
    </select>
  );
}

/** Texto legible del valor de un filtro para el chip (etiquetas, nombres, anclas…). */
function chipValueText(
  field: DbField,
  op: string,
  value: any,
  people: Map<string, string>,
  relOpts?: { id: string; title: string }[],
): string {
  if (NO_VALUE_OPS.has(op)) return "";
  if (value == null || value === "") return "…";
  if (typeof value === "object" && typeof value.rel === "string")
    return DATE_ANCHORS.find(([v]) => v === value.rel)?.[1].toLowerCase() ?? "…";
  if (field.type === "checkbox") return value === true || value === "true" ? "Sí" : "No";
  if (["person", "created_by", "last_edited_by"].includes(field.type))
    return value === "me" ? "Yo" : (people.get(String(value)) ?? "…");
  if (field.type === "relation") return relOpts?.find((o) => o.id === value)?.title ?? "…";
  if (["select", "multiselect", "status"].includes(field.type)) {
    if (typeof value === "string" && value.startsWith("group:"))
      return STATUS_GROUPS.find(([g]) => g === value.slice("group:".length))?.[1] ?? value;
    const opts: { id: string; label: string }[] = field.config?.options ?? [];
    return opts.find((o) => o.id === value)?.label ?? String(value);
  }
  return String(value);
}

/** Resumen de un chip: "Campo: operador valor" (o "Grupo · N condiciones"). */
function ChipLabel({ node, fields }: { node: FilterNode; fields: DbField[] }) {
  const people = usePeople();
  const field = isFilterGroup(node) ? undefined : fields.find((f) => f.id === node.fieldId);
  const targetCollectionId =
    field?.type === "relation" ? (field.config as { targetCollectionId?: string })?.targetCollectionId : undefined;
  const { data: relOpts } = trpc.db.relationOptions.useQuery(
    { collectionId: targetCollectionId ?? "" },
    { enabled: !!targetCollectionId },
  );
  if (isFilterGroup(node)) {
    const total = countFilters(node.filters);
    return <>{`Grupo · ${total} ${total === 1 ? "condición" : "condiciones"}`}</>;
  }
  if (!field) return <>?</>;
  const opLabel = opsFor(field.type).find((o) => o.value === node.op)?.label ?? node.op;
  const valueText = chipValueText(field, node.op, node.value, people, relOpts);
  return <>{`${field.name}: ${opLabel}${valueText ? ` ${valueText}` : ""}`}</>;
}

/**
 * Barra de chips de filtro encima de la vista, como en Notion: una píldora por
 * condición de primer nivel. Pinchar un chip abre un popover para editarlo rápido
 * y la X lo quita. No se dibuja nada si la vista no tiene filtros.
 */
export function FilterChips({ pageId, view, fields }: { pageId: string; view: View; fields: DbField[] }) {
  const utils = trpc.useUtils();
  const update = trpc.db.updateView.useMutation({
    onSuccess: () => {
      utils.db.get.invalidate({ pageId });
      utils.db.chartData.invalidate();
    },
  });
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const filters: FilterNode[] = Array.isArray(view.config?.filters) ? view.config.filters : [];
  if (!filters.length) return null;
  const save = (nf: FilterNode[]) => update.mutate({ id: view.id, config: { ...view.config, filters: nf } });
  const set = (i: number, node: FilterNode) => save(filters.map((x, j) => (j === i ? node : x)));
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      {filters.map((node, i) => (
        <div key={i} className="relative">
          <span className="flex items-center gap-0.5 rounded-full border border-[var(--border)] py-0.5 pl-2.5 pr-1 text-[var(--muted)]">
            <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="toque-estrecho hover:text-brand">
              <ChipLabel node={node} fields={fields} />
            </button>
            <button
              onClick={() => save(filters.filter((_, j) => j !== i))}
              className="toque-estrecho rounded-full p-0.5 hover:text-red-500"
              title="Quitar filtro"
              aria-label="Quitar filtro"
            >
              <X size={12} />
            </button>
          </span>
          {openIdx === i && (
            <Popover onClose={() => setOpenIdx(null)} className="w-96 p-3">
              {isFilterGroup(node) ? (
                <>
                  <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
                    <span>Coincidir con</span>
                    <select
                      value={node.op}
                      onChange={(e) => set(i, { ...node, op: e.target.value as "and" | "or" })}
                      className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--foreground)]"
                    >
                      <option value="and">todos</option>
                      <option value="or">cualquiera</option>
                    </select>
                  </div>
                  <FilterNodesEditor
                    nodes={node.filters}
                    onChange={(f) => set(i, { ...node, filters: f })}
                    fields={fields}
                    depth={1}
                  />
                </>
              ) : (
                <ConditionRow
                  filter={node}
                  fields={fields}
                  onChange={(fl) => set(i, fl)}
                  onRemove={() => {
                    save(filters.filter((_, j) => j !== i));
                    setOpenIdx(null);
                  }}
                />
              )}
            </Popover>
          )}
        </div>
      ))}
    </div>
  );
}

const RULE_COLORS: [string, string][] = [
  ["red", "Rojo"],
  ["orange", "Naranja"],
  ["yellow", "Amarillo"],
  ["green", "Verde"],
  ["blue", "Azul"],
  ["purple", "Morado"],
  ["pink", "Rosa"],
  ["brown", "Marrón"],
  ["gray", "Gris"],
];

/**
 * Reglas de color: cada una tiene sus condiciones (el mismo editor que los filtros
 * de la vista) y un color. Gana la primera que cumple la fila.
 */
function ColorRulesEditor({
  fields,
  rules,
  onChange,
}: {
  fields: DbField[];
  rules: ColorRule[];
  onChange: (rules: ColorRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (i: number, rule: ColorRule) => onChange(rules.map((r, j) => (j === i ? rule : r)));

  return (
    <div className="px-2 pb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-1 text-sm hover:text-[var(--foreground)]"
      >
        <span>Reglas de color</span>
        <span className="text-xs text-[var(--muted)]">{rules.length || "ninguna"}</span>
      </button>
      {open && (
        <div className="space-y-2 pb-1">
          {rules.map((rule, i) => (
            <div key={rule.id} className="rounded-lg border border-[var(--border)] p-2">
              <div className="mb-1 flex items-center gap-2">
                <select
                  value={rule.color}
                  onChange={(e) => set(i, { ...rule, color: e.target.value })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                >
                  {RULE_COLORS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <span className="text-xs text-[var(--muted)]">si cumple:</span>
                <button
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                  className="ml-auto text-[var(--muted)] hover:text-red-500"
                  title="Quitar regla"
                >
                  <X size={13} />
                </button>
              </div>
              <FilterNodesEditor
                nodes={rule.filters ?? []}
                fields={fields}
                onChange={(filters) => set(i, { ...rule, filters })}
                depth={1}
              />
            </div>
          ))}
          <button
            onClick={() =>
              onChange([
                ...rules,
                { id: "rule_" + Math.random().toString(36).slice(2, 9), color: "red", filters: [] },
              ])
            }
            className="text-xs text-brand hover:underline"
          >
            ＋ Añadir regla
          </button>
        </div>
      )}
    </div>
  );
}
