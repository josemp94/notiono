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

/** Los enlaces a una página, con el bloque del que cuelgan (null = el nivel de arriba). */
export function enlacesA(bs: Bloque[], pageId: string, padre: string | null = null): { id: string; parentId: string | null }[] {
  return bs.flatMap((b) => [
    ...(enlaceDe(b) === pageId ? [{ id: b.id, parentId: padre }] : []),
    ...enlacesA(b.children ?? [], pageId, b.id),
  ]);
}

/** Detrás de qué bloque va un enlace «al final»: antes del párrafo vacío en el que acaba el editor. */
export function ultimoBloque(bs: Bloque[]): string | null {
  let i = bs.length - 1;
  const b = bs[i];
  const vacio = !b?.content || (Array.isArray(b.content) && b.content.length === 0);
  if (b && b.type === "paragraph" && !(b.children?.length) && vacio) i--;
  return i >= 0 ? bs[i].id : null;
}

