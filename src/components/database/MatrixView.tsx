"use client";

/**
 * Vista «Matriz»: una rejilla con un campo en cada eje (casilla, selección o estado),
 * como la matriz de Eisenhower (Urgente × Importante). Cada tarjeta cae sola en la
 * celda de sus dos valores; al arrastrarla a otra celda se le ponen los dos de esa, y
 * «+ Nueva» crea la fila ya con ellos. Cada celda puede llevar rótulo y color
 * (view.config.celdas). La lógica pura está en src/lib/matriz.ts.
 *
 * Arrastrar es como en el Kanban: ratón al mover 5 px, táctil con pulsación larga.
 */
import { BarraColor } from "@/components/ColorPagina";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { displayValue, OPTION_COLORS, rowColor, type FieldLite } from "@/lib/cellText";
import { colorByRules, type ColorRule, type DbField, type DbRecord } from "@/lib/viewData";
import { claveCelda, claveEje, esEje, gruposEje, gruposVisibles, repartoMatriz, valorEje, type Celda } from "@/lib/matriz";
import { COLOR_LABELS, COLOR_NAMES, usePeople } from "./Cell";
import { Popover } from "./Popover";
import { RecordPanel } from "./RecordPanel";
import { Casilla, useMarcarCasilla } from "./Casilla";
import { ScrollHorizontal } from "./ScrollHorizontal";

type Rec = { id: string; cells: Record<string, unknown>; order: string; color?: string | null };
type Config = {
  ejeX?: string;
  ejeY?: string;
  celdas?: Record<string, Celda>;
  rowColorFieldId?: string;
  colorRules?: ColorRule[];
  cardPreview?: string;
};

// Sobre botones o campos, pulsar es pulsar: no arranca un arrastre (como en el Kanban).
const NO_ARRASTRA = "button, input, textarea, select, a, [data-menu]";
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
// Cuenta la celda bajo el puntero; si no hay ninguna (entre dos), la que más se solape.
const colision: CollisionDetection = (args) => {
  const p = pointerWithin(args);
  return p.length ? p : rectIntersection(args);
};

const tinte = (color: string | undefined, pct = 35) =>
  color ? `color-mix(in srgb, ${OPTION_COLORS[color] ?? "var(--tag-default)"} ${pct}%, var(--background))` : undefined;

