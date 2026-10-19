/**
 * Bloques de una página ↔ su documento compartido (Yjs), para la app nativa.
 *
 * La app no manda el documento entero: manda OPERACIONES POR BLOQUE (insertar o
 * actualizar un bloque, borrarlo, moverlo). Aquí se aplican dentro del documento Yjs
 * con el cambio mínimo, para no pisar lo que otra persona escribe a la vez en otros
 * bloques: el contenido de un bloque se actualiza con `updateYFragment` (el diff de
 * y-prosemirror) sobre SU nodo, sin tocar el resto.
 *
 * Dos reglas que, si se rompen, destruyen contenido:
 *
 *  1. **Leer siempre sobre una copia.** y-prosemirror BORRA del documento los nodos
 *     que no puede convertir con el esquema dado. Sobre el documento vivo eso llegaría
 *     a todos los navegadores conectados.
 *  2. **Conservar lo que la app no ve.** Los comentarios en línea son una marca del
 *     texto que el JSON de bloques no lleva; al reescribir un bloque se vuelven a poner
 *     sobre el texto que no cambió (si no, el diff los quitaría).
 *
 * Este módulo lo cargan tanto Next (sin servidor de colaboración: sobre los bytes de
 * `Page.ydoc`) como el servidor de colaboración (`collab/hocuspocus.ts`, sobre el
 * documento vivo). Todo lo de Yjs/BlockNote se carga con import() para que cada uno
 * use SU copia de yjs: mezclar dos copias rompe las comprobaciones de tipo de Yjs.
 */
import type * as YT from "yjs";
import type { Mark, Node as PMNode, Schema } from "prosemirror-model";
import { editorServidor } from "./esquema";

/** Bloque en el JSON de BlockNote (el mismo que guarda `Page.content`). */
export type BloqueBN = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BloqueBN[];
};

/**
 * Operación de la app sobre un bloque.
 * - `upsert`: si el bloque existe, se le cambia tipo/props/contenido (sus hijos se
 *   quedan). Si no existe, se inserta en (`parentId`, detrás de `afterId`; null =
 *   el primero), con los hijos que traiga. Repetirla no duplica nada.
 * - `delete`: lo quita con sus hijos (si ya no está, no pasa nada).
 * - `move`: lo lleva, con sus hijos, a (`parentId`, detrás de `afterId`).
 */
export type OpBloque =
  | { op: "upsert"; block: BloqueBN; parentId?: string | null; afterId?: string | null }
  | { op: "delete"; id: string }
  | { op: "move"; id: string; parentId?: string | null; afterId?: string | null }
  /** Pone título e icono a todas las menciones de una página (al renombrarla). Solo
   *  toca esos atributos: lo que se esté escribiendo alrededor no se pisa. No es de la app. */
  | { op: "mencion"; pageId: string; title: string; icon: string };

/** Nombre del fragmento donde BlockNote guarda el documento (ver useCollaboration). */
export const FRAGMENTO = "document-store";

type Libs = {
  Y: typeof import("yjs");
  yPm: typeof import("y-prosemirror");
  core: typeof import("@blocknote/core");
};
let libs: Promise<Libs> | null = null;

/** yjs, y-prosemirror y BlockNote, siempre por import() (ver arriba). */
export function cargarLibs(): Promise<Libs> {
  libs ??= (async () => ({
    Y: await import("yjs"),
    yPm: await import("y-prosemirror"),
    core: await import("@blocknote/core"),
  }))();
  return libs;
}

// ---------- lectura ----------

/** Bloques de un estado Yjs codificado (los bytes de `Page.ydoc`). */
export async function bloquesDeEstado(estado: Uint8Array): Promise<BloqueBN[]> {
  const { Y } = await cargarLibs();
  const copia = new Y.Doc();
  Y.applyUpdate(copia, estado);
  return bloquesDeCopia(copia);
}

/** Bloques de un documento vivo: se convierte una COPIA, nunca el documento en sí. */
export async function bloquesDeDoc(doc: YT.Doc): Promise<BloqueBN[]> {
  const { Y } = await cargarLibs();
  return bloquesDeEstado(Y.encodeStateAsUpdate(doc));
}

