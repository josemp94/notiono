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
import { aplicarOpsDoc, bloquesDeDoc, cargarLibs, type BloqueBN, type OpBloque } from "../src/server/app/bloquesYjs";

const db = new PrismaClient();

/**
 * La sala es el id de la página. El permiso llega como token firmado que emite la
 * web (pages.collabToken); aquí se vuelve a comprobar la pertenencia al espacio,
 * para que un token viejo no valga si a alguien se le retiró el acceso.
 */
async function authorize(token: string | null, pageId: string) {
  if (!token) return null;
  const claim = verifyCollabToken(token, pageId);
  if (!claim) return null;

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { workspaceId: true, archivedAt: true },
  });
  if (!page || page.archivedAt) return null;

  const member = await db.member.findUnique({
    where: { workspaceId_userId: { workspaceId: page.workspaceId, userId: claim.userId } },
    select: { role: true },
  });
  if (!member) return null;
  return { userId: claim.userId, role: member.role };
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
  return new Hocuspocus({
    async onAuthenticate({ documentName, token, connectionConfig }) {
      const access = await authorize(token, documentName);
      if (!access) throw new Error("Sin acceso a esta página");
      // Los invitados de solo lectura ven los cambios en vivo pero no pueden escribir.
      connectionConfig.readOnly = access.role === "viewer";
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
