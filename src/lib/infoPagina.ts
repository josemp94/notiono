/**
 * «Información de la página» (al pie del menú ⋯, como el recuento de palabras de Notion):
 * palabras, caracteres, casillas hechas/total, imágenes y adjuntos. Función pura sobre los
 * bloques de BlockNote; la usa el servidor (`app.info`) para la web y la app por igual, y se
 * comprueba en scripts/check.ts.
 */
type Inline = { type?: string; text?: string; content?: unknown; props?: Record<string, unknown> };
type Bloque = { type?: string; props?: Record<string, unknown>; content?: unknown; children?: unknown };

export type InfoPagina = { palabras: number; caracteres: number; casillas: number; hechas: number; imagenes: number; adjuntos: number };

function textoInline(c: unknown): string {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) {
    // Tabla: { rows: [{ cells: [inline[] | { content }] }] }
    const rows = (c as { rows?: { cells?: unknown[] }[] } | null)?.rows;
    return rows ? rows.flatMap((r) => (r.cells ?? []).map((x) => textoInline(Array.isArray(x) ? x : (x as { content?: unknown })?.content))).join(" ") : "";
  }
  return (c as Inline[])
    .map((n) =>
      n.type === "link" ? textoInline(n.content)
      : n.type === "mention" ? String(n.props?.title ?? "")
      : n.type === "personMention" ? String(n.props?.name ?? "")
      : n.text ?? "",
    )
    .join("");
}

export function infoPagina(bloques: unknown): InfoPagina {
  const info: InfoPagina = { palabras: 0, caracteres: 0, casillas: 0, hechas: 0, imagenes: 0, adjuntos: 0 };
  const lineas: string[] = [];
  const mira = (bs: unknown) => {
    if (!Array.isArray(bs)) return;
    for (const b of bs as Bloque[]) {
      if (b?.type === "checkListItem") {
        info.casillas++;
        if (b.props?.checked) info.hechas++;
      }
      if (b?.type === "image" || (b?.type === "drawing" && b.props?.imagen)) info.imagenes++;
      if (b?.type === "file" || b?.type === "audio" || b?.type === "video") info.adjuntos++;
      const t = b?.type === "drawing" ? String(b.props?.texto ?? "") : textoInline(b?.content);
      if (t) lineas.push(t);
      mira(b?.children);
    }
  };
  mira(bloques);
  const todo = lineas.join("\n");
  info.palabras = (todo.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
  // Caracteres con espacios (como Notion), sin contar los saltos entre bloques.
  info.caracteres = [...lineas.join("")].length;
  return info;
}

/**
 * El pie del menú ⋯, como el de Notion: «Recuento de palabras: N», «Última edición por
 * …» y cuándo («Hoy a las 10:51»). Lo demás que sabe Notiono (caracteres, casillas,
 * imágenes y adjuntos, cuándo se creó) va en `extra`, plegado tras «Más información».
 * Fechas en hora de Madrid. La app hace lo mismo (InfoPagina.kt) con las mismas pruebas.
 */
export function pieInfo(
  i: InfoPagina & { creada: Date | string; editada: Date | string; creadaPor?: string | null; editadaPor?: string | null },
  ahora = new Date(),
): { principal: string[]; extra: string[] } {
  const n = (x: number, uno: string, varios: string) => `${x.toLocaleString("es-ES")} ${x === 1 ? uno : varios}`;
  return {
    principal: [
      `Recuento de palabras: ${i.palabras.toLocaleString("es-ES")}`,
      i.editadaPor ? `Última edición por ${i.editadaPor}` : "Última edición",
      cuandoInfo(i.editada, ahora),
    ],
    extra: [
      n(i.caracteres, "carácter", "caracteres"),
      i.casillas ? `Casillas: ${i.hechas} de ${i.casillas} hechas` : null,
      i.imagenes || i.adjuntos ? [i.imagenes ? n(i.imagenes, "imagen", "imágenes") : null, i.adjuntos ? n(i.adjuntos, "adjunto", "adjuntos") : null].filter(Boolean).join(" · ") : null,
      `Creada ${/^(Hoy|Ayer)/.test(cuandoInfo(i.creada, ahora)) ? cuandoInfo(i.creada, ahora).replace(/^./, (c) => c.toLowerCase()) : `el ${cuandoInfo(i.creada, ahora)}`}${i.creadaPor ? ` por ${i.creadaPor}` : ""}`,
    ].filter((x): x is string => !!x),
  };
}

/** «Hoy a las 10:51», «Ayer a las 9:05» o «29 oct 2026, 10:51» (hora de Madrid). */
export function cuandoInfo(d: Date | string, ahora = new Date()): string {
  const f = new Date(d);
  const dia = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(x);
  const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(f);
  if (dia(f) === dia(ahora)) return `Hoy a las ${hora}`;
  if (dia(f) === dia(new Date(ahora.getTime() - 864e5))) return `Ayer a las ${hora}`;
  const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", year: "numeric" }).format(f).replace(/\./g, "");
  return `${fecha}, ${hora}`;
}
