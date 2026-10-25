/**
 * Espacios: crearlos, renombrarlos, salir, borrarlos… sin tRPC delante. Lo llaman el
 * router `workspace` (sesión) y el alta por SSO (`provision.ts`). Los permisos se
 * comprueban aquí con el id de quien pide, nunca con lo que diga la interfaz.
 */
import { TRPCError } from "@trpc/server";
import { generateKeyBetween } from "fractional-indexing";
import { sendPush } from "@/server/push";

type DB = typeof import("@/lib/db").db;

/** Tope de espacios propios por persona: de sobra para una familia, un freno a un bucle. */
export const MAX_ESPACIOS = 20;
export const MAX_NOMBRE = 80;

const mal = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

/** Nombre recortado y con tope; vacío no vale. */
export function limpiaNombre(nombre: string): string {
  const n = nombre.trim().replace(/\s+/g, " ");
  if (!n) throw mal("El espacio necesita un nombre.");
  return n.slice(0, MAX_NOMBRE);
}

/**
 * Espacio nuevo con su dueño como miembro y una página de bienvenida corta. La usan
 * el primer login (el espacio de cada persona) y «Nuevo espacio».
 */
export async function creaEspacio(db: DB, ownerId: string, input: { name: string; icon?: string | null }) {
  const name = limpiaNombre(input.name);
  const propios = await db.workspace.count({ where: { ownerId } });
  if (propios >= MAX_ESPACIOS) throw mal(`Ya tienes ${MAX_ESPACIOS} espacios propios; borra alguno antes de crear otro.`);
  const ws = await db.workspace.create({
    data: {
      name,
      icon: input.icon || null,
      ownerId,
      members: { create: { userId: ownerId, role: "owner" } },
    },
  });
  await db.page.create({
    data: {
      workspaceId: ws.id,
      // «Primeros pasos» y no «Inicio»: Inicio ya es la pantalla de la fila de
      // arriba del panel, y dos «Inicio» seguidos confundían (Notion la llama
      // igual, «Getting started»).
      title: "Primeros pasos",
      icon: "👋",
      order: generateKeyBetween(null, null),
      content: [
        { type: "heading", props: { level: 1 }, content: "Bienvenido a Notiono 🧡" },
        { type: "paragraph", content: "Este es tu espacio. Escribe, organiza y crea bases de datos." },
        { type: "paragraph", content: "Crea una página con el lápiz de arriba del panel, o una base de datos desde «Nueva base de datos», abajo." },
      ],
    },
  });
  return ws;
}

const noEncontrado = () => new TRPCError({ code: "NOT_FOUND", message: "Ese espacio no existe o no tienes acceso." });
const prohibido = (message: string) => new TRPCError({ code: "FORBIDDEN", message });

/** Espacios a los que alguien tiene acceso, el propio primero (el más antiguo). */
async function espaciosDe(db: DB, userId: string) {
  return db.workspace.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, ownerId: true },
  });
}

/** El espacio al que se cae al salir o borrar uno: el primero propio, o el primero que quede. */
export async function espacioDeRepuesto(db: DB, userId: string, menos: string): Promise<string | null> {
  const wss = (await espaciosDe(db, userId)).filter((w) => w.id !== menos);
  return (wss.find((w) => w.ownerId === userId) ?? wss[0])?.id ?? null;
}

/**
 * Saca a una persona de un espacio y limpia lo suyo ahí: permisos de página,
 * favoritos, seguimientos, avisos y tokens de API (que ya no valdrían: apiAuth.ts
 * exige ser miembro, pero mejor que no queden). Lo usan «Salir» y «Quitar».
 */
async function quitaDeEspacio(db: DB, workspaceId: string, userId: string) {
  const enEspacio = { page: { workspaceId } };
  await db.$transaction([
    db.member.deleteMany({ where: { workspaceId, userId } }),
    db.pagePermission.deleteMany({ where: { userId, ...enEspacio } }),
    db.favorite.deleteMany({ where: { userId, ...enEspacio } }),
    db.pageFollow.deleteMany({ where: { userId, ...enEspacio } }),
    db.notification.deleteMany({ where: { userId, workspaceId } }),
    db.apiToken.deleteMany({ where: { workspaceId, createdById: userId } }),
  ]);
}

