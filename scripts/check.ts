/**
 * Comprobación mínima de la lógica de vistas (filtros y orden).
 * Ejecutar: npm run check
 */
import assert from "node:assert/strict";
import { applyViewConfig, colorByRules, conComputados, matchesFilters, openInOf, opsFor, relativeRange, wrapOf, type DbField, type DbRecord } from "../src/lib/viewData";
import { dateValue, dayOf, displayValue, endDayOf, formatDate, formatNumber, frozenOffsets, FROZEN_WIDTH, GUTTER_WIDTH, groupBy, rowColor } from "../src/lib/cellText";
import { embedUrl } from "../src/lib/embed";
import { computeCalc } from "../src/lib/calc";
import { markdownABloques } from "../src/lib/mdBloques";

const f = (id: string, type: string, config: unknown = {}): DbField => ({ id, name: id, type, config });
const r = (id: string, cells: Record<string, unknown>): DbRecord => ({ id, cells, order: id });

const fields: DbField[] = [
  f("people", "person"),
  f("tags", "multiselect"),
  f("docs", "files"),
  f("estado", "status", { options: [{ id: "todo", label: "Por hacer" }, { id: "done", label: "Hecho" }] }),
];

const records: DbRecord[] = [
  r("a", { people: ["u1", "u2"], tags: ["t1"], docs: [{ id: "as1", name: "factura.pdf" }], estado: "done" }),
  r("b", { people: ["u2"], tags: ["t1", "t2"], docs: [], estado: "todo" }),
  r("c", { people: [], tags: [], docs: [{ id: "as2", name: "contrato.docx" }], estado: "todo" }),
];

const ids = (rs: DbRecord[]) => rs.map((x) => x.id).join(",");
const filter = (fieldId: string, op: string, value: unknown) =>
  ids(applyViewConfig(records, fields, { filters: [{ fieldId, op, value }] }));

// Persona: "es" busca dentro de la lista de asignados, no compara la lista entera.
assert.equal(filter("people", "is", "u2"), "a,b");
assert.equal(filter("people", "isnot", "u1"), "b,c");

// Selección múltiple: mismo comportamiento (no debe romperse al generalizar).
assert.equal(filter("tags", "is", "t2"), "b");

// Adjuntos: "contiene" mira el nombre del fichero, no "[object Object]".
assert.equal(filter("docs", "contains", "factura"), "a");
assert.equal(filter("docs", "contains", "pdf"), "a");

// Envolver texto: manda la columna (wrapCols) y, si no dice nada, la vista (wrapText).
assert.equal(wrapOf({ wrapText: true }, "x"), true);
assert.equal(wrapOf({ wrapText: true, wrapCols: { x: false } }, "x"), false);
assert.equal(wrapOf({ wrapCols: { x: true } }, "x"), true);
assert.equal(wrapOf({}, "x"), false);
assert.equal(wrapOf(undefined, "x"), false);
// …y sin ninguno de los dos, el default del llamante (el título de la Tabla lo pone a true).
assert.equal(wrapOf({}, "x", true), true);
assert.equal(wrapOf({ wrapText: false }, "x", true), false);
assert.equal(wrapOf({ wrapCols: { x: false } }, "x", true), false);

// Filtrar y ordenar por fórmula/rollup: los computados se funden en las celdas
// (conComputados) y pasan por el MISMO motor que el resto de campos.
const cfields: DbField[] = [f("nombre", "text"), f("total", "formula")];
const crecs: DbRecord[] = [r("c1", { nombre: "a" }), r("c2", { nombre: "b" }), r("c3", { nombre: "c" })];
const fusionados = conComputados(crecs, { c1: { total: 10 }, c2: { total: 9 }, c3: { total: "" } });
assert.equal(ids(applyViewConfig(fusionados, cfields, { filters: [{ fieldId: "total", op: "gte", value: 10 }] })), "c1");
assert.equal(ids(applyViewConfig(fusionados, cfields, { filters: [{ fieldId: "total", op: "is_empty", value: null }] })), "c3");
// El orden numérico manda cuando la celda trae números (10 después de 9, no "10" < "9").
const numericos = conComputados(crecs, { c1: { total: 10 }, c2: { total: 9 }, c3: { total: 100 } });
assert.equal(ids(applyViewConfig(numericos, cfields, { sorts: [{ fieldId: "total", dir: "asc" }] })), "c2,c1,c3");
// Sin computados, los registros salen intactos (misma referencia, cero coste).
assert.equal(conComputados(crecs, undefined), crecs);
// Fórmula y rollup tienen operadores propios (texto + número + vacío).
assert.ok(opsFor("formula").some((o) => o.value === "gte"));
assert.ok(opsFor("rollup").some((o) => o.value === "contains"));

