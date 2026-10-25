/**
 * Recorrido de la APP NATIVA como una persona (RecorridoTest y RecorridoCompartirTest, en
 * Kotlin) contra un Notiono de verdad en local, y después la comprobación en el servidor,
 * con la sesión de la web: que lo hecho en el móvil quedó exactamente como lo dejaría la web
 * (bloques del documento compartido con su formato, celdas con el formato de cada tipo,
 * vistas, filtros, avisos, papelera, plantillas y lo compartido). Y espacios y compartir
 * (2.4.0): antes prepara a Rocío (comparte su espacio con Ana y le comparte una página de su
 * huerto, donde Ana es invitada) y después mira el espacio nuevo, la invitación pendiente,
 * la página compartida con Rocío y lo que Ana escribió como invitada.
 *
 *   # Notiono en local como en scripts/integracion-app.ts (server.mjs + PGlite + SSO falso)
 *   BASE_URL=http://127.0.0.1:3100 npx tsx scripts/recorrido-android.ts
 *
 * Una persona nueva por pasada (espacio limpio). Las capturas del recorrido salen en
 * app-android/app/build/recorrido/ (y «fallo.png» si algo no apareció a tiempo).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ssoFalso } from "./sso-falso";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const APP = path.join(__dirname, "../app-android/app");

type Bloque = { id: string; type: string; props?: Record<string, unknown>; content?: Inline[]; children?: Bloque[] };
type Inline = { type: string; text?: string; href?: string; styles?: Record<string, unknown>; content?: Inline[] };
const texto = (b: Bloque) => (b.content ?? []).map((c) => c.text ?? (c.content ?? []).map((x) => x.text ?? "").join("")).join("");

/** Entra en la web por el SSO (falso) con quien sea `persona` ahora mismo; devuelve la cookie de sesión. */
async function entraWeb() {
  const r1 = await fetch(`${BASE}/api/auth/oidc/start`, { redirect: "manual" });
  const jar = r1.headers.getSetCookie().map((x) => x.split(";")[0]);
  const r2 = await fetch(r1.headers.get("location")!, { redirect: "manual" });
  const r3 = await fetch(r2.headers.get("location")!, { redirect: "manual", headers: { Cookie: jar.join("; ") } });
  return r3.headers.getSetCookie().map((x) => x.split(";")[0]).find((x) => x.startsWith("notiono_session="))!;
}

