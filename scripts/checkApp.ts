/**
 * Pruebas del servidor para la app nativa (las llama scripts/check.ts).
 *
 * Lo que se prueba es lo que va a producción: el puente de colaboración se compila
 * con esbuild igual que `npm run build:collab` y se carga ese .mjs, con el mismo
 * Hocuspocus real y un cliente Yjs conectado por WebSocket, como un navegador.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Bloque = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: Bloque[] };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ¿Todo lo de `esperado` está en `real` con el mismo valor? (lo demás —defaults— puede sobrar). */
function contiene(real: unknown, esperado: unknown, ruta = "$"): void {
  if (esperado === null || typeof esperado !== "object") {
    // null y undefined son lo mismo: BlockNote deja undefined (anchos de columna sin
    // fijar) y al guardar pasan a null (jsonLimpio).
    assert.deepEqual(real ?? null, esperado ?? null, `distinto en ${ruta}`);
    return;
  }
  if (Array.isArray(esperado)) {
    assert.ok(Array.isArray(real), `${ruta} debería ser una lista`);
    assert.equal((real as unknown[]).length, esperado.length, `${ruta}: nº de elementos`);
    esperado.forEach((e, i) => contiene((real as unknown[])[i], e, `${ruta}[${i}]`));
    return;
  }
  assert.ok(real && typeof real === "object", `${ruta} debería ser un objeto`);
  for (const [k, v] of Object.entries(esperado)) contiene((real as Record<string, unknown>)[k], v, `${ruta}.${k}`);
}

const buscaBloque = (bs: Bloque[], id: string): Bloque | undefined => {
  for (const b of bs) {
    if (b.id === id) return b;
    const h = buscaBloque(b.children ?? [], id);
    if (h) return h;
  }
};

const textoDe = (b: Bloque | undefined) =>
  ((b?.content as { text?: string }[]) ?? []).map((c) => c.text ?? "").join("");

