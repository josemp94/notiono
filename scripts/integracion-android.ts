/**
 * Integración de la APP NATIVA (su capa de red, su editor y su sincronía, en Kotlin)
 * contra un Notiono de verdad en local, con un «navegador» conectado por Yjs a la misma
 * página escribiendo a la vez en otro bloque.
 *
 *   # Notiono en local como en scripts/integracion-app.ts (server.mjs + PGlite + SSO falso)
 *   BASE_URL=http://127.0.0.1:3100 npx tsx scripts/integracion-android.ts
 *
 * Este script prepara la página, conecta el navegador y lanza la prueba Kotlin
 * (app-android: IntegracionTest) con Gradle; al terminar comprueba, desde el navegador,
 * que le llegó lo que escribió la app y que no se perdió nada de lo suyo.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { ssoFalso } from "./sso-falso";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sso = await ssoFalso();
  try {
    // Sesión web (cookie) para preparar la página, como un navegador.
    const r1 = await fetch(`${BASE}/api/auth/oidc/start`, { redirect: "manual" });
    const jar = r1.headers.getSetCookie().map((c) => c.split(";")[0]);
    const r2 = await fetch(r1.headers.get("location")!, { redirect: "manual" });
    const r3 = await fetch(r2.headers.get("location")!, { redirect: "manual", headers: { Cookie: jar.join("; ") } });
    const cookie = r3.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("notiono_session="))!;
    const mut = async (ruta: string, input: unknown) => {
      const r = await fetch(`${BASE}/api/trpc/${ruta}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ json: input }) });
      return (await r.json()).result.data.json;
    };
    const pagina = await mut("pages.create", { title: "Integración Android" });
    const parrafo = (id: string, t: string) => ({ id, type: "paragraph", content: [{ type: "text", text: t, styles: {} }] });
    await mut("app.aplicar", { id: pagina.id, ops: [{ op: "upsert", block: parrafo("x", "del navegador") }, { op: "upsert", block: parrafo("y", "para la app"), afterId: "x" }] });

    // El navegador se conecta y escribe en «x» sin parar mientras corre la prueba de la app.
    const { HocuspocusProvider } = await import("@hocuspocus/provider");
    const Y = await import("yjs");
    const doc = new Y.Doc();
    const navegador = new HocuspocusProvider({
      url: `${BASE.replace("http", "ws")}/collab`,
      name: pagina.id,
      document: doc,
      token: async () => (await mut("pages.collabToken", { id: pagina.id })).token,
    });
    await new Promise<void>((ok) => navegador.on("synced", () => ok()));
    const textoX = () =>
      (((doc.getXmlFragment("document-store").get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>;
    let puntos = 0;
    const tecleo = setInterval(() => {
      textoX().insert(textoX().length, "·");
      puntos++;
    }, 150);

    // Asíncrono: el SSO falso y el navegador viven en este mismo proceso.
    const gradle = spawn(
      "./gradlew",
      [":app:testDebugUnitTest", "--tests", "com.monrealperez.notiono.IntegracionTest", "--rerun", "--console=plain", "-q",
        `-Pnotiono.integracion=${BASE}`, `-Pnotiono.pagina=${pagina.id}`],
      { cwd: path.join(__dirname, "../app-android"), stdio: "inherit", env: process.env },
    );
    const salida = await new Promise<number | null>((ok) => gradle.on("exit", ok));
    clearInterval(tecleo);
    assert.equal(salida, 0, "la prueba de la app (IntegracionTest) falló");
    await espera(800);

    // Desde el navegador: lo de la app llegó y lo suyo sigue entero.
    const grupo = doc.getXmlFragment("document-store").get(0) as InstanceType<typeof Y.XmlElement>;
    const textos = grupo.toArray().map((c) => {
      const cont = (c as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlElement>;
      return cont.toArray().map((t) => (t instanceof Y.XmlText ? t.toString() : "")).join("");
    });
    assert.equal(textos[0], "del navegador" + "·".repeat(puntos), "el navegador perdió algo de lo que escribió");
    assert.ok(textos.includes("la app escribió esto desde Android"), `al navegador no le llegó lo de la app: ${JSON.stringify(textos)}`);
    navegador.destroy();
    console.log(`OK — la app nativa contra Notiono local (${puntos} pulsaciones del navegador a la vez, ninguna perdida)`);
  } finally {
    sso.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
