/**
 * Lo que arranca con el servidor (Next llama a `register` una vez por proceso): la
 * vuelta de cada minuto que lanza los recordatorios a su hora (src/server/recordatorios.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { arrancaRecordatorios } = await import("./server/recordatorios");
  arrancaRecordatorios();
}