// Diff del historial: aplanar bloques a líneas y LCS por líneas.
import { diffLineas, lineasDe } from "../src/lib/diff";
import { aplanarParaExport } from "../src/lib/exportBloques";
{
  const bloques = [
    { type: "paragraph", content: [{ text: "Hola" }] },
    { type: "heading", content: [{ text: "Título" }], children: [{ type: "paragraph", content: [{ text: "hijo" }] }] },
    { type: "image", content: [] },
  ];
  assert.deepEqual(lineasDe(bloques), ["Hola", "Título", "  hijo", "[image]"]);
  const d = diffLineas(["a", "b", "c"], ["a", "c", "d"]);
  assert.deepEqual(d.map((l) => l.tipo + ":" + l.texto), ["igual:a", "menos:b", "igual:c", "mas:d"]);
}

// Cómo se abren las fichas: config válida, o los defaults de Notion por tipo de vista.
assert.equal(openInOf("table", {}), "side");
assert.equal(openInOf("gallery", {}), "center");
assert.equal(openInOf("calendar", undefined), "center");
assert.equal(openInOf("kanban", {}), "side");
assert.equal(openInOf("table", { openIn: "full" }), "full");
assert.equal(openInOf("gallery", { openIn: "side" }), "side");
assert.equal(openInOf("table", { openIn: "loquesea" }), "side");

// Estado: ordena por el orden de sus opciones (Por hacer antes que Hecho), no alfabéticamente.
assert.equal(
  ids(applyViewConfig(records, fields, { sorts: [{ fieldId: "estado", dir: "asc" }] })),
  "b,c,a",
);

// Operadores por tipo, como Notion: Estado "es/no es"; Persona "contiene/no contiene";
// la casilla no tiene "vacío" y Archivos SOLO tiene vacío/no vacío.
assert.deepEqual(opsFor("status").map((o) => o.value).slice(0, 2), ["is", "is_not"]);
assert.ok(!opsFor("status").some((o) => o.value === "contains"));
assert.deepEqual(opsFor("person").map((o) => o.value).slice(0, 2), ["contains", "not_contains"]);
assert.deepEqual(opsFor("files").map((o) => o.value), ["is_empty", "not_empty"]);
assert.deepEqual(opsFor("checkbox").map((o) => o.value), ["is", "is_not"]);
// Todo tipo con vacío posible puede filtrarse por vacío / no vacío.
for (const type of ["text", "number", "date", "person", "status", "files", "relation", "url"]) {
  assert.ok(opsFor(type).some((o) => o.value === "is_empty"), type);
}

// --- Operadores sin valor: vacío / no vacío y fechas relativas ---
const hoy = relativeRange("today")![0];
const dfields: DbField[] = [f("nota", "text"), f("cuando", "date")];
const drecords: DbRecord[] = [
  r("x", { nota: "algo", cuando: hoy }),
  r("y", { nota: "", cuando: "1999-01-01" }),
  r("z", {}),
];
const dfilter = (fieldId: string, op: string) =>
  ids(applyViewConfig(drecords, dfields, { filters: [{ fieldId, op, value: null }] }));

// Sin estas dos, evalNode descartaría el filtro por no tener valor y no filtraría nada.
assert.equal(dfilter("nota", "is_empty"), "y,z");
assert.equal(dfilter("nota", "not_empty"), "x");
assert.equal(dfilter("cuando", "today"), "x");

// La semana va de lunes a domingo y contiene el día de hoy.
const [lunes, domingo] = relativeRange("this_week")!;
assert.ok(lunes <= hoy && hoy <= domingo);
assert.equal(new Date(lunes + "T00:00:00").getDay(), 1);
assert.equal(new Date(domingo + "T00:00:00").getDay(), 0);

// Rango de mes: primer y último día reales (incluye meses de 28/30/31).
assert.deepEqual(relativeRange("this_month", new Date(2026, 1, 15)), ["2026-02-01", "2026-02-28"]);
assert.deepEqual(relativeRange("last_7_days", new Date(2026, 0, 3)), ["2025-12-28", "2026-01-03"]);

// --- Matriz completa de fechas relativas (Notion: pasado/este/próximo × semana/mes/año) ---
assert.deepEqual(relativeRange("past_month", new Date(2026, 0, 15)), ["2025-12-01", "2025-12-31"]);
assert.deepEqual(relativeRange("next_month", new Date(2026, 0, 15)), ["2026-02-01", "2026-02-28"]);
assert.deepEqual(relativeRange("this_year", new Date(2026, 5, 1)), ["2026-01-01", "2026-12-31"]);
assert.deepEqual(relativeRange("past_year", new Date(2026, 5, 1)), ["2025-01-01", "2025-12-31"]);
assert.deepEqual(relativeRange("next_year", new Date(2026, 5, 1)), ["2027-01-01", "2027-12-31"]);
assert.deepEqual(relativeRange("tomorrow", new Date(2026, 0, 31)), ["2026-02-01", "2026-02-01"]);
assert.deepEqual(relativeRange("yesterday", new Date(2026, 2, 1)), ["2026-02-28", "2026-02-28"]);
assert.deepEqual(relativeRange("past_week", new Date(2026, 0, 10)), ["2026-01-03", "2026-01-10"]);
assert.deepEqual(relativeRange("next_week", new Date(2026, 0, 10)), ["2026-01-10", "2026-01-17"]);