export function MatrixView({
  pageId,
  collectionId,
  fields,
  records,
  view,
  canEdit,
  openIn = "side",
  openFull,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  view: { id: string; config: unknown };
  canEdit: boolean;
  openIn?: "side" | "center" | "full";
  openFull?: (recId: string) => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const cambiarCelda = trpc.db.updateCell.useMutation();
  const marcar = useMarcarCasilla(pageId);
  const people = usePeople();
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const abrir = (r: Rec) => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r));
  // Tarjetas soltadas en otra celda, hasta que el servidor lo confirme: id → "x|y".
  const [movidas, setMovidas] = useState<Record<string, string>>({});
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const sensores = useSensors(
    useSensor(Raton, { activationConstraint: { distance: 5 } }),
    useSensor(Tactil, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const enCliente = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const cfg = (view.config ?? {}) as Config;
  const fx = fields.find((f) => f.id === cfg.ejeX && esEje(f));
  const fy = fields.find((f) => f.id === cfg.ejeY && esEje(f) && f.id !== fx?.id);
  const guardar = (patch: Partial<Config>) => updateView.mutate({ id: view.id, config: { ...cfg, ...patch } });

  if (!fx || !fy) {
    const ejes = fields.filter(esEje);
    return (
      <div className="max-w-md px-2 py-6 text-sm text-[var(--muted)]">
        <p className="mb-3">
          La matriz reparte las tarjetas por dos campos de tipo <b>Casilla</b>, <b>Selección</b> o <b>Estado</b>, uno en cada eje
          (por ejemplo, Urgente e Importante).
        </p>
        {canEdit && ejes.length >= 2 ? (
          <div className="space-y-2 text-[var(--foreground)]">
            {(["ejeX", "ejeY"] as const).map((k) => (
              <label key={k} className="flex items-center justify-between gap-2">
                <span>{k === "ejeX" ? "Columnas" : "Filas"}</span>
                <select
                  value={(k === "ejeX" ? fx?.id : fy?.id) ?? ""}
                  onChange={(e) => guardar({ [k]: e.target.value || undefined })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5"
                >
                  <option value="">Elegir campo…</option>
                  {ejes.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : (
          ejes.length < 2 && <p>Añade a la base de datos dos campos de esos tipos.</p>
        )}
      </div>
    );
  }

  const gx = gruposEje(fx);
  const gy = gruposEje(fy);
  const conMovidas = records.map((r) => {
    const k = movidas[r.id];
    if (!k) return r;
    const [x, y] = k.split("|");
    return { ...r, cells: { ...r.cells, [fx.id]: valorEje(fx, x), [fy.id]: valorEje(fy, y) } };
  });
  const reparto = repartoMatriz(conMovidas, fx, fy);
  const columnas = gruposVisibles(fx, fy, reparto, true);
  const filas = gruposVisibles(fy, fx, reparto, false);
  const porId = new Map(records.map((r) => [r.id, r]));

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const previewField = cfg.cardPreview && cfg.cardPreview !== "none" ? fields.find((f) => f.id === cfg.cardPreview) : undefined;
  const colorField = fields.find((f) => f.id === cfg.rowColorFieldId);
  const colorDe = (r: Rec) =>
    colorByRules(r as unknown as DbRecord, fields as unknown as DbField[], cfg.colorRules ?? []) ?? rowColor(colorField, r.cells);
  const titulo = (r: Rec) => {
    const v = titleField ? r.cells?.[titleField.id] : undefined;
    return (typeof v === "string" && v) || "Sin título";
  };
  const celdas = cfg.celdas ?? {};
  const ponCelda = (k: string, c: Celda) => guardar({ celdas: { ...celdas, [k]: { ...celdas[k], ...c } } });

  const alSoltar = ({ active, over }: DragEndEvent) => {
    setArrastrada(null);
    if (!over) return;
    const id = String(active.id);
    const r = porId.get(id);
    const [x, y] = String(over.id).split("|");
    if (!r) return;
    const cambios: Promise<unknown>[] = [];
    if (claveEje(fx, gx, r.cells) !== x) cambios.push(cambiarCelda.mutateAsync({ recordId: id, fieldId: fx.id, value: valorEje(fx, x) }));
    if (claveEje(fy, gy, r.cells) !== y) cambios.push(cambiarCelda.mutateAsync({ recordId: id, fieldId: fy.id, value: valorEje(fy, y) }));
    if (!cambios.length) return;
    setMovidas((m) => ({ ...m, [id]: String(over.id) }));
    void Promise.allSettled(cambios)
      .then(() => invalidate())
      .finally(() =>
        setMovidas((m) => {
          const resto = { ...m };
          delete resto[id];
          return resto;
        }),
      );
  };

  const cuerpo = (r: Rec) => {
    if (previewField?.type === "checkbox")
      return (
        <>
          <div className="flex gap-1.5">
            <BarraColor color={r.color} />
            <span className="min-w-0"><RichText texto={titulo(r)} /></span>
          </div>
          <div className="mt-1 flex">
            <Casilla
              marcada={Boolean(r.cells?.[previewField.id])}
              nombre={previewField.name}
              conNombre
              onCambia={canEdit ? (v) => marcar(r.id, previewField.id, v) : undefined}
            />
          </div>
        </>
      );
    const preview = previewField ? displayValue(previewField, r.cells?.[previewField.id], people) : "";
    return (
      <>
        <div className="flex gap-1.5">
          <BarraColor color={r.color} />
          <span className="min-w-0"><RichText texto={titulo(r)} /></span>
        </div>
        {preview && <div className="mt-1 line-clamp-2 break-words text-xs text-[var(--muted)]">{preview}</div>}
      </>
    );
  };
  const claseTarjeta = "rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm shadow-sm";
  const arrastradaRec = arrastrada ? porId.get(arrastrada) : undefined;

  return (
    <ScrollHorizontal className="pb-4">
      <DndContext
        sensors={sensores}
        collisionDetection={colision}
        onDragStart={({ active }) => {
          setArrastrada(String(active.id));
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
        }}
        onDragEnd={alSoltar}
        onDragCancel={() => setArrastrada(null)}
        autoScroll={{ threshold: { x: 0.1, y: 0.1 }, acceleration: 6 }}
      >
        <div
          className="matriz grid gap-2"
          style={{ gridTemplateColumns: `max-content repeat(${columnas.length}, minmax(8.5rem, 1fr))` }}
          data-matriz=""
        >
          {/* Cabecera de columnas (eje horizontal). */}
          <div className="hidden self-end pb-1 text-[11px] text-[var(--muted)] md:block">
            {fy.name} ↓ · {fx.name} →
          </div>
          <div className="md:hidden" />
          {columnas.map((c) => (
            <div key={`x${c.id}`} className="flex items-end pb-1">
              <span className="truncate rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: OPTION_COLORS[c.color] ?? "var(--tag-default)", color: "var(--tag-fg)" }}>
                {c.label}
              </span>
            </div>
          ))}
          {filas.map((f) => (
            <FilaMatriz key={`y${f.id}`}>
              {/* Cabecera de fila (eje vertical). */}
              {/* En el móvil, en vertical: así caben dos celdas a lo ancho. */}
              <div className="flex items-start pt-2">
                <span className="rotate-180 whitespace-nowrap rounded px-0.5 py-1.5 text-xs font-medium [writing-mode:vertical-rl] md:rotate-0 md:px-1.5 md:py-0.5 md:[writing-mode:horizontal-tb]" style={{ background: OPTION_COLORS[f.color] ?? "var(--tag-default)", color: "var(--tag-fg)" }}>
                  {f.label}
                </span>
              </div>
              {columnas.map((c) => {
                const k = claveCelda(c.id, f.id);
                const celda = celdas[k] ?? {};
                const tarjetas = reparto.get(k) ?? [];
                const valores = { ...(c.id ? { [fx.id]: valorEje(fx, c.id) } : {}), ...(f.id ? { [fy.id]: valorEje(fy, f.id) } : {}) };
                return (
                  <CeldaSoltable key={k} id={k}>
                    {(zona) => (
                      <div
                        ref={zona.setNodeRef}
                        data-celda={k}
                        className={`flex min-h-36 flex-col rounded-lg p-2 transition-shadow ${zona.isOver ? "ring-2 ring-brand" : ""}`}
                        style={{ background: tinte(celda.color) ?? "var(--hover)" }}
                      >
                        <div className="relative mb-1.5 flex items-center gap-1 px-0.5">
                          {celda.rotulo && <span className="min-w-0 truncate text-sm font-semibold">{celda.rotulo}</span>}
                          <span className="text-xs text-[var(--muted)]">{tarjetas.length}</span>
                          {canEdit && (
                            <span className="ml-auto flex items-center">
                              <button
                                onClick={() => setMenu(menu === k ? null : k)}
                                className="al-pasar toque-estrecho rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                                title="Rótulo y color de la celda"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                              <button
                                onClick={() => addRecord.mutate({ collectionId, cells: valores })}
                                className="al-pasar toque-estrecho rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                                title="Nueva tarjeta en esta celda"
                              >
                                <Plus size={14} />
                              </button>
                            </span>
                          )}
                          {menu === k && (
                            <Popover onClose={() => setMenu(null)} className="right-0 w-56 p-2">
                              <input
                                autoFocus
                                defaultValue={celda.rotulo ?? ""}
                                placeholder="Rótulo (p. ej. Hacer)"
                                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                onBlur={(e) => e.target.value !== (celda.rotulo ?? "") && ponCelda(k, { rotulo: e.target.value.trim() })}
                                className="mb-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
                              />
                              <div className="px-1 pb-1 text-xs text-[var(--muted)]">Color</div>
                              {COLOR_NAMES.map((col) => (
                                <button
                                  key={col}
                                  onClick={() => ponCelda(k, { color: col === "default" ? undefined : col })}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                                >
                                  <span className="size-4 shrink-0 rounded border border-[var(--border)]" style={{ background: OPTION_COLORS[col] }} />
                                  {COLOR_LABELS[col]}
                                  {(celda.color ?? "default") === col && <Check size={14} className="ml-auto text-brand" />}
                                </button>
                              ))}
                            </Popover>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {tarjetas.map((r) => (
                            <Tarjeta key={r.id} id={r.id} disabled={!canEdit}>
                              {(t) => (
                                <div
                                  ref={t.setNodeRef}
                                  {...t.attributes}
                                  {...t.listeners}
                                  onClick={() => abrir(r)}
                                  style={{ background: colorDe(r) }}
                                  className={`${claseTarjeta} cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] hover:border-brand ${t.isDragging ? "opacity-40" : ""}`}
                                >
                                  {cuerpo(r)}
                                </div>
                              )}
                            </Tarjeta>
                          ))}
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => addRecord.mutate({ collectionId, cells: valores })}
                            className="mt-auto w-full rounded px-1 pt-2 text-left text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                          >
                            + Nueva
                          </button>
                        )}
                      </div>
                    )}
                  </CeldaSoltable>
                );
              })}
            </FilaMatriz>
          ))}
        </div>
        {enCliente &&
          createPortal(
            <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}>
              {arrastradaRec ? (
                <div className={`${claseTarjeta} rotate-[1.5deg] cursor-grabbing shadow-xl`} style={{ background: colorDe(arrastradaRec) }}>
                  {cuerpo(arrastradaRec)}
                </div>
              ) : null}
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

/** Una fila de la rejilla: sus hijos se colocan solos en las columnas del grid. */
const FilaMatriz = ({ children }: { children: React.ReactNode }) => <div className="contents">{children}</div>;

function CeldaSoltable({ id, children }: { id: string; children: (d: ReturnType<typeof useDroppable>) => React.ReactNode }) {
  const d = useDroppable({ id });
  return <>{children(d)}</>;
}

function Tarjeta({ id, disabled, children }: { id: string; disabled: boolean; children: (d: ReturnType<typeof useDraggable>) => React.ReactNode }) {
  const d = useDraggable({ id, disabled });
  return <>{children(d)}</>;
}
