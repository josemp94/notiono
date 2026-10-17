"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  getFirstCollision,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { formatNumber, OPTION_COLORS, optionsOf, type FieldLite, type Option } from "@/lib/cellText";
import { confirmar } from "@/components/Confirmar";
import { COLOR_LABELS, COLOR_NAMES, usePeople } from "./Cell";
import { Popover } from "./Popover";
import { RecordPanel } from "./RecordPanel";
import { ScrollHorizontal } from "./ScrollHorizontal";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const SIZES: Record<string, { col: string; card: string }> = {
  small: { col: "w-52", card: "px-2 py-1.5 text-xs" },
  medium: { col: "w-64", card: "px-3 py-2 text-sm" },
  large: { col: "w-80", card: "px-4 py-3 text-base" },
};

/*
 * Arrastrar, como en Notion: la tarjeta (o la columna entera, cogida por su
 * cabecera) se levanta y sigue al puntero; en su sitio queda un hueco tenue que
 * marca dónde caerá y las demás se apartan con animación. Antes era el drag
 * nativo de HTML5: sin hueco, sin animación y muerto en pantallas táctiles.
 *
 * Ratón: arranca al mover 5 px (un clic sin mover sigue abriendo la ficha).
 * Táctil: pulsación larga (250 ms); deslizar sin esperar sigue desplazando.
 */
type DatosDnd = { tipo: "tarjeta" } | { tipo: "columna" | "grupo"; carril: string | null; col: string };

// Ids de dnd-kit: tarjeta = id de la fila; columna (contenedor de tarjetas) y
// grupo (la columna como pieza que se reordena) llevan carril + grupo, porque
// con subagrupado la misma columna se pinta en cada carril.
const idColumna = (carril: string | null, col: string) => "c" + JSON.stringify([carril, col]);
const idGrupo = (carril: string | null, col: string) => "g" + JSON.stringify([carril, col]);
const leeId = (id: string) => JSON.parse(id.slice(1)) as [string | null, string];
const datosDe = (x: Active | Over | null | undefined) => x?.data.current as DatosDnd | undefined;

// Sobre botones, campos o menús, pulsar es pulsar: no arranca un arrastre.
const NO_ARRASTRA = "button, input, textarea, select, a, [contenteditable], [data-menu]";
const arrastrable = (t: EventTarget | null) => !(t instanceof Element && t.closest(NO_ARRASTRA));
class Raton extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (e: React.MouseEvent, opts: Parameters<(typeof MouseSensor.activators)[0]["handler"]>[1]) =>
        arrastrable(e.nativeEvent.target) && MouseSensor.activators[0].handler(e, opts),
    },
  ];
}
class Tactil extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (e: React.TouchEvent, opts: Parameters<(typeof TouchSensor.activators)[0]["handler"]>[1]) =>
        arrastrable(e.nativeEvent.target) && TouchSensor.activators[0].handler(e, opts),
    },
  ];
}

// Que las tarjetas también se deslicen a su sitio al soltar (no solo mientras se arrastra).
const animarTarjetas: AnimateLayoutChanges = (a) => defaultAnimateLayoutChanges({ ...a, wasDragging: true });
// Con un orden activo en la vista no se reordena a mano: las demás no se apartan.
const sinApartar = () => null;

