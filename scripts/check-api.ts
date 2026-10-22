/**
 * Prueba de la API REST v1 contra una instalación real.
 *
 * No entra en `npm run check` porque necesita servidor y base de datos, y aquel
 * tiene que poder correr en cualquier sitio sin nada montado. Aquí se comprueba lo
 * que de verdad se quiere garantizar: que **solo con el token** se puede montar la
 * estructura entera —base de datos, columnas, vistas y registros—, que un recurso de
 * otro espacio no existe para este token, y que sin token no se hace nada.
 *
 *   BASE_URL=https://notiono.monrealperez.com NOTIONO_TOKEN=ntn_… npm run check:api
 *
 * Deja una base de datos de prueba y dice su id al terminar: no hay endpoint para
 * borrarla, así que se borra a mano desde la papelera.
 */
import assert from "node:assert/strict";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.NOTIONO_TOKEN;
if (!TOKEN) {
  console.error("Falta NOTIONO_TOKEN (Ajustes → API → Crear token).");
  process.exit(2);
}

type Respuesta = { status: number; body: unknown };

async function api(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  opciones: { sinToken?: boolean } = {},
): Promise<Respuesta> {
  const res = await fetch(`${BASE}/api/v1${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(opciones.sinToken ? {} : { authorization: `Bearer ${TOKEN}` }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let body: unknown = texto;
  try {
    body = JSON.parse(texto);
  } catch {
    // se queda el texto crudo: si el servidor devolvió HTML, quiero verlo en el fallo
  }
  return { status: res.status, body };
}

const comoObjeto = (r: Respuesta) => r.body as Record<string, unknown>;

async function main() {
  console.log(`Probando ${BASE}/api/v1`);

  // --- Sin token no se entra ---
  const anonima = await api("POST", "/databases", { name: "x" }, { sinToken: true });
  assert.equal(anonima.status, 401, "sin token debería dar 401");

  // --- Crear la base de datos con sus columnas y sus vistas ---
  const creada = await api("POST", "/databases", {
    name: "PRUEBA API (borrar)",
    icon: "🧪",
    fields: [
      { name: "Tarea", type: "text" },
      { name: "Estado", type: "status" },
      { name: "Entrega", type: "date" },
    ],
    views: [{ type: "table" }, { type: "kanban", name: "Por estado" }],
  });
  assert.equal(creada.status, 201, `crear BD: ${JSON.stringify(creada.body)}`);
  const bd = comoObjeto(creada);
  const collectionId = bd.id as string;
  const campos = bd.fields as { id: string; name: string; type: string }[];
  const vistas = bd.views as { id: string; name: string; type: string }[];
  assert.ok(collectionId, "la respuesta debe traer el id de la base de datos");
  assert.equal(campos.length, 3, "deberían crearse las 3 columnas pedidas");
  assert.equal(vistas.length, 2, "deberían crearse las 2 vistas pedidas");
  assert.equal(vistas[1].name, "Por estado", "la vista debe respetar el nombre dado");

  // --- Añadir una columna ---
  const nueva = await api("POST", `/databases/${collectionId}/fields`, {
    name: "Prioridad",
    type: "select",
  });
  assert.equal(nueva.status, 201, `añadir columna: ${JSON.stringify(nueva.body)}`);
  const prioridadId = comoObjeto(nueva).id as string;

  // Un tipo que no existe se rechaza, no se inventa uno
  const inventado = await api("POST", `/databases/${collectionId}/fields`, {
    name: "Nope",
    type: "telepatia",
  });
  assert.equal(inventado.status, 400, "un tipo de columna inventado debería dar 400");

  // --- Renombrar y cambiar el tipo ---
  const renombrada = await api("PATCH", `/fields/${prioridadId}`, { name: "Urgencia" });
  assert.equal(renombrada.status, 200, `renombrar: ${JSON.stringify(renombrada.body)}`);
  assert.equal(comoObjeto(renombrada).name, "Urgencia");

  const convertida = await api("PATCH", `/fields/${prioridadId}`, { type: "text" });
  assert.equal(convertida.status, 200, `cambiar tipo: ${JSON.stringify(convertida.body)}`);
  assert.equal(comoObjeto(convertida).type, "text");

  // --- Añadir una vista ---
  const vista = await api("POST", `/databases/${collectionId}/views`, { type: "calendar" });
  assert.equal(vista.status, 201, `añadir vista: ${JSON.stringify(vista.body)}`);
  assert.equal(comoObjeto(vista).name, "Calendario", "sin nombre, el del tipo");

  // --- Crear un registro y volver a leerlo ---
  const registro = await api("POST", `/databases/${collectionId}/records`, {
    cells: { [campos[0].id]: "Escrito por la API" },
  });
  assert.equal(registro.status, 201, `crear registro: ${JSON.stringify(registro.body)}`);
  const recordId = comoObjeto(registro).id as string;

  const leida = await api("GET", `/databases/${collectionId}`);
  assert.equal(leida.status, 200);
  const contenido = JSON.stringify(leida.body);
  assert.ok(contenido.includes(recordId), "el registro recién creado debe salir al leer la BD");
  assert.ok(contenido.includes("Escrito por la API"), "y con su valor dentro");

  // --- Listado paginado por cursor ---
  await api("POST", `/databases/${collectionId}/records`, { cells: { [campos[0].id]: "Segunda" } });
  await api("POST", `/databases/${collectionId}/records`, { cells: { [campos[0].id]: "Tercera" } });
  const pagina1 = await api("GET", `/databases/${collectionId}/records?limit=2`);
  assert.equal(pagina1.status, 200, `listar registros: ${JSON.stringify(pagina1.body)}`);
  const p1 = comoObjeto(pagina1);
  assert.equal((p1.records as unknown[]).length, 2, "limit=2 debe traer 2 registros");
  assert.equal(p1.has_more, true, "con 3 registros y limit=2 debe quedar página siguiente");
  assert.ok(p1.next_cursor, "y traer el cursor de la siguiente");
  const pagina2 = await api("GET", `/databases/${collectionId}/records?limit=2&cursor=${p1.next_cursor}`);
  const p2 = comoObjeto(pagina2);
  assert.equal((p2.records as unknown[]).length, 1, "la segunda página debe traer el registro restante");
  assert.equal(p2.has_more, false, "y ser la última");
  const ids1 = (p1.records as { id: string }[]).map((r) => r.id);
  const ids2 = (p2.records as { id: string }[]).map((r) => r.id);
  assert.ok(!ids1.some((id) => ids2.includes(id)), "las páginas no deben solaparse");

  // --- Consulta con filtros y orden (el mismo motor que las vistas) ---
  const filtrada = await api("POST", `/databases/${collectionId}/query`, {
    filters: [{ fieldId: campos[0].id, op: "contains", value: "era" }],
    sorts: [{ fieldId: campos[0].id, dir: "asc" }],
  });
  assert.equal(filtrada.status, 200, `query: ${JSON.stringify(filtrada.body)}`);
  const q = comoObjeto(filtrada);
  assert.equal((q.records as unknown[]).length, 1, "el filtro contains debe dejar solo «Tercera»");
  assert.equal(q.total, 1, "y total debe decir lo mismo");
  const ordenada = await api("POST", `/databases/${collectionId}/query`, {
    sorts: [{ fieldId: campos[0].id, dir: "desc" }],
  });
  const titulos = (comoObjeto(ordenada).records as { cells: Record<string, string> }[]).map(
    (r) => r.cells[campos[0].id],
  );
  assert.deepEqual(titulos, ["Tercera", "Segunda", "Escrito por la API"], "orden desc por título");

  // --- Lo que no es del token, no existe ---
  const ajena = await api("PATCH", "/fields/cmt0000000000000000000000", { name: "x" });
  assert.equal(ajena.status, 404, "una columna de otro espacio debería dar 404");
  const bdAjena = await api("POST", "/databases/cmt0000000000000000000000/fields", {
    name: "x",
    type: "text",
  });
  assert.equal(bdAjena.status, 404, "una BD de otro espacio debería dar 404");

  // --- Subir un archivo con el token y volver a descargarlo ---
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const subir = async (tipo: string, nombre: string, conToken = true) => {
    const fd = new FormData();
    fd.append("file", new Blob([Uint8Array.from(png)], { type: tipo }), nombre);
    const res = await fetch(`${BASE}/api/v1/files?kind=image`, {
      method: "POST",
      headers: conToken ? { authorization: `Bearer ${TOKEN}` } : {},
      body: fd,
    });
    return { status: res.status, body: (await res.json()) as Record<string, string> };
  };
  assert.equal((await subir("image/png", "a.png", false)).status, 401, "subir sin token debería dar 401");
  assert.equal((await subir("text/plain", "a.txt")).status, 400, "kind=image debería rechazar un texto");
  const subido = await subir("image/png", "prueba-api.png");
  assert.equal(subido.status, 201, `subir archivo: ${JSON.stringify(subido.body)}`);
  assert.equal(subido.body.url, `/api/asset/${subido.body.id}`);
  const bajado = await fetch(`${BASE}${subido.body.url}`);
  assert.equal(bajado.headers.get("content-type"), "image/png");
  assert.ok(Buffer.from(await bajado.arrayBuffer()).equals(png), "el archivo bajado no es el subido");

  // --- Borrar la columna ---
  const borrada = await api("DELETE", `/fields/${prioridadId}`);
  assert.equal(borrada.status, 200, `borrar columna: ${JSON.stringify(borrada.body)}`);

  console.log("OK — crear BD, columnas, vistas, registros y subir archivos solo con el token");
  console.log(`   Queda para borrar a mano: «PRUEBA API (borrar)» (página ${bd.pageId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
