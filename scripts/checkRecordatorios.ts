/**
 * Pruebas de los recordatorios (las llama scripts/check.ts): cuándo saltan (hora de
 * Madrid, fechas sin hora a las 9:00, el cambio al horario de invierno del 25-oct-2026)
 * y la vuelta del servidor con una BD falsa en memoria: el aviso sale una vez, a su
 * hora, a quien toca, con su push, y no se repite.
 */
import assert from "node:assert/strict";
import { cuandoEvento, momentoRecordatorio, opcionesRecordatorio } from "../src/lib/recordatorios";
import { shiftDateValue, stretchDateValue } from "../src/lib/cellText";

type Aviso = { userId: string; workspaceId: string; type: string; key: string; title: string; pageId: string; recordId: string | null };

export async function compruebaRecordatorios() {
  const iso = (inicio: string, antes: string) => momentoRecordatorio(inicio, antes)?.toISOString();
  // Verano (UTC+2) e invierno (UTC+1): el 25-oct-2026 a las 3:00 vuelven a ser las 2:00.
  assert.equal(iso("2026-10-24", "0"), "2026-10-24T07:00:00.000Z");
  assert.equal(iso("2026-10-25", "0"), "2026-10-25T08:00:00.000Z");
  assert.equal(iso("2026-10-26", "1d"), "2026-10-25T08:00:00.000Z");
  assert.equal(iso("2026-10-26T18:30", "1d"), "2026-10-25T08:00:00.000Z", "los «días antes» van a las 9:00");
  assert.equal(iso("2026-10-24T10:00", "1h"), "2026-10-24T07:00:00.000Z");
  assert.equal(iso("2026-10-25T10:00", "1h"), "2026-10-25T08:00:00.000Z");
  assert.equal(iso("2026-10-25T01:30", "0"), "2026-10-24T23:30:00.000Z", "antes del cambio, aún verano");
  assert.equal(iso("2026-10-25T04:00", "15m"), "2026-10-25T02:45:00.000Z", "después del cambio, invierno");
  assert.equal(iso("2026-11-02", "1w"), "2026-10-26T08:00:00.000Z");
  assert.equal(iso("2027-03-28", "0"), "2027-03-28T07:00:00.000Z", "el cambio de primavera");
  assert.equal(iso("2026-10-24", "5m"), "2026-10-24T06:55:00.000Z", "sin hora, el evento cuenta a las 9:00");
  assert.equal(iso("2026-10-24", "raro"), undefined);
  assert.equal(iso("no-es-fecha", "0"), undefined);
  assert.deepEqual(opcionesRecordatorio(false).map(([id]) => id), ["0", "1d", "2d", "1w"]);
  assert.equal(opcionesRecordatorio(true).length, 10);
  assert.equal(cuandoEvento("2026-10-24T17:00", new Date("2026-10-24T10:00:00Z")), "hoy a las 17:00");
  assert.equal(cuandoEvento("2026-10-25", new Date("2026-10-24T21:59:00Z")), "mañana");
  assert.equal(cuandoEvento("2026-10-25", new Date("2026-10-24T22:01:00Z")), "hoy", "medianoche de Madrid, no de UTC");
  // Mover o estirar la fecha (calendario, cronograma) conserva el recordatorio.
  assert.deepEqual(shiftDateValue({ start: "2026-10-24T10:00", reminder: "1h", reminderBy: "u1" }, 2), { start: "2026-10-26T10:00", reminder: "1h", reminderBy: "u1" });
  assert.deepEqual(stretchDateValue({ start: "2026-10-24", reminder: "1d" }, 1), { start: "2026-10-24", end: "2026-10-25", reminder: "1d" });

  // La vuelta del servidor contra una BD falsa (la de `@/lib/db` se coge de globalThis.prisma).
  const avisos: Aviso[] = [];
  const g = globalThis as unknown as { prisma?: unknown };
  const anterior = g.prisma;
  const filas = [
    // Tarea asignada a u2 con aviso 1 h antes de las 10:00 del 25-oct (invierno): 09:00 Madrid = 08:00 UTC.
    { id: "r1", cells: { t: "Llevar el coche al taller", f: { start: "2026-10-25T10:00", reminder: "1h", reminderBy: "u1" }, p: ["u2"] }, createdById: "u1" },
    // Sin nadie asignado: avisa a quien lo puso. Sin hora: a las 9:00 (07:00 UTC en verano).
    { id: "r2", cells: { t: "", f: { start: "2026-10-24", reminder: "0", reminderBy: "u1" } }, createdById: "u3" },
    // Sin recordatorio: nada.
    { id: "r3", cells: { t: "Otra", f: "2026-10-24" }, createdById: "u1" },
  ];
  const campos = [{ id: "t", type: "text" }, { id: "f", type: "date" }, { id: "p", type: "person" }];
  const pagina = { id: "pg", title: "Diario", workspaceId: "w1", content: [
    { id: "b1", type: "paragraph", content: [{ type: "text", text: "Cita " }, { type: "dateMention", props: { fecha: "2026-10-24T12:00", recordatorio: "30m", por: "u2" } }], children: [] },
  ] };
  g.prisma = {
    $queryRaw: async (sql: TemplateStringsArray) => (sql.join("").includes('"Record"') ? filas.map((f) => ({ id: f.id })) : [{ id: "pg" }]),
    record: {
      findMany: async () => filas.map((f) => ({ ...f, collection: { pageId: "bd", page: { workspaceId: "w1" }, fields: campos } })),
    },
    page: {
      findMany: async () => [pagina],
      findUnique: async () => ({ parentId: null, restricted: false }),
    },
    workspace: { findUnique: async () => ({ ownerId: "u1" }) },
    member: { findUnique: async ({ where }: { where: { workspaceId_userId: { userId: string } } }) => (where.workspaceId_userId.userId === "u2" ? { role: "editor" } : null) },
    notification: {
      findMany: async ({ where }: { where: { OR: { userId: string; key: string }[] } }) =>
        avisos.filter((a) => where.OR.some((o) => o.userId === a.userId && o.key === a.key)),
      createMany: async ({ data }: { data: Aviso[] }) => {
        const nuevos = data.filter((d) => !avisos.some((a) => a.userId === d.userId && a.key === d.key));
        avisos.push(...nuevos);
        return { count: nuevos.length };
      },
    },
  };
  try {
    const { disparaRecordatorios, recordatoriosEntre } = await import("../src/server/recordatorios");
    const db = g.prisma as Parameters<typeof disparaRecordatorios>[0];
    const pushes: { userId: string; body: string; url?: string }[] = [];
    const dispara = (ahora: Date) => disparaRecordatorios(db, ahora, (userId, p) => pushes.push({ userId, body: p.body, url: p.url }));
    // Antes de su hora, nada.
    assert.equal(await dispara(new Date("2026-10-24T06:59:00Z")), 0);
    // A las 9:00 de Madrid del 24 (verano): el de la fila sin asignar, a quien lo puso.
    assert.equal(await dispara(new Date("2026-10-24T07:00:30Z")), 1);
    assert.deepEqual(avisos.map((a) => [a.userId, a.type, a.title, a.recordId, a.pageId]), [["u1", "reminder", "Sin título", "r2", "bd"]]);
    // Una pasada después no lo repite.
    assert.equal(await dispara(new Date("2026-10-24T07:01:30Z")), 0);
    // La mención de la página (12:00 - 30 min = 11:30 Madrid = 09:30 UTC), a quien la puso.
    assert.equal(await dispara(new Date("2026-10-24T09:30:00Z")), 1);
    assert.equal(avisos[1].userId, "u2");
    assert.equal(avisos[1].recordId, null);
    assert.equal(avisos[1].pageId, "pg");
    // La tarea asignada: a u2 (la responsable), no a quien puso el aviso. Ya en horario de invierno.
    assert.equal(await dispara(new Date("2026-10-25T07:59:00Z")), 0);
    assert.equal(await dispara(new Date("2026-10-25T08:00:00Z")), 1);
    assert.deepEqual([avisos[2].userId, avisos[2].recordId], ["u2", "r1"]);
    assert.ok(avisos[2].key.startsWith("rem:r1:f:2026-10-25T08:00:00.000Z"));
    // Tras un parón largo, lo de hace más de 12 h ya no salta.
    avisos.length = 0;
    assert.equal(await dispara(new Date("2026-10-26T12:00:00Z")), 0);
    // Cada aviso nuevo, su push (a la web y al puente de WhatsApp), con el cuándo y la fila.
    assert.deepEqual(pushes, [
      { userId: "u1", body: "Sin título · hoy", url: "/p/bd?r=r2" },
      { userId: "u2", body: "Diario · hoy a las 12:00", url: "/p/pg" },
      { userId: "u2", body: "Llevar el coche al taller · hoy a las 10:00", url: "/p/bd?r=r1" },
    ]);
    // Lo que baja la app: los próximos de una persona, en orden.
    const deU2 = await recordatoriosEntre(db, new Date("2026-10-24T00:00:00Z"), new Date("2026-10-26T00:00:00Z"), { userId: "u2" });
    assert.deepEqual(deU2.map((r) => r.recordId ?? r.pageId), ["pg", "r1"]);
  } finally {
    g.prisma = anterior;
  }
}
