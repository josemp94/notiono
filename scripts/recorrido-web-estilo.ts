/**
 * Recorrido de la web «como Notion» (encargo NOTION-ESTILO, 2.5.1) contra un Notiono de
 * verdad en local, con un navegador: lo que Notion tiene se ve y se comporta como en Notion
 * y lo que no tiene queda integrado. Se pone ROJO si algo de esto vuelve atrás:
 *
 * - Lista: la casilla va a la derecha con las demás propiedades, se marca sin abrir la
 *   ficha y no tacha el título; la «Lista de tareas» del editor sí se tacha y en gris.
 * - Menú ⋯ de la página: sin «Recordarme…», con «Exportar» (diálogo «Formato de
 *   exportación» con PDF, HTML, Markdown y CSV, y Word) y el pie de Notion.
 * - «@recordar mañana» pone una mención de fecha con aviso a su hora, de quien la pone.
 * - Menú «/»: «Dibujo» en «Medios» y sin rótulos de grupo repetidos.
 * - Inicio: el saludo sin fecha ni buscador y «Visitado recientemente».
 *
 *   # Notiono en local (server.mjs + PGlite, ver scripts/integracion-app.ts) con el SSO
 *   # falso en el 55433 (este script lo levanta) y Playwright fuera del repo:
 *   PLAYWRIGHT_DIR=~/.cache/notiono-pglite BASE_URL=http://127.0.0.1:3100 npx tsx scripts/recorrido-web-estilo.ts
 *   (CHROMIUM=/ruta/a/chrome si el navegador de esa versión de Playwright no está descargado)
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ssoFalso } from "./sso-falso";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? ".", "x.js"));
// Playwright vive fuera del repo (PLAYWRIGHT_DIR): sin sus tipos aquí.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium }: { chromium: any } = require("playwright");

async function main() {
  const pasada = Date.now();
  const sso = await ssoFalso({ sub: `estilo-${pasada}`, email: `estilo.${pasada}@example.com`, name: "Marta Estilo" });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
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
    const me = await llama("auth.me");

    // ---------- Lista: la casilla, una propiedad más ----------
    const bd = (await llama("pages.createFromTemplate", { key: "tareas" }, true)).id as string;
    const db = await llama("db.get", { pageId: bd });
    const casilla = await llama("db.addField", { collectionId: db.id, name: "Hecha", type: "checkbox" }, true);
    const lista = await llama("db.addView", { collectionId: db.id, name: "Lista", type: "list" }, true);
    const fila = db.records[0];
    const titulo = String(fila.cells[db.fields.find((f: { type: string }) => f.type === "text").id]);
    await page.goto(`${BASE}/p/${bd}?v=${lista.id}`);
    const li = page.locator("li", { hasText: titulo }).first();
    await li.waitFor();
    const caja = li.getByRole("checkbox", { name: "Hecha" });
    const [bt, bc] = [await li.getByText(titulo).boundingBox(), await caja.boundingBox()];
    assert.ok(bt && bc && bc.x > bt.x + bt.width, "la casilla va a la derecha del título, con las demás propiedades");
    await caja.click();
    await page.waitForTimeout(1500);
    assert.equal((await llama("db.get", { pageId: bd })).records.find((r: { id: string }) => r.id === fila.id).cells[casilla.id], true, "se marca ahí mismo");
    assert.equal(await page.locator("[role=dialog], aside").filter({ hasText: titulo }).count(), 0, "sin abrir la ficha");
    const deco = await li.getByText(titulo).evaluate((e: Element) => getComputedStyle(e).textDecorationLine);
    assert.equal(deco, "none", "el título de una fila hecha no se tacha");

    // ---------- Página: Lista de tareas tachada y en gris, menú ⋯, Exportar y el pie ----------
    const pg = (await llama("pages.create", { title: "Recorrido estilo" }, true)).id as string;
    await llama("pages.updateContent", { id: pg, content: [
      { id: "c1", type: "checkListItem", props: { checked: true }, content: [{ type: "text", text: "Leche", styles: {} }], children: [] },
      { id: "c2", type: "checkListItem", props: { checked: false }, content: [{ type: "text", text: "Pan", styles: {} }], children: [] },
      { id: "p1", type: "paragraph", content: [{ type: "text", text: "Llamar a Ana", styles: {} }], children: [] },
    ] }, true);
    await page.goto(`${BASE}/p/${pg}`);
    const leche = page.locator("[data-content-type=checkListItem][data-checked=true] .bn-inline-content").first();
    await leche.waitFor();
    const [colorLeche, colorPan, tachado] = await Promise.all([
      leche.evaluate((e: Element) => getComputedStyle(e).color),
      page.locator("[data-content-type=checkListItem]:not([data-checked=true]) .bn-inline-content").first().evaluate((e: Element) => getComputedStyle(e).color),
      leche.evaluate((e: Element) => getComputedStyle(e).textDecorationLine),
    ]);
    assert.equal(tachado, "line-through", "la Lista de tareas hecha se tacha");
    assert.notEqual(colorLeche, colorPan, "…y se pone en gris");

    await page.getByTitle("Opciones de página").click();
    const menu = page.locator("[data-menu]").first();
    await menu.getByText("Recuento de palabras: 5").waitFor();
    assert.equal(await menu.getByText("Recordarme").count(), 0, "Notion no tiene «Recordarme…» en el ⋯");
    assert.ok(await menu.getByText(/^Última edición/).count(), "el pie dice «Última edición…»");
    assert.equal(await menu.getByText(/^Exportar (a Word|Markdown|HTML)/).count(), 0, "nada de entradas sueltas de exportar");
    await menu.getByRole("button", { name: "Exportar", exact: true }).click();
    const formato = page.getByLabel("Formato de exportación");
    assert.deepEqual(await formato.locator("option").allTextContents(), ["PDF", "HTML", "Markdown y CSV", "Word (.docx)"]);
    await formato.selectOption("word");
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar", exact: true }).click()]);
    assert.equal(descarga.suggestedFilename(), "Recorrido_estilo.docx");

    // ---------- «@recordar mañana»: mención de fecha con aviso ----------
    // Al final de «Llamar a Ana».
    await page.getByText("Llamar a Ana").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" @recordar mañana", { delay: 60 });
    await page.getByText(/^Recordar mañana a las/).first().click();
    await page.waitForTimeout(2000);
    const bloques = (await llama("pages.get", { id: pg })).content as { id: string; content: { type: string; props?: Record<string, string> }[] }[];
    const m = bloques.find((b) => b.id === "p1")?.content.find((c) => c.type === "dateMention")?.props;
    assert.ok(m && /T09:00$/.test(m.fecha) && m.recordatorio === "0" && m.por === me.id, JSON.stringify(bloques));

    // ---------- Menú «/»: Dibujo en «Medios», sin rótulos repetidos ----------
    await page.keyboard.type(" ");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/dib", { delay: 80 });
    await page.waitForTimeout(800);
    const rotulos = await page.locator(".bn-suggestion-menu-label").allTextContents();
    assert.deepEqual(rotulos, ["Medios"], `rótulos del menú: ${rotulos}`);
    assert.ok(await page.locator(".bn-suggestion-menu-item", { hasText: "Dibujo" }).count());
    await page.keyboard.press("Escape");

    // ---------- Inicio: como el Home de Notion ----------
    await page.goto(`${BASE}/`);
    await page.getByRole("heading", { level: 1, name: /, Marta$/ }).waitFor();
    assert.equal(await page.getByText("Buscar en Notiono").count(), 0, "el Home de Notion no lleva buscador");
    assert.ok(await page.getByText("Visitado recientemente").count(), "«Visitado recientemente»");
    console.log("OK — Lista con casilla, Lista de tareas, ⋯ y Exportar, @recordar, menú «/» e Inicio como Notion");
  } finally {
    await browser.close();
    sso.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
