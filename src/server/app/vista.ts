/**
 * Las filas de una vista de base de datos, calculadas en el servidor para la app
 * nativa con el MISMO motor que usa la web en el navegador: fórmulas y rollups
 * (`calculaComputados`) fundidos en las celdas (`conComputados`), filtros y orden
 * (`applyViewConfig`), la búsqueda de la lupa sobre el texto visible
 * (`displayValue`), la agrupación (`groupBy`), los totales (`computeCalc`) y el
 * color de fila (reglas y etiqueta). La app solo pinta.
 */
import { applyViewConfig, conComputados, matchesFilters, type ColorRule, type DbField, type DbRecord } from "@/lib/viewData";
import { displayValue, groupBy, optionsOf } from "@/lib/cellText";
import { computeCalc } from "@/lib/calc";
import { claveCelda, esEje, gruposVisibles, repartoMatriz, type Celda } from "@/lib/matriz";
import { calculaComputados } from "../services/computados";
import { cellToText } from "../services/cells";

type DB = typeof import("@/lib/db").db;

/** Color (nombre de los de Notion: "red", "blue"…) de la fila: primero las reglas, luego la etiqueta. */
function colorDeFila(r: DbRecord, fields: DbField[], cfg: Record<string, unknown>, userId: string): string | null {
  const reglas = (Array.isArray(cfg.colorRules) ? cfg.colorRules : []) as ColorRule[];
  const regla = reglas.find((x) => matchesFilters(r, fields, x.filters ?? [], userId));
  if (regla) return regla.color;
  const campo = fields.find((f) => f.id === cfg.rowColorFieldId);
  if (!campo) return null;
  const v = r.cells[campo.id];
  const id = Array.isArray(v) ? v[0] : v;
  const opt = id ? optionsOf(campo).find((o) => o.id === id) : undefined;
  return opt ? (opt.color ?? "gray") : null;
}

