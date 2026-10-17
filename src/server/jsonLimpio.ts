import type { Prisma } from "@prisma/client";

/**
 * Bloques del editor listos para una columna JSON. BlockNote deja `undefined`
 * dentro de arrays (el `columnWidths` de cualquier tabla con columnas sin
 * ancho fijo) y superjson lo trae tal cual; Prisma rechaza el valor entero y
 * el guardado fallaba con un 500 desde que la página tenía una tabla. Ida y
 * vuelta por JSON: `undefined` en un array pasa a null y en un objeto
 * desaparece, que es lo que BlockNote vuelve a leer igual.
 */
export function jsonLimpio(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? [])) as Prisma.InputJsonValue;
}
