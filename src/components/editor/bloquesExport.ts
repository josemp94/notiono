/**
 * Editor sin montar para exportar: mismo schema que el de verdad, con el
 * contenido pasado por el aplanador (columnas en secuencia, BD como enlace).
 * Crear el editor normaliza los bloques sintéticos (ids, props por defecto),
 * así el serializador de BlockNote nunca ve bloques a medias.
 */
import { BlockNoteEditor } from "@blocknote/core";
import { editorSchema, type NotionoPartialBlock } from "./mention";
import { aplanarParaExport } from "@/lib/exportBloques";

export function editorParaExport(content: unknown) {
  const bloques = aplanarParaExport(content) as NotionoPartialBlock[];
  return BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: Array.isArray(bloques) && bloques.length ? bloques : undefined,
  });
}
