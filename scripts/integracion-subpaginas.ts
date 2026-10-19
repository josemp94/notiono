/**
 * Subpáginas de punta a punta, contra una instalación de verdad con la colaboración
 * en /collab (`npm start`, o `next dev` servido como en server.mjs) y una sesión ya
 * creada (cookie `notiono_session`):
 *
 *   BASE_URL=http://127.0.0.1:3100 SESION=<token> npx tsx scripts/integracion-subpaginas.ts
 *
 * La página madre se tiene abierta como la tendría un navegador (un cliente Yjs
 * conectado a su sala), para comprobar que lo que hace el servidor le llega en vivo:
 *
 *  - crear una hija desde el panel lateral (o la app) deja su enlace al final de la madre;
 *  - el enlace enseña el título de verdad y se actualiza al renombrar la hija;
 *  - mover la hija de madre quita el enlace de la vieja y lo pone en la nueva;
 *  - la app nativa, que pone el enlace ella misma en el cursor, no deja dos;
 *  - borrar el bloque de enlace no borra la página;
 *  - duplicar una página con hijas enlaza las hijas COPIADAS, no las originales.
 */
import assert from "node:assert/strict";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { aplicarOpsDoc, bloquesDeEstado, cargarLibs, type BloqueBN } from "../src/server/app/bloquesYjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SESION = process.env.SESION ?? "token-de-prueba";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cabeceras = { Cookie: `notiono_session=${SESION}`, "Content-Type": "application/json" };
async function lee(r: Response) {
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.json?.data?.code}: ${j.error.json?.message}`);
  return j.result.data.json;
}
const query = async (ruta: string, input: unknown) =>
  lee(await fetch(`${BASE}/api/trpc/${ruta}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers: cabeceras }));
const mutation = async (ruta: string, input: unknown) =>
  lee(await fetch(`${BASE}/api/trpc/${ruta}`, { method: "POST", headers: cabeceras, body: JSON.stringify({ json: input }) }));

type Mencion = { type: "mention"; props: { pageId: string; title: string; icon: string } };
/** Menciones de página de un bloque (sus hijos incluidos). */
const mencionesDe = (bs: BloqueBN[]): Mencion[] =>
  bs.flatMap((b) => [
    ...(Array.isArray(b.content) ? (b.content as Mencion[]).filter((c) => c.type === "mention") : []),
    ...mencionesDe(b.children ?? []),
  ]);
const enlacesA = (bs: BloqueBN[], id: string) => mencionesDe(bs).filter((m) => m.props.pageId === id);

/** Abre la página como un navegador: estrena su documento y se conecta a la sala. */
async function abrir(pageId: string) {
  // El documento, con la MISMA copia de yjs que el proveedor; el conversor del servidor
  // usa la suya (import dinámico), así que entre los dos se pasa por bytes.
  const doc = new Y.Doc();
  const { token } = await mutation("pages.collabToken", { id: pageId });
  const seed = (await mutation("pages.ensureYdoc", { id: pageId })).seed as BloqueBN[] | null;
  const provider = new HocuspocusProvider({ url: `${BASE.replace(/^http/, "ws")}/collab`, name: pageId, document: doc, token });
  await Promise.race([
    new Promise<void>((ok) => provider.on("synced", () => ok())),
    espera(8000).then(() => {
      throw new Error("el cliente Yjs no sincroniza");
    }),
  ]);
  if (seed?.length) {
    // Lo haría el editor del navegador; aquí, con el mismo conversor del servidor.
    const L = await cargarLibs();
    const sembrado = new L.Y.Doc();
    await aplicarOpsDoc(sembrado, [], seed);
    Y.applyUpdate(doc, L.Y.encodeStateAsUpdate(sembrado));
  }
  return { doc, bloques: () => bloquesDeEstado(Y.encodeStateAsUpdate(doc)), cerrar: () => provider.destroy() };
}

/** Espera a que se cumpla algo (lo que viaja por el WebSocket tarda un poco). */
async function hasta<T>(que: string, f: () => Promise<T>, ok: (v: T) => boolean, ms = 6000): Promise<T> {
  const fin = Date.now() + ms;
  let v = await f();
  while (!ok(v)) {
    if (Date.now() > fin) throw new Error(`no llegó: ${que}\n${JSON.stringify(v, null, 1).slice(0, 1500)}`);
    await espera(150);
    v = await f();
  }
  return v;
}

