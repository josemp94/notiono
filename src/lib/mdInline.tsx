import type { ReactNode } from "react";

/**
 * Texto enriquecido en celdas SIN cambiar el modelo de datos: la celda sigue
 * guardando un string y el formato es markdown inline (**negrita**, *cursiva*,
 * ~~tachado~~, `código`, [enlaces](https://…) y URLs sueltas), que se pinta
 * formateado al mostrar y se edita en crudo. Así filtros, fórmulas, CSV,
 * búsqueda y API siguen viendo el string tal cual.
 *
 * ponytail: sin anidar formatos (ni **a *b* c**); si algún día hace falta,
 * el tokenizador tendría que recurrir sobre el contenido de cada marca.
 */

export type TokenInline =
  | { t: "texto" | "negrita" | "cursiva" | "tachado" | "codigo"; s: string }
  | { t: "enlace"; s: string; href: string };

// Solo enlaces http(s): un [texto](javascript:...) se queda como texto plano.
const PATRON =
  /\*\*([^*]+)\*\*|(?:^|(?<=[^*]))\*([^*\s][^*]*)\*|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;

/** ¿Merece la pena pintar este texto formateado? (marcas emparejadas o URLs) */
export function tieneFormato(s: string): boolean {
  PATRON.lastIndex = 0;
  return PATRON.test(s);
}

export function tokeniza(s: string): TokenInline[] {
  const out: TokenInline[] = [];
  let i = 0;
  PATRON.lastIndex = 0;
  for (let m = PATRON.exec(s); m; m = PATRON.exec(s)) {
    if (m.index > i) out.push({ t: "texto", s: s.slice(i, m.index) });
    if (m[1] !== undefined) out.push({ t: "negrita", s: m[1] });
    else if (m[2] !== undefined) out.push({ t: "cursiva", s: m[2] });
    else if (m[3] !== undefined) out.push({ t: "tachado", s: m[3] });
    else if (m[4] !== undefined) out.push({ t: "codigo", s: m[4] });
    else if (m[5] !== undefined) out.push({ t: "enlace", s: m[5], href: m[6] });
    else out.push({ t: "enlace", s: m[7], href: m[7] });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: "texto", s: s.slice(i) });
  return out;
}

/** Render del markdown inline. Los enlaces no propagan el clic (no deben abrir la edición). */
export function RichText({ texto }: { texto: string }): ReactNode {
  return (
    <>
      {tokeniza(texto).map((tk, i) => {
        switch (tk.t) {
          case "negrita":
            return <strong key={i}>{tk.s}</strong>;
          case "cursiva":
            return <em key={i}>{tk.s}</em>;
          case "tachado":
            return <s key={i}>{tk.s}</s>;
          case "codigo":
            return (
              <code key={i} className="rounded bg-[var(--border)]/40 px-1 font-mono text-[0.85em]">
                {tk.s}
              </code>
            );
          case "enlace":
            return (
              <a
                key={i}
                href={tk.href}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-brand underline decoration-brand/40 hover:decoration-brand"
              >
                {tk.s}
              </a>
            );
          default:
            return <span key={i}>{tk.s}</span>;
        }
      })}
    </>
  );
}
