# TAREA: Auditoría de paridad TOTAL con Notion — aspecto y funcionalidad

Notiono es un clon de Notion self-hosted (Next.js 15 + tRPC + Prisma + BlockNote + ECharts), desplegado. El dueño quiere paridad 1:1 con Notion y ha detectado que aún faltan cosas. Tu tarea: revisar A FONDO el repo (este directorio, ~/Projects/notiono) y producir un informe exhaustivo de TODAS las diferencias/carencias frente a Notion, tanto de FUNCIONALIDAD como de ASPECTO/UX.

NO cambies código. Solo AUDITA y ESCRIBE el informe en `AUDIT-NOTION-PARITY.md` (en la raíz del repo).

Revisa por dimensiones (lee los ficheros reales, cita fichero:línea como evidencia):
1. **Editor y tipos de bloque** (src/components/editor/**): cobertura vs Notion — subir imagen/vídeo/audio/archivo, código con resaltado, ecuaciones/LaTeX, embeds genéricos (Figma/X/Maps/PDF/iframe), columnas (crear por arrastre, anchos), bloque sincronizado, botón/plantilla, breadcrumb, mención de fecha, turn-into de bloques custom, comentarios en bloque, export fiel.
2. **Tipos de propiedad de BD** (src/server/services/db.ts, Cell.tsx, cellText.ts): faltan Botón, Lugar, recordatorios de fecha, relación bidireccional, dependencias; formatos de número (monedas, decimales, anillo), colores de opción, texto enriquecido en celdas, etc.
3. **Vistas de BD** (src/components/database/**): Tabla, Kanban/Board, Timeline (dependencias, zoom), Calendario (semana, multi-día, arrastrar), Lista, Galería, Gráfica, Formulario; agrupar/subagrupar, ordenar múltiple, duplicar vista, vista por defecto.
4. **Filtros/orden/fórmulas/rollups/relaciones** (src/lib/viewData.ts, src/server/formula.ts): operadores por tipo, grupos anidados AND/OR, filtrar por fórmula/rollup/relación; paridad del lenguaje de fórmulas 2.0 (fechas, listas, map/filter, prop de relaciones); agregaciones de rollup que faltan; relación bidireccional/self.
5. **Páginas/navegación/sidebar/búsqueda** (src/components/sidebar/**, src/app/(app)/**, router pages): favoritos, teamspaces, backlinks, wiki, búsqueda por contenido, breadcrumbs, ancho completo, historial.
6. **Colaboración/compartir/permisos/comentarios/tiempo real** (collab/**, router comments, /s/[token], Member roles): ¿está el servidor de colaboración (Yjs/hocuspocus) activo en producción? cursores en vivo, presencia, comentarios inline con hilos/reacciones, permisos granulares por página, invitados, publicar.
7. **Aspecto/estética/UX** (globals.css, tailwind, variables CSS, clases en .tsx): tipografía, espaciado, densidad, modo oscuro (contraste, pills), hover/animaciones/transiciones, menús contextuales, popovers/diálogos, scrollbars, skeletons, responsive/táctil móvil. NOTA: la marca naranja #ff5c28 y fuentes Bricolage/Hanken/Plex Mono son intencionadas (no son defecto); valora si la ESTRUCTURA visual imita a Notion.
8. **Plantillas/importar/exportar/API/PWA/atajos** (templates.ts, csv.ts, api/v1/**, docs/api.md, manifest): galería de plantillas, importar (MD/CSV/HTML/Word con mapeo), exportar (PDF/HTML/MD con subpáginas), cobertura de la API pública vs API de Notion, PWA/offline, atajos de teclado.

FORMATO del informe `AUDIT-NOTION-PARITY.md`:
- Un resumen ejecutivo al principio: % de paridad estimado por dimensión y los 10 huecos más importantes.
- Luego una sección por dimensión con una TABLA: Área | Qué hace Notion | Estado en Notiono (❌ falta / ⚠️ parcial / ✅ ok pero difiere) | Evidencia (fichero:línea) | Severidad (P0/P1/P2) | Esfuerzo (S/M/L).
- Al final, un **plan de trabajo priorizado por fases** (P0 primero) para cerrar la paridad, agrupando por áreas afines para poder delegarlo después.

Sé exhaustivo y CONCRETO. Cita ficheros reales. Cuando acabes, deja el fichero escrito y termina.
