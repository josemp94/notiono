# TAREA: cerrar los huecos P0 de paridad con Notion (implementar, no auditar)

Notiono = clon de Notion (Next.js 15 + tRPC + Prisma + BlockNote + ECharts). El informe está en AUDIT-NOTION-PARITY.md. Implementa EXACTAMENTE como Notion, sin apaños. Convenciones: commit por funcionalidad, mensajes claros en español (autor Jose), y `npm run build` DEBE quedar limpio al final. No cambies el esquema Prisma salvo que sea imprescindible.

Haz estas 4, en este orden, cada una con su commit:

## 1. Subir imagen/vídeo/audio/archivo desde el editor (P0)
BlockNote no tiene `uploadFile` configurado. `/api/upload` YA existe (lo usan portada y el campo Archivos). Pásalo a `useCreateBlockNote` en `src/components/editor/Editor.tsx` para que los bloques image/video/audio/file acepten subida (drag&drop y botón), no solo URL. Reutiliza el endpoint existente.

## 2. Bloque de código con resaltado de sintaxis (P0)
Activa el resaltado de BlockNote (plugin de código / shiki) para el codeBlock, con selector de lenguaje. Añade la dependencia necesaria y actívala en el schema del editor.

## 3. Modo oscuro: pills de opciones legibles + 10 colores (P1, barato y muy visible)
`OPTION_COLORS` en `src/components/database/Cell.tsx` (~línea 283) usa texto fijo `#26241f` sobre fondos claros, ilegible en dark. Da variante dark a cada color (fondo y texto por variable CSS o clase) y amplía de 6 a los 10 colores de Notion. Verifica que se ve bien en claro y oscuro.

## 4. Selección múltiple de filas + acciones masivas en la Tabla (P0)
En `src/components/database/TableView.tsx` añade checkbox de selección por fila + checkbox de cabecera (seleccionar todo). Con filas seleccionadas, muestra una barra de acciones: borrar en lote y editar una propiedad en lote (p.ej. cambiar un select/estado a un valor). Como en Notion.

## VERIFICACIÓN
- `npm run build` limpio (sin errores TS) al final.
- No rompas vistas existentes.
- 4 commits separados, uno por punto.
