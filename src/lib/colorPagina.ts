// Color de página (Notion no lo tiene: lo pedía la app de notas de Pablo). Se elige en
// ⋯ → Apariencia y diseño con la paleta de fondos de Notion; tiñe suave el fondo de la
// página y deja una barrita de su color donde se lista (filas, tarjetas, Inicio,
// resultados, widget Nota). Es de la página: lo ven todos los que la ven.
// Los tonos viven en globals.css (--pag-*, el fondo; --ico-*, la barrita) y en la app
// (`ui/comun/ColorPagina.kt`); `npm run check` mira que la app tenga los mismos.

export const COLORES_PAGINA = [
  { id: "default", nombre: "Predeterminado" },
  { id: "gray", nombre: "Gris" },
  { id: "brown", nombre: "Marrón" },
  { id: "orange", nombre: "Naranja" },
  { id: "yellow", nombre: "Amarillo" },
  { id: "green", nombre: "Verde" },
  { id: "blue", nombre: "Azul" },
  { id: "purple", nombre: "Morado" },
  { id: "pink", nombre: "Rosa" },
  { id: "red", nombre: "Rojo" },
] as const;

export type ColorPagina = (typeof COLORES_PAGINA)[number]["id"];
export const IDS_COLOR_PAGINA = COLORES_PAGINA.map((c) => c.id) as [ColorPagina, ...ColorPagina[]];

/** El color guardado, o null si no hay (o es «Predeterminado», o uno que ya no existe). */
export function colorPagina(v: unknown): Exclude<ColorPagina, "default"> | null {
  return typeof v === "string" && v !== "default" && IDS_COLOR_PAGINA.includes(v as ColorPagina)
    ? (v as Exclude<ColorPagina, "default">)
    : null;
}