// --- Operadores nuevos de texto y número ---
const trecs = [r("t1", { nota: "Factura enero" }), r("t2", { nota: "presupuesto" }), r("t3", {})];
const tf = (op: string, value: unknown) =>
  ids(applyViewConfig(trecs, [f("nota", "text")], { filters: [{ fieldId: "nota", op, value }] }));
assert.equal(tf("is", "factura enero"), "t1"); // exacto, sin distinguir mayúsculas
assert.equal(tf("is_not", "factura enero"), "t2,t3");
assert.equal(tf("not_contains", "factura"), "t2,t3");
assert.equal(tf("starts_with", "fact"), "t1");
assert.equal(tf("ends_with", "puesto"), "t2");
const nrecs = [r("n1", { x: 5 }), r("n2", { x: 10 }), r("n3", {})];
const nf = (op: string, value: unknown) =>
  ids(applyViewConfig(nrecs, [f("x", "number")], { filters: [{ fieldId: "x", op, value }] }));
assert.equal(nf("gte", 10), "n2");
assert.equal(nf("lte", 5), "n1");
assert.equal(nf("neq", 5), "n2,n3"); // "≠" incluye las vacías, como en Notion

// --- Persona: "contiene / no contiene" con el valor especial "Yo" (me) ---
assert.equal(
  ids(applyViewConfig(records, fields, { filters: [{ fieldId: "people", op: "contains", value: "me" }] }, "u2")),
  "a,b",
);
assert.equal(
  ids(applyViewConfig(records, fields, { filters: [{ fieldId: "people", op: "not_contains", value: "me" }] }, "u1")),
  "b,c",
);

// --- Fecha: "en o antes/después" y anclas relativas {rel:"today"} en operadores absolutos ---
const drecs2 = [r("d1", { cuando: hoy }), r("d2", { cuando: "1999-01-01" }), r("d3", {})];
const df2 = (op: string, value: unknown) =>
  ids(applyViewConfig(drecs2, [f("cuando", "date")], { filters: [{ fieldId: "cuando", op, value }] }));
assert.equal(df2("on_or_before", { rel: "today" }), "d1,d2");
assert.equal(df2("on_or_after", { rel: "yesterday" }), "d1");
assert.equal(df2("after", { rel: "one_year_ago" }), "d1");
assert.equal(df2("on", { rel: "today" }), "d1");

// --- Estado por grupo entero (group:done) ---
const estG = f("est", "status", {
  options: [{ id: "o1", label: "Por hacer", group: "todo" }, { id: "o2", label: "Hecho", group: "done" }],
});
const grecs = [r("g1", { est: "o2" }), r("g2", { est: "o1" })];
assert.equal(ids(applyViewConfig(grecs, [estG], { filters: [{ fieldId: "est", op: "is", value: "group:done" }] })), "g1");
assert.equal(ids(applyViewConfig(grecs, [estG], { filters: [{ fieldId: "est", op: "is_not", value: "group:done" }] })), "g2");

// --- Meta-campos: Creado por / Fecha de creación no viven en cells, vienen del registro ---
const metaFields = [f("autor", "created_by"), f("alta", "created_time")];
const metaRec: DbRecord = { id: "m", cells: {}, order: "m", createdById: "u1", createdAt: "2026-08-20T10:00:00.000Z" };
assert.ok(matchesFilters(metaRec, metaFields, [{ fieldId: "autor", op: "contains", value: "me" }], "u1"));
assert.ok(!matchesFilters(metaRec, metaFields, [{ fieldId: "autor", op: "contains", value: "me" }], "u2"));
assert.ok(matchesFilters(metaRec, metaFields, [{ fieldId: "alta", op: "on", value: "2026-08-20" }]));

// --- Texto visible de las celdas ---
const gente = new Map([["u1", "Jose"], ["u2", "Ana"]]);
assert.equal(displayValue(fields[0], ["u1", "u2"], gente), "Jose, Ana");
assert.equal(displayValue(fields[3], "done"), "Hecho"); // estado -> etiqueta, no el id
assert.equal(displayValue(f("adj", "files"), [{ id: "a", url: "/x", name: "acta.pdf" }]), "acta.pdf");
// Aplanador del export: columnas en secuencia y BD embebida como enlace
{
  const doc = [
    { type: "paragraph", content: "hola" },
    {
      type: "columnList",
      children: [
        { type: "column", children: [{ type: "paragraph", content: "izquierda" }] },
        { type: "column", children: [{ type: "paragraph", content: "derecha" }] },
      ],
    },
    { type: "database", props: { pageId: "p7", collectionId: "c7" } },
  ];
  const plano = aplanarParaExport(doc) as { type: string; content?: unknown }[];
  assert.deepEqual(plano.map((b) => b.type), ["paragraph", "paragraph", "paragraph", "paragraph"]);
  assert.equal((plano[1] as { content?: string }).content, "izquierda");
  assert.equal((plano[2] as { content?: string }).content, "derecha");
  const enlace = (plano[3].content as { type: string; href: string }[])[0];
  assert.equal(enlace.type, "link");
  assert.ok(enlace.href.endsWith("/p/p7"));
}

