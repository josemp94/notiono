/**
 * Recorrido de la web para lo que faltaba de la app de notas de Pablo (encargo NOTAS-EXTRA,
 * 2.5.2) contra un Notiono de verdad en local, con un navegador. Se pone ROJO si vuelve atrás:
 *
 * - ⋯ → «Apariencia y diseño» (como Notion): Estilo, Texto pequeño (el cuerpo a 14 px) y Ancho
 *   completo; y el color de página (de Notiono): tiñe el fondo y se guarda en la página.
 * - Plantilla «Notas» con Etiquetas (Selección múltiple): la vista «Por etiqueta» pone una nota
 *   con dos etiquetas en los dos grupos, y la lupa de la BD encuentra por etiqueta.
 * - El color de una fila como página deja su barrita en la Lista.
 * - Ctrl+K encuentra una nota (fila de BD) por su título y la abre como página.
 * - Ajustes → «Copia en el NAS» enseña lo que informa la app.
 *
 * Con CAPTURAS=<carpeta> guarda capturas en claro y oscuro, a 1280 y a 390 px.
 *
 *   # Notiono en local (server.mjs + PGlite, ver scripts/integracion-app.ts) con el SSO
 *   # falso en el 55433 (lo levanta este script) y Playwright fuera del repo:
 *   PLAYWRIGHT_DIR=~/.cache/notiono-pglite BASE_URL=http://127.0.0.1:3100 npx tsx scripts/recorrido-web-notas.ts
 *   (CHROMIUM=/ruta/a/chrome si el navegador de esa versión de Playwright no está descargado)
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ssoFalso } from "./sso-falso";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const CAPTURAS = process.env.CAPTURAS;
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? ".", "x.js"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium }: { chromium: any } = require("playwright");

async function main() {
  const pasada = Date.now();
  const sso = await ssoFalso({ sub: `notas-${pasada}`, email: `notas.${pasada}@example.com`, name: "Pablo Notas" });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
    const page = await ctx.newPage();
    page.on("pageerror", (e: Error) => console.error("[pageerror]", e.message));
    await page.goto(`${BASE}/api/auth/oidc/start`);
    await page.waitForURL((u: URL) => !u.pathname.startsWith("/api/"));
    const llama = (ruta: string, input?: unknown, mutacion = false) =>
      page.evaluate(async ([r, i, m]: readonly [string, unknown, boolean]) => {
        const u = `/api/trpc/${r}${!m && i !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: i }))}` : ""}`;
        const res = await fetch(u, m ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: i }) } : undefined);
        const j = await res.json();
        if (j.error) throw new Error(`${r}: ${j.error.json?.message}`);
        return j.result.data.json;
      }, [ruta, input, mutacion] as const);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captura = async (p: any, nombre: string) => {
      if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, `web_${nombre}.png`) });
    };

    // ---------- Página: ⋯ → Apariencia y diseño ----------
    const pg = (await llama("pages.create", { title: "Ideas del finde" }, true)).id as string;
    await llama("pages.updateContent", { id: pg, content: [
      { id: "p1", type: "paragraph", content: [{ type: "text", text: "Ir al mercado y luego al parque.", styles: {} }], children: [] },
      { id: "c1", type: "checkListItem", props: { checked: false }, content: [{ type: "text", text: "Comprar fruta", styles: {} }], children: [] },
    ] }, true);
    await page.goto(`${BASE}/p/${pg}`);
    const parrafo = page.getByText("Ir al mercado y luego al parque.");
    await parrafo.waitFor();
    const tam = () => parrafo.evaluate((e: Element) => parseFloat(getComputedStyle(e).fontSize));
    assert.equal(await tam(), 16);
    await page.getByTitle("Opciones de página").click();
    const menu = page.locator("[data-menu]").first();
    assert.equal(await menu.getByText("Ancho completo").count(), 0, "Ancho completo va dentro de Apariencia y diseño, como en Notion");
    await menu.getByRole("button", { name: "Apariencia y diseño" }).click();
    for (const t of ["Estilo", "Texto pequeño", "Ancho completo", "Color de página"]) assert.ok(await menu.getByText(t, { exact: true }).count(), t);
    await menu.getByRole("button", { name: "Texto pequeño" }).click();
    await menu.getByRole("radio", { name: "Amarillo" }).click();
    await page.waitForTimeout(800);
    await captura(page, "apariencia_menu_claro");
    assert.equal(await tam(), 14, "Texto pequeño: el cuerpo a 14 px, como Notion");
    const fondo = () => page.locator("[data-color-pagina]").first().evaluate((e: Element) => getComputedStyle(e).backgroundColor);
    assert.equal(await fondo(), "rgb(250, 243, 221)", "fondo Amarillo de Notion (#FAF3DD)");
    const guardada = await llama("pages.get", { id: pg });
    assert.equal(guardada.color, "yellow");
    assert.equal(guardada.smallText, true);
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 400);
    await captura(page, "pagina_color_claro");

    // ---------- Notas con etiquetas, como la plantilla de Notion ----------
    const notas = (await llama("pages.createFromTemplate", { key: "notas" }, true)).id as string;
    const db = await llama("db.get", { pageId: notas });
    const porEtiqueta = db.views.find((v: { name: string }) => v.name === "Por etiqueta");
    assert.ok(porEtiqueta, "vista «Por etiqueta»");
    const titulo = db.fields.find((f: { type: string }) => f.type === "text").id as string;
    const viaje = db.records.find((r: { cells: Record<string, unknown> }) => r.cells[titulo] === "Ideas para el viaje");
    await llama("db.setRecordColor", { id: viaje.id, color: "blue" }, true);
    await page.goto(`${BASE}/p/${notas}?v=${porEtiqueta.id}`);
    await page.getByText("Lentejas de la abuela").first().waitFor();
    // Una nota con dos etiquetas sale en las dos (Ideas y Personal), no en un grupo «Ideas, Personal».
    assert.equal(await page.locator("li", { hasText: "Ideas para el viaje" }).count(), 2);
    const conColor = page.locator("li", { hasText: "Ideas para el viaje" }).first();
    assert.match(await conColor.evaluate((e: Element) => getComputedStyle(e).boxShadow), /rgb\(51, 126, 169\)/, "la barrita Azul de la fila");
    // La barrita no mueve el título, y las etiquetas van como pastillas (como Notion), no «Ideas, Personal».
    const x = async (t: string) => (await page.getByText(t, { exact: true }).first().boundingBox())!.x;
    assert.equal(await x("Ideas para el viaje"), await x("Lentejas de la abuela"));
    assert.ok(await conColor.getByText("Personal", { exact: true }).count());
    await captura(page, "notas_por_etiqueta_claro");
    // La lupa de la BD busca en las propiedades (notion.com/es/help/search): «Recetas» → la de lentejas.
    await page.getByTitle("Buscar en la base de datos").click();
    await page.keyboard.type("Recetas");
    await page.waitForTimeout(600);
    assert.equal(await page.locator("li", { hasText: "Ideas para el viaje" }).count(), 0);
    assert.ok(await page.locator("li", { hasText: "Lentejas de la abuela" }).count());

    // ---------- Ctrl+K encuentra la nota y la abre como página ----------
    await page.goto(`${BASE}/`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("lentejas");
    const res = page.getByRole("button", { name: /Lentejas de la abuela/ });
    await res.waitFor();
    assert.ok(await res.getByText("Notas").count(), "el resultado dice de qué base es");
    await captura(page, "buscar_nota_claro");
    await page.keyboard.press("Enter");
    await page.waitForURL((u: URL) => u.searchParams.has("r"));

    // ---------- Ajustes → Copia en el NAS ----------
    await page.goto(`${BASE}/settings`);
    const seccion = page.locator("section", { hasText: "Copia en el NAS" });
    await seccion.getByText(/Ajustes → Copia en el NAS/).waitFor();
    await llama("app.informaCopia", { activa: true, ultima: new Date().toISOString(), paginas: 42, error: null, carpeta: "/home/Notiono" }, true);
    await page.reload();
    await seccion.getByText(/42 páginas/).waitFor();
    assert.ok(await seccion.getByText("En /home/Notiono, en tu Synology Drive").count());
    await seccion.scrollIntoViewIfNeeded();
    await captura(page, "ajustes_copia_nas_claro");

    // ---------- Capturas en oscuro y a 390 px ----------
    if (CAPTURAS) {
      await page.evaluate(() => localStorage.setItem("theme", "dark"));
      for (const [ruta, nombre] of [[`/p/${pg}`, "pagina_color"], [`/p/${notas}?v=${porEtiqueta.id}`, "notas_por_etiqueta"]] as const) {
        await page.goto(`${BASE}${ruta}`);
        await page.waitForTimeout(1500);
        await captura(page, `${nombre}_oscuro`);
      }
      await page.goto(`${BASE}/settings`);
      await seccion.scrollIntoViewIfNeeded();
      await captura(page, "ajustes_copia_nas_oscuro");
      const movil = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
      for (const tema of ["claro", "oscuro"]) {
        await movil.goto(`${BASE}/`);
        await movil.evaluate((t: string) => localStorage.setItem("theme", t), tema === "oscuro" ? "dark" : "light");
        await movil.goto(`${BASE}/p/${pg}`);
        await movil.getByText("Ir al mercado y luego al parque.").waitFor();
        await movil.waitForTimeout(800);
        await captura(movil, `movil_pagina_color_${tema}`);
        await movil.getByTitle("Opciones de página").click();
        await movil.locator("[data-menu]").first().getByRole("button", { name: "Apariencia y diseño" }).click();
        await movil.waitForTimeout(400);
        await captura(movil, `movil_apariencia_menu_${tema}`);
        await movil.goto(`${BASE}/p/${notas}?v=${porEtiqueta.id}`);
        await movil.getByText("Lentejas de la abuela").first().waitFor();
        await movil.waitForTimeout(800);
        await captura(movil, `movil_notas_por_etiqueta_${tema}`);
      }
    }
    console.log("OK — Apariencia y diseño, color de página, Notas con etiquetas, barrita de color, Ctrl+K con notas y Copia en el NAS");
  } finally {
    await browser.close();
    sso.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
