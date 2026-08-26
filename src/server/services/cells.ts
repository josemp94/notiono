/**
 * Leer celdas como texto: lo usan el export a CSV, la página publicada, los avisos
 * y la conversión de tipo de una columna.
 *
 * Vivía dentro del router de tRPC y lo importaban hasta las páginas públicas, que no
 * tienen nada que ver con tRPC; ahora que además lo necesita la capa de servicio,
 * dejarlo allí montaba un ciclo de importaciones.
 */
import { dateValue } from "@/lib/cellText";

/** Valor de una celda como texto plano (export CSV y vista pública). */
export function cellToText(
  f: { type: string; config: unknown },
  v: unknown,
  r: { createdAt: Date; updatedAt: Date; seq: number | null; createdById?: string | null; updatedById?: string | null },
  /** userId -> nombre, para los campos de tipo "person" (ver peopleOf). */
  people?: Map<string, string>,
): string {
  if (f.type === "created_time") return r.createdAt.toISOString();
  if (f.type === "last_edited_time") return r.updatedAt.toISOString();
  if (f.type === "id") return r.seq == null ? "" : String(r.seq);
  if (f.type === "created_by" || f.type === "last_edited_by") {
    const uid = f.type === "created_by" ? r.createdById : r.updatedById;
    return uid ? (people?.get(uid) ?? uid) : "";
  }
  if (v === undefined || v === null || v === "") return "";
  const opts = ((f.config as { options?: { id: string; label: string }[] })?.options) ?? [];
  if (f.type === "select" || f.type === "status") return opts.find((o) => o.id === v)?.label ?? String(v);
  if (f.type === "multiselect")
    return (Array.isArray(v) ? v : [v]).map((x) => opts.find((o) => o.id === x)?.label ?? String(x)).join(", ");
  if (f.type === "files")
    return (Array.isArray(v) ? v : []).map((x) => (x as { name?: string })?.name ?? "").filter(Boolean).join(", ");
  if (f.type === "person")
    return (Array.isArray(v) ? v : [v]).map((x) => people?.get(String(x)) ?? String(x)).join(", ");
  // ISO a propósito: el CSV debe poder reimportarse y abrirse en una hoja de cálculo.
  if (f.type === "date") {
    const d = dateValue(v);
    return d ? (d.end ? `${d.start} → ${d.end}` : d.start) : "";
  }
  if (f.type === "checkbox") return v ? "true" : "false";
  if (f.type === "location") {
    const l = v as { nombre?: string; lat?: number; lng?: number };
    return l?.nombre || (l?.lat != null && l?.lng != null ? `${l.lat}, ${l.lng}` : "");
  }
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

/** Mapa userId -> nombre de los miembros del espacio; vacío si la BD no usa campos "person". */
export async function peopleOf(
  db: typeof import("@/lib/db").db,
  workspaceId: string,
  fields: { type: string }[],
): Promise<Map<string, string>> {
  if (!fields.some((f) => ["person", "created_by", "last_edited_by"].includes(f.type))) return new Map();
  const ms = await db.member.findMany({
    where: { workspaceId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return new Map(ms.map((m) => [m.user.id, m.user.name || m.user.email]));
}
