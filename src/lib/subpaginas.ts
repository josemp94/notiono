/**
 * Enlaces a páginas dentro del contenido (los bloques «página» de Notion): un párrafo
 * con SOLO la mención de una página, que es lo que deja `/subpágina`. Lo comparten el
 * servidor (`src/server/subpaginas.ts`, que los mantiene al crear, mover y duplicar) y
 * el editor (menú de los 6 puntos, soltar bloques en el panel lateral).
 */

/** Bloque en el JSON de BlockNote (solo lo que hace falta aquí). */
type Bloque = { id: string; type: string; content?: unknown; children?: Bloque[] };
type Pagina = { id: string; title: string; icon: string | null };

/** Id del enlace que pone el servidor: así sabe cuál quitar si la app pone el suyo. */
export const idEnlace = (pageId: string) => `subpagina-${pageId}`;

type Inline = { type?: string; text?: string; props?: { pageId?: string } };

/** Si el bloque es un enlace a página (párrafo con una sola mención y, como mucho, espacios), el id de la página. */
export function enlaceDe(b: { type: string; content?: unknown }): string | null {
  if (b.type !== "paragraph" || !Array.isArray(b.content)) return null;
  let id: string | null = null;
  for (const c of b.content as Inline[]) {
    if (c.type === "mention" && !id && c.props?.pageId) id = c.props.pageId;
    else if (c.type !== "text" || (c.text ?? "").trim()) return null;
  }
  return id;
}

export const bloqueEnlace = (p: Pagina, id = idEnlace(p.id)) => ({
  id,
  type: "paragraph",
  content: [{ type: "mention", props: { pageId: p.id, title: p.title, icon: p.icon ?? "" } }],
  children: [],
});

/** Dónde va un bloque: el bloque del que cuelga y el de delante (null = el nivel de arriba / el primero). */
export type Sitio = { parentId: string | null; afterId: string | null };
type Enlace = Sitio & { id: string; pageId: string };

/** Todos los enlaces a página de un documento, en orden, con su sitio. */
export function enlaces(bs: Bloque[], padre: string | null = null): Enlace[] {
  return bs.flatMap((b, i) => {
    const pageId = enlaceDe(b);
    return [
      ...(pageId ? [{ id: b.id, pageId, parentId: padre, afterId: bs[i - 1]?.id ?? null }] : []),
      ...enlaces(b.children ?? [], b.id),
    ];
  });
}

/** Los enlaces a una página, con su sitio. */
export const enlacesA = (bs: Bloque[], pageId: string) => enlaces(bs).filter((e) => e.pageId === pageId);

/** ¿Se puede volver a poner un bloque en ese sitio? (siguen su bloque madre y el de delante, en esa madre). */
export function sitioValido(bs: Bloque[], s: Sitio): boolean {
  const busca = (lista: Bloque[], id: string): Bloque | null => {
    for (const b of lista) {
      if (b.id === id) return b;
      const h = busca(b.children ?? [], id);
      if (h) return h;
    }
    return null;
  };
  const grupo = s.parentId ? busca(bs, s.parentId)?.children : bs;
  return !!grupo && (!s.afterId || grupo.some((b) => b.id === s.afterId));
}

/**
 * Lo que hace falta para saber si una subpágina se borró desde su madre: sus enlaces
 * (página → bloque y sitio) y, por bloque, las páginas que menciona.
 */
export type Resumen = { enlaces: Map<string, Enlace>; menciones: Map<string, Set<string>> };

export function resumenEnlaces(bs: Bloque[]): Resumen {
  const r: Resumen = { enlaces: new Map(), menciones: new Map() };
  for (const e of enlaces(bs)) if (!r.enlaces.has(e.pageId)) r.enlaces.set(e.pageId, e);
  const recorre = (lista: Bloque[]) => {
    for (const b of lista) {
      const ids = new Set<string>();
      for (const c of Array.isArray(b.content) ? (b.content as Inline[]) : []) if (c.type === "mention" && c.props?.pageId) ids.add(c.props.pageId);
      if (ids.size) r.menciones.set(b.id, ids);
      recorre(b.children ?? []);
    }
  };
  recorre(bs);
  return r;
}

