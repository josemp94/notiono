#!/usr/bin/env node
/**
 * Genera documentos de prueba REALES con el editor de la web (BlockNote de verdad, en
 * un navegador), para las pruebas de ida y vuelta del servidor y de la app nativa
 * (scripts/fixtures/web-*.json).
 *
 *   # Notiono en local (ver scripts/integracion-app.ts) y Playwright instalado fuera del repo:
 *   PLAYWRIGHT_DIR=~/.cache/notiono-pglite BASE_URL=http://127.0.0.1:3100 node scripts/fixtures-web.mjs
 *   (CHROMIUM=/ruta/a/chrome si el navegador de esa versión de Playwright no está descargado)
 *
 * Entra con el SSO falso, crea una página y escribe en ella como una persona: atajos
 * Markdown, el menú «/» con los bloques propios (llamada, ecuación, índice, columnas,
 * base de datos, enlace web), menciones con «@», tabla, imagen subida… y guarda lo que
 * el editor deja en Page.content.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? ".", "x.js"));
const { chromium } = require("playwright");

function ssoFalso() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:55433");
    const json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (url.pathname === "/.well-known/openid-configuration") json({
      authorization_endpoint: "http://127.0.0.1:55433/authorize", token_endpoint: "http://127.0.0.1:55433/token",
      userinfo_endpoint: "http://127.0.0.1:55433/userinfo",
    });
    else if (url.pathname === "/authorize") {
      const vuelta = new URL(url.searchParams.get("redirect_uri"));
      vuelta.searchParams.set("code", "c"); vuelta.searchParams.set("state", url.searchParams.get("state"));
      res.writeHead(302, { Location: vuelta.toString() }).end();
    } else if (url.pathname === "/token") json({ access_token: "at" });
    else if (url.pathname === "/userinfo") json({ sub: "ana", email: "ana@example.com", name: "Ana" });
    else res.writeHead(404).end();
  });
  return new Promise((ok) => server.listen(55433, "127.0.0.1", () => ok(server)));
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sso = await ssoFalso();
  // CHROMIUM: un Chromium ya descargado si el de la versión de Playwright no está.
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await navegador.newContext({ viewport: { width: 1200, height: 900 }, locale: "es-ES" });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  try {
    await p.goto(`${BASE}/api/auth/oidc/start`);
    await p.waitForURL(`${BASE}/`);
    const trpc = (ruta, input, mut = true) => p.evaluate(async ([ruta, input, mut]) => {
      const r = mut
        ? await fetch(`/api/trpc/${ruta}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: input }) })
        : await fetch(`/api/trpc/${ruta}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`);
      return (await r.json()).result.data.json;
    }, [ruta, input, mut]);
    const destino = await trpc("pages.create", { title: "Página enlazada" });
    const pagina = await trpc("pages.create", { title: "Documento de prueba" });
    await p.goto(`${BASE}/p/${pagina.id}`);
    const cuerpo = p.locator(".bn-editor").first();
    await cuerpo.waitFor();
    await cuerpo.click();
    const k = p.keyboard;
    const escribe = async (t) => { await k.type(t, { delay: 8 }); };
    const intro = async () => { await k.press("Enter"); await espera(60); };
    const barra = async (consulta) => {
      await escribe("/" + consulta);
      await p.locator(".bn-suggestion-menu").first().waitFor();
      await espera(150);
      await k.press("Enter");
      await espera(400);
    };

    await escribe("# Título uno"); await intro();
    await escribe("## Título dos"); await intro();
    await escribe("Texto con **negrita** y *cursiva* y ~~tachado~~ y `código` normal."); await intro();
    await escribe("Mención a "); await escribe("@Página enl"); await p.locator(".bn-suggestion-menu").first().waitFor(); await espera(500); await intro();
    await escribe("y a "); await escribe("@Ana"); await espera(500); await intro();
    await escribe("para "); await escribe("@hoy"); await espera(500); await intro();
    await intro();
    await escribe("- viñeta uno"); await intro();
    await k.press("Tab"); await escribe("anidada"); await intro();
    await k.press("Shift+Tab"); await escribe("viñeta dos"); await intro(); await intro();
    await escribe("1. primera"); await intro(); await escribe("segunda"); await intro(); await intro();
    await escribe("[] tarea pendiente"); await intro(); await intro();
    await escribe("> una cita"); await intro();
    await barra("lista plegable"); await escribe("desplegable");
    await intro(); await intro();
    await barra("llamada"); await escribe("una llamada importante"); await intro(); await intro();
    await barra("divisor");
    await barra("ecuación"); await escribe("c = \\sqrt{a^2 + b^2}"); await k.press("Enter"); await espera(300);
    await cuerpo.click({ position: { x: 5, y: 5 } }).catch(() => {});
    await p.locator(".bn-block-outer").last().click();
    await barra("tabla de contenidos");
    await p.locator(".bn-block-outer").last().click();
    await barra("tabla"); await escribe("celda");
    await p.locator(".bn-block-outer").last().click();
    await barra("dos columnas"); await escribe("columna izquierda");
    await p.locator(".bn-block-outer").last().click();
    await barra("enlace web"); await espera(1500);
    await p.locator(".bn-block-outer").last().click();
    await barra("base de datos"); await espera(1500);
    await p.locator(".bn-block-outer").last().click();
    await barra("imagen");
    const [archivo] = await Promise.all([
      p.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
      p.getByText(/Subir imagen|Upload image/i).first().click().catch(() => {}),
    ]);
    if (archivo) await archivo.setFiles(path.join(process.cwd(), "public/icon-192.png"));
    await espera(2500);
    await k.press("Escape");
    await p.locator(".bn-block-outer").last().click();
    // El código, lo último: dentro de él Enter es un salto de línea, no un bloque nuevo.
    await barra("bloque de código"); await escribe("const x = 1;");
    await espera(1500);

    const pg = await trpc("pages.get", { id: pagina.id }, false);
    const contenido = pg.content;
    await p.screenshot({ path: "/tmp/fixtures-web.png", fullPage: true });
    const salida = path.join(process.cwd(), "scripts/fixtures/web-editor.json");
    writeFileSync(salida, JSON.stringify(contenido, null, 2) + "\n");
    const tipos = new Set();
    const recorre = (bs) => bs.forEach((b) => { tipos.add(b.type); recorre(b.children ?? []); });
    recorre(contenido);
    console.log(`${contenido.length} bloques → ${salida}`);
    console.log("tipos:", [...tipos].sort().join(", "));
    console.log("(destino de la mención:", destino.id, ")");
  } finally {
    await navegador.close();
    sso.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
