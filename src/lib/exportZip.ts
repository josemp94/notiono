/**
 * Export a ZIP en el navegador: una página con todas sus subpáginas, o el
 * espacio entero (copia de seguridad). Cada página doc sale como Markdown, cada
 * base de datos como CSV, y los adjuntos referenciados viajan en `adjuntos/`
 * con los enlaces del Markdown reescritos a rutas relativas.
 *
 * La conversión de bloques a Markdown la pone quien llama (un editor BlockNote
 * sin montar): esta biblioteca no sabe de React ni del schema del editor.
 */
import { zipSync, strToU8 } from "fflate";
import { toCsv } from "./csv";
import { displayValue, type FieldLite } from "./cellText";

export type PaginaExport = {
  id: string;
  parentId: string | null;
  title: string;
  type: string;
  content: unknown;
  collection: {
    fields: FieldLite[];
    records: { id: string; cells: unknown }[];
  } | null;
};

/** Nombre de fichero seguro: sin acentos, espacios ni caracteres raros (guiones_bajos). */
export function nombreSeguro(s: string): string {
  const limpio = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return limpio || "Sin_titulo";
}

/** URLs de adjuntos (/api/asset/…) que aparecen en un texto. */
export function urlsDeAdjuntos(texto: string): string[] {
  return [...new Set(texto.match(/\/api\/asset\/[A-Za-z0-9_-]+/g) ?? [])];
}

export async function exportaZip(opts: {
  pages: PaginaExport[];
  /** Raíz del export; null = todas las raíces del espacio (copia de seguridad). */
  rootId: string | null;
  people: Map<string, string>;
  aMarkdown: (content: unknown) => Promise<string>;
  /** Nombre del .zip, sin extensión. */
  nombre: string;
  onProgress?: (msg: string) => void;
}): Promise<{ paginas: number; adjuntos: number }> {
  const { pages, rootId, people, aMarkdown, onProgress } = opts;
  const porPadre = new Map<string | null, PaginaExport[]>();
  const ids = new Set(pages.map((p) => p.id));
  for (const p of pages) {
    // Un padre fuera del export (raíz pedida, o sin permiso) cuenta como raíz.
    const padre = p.parentId && ids.has(p.parentId) && p.id !== rootId ? p.parentId : null;
    porPadre.set(padre, [...(porPadre.get(padre) ?? []), p]);
  }
  const raices = rootId ? pages.filter((p) => p.id === rootId) : (porPadre.get(null) ?? []);

  const ficheros: Record<string, Uint8Array> = {};
  const adjuntos = new Map<string, string>(); // url -> ruta dentro del zip
  let nPaginas = 0;

  /** Ruta única dentro del zip (dos hermanos «Notas» no deben pisarse). */
  const rutaLibre = (base: string, ext: string): string => {
    let ruta = `${base}${ext}`;
    for (let i = 2; ruta in ficheros; i++) ruta = `${base}_${i}${ext}`;
    return ruta;
  };

  const trae = async (url: string): Promise<string | null> => {
    if (adjuntos.has(url)) return adjuntos.get(url)!;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ruta = rutaLibre(`adjuntos/${nombreSeguro(url.split("/").pop() ?? "adjunto")}`, "");
      ficheros[ruta] = new Uint8Array(await res.arrayBuffer());
      adjuntos.set(url, ruta);
      return ruta;
    } catch {
      return null;
    }
  };

  /** Cuántos directorios de profundidad tiene una ruta (para el ../ de los enlaces). */
  const subir = (dir: string) => (dir ? "../".repeat(dir.split("/").length) : "");

  const exporta = async (p: PaginaExport, dir: string): Promise<void> => {
    nPaginas++;
    onProgress?.(`Exportando ${p.title || "Sin título"}… (${nPaginas})`);
    const base = (dir ? dir + "/" : "") + nombreSeguro(p.title || "Sin_titulo");
    if (p.type === "database" && p.collection) {
      const { fields, records } = p.collection;
      const rows = [
        fields.map((f) => f.name),
        ...records.map((r) => {
          const cells = (r.cells ?? {}) as Record<string, unknown>;
          return fields.map((f) => displayValue(f, cells[f.id], people));
        }),
      ];
      ficheros[rutaLibre(base, ".csv")] = strToU8(toCsv(rows));
      // Los adjuntos de las celdas de Archivos también viajan.
      for (const url of urlsDeAdjuntos(JSON.stringify(p.collection.records))) await trae(url);
    } else {
      let md = await aMarkdown(p.content);
      for (const url of urlsDeAdjuntos(md + JSON.stringify(p.content ?? ""))) {
        const ruta = await trae(url);
        if (ruta) md = md.split(url).join(subir(dir) + ruta);
      }
      ficheros[rutaLibre(base, ".md")] = strToU8(md);
    }
    const hijos = porPadre.get(p.id) ?? [];
    // Las subpáginas cuelgan de una carpeta con el nombre de la página, como Notion.
    for (const h of hijos) await exporta(h, (dir ? dir + "/" : "") + nombreSeguro(p.title || "Sin_titulo"));
  };

  for (const r of raices) await exporta(r, "");

  onProgress?.("Comprimiendo…");
  const zip = zipSync(ficheros);
  const url = URL.createObjectURL(new Blob([zip.slice().buffer], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreSeguro(opts.nombre)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return { paginas: nPaginas, adjuntos: adjuntos.size };
}
