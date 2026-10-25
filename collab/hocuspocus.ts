/**
 * Servidor de edición simultánea (Yjs), montado DENTRO del servidor web.
 *
 * Va en el mismo proceso y el mismo puerto que la app, bajo la ruta /collab, para
 * que todo viva en notiono.monrealperez.com: el proxy inverso de Synology solo
 * enruta por host y puerto (no admite rutas), así que separarlo obligaría a un
 * subdominio o a meter otro proxy.
 *
 * A propósito no sabe de BlockNote: solo autentica, transporta y guarda el estado
 * Yjs en Page.ydoc. La versión legible del documento (Page.content, que usan la
 * búsqueda, la publicación, el export y las versiones) la sigue escribiendo el
 * editor del navegador con su autosave.
 */
import type { IncomingMessage } from "node:http";
import { Hocuspocus } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { PrismaClient } from "@prisma/client";
import { verifyCollabToken } from "../src/server/collabToken";
import { aplicarOpsDoc, bloquesDeDoc, cargarLibs, docVacio, type BloqueBN, type OpBloque } from "../src/server/app/bloquesYjs";
import { leerBloquesPagina } from "../src/server/app/documento";
import { archivarPagina, sacarDePapelera } from "../src/server/papelera";
import { alcanza, nivelDePagina, rolEnEspacio } from "../src/server/services/perms";
import { cambiosEnlaces, resumenEnlaces, type Resumen } from "../src/lib/subpaginas";

const db = new PrismaClient();

// ---------- borrar el enlace a una subpágina = mandarla a la papelera ----------
//
// Una subpágina y su enlace en la madre son un solo objeto, como en Notion. Al guardar
// cada documento se compara con la vez anterior qué enlaces a páginas tiene (el
// estado, no las operaciones: mover un bloque, cortarlo y pegarlo, convertirlo o que
// lo toque otra pestaña no cambia el estado). Si el enlace a una HIJA se fue, se
// espera un poco y se vuelve a mirar el documento vivo: si sigue sin estar, la hija
// va a la papelera con su subárbol. Si aparece el enlace a una hija que está en la
// papelera (Ctrl+Z, pegar lo cortado), sale de ella. Vale igual para el navegador, el
// móvil y la app nativa: todos escriben en este documento.

/** Lo que se espera, tras guardarse el documento, antes de mandar a la papelera. */
const MARGEN_PAPELERA = 4000;
/** Los enlaces de cada documento abierto en el último guardado (null = vacío, aún sin estrenar). */
const resumenes = new Map<string, Resumen | null>();

async function resumenDe(doc: Parameters<typeof bloquesDeDoc>[0]): Promise<Resumen | null> {
  return docVacio(doc) ? null : resumenEnlaces(await bloquesDeDoc(doc));
}

/** Aviso a las pestañas de quien lo hizo (el editor enseña «Deshacer» y refresca el árbol). */
function avisa(hocuspocus: Hocuspocus, pageId: string, userId: string | null, aviso: object) {
  hocuspocus.documents.get(pageId)?.broadcastStateless(
    JSON.stringify(aviso),
    (c) => !userId || (c.context as { userId?: string } | undefined)?.userId === userId,
  );
}

async function enlacesQuitados(hocuspocus: Hocuspocus, madreId: string, quitados: ReturnType<typeof cambiosEnlaces>["quitados"], userId: string | null) {
  await new Promise((r) => setTimeout(r, MARGEN_PAPELERA));
  // Otra vez, sobre lo de ahora: si en el margen se deshizo o se pegó, no pasa nada.
  const vivo = hocuspocus.documents.get(madreId);
  const page = vivo ? null : await db.page.findUnique({ where: { id: madreId }, select: { id: true, content: true, ydoc: true } });
  const bloques = vivo ? await bloquesDeDoc(vivo) : page ? await leerBloquesPagina(page) : [];
  if (!bloques.length) return;
  const ahora = resumenEnlaces(bloques);
  const madre = await db.page.findUnique({ where: { id: madreId }, select: { archivedAt: true } });
  if (!madre || madre.archivedAt) return;
  for (const e of quitados) {
    if (ahora.enlaces.has(e.pageId) || ahora.menciones.get(e.id)?.has(e.pageId)) continue;
    const hija = await db.page.findUnique({ where: { id: e.pageId }, select: { id: true, workspaceId: true, parentId: true, archivedAt: true, title: true } });
    // Solo las hijas: un enlace a otra página (o a una que ya se movió a otra madre) no borra nada.
    if (!hija || hija.parentId !== madreId || hija.archivedAt) continue;
    await archivarPagina(db, hija, userId, { parentId: e.parentId, afterId: e.afterId });
    avisa(hocuspocus, madreId, userId, { tipo: "subpagina-papelera", pageId: hija.id, title: hija.title });
  }
}

async function enlacesPuestos(hocuspocus: Hocuspocus, madreId: string, puestos: string[], userId: string | null) {
  const hijas = await db.page.findMany({
    where: { id: { in: puestos }, parentId: madreId, archivedAt: { not: null }, parent: { archivedAt: null } },
    select: { id: true },
  });
  for (const h of hijas) {
    await sacarDePapelera(db, h.id);
    avisa(hocuspocus, madreId, userId, { tipo: "subpagina-restaurada", pageId: h.id });
  }
}