export async function calculaVista(
  db: DB,
  quien: { workspaceId: string; userId: string },
  pageId: string,
  viewId: string | null | undefined,
  q: string | null | undefined,
  /** Solo esta fila y sus subtareas, sin los filtros de la vista (la ficha de una fila). */
  soloFila?: string,
) {
  const col = await db.collection.findUnique({
    where: { pageId },
    include: {
      fields: { orderBy: { order: "asc" } },
      views: { orderBy: { order: "asc" } },
      records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
    },
  });
  if (!col) return null;
  const view = col.views.find((v) => v.id === viewId) ?? col.views[0] ?? null;
  const cfg = ((view?.config ?? {}) as Record<string, unknown>) ?? {};
  const fields = col.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config })) as DbField[];

  // Miembros del espacio (para personas, «Creado por» y la búsqueda por nombre).
  const miembros = await db.member.findMany({
    where: { workspaceId: quien.workspaceId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const people = new Map(miembros.map((m) => [m.user.id, m.user.name || m.user.email]));

  const computados = await calculaComputados(db, quien.workspaceId, col);
  const base: DbRecord[] = conComputados(
    col.records.map((r) => ({
      id: r.id,
      cells: (r.cells ?? {}) as Record<string, unknown>,
      order: r.order,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      createdById: r.createdById,
      updatedById: r.updatedById,
    })),
    computados.rollups,
  );
  let filas = soloFila
    ? base.filter((r) => r.id === soloFila || col.records.find((x) => x.id === r.id)?.parentId === soloFila)
    : applyViewConfig(base, fields, cfg, quien.userId);
  const aguja = (q ?? "").trim().toLowerCase();
  if (aguja) {
    filas = filas.filter((r) => fields.some((f) => displayValue(f, r.cells?.[f.id], people).toLowerCase().includes(aguja)));
  }

  const crudo = new Map(col.records.map((r) => [r.id, r]));
  const salida = filas.map((r) => {
    const rec = crudo.get(r.id)!;
    return {
      id: r.id,
      parentId: rec.parentId,
      cells: r.cells,
      // El texto que enseña la web en cada celda (fechas, números con formato, etiquetas…).
      textos: Object.fromEntries(
        fields.map((f) => {
          const calculado = computados.rollups[r.id]?.[f.id];
          const t =
            f.type === "formula" || f.type === "rollup"
              ? calculado === undefined || calculado === null ? "" : String(calculado)
              : f.type === "id"
                ? rec.seq == null ? "" : `${(f.config as { prefix?: string } | null)?.prefix ?? ""}${rec.seq}`
                : f.type === "created_by" || f.type === "last_edited_by"
                  ? cellToText(f, undefined, rec, people)
                  // Fecha y hora de creación/edición: las pinta la app en la zona del móvil.
                  : f.type === "created_time" || f.type === "last_edited_time"
                    ? ""
                    : displayValue(f, r.cells[f.id], people);
          return [f.id, t];
        }),
      ),
      relaciones: computados.relationLabels[r.id] ?? {},
      color: colorDeFila(r, fields, cfg, quien.userId),
      seq: rec.seq,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      createdById: rec.createdById,
      updatedById: rec.updatedById,
    };
  });

  const calcs = (cfg.calcs ?? {}) as Record<string, string>;
  const totales = (rs: DbRecord[]) =>
    Object.fromEntries(fields.filter((f) => calcs[f.id]).map((f) => [f.id, computeCalc(calcs[f.id], f, rs)]));

  // Agrupar aplana las subtareas (cada fila a su grupo), como en la web.
  const campoGrupo = fields.find((f) => f.id === cfg.groupByFieldId);
  const campoSubgrupo =
    campoGrupo && cfg.subGroupByFieldId !== campoGrupo.id ? fields.find((f) => f.id === cfg.subGroupByFieldId) : undefined;
  // La Matriz no existe en la app: se le sirve como tabla agrupada por sus dos ejes
  // (filas y, dentro, columnas), con el rótulo de cada celda (Hacer, Planificar…).
  const ejeX = view?.type === "matrix" ? fields.find((f) => f.id === cfg.ejeX && esEje(f)) : undefined;
  const ejeY = view?.type === "matrix" ? fields.find((f) => f.id === cfg.ejeY && esEje(f) && f.id !== ejeX?.id) : undefined;
  const matriz =
    ejeX && ejeY
      ? (() => {
          const reparto = repartoMatriz(filas, ejeX, ejeY);
          const celdas = (cfg.celdas ?? {}) as Record<string, Celda>;
          const columnas = gruposVisibles(ejeX, ejeY, reparto, true);
          return gruposVisibles(ejeY, ejeX, reparto, false).map((y) => {
            const sub = columnas.map((x) => {
              const recs = reparto.get(claveCelda(x.id, y.id)) ?? [];
              const rotulo = celdas[claveCelda(x.id, y.id)]?.rotulo;
              const etiqueta = rotulo ? `${rotulo} · ${x.label}` : x.label;
              return { clave: etiqueta, etiqueta, ids: recs.map((r) => r.id), totales: totales(recs) };
            });
            const recs = columnas.flatMap((x) => reparto.get(claveCelda(x.id, y.id)) ?? []);
            return { clave: y.label, etiqueta: y.label, ids: recs.map((r) => r.id), totales: totales(recs), subgrupos: sub };
          });
        })()
      : null;
  const grupos = matriz ?? (campoGrupo
    ? groupBy(filas, campoGrupo, people).map((g) => ({
        clave: g.key,
        etiqueta: g.label,
        ids: g.records.map((r) => r.id),
        totales: totales(g.records),
        subgrupos: campoSubgrupo
          ? groupBy(g.records, campoSubgrupo, people).map((s) => ({
              clave: s.key,
              etiqueta: s.label,
              ids: s.records.map((r) => r.id),
              totales: totales(s.records),
            }))
          : null,
      }))
    : null);

  return {
    collection: { id: col.id, name: col.name, description: col.description, templates: col.templates },
    fields: col.fields,
    views: col.views,
    view,
    personas: [...people].map(([id, nombre]) => ({ id, nombre })),
    filas: salida,
    total: col.records.length,
    grupos,
    totales: totales(filas),
  };
}
