"use client";

/**
 * Crear columnas arrastrando, como en Notion: soltar un bloque (drag del
 * tirador) en la franja lateral de otro bloque de primer nivel los pone lado a
 * lado en un columnList; en la franja de un columnList, añade una columna.
 *
 * Contenido a propósito: solo intercepta cuando el drop cae CLARAMENTE en la
 * franja (48px del borde) y el arrastre lleva "blocknote/html" con un data-id
 * conocido. En cualquier otro caso no toca el evento y BlockNote hace lo de
 * siempre, así un fallo aquí nunca puede corromper el documento.
 * ponytail: si se arrastran varios bloques a la vez, solo viaja el primero
 * (los demás se quedan donde estaban, sin perderse).
 */

type BloqueDoc = { id: string; type: string; children?: BloqueDoc[]; [k: string]: unknown };
type EditorLike = {
  getBlock: (id: string) => BloqueDoc | undefined;
  document: BloqueDoc[];
  removeBlocks: (ids: string[]) => void;
  replaceBlocks: (ids: string[], blocks: unknown[]) => void;
  insertBlocks: (blocks: unknown[], refId: string, pos: "before" | "after") => void;
};

const FRANJA = 48; // px desde el borde que cuentan como «al lado»

const contiene = (b: BloqueDoc, id: string): boolean =>
  (b.children ?? []).some((c) => c.id === id || contiene(c, id));

/** Copia sin ids: reinsertar un bloque con su id original mientras se
 * reemplaza a sí mismo confunde a BlockNote (id duplicado a media operación). */
const sinIds = (b: BloqueDoc): Omit<BloqueDoc, "id"> => {
  const { id: _id, children, ...resto } = b;
  return { ...resto, children: (children ?? []).map(sinIds) as BloqueDoc[] };
};

/** Columnas vacías fuera; un columnList que se queda con una sola, se desenvuelve. */
function limpiarColumnas(editor: EditorLike) {
  for (const b of [...editor.document]) {
    if (b.type !== "columnList") continue;
    const vivas = (b.children ?? []).filter((c) => c.children?.length);
    if (vivas.length === (b.children ?? []).length && vivas.length > 1) continue;
    if (vivas.length >= 2) editor.replaceBlocks([b.id], [{ ...b, children: vivas }]);
    else editor.replaceBlocks([b.id], vivas.flatMap((c) => c.children ?? []));
  }
}

/**
 * La reestructuración en sí, separada del DOM para poder probarla con un
 * editor falso en scripts/check.ts. Devuelve si llegó a tocar el documento.
 */
export function aplicarDrop(editor: EditorLike, draggedId: string, targetId: string, lado: "izq" | "der"): boolean {
  if (draggedId === targetId) return false;
  const dragged = editor.getBlock(draggedId);
  const target = editor.getBlock(targetId);
  if (!dragged || !target) return false;
  // Ni meter un bloque dentro de sí mismo ni al revés.
  if (contiene(dragged, targetId) || contiene(target, draggedId)) return false;
  try {
    editor.removeBlocks([draggedId]);
    const t = editor.getBlock(targetId); // fresco: quitar el arrastrado pudo tocarlo
    if (!t) return false;
    const colArrastrada = { type: "column", children: [sinIds(dragged)] };
    if (t.type === "columnList") {
      const hijos = t.children ?? [];
      const borde = lado === "izq" ? hijos[0] : hijos.at(-1);
      if (borde) editor.insertBlocks([colArrastrada], borde.id, lado === "izq" ? "before" : "after");
    } else {
      const colObjetivo = { type: "column", children: [sinIds(t)] };
      editor.replaceBlocks(
        [t.id],
        [{ type: "columnList", children: lado === "izq" ? [colArrastrada, colObjetivo] : [colObjetivo, colArrastrada] }],
      );
    }
    limpiarColumnas(editor);
    return true;
  } catch {
    // Si algo sale mal a mitad, mejor un bloque descolocado que un documento roto.
    return false;
  }
}

export function instalarDropDeColumnas(editor: EditorLike, raiz: HTMLElement): () => void {
  let objetivo: { id: string; lado: "izq" | "der" } | null = null;

  const linea = document.createElement("div");
  linea.style.cssText =
    "position:fixed;width:3px;border-radius:2px;background:var(--color-brand,#ff5c28);z-index:50;pointer-events:none;display:none";
  document.body.appendChild(linea);
  const esconder = () => {
    linea.style.display = "none";
    objetivo = null;
  };

  /** Bloque de PRIMER nivel bajo el puntero (el .bn-block-outer más alto). */
  const bloqueDe = (x: number, y: number): HTMLElement | null => {
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    let top: HTMLElement | null = null;
    while (el && el !== raiz) {
      if (el.classList?.contains("bn-block-outer")) top = el;
      el = el.parentElement;
    }
    return el === raiz ? top : null;
  };

  const over = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("blocknote/html")) return;
    const outer = bloqueDe(e.clientX, e.clientY);
    const id = outer?.getAttribute("data-id");
    if (!outer || !id) return esconder();
    const r = outer.getBoundingClientRect();
    const lado = e.clientX >= r.right - FRANJA ? "der" : e.clientX <= r.left + FRANJA ? "izq" : null;
    if (!lado) return esconder();
    objetivo = { id, lado };
    linea.style.display = "block";
    linea.style.top = `${r.top}px`;
    linea.style.height = `${r.height}px`;
    linea.style.left = `${lado === "der" ? r.right + 2 : r.left - 5}px`;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const drop = (e: DragEvent) => {
    const obj = objetivo;
    esconder();
    if (!obj) return;
    const m = (e.dataTransfer?.getData("blocknote/html") ?? "").match(/data-id="([^"]+)"/);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    aplicarDrop(editor, m[1], obj.id, obj.lado);
  };

  const fuera = (e: DragEvent) => {
    if (!raiz.contains(e.target as Node)) esconder();
  };

  raiz.addEventListener("dragover", over, true);
  raiz.addEventListener("drop", drop, true);
  window.addEventListener("dragend", esconder);
  document.addEventListener("dragover", fuera);
  return () => {
    raiz.removeEventListener("dragover", over, true);
    raiz.removeEventListener("drop", drop, true);
    window.removeEventListener("dragend", esconder);
    document.removeEventListener("dragover", fuera);
    linea.remove();
  };
}
