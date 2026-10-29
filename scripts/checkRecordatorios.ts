/**
 * Pruebas de los recordatorios (las llama scripts/check.ts): cuándo saltan (hora de
 * Madrid, fechas sin hora a las 9:00, el cambio al horario de invierno del 25-oct-2026)
 * y la vuelta del servidor con una BD falsa en memoria: el aviso sale una vez, a su
 * hora, a quien toca, con su push, y no se repite.
 */
import assert from "node:assert/strict";
import { cuandoEvento, momentoRecordatorio, opcionesRecordatorio, sugerenciasRecordar } from "../src/lib/recordatorios";
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
  // «@recordar…» en el menú @, como en Notion (jueves 29-oct-2026 a las 10:00 de Madrid).
  const jueves = new Date("2026-10-29T09:00:00Z");
  const fechas = (q: string) => sugerenciasRecordar(q, jueves)?.map((x) => x.fecha);
  assert.equal(sugerenciasRecordar("ma", jueves), null, "lo que no va de recordar no sugiere nada");
  assert.deepEqual(fechas("rec"), ["2026-10-29T11:00", "2026-10-29T19:00", "2026-10-30T09:00"], "los atajos");
  assert.deepEqual(sugerenciasRecordar("recordar", jueves)?.map((x) => x.titulo), ["Recordar en 1 hora", "Recordar hoy a las 19:00", "Recordar mañana a las 09:00"]);
  assert.deepEqual(fechas("recordar mañana"), ["2026-10-30T09:00"]);
  assert.deepEqual(fechas("Recordar a las 19:00"), ["2026-10-29T19:00"]);
  assert.deepEqual(fechas("recordar a las 8"), ["2026-10-30T08:00"], "una hora ya pasada es mañana");
  assert.deepEqual(fechas("recordar el miércoles a la 13:00"), ["2026-11-04T13:00"]);
  assert.deepEqual(fechas("recordar jueves"), ["2026-11-05T09:00"], "el mismo día de la semana es el de la que viene");
  assert.deepEqual(fechas("recordar 31/12 18:30"), ["2026-12-31T18:30"]);
  assert.equal(fechas("recordar 31/02")?.length, 3, "una fecha que no existe vuelve a los atajos");
  assert.equal(fechas("recordar algo raro")?.length, 3);
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
    pospuesto: { findMany: async () => [] },
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

    // «Recordarme…» en una fila (la mención va en su cuerpo), «Posponer 1 h» y «Hecho».
    const { accionRecordatorio } = await import("../src/server/recordatorios");
    const { bloqueRecordatorio } = await import("../src/lib/recordatorios");
    const avisos2: Aviso[] = [];
    const pospuestos: { id: string; userId: string; cuando: Date; [k: string]: unknown }[] = [];
    const leidos: string[] = [];
    let escrito: unknown = null;
    let cuerpo: unknown[] = [bloqueRecordatorio("b", "2026-10-24T18:00", "u2")];
    const camposTareas = [{ id: "t", type: "text", config: null }, { id: "e", type: "status", config: { options: [{ id: "a", group: "todo" }, { id: "z", group: "done" }] } }];
    g.prisma = {
      $queryRaw: async (sql: TemplateStringsArray) =>
        sql.join("").includes("FOR UPDATE") ? [{ content: cuerpo }]
        : sql.join("").includes("content::text") && sql.join("").includes('"Record"') ? [{ id: "r9" }] : [],
      $executeRaw: async (_sql: TemplateStringsArray, json: unknown) => ((escrito = json), 1),
      $transaction: async (f: (tx: unknown) => unknown) => f(g.prisma),
      record: {
        findMany: async () => [{ id: "r9", cells: { t: "Comprar regalo" }, content: cuerpo, collection: { pageId: "bd", page: { workspaceId: "w1" }, fields: camposTareas } }],
        findFirst: async () => ({ id: "r9", cells: { f: { start: "2026-10-24T20:00", end: "2026-10-24T21:00", reminder: "0" }, g: { start: "2026-10-25", reminder: "1d" } }, collection: { fields: camposTareas } }),
        update: async ({ data }: { data: { content: unknown[] } }) => ((cuerpo = data.content), {}),
      },
      page: {
        findMany: async () => [],
        findUnique: async () => ({ parentId: null, restricted: false }),
        findFirst: async () => ({ id: "bd", workspaceId: "w1", title: "Tareas", workspace: { ownerId: "u1" } }),
      },
      workspace: { findUnique: async () => ({ ownerId: "u1" }) },
      member: { findUnique: async ({ where }: { where: { workspaceId_userId: { userId: string } } }) => (where.workspaceId_userId.userId === "u2" ? { role: "editor" } : null) },
      notification: {
        findMany: async ({ where }: { where: { OR: { userId: string; key: string }[] } }) => avisos2.filter((a) => where.OR.some((o) => o.userId === a.userId && o.key === a.key)),
        createMany: async ({ data }: { data: Aviso[] }) => {
          const nuevos = data.filter((d) => !avisos2.some((a) => a.userId === d.userId && a.key === d.key));
          avisos2.push(...nuevos);
          return { count: nuevos.length };
        },
        updateMany: async ({ where }: { where: { key: string } }) => (leidos.push(where.key), { count: 1 }),
      },
      pospuesto: {
        findMany: async ({ where }: { where: { cuando: { gte: Date; lte: Date } } }) => pospuestos.filter((p) => p.cuando >= where.cuando.gte && p.cuando <= where.cuando.lte),
        create: async ({ data }: { data: { userId: string; cuando: Date } }) => {
          const p = { id: `p${pospuestos.length}`, ...data };
          pospuestos.push(p);
          return p;
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };
    const db2 = g.prisma as Parameters<typeof disparaRecordatorios>[0];
    const pushes2: Parameters<Parameters<typeof disparaRecordatorios>[2] & object>[1][] = [];
    const dispara2 = (ahora: Date) => disparaRecordatorios(db2, ahora, (_u, p) => pushes2.push(p));
    // 18:00 de Madrid del sábado 24 (verano) = 16:00 UTC, a quien lo puso, abriendo la fila.
    assert.equal(await dispara2(new Date("2026-10-24T15:59:00Z")), 0);
    assert.equal(await dispara2(new Date("2026-10-24T16:00:10Z")), 1);
    const rec = pushes2[0].recordatorio!;
    assert.deepEqual([avisos2[0].userId, rec.pageId, rec.recordId, rec.titulo], ["u2", "bd", "r9", "Comprar regalo"]);
    // Posponer 1 h de un aviso a la hora de su fecha: la mención misma pasa a dentro de una
    // hora (al minuto de arriba), el aviso queda leído y vuelve a saltar entonces.
    const r = await accionRecordatorio(db2, "u2", "posponer", rec, new Date("2026-10-24T16:00:20Z"));
    assert.equal(r.pospuesto?.cuando, "2026-10-24T17:01:00.000Z");
    assert.equal(r.pospuesto?.key, "rem:r9:2026-10-24T17:01:00.000Z:u2");
    assert.equal(pospuestos.length, 0, "no hace falta un aviso aparte: se ha movido la fecha");
    assert.deepEqual((cuerpo[0] as { content: { props?: { fecha?: string } }[] }).content[1].props?.fecha, "2026-10-24T19:01");
    assert.deepEqual(leidos, [rec.key]);
    assert.equal(await dispara2(new Date("2026-10-24T17:00:30Z")), 0);
    assert.equal(await dispara2(new Date("2026-10-24T17:01:10Z")), 1);
    assert.equal(avisos2[1].key, r.pospuesto?.key);
    assert.equal(pushes2[1].body, "Comprar regalo · hoy a las 19:01");
    // Una celda con aviso a la hora: se mueve la fecha (y el fin del rango con ella).
    const celda = await accionRecordatorio(db2, "u2", "posponer", { key: "rem:r9:f:2026-10-24T18:00:00.000Z", pageId: "bd", recordId: "r9" }, new Date("2026-10-24T18:00:05Z"));
    assert.equal(celda.pospuesto?.key, "rem:r9:f:2026-10-24T19:01:00.000Z");
    assert.equal(escrito, JSON.stringify({ f: { start: "2026-10-24T21:01", end: "2026-10-24T22:01", reminder: "0" } }));
    // «1 día antes»: el evento no se toca; el aviso se repite aparte dentro de una hora.
    escrito = null;
    const antes = await accionRecordatorio(db2, "u2", "posponer", { key: "rem:r9:g:2026-10-24T07:00:00.000Z", pageId: "bd", recordId: "r9", titulo: "Comprar regalo" }, new Date("2026-10-24T07:00:05Z"));
    assert.equal(escrito, null);
    assert.equal(antes.pospuesto?.key, "pos:p0");
    assert.equal(antes.pospuesto?.cuando, "2026-10-24T08:00:05.000Z");
    pospuestos.length = 0;
    // Hecho: la fila con Estado pasa a la opción del grupo «Hecho».
    assert.deepEqual(await accionRecordatorio(db2, "u2", "hecho", pushes2[1].recordatorio!), { hecha: true });
    assert.equal(escrito, JSON.stringify({ e: "z" }));
    // Sin acceso a la página, ni posponer ni marcar.
    await assert.rejects(accionRecordatorio(db2, "u9", "hecho", rec), /acceso/);
  } finally {
    g.prisma = anterior;
  }
}
