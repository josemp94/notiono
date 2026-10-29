/**
 * Una página (o una fila de base de datos) a Word (.docx), en el servidor para que la
 * web y la app descarguen lo mismo. Con la librería `docx` (MIT).
 *
 * Lo que se conserva: título, propiedades de la fila, encabezados, negrita, cursiva,
 * subrayado, tachado, resaltado y colores (de texto y de bloque), listas, casillas (las
 * marcadas, tachadas y en gris), tablas, citas, llamadas, código, imágenes y dibujos
 * (su PNG), enlaces y, de los adjuntos, su nombre. Las columnas salen en secuencia y
 * las BD embebidas como enlace (`aplanarParaExport`, lo mismo que el Markdown).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { aplanarParaExport } from "@/lib/exportBloques";

type Inline = { type: string; text?: string; href?: string; styles?: Record<string, unknown>; content?: Inline[]; props?: Record<string, unknown> };
type Bloque = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: Bloque[] };

/** Bytes y formato de una imagen (o null si no se puede incrustar). */
export type LeeImagen = (url: string) => Promise<Uint8Array | null>;

// Los colores de BlockNote (los mismos nombres en texto y en fondo).
const TINTA: Record<string, string> = {
  gray: "9B9A97", brown: "64473A", red: "E03E3E", orange: "D9730D", yellow: "DFAB01",
  green: "4D6461", blue: "0B6E99", purple: "6940A5", pink: "AD1A72",
};
const FONDO: Record<string, string> = {
  gray: "EBECED", brown: "E9E5E3", red: "FBE4E4", orange: "F6E9D9", yellow: "FBF3DB",
  green: "DDEDEA", blue: "DDEBF1", purple: "EAE4F2", pink: "F4DFEB",
};
// Los de la llamada (`calloutBlock.tsx`), con sus nombres en español.
const FONDO_LLAMADA: Record<string, string> = {
  gris: "F1F1EF", marron: "F4EEEE", naranja: "FBECDD", amarillo: "FBF3DB", verde: "EDF3EC",
  azul: "E7F3F8", morado: "F6F3F9", rosa: "FAF1F5", rojo: "FDEBEC", fondo: "F7F6F3",
};
const GRIS_HECHO = "9B9A97";
const ANCHO_MAX = 600; // px del texto de una página A4 con márgenes normales

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