async function main() {
  const madre = await mutation("pages.create", { title: "Madre de prueba" });
  // Contenido de la madre como lo dejaría el editor (con el párrafo vacío del final).
  await mutation("pages.updateContent", {
    id: madre.id,
    content: [
      { id: "m1", type: "paragraph", content: [{ type: "text", text: "Texto de la madre", styles: {} }], children: [] },
      { id: "m2", type: "paragraph", content: [], children: [] },
    ],
  });
  const vista = await abrir(madre.id);
  try {
    // --- 1a. Crear la hija desde el panel lateral: enlace al final de la madre, en vivo ---
    const hija = await mutation("pages.create", { parentId: madre.id, title: "" });
    let bs = await hasta("el enlace a la hija en la madre abierta", vista.bloques, (b) => enlacesA(b, hija.id).length > 0);
    assert.equal(enlacesA(bs, hija.id).length, 1, "un solo enlace");
    const iEnlace = bs.findIndex((b) => enlacesA([b], hija.id).length);
    assert.equal(iEnlace, 1, "detrás del texto y antes del párrafo vacío del final");
    assert.equal(bs[0].id, "m1");

    // --- 1b. Título: el de verdad, y se actualiza en vivo al renombrar ---
    await mutation("pages.rename", { id: hija.id, title: "Viaje a Asturias", icon: "🏔️" });
    bs = await hasta("el título nuevo en la madre abierta", vista.bloques, (b) => enlacesA(b, hija.id)[0]?.props.title === "Viaje a Asturias");
    assert.equal(enlacesA(bs, hija.id)[0].props.icon, "🏔️");
    const guardada = await query("pages.get", { id: madre.id });
    assert.equal(enlacesA(guardada.content, hija.id)[0]?.props.title, "Viaje a Asturias", "y en la copia legible (búsqueda, pública, export)");

    // --- La app nativa crea la hija y pone ella el enlace en el cursor: no quedan dos ---
    const deApp = await mutation("pages.create", { parentId: madre.id, title: "" });
    await hasta("el enlace de la hija de la app", vista.bloques, (b) => enlacesA(b, deApp.id).length > 0);
    await mutation("app.aplicar", {
      id: madre.id,
      ops: [{
        op: "upsert",
        afterId: "m1",
        block: { id: "app-chip", type: "paragraph", content: [{ type: "mention", props: { pageId: deApp.id, title: "Sin título", icon: "" } }] },
      }],
    });
    bs = await hasta("un solo enlace a la hija de la app", vista.bloques, (b) => enlacesA(b, deApp.id).length === 1);
    assert.ok(bs.some((b) => b.id === "app-chip"), "se queda el que puso la app, en su sitio");

    // --- 1c. Mover la hija a otra madre: sale de la vieja, entra en la nueva ---
    const otra = await mutation("pages.create", { title: "Otra madre" });
    await mutation("pages.move", { id: hija.id, parentId: otra.id });
    await hasta("el enlace fuera de la madre vieja", vista.bloques, (b) => enlacesA(b, hija.id).length === 0);
    const enOtra = await query("pages.get", { id: otra.id });
    assert.equal(enlacesA(enOtra.content, hija.id).length, 1, "enlazada en la nueva madre");
    // Reordenar entre hermanas (misma madre) no toca los enlaces.
    await mutation("pages.move", { id: hija.id, parentId: otra.id });
    assert.equal(enlacesA((await query("pages.get", { id: otra.id })).content, hija.id).length, 1);

    // --- Borrar el bloque de enlace no borra la página ---
    const actuales = await vista.bloques();
    await mutation("app.aplicar", { id: madre.id, ops: [{ op: "delete", id: "app-chip" }] });
    await hasta("el enlace borrado", vista.bloques, (b) => enlacesA(b, deApp.id).length === 0);
    assert.ok(actuales.length > 0);
    const sigue = await query("pages.get", { id: deApp.id });
    assert.equal(sigue.archivedAt, null, "la página sigue viva");

    // --- 1d. Duplicar una madre con hijas: la copia enlaza a las hijas copiadas ---
    const nieta = await mutation("pages.create", { parentId: otra.id, title: "Nieta" });
    await hasta("la nieta enlazada", async () => (await query("pages.get", { id: otra.id })).content as BloqueBN[], (b) => enlacesA(b, nieta.id).length === 1);
    const copia = await mutation("pages.duplicate", { id: otra.id });
    const arbol = (await query("pages.tree", {})) as { id: string; parentId: string | null; title: string }[];
    const hijasCopia = arbol.filter((p) => p.parentId === copia.id);
    assert.equal(hijasCopia.length, 2, "la copia tiene sus dos hijas");
    const contCopia = (await query("pages.get", { id: copia.id })).content as BloqueBN[];
    const ids = mencionesDe(contCopia).map((m) => m.props.pageId).sort();
    assert.deepEqual(ids, hijasCopia.map((p) => p.id).sort(), "los enlaces de la copia apuntan a las hijas copiadas");

    // --- Papelera y restaurar: la página vuelve y su enlace sigue en la madre ---
    await mutation("pages.archive", { id: nieta.id });
    await mutation("pages.restore", { id: nieta.id });
    assert.equal(enlacesA((await query("pages.get", { id: otra.id })).content, nieta.id).length, 1);

    // --- Enlaces viejos (guardados como «Sin título»): se arreglan al abrir la madre ---
    const vieja = await mutation("pages.create", { title: "Con enlace viejo" });
    const nombrada = await mutation("pages.create", { parentId: vieja.id, title: "Ya tenía nombre", enlazar: false });
    await mutation("pages.updateContent", {
      id: vieja.id,
      content: [{ id: "v1", type: "paragraph", content: [{ type: "mention", props: { pageId: nombrada.id, title: "Sin título", icon: "" } }], children: [] }],
    });
    await query("pages.get", { id: vieja.id });
    await hasta(
      "el enlace viejo arreglado",
      async () => (await query("pages.get", { id: vieja.id })).content as BloqueBN[],
      (b) => enlacesA(b, nombrada.id)[0]?.props.title === "Ya tenía nombre",
    );

    console.log("OK — subpáginas: enlace al crear, título en vivo, mover sin duplicar, app nativa, duplicar y papelera");
  } finally {
    vista.cerrar();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
