/**
 * Pruebas de `POST /api/app/registro` (las llama scripts/check.ts): la ruta de verdad con
 * una BD falsa en memoria (la de `@/lib/db` se coge de `globalThis.prisma`).
 */
import assert from "node:assert/strict";

type Fila = { id: string; userId: string; createdAt: Date; fecha: Date; tipo: string; mensaje: string; traza: string | null };

export async function compruebaRegistro() {
  const filas: Fila[] = [];
  let n = 0;
  const g = globalThis as unknown as { prisma?: unknown };
  const anterior = g.prisma;
  g.prisma = {
    session: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        where.token === "tok" ? { expiresAt: new Date(Date.now() + 3600_000), user: { id: "u1" } } : null,
    },
    appRegistro: {
      createMany: async ({ data }: { data: Omit<Fila, "id" | "createdAt">[] }) => {
        for (const d of data) filas.push({ id: String(++n), createdAt: new Date(), ...d });
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: { id?: { in: string[] }; userId?: string; createdAt?: { lt: Date } } }) => {
        const fuera = (f: Fila) =>
          where.id ? where.id.in.includes(f.id) : f.userId === where.userId && f.createdAt < where.createdAt!.lt;
        const antes = filas.length;
        for (let i = filas.length - 1; i >= 0; i--) if (fuera(filas[i])) filas.splice(i, 1);
        return { count: antes - filas.length };
      },
      findMany: async ({ where, skip }: { where: { userId: string }; skip: number }) =>
        filas
          .filter((f) => f.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.fecha.getTime() - a.fecha.getTime())
          .slice(skip)
          .map((f) => ({ id: f.id })),
    },
  };
  try {
    const { POST } = await import("../src/app/api/app/registro/route");
    const { REGISTRO_MAX_POR_USUARIO } = await import("../src/server/appRegistro");
    const pide = (cuerpo: string, cookie: string | null = "notiono_session=tok; notiono_ws=w1") =>
      POST(new Request("http://x/api/app/registro", { method: "POST", body: cuerpo, headers: cookie ? { cookie } : {} }));
    const lote = (entradas: unknown[]) =>
      JSON.stringify({ dispositivo: "d1", version: "2.0.3 (6)", modelo: "23078PND5G", fabricante: "Xiaomi", android: "15 (API 35)", entradas });

    // Sin sesión (o con una que no existe), nada.
    assert.equal((await pide(lote([]), null)).status, 401);
    assert.equal((await pide(lote([]), "notiono_session=otra")).status, 401);
    // Lo que no es un lote, fuera.
    assert.equal((await pide("<html>")).status, 400);
    assert.equal((await pide(JSON.stringify({ entradas: "no" }))).status, 400);
    assert.equal((await pide("x".repeat(2_000_001))).status, 413);
    assert.equal(filas.length, 0);

    // Un lote: se recorta lo largo, el tipo desconocido es «otro», sin mensaje no entra, y una fecha futura pasa a «ahora».
    const r = await pide(lote([
      { n: 1, fecha: "2026-10-18T20:00:00Z", tipo: "cierre", mensaje: "Cierre inesperado · java.lang.IllegalStateException: boom", traza: "java.lang.IllegalStateException\n  at x" },
      { n: 2, fecha: "2099-01-01T00:00:00Z", tipo: "raro", mensaje: "m".repeat(5000) },
      { n: 3, fecha: "2026-10-18T20:01:00Z", tipo: "widget", mensaje: "" },
      { n: 4, fecha: "no es fecha", tipo: "widget", mensaje: "nota · periodico · ok · 812 ms", traza: "t".repeat(20_000) },
    ]));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, guardadas: 3 });
    assert.equal(filas.length, 3);
    assert.ok(filas.every((f) => f.userId === "u1" && (f as unknown as { fabricante: string }).fabricante === "Xiaomi"));
    assert.equal(filas[0].tipo, "cierre");
    assert.equal(filas[0].fecha.toISOString(), "2026-10-18T20:00:00.000Z");
    assert.equal(filas[1].tipo, "otro");
    assert.equal(filas[1].mensaje.length, 1000);
    assert.ok(filas[1].fecha.getTime() <= Date.now());
    assert.equal(filas[2].traza!.length, 8000);

    // Tope por usuario: fuera lo de hace más de 30 días y, de lo demás, lo más viejo hasta quedar 2000.
    filas.length = 0;
    const ahora = Date.now();
    const fila = (userId: string, haceMs: number): Fila =>
      ({ id: String(++n), userId, createdAt: new Date(ahora - haceMs), fecha: new Date(ahora - haceMs), tipo: "widget", mensaje: "viejo", traza: null });
    for (let i = 0; i < 5; i++) filas.push(fila("u1", 40 * 86_400_000 + i));
    for (let i = 0; i < 2100; i++) filas.push(fila("u1", (i + 1) * 60_000));
    for (let i = 0; i < 3; i++) filas.push(fila("u2", 40 * 86_400_000));
    assert.equal((await pide(lote([{ n: 9, fecha: new Date().toISOString(), tipo: "widget", mensaje: "nuevo" }]))).status, 200);
    const delUsuario = filas.filter((f) => f.userId === "u1");
    assert.equal(delUsuario.length, REGISTRO_MAX_POR_USUARIO);
    assert.ok(delUsuario.some((f) => f.mensaje === "nuevo"));
    assert.ok(delUsuario.every((f) => ahora - f.createdAt.getTime() < 30 * 86_400_000));
    // Lo de otros usuarios no se toca.
    assert.equal(filas.filter((f) => f.userId === "u2").length, 3);
  } finally {
    g.prisma = anterior;
  }
}