async function alGuardar(hocuspocus: Hocuspocus, madreId: string, doc: Parameters<typeof bloquesDeDoc>[0], userId: string | null) {
  const antes = resumenes.get(madreId);
  const ahora = await resumenDe(doc);
  resumenes.set(madreId, ahora);
  // Sin un estado anterior con contenido (recién abierto, recién estrenado) no hay con qué comparar.
  if (!antes || !ahora) return;
  const { quitados, puestos } = cambiosEnlaces(antes, ahora);
  if (puestos.length) await enlacesPuestos(hocuspocus, madreId, puestos, userId);
  if (quitados.length) void enlacesQuitados(hocuspocus, madreId, quitados, userId).catch((e) => console.error("[subpaginas] papelera", e));
}

/**
 * La sala es el id de la página. El permiso llega como token firmado que emite la
 * web (pages.collabToken); aquí se vuelve a comprobar la pertenencia al espacio,
 * para que un token viejo no valga si a alguien se le retiró el acceso.
 */
export async function authorize(token: string | null, pageId: string) {
  if (!token) return null;
  const claim = verifyCollabToken(token, pageId);
  if (!claim) return null;

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { workspaceId: true, archivedAt: true },
  });
  if (!page || page.archivedAt) return null;

  // El rol y el nivel de ESTA página, ahora (no los de cuando se firmó el permiso): a
  // quien le quitan el acceso, o un invitado con otra página, no le vale el token.
  const role = await rolEnEspacio(db, page.workspaceId, claim.userId);
  if (!role) return null;
  const nivel = await nivelDePagina(db, pageId, claim.userId, role);
  if (!alcanza(nivel, "view")) return null;
  return { userId: claim.userId, role, soloLectura: role === "viewer" || !alcanza(nivel, "edit") };
}

/**
 * Engancha al servidor un WebSocket ya aceptado.
 *
 * Hocuspocus 4 es agnóstico del transporte: `handleConnection` NO escucha el
 * socket, hay que darle cada mensaje y avisarle del cierre. Sin esto la conexión
 * se abre, el navegador manda sus mensajes y el servidor no contesta jamás: no
 * sincroniza nada y sin un solo error, ni en el navegador ni en el servidor.
 * Está aquí, y no suelto en server.mjs, para que `npm run check` lo verifique.
 */
export function attachConnection(
  hocuspocus: Hocuspocus,
  ws: { on(evento: string, cb: (...args: never[]) => void): unknown },
  request: IncomingMessage,
) {
  const conexion = hocuspocus.handleConnection(ws as never, request as never);
  ws.on("message", ((datos: Uint8Array) => conexion.handleMessage(new Uint8Array(datos))) as never);
  ws.on("close", ((code: number, reason: unknown) =>
    conexion.handleClose({ code, reason: String(reason) })) as never);
  return conexion;
}

export function createHocuspocus() {
  const hocuspocus: Hocuspocus = new Hocuspocus({
    async afterLoadDocument({ documentName, document }) {
      resumenes.set(documentName, await resumenDe(document));
    },

    async onStoreDocument({ documentName, document, lastContext }) {
      const userId = (lastContext as { userId?: string } | undefined)?.userId ?? null;
      await alGuardar(hocuspocus, documentName, document, userId).catch((e) => console.error("[subpaginas] al guardar", e));
    },

    async afterUnloadDocument({ documentName }) {
      resumenes.delete(documentName);
    },

    async onAuthenticate({ documentName, token, connectionConfig }) {
      const access = await authorize(token, documentName);
      if (!access) throw new Error("Sin acceso a esta página");
      // Los invitados de solo lectura ven los cambios en vivo pero no pueden escribir.
      connectionConfig.readOnly = access.soloLectura;
      return { userId: access.userId, role: access.role };
    },

    extensions: [
      new Database({
        fetch: async ({ documentName }) => {
          const page = await db.page.findUnique({ where: { id: documentName }, select: { ydoc: true } });
          return page?.ydoc ? new Uint8Array(page.ydoc) : null;
        },
        store: async ({ documentName, state }) => {
          await db.page
            .update({ where: { id: documentName }, data: { ydoc: Buffer.from(state) } })
            .catch(() => {
              // La página pudo borrarse mientras alguien la tenía abierta.
            });
        },
      }),
    ],
  });
  return hocuspocus;
}

/**
 * Puente con Next para la app nativa (ver src/server/app/documento.ts). Next corre en
 * este mismo proceso (server.mjs) y lo encuentra en `globalThis.__notionoColab`.
 *
 * Las operaciones se aplican en el documento VIVO con una conexión directa: los
 * navegadores conectados las reciben al momento y Hocuspocus las guarda en
 * Page.ydoc como cualquier otro cambio. Todo lo que cruza el puente es JSON o bytes:
 * así Next no toca objetos de esta copia de yjs (mezclar copias rompe Yjs).
 */
export function puenteApp(hocuspocus: Hocuspocus) {
  return {
    async estado(pageId: string): Promise<Uint8Array | null> {
      const doc = hocuspocus.documents.get(pageId);
      if (!doc) return null;
      const { Y } = await cargarLibs();
      return Y.encodeStateAsUpdate(doc);
    },
    async aplicar(pageId: string, ops: OpBloque[], semilla: BloqueBN[]): Promise<BloqueBN[]> {
      const conexion = await hocuspocus.openDirectConnection(pageId, { app: true });
      try {
        const doc = conexion.document!;
        await aplicarOpsDoc(doc, ops, semilla, { source: "local", context: { app: true } });
        return await bloquesDeDoc(doc);
      } finally {
        // Guarda ya (no al rato): la copia legible que escribe Next sale de aquí.
        await conexion.disconnect();
      }
    },
  };
}
