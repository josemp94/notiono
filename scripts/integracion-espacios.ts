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
import { canjeaInvitaciones, MAX_ESPACIOS } from "@/server/services/espacios";
import { GET as listaBasesApi } from "@/app/api/v1/databases/route";

/** Una llamada de la API REST v1 con ese token (lista de bases de datos). */
const fetchApi = (token: string) =>
  listaBasesApi(new Request("http://prueba/api/v1/databases", { headers: { authorization: `Bearer ${token}` } }));

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

  // --- Invitación a quien aún no ha entrado nunca (por usuario del NAS) ---
  const usuario = `abuela${sufijo}`;
  assert.deepEqual(await g2.c.workspace.share({ email: usuario.toUpperCase(), role: "viewer" }), { pendiente: true });
  await falla(g2.c.workspace.share({ email: "no vale con espacios" }), "BAD_REQUEST", "ni email ni usuario");
  await falla(r.c.workspace.share({ email: "x@y.es" }), "FORBIDDEN", "solo el propietario invita");
  const conInv = await g2.c.workspace.members();
  assert.deepEqual(conInv.invitaciones.map((i) => [i.destino, i.role]), [[usuario, "viewer"]]);
  assert.deepEqual((await r.c.workspace.members()).invitaciones, [], "una miembro no ve las pendientes");
  assert.deepEqual(conInv.members.map((m) => m.role), ["owner", "editor"], "el propietario, primero");
  // Su primer login por SSO (sin email del NAS: <usuario>@sso.local).
  const abuelaUser = await db.user.create({ data: { email: `${usuario}@sso.local`, name: "Abuela" } });
  await ensureWorkspace(db, abuelaUser);
  await canjeaInvitaciones(db, abuelaUser, usuario);
  const abuela = { user: abuelaUser, token: await createSession(abuelaUser.id) };
  const a = await como(abuela, casa.id);
  assert.equal(a.ctx.role, "viewer", "entra con el rol de la invitación");
  assert.deepEqual((await g2.c.workspace.members()).invitaciones, [], "la invitación se gasta");
  const avisos = await a.c.notifications.list();
  assert.equal(avisos[0]?.type, "space", "le llega el aviso de que la han añadido");
  assert.equal(avisos[0]?.title, "Casa");
  // Anular una pendiente.
  await g2.c.workspace.share({ email: `nadie-${sufijo}@prueba.local` });
  const inv = (await g2.c.workspace.members()).invitaciones[0];
  await g2.c.workspace.cancelInvite({ id: inv.id });
  assert.equal((await g2.c.workspace.members()).invitaciones.length, 0);

  // --- Página de otro espacio: dePagina dice adónde pasar, si la puedes ver ---
  const enCasa = (await g2.c.pages.tree())[0];
  assert.deepEqual(await (await como(rocio)).c.workspace.dePagina({ pageId: enCasa.id }), { workspaceId: casa.id });
  const ajena = await persona("Ajena");
  otroAjeno = ajena.propio.id;
  assert.equal(await (await como(ajena)).c.workspace.dePagina({ pageId: enCasa.id }), null, "ajena: ni sabe que existe");
  assert.equal(await g2.c.workspace.dePagina({ pageId: enCasa.id }), null, "ya estás en su espacio");

  // --- Salir de un espacio compartido: cae en el suyo y sus tokens dejan de valer ---
  const { token: tokenRocio } = await r.c.apiTokens.create({ name: "prueba" });
  const api = () => fetchApi(tokenRocio);
  assert.equal((await api()).ok, true, "el token vale mientras es miembro");
  await falla(g2.c.workspace.leave({ workspaceId: casa.id }), "BAD_REQUEST", "el propietario no sale");
  const salida = await r.c.workspace.leave({ workspaceId: casa.id });
  assert.equal(salida.workspaceId, rocio.propio.id, "pasa a su espacio");
  assert.ok(r.cookieNueva().includes(`notiono_ws=${rocio.propio.id}`));
  assert.equal((await como(rocio, casa.id)).ctx.workspace?.id, rocio.propio.id, "la cookie vieja ya no entra");
  assert.equal(await db.apiToken.count({ where: { workspaceId: casa.id, createdById: rocio.user.id } }), 0, "fuera sus tokens");
  assert.equal((await api()).ok, false, "y el token ya no vale");
  await falla((await como(rocio)).c.workspace.leave({ workspaceId: rocio.propio.id }), "BAD_REQUEST", "ni del suyo");

  // --- Traspasar la propiedad ---
  await g2.c.workspace.share({ email: rocio.user.email });
  await falla(r.c.workspace.transfer({ userId: rocio.user.id }), "FORBIDDEN", "solo el propietario traspasa");
  await falla(g2.c.workspace.transfer({ userId: ajena.user.id }), "BAD_REQUEST", "solo a un miembro");
  await g2.c.workspace.transfer({ userId: rocio.user.id });
  assert.equal((await como(rocio, casa.id)).ctx.role, "owner");
  assert.equal((await como(gio, casa.id)).ctx.role, "editor", "Gio queda como miembro");
  await (await como(rocio, casa.id)).c.workspace.transfer({ userId: gio.user.id });

  // --- Eliminar el espacio ---
  const g3 = await como(gio, casa.id);
  await falla(g3.c.workspace.delete({ confirmacion: "casa" }), "BAD_REQUEST", "hay que escribir el nombre exacto");
  await falla((await como(rocio, casa.id)).c.workspace.delete({ confirmacion: "Casa" }), "FORBIDDEN", "una miembro no borra");
  const asset = await db.asset.create({ data: { workspaceId: casa.id, mime: "image/png", bytes: Buffer.from("x") } });
  const compartido = await db.asset.create({ data: { workspaceId: casa.id, mime: "image/png", bytes: Buffer.from("y") } });
  await db.page.update({ where: { id: (await (await como(gio)).c.pages.tree())[0].id }, data: { cover: `url:/api/asset/${compartido.id}` } });
  const fin = await g3.c.workspace.delete({ confirmacion: " Casa " });
  assert.equal(fin.workspaceId, gio.propio.id);
  assert.equal(await db.workspace.count({ where: { id: casa.id } }), 0);
  assert.equal(await db.page.count({ where: { workspaceId: casa.id } }), 0, "sus páginas, fuera");
  assert.equal(await db.asset.count({ where: { id: asset.id } }), 0, "sus archivos, fuera");
  assert.equal(await db.asset.count({ where: { id: compartido.id } }), 1, "menos los que usa otro espacio");
  assert.equal((await como(rocio, casa.id)).ctx.workspace?.id, rocio.propio.id, "los demás caen en otro sin error");
  await falla((await como(gio)).c.workspace.delete({ confirmacion: gio.propio.name }), "BAD_REQUEST", "nunca el último propio");

  // --- «Mover a» otro espacio = duplicar allí (como Notion) ---
  await duplicarEnOtroEspacio();

  // --- Tope de espacios propios ---
  for (let i = await db.workspace.count({ where: { ownerId: ajena.user.id } }); i < MAX_ESPACIOS; i++) {
    await (await como(ajena)).c.workspace.create({ name: `E${i}` });
  }
  await falla((await como(ajena)).c.workspace.create({ name: "Uno más" }), "BAD_REQUEST", "tope de espacios");

  console.log("integracion-espacios: todo bien");
}