/** «Salir del espacio» (un miembro, no el propietario). Devuelve el espacio al que pasa. */
export async function salDeEspacio(db: DB, userId: string, workspaceId: string): Promise<string> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  const m = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
  if (!ws || (!m && ws.ownerId !== userId)) throw noEncontrado();
  if (ws.ownerId === userId) {
    throw mal("Eres el propietario: traspasa la propiedad a otra persona o elimina el espacio.");
  }
  const repuesto = await espacioDeRepuesto(db, userId, workspaceId);
  if (!repuesto) throw mal("Es tu único espacio: crea otro antes de salir de este.");
  await quitaDeEspacio(db, workspaceId, userId);
  return repuesto;
}

/** El propietario quita a alguien del espacio. */
export async function quitaMiembro(db: DB, ownerId: string, workspaceId: string, userId: string) {
  await exigeDueno(db, ownerId, workspaceId);
  if (userId === ownerId) throw mal("El propietario no se puede quitar.");
  await quitaDeEspacio(db, workspaceId, userId);
}

async function exigeDueno(db: DB, userId: string, workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw noEncontrado();
  if (ws.ownerId !== userId) throw prohibido("Solo el propietario del espacio puede hacer esto.");
  return ws;
}

/**
 * «Eliminar todo el espacio»: solo el propietario, escribiendo el nombre, y nunca
 * su último espacio propio. Las páginas y todo lo que cuelga de ellas (bases,
 * comentarios, versiones, permisos), los miembros, tokens, webhooks, avisos e
 * invitaciones se van en cascada; los archivos subidos (Asset, sin FK) se borran
 * aquí, menos los que use otro espacio (una página duplicada allí, un icono).
 * Devuelve el espacio al que pasa quien lo borra.
 */
