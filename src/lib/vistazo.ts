/** El panel lateral de vista previa de una página (ver src/components/PanelPagina.tsx). */
export const VISTAZO_EVENT = "notiono:vistazo";
/** Parámetro de la URL con la página abierta en el panel. */
export const VISTAZO_PARAM = "vistazo";

/** Abre una página en el panel lateral (menú de los 6 puntos, Alt+clic en su enlace). */
export function abrirEnPanel(pageId: string) {
  window.dispatchEvent(new CustomEvent(VISTAZO_EVENT, { detail: pageId }));
}
