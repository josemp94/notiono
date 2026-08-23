/**
 * Cálculo de los campos derivados de una base de datos: etiquetas de relación,
 * rollups y fórmulas. Vivía dentro del procedimiento tRPC `db.computed`; ahora lo
 * comparten ese procedimiento, la gráfica (`chartData`) y la API REST (`/query`),
 * para que filtrar por una fórmula dé el mismo resultado en los tres sitios.
 */
import { aFecha, evalFormula, type Val } from "../formula";
import { dateValue } from "@/lib/cellText";
import { agregaRollup } from "@/lib/rollup";
import { peopleOf } from "./cells";

type DB = typeof import("@/lib/db").db;

type FieldRow = { id: string; name: string; type: string; config: unknown };
type RecordRow = {
  id: string;
  cells: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  updatedById: string | null;
  seq: number | null;
};

export type Computados = {
  /** recordId -> fieldId de relación -> filas enlazadas con su título. */
  relationLabels: Record<string, Record<string, { id: string; title: string }[]>>;
  /** recordId -> fieldId de rollup/fórmula -> valor calculado. */
  rollups: Record<string, Record<string, string | number>>;
};

export async function calculaComputados(
  db: DB,
  workspaceId: string,
  col: { fields: FieldRow[]; records: RecordRow[] },
): Promise<Computados> {
  const relationFields = col.fields.filter((f) => f.type === "relation");
  const rollupFields = col.fields.filter((f) => f.type === "rollup");
  const formulaFields = col.fields.filter((f) => f.type === "formula");

  // Nombres para los campos de persona (vacío si la BD no los usa).
  const people = await peopleOf(db, workspaceId, col.fields);

  // Valor de un campo para el contexto de fórmulas 2.0: fechas como Date,
  // multiselect/persona como LISTAS (para map/filter/join…), lo demás escalar.
  // Las relaciones se resuelven aparte (lista de títulos, ya calculada).
  const valorDe = (field: FieldRow, cellVal: unknown, rec: RecordRow): Val => {
    if (field.type === "created_time") return rec.createdAt;
    if (field.type === "last_edited_time") return rec.updatedAt;
    if (field.type === "created_by") return people.get(rec.createdById ?? "") ?? null;
    if (field.type === "last_edited_by") return people.get(rec.updatedById ?? "") ?? null;
    if (field.type === "id") return rec.seq ?? null;
    if (cellVal === undefined || cellVal === null || cellVal === "") return null;
    const opts = ((field.config as { options?: { id: string; label: string }[] }).options) ?? [];
    const etiqueta = (v: unknown) => opts.find((o) => o.id === v)?.label ?? String(v);
    if (field.type === "select" || field.type === "status") return etiqueta(cellVal);
    if (field.type === "multiselect") return Array.isArray(cellVal) ? cellVal.map(etiqueta) : [];
    if (field.type === "person")
      return Array.isArray(cellVal) ? cellVal.map((id) => people.get(String(id)) ?? "—") : [];
    if (field.type === "checkbox") return Boolean(cellVal);
    if (field.type === "number") return Number(cellVal);
    if (field.type === "date") return aFecha(dayHourOf(cellVal));
    return typeof cellVal === "string" ? cellVal : String(cellVal);
  };
  // El valor de fecha guarda {start,end} o el string antiguo: se coge el inicio.
  const dayHourOf = (v: unknown): string => {
    const d = dateValue(v);
    return d?.start ?? "";
  };

  // Cargar las colecciones destino referenciadas por las relaciones.
  const targetColIds = [
    ...new Set(
      relationFields
        .map((f) => (f.config as { targetCollectionId?: string })?.targetCollectionId)
        .filter((x): x is string => !!x),
    ),
  ];
  const targetCols = await db.collection.findMany({
    where: { id: { in: targetColIds }, page: { workspaceId } },
    include: { fields: { orderBy: { order: "asc" } }, records: true },
  });
  // Índice: colección destino -> (recordId -> {title, cells}), y su titleFieldId.
  const targetIndex = new Map<
    string,
    { titleFieldId: string | null; recs: Map<string, Record<string, unknown>>; titles: Map<string, string> }
  >();
  for (const tc of targetCols) {
    const titleField = tc.fields.find((f) => f.type === "text") ?? tc.fields[0];
    const recs = new Map<string, Record<string, unknown>>();
    const titles = new Map<string, string>();
    for (const r of tc.records) {
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      recs.set(r.id, cells);
      const t = titleField ? cells[titleField.id] : "";
      titles.set(r.id, (typeof t === "string" && t) || "Sin título");
    }
    targetIndex.set(tc.id, { titleFieldId: titleField?.id ?? null, recs, titles });
  }

  const relIdsOf = (cells: Record<string, unknown>, fieldId: string): string[] => {
    const v = cells[fieldId];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  };

  const relationLabels: Computados["relationLabels"] = {};
  const rollups: Computados["rollups"] = {};

  for (const rec of col.records) {
    const cells = (rec.cells ?? {}) as Record<string, unknown>;
    // etiquetas de relación
    for (const rf of relationFields) {
      const tcid = (rf.config as { targetCollectionId?: string })?.targetCollectionId;
      const idx = tcid ? targetIndex.get(tcid) : undefined;
      const ids = relIdsOf(cells, rf.id);
      const labels = ids.map((id) => ({ id, title: idx?.titles.get(id) ?? "—" }));
      (relationLabels[rec.id] ??= {})[rf.id] = labels;
    }
    // rollups
    for (const rup of rollupFields) {
      const cfg = (rup.config ?? {}) as { relationFieldId?: string; targetFieldId?: string | null; agg?: string };
      const relField = relationFields.find((f) => f.id === cfg.relationFieldId);
      const tcid = relField ? (relField.config as { targetCollectionId?: string })?.targetCollectionId : undefined;
      const idx = tcid ? targetIndex.get(tcid) : undefined;
      const ids = relField ? relIdsOf(cells, relField.id) : [];
      const agg = cfg.agg ?? "count";
      let out: string | number = 0;
      if (agg === "count") {
        out = ids.length;
      } else if (cfg.targetFieldId && idx) {
        const tf = targetCols.find((t) => t.id === tcid)?.fields.find((f) => f.id === cfg.targetFieldId);
        const raw = ids.map((id) => idx.recs.get(id)?.[cfg.targetFieldId!]).filter((v) => v !== undefined && v !== null && v !== "");
        // Las opciones (select/multiselect/estado) se muestran por su etiqueta.
        const opts = ((tf?.config as { options?: { id: string; label: string }[] })?.options) ?? [];
        const unaEtiqueta = (v: unknown) => opts.find((o) => o.id === v)?.label ?? String(v);
        const toLabel = (v: unknown) => (Array.isArray(v) ? v.map(unaEtiqueta).join(", ") : unaEtiqueta(v));
        out = agregaRollup(agg, ids.length, raw, toLabel);
      }
      (rollups[rec.id] ??= {})[rup.id] = out;
    }
    // fórmulas (pueden referenciar otros campos y rollups por nombre)
    if (formulaFields.length) {
      const ctxByName: Record<string, Val> = {};
      for (const f of col.fields) {
        if (f.type === "rollup") ctxByName[f.name] = rollups[rec.id]?.[f.id] ?? null;
        else if (f.type === "relation")
          // prop("Relación") = lista de títulos de las filas enlazadas.
          ctxByName[f.name] = (relationLabels[rec.id]?.[f.id] ?? []).map((x) => x.title);
        else if (f.type !== "formula") ctxByName[f.name] = valorDe(f, cells[f.id], rec);
      }
      for (const ff of formulaFields) {
        const expr = (ff.config as { expression?: string })?.expression ?? "";
        const v = evalFormula(expr, ctxByName);
        (rollups[rec.id] ??= {})[ff.id] = v === null ? "" : (v as string | number);
      }
    }
  }

  return { relationLabels, rollups };
}

/**
 * Los computados solo hacen falta si el árbol de filtros (o el orden) toca algún
 * campo de fórmula o rollup: calcularlos siempre sería pagar consultas de más.
 */
export function necesitaComputados(fields: FieldRow[], fieldIds: string[]): boolean {
  const calculados = new Set(fields.filter((f) => f.type === "formula" || f.type === "rollup").map((f) => f.id));
  return fieldIds.some((id) => calculados.has(id));
}