async function bloquesDeCopia(copia: YT.Doc): Promise<BloqueBN[]> {
  const editor = await editorServidor();
  const { core, yPm } = await cargarLibs();
  const pm = yPm.yXmlFragmentToProseMirrorRootNode(copia.getXmlFragment(FRAGMENTO), editor.pmSchema);
  return core.docToBlocks(pm) as unknown as BloqueBN[];
}

/** ¿El documento compartido está vacío? (reservado por `ensureYdoc` y aún sin estrenar). */
export function docVacio(doc: YT.Doc): boolean {
  return doc.getXmlFragment(FRAGMENTO).length === 0;
}

// ---------- escritura ----------

type Sitio = { cont: YT.XmlElement; grupo: YT.XmlElement; indice: number };

/** Busca el blockContainer de un bloque por id en todo el árbol. */
function buscar(Y: Libs["Y"], grupo: YT.XmlElement, id: string): Sitio | null {
  const hijos = grupo.toArray();
  for (let i = 0; i < hijos.length; i++) {
    const cont = hijos[i];
    if (!(cont instanceof Y.XmlElement) || cont.nodeName !== "blockContainer") continue;
    if (cont.getAttribute("id") === id) return { cont, grupo, indice: i };
    const sub = subgrupo(Y, cont);
    if (sub) {
      const hit = buscar(Y, sub, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** El blockGroup de los hijos de un bloque (o null si no tiene). */
function subgrupo(Y: Libs["Y"], cont: YT.XmlElement): YT.XmlElement | null {
  for (const n of cont.toArray()) if (n instanceof Y.XmlElement && n.nodeName === "blockGroup") return n;
  return null;
}

/** El grupo raíz del documento (lo crea si el documento está vacío). */
function raiz(Y: Libs["Y"], doc: YT.Doc): YT.XmlElement {
  const frag = doc.getXmlFragment(FRAGMENTO);
  const primero = frag.get(0);
  if (primero instanceof Y.XmlElement && primero.nodeName === "blockGroup") return primero;
  const grupo = new Y.XmlElement("blockGroup");
  frag.insert(0, [grupo]);
  return grupo;
}

/** Dónde va un bloque: grupo del padre (creándolo si hace falta) e índice tras `afterId`. */
function destino(
  Y: Libs["Y"],
  doc: YT.Doc,
  parentId: string | null | undefined,
  afterId: string | null | undefined,
): { grupo: YT.XmlElement; indice: number } {
  const r = raiz(Y, doc);
  let grupo = r;
  if (parentId) {
    const padre = buscar(Y, r, parentId);
    if (padre) {
      grupo = subgrupo(Y, padre.cont) ?? (() => {
        const g = new Y.XmlElement("blockGroup");
        padre.cont.push([g]);
        return g;
      })();
    }
  }
  if (!afterId) return { grupo, indice: 0 };
  const hijos = grupo.toArray();
  const i = hijos.findIndex((c) => c instanceof Y.XmlElement && c.getAttribute("id") === afterId);
  // El de delante ya no está (lo borró otro): al final, antes que perder el bloque.
  return { grupo, indice: i === -1 ? hijos.length : i + 1 };
}

const metaVacio = () => ({ mapping: new Map(), isOMark: new Map() });

/**
 * Aplica las operaciones de la app al documento compartido, en una sola transacción.
 * `semilla`: si el documento está vacío (nadie lo ha estrenado aún), se estrena antes
 * con estos bloques (el `Page.content` de la página); si no, se ignora.
 */
export async function aplicarOpsDoc(
  doc: YT.Doc,
  ops: OpBloque[],
  semilla?: BloqueBN[],
  /** Origen de la transacción (Hocuspocus lo usa para sus avisos de cambio). */
  origen?: unknown,
): Promise<void> {
  const L = await cargarLibs();
  const editor = await editorServidor();
  const schema = editor.pmSchema;
  // Lo que había antes, como ProseMirror (sobre una copia): de ahí salen las marcas
  // que la app no ve (comentarios) para volver a ponerlas.
  const copia = new L.Y.Doc();
  L.Y.applyUpdate(copia, L.Y.encodeStateAsUpdate(doc));
  const antes = L.yPm.yXmlFragmentToProseMirrorRootNode(copia.getXmlFragment(FRAGMENTO), schema);

  doc.transact(() => {
    if (docVacio(doc) && semilla?.length) {
      const pmSemilla = semilla.map((b) => L.core.blockToNode(b as never, schema));
      const r = raiz(L.Y, doc);
      for (const [i, n] of pmSemilla.entries()) {
        const el = new L.Y.XmlElement("blockContainer");
        r.insert(i, [el]);
        L.yPm.updateYFragment(doc, el, n, metaVacio());
      }
    }
    for (const op of ops) {
      if (op.op === "mencion") {
        renombraMenciones(L.Y, doc.getXmlFragment(FRAGMENTO), op);
      } else if (op.op === "delete") {
        const s = buscar(L.Y, raiz(L.Y, doc), op.id);
        if (s) s.grupo.delete(s.indice, 1);
      } else if (op.op === "move") {
        const s = buscar(L.Y, raiz(L.Y, doc), op.id);
        if (!s) continue;
        // Yjs no sabe mover: se clona (con TODO lo que lleva, comentarios incluidos)
        // y se borra el original. Moverlo dentro de sí mismo no tiene sentido.
        if (op.parentId && (op.parentId === op.id || buscar(L.Y, subgrupo(L.Y, s.cont) ?? s.cont, op.parentId))) continue;
        const clon = s.cont.clone();
        s.grupo.delete(s.indice, 1);
        const d = destino(L.Y, doc, op.parentId, op.afterId);
        d.grupo.insert(d.indice, [clon]);
      } else {
        const nuevo = L.core.blockToNode(op.block as never, schema);
        const s = buscar(L.Y, raiz(L.Y, doc), op.block.id);
        if (!s) {
          const d = destino(L.Y, doc, op.parentId, op.afterId);
          const el = new L.Y.XmlElement("blockContainer");
          d.grupo.insert(d.indice, [el]);
          L.yPm.updateYFragment(doc, el, nuevo, metaVacio());
          continue;
        }
        // Existe: se cambia SU contenido; los hijos (segundo nodo) no se tocan.
        const contenidoNuevo = conMarcasDeAntes(nuevo.child(0), contenidoAnterior(antes, op.block.id), schema);
        const actual = s.cont.get(0);
        if (actual instanceof L.Y.XmlElement && actual.nodeName === contenidoNuevo.type.name) {
          L.yPm.updateYFragment(doc, actual, contenidoNuevo, metaVacio());
        } else {
          // Cambió el tipo (párrafo → título): otro nodo en el mismo sitio.
          if (actual) s.cont.delete(0, 1);
          const el = new L.Y.XmlElement(contenidoNuevo.type.name);
          s.cont.insert(0, [el]);
          L.yPm.updateYFragment(doc, el, contenidoNuevo, metaVacio());
        }
      }
    }
  }, origen);
}

/** Las menciones de la página, dentro de cualquier bloque (y-prosemirror guarda cada chip como un elemento con sus props de atributos). */
function renombraMenciones(
  Y: Libs["Y"],
  nodo: YT.XmlElement | YT.XmlFragment,
  op: { pageId: string; title: string; icon: string },
) {
  for (const n of nodo.toArray()) {
    if (!(n instanceof Y.XmlElement)) continue;
    if (n.nodeName === "mention" && n.getAttribute("pageId") === op.pageId) {
      if (n.getAttribute("title") !== op.title) n.setAttribute("title", op.title);
      if ((n.getAttribute("icon") ?? "") !== op.icon) n.setAttribute("icon", op.icon);
    } else renombraMenciones(Y, n, op);
  }
}

/** Lo mismo sobre el JSON de bloques. */
function renombraMencionesJson(v: unknown, op: { pageId: string; title: string; icon: string }): void {
  if (Array.isArray(v)) return v.forEach((x) => renombraMencionesJson(x, op));
  if (!v || typeof v !== "object") return;
  const o = v as { type?: string; props?: Record<string, unknown> };
  if (o.type === "mention" && o.props?.pageId === op.pageId) {
    o.props.title = op.title;
    o.props.icon = op.icon;
    return;
  }
  for (const x of Object.values(o)) renombraMencionesJson(x, op);
}

/** Nodo de contenido (el primer hijo del blockContainer) de un bloque, en el documento de antes. */
function contenidoAnterior(doc: PMNode, id: string): PMNode | null {
  let hit: PMNode | null = null;
  doc.descendants((n) => {
    if (hit) return false;
    if (n.type.name === "blockContainer" && n.attrs.id === id) {
      hit = n.firstChild;
      return false;
    }
    return true;
  });
  return hit;
}

// ---------- marcas que la app no ve ----------

/** Marcas que el JSON de bloques no lleva (comentarios en línea) y hay que conservar. */
const esMarcaOculta = (m: Mark) => !!(m.type.spec as { blocknoteIgnore?: boolean }).blocknoteIgnore;

/** Texto de un bloque de texto con cada átomo (mención) como un carácter. */
function lineal(tb: PMNode): string {
  let s = "";
  tb.forEach((n) => (s += n.isText ? n.text! : "￼"));
  return s;
}

/** Tramos [desde, hasta) con cada marca oculta del bloque de texto. */
function tramosOcultos(tb: PMNode): { desde: number; hasta: number; marca: Mark }[] {
  const out: { desde: number; hasta: number; marca: Mark }[] = [];
  let x = 0;
  tb.forEach((n) => {
    const largo = n.isText ? n.text!.length : 1;
    for (const m of n.marks.filter(esMarcaOculta)) out.push({ desde: x, hasta: x + largo, marca: m });
    x += largo;
  });
  return out;
}

/**
 * Para cada carácter del texto viejo, su posición en el nuevo (o -1 si se borró),
 * con la subsecuencia común más larga: así un comentario sigue pegado a su texto
 * aunque en el bloque se escriba delante, detrás o en medio, en varios sitios a la vez.
 */
export function casaCaracteres(viejo: string, nuevo: string): Int32Array {
  const n = viejo.length;
  const m = nuevo.length;
  const destino = new Int32Array(n).fill(-1);
  // Lo común por delante y por detrás no entra en la tabla (casi siempre es casi todo).
  let p = 0;
  while (p < n && p < m && viejo[p] === nuevo[p]) destino[p] = p++;
  let s = 0;
  while (s < n - p && s < m - p && viejo[n - 1 - s] === nuevo[m - 1 - s]) {
    destino[n - 1 - s] = m - 1 - s;
    s++;
  }
  const a = viejo.slice(p, n - s);
  const b = nuevo.slice(p, m - s);
  // ponytail: LCS cuadrática; un bloque de texto es corto. Si el cambio del medio es
  // enorme, ese trozo se da por reescrito (los comentarios de dentro se pierden).
  if (!a.length || !b.length || a.length * b.length > 4_000_000) return destino;
  const w = b.length + 1;
  const t = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) destino[p + i++] = p + j++;
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
    else j++;
  }
  return destino;
}

/** Un tramo [desde, hasta) del texto viejo en el nuevo: lo que abarcan sus caracteres supervivientes. */
export function mapeaTramo(casados: Int32Array, desde: number, hasta: number): [number, number] | null {
  let min = Infinity;
  let max = -1;
  for (let x = desde; x < hasta; x++) {
    const d = casados[x];
    if (d >= 0) {
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
  }
  return max >= 0 ? [min, max + 1] : null;
}

/** Copia del bloque de texto con las marcas añadidas en sus tramos. */
function marcaTramos(tb: PMNode, tramos: { desde: number; hasta: number; marca: Mark }[], schema: Schema): PMNode {
  if (!tramos.length) return tb;
  const cortes = new Set<number>();
  for (const t of tramos) cortes.add(t.desde).add(t.hasta);
  const hijos: PMNode[] = [];
  let x = 0;
  tb.forEach((n) => {
    const largo = n.isText ? n.text!.length : 1;
    const puntos = [x, ...[...cortes].filter((c) => c > x && c < x + largo).sort((a, b) => a - b), x + largo];
    for (let i = 0; i < puntos.length - 1; i++) {
      const [a, b] = [puntos[i], puntos[i + 1]];
      let marcas = n.marks;
      for (const t of tramos) if (t.desde <= a && t.hasta >= b) marcas = t.marca.addToSet(marcas);
      hijos.push(n.isText ? schema.text(n.text!.slice(a - x, b - x), marcas) : n.mark(marcas));
    }
    x += largo;
  });
  return tb.type.create(tb.attrs, hijos, tb.marks);
}

/** Todos los bloques de texto (párrafos, celdas…) dentro de un nodo, en orden. */
function textblocks(n: PMNode): PMNode[] {
  if (n.isTextblock) return [n];
  const out: PMNode[] = [];
  n.forEach((c) => out.push(...textblocks(c)));
  return out;
}

/** Reconstruye el nodo cambiando sus bloques de texto (en orden) por los dados. */
function sustituyeTextblocks(n: PMNode, nuevos: PMNode[]): PMNode {
  if (n.isTextblock) return nuevos.shift() ?? n;
  const hijos: PMNode[] = [];
  n.forEach((c) => hijos.push(sustituyeTextblocks(c, nuevos)));
  return n.type.create(n.attrs, hijos, n.marks);
}

/**
 * El contenido nuevo de un bloque, con las marcas ocultas (comentarios) que tenía el
 * viejo sobre el texto que no ha cambiado. Los bloques de texto se emparejan por orden
 * (una tabla tiene uno por celda); si no casan en número, no se arriesga nada.
 */
export function conMarcasDeAntes(nuevo: PMNode, viejo: PMNode | null, schema: Schema): PMNode {
  if (!viejo) return nuevo;
  const tv = textblocks(viejo);
  const tn = textblocks(nuevo);
  if (tv.length !== tn.length || !tv.some((t) => tramosOcultos(t).length)) return nuevo;
  const rehechos = tn.map((t, i) => {
    const casados = casaCaracteres(lineal(tv[i]), lineal(t));
    const tramos = tramosOcultos(tv[i]).flatMap((tr) => {
      const m = mapeaTramo(casados, tr.desde, tr.hasta);
      return m ? [{ desde: m[0], hasta: m[1], marca: tr.marca }] : [];
    });
    return marcaTramos(t, tramos, schema);
  });
  return sustituyeTextblocks(nuevo, rehechos);
}

// ---------- sin documento compartido (cuerpos de fila, páginas sin estrenar) ----------

/**
 * Las mismas operaciones sobre el JSON de bloques, para lo que no tiene Yjs: el cuerpo
 * de las filas (`Record.content`) y las páginas que nadie ha abierto aún en modo
 * colaborativo. Devuelve una copia; no toca la entrada.
 */
export function aplicarOpsJson(bloques: BloqueBN[], ops: OpBloque[]): BloqueBN[] {
  const doc: BloqueBN[] = structuredClone(bloques);
  type Hit = { lista: BloqueBN[]; i: number; b: BloqueBN };
  const busca = (lista: BloqueBN[], id: string): Hit | null => {
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return { lista, i, b: lista[i] };
      const h = busca(lista[i].children ?? [], id);
      if (h) return h;
    }
    return null;
  };
  const coloca = (b: BloqueBN, parentId?: string | null, afterId?: string | null) => {
    const padre = parentId ? busca(doc, parentId) : null;
    const lista = padre ? (padre.b.children ??= []) : doc;
    const i = afterId ? lista.findIndex((x) => x.id === afterId) : -1;
    lista.splice(!afterId ? 0 : i === -1 ? lista.length : i + 1, 0, b);
  };
  for (const op of ops) {
    if (op.op === "mencion") {
      renombraMencionesJson(doc, op);
    } else if (op.op === "delete") {
      const h = busca(doc, op.id);
      if (h) h.lista.splice(h.i, 1);
    } else if (op.op === "move") {
      const h = busca(doc, op.id);
      if (!h || (op.parentId && (op.parentId === op.id || busca(h.b.children ?? [], op.parentId)))) continue;
      h.lista.splice(h.i, 1);
      coloca(h.b, op.parentId, op.afterId);
    } else {
      const h = busca(doc, op.block.id);
      if (h) {
        const { children: _ignorados, ...resto } = structuredClone(op.block);
        h.lista[h.i] = { ...resto, children: h.b.children ?? [] };
      } else {
        coloca(structuredClone({ children: [], ...op.block }), op.parentId, op.afterId);
      }
    }
  }
  return doc;
}
