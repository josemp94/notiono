/**
 * El contenido de una página para la app nativa: leerlo y escribirlo por bloques.
 *
 * La verdad viva de una página es su documento Yjs; `Page.content` es la copia
 * legible. Por eso la app nunca escribe `Page.content` a secas (el documento
 * compartido la pisaría): sus operaciones van DENTRO del documento Yjs y, después,
 * se refresca la copia legible.
 *
 * - En producción el documento lo sirve Hocuspocus, en el mismo proceso que Next
 *   (`server.mjs`). Su puente (`globalThis.__notionoColab`, ver
 *   `collab/hocuspocus.ts`) aplica las operaciones en el documento vivo con una
 *   conexión directa: los navegadores conectados lo reciben al momento y Hocuspocus
 *   lo guarda en `Page.ydoc`.
 * - Sin Hocuspocus (`next dev`), se trabaja sobre los bytes de `Page.ydoc` con la
 *   fila bloqueada; y si la página aún no tiene documento compartido, basta con
 *   `Page.content` (el navegador lo estrenará desde ahí).
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { aplicarOpsDoc, aplicarOpsJson, bloquesDeDoc, bloquesDeEstado, cargarLibs, type BloqueBN, type OpBloque } from "./bloquesYjs";

type DB = typeof import("@/lib/db").db;

/** Lo que el servidor de colaboración expone a Next dentro del mismo proceso. */
export type PuenteColab = {
  /** Estado del documento si está abierto en memoria (lo más fresco); null si no. */
  estado(pageId: string): Promise<Uint8Array | null>;
  /** Aplica las operaciones en el documento vivo y devuelve los bloques resultantes. */
  aplicar(pageId: string, ops: OpBloque[], semilla: BloqueBN[]): Promise<BloqueBN[]>;
};

const puente = () => (globalThis as { __notionoColab?: PuenteColab }).__notionoColab;

const comoBloques = (c: Prisma.JsonValue | null | undefined): BloqueBN[] =>
  Array.isArray(c) ? (c as unknown as BloqueBN[]) : [];

/** Huella del contenido: la app la manda al consultar y si no ha cambiado no se reenvía. */
export const huella = (bloques: unknown) => createHash("sha1").update(JSON.stringify(bloques)).digest("base64url");

/** Bloques actuales de la página: del documento compartido si lo hay, si no de `Page.content`. */
export async function leerBloquesPagina(page: {
  id: string;
  content: Prisma.JsonValue | null;
  ydoc: Uint8Array | null;
}): Promise<BloqueBN[]> {
  const vivo = (await puente()?.estado(page.id)) ?? null;
  const bytes = vivo ?? (page.ydoc ? new Uint8Array(page.ydoc) : null);
  if (bytes) {
    const bloques = await bloquesDeEstado(bytes);
    // Vacío = reservado por ensureYdoc y aún sin estrenar: manda la copia legible.
    if (bloques.length) return bloques;
  }
  return comoBloques(page.content);
}

/**
 * Aplica las operaciones de la app a la página y devuelve los bloques resultantes
 * (para guardarlos como copia legible). No comprueba permisos: eso es del llamante.
 */
export async function aplicarOpsPagina(db: DB, pageId: string, ops: OpBloque[]): Promise<BloqueBN[]> {
  const p = puente();
  if (p) {
    const page = await db.page.findUniqueOrThrow({ where: { id: pageId }, select: { content: true } });
    return p.aplicar(pageId, ops, comoBloques(page.content));
  }
  return db.$transaction(
    async (tx) => {
      const [fila] = await tx.$queryRaw<{ ydoc: Uint8Array | null; content: Prisma.JsonValue | null }[]>`
        SELECT ydoc, content FROM "Page" WHERE id = ${pageId} FOR UPDATE`;
      if (!fila) throw new Error("Página no encontrada");
      if (!fila.ydoc) return aplicarOpsJson(comoBloques(fila.content), ops);
      const { Y } = await cargarLibs();
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(fila.ydoc));
      await aplicarOpsDoc(doc, ops, comoBloques(fila.content));
      await tx.page.update({ where: { id: pageId }, data: { ydoc: Buffer.from(Y.encodeStateAsUpdate(doc)) } });
      return bloquesDeDoc(doc);
    },
    { timeout: 30_000 },
  );
}