/** Hooks por pieza (no se pueden llamar dentro de un .map): se pasan por render-prop. */
function Ordenable({
  id,
  datos,
  disabled,
  animar,
  children,
}: {
  id: string;
  datos: DatosDnd;
  disabled?: boolean;
  animar?: AnimateLayoutChanges;
  children: (s: ReturnType<typeof useSortable>) => React.ReactNode;
}) {
  const s = useSortable({
    id,
    data: datos,
    disabled,
    animateLayoutChanges: animar,
  });
  return <>{children(s)}</>;
}
function Soltable({
  id,
  datos,
  children,
}: {
  id: string;
  datos: DatosDnd;
  children: (d: ReturnType<typeof useDroppable>) => React.ReactNode;
}) {
  const d = useDroppable({ id, data: datos });
  return <>{children(d)}</>;
}

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
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({
    onSuccess: invalidate,
  });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  // Al soltar una tarjeta se guarda todo a la vez y se refresca una sola vez.
  const cambiarCelda = trpc.db.updateCell.useMutation();
  const moverFila = trpc.db.moveRecord.useMutation();
  // Mientras se arrastra (y hasta que llega el refresco) el tablero se pinta
  // desde aquí: contenedor → ids de sus tarjetas, en orden.
  const [vivo, setVivo] = useState<Record<string, string[]> | null>(null);
  const vivoRef = useRef(vivo);
  const ponVivo = (v: Record<string, string[]> | null) => {
    vivoRef.current = v;
    setVivo(v);
  };
  const [activo, setActivo] = useState<{ id: string; datos: DatosDnd } | null>(null);
  // De dónde salió la tarjeta (para saber si cambió algo al soltarla).
  const origen = useRef<{ cont: string; idx: number } | null>(null);
  const ultimoOver = useRef<UniqueIdentifier | null>(null);
  const recienMovida = useRef(false);
  const pendientes = useRef(0);
  // Orden de los grupos recién soltado, hasta que el servidor lo confirme.
  const [ordenGrupos, setOrdenGrupos] = useState<string[] | null>(null);
  const sensores = useSensors(
    useSensor(Raton, { activationConstraint: { distance: 5 } }),
    useSensor(Tactil, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  useEffect(() => {
    requestAnimationFrame(() => {
      recienMovida.current = false;
    });
  }, [vivo]);
  const arrastrando = useRef(false);
  const instantanea = useRef<Record<string, string[]> | null>(null);
  // La capa que sigue al puntero va a <body> (fixed no se descoloca por
  // transformaciones de los padres); solo existe en el navegador.
  const enCliente = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const abrir = (r: Rec) => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r));
  // «+ Añadir grupo»: crea una opción nueva del campo select/estado desde el tablero.
  const [groupName, setGroupName] = useState<string | null>(null);
  // Menú «⋯» de un grupo. La clave lleva el carril (con subagrupado la misma
  // columna se pinta en cada carril y el menú solo debe abrirse en uno).
  const [menuCol, setMenuCol] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
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
          ...[...people.entries()].map(([id, name]) => ({
            id,
            label: name,
            color: "blue",
          })),
          { id: "", label: "Sin asignar", color: "gray" },
        ]
      : f.type === "checkbox"
        ? [
            { id: "true", label: "Hecho", color: "green" },
            { id: "", label: "Sin hacer", color: "gray" },
          ]
        : [
            ...optionsOf(f).map((o) => ({
              id: o.id,
              label: o.label,
              color: o.color ?? "gray",
            })),
            { id: "", label: "Sin asignar", color: "gray" },
          ];

  const columns = ordenGrupos
    ? gruposDe(groupField).sort((a, b) => {
        const i = (id: string) => (ordenGrupos.includes(id) ? ordenGrupos.indexOf(id) : 1e9);
        return i(a.id) - i(b.id);
      })
    : gruposDe(groupField);

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
    updateField.mutate({
      id: groupField!.id,
      config: { ...cfg, options: [...opts, option] },
    });
  }

  // Renombrar/mover/eliminar un grupo editan las opciones del campo, como el
  // editor de etiquetas de la celda (Cell.tsx). Persona y casilla no tienen
  // opciones —sus grupos son los miembros o hecho/sin hacer—: solo ocultar.
  const conOpciones = groupField.type === "select" || groupField.type === "status";
  const cerrarMenu = () => {
    setMenuCol(null);
    setRenaming(null);
  };
  const saveOpts = (next: Option[]) => {
    const cfg = (groupField.config as { options?: Option[] }) ?? {};
    updateField.mutate({
      id: groupField.id,
      config: { ...cfg, options: next },
    });
  };
  const renombrarGrupo = (id: string, label: string) => {
    const l = label.trim();
    if (l) saveOpts(optionsOf(groupField).map((o) => (o.id === id ? { ...o, label: l } : o)));
    cerrarMenu();
  };
  const colorearGrupo = (id: string, color: string) => {
    saveOpts(optionsOf(groupField).map((o) => (o.id === id ? { ...o, color } : o)));
    cerrarMenu();
  };
  const eliminarGrupo = async (col: { id: string; label: string }) => {
    cerrarMenu();
    if (!(await confirmar(`¿Eliminar el grupo «${col.label}»? Sus tarjetas pasarán a «Sin asignar».`))) return;
    saveOpts(optionsOf(groupField).filter((o) => o.id !== col.id));
  };

  /** Una fila de columnas (el tablero); con subagrupado, una por carril. */
  const filaColumnas = (laneId: string | null, conExtras: boolean) => (
    <SortableContext
      items={visibleColumns.filter((c) => editable(c.id)).map((c) => idGrupo(laneId, c.id))}
      strategy={horizontalListSortingStrategy}
    >
      <div className="flex w-max min-w-full gap-3">
        {visibleColumns.map((col) => {
          const cid = idColumna(laneId, col.id);
          const ids = items[cid] ?? [];
          const cards = ids.map((id) => porId.get(id)).filter((r): r is Rec => !!r);
          const ed = editable(col.id);
          return (
            <Soltable key={col.id || "none"} id={cid} datos={{ tipo: "columna", carril: laneId, col: col.id }}>
              {(zona) => (
                <Ordenable
                  id={idGrupo(laneId, col.id)}
                  datos={{ tipo: "grupo", carril: laneId, col: col.id }}
                  disabled={!ed}
                >
                  {(g) => (
                    <div
                      ref={(n) => {
                        zona.setNodeRef(n);
                        g.setNodeRef(n);
                      }}
                      className={`${size.col} shrink-0 rounded-lg p-2 ${g.isDragging ? "opacity-40" : ""}`}
                      style={{
                        background: tinte(col.color),
                        transform: CSS.Translate.toString(g.transform),
                        transition: g.transition,
                      }}
                    >
                      <div
                        ref={g.setActivatorNodeRef}
                        {...(ed ? { ...g.attributes, ...g.listeners } : {})}
                        className={`mb-2 flex items-center justify-between gap-1 px-1 text-sm font-medium ${
                          ed ? "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]" : ""
                        }`}
                      >
                        <span
                          className="min-w-0 truncate rounded px-1.5 py-0.5 text-xs"
                          style={{
                            background: OPTION_COLORS[col.color] ?? "var(--tag-default)",
                            color: "var(--tag-fg)",
                          }}
                        >
                          {col.label}
                        </span>
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
                          {(() => {
                            const clave = `${laneId ?? ""}|${col.id}`;
                            const abierto = menuCol === clave;
                            return (
                              <>
                                <button
                                  onClick={() => (abierto ? cerrarMenu() : setMenuCol(clave))}
                                  className="al-pasar toque-estrecho rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                                  title="Opciones del grupo"
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                                <button
                                  onClick={() =>
                                    addRecord.mutate({
                                      collectionId,
                                      cells: {
                                        ...(col.id
                                          ? {
                                              [groupField.id]: valueForColumn(col.id),
                                            }
                                          : {}),
                                        ...(subField && laneId
                                          ? {
                                              [subField.id]: valorDeGrupo(subField, laneId),
                                            }
                                          : {}),
                                      },
                                    })
                                  }
                                  className="al-pasar toque-estrecho rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                                  title="Nueva tarjeta"
                                >
                                  <Plus size={14} />
                                </button>
                                {abierto && (
                                  <Popover onClose={cerrarMenu} className="right-0 w-52 p-1">
                                    {renaming !== null ? (
                                      <input
                                        autoFocus
                                        value={renaming}
                                        onChange={(e) => setRenaming(e.target.value)}
                                        onBlur={() => renombrarGrupo(col.id, renaming)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") renombrarGrupo(col.id, renaming);
                                        }}
                                        className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none"
                                      />
                                    ) : (
                                      <>
                                        {ed && (
                                          <button
                                            onClick={() => setRenaming(col.label)}
                                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                                          >
                                            <Pencil size={14} /> Cambiar nombre
                                          </button>
                                        )}
                                        <button
                                          onClick={() => {
                                            cerrarMenu();
                                            setHiddenGroups([...hiddenGroups, col.id]);
                                          }}
                                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                                        >
                                          <EyeOff size={14} /> Ocultar grupo
                                        </button>
                                        {ed && (
                                          <>
                                            <button
                                              onClick={() => eliminarGrupo(col)}
                                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-red-500 hover:bg-[var(--hover)]"
                                            >
                                              <Trash2 size={14} /> Eliminar
                                            </button>
                                            <div className="my-1 border-t border-[var(--border)]" />
                                            <div className="px-2 py-1 text-xs text-[var(--muted)]">Colores</div>
                                            {COLOR_NAMES.map((c) => (
                                              <button
                                                key={c}
                                                onClick={() => colorearGrupo(col.id, c)}
                                                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                                              >
                                                <span
                                                  className="size-4 shrink-0 rounded border border-[var(--border)]"
                                                  style={{
                                                    background: OPTION_COLORS[c],
                                                  }}
                                                />
                                                {COLOR_LABELS[c]}
                                                {col.color === c && <Check size={14} className="ml-auto text-brand" />}
                                              </button>
                                            ))}
                                          </>
                                        )}
                                      </>
                                    )}
                                  </Popover>
                                )}
                              </>
                            );
                          })()}
                        </span>
                      </div>
                      <SortableContext items={ids} strategy={canReorder ? verticalListSortingStrategy : sinApartar}>
                        <div className="flex flex-col gap-2">
                          {cards.map((r) => (
                            <Ordenable key={r.id} id={r.id} datos={{ tipo: "tarjeta" }} animar={animarTarjetas}>
                              {(t) => (
                                <div
                                  ref={t.setNodeRef}
                                  {...t.attributes}
                                  {...t.listeners}
                                  style={{
                                    transform: CSS.Translate.toString(t.transform),
                                    transition: t.transition,
                                  }}
                                  onClick={() => abrir(r)}
                                  className={`${claseTarjeta} cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] hover:bg-[var(--hover)] ${
                                    t.isDragging ? "opacity-40" : ""
                                  }`}
                                >
                                  {cuerpoTarjeta(r)}
                                </div>
                              )}
                            </Ordenable>
                          ))}
                        </div>
                      </SortableContext>
                      <button
                        onClick={() =>
                          addRecord.mutate({
                            collectionId,
                            // La fila nueva nace en su columna y, con carriles, también en su carril.
                            cells: {
                              ...(col.id ? { [groupField.id]: valueForColumn(col.id) } : {}),
                              ...(subField && laneId
                                ? {
                                    [subField.id]: valorDeGrupo(subField, laneId),
                                  }
                                : {}),
                            },
                          })
                        }
                        className="mt-2 w-full rounded px-2 py-1 text-left text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        + Nueva
                      </button>
                    </div>
                  )}
                </Ordenable>
              )}
            </Soltable>
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
    </SortableContext>
  );

  // Carriles no vacíos del subagrupado (uno vacío no ocupa sitio).
  const carriles =
    subField && lanes
      ? lanes
          .map((l) => ({
            ...l,
            recs: records.filter((r) => claveDe(subField, lanes, r) === l.id),
          }))
          .filter((l) => l.recs.length)
      : null;

  // ── Arrastrar ─────────────────────────────────────────────────────────────
  // Solo los grupos que son opciones (select/estado) se renombran, recolorean,
  // reordenan o eliminan; «Sin asignar», nunca.
  const editable = (colId: string) => conOpciones && colId !== "";
  const tinte = (color: string) =>
    `color-mix(in srgb, ${OPTION_COLORS[color] ?? "var(--tag-default)"} 45%, var(--background))`;
  const porId = new Map(records.map((r) => [r.id, r]));
  // Reparto que viene del servidor: cada columna (de cada carril) con sus tarjetas.
  const base: Record<string, string[]> = {};
  for (const l of carriles ?? [{ id: null, recs: records }]) {
    for (const col of visibleColumns) base[idColumna(l.id, col.id)] = [];
    for (const r of l.recs) base[idColumna(l.id, columnOf(r))]?.push(r.id);
  }
  const items = vivo ?? base;
  const contDe = (v: Record<string, string[]>, id: string) => Object.keys(v).find((k) => v[k].includes(id));

  const claseTarjeta = `rounded-md border border-[var(--border)] bg-[var(--background)] ${size.card} shadow-sm`;
  const cuerpoTarjeta = (r: Rec) => {
    const preview = previewField ? String(r.cells?.[previewField.id] ?? "") : "";
    return (
      <>
        <RichText texto={cardTitle(r)} />
        {preview && (
          <div className="mt-1 line-clamp-3 break-words rounded bg-[var(--border)]/30 px-2 py-1 text-[0.9em] text-[var(--muted)]">
            {preview}
          </div>
        )}
      </>
    );
  };

  // Una columna arrastrada solo compite con las de su carril; una tarjeta, con
  // tarjetas y columnas. Si el puntero cae en el hueco de una columna (bajo la
  // última tarjeta, en la cabecera), cuenta la tarjeta más cercana de esa columna.
  const colision: CollisionDetection = (args) => {
    const a = datosDe(args.active);
    const tipoDe = (id: UniqueIdentifier) =>
      (args.droppableContainers.find((c) => c.id === id)?.data.current as DatosDnd | undefined)?.tipo;
    if (a?.tipo === "grupo") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => {
          const d = c.data.current as DatosDnd | undefined;
          return d?.tipo === "grupo" && d.carril === a.carril;
        }),
      });
    }
    const candidatos = args.droppableContainers.filter(
      (c) => (c.data.current as DatosDnd | undefined)?.tipo !== "grupo",
    );
    const enPuntero = pointerWithin({
      ...args,
      droppableContainers: candidatos,
    });
    const choques = enPuntero.length ? enPuntero : rectIntersection({ ...args, droppableContainers: candidatos });
    let over = choques.find((c) => tipoDe(c.id) === "tarjeta")?.id ?? getFirstCollision(choques, "id");
    if (over != null) {
      if (tipoDe(over) === "columna") {
        const ids = (vivoRef.current ?? base)[String(over)] ?? [];
        if (ids.length) {
          const cerca = closestCenter({
            ...args,
            droppableContainers: candidatos.filter((c) => ids.includes(String(c.id))),
          });
          over = cerca[0]?.id ?? over;
        }
      }
      ultimoOver.current = over;
      return [{ id: over }];
    }
    // Recién cambiada de columna, el tablero aún se está recolocando: aguanta.
    if (recienMovida.current) ultimoOver.current = args.active.id;
    return ultimoOver.current != null ? [{ id: ultimoOver.current }] : [];
  };

  const alEmpezar = ({ active }: DragStartEvent) => {
    const d = datosDe(active);
    if (!d) return;
    arrastrando.current = true;
    setActivo({ id: String(active.id), datos: d });
    if (d.tipo === "tarjeta") {
      const v = vivoRef.current ?? base;
      const cont = contDe(v, String(active.id));
      origen.current = cont ? { cont, idx: v[cont].indexOf(String(active.id)) } : null;
      instantanea.current = v;
      ponVivo(v);
    }
    // En el móvil, un toque de vibración al «levantar» (donde se pueda).
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
  };

  // Al pasar a otra columna (u otro carril) la tarjeta se muda ya, para que
  // allí se le abra hueco; dentro de la misma columna lo resuelve el ordenable.
  const alPasar = ({ active, over }: DragOverEvent) => {
    if (datosDe(active)?.tipo !== "tarjeta" || !over) return;
    const v = vivoRef.current;
    if (!v) return;
    const id = String(active.id);
    const o = datosDe(over);
    const desde = contDe(v, id);
    const hacia = o?.tipo === "columna" ? String(over.id) : contDe(v, String(over.id));
    if (!desde || !hacia || desde === hacia) return;
    const destino = v[hacia];
    let idx = destino.length;
    if (canReorder && o?.tipo === "tarjeta") {
      const i = destino.indexOf(String(over.id));
      const caja = active.rect.current.translated;
      const debajo = caja ? caja.top + caja.height / 2 > over.rect.top + over.rect.height / 2 : false;
      if (i >= 0) idx = i + (debajo ? 1 : 0);
    }
    recienMovida.current = true;
    ponVivo({
      ...v,
      [desde]: v[desde].filter((x) => x !== id),
      [hacia]: [...destino.slice(0, idx), id, ...destino.slice(idx)],
    });
  };

  // Sin cambios pendientes de confirmar, se vuelve a pintar lo del servidor.
  const terminar = () => {
    if (pendientes.current === 0 && !arrastrando.current) ponVivo(null);
  };
  const alCancelar = () => {
    arrastrando.current = false;
    setActivo(null);
    origen.current = null;
    ultimoOver.current = null;
    if (pendientes.current) ponVivo(instantanea.current);
    else terminar();
  };

  const alSoltar = ({ active, over }: DragEndEvent) => {
    const d = datosDe(active);
    if (!over) return alCancelar();
    arrastrando.current = false;
    setActivo(null);
    ultimoOver.current = null;
    if (d?.tipo === "grupo") return soltarGrupo(active, over);
    const id = String(active.id);
    const v = vivoRef.current ?? base;
    const cont = contDe(v, id);
    const de = origen.current;
    origen.current = null;
    const rec = porId.get(id);
    if (!cont || !de || !rec) return terminar();
    let lista = v[cont];
    if (canReorder && datosDe(over)?.tipo === "tarjeta" && over.id !== active.id && lista.includes(String(over.id)))
      lista = arrayMove(lista, lista.indexOf(id), lista.indexOf(String(over.id)));
    const idx = lista.indexOf(id);
    const [carril, col] = leeId(cont);
    const cambios: Promise<unknown>[] = [];
    if (columnOf(rec) !== col)
      cambios.push(
        cambiarCelda.mutateAsync({
          recordId: id,
          fieldId: groupField.id,
          value: valueForColumn(col),
        }),
      );
    // Soltar dentro de otro carril también adopta su valor de subgrupo.
    if (subField && lanes && carril !== null && claveDe(subField, lanes, rec) !== carril)
      cambios.push(
        cambiarCelda.mutateAsync({
          recordId: id,
          fieldId: subField.id,
          value: valorDeGrupo(subField, carril),
        }),
      );
    if (canReorder && (cont !== de.cont || idx !== de.idx)) {
      const antes = lista[idx - 1];
      const despues = lista[idx + 1];
      if (antes) cambios.push(moverFila.mutateAsync({ id, afterId: antes }));
      else if (despues) cambios.push(moverFila.mutateAsync({ id, beforeId: despues }));
    }
    if (!cambios.length) return terminar();
    // Se queda donde se soltó mientras se guarda; luego manda el servidor.
    ponVivo({ ...v, [cont]: lista });
    pendientes.current++;
    void Promise.allSettled(cambios)
      .then(() => invalidate())
      .finally(() => {
        pendientes.current--;
        terminar();
      });
  };

  // Soltar una columna entre otras reordena las opciones del campo (las ocultas
  // no se mueven). En Estado además adopta el grupo (Por hacer / En curso /
  // Hecho) de la columna sobre la que cae, como al reordenar en la celda.
  const soltarGrupo = (active: Active, over: Over) => {
    const a = datosDe(active);
    const o = datosDe(over);
    if (a?.tipo !== "grupo" || o?.tipo !== "grupo" || a.col === o.col) return;
    const visibles = visibleColumns.filter((c) => editable(c.id)).map((c) => c.id);
    const desde = visibles.indexOf(a.col);
    const hasta = visibles.indexOf(o.col);
    if (desde < 0 || hasta < 0) return;
    const nuevo = arrayMove(visibles, desde, hasta);
    const opts = optionsOf(groupField);
    const src = opts.find((x) => x.id === a.col);
    const dest = opts.find((x) => x.id === o.col);
    if (!src || !dest) return;
    const movida = groupField.type === "status" ? { ...src, group: dest.group ?? "todo" } : src;
    const resto = opts.filter((x) => x.id !== a.col);
    const siguiente = nuevo[hasta + 1];
    const pos = siguiente
      ? resto.findIndex((x) => x.id === siguiente)
      : resto.findIndex((x) => x.id === nuevo[hasta - 1]) + 1;
    resto.splice(pos, 0, movida);
    setOrdenGrupos(resto.map((x) => x.id));
    const cfg = (groupField.config as { options?: Option[] }) ?? {};
    updateField
      .mutateAsync({ id: groupField.id, config: { ...cfg, options: resto } })
      .catch(() => {})
      .finally(() => setOrdenGrupos(null));
  };

  // Lo que va pegado al puntero: la tarjeta, o la columna con sus primeras tarjetas.
  const capa = (() => {
    if (!activo) return null;
    if (activo.datos.tipo === "tarjeta") {
      const r = porId.get(activo.id);
      return r ? (
        <div className={`${claseTarjeta} rotate-[1.5deg] cursor-grabbing shadow-xl`}>{cuerpoTarjeta(r)}</div>
      ) : null;
    }
    if (activo.datos.tipo !== "grupo") return null;
    const { carril, col: colId } = activo.datos;
    const col = columns.find((c) => c.id === colId);
    if (!col) return null;
    const ids = items[idColumna(carril, colId)] ?? [];
    const muestra = ids
      .slice(0, 5)
      .map((id) => porId.get(id))
      .filter((r): r is Rec => !!r);
    return (
      <div
        className="rotate-[1.5deg] cursor-grabbing rounded-lg p-2 shadow-2xl"
        style={{ background: tinte(col.color) }}
      >
        <div className="mb-2 flex items-center justify-between gap-1 px-1 text-sm font-medium">
          <span
            className="min-w-0 truncate rounded px-1.5 py-0.5 text-xs"
            style={{
              background: OPTION_COLORS[col.color] ?? "var(--tag-default)",
              color: "var(--tag-fg)",
            }}
          >
            {col.label}
          </span>
          <span className="text-[var(--muted)]">{ids.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          {muestra.map((r) => (
            <div key={r.id} className={claseTarjeta}>
              {cuerpoTarjeta(r)}
            </div>
          ))}
        </div>
        {ids.length > muestra.length && (
          <div className="px-1 pt-2 text-xs text-[var(--muted)]">+{ids.length - muestra.length} más</div>
        )}
      </div>
    );
  })();

  return (
    <ScrollHorizontal className="pb-4">
      <DndContext
        sensors={sensores}
        collisionDetection={colision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={alEmpezar}
        onDragOver={alPasar}
        onDragEnd={alSoltar}
        onDragCancel={alCancelar}
        // Desplazar al acercarse al borde, pero con una franja estrecha: en el
        // móvil la columna de al lado ya cae cerca del borde y, con la de serie
        // (20 %), el tablero se iba corriendo solo mientras se apuntaba a ella.
        autoScroll={{ threshold: { x: 0.1, y: 0.1 }, acceleration: 6 }}
      >
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
                      style={{
                        background: OPTION_COLORS[l.color] ?? "var(--tag-default)",
                        color: "var(--tag-fg)",
                      }}
                    >
                      {l.label}
                    </span>
                    <span className="text-xs font-normal text-[var(--muted)]">{l.recs.length}</span>
                  </button>
                  {!plegado && filaColumnas(l.id, i === 0)}
                </div>
              );
            })}
          </div>
        ) : (
          filaColumnas(null, true)
        )}
        {enCliente &&
          createPortal(
            <DragOverlay
              dropAnimation={{
                duration: 200,
                easing: "cubic-bezier(0.25, 1, 0.5, 1)",
                sideEffects: defaultDropAnimationSideEffects({
                  styles: { active: { opacity: "0.4" } },
                }),
              }}
            >
              {capa}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>

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
