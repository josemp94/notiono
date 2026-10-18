/**
 * Esquema del editor en el servidor: el espejo SIN React del de `mention.tsx`.
 *
 * Los bloques propios del navegador son componentes de React y en el servidor no se
 * pueden cargar (ver docs/colaboracion.md), pero para convertir bloques ↔ Yjs solo
 * hace falta su forma (tipo, props y contenido), que vive en `esquemaBloques.ts` y
 * comparten las dos partes. El dibujo de aquí no se usa nunca: el editor es headless.
 *
 * Lleva también la marca `comment` (comentarios en línea): el documento compartido la
 * tiene y un esquema sin ella no podría leerlo.
 */
import type { BlockNoteEditor } from "@blocknote/core";
import {
  configBaseDatos,
  configColumna,
  configEcuacion,
  configIndice,
  configListaColumnas,
  configLlamada,
  configMarcador,
  configMencion,
  configMencionFecha,
  configMencionPersona,
  LENGUAJE_CODIGO,
} from "../../components/editor/esquemaBloques"; // relativo: lo empaqueta también el servidor de colaboración

/** Dibujo que no se llega a usar (editor sin vista); lo pide la spec. */
const sinDibujo = () => ({ dom: document.createElement("div") });
const sinDibujoConTexto = () => {
  const dom = document.createElement("div");
  return { dom, contentDOM: dom };
};
const chip = () => ({ dom: document.createElement("span") });

let cargando: Promise<BlockNoteEditor> | null = null;

/**
 * Editor headless con el esquema del servidor (uno por proceso: solo convierte).
 *
 * BlockNote se carga con import() y no arriba del todo: su build CommonJS no arranca
 * en Node (la de ESM sí), y este módulo lo cargan Next, el servidor de colaboración
 * y `npm run check`, que no lo resuelven igual. import() siempre va a la de ESM.
 */
export function editorServidor(): Promise<BlockNoteEditor> {
  cargando ??= (async () => {
    const core = await import("@blocknote/core");
    const { CommentMark } = await import("@blocknote/core/comments");
    const schema = core.BlockNoteSchema.create({
      blockSpecs: {
        ...core.defaultBlockSpecs,
        codeBlock: core.createCodeBlockSpec({ defaultLanguage: LENGUAJE_CODIGO }),
        database: core.createBlockSpec(configBaseDatos, { render: sinDibujo })(),
        callout: core.createBlockSpec(configLlamada, { render: sinDibujoConTexto })(),
        equation: core.createBlockSpec(configEcuacion, { render: sinDibujo })(),
        toc: core.createBlockSpec(configIndice, { render: sinDibujo })(),
        bookmark: core.createBlockSpec(configMarcador, { render: sinDibujo })(),
        columnList: core.createBlockSpec(configListaColumnas, { render: sinDibujo })(),
        column: core.createBlockSpec(configColumna, { render: sinDibujo })(),
      },
      inlineContentSpecs: {
        ...core.defaultInlineContentSpecs,
        mention: core.createInlineContentSpec(configMencion, { render: chip }),
        personMention: core.createInlineContentSpec(configMencionPersona, { render: chip }),
        dateMention: core.createInlineContentSpec(configMencionFecha, { render: chip }),
      },
    });
    return core.BlockNoteEditor.create({
      schema,
      _tiptapOptions: { extensions: [CommentMark] },
    }) as unknown as BlockNoteEditor;
  })();
  return cargando;
}
