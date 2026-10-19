/**
 * Matriz de Eisenhower de punta a punta, contra una instalación de verdad con una
 * sesión ya creada (como scripts/integracion-subpaginas.ts):
 *
 *   BASE_URL=http://127.0.0.1:3100 SESION=<token> npx tsx scripts/integracion-matriz.ts
 *
 *  - la plantilla «eisenhower» monta la BD con la vista Matriz, sus ejes y los
 *    cuadrantes rotulados (Hacer arriba a la izquierda);
 *  - la app nativa, que no conoce la vista Matriz, la recibe como tabla agrupada por
 *    los dos ejes con los rótulos (sin APK nuevo), y sigue a los cambios de celda.
 */
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SESION = process.env.SESION ?? "token-de-prueba";
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

type Grupo = { etiqueta: string; ids: string[]; subgrupos: { etiqueta: string; ids: string[] }[] | null };

async function main() {
  const { id } = await mutation("pages.createFromTemplate", { key: "eisenhower" });
  const col = await query("db.get", { pageId: id });
  const campo = (n: string) => col.fields.find((f: { name: string }) => f.name === n);
  const [urg, imp] = [campo("Urgente"), campo("Importante")];
  assert.ok(urg && imp && campo("Título") && campo("Fecha") && campo("Estado"), "Título, Urgente, Importante, Fecha y Estado");
  const vista = col.views[0];
  assert.equal(vista.type, "matrix", "la primera vista es la Matriz");
  assert.equal(vista.config.ejeX, urg.id);
  assert.equal(vista.config.ejeY, imp.id);
  assert.deepEqual(vista.config.celdas["true|true"], { rotulo: "Hacer", color: "red" });
  assert.equal(vista.config.celdas["|true"].rotulo, "Planificar");
  assert.equal(vista.config.celdas["true|"].rotulo, "Delegar");
  assert.equal(vista.config.celdas["|"].rotulo, "Eliminar");
  assert.ok(col.records.length >= 4, "con filas de ejemplo");

  // Lo que recibe la app: filas = Importante / No importante; dentro, Urgente / No urgente.
  const app = await query("app.vista", { pageId: id, viewId: vista.id });
  const grupos = app.grupos as Grupo[];
  assert.deepEqual(grupos.map((g) => g.etiqueta), ["Importante", "No importante"]);
  assert.deepEqual(grupos[0].subgrupos!.map((s) => s.etiqueta), ["Hacer · Urgente", "Planificar · No urgente"]);
  assert.deepEqual(grupos[1].subgrupos!.map((s) => s.etiqueta), ["Delegar · Urgente", "Eliminar · No urgente"]);
  const enHacer = grupos[0].subgrupos![0].ids;
  for (const rid of enHacer) {
    const r = col.records.find((x: { id: string }) => x.id === rid);
    assert.equal(r.cells[urg.id], true);
    assert.equal(r.cells[imp.id], true);
  }
  assert.equal(grupos.flatMap((g) => g.subgrupos!.flatMap((s) => s.ids)).length, app.filas.length, "ninguna fila se pierde");

  // Mover una tarea de Eliminar a Hacer (lo que hace soltarla en la web) se ve en la app.
  const deEliminar = grupos[1].subgrupos![1].ids[0];
  await mutation("db.updateCell", { recordId: deEliminar, fieldId: urg.id, value: true });
  await mutation("db.updateCell", { recordId: deEliminar, fieldId: imp.id, value: true });
  const tras = (await query("app.vista", { pageId: id, viewId: vista.id })).grupos as Grupo[];
  assert.ok(tras[0].subgrupos![0].ids.includes(deEliminar), "ahora en Hacer");
  assert.ok(!tras[1].subgrupos![1].ids.includes(deEliminar));

  // Una vista Matriz nueva elige sola sus ejes (los dos primeros campos que valen).
  const nueva = await mutation("db.addView", { collectionId: col.id, type: "matrix" });
  assert.equal(nueva.config.ejeX, urg.id);
  assert.equal(nueva.config.ejeY, imp.id);

  console.log("OK — Matriz de Eisenhower: plantilla, ejes, cuadrantes y lo que recibe la app nativa");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
