/**
 * Subpáginas de punta a punta, contra una instalación de verdad con la colaboración
 * en /collab (`npm start`, o `next dev` servido como en server.mjs) y una sesión ya
 * creada (cookie `notiono_session`):
 *
 *   BASE_URL=http://127.0.0.1:3100 SESION=<token> DATABASE_URL=<la de esa instalación> AUTH_SECRET=<el suyo> \
 *     npx tsx scripts/integracion-subpaginas.ts
 *
 * La página madre se tiene abierta como la tendría un navegador (un cliente Yjs
 * conectado a su sala), para comprobar que lo que hace el servidor le llega en vivo:
 *
 *  - crear una hija desde el panel lateral (o la app) deja su enlace al final de la madre;
 *  - el enlace enseña el título de verdad y se actualiza al renombrar la hija;
 *  - mover la hija de madre quita el enlace de la vieja y lo pone en la nueva;
 *  - la app nativa, que pone el enlace ella misma en el cursor, no deja dos;
 *  - borrar una subpágina es un solo objeto: en el árbol se va su enlace, borrar el enlace
 *    la manda a la papelera, restaurar la devuelve con su enlace en su sitio; y mover,
 *    cortar y pegar, convertir, otra pestaña, sin conexión o restaurar una versión NO archivan;
 *  - la reparación de los datos sueltos (`collab/dist/reparar-subpaginas.mjs`), en seco y aplicando;
 *  - duplicar una página con hijas enlaza las hijas COPIADAS, no las originales.
 */
import assert from "node:assert/strict";
import * as Y from "yjs";
import { execFileSync } from "node:child_process";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { PrismaClient } from "@prisma/client";
import { aplicarOpsDoc, bloquesDeEstado, cargarLibs, type BloqueBN, type OpBloque } from "../src/server/app/bloquesYjs";

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
  return { doc, provider, bloques: () => bloquesDeEstado(Y.encodeStateAsUpdate(doc)), cerrar: () => provider.destroy() };
}
type Vista = Awaited<ReturnType<typeof abrir>>;

