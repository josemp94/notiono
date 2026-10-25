/**
 * Espacios y compartir de punta a punta contra una base de datos de verdad (sin
 * servidor: llama a los routers con createCaller y la cookie de cada persona):
 *
 *   DATABASE_URL=… npx tsx scripts/integracion-espacios.ts
 *
 * Siembra dos personas nuevas en cada vuelta (Gio y Rocío, con sufijo al azar), así
 * que se puede repetir sobre la misma base. Ver «Espacios y compartir» en
 * docs/ESTUDIO-2026-10.md.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appRouter } from "@/server/root";
import { createContext } from "@/server/context";
import { createSession } from "@/server/auth";
import { ensureWorkspace } from "@/server/provision";

const sufijo = randomBytes(3).toString("hex");

async function persona(nombre: string) {
  const user = await db.user.create({ data: { email: `${nombre.toLowerCase()}-${sufijo}@prueba.local`, name: nombre } });
  const propio = await ensureWorkspace(db, user);
  return { user, propio, token: await createSession(user.id) };
}

/** Un «navegador» de esa persona con el espacio activo `ws` (la cookie notiono_ws). */
async function como(p: { token: string }, ws?: string) {
  const cookie = `notiono_session=${p.token}${ws ? `; notiono_ws=${ws}` : ""}`;
  const resHeaders = new Headers();
  const ctx = await createContext({ req: new Request("http://prueba/", { headers: { cookie } }), resHeaders });
  return { c: appRouter.createCaller(ctx), ctx, cookieNueva: () => resHeaders.get("set-cookie") ?? "" };
}

async function falla(p: Promise<unknown>, codigo: string, que: string) {
  await assert.rejects(p, (e: { code?: string }) => e.code === codigo, que);
}

async function main() {
  const gio = await persona("Gio");
  const rocio = await persona("Rocio");

  // --- Nuevo espacio ---
  const g = await como(gio);
  assert.equal(g.ctx.workspace?.id, gio.propio.id, "sin cookie, el espacio propio");
  await falla(g.c.workspace.create({ name: "   " }), "BAD_REQUEST", "nombre vacío no vale");
  const casa = await g.c.workspace.create({ name: "  Casa   de  Gio ", icon: "🏠" });
  const g2 = await como(gio, casa.id);
  assert.ok(g.cookieNueva().includes(`notiono_ws=${casa.id}`), "crear fija el espacio activo");
  assert.equal(g2.ctx.workspace?.name, "Casa de Gio", "nombre recortado");
  assert.equal(g2.ctx.role, "owner");
  const paginas = await g2.c.pages.tree();
  assert.deepEqual(paginas.map((p) => p.title), ["Primeros pasos"], "con su página de bienvenida");
  const lista = await g2.c.workspace.list();
  assert.equal(lista.length, 2);
  assert.equal(lista.find((w) => w.id === casa.id)?.icon, "🏠");

  // --- Renombrar y cambiar el icono (solo el dueño) ---
  await g2.c.workspace.update({ name: "Casa", icon: "icono:house:orange" });
  assert.equal((await como(gio, casa.id)).ctx.workspace?.name, "Casa");
  await g2.c.workspace.share({ email: rocio.user.email, role: "editor" });
  const r = await como(rocio, casa.id);
  assert.equal(r.ctx.role, "editor");
  await falla(r.c.workspace.update({ name: "Mía" }), "FORBIDDEN", "una editora no renombra");
  assert.equal((await r.c.workspace.list()).find((w) => w.id === casa.id)?.compartido, true, "compartido con Rocío");

  console.log("integracion-espacios: todo bien");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
