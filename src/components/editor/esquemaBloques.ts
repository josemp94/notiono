/**
 * La forma (tipo, props y contenido) de los bloques y chips propios del editor, SIN
 * React. La usan a la vez:
 *
 *  - las specs de React del navegador (`*Block.tsx`, `mention.tsx`), que les ponen
 *    el dibujo, y
 *  - el esquema espejo del servidor (`src/server/app/esquema.ts`), que convierte
 *    bloques ↔ Yjs para la app nativa de Android sin poder cargar React.
 *
 * Por eso viven aquí y no dentro de cada componente: si cambias un prop en un sitio,
 * cambia en los dos y el servidor no puede quedarse con un esquema viejo (que, al
 * leer el documento compartido, se comería lo que no reconoce).
 */

/** Llamada: emoji + texto destacado. */
export const configLlamada = {
  type: "callout" as const,
  propSchema: {
    emoji: { default: "💡" },
    color: { default: "naranja" },
  },
  content: "inline" as const,
};

/** Enlace web: tarjeta OpenGraph o reproductor de YouTube/Vimeo. */
export const configMarcador = {
  type: "bookmark" as const,
  propSchema: {
    url: { default: "" },
    title: { default: "" },
    description: { default: "" },
    image: { default: "" },
    siteName: { default: "" },
  },
  content: "none" as const,
};

/** Base de datos embebida (o vista enlazada de una que ya existe). */
export const configBaseDatos = {
  type: "database" as const,
  propSchema: {
    collectionId: { default: "" },
    pageId: { default: "" }, // página contenedora oculta (embedded=true) de la que cuelga la Collection
    viewId: { default: "" }, // vista que muestra el bloque (las vistas enlazadas recuerdan la suya)
  },
  content: "none" as const,
};

/** Ecuación en bloque (TeX). */
export const configEcuacion = {
  type: "equation" as const,
  propSchema: { tex: { default: "" } },
  content: "none" as const,
};

/** Tabla de contenidos. */
export const configIndice = { type: "toc" as const, propSchema: {}, content: "none" as const };

/** Columnas: el contenedor y cada columna (los bloques van como hijos). */
export const configListaColumnas = { type: "columnList" as const, propSchema: {}, content: "none" as const };
export const configColumna = {
  type: "column" as const,
  propSchema: { ancho: { default: 1 } },
  content: "none" as const,
};

/** Chips en línea: página, persona y fecha. */
export const configMencion = {
  type: "mention" as const,
  propSchema: {
    pageId: { default: "" },
    title: { default: "" },
    icon: { default: "" },
  },
  content: "none" as const,
};
export const configMencionPersona = {
  type: "personMention" as const,
  propSchema: {
    userId: { default: "" },
    name: { default: "" },
  },
  content: "none" as const,
};
export const configMencionFecha = {
  type: "dateMention" as const,
  // recordatorio: antelación de src/lib/recordatorios.ts ("" = ninguno); por: quién lo puso (a quién avisa).
  propSchema: { fecha: { default: "" }, recordatorio: { default: "" }, por: { default: "" } },
  content: "none" as const,
};

/** Lenguaje por defecto del bloque de código (el de `@blocknote/code-block`; lo comprueba `npm run check`). */
export const LENGUAJE_CODIGO = "javascript";

/**
 * Dibujo a mano (Excalidraw): `escena` es la URL del Asset con los trazos (JSON,
 * editable en la web y en la app), `imagen` la de su vista previa en PNG (lo que se
 * ve) y `texto` lo escrito dentro (para el buscador). Ver `src/lib/dibujo.ts`.
 */
export const configDibujo = {
  type: "drawing" as const,
  propSchema: {
    escena: { default: "" },
    imagen: { default: "" },
    texto: { default: "" },
    // Como una imagen de Notion (y de BlockNote): leyenda, ancho y alineación.
    caption: { default: "" },
    previewWidth: { default: undefined, type: "number" as const },
    textAlignment: { default: "center" as const, values: ["left", "center", "right"] as const },
  },
  content: "none" as const,
};