/**
 * Qué enlaces se quitaron y cuáles se pusieron entre dos estados de un documento.
 * Quitado = no queda ningún enlace a esa página Y su bloque (si sigue) ya no la
 * menciona: convertirlo en título o escribir al lado del chip no es borrarlo.
 * Moverlo, cortarlo y pegarlo, o que lo ponga otra pestaña no cambia nada: solo se
 * mira el estado, no las operaciones.
 */
export function cambiosEnlaces(antes: Resumen, ahora: Resumen) {
  const quitados = [...antes.enlaces.values()].filter(
    (e) => !ahora.enlaces.has(e.pageId) && !ahora.menciones.get(e.id)?.has(e.pageId),
  );
  const puestos = [...ahora.enlaces.keys()].filter((id) => !antes.enlaces.has(id));
  return { quitados, puestos };
}

/** Un arreglo de los enlaces a las hijas de una madre (la reparación y restaurar una versión). */
export type Arreglo =
  | { tipo: "crear"; pageId: string }
  | { tipo: "papelera" | "no-existe" | "doble"; pageId: string; blockId: string; sitio: Sitio };

/**
 * Lo que habría que cambiar en el contenido de una madre para que árbol y enlaces
 * vayan a la par: enlazar las hijas vivas que no tienen enlace (al final), quitar los
 * enlaces a hijas en la papelera y a páginas que ya no existen, y dejar uno solo
 * por hija. No toca menciones dentro de un texto ni enlaces a páginas que no son hijas.
 */
export function arreglosEnlaces(bs: Bloque[], hijas: { id: string; viva: boolean }[], existe: (id: string) => boolean): Arreglo[] {
  const porId = new Map(hijas.map((h) => [h.id, h]));
  const out: Arreglo[] = [];
  const vistas = new Set<string>();
  for (const e of enlaces(bs)) {
    const h = porId.get(e.pageId);
    const sitio = { parentId: e.parentId, afterId: e.afterId };
    if (!h && !existe(e.pageId)) out.push({ tipo: "no-existe", pageId: e.pageId, blockId: e.id, sitio });
    else if (!h) continue;
    else if (!h.viva) out.push({ tipo: "papelera", pageId: e.pageId, blockId: e.id, sitio });
    else if (vistas.has(e.pageId)) out.push({ tipo: "doble", pageId: e.pageId, blockId: e.id, sitio });
    else vistas.add(e.pageId);
  }
  for (const h of hijas) if (h.viva && !vistas.has(h.id)) out.push({ tipo: "crear", pageId: h.id });
  return out;
}

/** Detrás de qué bloque va un enlace «al final»: antes del párrafo vacío en el que acaba el editor. */
export function ultimoBloque(bs: Bloque[]): string | null {
  let i = bs.length - 1;
  const b = bs[i];
  const vacio = !b?.content || (Array.isArray(b.content) && b.content.length === 0);
  if (b && b.type === "paragraph" && !(b.children?.length) && vacio) i--;
  return i >= 0 ? bs[i].id : null;
}

/** Soltar bloques del editor en una página del panel lateral: lo escucha el editor dueño de los bloques. */
export const MOVER_BLOQUES_EVENT = "notiono:mover-bloques";

/** Los bloques que se están arrastrando con el tirador ahora mismo (lo apunta el editor al empezar). */
export const arrastreDeBloques: { ids: string[] | null } = { ids: null };

/** Ids de los bloques de primer nivel que lleva un arrastre del tirador (su `blocknote/html`). */
export function idsArrastrados(html: string): string[] {
  const raiz = new DOMParser().parseFromString(html, "text/html").body;
  return [...raiz.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]')]
    .filter((el) => !el.parentElement?.closest('[data-node-type="blockContainer"]'))
    .map((el) => el.dataset.id!);
}