/** Edita como el navegador: el cambio sale del cliente conectado y viaja por el WebSocket. */
async function editar(v: Vista, ops: OpBloque[]) {
  const L = await cargarLibs();
  const copia = new L.Y.Doc();
  L.Y.applyUpdate(copia, Y.encodeStateAsUpdate(v.doc));
  const sv = L.Y.encodeStateVector(copia);
  await aplicarOpsDoc(copia, ops);
  Y.applyUpdate(v.doc, L.Y.encodeStateAsUpdate(copia, sv));
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

// La base de datos de la instalación (la de BASE_URL): para mirar la papelera y sembrar
// los datos sueltos que dejaba la versión anterior.
const db = new PrismaClient();
const archivada = async (id: string) => (await db.page.findUnique({ where: { id }, select: { archivedAt: true } }))?.archivedAt != null;
const par = (id: string, text: string): BloqueBN => ({ id, type: "paragraph", content: text ? [{ type: "text", text, styles: {} }] : [], children: [] });
const enl = (id: string, p: { id: string; title?: string }): BloqueBN =>
  ({ id, type: "paragraph", content: [{ type: "mention", props: { pageId: p.id, title: p.title ?? "", icon: "" } }], children: [] });
const idEnlace = (pageId: string) => `subpagina-${pageId}`;
/** Dónde está el (primer) enlace a una página: bloque del que cuelga y bloque de delante. */
function donde(bs: BloqueBN[], pageId: string, padre: string | null = null): { parentId: string | null; afterId: string | null } | null {
  let antes: string | null = null;
  for (const b of bs) {
    const solo = Array.isArray(b.content) && b.content.length === 1 && (b.content as Mencion[])[0].type === "mention";
    if (b.type === "paragraph" && solo && (b.content as Mencion[])[0].props.pageId === pageId) return { parentId: padre, afterId: antes };
    const dentro = donde(b.children ?? [], pageId, b.id);
    if (dentro) return dentro;
    antes = b.id;
  }
  return null;
}
const contenido = async (id: string) => ((await db.page.findUnique({ where: { id }, select: { content: true } }))?.content ?? []) as BloqueBN[];
/** Lo que tarda como mucho el servidor en mandar a la papelera (guardado + margen), con holgura. */
const MARGEN = 15_000;

/** Borrar una subpágina es un solo objeto: árbol y enlace siempre a la par. */
async function borrado() {
  const M = await mutation("pages.create", { title: "Madre del borrado" });
  await mutation("pages.updateContent", {
    id: M.id,
    content: [
      par("b1", "Arriba"),
      { id: "cols", type: "columnList", props: {}, children: [
        { id: "c1", type: "column", props: { width: 1 }, children: [par("c1p", "Izquierda")] },
        { id: "c2", type: "column", props: { width: 1 }, children: [par("c2p", "Derecha")] },
      ] },
      par("b9", ""),
    ],
  });
  const v = await abrir(M.id);
  const w = await abrir(M.id); // otra pestaña (o el móvil) con la misma página abierta
  const crea = async (title: string, parentId: string | null = M.id) => {
    const p = await mutation("pages.create", { parentId, title });
    if (parentId === M.id) await hasta(`el enlace a «${title}»`, v.bloques, (b) => enlacesA(b, p.id).length === 1);
    return { ...p, title };
  };
  try {
    // --- 1. Borrar en el árbol: fuera el enlace (en vivo), recordando su sitio ---
    const H = await crea("Hija del árbol");
    await editar(v, [{ op: "move", id: idEnlace(H.id), parentId: "c2", afterId: "c2p" }]); // a una columna, con los 6 puntos
    await hasta("el enlace en la columna", v.bloques, (b) => donde(b, H.id)?.parentId === "c2");
    const N = await crea("Nieta del árbol", H.id);
    await hasta("la nieta enlazada en la hija", () => contenido(H.id), (b) => enlacesA(b, N.id).length === 1);
    await mutation("pages.archive", { id: H.id });
    await hasta("el enlace fuera de la madre abierta", v.bloques, (b) => enlacesA(b, H.id).length === 0);
    assert.ok((await archivada(H.id)) && (await archivada(N.id)), "la hija y su subárbol, en la papelera");
    assert.equal(enlacesA(await contenido(H.id), N.id).length, 1, "la nieta conserva su enlace dentro de la hija");

    // --- 3. Restaurar: vuelve con su enlace, en su sitio, nunca dos ---
    await mutation("pages.restore", { id: H.id });
    let bs = await hasta("el enlace de vuelta", v.bloques, (b) => enlacesA(b, H.id).length > 0);
    assert.deepEqual(donde(bs, H.id), { parentId: "c2", afterId: "c2p" }, "en su sitio de antes");
    assert.ok(!(await archivada(N.id)), "el subárbol vuelve entero");
    await mutation("pages.restore", { id: H.id });
    await espera(1500);
    assert.equal(enlacesA(await v.bloques(), H.id).length, 1, "restaurar dos veces no pone dos");

    // --- 2. Borrar el enlace en la página (Supr, «Eliminar» del menú): a la papelera con su subárbol ---
    const B = await crea("Se borra");
    const BN = await crea("Se va con ella", B.id);
    await editar(v, [{ op: "delete", id: idEnlace(B.id) }]);
    await hasta("la hija borrada en la papelera", () => archivada(B.id), (a) => a, MARGEN);
    assert.ok(await archivada(BN.id), "con su subárbol");
    // Deshacer (Ctrl+Z) cuando ya estaba en la papelera: vuelve el bloque y sale de ella.
    await editar(v, [{ op: "upsert", block: enl(idEnlace(B.id), B), parentId: null, afterId: "b1" }]);
    await hasta("fuera de la papelera al deshacer", () => archivada(B.id), (a) => !a, MARGEN);
    assert.ok(!(await archivada(BN.id)));
    assert.equal(enlacesA(await v.bloques(), B.id).length, 1);

    // --- Lo que NO archiva: todo a la vez y una sola espera ---
    const U = await crea("Deshacer enseguida");
    await editar(v, [{ op: "delete", id: idEnlace(U.id) }]);
    await espera(400);
    await editar(v, [{ op: "upsert", block: enl(idEnlace(U.id), U), parentId: null, afterId: "b1" }]);

    const Mv = await crea("Se mueve");
    await editar(v, [{ op: "move", id: idEnlace(Mv.id), parentId: null, afterId: "b1" }]); // dentro de la página
    await editar(v, [{ op: "move", id: idEnlace(Mv.id), parentId: "c1", afterId: "c1p" }]); // a una columna
    await editar(v, [{ op: "move", id: idEnlace(Mv.id), parentId: null, afterId: "cols" }]); // fuera de la columna

    const Cx = await crea("Se corta y se pega");
    await editar(v, [{ op: "delete", id: idEnlace(Cx.id) }]); // Ctrl+X
    await espera(3000);
    await editar(v, [{ op: "upsert", block: enl("pegado-1", Cx), parentId: "c1", afterId: null }]); // Ctrl+V, con id nuevo

    const otra = await mutation("pages.create", { title: "Destino de «Mover a»" });
    const Ma = await crea("Mover a otra página");
    await mutation("pages.move", { id: Ma.id, parentId: otra.id }); // «Mover a» y soltar en el panel lateral

    const Cv = await crea("Se convierte y se deshace");
    const titulo = (p: { id: string; title: string }, id: string): BloqueBN =>
      ({ ...enl(id, p), type: "heading", props: { level: 2 } });
    await editar(v, [{ op: "upsert", block: titulo(Cv, idEnlace(Cv.id)) }]);
    await espera(400);
    await editar(v, [{ op: "upsert", block: enl(idEnlace(Cv.id), Cv) }]);
    const Ct = await crea("Se queda en título");
    await editar(v, [{ op: "upsert", block: titulo(Ct, idEnlace(Ct.id)) }]);
    const Tx = await crea("Escriben junto al chip");
    await editar(v, [{ op: "upsert", block: { ...enl(idEnlace(Tx.id), Tx), content: [...(enl("x", Tx).content as object[]), { type: "text", text: " y algo más", styles: {} }] } }]);

    const Z = await crea("No es hija", null);
    await editar(v, [{ op: "upsert", block: enl("z-link", Z), parentId: null, afterId: "b1" }]);
    await hasta("el enlace a la que no es hija", v.bloques, (b) => enlacesA(b, Z.id).length === 1);
    await editar(v, [{ op: "delete", id: "z-link" }]);

    const T = await crea("Mencionada en un texto");
    await editar(v, [{ op: "upsert", block: { id: "con-mencion", type: "paragraph", content: [{ type: "text", text: "Ver ", styles: {} }, ...(enl("x", T).content as object[])], children: [] }, parentId: null, afterId: "b1" }]);
    await hasta("el texto con la mención", v.bloques, (b) => b.some((x) => x.id === "con-mencion"));
    await editar(v, [{ op: "delete", id: "con-mencion" }]);

    // Sin conexión: la otra pestaña se desconecta, el servidor pone un enlace y ella
    // edita otra cosa; al volver, el enlace sigue (Yjs no borra lo que no vio).
    w.provider.disconnect();
    const Off = await crea("Creada mientras la otra estaba sin conexión");
    await editar(w, [{ op: "upsert", block: par("b1", "Arriba (editado sin conexión)") }]);
    await w.provider.connect();
    await hasta("lo editado sin conexión, en la primera pestaña", v.bloques, (b) =>
      JSON.stringify(b.find((x) => x.id === "b1")?.content ?? "").includes("sin conexión"));

    await espera(MARGEN);
    for (const p of [U, Mv, Cx, Ma, Cv, Ct, Tx, Z, T, Off]) assert.ok(!(await archivada(p.id)), `«${p.title}» no va a la papelera`);
    assert.equal((await db.page.findUnique({ where: { id: Ma.id } }))?.parentId, otra.id);
    bs = await v.bloques();
    for (const p of [U, Cx, Cv, Off]) assert.equal(enlacesA(bs, p.id).length, 1, `un enlace a «${p.title}»`);
    assert.equal(enlacesA(bs, Ma.id).length, 0, "lo movido a otra página ya no está aquí");

    // Restaurar una versión del historial que no tenía el enlace de una hija viva y sí
    // el de una que está en la papelera: no cambia qué páginas existen.
    const MV = await mutation("pages.create", { title: "Madre con versiones" });
    const vv = await abrir(MV.id);
    const Vh = await mutation("pages.create", { parentId: MV.id, title: "Viva después de la versión" });
    const Va = await mutation("pages.create", { parentId: MV.id, title: "En la papelera antes de restaurar" });
    await hasta("los enlaces de la madre con versiones", vv.bloques, (b) => enlacesA(b, Vh.id).length === 1 && enlacesA(b, Va.id).length === 1);
    await mutation("pages.archive", { id: Va.id });
    const version = await db.version.create({ data: { pageId: MV.id, snapshot: [par("vv1", "Versión vieja"), enl("va-link", Va), par("vv9", "")] as never } });
    const r = (await mutation("pages.versions.restore", { versionId: version.id })) as { bloques: BloqueBN[] };
    assert.equal(enlacesA(r.bloques, Vh.id).length, 1, "la versión restaurada enlaza a la hija viva");
    assert.equal(enlacesA(r.bloques, Va.id).length, 0, "y no a la que está en la papelera");
    // Lo que hace el editor con la versión (reemplazar todos los bloques).
    const ahora = await vv.bloques();
    let detras: string | null = null;
    await editar(vv, [
      ...ahora.map((b) => ({ op: "delete" as const, id: b.id })),
      ...r.bloques.map((b) => {
        const op = { op: "upsert" as const, block: b, parentId: null, afterId: detras };
        detras = b.id;
        return op;
      }),
    ]);
    await espera(MARGEN);
    const trasVersion = await vv.bloques();
    vv.cerrar();
    assert.ok(!(await archivada(Vh.id)), "restaurar una versión no manda nada a la papelera");
    assert.ok(await archivada(Va.id), "ni saca nada de ella");
    assert.equal(enlacesA(trasVersion, Vh.id).length, 1);
    assert.equal(enlacesA(trasVersion, Va.id).length, 0);


    // --- Restaurar con la madre en la papelera: a la raíz del espacio ---
    const P3 = await crea("Madre que se va", null);
    const K = await crea("Hija que se fue antes", P3.id);
    await mutation("pages.archive", { id: K.id });
    await mutation("pages.archive", { id: P3.id });
    await mutation("pages.restore", { id: K.id });
    const k = await db.page.findUnique({ where: { id: K.id } });
    assert.ok(k && !k.archivedAt && k.parentId === null, "vuelve a la raíz");
    assert.ok(await archivada(P3.id), "la madre sigue en la papelera");

    // --- Purga a los 30 días y «Vaciar papelera»: ningún enlace apunta a una página borrada ---
    const Z2 = await crea("Se purga", null);
    const Z3 = await crea("Se vacía", null);
    await editar(v, [
      { op: "upsert", block: enl("z2-link", Z2), parentId: null, afterId: null },
      { op: "upsert", block: enl("z3-link", Z3), parentId: null, afterId: null },
    ]);
    await hasta("los enlaces a borrar", v.bloques, (b) => enlacesA(b, Z2.id).length === 1 && enlacesA(b, Z3.id).length === 1);
    await mutation("pages.updateContent", { id: M.id, content: await v.bloques() }); // el autoguardado del navegador
    await mutation("pages.archive", { id: Z2.id });
    await mutation("pages.archive", { id: Z3.id });
    await db.page.update({ where: { id: Z2.id }, data: { archivedAt: new Date(Date.now() - 40 * 864e5) } });
    await mutation("pages.purgeExpired", {});
    await hasta("el enlace a la purgada, fuera", v.bloques, (b) => enlacesA(b, Z2.id).length === 0);
    await mutation("pages.emptyTrash", {});
    await hasta("el enlace a la vaciada, fuera", v.bloques, (b) => enlacesA(b, Z3.id).length === 0);
  } finally {
    v.cerrar();
    w.cerrar();
  }
}

/** La reparación de lo que dejó suelto la versión anterior (`collab/dist/reparar-subpaginas.mjs`). */
async function reparacion() {
  const R = await mutation("pages.create", { title: "Madre a reparar" });
  await mutation("pages.updateContent", { id: R.id, content: [par("r1", "Texto"), par("r9", "")] });
  const v = await abrir(R.id);
  try {
    const H1 = await mutation("pages.create", { parentId: R.id, title: "Sin enlace", enlazar: false });
    const H2 = await mutation("pages.create", { parentId: R.id, title: "En la papelera con enlace" });
    const H3 = await mutation("pages.create", { parentId: R.id, title: "Doble" });
    await hasta("los enlaces de H2 y H3", v.bloques, (b) => enlacesA(b, H2.id).length === 1 && enlacesA(b, H3.id).length === 1);
    const X = await mutation("pages.create", { title: "Ya no existe" });
    const Yp = await mutation("pages.create", { title: "Mencionada normal" });
    await editar(v, [
      { op: "upsert", block: enl("x-link", X), parentId: null, afterId: "r1" },
      { op: "upsert", block: enl("h3-otro", H3), parentId: null, afterId: "x-link" },
      { op: "upsert", block: enl("y-link", Yp), parentId: null, afterId: "h3-otro" },
      { op: "upsert", block: { id: "texto-h2", type: "paragraph", content: [{ type: "text", text: "Ver ", styles: {} }, ...(enl("x", H2).content as object[])], children: [] }, parentId: null, afterId: "y-link" },
    ]);
    await hasta("lo sembrado", v.bloques, (b) => b.some((x) => x.id === "texto-h2"));
    // Lo que dejaba la versión anterior: en la papelera sin quitar el enlace, y borrada del todo.
    await db.page.update({ where: { id: H2.id }, data: { archivedAt: new Date() } });
    await db.page.delete({ where: { id: X.id } });
    const { workspaceId } = await db.page.findUniqueOrThrow({ where: { id: R.id }, select: { workspaceId: true } });

    const reparar = (...args: string[]) =>
      execFileSync("node", ["collab/dist/reparar-subpaginas.mjs", "--url", BASE, "--espacio", workspaceId, ...args], { encoding: "utf8" });
    const antes = await v.bloques();
    const seco = reparar();
    for (const id of [H1.id, H2.id, X.id, H3.id]) assert.ok(seco.includes(id), `en seco lista ${id}:\n${seco}`);
    assert.ok(!seco.includes(Yp.id), "no toca enlaces a páginas que no son hijas");
    await espera(1500);
    assert.deepEqual(await v.bloques(), antes, "sin --aplicar no cambia nada");

    reparar("--aplicar");
    const bs = await hasta("la madre reparada", v.bloques, (b) =>
      enlacesA(b, H1.id).length === 1 && !b.some((x) => x.id === "x-link") && enlacesA(b, H3.id).length === 1 && donde(b, H2.id) === null);
    assert.equal(bs.at(-1)?.id, "r9", `el enlace nuevo, antes del párrafo vacío del final: ${bs.map((b) => b.id).join(" ")}`);
    assert.equal(enlacesA([bs.at(-2)!], H1.id).length, 1, "al final");
    assert.ok(bs.some((x) => x.id === "y-link") && bs.some((x) => x.id === "texto-h2"), "menciones y enlaces ajenos, intactos");
    assert.ok(await archivada(H2.id), "no saca nada de la papelera");
    assert.ok(/nada que arreglar/i.test(reparar("--aplicar")), "una segunda pasada no hace nada");

    // Al restaurar H2, su enlace vuelve donde estaba.
    await mutation("pages.restore", { id: H2.id });
    const tras = await hasta("el enlace de H2 de vuelta", v.bloques, (b) => donde(b, H2.id) !== null);
    assert.deepEqual(donde(tras, H2.id), donde(antes, H2.id));
  } finally {
    v.cerrar();
  }
}

async function main() {
  // SOLO=borrado | SOLO=reparacion: solo esa parte (son las lentas).
  if (process.env.SOLO === "borrado") return borrado();
  if (process.env.SOLO === "reparacion") return reparacion();
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

    // --- Borrar el bloque de enlace desde la app nativa: la página va a la papelera ---
    await mutation("app.aplicar", { id: madre.id, ops: [{ op: "delete", id: "app-chip" }] });
    await hasta("el enlace borrado", vista.bloques, (b) => enlacesA(b, deApp.id).length === 0);
    await hasta("la hija de la app en la papelera", () => archivada(deApp.id), (a) => a);

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

    await borrado();
    await reparacion();
    console.log("OK — subpáginas: enlace al crear, título en vivo, mover sin duplicar, app nativa, duplicar, papelera, borrar = un solo objeto y reparación");
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