async function duplicarEnOtroEspacio() {
  const ana = await persona("Ana");
  const luis = await persona("Luis");
  const origen = await (await como(ana)).c.workspace.create({ name: "Trabajo" });
  const destino = await (await como(ana)).c.workspace.create({ name: "Casa" });
  const o = (await como(ana, origen.id)).c;
  await o.workspace.share({ email: luis.user.email, role: "editor" });
  // Viaje → [base embebida con relación a «Fuera», y una relación interna], Hija, Secreta (restringida).
  const viaje = await o.pages.create({ title: "Viaje", enlazar: false });
  const hija = await o.pages.create({ title: "Hija", parentId: viaje.id });
  const secreta = await o.pages.create({ title: "Secreta", parentId: viaje.id });
  const fuera = await o.db.create({ title: "Fuera" });
  const fueraCol = (await o.db.get({ pageId: fuera.id })).id;
  const emb = await o.db.createInline();
  await o.db.addRelation({ collectionId: emb.collectionId, name: "A fuera", targetCollectionId: fueraCol, mirror: true });
  await o.db.addRelation({ collectionId: emb.collectionId, name: "A sí misma", targetCollectionId: emb.collectionId });
  await o.pages.updateContent({
    id: viaje.id,
    content: [
      { id: "b1", type: "paragraph", content: "Plan" },
      { id: "b2", type: "database", props: { collectionId: emb.collectionId, pageId: emb.pageId, viewId: "" }, children: [] },
    ],
  });

  // Luis (miembro de los dos) no ve la Secreta: no viaja.
  await o.pages.perms.setRestricted({ pageId: secreta.id, restricted: true });
  await o.pages.perms.remove({ pageId: secreta.id, userId: luis.user.id });
  const d = (await como(ana, destino.id)).c;
  await d.workspace.share({ email: luis.user.email, role: "editor" });
  const l = (await como(luis, origen.id)).c;
  await falla(l.pages.copiarAEspacio({ id: viaje.id, workspaceId: ajenoDe(ana), parentId: null }), "FORBIDDEN", "solo a espacios donde puedes crear");
  const { id } = await l.pages.copiarAEspacio({ id: viaje.id, workspaceId: destino.id, parentId: null });

  const copia = await db.page.findUniqueOrThrow({ where: { id } });
  assert.equal(copia.workspaceId, destino.id);
  assert.equal(copia.title, "Viaje", "sin «(copia)», como Notion");
  assert.ok(await db.page.findUnique({ where: { id: viaje.id } }), "el original se queda");
  const hijas = await db.page.findMany({ where: { parentId: id }, select: { title: true } });
  assert.deepEqual(hijas.map((h) => h.title), ["Hija"], "lo que no ves no viaja");
  assert.ok(hija.id);
  const bloque = (copia.content as { type: string; props?: { collectionId: string; pageId: string } }[]).find((b) => b.type === "database")!;
  assert.notEqual(bloque.props!.pageId, emb.pageId, "la base embebida también se copia");
  const embCopia = await db.page.findUniqueOrThrow({ where: { id: bloque.props!.pageId }, include: { collection: { include: { fields: true, records: true } } } });
  assert.equal(embCopia.workspaceId, destino.id);
  assert.equal(embCopia.embedded, true);
  assert.equal(embCopia.collection!.id, bloque.props!.collectionId);
  const tipos = embCopia.collection!.fields.map((f) => [f.name, f.type, (f.config as { targetCollectionId?: string }).targetCollectionId]);
  assert.ok(!tipos.some(([n]) => n === "A fuera"), "fuera la relación a una base que no viaja");
  assert.ok(tipos.some(([n, t, tc]) => n === "A sí misma" && t === "relation" && tc === embCopia.collection!.id), "la interna apunta a la copia");
  assert.equal(embCopia.collection!.records.length, 3);
  // La copia la ven los del destino y el árbol del destino la enseña en la raíz.
  assert.ok((await d.pages.tree()).some((p) => p.id === id));
  // Dentro de una página del destino, con su enlace en la madre.
  const madre = (await d.pages.tree())[0];
  const { id: id2 } = await l.pages.copiarAEspacio({ id: hija.id, workspaceId: destino.id, parentId: madre.id });
  assert.equal((await db.page.findUniqueOrThrow({ where: { id: id2 } })).parentId, madre.id);
  // Un lector del destino no puede dejar nada allí.
  await d.workspace.setRole({ userId: luis.user.id, role: "viewer" });
  await falla(l.pages.copiarAEspacio({ id: hija.id, workspaceId: destino.id, parentId: null }), "FORBIDDEN", "un lector no crea");
  assert.deepEqual(await l.pages.arbolDe({ workspaceId: destino.id }), []);

  // Duplicar en el mismo espacio mantiene la restricción y sus permisos (antes se perdían).
  await o.pages.perms.set({ pageId: secreta.id, userId: luis.user.id, level: "view" });
  const dup = await o.pages.duplicate({ id: secreta.id });
  const pd = await db.page.findUniqueOrThrow({ where: { id: dup.id }, include: { permissions: true } });
  assert.equal(pd.restricted, true);
  assert.deepEqual(pd.permissions.map((x) => [x.userId, x.level]), [[luis.user.id, "view"]]);
}

/** Un espacio de otra persona en el que esta no está. */
let otroAjeno = "";
const ajenoDe = (_p: unknown) => otroAjeno;

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
