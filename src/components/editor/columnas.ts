/**
 * La lógica de las columnas que vive en ProseMirror, sin React (se prueba en
 * scripts/check.ts con un esquema mínimo que imita al de BlockNote).
 *
 * Estructura en el documento: un `columnList` y cada `column` son bloques
 * normales de BlockNote sin contenido propio; lo que se ve son sus HIJOS:
 *
 *   blockContainer > [columnList, blockGroup > blockContainer > [column, blockGroup > bloques…]]
 *
 * Tres piezas:
 * - `decorarAnchos`: el ancho de cada columna (prop `ancho`, un factor de
 *   flex-grow) va al `.bn-block-outer` de la columna como DECORACIÓN. Nunca se
 *   escribe a mano en ese DOM: es de ProseMirror, y tocarlo hace que lo vuelva a
 *   leer y a pintar → el efecto lo reescribía → bucle infinito y pestaña
 *   congelada (el fallo de octubre de 2026).
 * - `normalizarColumnas`: tras cada cambio local deja la estructura sana
 *   (columnas solo dentro de un columnList, sin columnas vacías, sin columnList
 *   de una sola columna), pase lo que pase con arrastres, pegados o atajos.
 * - `teclasColumnas`: Retroceso, Intro y Mayús+Tab dentro de una columna. Los
 *   de BlockNote tratan a los hijos de una columna como bloques indentados y los
 *   «desindentan», sacándolos de la columna.
 */
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const tipoDe = (n: PMNode | null | undefined) =>
  n?.type.name === "blockContainer" ? n.firstChild?.type.name : undefined;
export const esColumna = (n: PMNode | null | undefined) => tipoDe(n) === "column";
export const esListaColumnas = (n: PMNode | null | undefined) => tipoDe(n) === "columnList";
/** Los hijos de un bloque (su blockGroup), o ninguno. */
const hijosDe = (n: PMNode): PMNode | null => (n.lastChild?.type.name === "blockGroup" ? n.lastChild : null);

export const anchoDe = (columna: PMNode) => Number(columna.firstChild?.attrs.ancho) || 1;

/** Un flex-grow por columna que no tenga el ancho por defecto. */
export function decorarAnchos(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockContainer") return node.type.name === "blockGroup";
    if (esColumna(node)) {
      const ancho = anchoDe(node);
      if (ancho !== 1) decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `flex-grow: ${ancho}` }));
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

// --- Normalización ----------------------------------------------------------

/** Los bloques que quedan al deshacer una columna o un columnList: los de dentro, en orden. */
function contenidoDe(n: PMNode): PMNode[] {
  const grupo = hijosDe(n);
  if (!grupo) return [];
  const out: PMNode[] = [];
  grupo.forEach((h) => {
    if (esColumna(h)) out.push(...contenidoDe(h));
    else out.push(h);
  });
  return out;
}

/** Cambia el bloque en `pos` por `bloques`; si no queda nada y era el único de su
 * grupo, deja un párrafo vacío (un grupo de bloques no puede quedarse sin ninguno). */
function sustituir(tr: Transaction, pos: number, node: PMNode, bloques: PMNode[]) {
  const s = tr.doc.type.schema;
  if (!bloques.length && tr.doc.resolve(pos).parent.childCount === 1) {
    bloques = [s.nodes.blockContainer.create(null, s.nodes.paragraph.create())];
  }
  tr.replaceWith(pos, pos + node.nodeSize, Fragment.fromArray(bloques));
}

/** El primer desperfecto de la estructura, como una función que lo arregla. */
function primerArreglo(doc: PMNode): ((tr: Transaction) => void) | null {
  let arreglo: ((tr: Transaction) => void) | null = null;
  doc.descendants((node, pos) => {
    if (arreglo) return false;
    if (node.type.name !== "blockContainer") return node.type.name === "blockGroup";
    const $pos = doc.resolve(pos);
    const enLista = $pos.depth >= 2 && esListaColumnas($pos.node($pos.depth - 1));
    if (enLista && !esColumna(node)) {
      // Un bloque suelto entre columnas (soltado ahí, o sacado de una): su propia columna.
      arreglo = (tr) => {
        const s = tr.doc.type.schema;
        const col = s.nodes.blockContainer.create(null, [s.nodes.column.create(), s.nodes.blockGroup.create(null, node)]);
        tr.replaceWith(pos, pos + node.nodeSize, col);
      };
    } else if (esColumna(node) && !enLista) {
      // Una columna fuera de su columnList (arrastrada o pegada sola): se queda su contenido.
      arreglo = (tr) => sustituir(tr, pos, node, contenidoDe(node));
    } else if (esColumna(node) && !hijosDe(node)?.childCount) {
      arreglo = (tr) => tr.delete(pos, pos + node.nodeSize);
    } else if (esListaColumnas(node) && (hijosDe(node)?.childCount ?? 0) < 2) {
      // Con una sola columna ya no hay columnas: su contenido pasa a la página.
      arreglo = (tr) => sustituir(tr, pos, node, contenidoDe(node));
    }
    return !arreglo;
  });
  return arreglo;
}

/**
 * Arregla la estructura de las columnas en `tr`. Devuelve si cambió algo.
 * Cada arreglo quita un desperfecto sin crear otros, pero por si acaso hay tope:
 * esto corre dentro de appendTransaction y un bucle aquí congelaría el editor.
 */
export function normalizarColumnas(tr: Transaction): boolean {
  let cambiado = false;
  for (let i = 0; i < 50; i++) {
    const arreglo = primerArreglo(tr.doc);
    if (!arreglo) break;
    arreglo(tr);
    cambiado = true;
  }
  return cambiado;
}

// --- Teclado ------------------------------------------------------------------

type Despacho = ((tr: Transaction) => void) | undefined;

