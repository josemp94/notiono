/**
 * Pegamento entre el export a ZIP (src/lib/exportZip.ts, que no sabe de BlockNote)
 * y el editor: convierte los bloques de cada página a Markdown con un editor sin
 * montar, usando el MISMO schema que el editor de verdad.
 */
import { exportaZip, type PaginaExport } from "@/lib/exportZip";
import { editorParaExport } from "./bloquesExport";

export async function exportaZipConEditor(args: {
  pages: PaginaExport[];
  rootId: string | null;
  people: Map<string, string>;
  nombre: string;
  onProgress?: (msg: string) => void;
}) {
  return exportaZip({
    ...args,
    aMarkdown: async (content) => {
      const ed = editorParaExport(content);
      return ed.blocksToMarkdownLossy(ed.document);
    },
  });
}