// Lugar: nombre si lo hay; si no, las coordenadas; nunca "[object Object]"
assert.equal(displayValue(f("sitio", "location"), { nombre: "Casa", lat: 40.4, lng: -3.7 }), "Casa");
assert.equal(displayValue(f("sitio", "location"), { lat: 40.4, lng: -3.7 }), "40.4, -3.7");

// --- Agrupación de la tabla ---
const grupos = groupBy(records, fields[3], gente); // por Estado
assert.deepEqual(grupos.map((g) => g.label), ["Por hacer", "Hecho"]); // orden de las opciones, no alfabético
assert.deepEqual(grupos.map((g) => g.records.length), [2, 1]);

// Las filas sin valor van a un grupo propio, siempre el último.
const sinValor = groupBy(
  [...records, r("d", {})],
  f("estado", "status", { options: [{ id: "todo", label: "Por hacer" }, { id: "done", label: "Hecho" }] }),
  gente,
);
assert.equal(sinValor.at(-1)!.label, "Sin estado");

// --- Formatos del campo Número ---
const euros = f("precio", "number", { format: "euro" });
// En es-ES no se agrupan los miles hasta 5 dígitos (regla CLDR): 1234,5 pero 12.345,6.
assert.equal(formatNumber(1234.5, euros), "1234,5 €");
assert.equal(formatNumber(12345.6, euros), "12.345,6 €");
assert.equal(formatNumber(0, euros), "0 €");
assert.equal(formatNumber(null, euros), "");
assert.equal(formatNumber(30, f("pct", "number", { format: "percent" })), "30 %");
assert.equal(formatNumber(1234.5, f("n", "number")), "1234,5");
assert.equal(displayValue(euros, 12), "12 €"); // el formato también manda en tarjetas y listas

// --- Fechas: día suelto (formato antiguo), con hora y rango ---
assert.deepEqual(dateValue("2026-08-05"), { start: "2026-08-05" }); // sigue leyéndose lo ya guardado
assert.deepEqual(dateValue({ start: "2026-08-05", end: "2026-08-08" }), { start: "2026-08-05", end: "2026-08-08" });
assert.equal(dateValue(null), null);
assert.equal(dayOf({ start: "2026-08-05T14:30", end: "2026-08-08" }), "2026-08-05");
assert.equal(endDayOf({ start: "2026-08-05", end: "2026-08-08" }), "2026-08-08");
assert.equal(endDayOf("2026-08-05"), "2026-08-05"); // sin rango, el fin es el inicio
assert.equal(formatDate("2026-08-05"), "5 ago 2026");
assert.equal(formatDate("2026-08-05T14:30"), "5 ago 2026 14:30");
// Formatos por campo: corto (dd/mm/aaaa), reloj de 12 horas y relativo («hoy»).
const campoFecha = (config: object) => ({ id: "f", name: "F", type: "date", config }) as never;
assert.equal(formatDate("2026-08-05", campoFecha({ dateFormat: "corto" })), "05/08/2026");
assert.equal(formatDate("2026-08-05T14:30", campoFecha({ time: true, hour12: true })), "5 ago 2026 2:30 p. m.");
const hoyLocal = new Date();
const hoyYmd = `${hoyLocal.getFullYear()}-${String(hoyLocal.getMonth() + 1).padStart(2, "0")}-${String(hoyLocal.getDate()).padStart(2, "0")}`;
assert.equal(formatDate(hoyYmd, campoFecha({ dateFormat: "relativo" })), "hoy");
assert.equal(formatDate({ start: "2026-08-05", end: "2026-08-08" }), "5 ago 2026 → 8 ago 2026");

// Un filtro relativo debe coger la fila cuyo rango solapa el periodo, no solo la que empieza dentro.
const hoyISO = relativeRange("today")![0];
const ayer = relativeRange("last_7_days")![0];
const fechas: DbField[] = [f("cuando", "date")];
const filas: DbRecord[] = [
  r("solapa", { cuando: { start: ayer, end: relativeRange("next_7_days")![1] } }),
  r("fuera", { cuando: "1999-01-01" }),
  r("justo", { cuando: hoyISO }),
];
assert.equal(
  applyViewConfig(filas, fechas, { filters: [{ fieldId: "cuando", op: "today", value: null }] })
    .map((x) => x.id)
    .join(","),
  "solapa,justo",
);

// --- Color de fila por la opción elegida ---
const estado = fields[3];
assert.equal(rowColor(estado, { estado: "done" }), "var(--tag-gray)"); // opción sin color asignado: gris
const conColor = f("prio", "status", { options: [{ id: "alta", label: "Alta", color: "red" }] });
assert.equal(rowColor(conColor, { prio: "alta" }), "var(--tag-red)");
assert.equal(rowColor(estado, {}), undefined); // sin valor, sin color
assert.equal(rowColor(undefined, { estado: "done" }), undefined); // sin campo de color configurado
assert.equal(rowColor(fields[1], { tags: ["t1"] }), undefined); // opción inexistente: sin color