/** Ancho y alto de un PNG, JPEG o GIF (lo que hace falta para colocarlo); null si no lo es. */
export function medidasImagen(b: Uint8Array): { tipo: "png" | "jpg" | "gif"; ancho: number; alto: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { tipo: "png", ancho: dv.getUint32(16), alto: dv.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49) return { tipo: "gif", ancho: dv.getUint16(6, true), alto: dv.getUint16(8, true) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { tipo: "jpg", alto: dv.getUint16(i + 5), ancho: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return null;
}

type Estilo = { color?: string; fondo?: string; tachado?: boolean };

function runs(inline: unknown, base: Estilo = {}): ParagraphChild[] {
  if (typeof inline === "string") return [new TextRun({ text: inline, color: base.color, strike: base.tachado })];
  if (!Array.isArray(inline)) return [];
  const out: ParagraphChild[] = [];
  for (const n of inline as Inline[]) {
    if (n.type === "link") {
      out.push(new ExternalHyperlink({ link: n.href ?? "", children: runs(n.content ?? [], { ...base, color: "0B6E99" }) as TextRun[] }));
      continue;
    }
    const s = n.styles ?? {};
    const texto =
      n.type === "text" ? n.text ?? ""
      : n.type === "mention" ? String(n.props?.title || "Página")
      : n.type === "personMention" ? `@${n.props?.name ?? ""}`
      : n.type === "dateMention" ? String(n.props?.fecha ?? "")
      : n.text ?? "";
    const color = typeof s.textColor === "string" && TINTA[s.textColor] ? TINTA[s.textColor] : base.color;
    const fondo = typeof s.backgroundColor === "string" && FONDO[s.backgroundColor] ? FONDO[s.backgroundColor] : base.fondo;
    // Los saltos de línea dentro de un bloque (Mayús+Intro) son saltos de Word.
    texto.split("\n").forEach((trozo, i) =>
      out.push(
        new TextRun({
          text: trozo,
          break: i > 0 ? 1 : undefined,
          bold: !!s.bold,
          italics: !!s.italic,
          underline: s.underline || n.type === "mention" ? {} : undefined,
          strike: !!s.strike || base.tachado,
          color,
          shading: fondo ? { type: ShadingType.CLEAR, color: "auto", fill: fondo } : undefined,
          font: s.code ? "Courier New" : undefined,
        }),
      ),
    );
  }
  return out;
}

/** Celdas de una tabla de BlockNote: `[inline…]` o `{type:"tableCell", content}`. */
function celda(c: unknown): ParagraphChild[] {
  if (c && typeof c === "object" && !Array.isArray(c)) return runs((c as { content?: unknown }).content ?? []);
  return runs(c);
}

/** El .docx de una página: título, propiedades (si es una fila) y sus bloques. */
export async function generaDocx(opts: {
  titulo: string;
  propiedades?: [string, string][];
  bloques: unknown;
  leeImagen: LeeImagen;
}): Promise<Buffer> {
  const hijos: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(opts.titulo || "Sin título")] })];

  const props = (opts.propiedades ?? []).filter(([, v]) => v.trim());
  if (props.length)
    hijos.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: props.map(
          ([k, v]) =>
            new TableRow({
              children: [
                new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: k, color: GRIS_HECHO })] })] }),
                new TableCell({ children: [new Paragraph(v)] }),
              ],
            }),
        ),
      }),
      new Paragraph(""),
    );

  let numeradas = 0; // cada lista numerada (instancia) vuelve a empezar en 1

  async function pinta(lista: Bloque[], nivel: number) {
    let anterior = "";
    let instancia = 0;
    for (const b of lista) {
      const p = b.props ?? {};
      const colorBloque = typeof p.textColor === "string" ? TINTA[p.textColor] : undefined;
      const fondoBloque = typeof p.backgroundColor === "string" ? FONDO[p.backgroundColor] : undefined;
      const base: Estilo = { color: colorBloque };
      const sangria = nivel ? { left: 360 * nivel } : undefined;
      const sombra = fondoBloque ? { type: ShadingType.CLEAR, color: "auto", fill: fondoBloque } : undefined;
      const alineado =
        p.textAlignment === "center" ? AlignmentType.CENTER : p.textAlignment === "right" ? AlignmentType.RIGHT : p.textAlignment === "justify" ? AlignmentType.JUSTIFIED : undefined;

      if (b.type === "numberedListItem" && anterior !== "numberedListItem") instancia = ++numeradas;
      anterior = b.type;

      switch (b.type) {
        case "heading":
          hijos.push(new Paragraph({ heading: HEADINGS[Math.min(Math.max(Number(p.level) || 1, 1), 6) - 1], children: runs(b.content, base), alignment: alineado, shading: sombra }));
          break;
        case "bulletListItem":
          hijos.push(new Paragraph({ bullet: { level: Math.min(nivel, 8) }, children: runs(b.content, base), shading: sombra }));
          break;
        case "numberedListItem":
          hijos.push(new Paragraph({ numbering: { reference: "numerada", level: Math.min(nivel, 8), instance: instancia }, children: runs(b.content, base), shading: sombra }));
          break;
        case "checkListItem": {
          // Hecha: tachada y en gris, como se ve en la página.
          const hecha = !!p.checked;
          hijos.push(
            new Paragraph({
              indent: sangria,
              shading: sombra,
              children: [
                new TextRun({ text: hecha ? "☑ " : "☐ ", font: "Segoe UI Symbol", color: hecha ? GRIS_HECHO : undefined }),
                ...runs(b.content, hecha ? { color: GRIS_HECHO, tachado: true } : base),
              ],
            }),
          );
          break;
        }
        case "toggleListItem":
          hijos.push(new Paragraph({ indent: sangria, shading: sombra, children: [new TextRun({ text: "▸ ", color: GRIS_HECHO }), ...runs(b.content, base)] }));
          break;
        case "quote":
          hijos.push(
            new Paragraph({
              indent: { left: 360 * nivel + 240 },
              border: { left: { style: BorderStyle.SINGLE, size: 18, color: "1C1B19", space: 10 } },
              shading: sombra,
              children: runs(b.content, base),
            }),
          );
          break;
        case "callout":
          hijos.push(
            new Paragraph({
              indent: sangria,
              shading: { type: ShadingType.CLEAR, color: "auto", fill: FONDO_LLAMADA[String(p.color)] ?? FONDO_LLAMADA.fondo },
              border: { top: { style: BorderStyle.SINGLE, size: 1, color: "E8E6E2", space: 6 }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "E8E6E2", space: 6 } },
              children: [new TextRun(`${p.emoji ?? "💡"} `), ...runs(b.content, base)],
            }),
          );
          break;
        case "codeBlock": {
          const texto = Array.isArray(b.content) ? (b.content as Inline[]).map((n) => n.text ?? "").join("") : "";
          hijos.push(
            new Paragraph({
              indent: sangria,
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7F6F3" },
              children: texto.split("\n").map((l, i) => new TextRun({ text: l, break: i > 0 ? 1 : undefined, font: "Courier New", size: 19 })),
            }),
          );
          break;
        }
        case "divider":
          hijos.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E8E6E2", space: 1 } }, children: [] }));
          break;
        case "table": {
          const filas = ((b.content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows ?? []).filter((r) => r.cells?.length);
          if (filas.length)
            hijos.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: filas.map((r) => new TableRow({ children: r.cells!.map((c) => new TableCell({ children: [new Paragraph({ children: celda(c) })] })) })),
              }),
            );
          break;
        }
        case "image": {
          const url = String(p.url ?? "");
          const bytes = url ? await opts.leeImagen(url).catch(() => null) : null;
          const m = bytes ? medidasImagen(bytes) : null;
          if (bytes && m) {
            const escala = Math.min(1, ANCHO_MAX / m.ancho, (Number(p.previewWidth) || ANCHO_MAX) / m.ancho);
            hijos.push(
              new Paragraph({
                alignment: alineado,
                children: [new ImageRun({ type: m.tipo, data: bytes, transformation: { width: Math.round(m.ancho * escala), height: Math.round(m.alto * escala) } })],
              }),
            );
          } else if (url) hijos.push(new Paragraph({ children: [new ExternalHyperlink({ link: url, children: [new TextRun({ text: String(p.name || url), style: "Hyperlink" })] })] }));
          if (p.caption) hijos.push(new Paragraph({ alignment: alineado, children: [new TextRun({ text: String(p.caption), italics: true, color: GRIS_HECHO })] }));
          break;
        }
        case "video":
        case "audio":
        case "file":
          // Los adjuntos no caben en un Word: su nombre (y el pie, si lo tiene).
          hijos.push(new Paragraph({ indent: sangria, children: [new TextRun(`📎 ${p.name || String(p.url ?? "").split("/").pop() || "Archivo"}`), ...(p.caption ? [new TextRun({ text: ` — ${p.caption}`, color: GRIS_HECHO })] : [])] }));
          break;
        case "bookmark":
          hijos.push(new Paragraph({ indent: sangria, children: [new ExternalHyperlink({ link: String(p.url ?? ""), children: [new TextRun({ text: String(p.title || p.url || ""), style: "Hyperlink" })] })] }));
          break;
        case "equation":
          hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(p.tex ?? ""), font: "Cambria Math" })] }));
          break;
        case "toc":
          break;
        default:
          // Párrafo y cualquier bloque con texto que no se conozca.
          hijos.push(new Paragraph({ indent: sangria, shading: sombra, alignment: alineado, children: runs(b.content, base) }));
      }
      if (b.children?.length) await pinta(b.children, nivel + 1);
    }
  }
  await pinta(aplanarParaExport(opts.bloques) as Bloque[], 0);

  const doc = new Document({
    creator: "Notiono",
    title: opts.titulo,
    numbering: {
      config: [
        {
          reference: "numerada",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: hijos }],
  });
  return Packer.toBuffer(doc);
}

/** Las imágenes que se incrustan: solo las nuestras (`/api/asset/<id>`, también con dominio); las de fuera, como enlace. */
export async function leeAsset(db: typeof import("@/lib/db").db, url: string): Promise<Uint8Array | null> {
  const id = url.match(/^(?:https?:\/\/[^/]+)?\/api\/asset\/([A-Za-z0-9_-]+)$/)?.[1];
  if (!id) return null;
  const a = await db.asset.findUnique({ where: { id }, select: { bytes: true } });
  return a ? new Uint8Array(a.bytes) : null;
}
