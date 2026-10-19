/**
 * Registro de diagnóstico de la app nativa: la app manda en lote lo que pasa con sus
 * widgets, sus cierres inesperados y los fallos del servidor que ve (sin contenido de
 * páginas). Aquí se valida, se recorta y se guarda con un tope por usuario.
 */

type DB = typeof import("@/lib/db").db;

export const REGISTRO_MAX_POR_USUARIO = 2000;
export const REGISTRO_DIAS = 30;
export const REGISTRO_MAX_LOTE = 200;
const MAX_MENSAJE = 1000;
const MAX_TRAZA = 8000;
const TIPOS = new Set(["widget", "avisos", "cierre", "red", "fallo"]);

export type LoteRegistro = {
  dispositivo: string;
  version: string;
  modelo: string;
  fabricante: string;
  android: string;
  entradas: { tipo: string; mensaje: string; traza: string | null; fecha: Date }[];
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** El cuerpo de `POST /api/app/registro`, validado y recortado; null si no tiene forma de lote. */
export function limpiaLote(body: unknown, ahora = new Date()): LoteRegistro | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.entradas)) return null;
  const entradas = b.entradas.slice(-REGISTRO_MAX_LOTE).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const x = e as Record<string, unknown>;
    const mensaje = texto(x.mensaje, MAX_MENSAJE);
    if (!mensaje) return [];
    const f = typeof x.fecha === "string" ? new Date(x.fecha) : null;
    return [{
      tipo: TIPOS.has(x.tipo as string) ? (x.tipo as string) : "otro",
      mensaje,
      traza: texto(x.traza, MAX_TRAZA) || null,
      // Un reloj del móvil disparatado no puede colar fechas futuras.
      fecha: f && !isNaN(f.getTime()) && f <= ahora ? f : ahora,
    }];
  });
  return {
    dispositivo: texto(b.dispositivo, 64),
    version: texto(b.version, 40),
    modelo: texto(b.modelo, 80),
    fabricante: texto(b.fabricante, 80),
    android: texto(b.android, 40),
    entradas,
  };
}

/** Guarda el lote y deja al usuario con lo de los últimos 30 días y como mucho 2000 filas. */
export async function guardaRegistro(db: Pick<DB, "appRegistro">, userId: string, lote: LoteRegistro, ahora = new Date()) {
  const { entradas, ...cabecera } = lote;
  if (entradas.length) {
    await db.appRegistro.createMany({ data: entradas.map((e) => ({ userId, ...cabecera, ...e })) });
  }
  await db.appRegistro.deleteMany({ where: { userId, createdAt: { lt: new Date(ahora.getTime() - REGISTRO_DIAS * 86_400_000) } } });
  const sobran = await db.appRegistro.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { fecha: "desc" }],
    skip: REGISTRO_MAX_POR_USUARIO,
    select: { id: true },
  });
  if (sobran.length) await db.appRegistro.deleteMany({ where: { id: { in: sobran.map((s) => s.id) } } });
  return entradas.length;
}