// --- Enlaces de vídeo que se incrustan como reproductor ---
assert.equal(embedUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/embed/abc123");
assert.equal(embedUrl("https://youtu.be/xyz789"), "https://www.youtube.com/embed/xyz789");
assert.equal(embedUrl("https://vimeo.com/123456"), "https://player.vimeo.com/video/123456");
assert.equal(embedUrl("https://elpais.com/receta"), null); // una web normal es tarjeta, no reproductor
assert.equal(embedUrl("no es una url"), null);

// --- Reglas de color: mismas condiciones que los filtros, primera que casa gana ---
const reglaFields: DbField[] = [f("cuando", "date"), f("estado", "status", { options: [{ id: "done", label: "Hecho" }] })];
const vencida = r("v", { cuando: "1999-01-01" });
const hecha = r("h", { cuando: "1999-01-01", estado: "done" });

const reglas = [
  { id: "1", color: "green", filters: [{ fieldId: "estado", op: "is", value: "done" }] },
  { id: "2", color: "red", filters: [{ fieldId: "cuando", op: "before", value: "2020-01-01" }] },
];
assert.equal(colorByRules(hecha, reglaFields, reglas), "var(--tag-green)"); // gana la primera que cumple
assert.equal(colorByRules(vencida, reglaFields, reglas), "var(--tag-red)");
assert.equal(colorByRules(r("x", {}), reglaFields, reglas), undefined); // no cumple ninguna
assert.equal(colorByRules(vencida, reglaFields, []), undefined); // sin reglas, sin color

// Una regla sin condiciones no debe pintar todo (sería el error fácil aquí).
assert.equal(matchesFilters(vencida, reglaFields, []), false);
assert.equal(colorByRules(vencida, reglaFields, [{ id: "3", color: "red", filters: [] }]), undefined);

// --- Cálculos de columna (fila de totales y subtotales por grupo) ---
const precio = f("precio", "number", { format: "euro" });
const filasCalc = [
  r("1", { precio: 10.5 }),
  r("2", { precio: 4.5 }),
  r("3", {}), // vacía: no cuenta como valor
  r("4", { precio: 0 }), // cero SÍ es un valor
];
assert.equal(computeCalc("count", precio, filasCalc), "4");
assert.equal(computeCalc("filled", precio, filasCalc), "3");
assert.equal(computeCalc("empty", precio, filasCalc), "1");
assert.equal(computeCalc("percent_filled", precio, filasCalc), "75%");
assert.equal(computeCalc("sum", precio, filasCalc), "15 €"); // con el formato del campo
assert.equal(computeCalc("avg", precio, filasCalc), "5 €");
assert.equal(computeCalc("min", precio, filasCalc), "0 €");
assert.equal(computeCalc("max", precio, filasCalc), "10,5 €");
assert.equal(computeCalc("sum", precio, [r("x", {})]), "—"); // sin números, no se inventa un 0
assert.equal(computeCalc("", precio, filasCalc), ""); // sin cálculo elegido, celda vacía

// --- Columnas congeladas (dónde se ancla cada una al desplazar en horizontal) ---
assert.deepEqual(frozenOffsets([100, 200, 50], 0, GUTTER_WIDTH), [null, null, null]); // ninguna
assert.deepEqual(frozenOffsets([100, 200, 50], 1, GUTTER_WIDTH), [GUTTER_WIDTH, null, null]); // la de siempre
assert.deepEqual(frozenOffsets([100, 200, 50], 2, GUTTER_WIDTH), [GUTTER_WIDTH, GUTTER_WIDTH + 100, null]); // se acumulan los anchos
// Sin ancho fijo se le supone uno: si no, la siguiente se anclaría encima.
assert.deepEqual(frozenOffsets([undefined, 40], 2, GUTTER_WIDTH), [GUTTER_WIDTH, GUTTER_WIDTH + FROZEN_WIDTH]);

// --- Edición simultánea: que el socket quede de verdad enganchado ---
// Se levanta un servidor real con dos clientes porque este fallo no da la cara:
// si el enganche se rompe, la conexión se abre igual, nadie da error y
// sencillamente no se sincroniza nada. Así estuvo, roto y en silencio.
async function compruebaColaboracion() {
  const { createServer } = await import("node:http");
  const { WebSocketServer } = await import("ws");
  const { Hocuspocus } = await import("@hocuspocus/server");
  const { HocuspocusProvider } = await import("@hocuspocus/provider");
  const Y = await import("yjs");
  const { attachConnection } = await import("../collab/hocuspocus");

  const hocuspocus = new Hocuspocus({});
  const wss = new WebSocketServer({ noServer: true });
  const server = createServer((_req, res) => res.end("ok"));
  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => attachConnection(hocuspocus, ws, request));
  });
  await new Promise<void>((listo) => server.listen(0, "127.0.0.1", listo));
  const { port } = server.address() as { port: number };

  const cliente = () => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}`, name: "pagina", document: doc });
    return { doc, provider };
  };
  const a = cliente();
  const b = cliente();
  await Promise.race([
    new Promise<void>((sincronizado) => b.provider.on("synced", () => sincronizado())),
    new Promise((_, falla) =>
      setTimeout(() => falla(new Error("el servidor de colaboración no contesta: ¿sigue enganchado el socket?")), 5000),
    ),
  ]);
  a.doc.getText("t").insert(0, "hola");
  await new Promise((espera) => setTimeout(espera, 300));
  assert.equal(b.doc.getText("t").toString(), "hola", "el servidor de colaboración no reparte los cambios");

  a.provider.destroy();
  b.provider.destroy();
  server.close();
}

// --- Import de Notion: nombres, rutas, dedup de CSVs y reescritura de enlaces ---
import { dedupCsvs, limpiaNombre, reescribeEnlaces, resolver } from "../src/lib/notionMd";

assert.equal(limpiaNombre("Tareas 0123456789abcdef0123456789abcdef"), "Tareas");
assert.equal(limpiaNombre("Tareas 0123456789abcdef0123456789abcdef_all"), "Tareas");
assert.equal(limpiaNombre("Sin id"), "Sin id");
assert.equal(limpiaNombre(""), "Sin título");

assert.equal(resolver("A b3f/C d4e", "../foto.png"), "A b3f/foto.png");
assert.equal(resolver("", "C d4e/foto.png"), "C d4e/foto.png");
assert.equal(resolver("A", "./x.md"), "A/x.md");

assert.deepEqual(
  dedupCsvs(["BD abc.csv", "BD abc_all.csv", "Sola def.csv"]),
  ["BD abc_all.csv", "Sola def.csv"],
  "con vista y _all debe quedarse la _all",
);

{
  const destinos = new Map([
    ["A b3f/foto 1.png", "/api/asset/x"],
    ["A b3f/Hija c4d.md", "/p/nueva"],
  ]);
  const md = "![img](A%20b3f/foto%201.png) y [hija](A%20b3f/Hija%20c4d.md) y [fuera](https://x.com/a) y [rota](no%20existe.md)";
  const out = reescribeEnlaces(md, "", (r) => destinos.get(r) ?? null);
  assert.equal(
    out,
    "![img](/api/asset/x) y [hija](/p/nueva) y [fuera](https://x.com/a) y [rota](no%20existe.md)",
    "adjuntos y páginas se reescriben; lo externo y lo roto se quedan",
  );
}

// --- Detección de tipos al importar CSV ---
import { infiereColumnas } from "../src/lib/csvTipos";

{
  const headers = ["Nombre", "Hecho", "Horas", "Entrega", "Correo", "Estado", "Etiquetas", "Notas"];
  const rows = [
    ["Tarea A", "Yes", "2.5", "August 21, 2026", "a@b.com", "Hecho", "casa, urgente", "cualquier texto largo 1"],
    ["Tarea B", "No", "3", "2026-08-22", "c@d.es", "Pendiente", "casa", "otro texto distinto 2"],
    ["Tarea C", "Sí", "0", "September 1, 2026 2:30 PM (GMT+2)", "e@f.org", "Hecho", "compra, casa", "y otro más 3"],
    ["Tarea D", "no", "-1", "2026-09-05", "g@h.io", "Pendiente", "urgente", "último texto 4"],
  ];
  const cols = infiereColumnas(headers, rows);
  assert.deepEqual(
    cols.map((c) => c.type),
    ["text", "checkbox", "number", "date", "email", "select", "multiselect", "text"],
    `tipos inferidos: ${cols.map((c) => c.type).join(", ")}`,
  );
  assert.equal(cols[1].convertir("Sí"), true);
  assert.equal(cols[1].convertir("no"), false);
  assert.equal(cols[2].convertir("2.5"), 2.5);
  assert.equal(cols[3].convertir("2026-08-22"), "2026-08-22");
  assert.ok(String(cols[3].convertir("September 1, 2026 2:30 PM")).startsWith("2026-09-01T"), "la hora se conserva");
  const opciones = (cols[5].config as { options: { id: string; label: string }[] }).options;
  assert.deepEqual(opciones.map((o) => o.label).sort(), ["Hecho", "Pendiente"]);
  assert.equal(cols[5].convertir("Hecho"), opciones.find((o) => o.label === "Hecho")!.id);
  const multi = cols[6].convertir("casa, urgente") as string[];
  assert.equal(multi.length, 2, "multiselect divide por comas");
}

// --- Mover y estirar fechas (arrastrar en Calendario/Cronograma) ---
import { shiftDateValue, stretchDateValue } from "../src/lib/cellText";

assert.deepEqual(shiftDateValue("2026-08-21", 3), { start: "2026-08-24" });
assert.deepEqual(shiftDateValue({ start: "2026-08-21T09:30" }, 1), { start: "2026-08-22T09:30" }, "la hora se conserva");
assert.deepEqual(
  shiftDateValue({ start: "2026-08-28", end: "2026-08-30" }, 5),
  { start: "2026-09-02", end: "2026-09-04" },
  "el rango se mueve entero, cruzando de mes",
);
assert.equal(shiftDateValue("2026-08-21", 0), "2026-08-21", "sin desplazamiento no se toca");
assert.deepEqual(stretchDateValue({ start: "2026-08-21", end: "2026-08-23" }, 2), { start: "2026-08-21", end: "2026-08-25" });
assert.deepEqual(stretchDateValue("2026-08-21", 2), { start: "2026-08-21", end: "2026-08-23" }, "estirar un día suelto crea el rango");
assert.deepEqual(stretchDateValue({ start: "2026-08-21", end: "2026-08-23" }, -9), { start: "2026-08-21" }, "encoger de más lo deja en un día");

// --- Agregaciones de rollup ---
import { agregaRollup } from "../src/lib/rollup";

assert.equal(agregaRollup("count", 4, [1, 2, 3]), 4);
assert.equal(agregaRollup("count_empty", 4, [1, 2, 3]), 1);
assert.equal(agregaRollup("percent_not_empty", 4, [1, 2, 3]), "75%");
assert.equal(agregaRollup("count_unique", 3, ["a", "a", "b"]), 2);
assert.equal(agregaRollup("median", 4, [1, 3, 9, 5]), 4); // par: media de 3 y 5
assert.equal(agregaRollup("range", 3, [2, 9, 5]), 7);
assert.equal(agregaRollup("earliest", 2, ["2026-03-01", "2026-01-15"]), "2026-01-15");
assert.equal(agregaRollup("latest", 2, [{ start: "2026-03-01" }, "2026-01-15"]), "2026-03-01");
assert.equal(agregaRollup("date_range", 2, ["2026-01-15", "2026-01-20"]), 5);
assert.equal(agregaRollup("checked", 3, [true, false, true]), 2);
assert.equal(agregaRollup("unchecked", 4, [true, false, true]), 2); // el sin valor cuenta como sin marcar
assert.equal(agregaRollup("percent_checked", 4, [true, false, true]), "50%");
assert.equal(agregaRollup("values", 2, ["x", "y"], (v) => String(v).toUpperCase()), "X, Y");

// --- Fórmulas 2.0: fechas, listas, current/index, texto ---
import { evalFormula } from "../src/server/formula";

{
  const ctx = {
    Horas: 2.5,
    Etiquetas: ["casa", "urgente", "casa"],
    Entrega: new Date(2026, 7, 25), // 25-ago-2026
    Relación: ["Tarea A", "Tarea B"],
    Nombre: "Compra",
  };
  assert.equal(evalFormula('join(map(prop("Etiquetas"), upper(current)), " · ")', ctx), "CASA · URGENTE · CASA");
  assert.equal(evalFormula('length(unique(prop("Etiquetas")))', ctx), 2);
  assert.equal(evalFormula('join(filter(prop("Etiquetas"), current != "casa"), ",")', ctx), "urgente");
  assert.equal(evalFormula('sum(map(prop("Etiquetas"), index))', ctx), 3); // 0+1+2
  assert.equal(evalFormula('formatDate(dateAdd(prop("Entrega"), 7, "days"), "DD/MM/YYYY")', ctx), "01/09/2026");
  assert.equal(evalFormula('dateBetween(parseDate("2026-09-01"), prop("Entrega"), "days")', ctx), 7);
  assert.equal(evalFormula('year(prop("Entrega")) + month(prop("Entrega"))', ctx), 2034); // 2026 + 8
  assert.equal(evalFormula('if(dateBetween(prop("Entrega"), parseDate("2026-08-20"), "days") > 3, "tarde", "ok")', ctx), "tarde");
  assert.equal(evalFormula('first(prop("Relación"))', ctx), "Tarea A");
  assert.equal(evalFormula('contains(prop("Relación"), "Tarea B")', ctx), "Sí");
  assert.equal(evalFormula('replaceAll("a-b-c", "-", "+")', ctx), "a+b+c");
  assert.equal(evalFormula('test(prop("Nombre"), "^Com")', ctx), "Sí");
  assert.equal(evalFormula('substring(prop("Nombre"), 0, 3)', ctx), "Com");
  assert.equal(evalFormula('toNumber("3,5") * 2', ctx), 7);
  assert.equal(evalFormula('join(sort(split("c,a,b")), "")', ctx), "abc");
  assert.equal(evalFormula('empty(prop("NoExiste"))', ctx), "Sí");
  // La fecha resultante se muestra legible (sin hora si es medianoche).
  assert.equal(evalFormula('dateAdd(prop("Entrega"), 1, "months")', ctx), "2026-09-25");
  // Lo de antes sigue funcionando igual.
  assert.equal(evalFormula('round(prop("Horas") * 2)', ctx), 5);
  assert.equal(evalFormula('if(prop("Horas") > 2, "mucho", "poco")', ctx), "mucho");
}

// Markdown → bloques BlockNote (API v1: PUT /records/:id/content).
{
  const b = markdownABloques("# Título\n\nHola **mundo** con *cursiva* y `código`.\n\n- uno\n- [dos](https://ej.com)\n1. tres\n\nlínea A\nlínea B");
  assert.deepEqual(b.map((x) => x.type), ["heading", "paragraph", "bulletListItem", "bulletListItem", "numberedListItem", "paragraph"]);
  assert.equal(b[0].props.level, 1);
  assert.deepEqual(b[1].content, [
    { type: "text", text: "Hola ", styles: {} },
    { type: "text", text: "mundo", styles: { bold: true } },
    { type: "text", text: " con ", styles: {} },
    { type: "text", text: "cursiva", styles: { italic: true } },
    { type: "text", text: " y ", styles: {} },
    { type: "text", text: "código", styles: { code: true } },
    { type: "text", text: ".", styles: {} },
  ]);
  assert.deepEqual(b[3].content, [
    { type: "link", href: "https://ej.com", content: [{ type: "text", text: "dos", styles: {} }] },
  ]);
  // Líneas seguidas sin blanco = un solo párrafo; negrita anidando cursiva.
  assert.deepEqual(b[5].content, [{ type: "text", text: "línea A línea B", styles: {} }]);
  assert.deepEqual(markdownABloques("**a *b***")[0].content, [
    { type: "text", text: "a ", styles: { bold: true } },
    { type: "text", text: "b", styles: { bold: true, italic: true } },
  ]);
  assert.deepEqual(markdownABloques(""), []);
}

// --- Markdown inline en celdas ------------------------------------------------
import { tieneFormato, tokeniza } from "../src/lib/mdInline";
{
  assert.equal(tieneFormato("texto normal"), false);
  assert.equal(tieneFormato("3*4 = 12"), false); // un asterisco suelto no es cursiva
  assert.equal(tieneFormato("a * b * c"), false); // pegado a espacios tampoco
  assert.equal(tieneFormato("una **negrita**"), true);
  assert.equal(tieneFormato("mira https://ej.com"), true);
  assert.deepEqual(tokeniza("a **b** c"), [
    { t: "texto", s: "a " },
    { t: "negrita", s: "b" },
    { t: "texto", s: " c" },
  ]);
  assert.deepEqual(tokeniza("*sí* y ~~no~~ y `cod`"), [
    { t: "cursiva", s: "sí" },
    { t: "texto", s: " y " },
    { t: "tachado", s: "no" },
    { t: "texto", s: " y " },
    { t: "codigo", s: "cod" },
  ]);
  assert.deepEqual(tokeniza("[web](https://ej.com) y https://otro.com"), [
    { t: "enlace", s: "web", href: "https://ej.com" },
    { t: "texto", s: " y " },
    { t: "enlace", s: "https://otro.com", href: "https://otro.com" },
  ]);
  // Un [enlace](javascript:...) NO se convierte en enlace: queda texto plano.
  assert.equal(tokeniza("[x](javascript:alert(1))").some((t) => t.t === "enlace"), false);
}

// --- Límite de peticiones del formulario público -------------------------------
import { permitido } from "../src/server/ratelimit";
{
  const t0 = 1_000_000;
  // 3 permitidas en la ventana; la 4ª no; pasada la ventana, vuelve a entrar.
  assert.equal(permitido("k", 3, 1000, t0), true);
  assert.equal(permitido("k", 3, 1000, t0 + 1), true);
  assert.equal(permitido("k", 3, 1000, t0 + 2), true);
  assert.equal(permitido("k", 3, 1000, t0 + 3), false);
  assert.equal(permitido("k", 3, 1000, t0 + 1001), true);
  // Claves independientes no se estorban.
  assert.equal(permitido("otra", 1, 1000, t0), true);
  assert.equal(permitido("otra", 1, 1000, t0 + 1), false);
}

// --- Formulario: campos obligatorios -----------------------------------------
import { faltanObligatorios } from "../src/components/database/FormFields";
{
  const campos = [
    { id: "a", name: "Nombre", type: "text", config: null },
    { id: "b", name: "Asistes", type: "checkbox", config: null },
    { id: "c", name: "Cuántos", type: "number", config: null },
  ];
  // Falta el texto obligatorio; el checkbox nunca cuenta como obligatorio.
  assert.deepEqual(faltanObligatorios(["a", "b"], campos, { c: 2 }).map((f) => f.id), ["a"]);
  // "" y null cuentan como vacío; 0 y false no.
  assert.equal(faltanObligatorios(["a", "c"], campos, { a: "", c: 0 }).length, 1);
  assert.equal(faltanObligatorios(["a"], campos, { a: "Jose" }).length, 0);
}

compruebaColaboracion()
  .then(() => {
    console.log("OK — filtros, orden, celdas, agrupación, formatos, fechas, colores, enlaces, reglas, cálculos, colaboración e import de Notion");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