export async function compruebaApp() {
  const todos = JSON.parse(readFileSync(path.join(__dirname, "fixtures/bloques-todos.json"), "utf8")) as Bloque[];

  // El módulo del puente, compilado como en producción.
  const esbuild = await import("esbuild");
  // Junto al de verdad (collab/dist, fuera de git): así resuelve node_modules igual.
  const salida = path.join(__dirname, "../collab/dist/hocuspocus.check.mjs");
  await esbuild.build({
    entryPoints: [path.join(__dirname, "../collab/hocuspocus.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    outfile: salida,
    logLevel: "silent",
  });
  const colab = await import(pathToFileURL(salida).href);
  const bloquesYjs = await import("../src/server/app/bloquesYjs");

  // --- 1. Ida y vuelta de TODOS los tipos de bloque (sin perder ni un atributo), con el
  //        documento escrito a mano y con los generados por el editor de la web de verdad
  //        (scripts/fixtures-web.mjs) ---
  const { readdirSync } = await import("node:fs");
  for (const nombre of readdirSync(path.join(__dirname, "fixtures")).filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(path.join(__dirname, "fixtures", nombre), "utf8")) as Bloque[];
    const { Y } = await bloquesYjs.cargarLibs();
    const y = new Y.Doc();
    await bloquesYjs.aplicarOpsDoc(y, [], doc as never);
    contiene(await bloquesYjs.bloquesDeDoc(y), doc);
  }
  {
    const { Y } = await bloquesYjs.cargarLibs();
    const doc = new Y.Doc();
    await bloquesYjs.aplicarOpsDoc(doc, [], todos as never);
    const ida = (await bloquesYjs.bloquesDeDoc(doc)) as Bloque[];
    contiene(ida, todos);
    // Y estable: otra vuelta da exactamente lo mismo.
    const doc2 = new Y.Doc();
    await bloquesYjs.aplicarOpsDoc(doc2, [], ida as never);
    assert.deepEqual(await bloquesYjs.bloquesDeDoc(doc2), ida);
    // Cada bloque reescrito por la app (upsert sobre sí mismo) se queda igual.
    const plano: Bloque[] = [];
    const aplana = (bs: Bloque[]) => bs.forEach((b) => (plano.push(b), aplana(b.children ?? [])));
    aplana(ida);
    await bloquesYjs.aplicarOpsDoc(doc2, plano.map((b) => ({ op: "upsert" as const, block: b })));
    assert.deepEqual(await bloquesYjs.bloquesDeDoc(doc2), ida, "reescribir cada bloque tal cual no debe cambiar nada");
    // Las mismas operaciones sobre JSON (cuerpos de fila) dan lo mismo.
    assert.deepEqual(bloquesYjs.aplicarOpsJson(ida as never, plano.map((b) => ({ op: "upsert" as const, block: b }))), ida);
  }

  // --- 2. Comentarios en línea: reescribir el bloque no se los lleva ---
  {
    assert.deepEqual([...bloquesYjs.casaCaracteres("hola mundo", "¡hola, mundo!")], [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
    assert.deepEqual(bloquesYjs.mapeaTramo(bloquesYjs.casaCaracteres("hola mundo bonito", "¡hola mundo bonito!"), 5, 10), [6, 11]);
    // Si se borra todo el texto comentado, el comentario no tiene dónde quedarse.
    assert.equal(bloquesYjs.mapeaTramo(bloquesYjs.casaCaracteres("hola mundo", "hola"), 5, 10), null);

    const { Y } = await bloquesYjs.cargarLibs();
    const doc = new Y.Doc();
    await bloquesYjs.aplicarOpsDoc(doc, [], [{ id: "c1", type: "paragraph", content: "hola mundo bonito" }] as never);
    const texto = () => (((doc.getXmlFragment("document-store").get(0) as never as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>;
    // Así marca el navegador un comentario (la marca «comment» de BlockNote).
    texto().format(5, 5, { "comment--abcdefgh": { orphan: false, threadId: "hilo1" } });
    await bloquesYjs.aplicarOpsDoc(doc, [
      { op: "upsert", block: { id: "c1", type: "paragraph", content: [{ type: "text", text: "¡hola mundo bonito!", styles: { bold: true } }] } },
    ]);
    const delta = texto().toDelta() as { insert: string; attributes?: Record<string, unknown> }[];
    const comentado = delta.filter((d) => Object.keys(d.attributes ?? {}).some((k) => k.startsWith("comment")));
    assert.equal(comentado.map((d) => d.insert).join(""), "mundo", "el comentario debe seguir sobre «mundo»");
    assert.equal(delta.map((d) => d.insert).join(""), "¡hola mundo bonito!");
    assert.ok(delta.every((d) => d.attributes?.bold), "y el estilo nuevo, aplicado");
  }

  // --- 3. Operaciones: insertar, mover, convertir y borrar, también sobre JSON ---
  {
    const base: Bloque[] = [
      { id: "a", type: "paragraph", content: "uno" },
      { id: "b", type: "paragraph", content: "dos", children: [{ id: "b1", type: "paragraph", content: "hijo" }] },
    ];
    const ops = [
      { op: "upsert", block: { id: "n", type: "paragraph", content: "nuevo" }, parentId: "b", afterId: "b1" },
      { op: "upsert", block: { id: "p", type: "paragraph", content: "primero" }, parentId: null, afterId: null },
      { op: "move", id: "a", parentId: null, afterId: "b" },
      { op: "upsert", block: { id: "b", type: "heading", props: { level: 2 }, content: "dos" } },
      { op: "delete", id: "b1" },
      { op: "move", id: "b", parentId: "n" }, // dentro de su propio hijo: no se hace
      { op: "upsert", block: { id: "z", type: "paragraph", content: "huérfano" }, afterId: "no-existe" },
      { op: "delete", id: "no-existe" },
    ] as never;
    const { Y } = await bloquesYjs.cargarLibs();
    const doc = new Y.Doc();
    await bloquesYjs.aplicarOpsDoc(doc, [], base as never);
    await bloquesYjs.aplicarOpsDoc(doc, ops);
    const r = (await bloquesYjs.bloquesDeDoc(doc)) as Bloque[];
    const forma = (bs: Bloque[]): unknown => bs.map((b) => [b.id, b.type, ...(b.children?.length ? [forma(b.children)] : [])]);
    const esperado = [["p", "paragraph"], ["b", "heading", [["n", "paragraph"]]], ["a", "paragraph"], ["z", "paragraph"]];
    assert.deepEqual(forma(r), esperado);
    assert.equal(textoDe(buscaBloque(r, "b")), "dos");
    // Sobre JSON, lo mismo.
    const j = bloquesYjs.aplicarOpsJson(base as never, ops) as Bloque[];
    assert.deepEqual(forma(j), esperado);
  }

  // --- 3b. Markdown ↔ bloques (importar/exportar desde la app), con el conversor de BlockNote ---
  {
    const md = await import("../src/server/app/markdown");
    const bs = (await md.markdownABloques("# Hola\n\nTexto **fuerte**\n\n- uno\n- dos\n")) as Bloque[];
    assert.deepEqual(bs.map((b) => b.type), ["heading", "paragraph", "bulletListItem", "bulletListItem"]);
    const salida = await md.bloquesAMarkdown(todos as never);
    for (const trozo of ["# **Título grande**", "> *Una cita*", "| Ana", "**negrita**", "[un enlace](https://notion.so)", "izquierda", "derecha", "Base de datos"])
      assert.ok(salida.includes(trozo), `el Markdown exportado debería llevar «${trozo}»`);
    // jsdom solo mientras convierte: después no queda un document global colgando.
    assert.equal((globalThis as { document?: unknown }).document, undefined);
  }

  // --- 4. Con Hocuspocus de verdad: un navegador conectado recibe lo que escribe la
  //        app, y lo que escribe él a la vez en otro bloque no se pierde ---
  {
    const { createServer } = await import("node:http");
    const { WebSocketServer } = await import("ws");
    const { Hocuspocus } = await import("@hocuspocus/server");
    const { HocuspocusProvider } = await import("@hocuspocus/provider");
    const { Y } = await bloquesYjs.cargarLibs();

    const { Database } = await import("@hocuspocus/extension-database");
    // Como en producción, el estado se guarda (aquí en memoria en vez de en Page.ydoc).
    const guardado = new Map<string, Uint8Array>();
    const hocuspocus = new Hocuspocus({
      extensions: [
        new Database({
          fetch: async ({ documentName }) => guardado.get(documentName) ?? null,
          store: async ({ documentName, state }) => void guardado.set(documentName, state),
        }),
      ],
    });
    const puente = colab.puenteApp(hocuspocus);
    const wss = new WebSocketServer({ noServer: true });
    const server = createServer((_req, res) => res.end("ok"));
    server.on("upgrade", (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => colab.attachConnection(hocuspocus, ws, request));
    });
    await new Promise<void>((listo) => server.listen(0, "127.0.0.1", listo));
    const { port } = server.address() as { port: number };

    // La app estrena la página (documento vacío + su copia legible como semilla).
    const semilla = [
      { id: "x", type: "paragraph", content: "bloque del navegador" },
      { id: "y", type: "paragraph", content: "bloque de la app" },
    ];
    const tras = (await puente.aplicar("pagina-app", [], semilla)) as Bloque[];
    assert.deepEqual(tras.map((b) => textoDe(b)), ["bloque del navegador", "bloque de la app"]);

    const doc = new Y.Doc();
    const navegador = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}`, name: "pagina-app", document: doc });
    await Promise.race([
      new Promise<void>((ok) => navegador.on("synced", () => ok())),
      espera(5000).then(() => {
        throw new Error("el navegador de prueba no sincroniza");
      }),
    ]);
    assert.deepEqual(((await bloquesYjs.bloquesDeDoc(doc)) as Bloque[]).map((b) => textoDe(b)), ["bloque del navegador", "bloque de la app"]);

    // A la vez: el navegador escribe en «x» y la app reescribe «y» (sin esperarse).
    const textoX = (((doc.getXmlFragment("document-store").get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>;
    textoX.insert(0, "¡");
    const app = puente.aplicar("pagina-app", [
      { op: "upsert", block: { id: "y", type: "paragraph", content: "la app escribió esto" } },
      { op: "upsert", block: { id: "w", type: "checkListItem", props: { checked: true }, content: "tarea nueva" }, afterId: "y" },
    ], []);
    textoX.insert(textoX.length, "!");
    const deLaApp = (await app) as Bloque[];
    assert.equal(textoDe(buscaBloque(deLaApp, "y")), "la app escribió esto");
    await espera(400);
    const enNavegador = (await bloquesYjs.bloquesDeDoc(doc)) as Bloque[];
    assert.deepEqual(enNavegador.map((b) => textoDe(b)), ["¡bloque del navegador!", "la app escribió esto", "tarea nueva"], "el navegador recibe lo de la app y conserva lo suyo");
    assert.equal(buscaBloque(enNavegador, "w")?.props?.checked, true);
    // Y el servidor tiene lo de los dos (lo que se guardaría en Page.ydoc).
    const enServidor = await bloquesYjs.bloquesDeEstado((await puente.estado("pagina-app"))!);
    assert.deepEqual(enServidor, enNavegador);

    // Renombrar una página llega a sus menciones del documento vivo sin tocar el texto de al lado.
    await puente.aplicar("pagina-app", [
      { op: "upsert", block: { id: "enl", type: "paragraph", content: [{ type: "mention", props: { pageId: "hija", title: "", icon: "" } }] }, afterId: "w" },
    ], []);
    await puente.aplicar("pagina-app", [{ op: "mencion", pageId: "hija", title: "Viaje", icon: "🏔️" }], []);
    await espera(300);
    const renombrado = (await bloquesYjs.bloquesDeDoc(doc)) as Bloque[];
    assert.deepEqual((buscaBloque(renombrado, "enl")?.content as { props: unknown }[])[0].props, { pageId: "hija", title: "Viaje", icon: "🏔️" });
    assert.equal(textoDe(buscaBloque(renombrado, "x")), "¡bloque del navegador!");

    navegador.destroy();
    await espera(100);
    server.close();
  }

  // --- 5. Enlaces a subpáginas (src/server/subpaginas.ts) ---
  {
    const sub = await import("../src/server/subpaginas");
    const enlace = (id: string, pageId: string, extra: unknown[] = []) =>
      ({ id, type: "paragraph", content: [{ type: "mention", props: { pageId, title: "", icon: "" } }, ...extra] }) as never;
    assert.equal(sub.enlaceDe(enlace("a", "p1")), "p1");
    assert.equal(sub.enlaceDe(enlace("a", "p1", [{ type: "text", text: " ", styles: {} }])), "p1", "con un espacio detrás sigue siendo un enlace");
    assert.equal(sub.enlaceDe(enlace("a", "p1", [{ type: "text", text: " y más", styles: {} }])), null, "una mención dentro de un texto no lo es");
    assert.equal(sub.enlaceDe(enlace("a", "p1", [{ type: "mention", props: { pageId: "p2" } }])), null);
    const doc = [
      { id: "t", type: "paragraph", content: "texto" },
      { id: "l", type: "toggleListItem", content: "plegable", children: [enlace("dentro", "p1")] },
      { id: "fin", type: "paragraph", content: [], children: [] },
    ] as never;
    assert.deepEqual(sub.enlacesA(doc, "p1"), [{ id: "dentro", pageId: "p1", parentId: "l", afterId: null }]);
    assert.equal(sub.ultimoBloque(doc), "l", "al final, pero antes del párrafo vacío del editor");
    assert.equal(sub.ultimoBloque([{ id: "solo", type: "paragraph", content: [] }] as never), null);
    assert.equal(sub.ultimoBloque([{ id: "texto", type: "paragraph", content: "con texto" }] as never), "texto", "el texto en cadena no es un párrafo vacío");
    // La app pone su enlace en el cursor: se quita el que dejó el servidor al final, no otro.
    assert.deepEqual(sub.sinEnlaceDoble([{ op: "upsert", block: enlace("chip", "p1") }]).slice(1), [{ op: "delete", id: "subpagina-p1" }]);
    assert.equal(sub.sinEnlaceDoble([{ op: "upsert", block: enlace("subpagina-p1", "p1") }]).length, 1);
    // Renombrar sobre JSON (páginas sin documento compartido).
    const j = bloquesYjs.aplicarOpsJson(doc, [{ op: "mencion", pageId: "p1", title: "Nuevo", icon: "" }]) as Bloque[];
    assert.equal((buscaBloque(j, "dentro")?.content as { props: { title: string } }[])[0].props.title, "Nuevo");
  }
}
