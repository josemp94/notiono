/**
 * «Abrir al iniciar» solo cuenta al arrancar: la primera carga de la pestaña (o de la
 * PWA) y si esa carga fue en el Inicio. Pulsar «Inicio» luego, en el panel o en la barra
 * inferior, siempre enseña el Inicio; recargar la pestaña tampoco salta (sessionStorage
 * sigue ahí), pero abrir una pestaña o la PWA de nuevo sí.
 *
 * Lo primero que pase por aquí en la carga (el AppShell o el propio Inicio) apunta la
 * ruta de entrada; el Inicio se la queda una sola vez.
 */
const CLAVE = "notiono.arrancado";
let entrada: { primera: boolean; ruta: string } | null = null;

function lee() {
  if (!entrada) {
    let primera = true;
    try {
      primera = !sessionStorage.getItem(CLAVE);
      sessionStorage.setItem(CLAVE, "1");
    } catch {
      // Sin sessionStorage (modo privado raro): cuenta como arranque una vez por carga.
    }
    entrada = { primera, ruta: window.location.pathname };
  }
  return entrada;
}

export function registraArranque() {
  lee();
}

/** true una sola vez: si esta pestaña acaba de arrancar y lo hizo en el Inicio. */
export function tomaArranqueEnInicio(): boolean {
  const e = lee();
  const si = e.primera && e.ruta === "/";
  e.primera = false;
  return si;
}
