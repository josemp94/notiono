/**
 * Integración del servidor para la app nativa, contra una instalación de verdad
 * (la de producción: `server.mjs`, con la colaboración en /collab).
 *
 *   # 1) PGlite (ver «La app entera en local» en docs/movil.md) y migraciones
 *   # 2) npm run build
 *   # 3) servidor apuntando al SSO falso que levanta este script (puerto 55433):
 *   AUTH_SECRET=prueba OIDC_ISSUER=http://127.0.0.1:55433 OIDC_CLIENT_ID=app \
 *     OIDC_CLIENT_SECRET=x APP_ORIGIN=http://127.0.0.1:3100 PORT=3100 HOSTNAME=127.0.0.1 \
 *     DATABASE_URL=… npm start
 *   # 4) BASE_URL=http://127.0.0.1:3100 npx tsx scripts/integracion-app.ts
 *
 * Comprueba el inicio de sesión de la app (SSO → notiono://auth?code → canje con
 * PKCE), que el de la web sigue igual, y que lo que escribe la app por operaciones
 * de bloque llega a un navegador conectado a la página sin pisar lo que escribe él.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- SSO falso (OIDC mínimo): autoriza a «Ana» sin preguntar ---
function ssoFalso() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:55433");
    if (url.pathname === "/.well-known/openid-configuration") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        authorization_endpoint: "http://127.0.0.1:55433/authorize",
        token_endpoint: "http://127.0.0.1:55433/token",
        userinfo_endpoint: "http://127.0.0.1:55433/userinfo",
      }));
    } else if (url.pathname === "/authorize") {
      const vuelta = new URL(url.searchParams.get("redirect_uri")!);
      vuelta.searchParams.set("code", "codigo-sso");
      vuelta.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: vuelta.toString() }).end();
    } else if (url.pathname === "/token") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ access_token: "at-ana" }));
    } else if (url.pathname === "/userinfo") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ sub: "ana", email: "ana@example.com", name: "Ana" }));
    } else res.writeHead(404).end();
  });
  return new Promise<typeof server>((ok) => server.listen(55433, "127.0.0.1", () => ok(server)));
}

/** Cookies «nombre=valor» de las cabeceras Set-Cookie de una respuesta. */
const cookiesDe = (r: Response) =>
  r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));

