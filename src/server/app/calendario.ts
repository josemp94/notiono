/**
 * Las tareas con fecha de una o varias bases de datos en un intervalo de días: lo que
 * pinta el widget «Calendario» de la app de Android (mes con puntos y agenda del día).
 */
import { dateValue, endDayOf, optionsOf, type FieldLite } from "@/lib/cellText";
import { alcanza, nivelDePagina } from "../services/perms";

type DB = typeof import("@/lib/db").db;

export type FuenteCalendario = { pageId: string; fieldId?: string | null; mios?: boolean };

export type ItemCalendario = {
  pageId: string;
  recordId: string;
  titulo: string;
  /** "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm" (hora de Madrid, como en la web). */
  inicio: string;
  fin: string | null;
  hecha: boolean;
  recordatorio: string | null;
};

/** ¿Está hecha? Estado del grupo «Hecho» o, si no hay Estado, la primera casilla marcada. */
export function estaHecha(campos: FieldLite[], cells: Record<string, unknown>): boolean {
  const estado = campos.find((f) => f.type === "status");
  if (estado) return optionsOf(estado).find((o) => o.id === cells[estado.id])?.group === "done";
  const casilla = campos.find((f) => f.type === "checkbox");
  return !!casilla && cells[casilla.id] === true;
}

export async function calculaCalendario(
  db: DB,
  quien: { workspaceId: string; userId: string; role: string },
  fuentes: FuenteCalendario[],
  desde: string,
  hasta: string,
) {
  const salida: { pageId: string; nombre: string; icono: string | null; fieldId: string | null; campos: { id: string; name: string }[]; conPersona: boolean }[] = [];
  const items: ItemCalendario[] = [];
  for (const f of fuentes) {
    const col = await db.collection.findFirst({
      where: { pageId: f.pageId, page: { workspaceId: quien.workspaceId, archivedAt: null } },
      include: {
        page: { select: { title: true, icon: true } },
        fields: { orderBy: { order: "asc" } },
        records: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: { id: true, cells: true } },
      },
    });
    if (!col || !alcanza(await nivelDePagina(db, f.pageId, quien.userId, quien.role), "view")) continue;
    const campos = col.fields as FieldLite[];
    const fechas = campos.filter((c) => c.type === "date");
    const campo = fechas.find((c) => c.id === f.fieldId) ?? fechas[0];
    const personas = campos.filter((c) => c.type === "person");
    const titulo = campos.find((c) => c.type === "text");
    salida.push({
      pageId: f.pageId, nombre: col.page.title || "Sin título", icono: col.page.icon, fieldId: campo?.id ?? null,
      campos: fechas.map((c) => ({ id: c.id, name: c.name })), conPersona: personas.length > 0,
    });
    if (!campo) continue;
    for (const r of col.records) {
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      const v = dateValue(cells[campo.id]);
      if (!v) continue;
      // Un rango que se solapa con el intervalo también sale.
      if (v.start.slice(0, 10) > hasta || (endDayOf(v) ?? "") < desde) continue;
      if (f.mios && personas.length && !personas.some((p) => Array.isArray(cells[p.id]) && (cells[p.id] as unknown[]).includes(quien.userId))) continue;
      items.push({
        pageId: f.pageId, recordId: r.id,
        titulo: (titulo && typeof cells[titulo.id] === "string" ? (cells[titulo.id] as string).trim() : "") || "Sin título",
        inicio: v.start, fin: v.end ?? null, hecha: estaHecha(campos, cells), recordatorio: v.reminder ?? null,
      });
    }
  }
  items.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return { fuentes: salida, items };
}