/** tRPC como la web, con esa sesión y (si se da) ese espacio activo. */
function cliente(sesion: string, espacio?: string) {
  const Cookie = espacio ? `${sesion}; notiono_ws=${espacio}` : sesion;
  const lee = async (r: Response) => {
    const j = await r.json();
    if (j.error) throw new Error(`${j.error.json?.data?.code}: ${j.error.json?.message}`);
    return j.result.data.json;
  };
  return {
    q: async (ruta: string, input?: unknown) =>
      lee(await fetch(`${BASE}/api/trpc/${ruta}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`}`, { headers: { Cookie } })),
    mut: async (ruta: string, input: unknown) =>
      lee(await fetch(`${BASE}/api/trpc/${ruta}`, { method: "POST", headers: { Cookie, "Content-Type": "application/json" }, body: JSON.stringify({ json: input }) })),
  };
}

async function main() {
  const pasada = Date.now();
  const ana = { sub: `recorrido-${pasada}`, email: `ana.${pasada}@example.com`, name: "Ana" };
  const rocio = { sub: `rocio-${pasada}`, email: `rocio.${pasada}@example.com`, name: "Rocío" };
  // El SSO falso contesta con quien esté en `persona` (se cambia entre entradas).
  const persona = { ...ana };
  const sso = await ssoFalso(persona);
  rmSync(path.join(APP, "build/recorrido"), { recursive: true, force: true });
  rmSync(path.join(APP, "build/recorrido.json"), { force: true });
  rmSync(path.join(APP, "build/recorrido-compartir.json"), { force: true });
  rmSync(path.join(APP, "build/recorrido-espacios.json"), { force: true });
  try {
    // 0) Rocío y Ana ya han entrado alguna vez (en la web). Rocío comparte con Ana su espacio
    //    (aviso «te ha añadido») y, en su huerto, la página «Tomates» con edición: allí Ana es
    //    invitada (aviso «ha compartido»). Son avisos de otros espacios para la app de Ana.
    Object.assign(persona, rocio);
    const sesionRocio = await entraWeb();
    Object.assign(persona, ana);
    await entraWeb();
    const R = cliente(sesionRocio);
    const suyo = (await R.q("auth.me")).workspace;
    await R.mut("workspace.share", { email: ana.email, role: "editor" });
    const huerto = (await R.mut("workspace.create", { name: `Huerto ${pasada}` })).id;
    const H = cliente(sesionRocio, huerto);
    const tomates = (await H.mut("pages.create", { title: "Tomates" })).id;
    await H.mut("pages.updateContent", { id: tomates, content: [{ id: "t1", type: "paragraph", content: [{ type: "text", text: "Plantar en marzo. ", styles: {} }] }] });
    assert.deepEqual(await H.mut("pages.perms.invitar", { pageId: tomates, email: ana.email, level: "edit" }), { pendiente: false, miembro: false });
    const pendiente = `abuela${pasada}`;
    writeFileSync(path.join(APP, "build/recorrido-espacios-entrada.json"), JSON.stringify({
      pasada: String(pasada), rocio: rocio.email, pendiente, espacioRocio: suyo.id, espacioRocioNombre: suyo.name, huerto, tomates,
    }));

    // 1) La app, como una persona.
    const gradle = spawn(
      "./gradlew",
      // Con la memoria contenida (PC de 16 GB en uso): un solo worker y el demonio a 2 GB.
      ["--max-workers=1", "-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=640m -Dfile.encoding=UTF-8",
        ":app:testDebugUnitTest", "--tests", "com.monrealperez.notiono.RecorridoTest", "--tests", "com.monrealperez.notiono.RecorridoCompartirTest",
        "--rerun", "--console=plain", "-q", `-Pnotiono.integracion=${BASE}`, "-Proborazzi.test.record=true"],
      { cwd: path.join(APP, ".."), stdio: "inherit", env: process.env },
    );
    const salida = await new Promise<number | null>((ok) => gradle.on("exit", ok));
    if (salida !== 0) throw new Error("el recorrido de la app falló (ver app-android/app/build/reports/tests)");
    const h = JSON.parse(readFileSync(path.join(APP, "build/recorrido.json"), "utf8"));
    const c = JSON.parse(readFileSync(path.join(APP, "build/recorrido-compartir.json"), "utf8"));
    const e = JSON.parse(readFileSync(path.join(APP, "build/recorrido-espacios.json"), "utf8"));

    // 2) La misma persona en la web, para mirar el resultado.
    const cookie = await entraWeb();
    const { q, mut } = cliente(cookie);
    const yo = await q("auth.me");

    // --- La página: título, bloques con su tipo y formato, casillas (una, desde el widget), comentario y fuera de la papelera.
    const info = await q("app.pagina", { id: h.pagina });
    assert.equal(info.title, "Recorrido Android");
    assert.equal(info.archivedAt ?? null, null, "recuperada de la papelera");
    const { bloques } = (await q("app.bloques", { id: h.pagina })) as { bloques: Bloque[] };
    assert.deepEqual(
      bloques.slice(0, 4).map((b) => [b.type, texto(b)]),
      [["heading", "Lista de la compra"], ["checkListItem", "Pan"], ["checkListItem", "Leche"], ["quote", "Es importante comprar fruta"]],
    );
    assert.equal(bloques[0].props?.level, 2, "«## » es un encabezado 2");
    assert.equal(bloques[1].props?.checked, true, "«Pan», marcada desde el widget");
    assert.equal(bloques[2].props?.checked, true, "«Leche», marcada en el editor");
    assert.deepEqual(bloques[3].content?.find((x) => x.styles?.bold)?.text, "importante");
    // En el documento compartido que abre la web (Yjs), con la negrita como marca.
    const { HocuspocusProvider } = await import("@hocuspocus/provider");
    const Y = await import("yjs");
    const doc = new Y.Doc();
    const navegador = new HocuspocusProvider({
      url: `${BASE.replace("http", "ws")}/collab`, name: h.pagina, document: doc,
      token: async () => (await mut("pages.collabToken", { id: h.pagina })).token,
    });
    await new Promise<void>((ok) => navegador.on("synced", () => ok()));
    const textos: { insert: unknown; attributes?: Record<string, unknown> }[] = [];
    const recorre = (n: unknown) => {
      if (n instanceof Y.XmlText) textos.push(...(n.toDelta() as typeof textos));
      else if (n instanceof Y.XmlElement || n instanceof Y.XmlFragment) n.toArray().forEach(recorre);
    };
    recorre(doc.getXmlFragment("document-store"));
    navegador.destroy();
    assert.ok(textos.some((t) => t.insert === "importante" && t.attributes?.bold), "la negrita llega al documento de la web");
    const comentarios = await q("comments.list", { pageId: h.pagina });
    assert.ok(comentarios.some((x: { body: string }) => x.body === "¿Compramos también huevos?"));

    // --- La base de datos: cada propiedad con el formato de la web.
    const base = await q("app.vista", { pageId: h.bd });
    const campo = (n: string) => base.fields.find((f: { name: string }) => f.name === n);
    const opcion = (n: string, id: unknown) => campo(n).config.options.find((o: { id: string }) => o.id === id)?.label;
    const calendario = base.views.find((v: { type: string }) => v.type === "calendar");
    const kanban = base.views.find((v: { type: string }) => v.type === "kanban");
    const tabla = base.views.find((v: { type: string }) => v.type === "table");
    assert.ok(calendario && kanban && tabla, "tabla, kanban y calendario");
    const todo = await q("app.vista", { pageId: h.bd, viewId: calendario.id });
    const titulo = base.fields.find((f: { type: string }) => f.type === "text").id;
    const fila = (t: string) => todo.filas.find((f: { cells: Record<string, unknown> }) => f.cells[titulo] === t);
    const luz = fila("Luz de octubre");
    const v = (n: string) => luz.cells[campo(n).id];
    assert.equal(opcion("Categoría", v("Categoría")), "Casa");
    assert.equal(v("Importe"), 42.5);
    const hoy = new Date();
    const ymd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    assert.equal(typeof v("Fecha") === "string" ? v("Fecha") : (v("Fecha") as { start: string }).start, ymd);
    assert.equal(v("Pagado"), true);
    assert.deepEqual(v("Quién"), [yo.id]);
    assert.equal(v("Web"), "https://example.com");
    assert.deepEqual((v("Etiquetas") as string[]).map((id) => opcion("Etiquetas", id)).sort(), ["Luz", "Mensual"]);
    assert.equal(v("Estado"), "st_todo", "arrastrada en el Kanban a «Sin empezar»");
    assert.equal(fila("Pagar en el banco")?.parentId, luz.id, "la subtarea cuelga de su fila");
    assert.equal(fila("Agua")?.cells[campo("Pagado").id], true, "«Agua», pagada desde el widget");
    assert.deepEqual(tabla.config.filters, [{ fieldId: campo("Pagado").id, op: "is", value: true }]);
    assert.equal(kanban.config.groupByFieldId, campo("Estado").id);

    // --- El vencimiento de hoy: avisado y leído (se abrió desde la bandeja).
    const avisos = await q("notifications.list");
    const vence = avisos.find((a: { type: string; key: string | null }) => a.type === "due" && a.key?.includes(luz.id));
    assert.ok(vence?.read, "el aviso de vencimiento, leído");

    // --- Plantilla y compartir.
    assert.equal((await q("app.pagina", { id: h.plantilla })).title, "Notas de reunión");
    const compartida = (await q("app.bloques", { id: c.pagina })) as { bloques: Bloque[] };
    assert.equal((await q("app.pagina", { id: c.pagina })).title, "Recibo del súper");
    assert.deepEqual(compartida.bloques.map(texto), ["Recibo del súper", "Pan, leche y fruta", "https://example.com/recibo"]);
    assert.equal(compartida.bloques[2].content?.[0]?.type, "link");

    // --- Espacios y compartir: el espacio nuevo es suyo, con la invitación pendiente.
    const espacios = await q("workspace.list");
    assert.ok(espacios.some((w: { id: string; name: string; isOwner: boolean }) => w.id === e.casa && w.name === `Casa ${pasada}` && w.isOwner), "el espacio nuevo, suyo");
    const C = cliente(cookie, e.casa);
    assert.deepEqual((await C.q("workspace.members")).invitaciones.map((i: { destino: string; role: string }) => [i.destino, i.role]), [[pendiente, "viewer"]]);
    // «Para Rocío», compartida con ella con edición: es invitada en Casa y le llegó el aviso.
    const permisos = await C.q("pages.perms.get", { pageId: e.paraRocio });
    assert.deepEqual(permisos.invitados.map((p: { email: string; level: string }) => [p.email, p.level]), [[rocio.email, "edit"]]);
    const RC = cliente(sesionRocio, e.casa);
    assert.equal((await RC.q("auth.me")).wsRole, "guest");
    assert.ok((await RC.q("notifications.list")).some((n: { type: string; pageId: string }) => n.type === "share" && n.pageId === e.paraRocio));
    assert.deepEqual((await RC.q("pages.tree")).map((p: { id: string }) => p.id), [e.paraRocio], "Rocío solo ve lo compartido");
    // Lo que Ana escribió como invitada en «Tomates» (y los avisos, leídos al abrirlos no hace falta).
    const t = (await H.q("app.bloques", { id: tomates })) as { bloques: Bloque[] };
    assert.ok(t.bloques.map(texto).join(" ").includes("Riego los martes"), "lo escrito por la invitada, en el documento");

    console.log("OK — recorrido de la app como una persona, y el servidor lo tiene como lo dejaría la web");
  } finally {
    sso.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
