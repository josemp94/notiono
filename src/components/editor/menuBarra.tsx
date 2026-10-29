"use client";

import { Columns2, Columns3, Lightbulb, Link as LinkIcon, ListTree, PenLine, Sigma } from "lucide-react";
import { abrirAlMontar } from "./drawingBlock";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { emptyColumn } from "./columnBlock";
import type { NotionoEditor } from "./mention";

/**
 * Ítems del menú "/" que no dependen de la página: los comparten el editor de
 * páginas y el cuerpo de la ficha de una fila, para que en los dos se pueda hacer
 * lo mismo (antes la ficha se quedaba con los de serie y sin columnas).
 */

type Vista = { url: string; title: string; description: string; image: string; siteName: string };

export const itemLlamada = (editor: NotionoEditor): DefaultReactSuggestionItem => ({
  title: "Llamada",
  subtext: "Bloque destacado con icono",
  aliases: ["callout", "llamada", "destacado", "aviso", "nota"],
  group: "Bloques básicos",
  icon: <Lightbulb size={18} />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
});

export const itemEnlaceWeb = (
  editor: NotionoEditor,
  vistaPrevia: (url: string) => Promise<Vista>,
): DefaultReactSuggestionItem => ({
  title: "Enlace web",
  subtext: "Tarjeta con la vista previa, o el vídeo incrustado",
  aliases: ["enlace", "link", "bookmark", "marcador", "youtube", "video", "vídeo", "embed"],
  group: "Bloques básicos",
  icon: <LinkIcon size={18} />,
  onItemClick: async () => {
    const url = prompt("Pega la dirección del enlace o del vídeo");
    if (!url?.trim()) return;
    // Si la vista previa falla (sitio caído o que bloquea bots), se inserta igual con la URL.
    const preview = await vistaPrevia(url.trim()).catch(() => ({
      url: url.trim(),
      title: url.trim(),
      description: "",
      image: "",
      siteName: "",
    }));
    insertOrUpdateBlockForSlashMenu(editor, { type: "bookmark", props: preview });
  },
});

export const itemsColumnas = (editor: NotionoEditor): DefaultReactSuggestionItem[] =>
  [2, 3].map((n) => ({
    title: n === 2 ? "Dos columnas" : "Tres columnas",
    subtext: "Reparte el ancho de la página",
    aliases: ["columna", "columnas", "column", "lado", n === 2 ? "dos" : "tres"],
    group: "Bloques básicos",
    icon: n === 2 ? <Columns2 size={18} /> : <Columns3 size={18} />,
    onItemClick: () => {
      const lista = insertOrUpdateBlockForSlashMenu(editor, {
        type: "columnList",
        children: Array.from({ length: n }, emptyColumn),
      });
      // El cursor al primer hueco, para poder escribir sin buscarlo.
      const primero = lista.children?.[0]?.children?.[0];
      if (primero) editor.setTextCursorPosition(primero, "end");
    },
  }));

export const itemEcuacion = (editor: NotionoEditor): DefaultReactSuggestionItem => ({
  title: "Ecuación",
  subtext: "Fórmula matemática en TeX (KaTeX)",
  aliases: ["ecuacion", "ecuación", "formula", "fórmula", "matematicas", "matemáticas", "latex", "katex", "math"],
  group: "Bloques básicos",
  icon: <Sigma size={18} />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "equation" }),
});

export const itemIndice = (editor: NotionoEditor): DefaultReactSuggestionItem => ({
  title: "Tabla de contenidos",
  subtext: "Índice de los encabezados de la página",
  aliases: ["toc", "indice", "índice", "contenidos", "tabla de contenidos"],
  group: "Bloques básicos",
  icon: <ListTree size={18} />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "toc" }),
});

export const itemDibujo = (editor: NotionoEditor): DefaultReactSuggestionItem => ({
  title: "Dibujo",
  // Como las entradas de BlockNote/Notion: corta, y en «Medios», junto a Imagen.
  subtext: "Dibujo a mano redimensionable con leyenda",
  aliases: ["dibujo", "dibujar", "drawing", "draw", "boceto", "pizarra", "mano", "lapiz", "lápiz", "sketch"],
  group: "Medios",
  icon: <PenLine size={18} />,
  onItemClick: () => {
    // React monta el bloque después de insertarlo: para entonces ya está apuntado.
    abrirAlMontar.add(insertOrUpdateBlockForSlashMenu(editor, { type: "drawing" }).id);
  },
});

/**
 * Los ítems del menú «/» con cada grupo junto, en el orden en que sale por primera vez:
 * los nuestros (Llamada, Dibujo…) se meten con los de serie de su grupo. BlockNote pinta
 * un rótulo cada vez que cambia el grupo y le pone su nombre de `key`: un grupo partido
 * en dos dejaba rótulos repetidos y vacíos al filtrar.
 */
export function porGrupos<T extends { group?: string }>(items: T[]): T[] {
  const orden = [...new Set(items.map((x) => x.group))];
  return orden.flatMap((g) => items.filter((x) => x.group === g));
}
