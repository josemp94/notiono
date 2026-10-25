import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ZodError } from "zod";
import { hashApiToken } from "./routers/apiTokens";
import { ipDe, permitido } from "./ratelimit";
import { DbError } from "./services/db";
import { alcanza, nivelDePagina, rolEnEspacio, type Nivel } from "./services/perms";

export const jsonError = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

/** Quién habla por una petición de /api/v1: el espacio del token y la persona que lo creó. */
export type ApiAuth = { workspaceId: string; userId: string; role: string };

/**
 * Autentica una petición de /api/v1 por `Authorization: Bearer ntn_…`.
 * Devuelve el espacio, el autor del token y su rol, o una respuesta 401.
 */
export async function authApiRequest(req: Request): Promise<ApiAuth | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const t = await db.apiToken.findUnique({ where: { tokenHash: hashApiToken(token) } });
    if (t) {
      // Freno a scripts desbocados: 240 peticiones por minuto y token, de sobra
      // para cualquier integración casera y un tapón para un bucle sin control.
      if (!permitido(`api:${t.id}`, 240, 60_000)) {
        return jsonError(429, "Demasiadas peticiones con este token; espera un momento.");
      }
      // El token actúa con los permisos de quien lo creó, ni más ni menos que esa
      // persona en la web: las páginas restringidas a las que no está invitada no
      // existen para su token. Si ya no es miembro del espacio, el token deja de valer.
      const role = t.createdById ? await rolEnEspacio(db, t.workspaceId, t.createdById) : null;
      if (!t.createdById || !role) {
        return jsonError(401, "Token sin dueño: quien lo creó ya no pertenece a este espacio.");
      }
      // Un invitado de página no tiene API (ni puede crear tokens): cerrado por defecto.
      if (role === "guest") return jsonError(401, "Quien creó este token es invitado en este espacio: la API es para miembros.");
      await db.apiToken.update({ where: { id: t.id }, data: { lastUsed: new Date() } });
      // Quien creó el token responde de lo que se haga con él: así lo hecho por API
      // queda firmado con un nombre y no aparece como salido de la nada.
      return { workspaceId: t.workspaceId, userId: t.createdById, role };
    }
  }
  // Fuerza bruta de tokens: 30 fallos de autenticación por IP cada 10 minutos.
  if (!permitido(`api-fallo:${ipDe(req)}`, 30, 10 * 60_000)) {
    return jsonError(429, "Demasiados intentos fallidos; espera un momento.");
  }
  return jsonError(401, "Token inválido o ausente. Usa 'Authorization: Bearer <token>'.");
}

/**
 * Exige al token un nivel sobre una página, el mismo que tendría su autor en la web.
 * `pageId` nulo = no existe en el espacio del token. Sin acceso responde 404 (una
 * página restringida no existe para quien no está invitado) y con acceso corto, 403.
 * Devuelve null si pasa.
 */
export async function exigeApi(
  auth: ApiAuth,
  pageId: string | null | undefined,
  min: Nivel,
  noEncontrado: string,
): Promise<NextResponse | null> {
  if (!pageId) return jsonError(404, noEncontrado);
  const nivel = await nivelDePagina(db, pageId, auth.userId, auth.role);
  if (!alcanza(nivel, "view")) return jsonError(404, noEncontrado);
  // El lector del espacio no escribe nunca, igual que en la web, aunque alguien le
  // haya dado más nivel en una página suelta.
  if (!alcanza(nivel, min) || (min !== "view" && auth.role === "viewer")) {
    return jsonError(403, "Quien creó este token no tiene permiso para esto en esta página.");
  }
  return null;
}

/** Página dueña de una base de datos, columna o registro del espacio del token (o null). */
export const paginaDe = {
  pagina: async (auth: ApiAuth, id: string) =>
    (
      await db.page.findFirst({
        where: { id, workspaceId: auth.workspaceId, archivedAt: null },
        select: { id: true },
      })
    )?.id ?? null,
  coleccion: async (auth: ApiAuth, id: string) =>
    (
      await db.collection.findFirst({
        where: { id, page: { workspaceId: auth.workspaceId } },
        select: { pageId: true },
      })
    )?.pageId ?? null,
  campo: async (auth: ApiAuth, id: string) =>
    (
      await db.field.findFirst({
        where: { id, collection: { page: { workspaceId: auth.workspaceId } } },
        select: { collection: { select: { pageId: true } } },
      })
    )?.collection.pageId ?? null,
  registro: async (auth: ApiAuth, id: string) =>
    (
      await db.record.findFirst({
        where: { id, collection: { page: { workspaceId: auth.workspaceId } } },
        select: { collection: { select: { pageId: true } } },
      })
    )?.collection.pageId ?? null,
};

/** Crear en la raíz del espacio (sin padre) es cosa de quien puede escribir: no del lector. */
export const exigeEscritor = (auth: ApiAuth): NextResponse | null =>
  auth.role === "viewer" ? jsonError(403, "Quien creó este token solo puede leer en este espacio.") : null;

/**
 * Lee y valida el cuerpo JSON. Devuelve el error ya montado si no vale, para que
 * cada ruta no repita el mismo try/catch y el mismo 400.
 */
export async function readJson<T>(
  req: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
): Promise<{ data: T } | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    const donde = i?.path?.length ? `${i.path.join(".")}: ` : "";
    return jsonError(400, `${donde}${i?.message ?? "Cuerpo inválido."}`);
  }
  return { data: parsed.data };
}

/**
 * Traduce los errores del servicio de bases de datos a HTTP. El servicio habla de
 * intenciones (no encontrado / petición inválida) y no sabe que hay HTTP delante.
 */
export function jsonFromDbError(e: unknown): NextResponse {
  if (e instanceof DbError) return jsonError(e.code === "not_found" ? 404 : 400, e.message);
  console.error("[api/v1]", e);
  return jsonError(500, "Error interno.");
}