/** El bloque del cursor si es hijo directo de una columna. */
function hijoDeColumna(state: EditorState) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== "blockContainer") continue;
    if (d < 3 || !esColumna($from.node(d - 2))) return null;
    return {
      bloque: $from.node(d),
      pos: $from.before(d),
      indice: $from.index(d - 1),
      grupo: $from.node(d - 1),
      columna: $from.node(d - 2),
      columnaPos: $from.before(d - 2),
    };
  }
  return null;
}

/** El cursor está al principio del texto del bloque, sin nada seleccionado. */
const alPrincipio = (state: EditorState, bloquePos: number) =>
  state.selection.empty && state.selection.from === bloquePos + 2;

const vacio = (bloque: PMNode) => bloque.firstChild!.isTextblock && bloque.firstChild!.content.size === 0;

/** El último bloque de más adentro (el que se ve justo encima del siguiente hermano). */
function ultimoDe(bloque: PMNode, pos: number): { node: PMNode; pos: number } {
  const grupo = hijosDe(bloque);
  if (!grupo || !grupo.childCount) return { node: bloque, pos };
  const ultimo = grupo.lastChild!;
  return ultimoDe(ultimo, pos + bloque.nodeSize - 1 - 1 - ultimo.nodeSize);
}

/**
 * Retroceso al principio de un bloque de una columna. Dentro de la columna hace
 * lo de siempre (unir con el de arriba, borrar la línea vacía…); lo único que
 * cambia es que nunca saca el bloque fuera, que es lo que haría BlockNote.
 */
export function retrocesoEnColumna(state: EditorState, dispatch: Despacho): boolean {
  const h = hijoDeColumna(state);
  if (!h || !alPrincipio(state, h.pos)) return false;
  const contenido = h.bloque.firstChild!;
  // Un título o una lista se convierte antes en párrafo: eso lo hace BlockNote bien.
  if (contenido.type.name !== "paragraph") return false;
  const tr = state.tr;
  const hijos = hijosDe(h.bloque);

  if (h.indice === 0) {
    // Primera línea de la columna: solo hace algo si está vacía.
    if (!vacio(h.bloque) || hijos) return true;
    if (h.grupo.childCount > 1) {
      tr.delete(h.pos, h.pos + h.bloque.nodeSize);
      tr.setSelection(Selection.near(tr.doc.resolve(h.pos), 1));
    } else {
      // Era lo único de la columna: fuera la columna (y, si queda una, el columnList).
      tr.delete(h.columnaPos, h.columnaPos + h.columna.nodeSize);
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(h.columnaPos, tr.doc.content.size)), -1));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  }

  // Hay un bloque encima, dentro de la misma columna.
  const anteriorPos = h.pos - h.grupo.child(h.indice - 1).nodeSize;
  const destino = ultimoDe(h.grupo.child(h.indice - 1), anteriorPos);
  const destinoCont = destino.node.firstChild!;
  const resto = hijos ? hijos.content : Fragment.empty;
  if (vacio(h.bloque)) {
    tr.replaceWith(h.pos, h.pos + h.bloque.nodeSize, resto);
    tr.setSelection(Selection.near(tr.doc.resolve(h.pos), -1));
  } else if (destinoCont.isTextblock) {
    // Unir: el texto al final del de arriba y los hijos, detrás, a la misma altura.
    const union = destino.pos + 1 + destinoCont.nodeSize - 1;
    try {
      tr.insert(union, contenido.content);
    } catch {
      return true; // p. ej. texto con formato hacia un bloque de código: mejor no hacer nada
    }
    const desplazado = h.pos + contenido.content.size;
    tr.replaceWith(desplazado, desplazado + h.bloque.nodeSize, resto);
    tr.setSelection(TextSelection.create(tr.doc, union));
  } else if (NodeSelection.isSelectable(destinoCont)) {
    // Encima hay una imagen, una tabla…: se selecciona, como en el resto de la página.
    tr.setSelection(NodeSelection.create(tr.doc, destino.pos + 1));
  } else {
    return true;
  }
  dispatch?.(tr.scrollIntoView());
  return true;
}

const LISTAS = ["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"];

/**
 * Intro en una línea vacía de una columna: BlockNote la «desindentaría» (fuera
 * de la columna). Aquí una lista vacía pasa a párrafo, como siempre, y el resto
 * simplemente añade otra línea debajo. El bloque de código lleva su propio Intro.
 */
export function introEnColumna(state: EditorState, dispatch: Despacho): boolean {
  const h = hijoDeColumna(state);
  if (!h || !alPrincipio(state, h.pos) || !vacio(h.bloque)) return false;
  const s = state.schema;
  const tr = state.tr;
  const tipo = h.bloque.firstChild!.type.name;
  if (tipo === "codeBlock") return false;
  if (LISTAS.includes(tipo)) {
    tr.setNodeMarkup(h.pos + 1, s.nodes.paragraph);
    dispatch?.(tr);
    return true;
  }
  const fin = h.pos + h.bloque.nodeSize;
  tr.insert(fin, s.nodes.blockContainer.create(null, s.nodes.paragraph.create()));
  tr.setSelection(TextSelection.create(tr.doc, fin + 2));
  dispatch?.(tr.scrollIntoView());
  return true;
}

/** Mayús+Tab en un bloque de primer nivel de una columna: no hay a dónde salir. */
export function desindentarEnColumna(state: EditorState): boolean {
  return !!hijoDeColumna(state);
}

/** Tab justo debajo de unas columnas metería el bloque como una columna más. */
export function indentarTrasColumnas(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== "blockContainer") continue;
    const i = $from.index(d - 1);
    return i > 0 && esListaColumnas($from.node(d - 1).child(i - 1));
  }
  return false;
}
