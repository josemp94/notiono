/**
 * Repara árbol y enlaces de subpáginas sueltos (ver docs/subpaginas.md). Se lanza
 * dentro del contenedor de la app, que ya tiene AUTH_SECRET:
 *
 *   node collab/dist/reparar-subpaginas.mjs [--aplicar] [--espacio <id>] [--url http://127.0.0.1:3000]
 *
 * No toca la base de datos por su cuenta: se lo pide al servidor en marcha, que
 * escribe en el documento vivo de cada página (si alguien la tiene abierta lo ve al
 * momento y no se pisa nada). Sin --aplicar solo lista lo que haría.
 */
import { firmaReparacion } from "../src/server/collabToken";

const args = process.argv.slice(2);
const valor = (nombre: string) => {
  const i = args.indexOf(nombre);
  return i === -1 ? undefined : args[i + 1];
};
const aplicar = args.includes("--aplicar");
const espacio = valor("--espacio");
const url = valor("--url") ?? `http://127.0.0.1:${process.env.PORT || 3000}`;

const momento = Date.now();
const r = await fetch(`${url}/api/interno/reparar-subpaginas`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-reparar-momento": String(momento), "x-reparar-firma": firmaReparacion(momento) },
  body: JSON.stringify({ aplicar, espacio }),
});
if (!r.ok) {
  console.error(`Error ${r.status}: ${await r.text()}`);
  process.exit(1);
}
const { lineas } = (await r.json()) as { lineas: string[] };
if (!lineas.length) console.log("Nada que arreglar.");
else {
  for (const l of lineas) console.log(l);
  console.log(aplicar ? `\nArreglado: ${lineas.length}.` : `\n${lineas.length} arreglos pendientes. Nada cambiado: repite con --aplicar para hacerlos.`);
}