export async function borraEspacio(db: DB, userId: string, workspaceId: string, confirmacion: string): Promise<string> {
  const ws = await exigeDueno(db, userId, workspaceId);
  if (confirmacion.trim() !== ws.name) throw mal("Escribe el nombre exacto del espacio para confirmarlo.");
  const propios = await db.workspace.count({ where: { ownerId: userId } });
  if (propios <= 1) throw mal("Es tu único espacio propio: no se puede eliminar.");
  const repuesto = await espacioDeRepuesto(db, userId, workspaceId);
  // Los adjuntos van por id en el texto (/api/asset/<id>): si algo de fuera los nombra, se quedan.
  const sueltos = await db.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM "Asset" a
    WHERE a."workspaceId" = ${workspaceId}
      AND NOT EXISTS (
        SELECT 1 FROM "Page" p WHERE p."workspaceId" <> ${workspaceId}
          AND (coalesce(p.content::text, '') || coalesce(p.cover, '') || coalesce(p.icon, '')) LIKE '%' || a.id || '%')
      AND NOT EXISTS (
        SELECT 1 FROM "Record" r JOIN "Collection" c ON c.id = r."collectionId" JOIN "Page" p ON p.id = c."pageId"
        WHERE p."workspaceId" <> ${workspaceId}
          AND (r.cells::text || coalesce(r.content::text, '')) LIKE '%' || a.id || '%')
      AND NOT EXISTS (
        SELECT 1 FROM "Workspace" w WHERE w.id <> ${workspaceId} AND coalesce(w.icon, '') LIKE '%' || a.id || '%')`;
  await db.$transaction([
    db.asset.deleteMany({ where: { id: { in: sueltos.map((a) => a.id) } } }),
    db.workspace.delete({ where: { id: workspaceId } }),
  ]);
  return repuesto!;
}

/**
 * Traspasar la propiedad a otro miembro (en Notion, darle el rol «Propietario del
 * espacio»). El espacio tiene un solo propietario: quien lo era se queda como miembro.
 */
export async function traspasaEspacio(db: DB, ownerId: string, workspaceId: string, nuevoId: string) {
  await exigeDueno(db, ownerId, workspaceId);
  if (nuevoId === ownerId) throw mal("Ya eres el propietario.");
  const m = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: nuevoId } } });
  if (!m || (m.role !== "editor" && m.role !== "viewer")) throw mal("Solo se puede traspasar a un miembro del espacio.");
  await db.$transaction([
    db.workspace.update({ where: { id: workspaceId }, data: { ownerId: nuevoId } }),
    db.member.update({ where: { id: m.id }, data: { role: "owner" } }),
    db.member.upsert({
      where: { workspaceId_userId: { workspaceId, userId: ownerId } },
      update: { role: "editor" },
      create: { workspaceId, userId: ownerId, role: "editor" },
    }),
  ]);
}

export type RolMiembro = "editor" | "viewer";

/** Email o usuario del NAS, en minúsculas; null si no parece ninguna de las dos cosas. */
export function destinoInvitacion(texto: string): string | null {
  const t = texto.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return t;
  if (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(t)) return t;
  return null;
}

/**
 * Las formas en que una invitación puede nombrar a quien entra: su email y, si el
 * SSO del NAS no da email (`<usuario>@sso.local`, ver oidc.ts), su usuario.
 */
export function destinosDe(email: string, usuario?: string | null): string[] {
  const e = email.toLowerCase();
  const local = e.endsWith("@sso.local") ? e.slice(0, -"@sso.local".length) : null;
  return [...new Set([e, local, usuario?.trim().toLowerCase()].filter((x): x is string => !!x))];
}

/** Aviso en la bandeja de ese espacio (y push) a quien acaban de añadir. */
async function avisaAlta(db: DB, workspaceId: string, userId: string, actorId: string | null) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
  if (!ws) return;
  const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } }) : null;
  await db.notification.create({ data: { userId, workspaceId, type: "space", title: ws.name, actorId } });
  sendPush(userId, {
    title: "Notiono",
    body: `${actor?.name || actor?.email || "Alguien"} te ha añadido a «${ws.name}»`,
    url: `/api/espacio/${workspaceId}`,
  });
}

/**
 * «Añadir miembros»: si la persona ya ha entrado alguna vez, pasa a ser miembro (o
 * cambia de rol); si no, queda una invitación pendiente que se canjea en su primer
 * login. Solo el propietario.
 */
export async function invitaMiembro(
  db: DB,
  ownerId: string,
  workspaceId: string,
  texto: string,
  role: RolMiembro,
): Promise<{ pendiente: boolean }> {
  const ws = await exigeDueno(db, ownerId, workspaceId);
  const destino = destinoInvitacion(texto);
  if (!destino) throw mal("Escribe un email o un usuario del NAS.");
  const emails = destino.includes("@") ? [destino] : [`${destino}@sso.local`];
  const u = await db.user.findFirst({ where: { email: { in: emails } } });
  if (u) {
    if (u.id === ws.ownerId) throw mal("Esa persona ya es la propietaria.");
    const antes = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: u.id } } });
    // Un invitado de página al que se añade como miembro pasa a serlo (sin aviso nuevo).
    await db.member.upsert({
      where: { workspaceId_userId: { workspaceId, userId: u.id } },
      update: { role },
      create: { workspaceId, userId: u.id, role },
    });
    if (!antes) await avisaAlta(db, workspaceId, u.id, ownerId);
    return { pendiente: false };
  }
  await db.invitacion.upsert({
    where: { workspaceId_destino: { workspaceId, destino } },
    update: { role, invitedById: ownerId },
    create: { workspaceId, destino, role, invitedById: ownerId },
  });
  return { pendiente: true };
}

/** Al entrar por SSO: las invitaciones pendientes a su nombre pasan a ser miembros. */
export async function canjeaInvitaciones(db: DB, user: { id: string; email: string }, usuario?: string | null) {
  const invs = await db.invitacion.findMany({ where: { destino: { in: destinosDe(user.email, usuario) } } });
  for (const inv of invs) {
    const ws = await db.workspace.findUnique({ where: { id: inv.workspaceId }, select: { ownerId: true } });
    const ya = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } } });
    const rol = inv.role === "viewer" ? "viewer" : "editor";
    if (ws && ws.ownerId !== user.id && !ya) {
      await db.member.create({ data: { workspaceId: inv.workspaceId, userId: user.id, role: rol } });
      await avisaAlta(db, inv.workspaceId, user.id, inv.invitedById);
    } else if (ya?.role === "guest") {
      await db.member.update({ where: { id: ya.id }, data: { role: rol } });
    }
    await db.invitacion.delete({ where: { id: inv.id } });
  }
}

export type NivelInvitado = "view" | "comment" | "edit" | "full";

/** Aviso en la bandeja (y push) a quien le comparten una página. */
async function avisaPagina(db: DB, workspaceId: string, pageId: string, userId: string, actorId: string | null) {
  const page = await db.page.findUnique({ where: { id: pageId }, select: { title: true } });
  const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } }) : null;
  await db.notification.create({ data: { userId, workspaceId, type: "share", pageId, actorId } });
  sendPush(userId, {
    title: "Notiono",
    body: `${actor?.name || actor?.email || "Alguien"} ha compartido «${page?.title || "Sin título"}» contigo`,
    url: `/api/espacio/${workspaceId}?a=${encodeURIComponent(`/p/${pageId}`)}`,
  });
}

/** Da a alguien permiso sobre una página; si no es del espacio, entra como invitado. */
async function compartePagina(db: DB, workspaceId: string, pageId: string, userId: string, level: NivelInvitado, actorId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  if (ws?.ownerId === userId) return;
  const m = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!m) await db.member.create({ data: { workspaceId, userId, role: "guest" } });
  const antes = await db.pagePermission.findUnique({ where: { pageId_userId: { pageId, userId } } });
  await db.pagePermission.upsert({
    where: { pageId_userId: { pageId, userId } },
    create: { pageId, userId, level },
    update: { level },
  });
  if (!antes && (!m || m.role === "guest")) await avisaPagina(db, workspaceId, pageId, userId, actorId);
}

/**
 * «Compartir» de una página con alguien por email o usuario del NAS, como en Notion:
 * si no es del espacio, queda como invitado y solo ve esa página (y sus subpáginas)
 * con el nivel dado. Si aún no ha entrado nunca, queda pendiente hasta su primer
 * login. Quien comparte necesita acceso total a la página (lo comprueba el router).
 */
export async function invitaAPagina(
  db: DB,
  actorId: string,
  workspaceId: string,
  pageId: string,
  texto: string,
  level: NivelInvitado,
): Promise<{ pendiente: boolean; miembro: boolean }> {
  const destino = destinoInvitacion(texto);
  if (!destino) throw mal("Escribe un email o un usuario del NAS.");
  const emails = destino.includes("@") ? [destino] : [`${destino}@sso.local`];
  const u = await db.user.findFirst({ where: { email: { in: emails } } });
  if (u) {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
    if (u.id === ws?.ownerId) throw mal("Esa persona es la propietaria del espacio: ya lo ve todo.");
    const m = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: u.id } } });
    await compartePagina(db, workspaceId, pageId, u.id, level, actorId);
    return { pendiente: false, miembro: !!m && m.role !== "guest" };
  }
  await db.invitacionPagina.upsert({
    where: { pageId_destino: { pageId, destino } },
    update: { level, invitedById: actorId },
    create: { pageId, destino, level, invitedById: actorId },
  });
  return { pendiente: true, miembro: false };
}

/** Al entrar por SSO: las páginas que le compartieron antes de que hubiera entrado. */
export async function canjeaInvitacionesPagina(db: DB, user: { id: string; email: string }, usuario?: string | null) {
  const invs = await db.invitacionPagina.findMany({
    where: { destino: { in: destinosDe(user.email, usuario) } },
    include: { page: { select: { workspaceId: true } } },
  });
  for (const inv of invs) {
    await compartePagina(db, inv.page.workspaceId, inv.pageId, user.id, inv.level as NivelInvitado, inv.invitedById ?? user.id);
    await db.invitacionPagina.delete({ where: { id: inv.id } });
  }
}

/** Tras quitarle un permiso: un invitado que ya no tiene ninguna página, fuera del espacio. */
export async function sueltaInvitadoSinPaginas(db: DB, workspaceId: string, userId: string) {
  const m = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (m?.role !== "guest") return;
  const quedan = await db.pagePermission.count({ where: { userId, page: { workspaceId } } });
  if (!quedan) await quitaDeEspacio(db, workspaceId, userId);
}