/** Recorre el SSO como lo haría la Custom Tab y devuelve dónde acaba. */
async function recorreSso(inicio: string): Promise<{ destino: string; cookies: string[] }> {
  const r1 = await fetch(`${BASE}${inicio}`, { redirect: "manual" });
  const jar = cookiesDe(r1);
  const r2 = await fetch(r1.headers.get("location")!, { redirect: "manual" }); // el SSO
  const r3 = await fetch(r2.headers.get("location")!, { redirect: "manual", headers: { Cookie: jar.join("; ") } }); // callback
  return { destino: r3.headers.get("location") ?? "", cookies: cookiesDe(r3) };
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

/** Cliente tRPC mínimo (como el de la app): GET para consultas, POST para mutaciones. */
function trpc(token: string) {
  const cabeceras = { Cookie: `notiono_session=${token}`, "Content-Type": "application/json" };
  const lee = async (r: Response) => {
    const j = await r.json();
    if (j.error) throw new Error(`${j.error.json?.data?.code}: ${j.error.json?.message}`);
    return j.result.data.json;
  };
  return {
    query: async (ruta: string, input: unknown) =>
      lee(await fetch(`${BASE}/api/trpc/${ruta}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers: cabeceras })),
    mutation: async (ruta: string, input: unknown) =>
      lee(await fetch(`${BASE}/api/trpc/${ruta}`, { method: "POST", headers: cabeceras, body: JSON.stringify({ json: input }) })),
  };
}

type Bloque = { id: string; type: string; props?: Record<string, unknown>; content?: { text?: string }[]; children?: Bloque[] };
const texto = (b?: Bloque) => (b?.content ?? []).map((c) => c.text ?? "").join("");

async function main() {
  const sso = await ssoFalso();
  try {
    // --- Sesión de la app ---
    const { verifier, challenge } = pkce();
    const app = await recorreSso(`/api/auth/oidc/start?app=1&challenge=${challenge}`);
    assert.match(app.destino, /^notiono:\/\/auth\?code=/, "el callback debe volver a la app");
    assert.ok(!app.cookies.some((c) => c.startsWith("notiono_session=")), "a la Custom Tab no se le da sesión");
    const code = new URL(app.destino).searchParams.get("code")!;
    const canje = await fetch(`${BASE}/api/app/sesion`, { method: "POST", body: JSON.stringify({ code, verifier }) });
    assert.equal(canje.status, 200);
    const { token, user } = (await canje.json()) as { token: string; user: { email: string } };
    assert.equal(user.email, "ana@example.com");
    // Un código solo vale una vez.
    const otra = await fetch(`${BASE}/api/app/sesion`, { method: "POST", body: JSON.stringify({ code, verifier }) });
    assert.equal(otra.status, 401);
    // Sin el verificador bueno no vale (y el código queda gastado).
    const p2 = pkce();
    const app2 = await recorreSso(`/api/auth/oidc/start?app=1&challenge=${p2.challenge}`);
    const code2 = new URL(app2.destino).searchParams.get("code")!;
    const mal = await fetch(`${BASE}/api/app/sesion`, { method: "POST", body: JSON.stringify({ code: code2, verifier: pkce().verifier }) });
    assert.equal(mal.status, 401);
    const yaGastado = await fetch(`${BASE}/api/app/sesion`, { method: "POST", body: JSON.stringify({ code: code2, verifier: p2.verifier }) });
    assert.equal(yaGastado.status, 401);
    // El flujo web, igual que siempre: vuelve a «/» con la cookie de sesión.
    const web = await recorreSso(`/api/auth/oidc/start`);
    assert.ok(web.destino.endsWith("/"), `el login web vuelve a la app web (fue a ${web.destino})`);
    assert.ok(web.cookies.some((c) => c.startsWith("notiono_session=")));
    console.log("✓ sesión de la app (SSO + PKCE) y login web intacto");

    const api = trpc(token);
    const yo = await api.query("auth.me", undefined);
    assert.equal(yo.email, "ana@example.com");
    const version = await (await fetch(`${BASE}/api/app/version`)).json();
    assert.ok(version.versionCode >= 1 && version.url === "/notiono.apk");

    // --- Página: la app escribe por bloques; un navegador conectado lo recibe ---
    const pagina = await api.mutation("pages.create", { title: "Prueba app" });
    let r = await api.mutation("app.aplicar", {
      id: pagina.id,
      ops: [
        { op: "upsert", block: { id: "x", type: "paragraph", content: [{ type: "text", text: "del navegador", styles: {} }] } },
        { op: "upsert", block: { id: "y", type: "paragraph", content: [{ type: "text", text: "de la app", styles: {} }] }, afterId: "x" },
      ],
    });
    assert.deepEqual((r.bloques as Bloque[]).map(texto), ["del navegador", "de la app"]);
    const leido = await api.query("app.bloques", { id: pagina.id });
    assert.equal(leido.huella, r.huella);
    assert.equal((await api.query("app.bloques", { id: pagina.id, huella: r.huella })).bloques, null, "sin cambios no se reenvía");
    // La copia legible (búsqueda, publicación, export) también se actualiza.
    const pg = await api.query("pages.get", { id: pagina.id });
    assert.deepEqual((pg.content as Bloque[]).map(texto), ["del navegador", "de la app"]);

    const { HocuspocusProvider } = await import("@hocuspocus/provider");
    const Y = await import("yjs");
    const doc = new Y.Doc();
    const navegador = new HocuspocusProvider({
      url: `${BASE.replace("http", "ws")}/collab`,
      name: pagina.id,
      document: doc,
      token: async () => (await api.mutation("pages.collabToken", { id: pagina.id })).token,
    });
    await Promise.race([
      new Promise<void>((ok) => navegador.on("synced", () => ok())),
      espera(8000).then(() => { throw new Error("el navegador de prueba no sincroniza con /collab"); }),
    ]);
    const xmlTexto = () =>
      (((doc.getXmlFragment("document-store").get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>;
    assert.equal(xmlTexto().toString(), "del navegador");
    // A la vez: el navegador escribe en «x» y la app en «y».
    xmlTexto().insert(0, "¡hola ");
    r = await api.mutation("app.aplicar", {
      id: pagina.id,
      ops: [{ op: "upsert", block: { id: "y", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "la app cambió esto", styles: {} }] } }],
    });
    await espera(600);
    const final = await api.query("app.bloques", { id: pagina.id });
    assert.deepEqual((final.bloques as Bloque[]).map((b) => [b.type, texto(b)]).slice(0, 2), [
      ["paragraph", "¡hola del navegador"],
      ["heading", "la app cambió esto"],
    ]);
    const segundo = (doc.getXmlFragment("document-store").get(0) as InstanceType<typeof Y.XmlElement>).get(1) as InstanceType<typeof Y.XmlElement>;
    assert.equal((segundo.get(0) as InstanceType<typeof Y.XmlElement>).nodeName, "heading", "el navegador recibe el cambio de la app");
    navegador.destroy();
    console.log("✓ operaciones de bloque en el documento vivo, con un navegador conectado");

    // --- Base de datos: filas de una vista con el motor de la web ---
    const bd = await api.mutation("db.create", { title: "Tareas app" });
    let v = await api.query("app.vista", { pageId: bd.id });
    assert.equal(v.filas.length, 3, "nace con 3 filas, como en la web");
    const titulo = (v.fields as { id: string; type: string }[]).find((f) => f.type === "text")!;
    await api.mutation("db.updateCell", { recordId: v.filas[0].id, fieldId: titulo.id, value: "Comprar pan" });
    await api.mutation("db.updateCell", { recordId: v.filas[1].id, fieldId: titulo.id, value: "Llamar al médico" });
    v = await api.query("app.vista", { pageId: bd.id, q: "pan" });
    assert.deepEqual(v.filas.map((f: { textos: Record<string, string> }) => f.textos[titulo.id]), ["Comprar pan"]);
    await api.mutation("db.updateView", { id: v.view.id, config: { ...v.view.config, sorts: [{ fieldId: titulo.id, dir: "desc" }], filters: [{ fieldId: titulo.id, op: "not_empty", value: "" }] } });
    v = await api.query("app.vista", { pageId: bd.id });
    assert.deepEqual(v.filas.map((f: { textos: Record<string, string> }) => f.textos[titulo.id]), ["Llamar al médico", "Comprar pan"]);
    // Cuerpo de una fila por operaciones (sin Yjs).
    const fila = await api.mutation("app.aplicarFila", {
      recordId: v.filas[0].id,
      ops: [{ op: "upsert", block: { id: "f1", type: "paragraph", content: [{ type: "text", text: "notas de la fila", styles: {} }] } }],
    });
    assert.equal(texto(fila.bloques[0]), "notas de la fila");
    console.log("✓ vistas de BD con filtros, orden y búsqueda del motor de la web; cuerpo de fila");

    // --- Markdown y plantillas ---
    const md = await api.query("app.exportarMarkdown", { id: pagina.id });
    assert.ok(md.markdown.includes("## la app cambió esto"));
    const bs = await api.mutation("app.markdownABloques", { markdown: "# Importada\n\n- [ ] tarea" });
    assert.deepEqual((bs as Bloque[]).map((b) => b.type), ["heading", "checkListItem"]);
    assert.ok((await api.query("app.plantillas", undefined)).length > 3);
    console.log("✓ Markdown y plantillas");

    // Cerrar sesión borra la sesión en el servidor.
    await api.mutation("auth.logout", undefined);
    await assert.rejects(api.query("app.bloques", { id: pagina.id }), /UNAUTHORIZED/);
    console.log("✓ cerrar sesión la invalida");
    console.log("OK — integración de la app nativa con el servidor");
  } finally {
    sso.close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
