# SIGUIENTE TAREA: seguir cerrando paridad con Notion

Lee el informe completo en `AUDIT-NOTION-PARITY.md` (raíz del repo) — es la fuente de verdad, con evidencia fichero:línea, severidad (P0/P1/P2) y esfuerzo (S/M/L).

## Estado actual
- Paridad global estimada en el audit: **~62%** (antes de las dos tandas de abajo).
- YA HECHO (commits hasta `69b02b8`, desplegado):
  1. Subir imagen/vídeo/audio/archivo desde el editor (uploadFile → /api/upload).
  2. Bloque de código con resaltado de sintaxis (shiki / @blocknote/code-block).
  3. Pills de opciones legibles en modo oscuro + 10 colores de Notion.
  4. Selección múltiple de filas + acciones en lote en la Tabla.
- YA HECHO también (tanda 21-ago, commits `7db1359`…`598a9ee`, SIN desplegar aún):
  5. Densidad de fila ~32px en la Tabla.
  6. Modal de confirmación propio (los 8 `confirm()` nativos fuera, `Confirmar.tsx`).
  7. Callout con 10 colores; colores de texto/fondo verificados de serie en BlockNote.
  8. API REST: `GET /databases/:id/records` paginado por cursor (+ prueba en check-api + docs).
  9. Navegación ↑↓ entre filas en el panel de ficha (Tabla).
  10. Kanban: «+ Añadir grupo» desde el tablero.
  11. Avisos al comentar una página y al asignar en un campo Persona (bandeja + push).
- Filtros y gráficas ya tenían paridad (tanda anterior, hasta `acd33bd`).

## QUÉ HACER AHORA — huecos grandes que quedan, en orden sugerido
Trabaja de uno en uno, commit por funcionalidad (autor Jose, mensajes en español), `npm run build` limpio al final de cada uno. No cambies el esquema Prisma salvo que sea imprescindible (y si lo haces, con migración).

### P0 (lo nota cualquiera a diario)
1. ~~**Permisos por página**~~ — ✅ HECHO (`16350aa`, 21-ago). Queda como P1: invitados externos por página.
2. ~~**Import/export decente**~~ — ✅ HECHO en lo grande (21-ago): ZIP de Notion (`ff8b7d5`), tipos en CSV (`3af6270`), query con filtros/orden en la API (`5792695`). Queda como P1: export con subpáginas a ZIP + PDF/HTML + backup del workspace; CSV a BD existente (P2). **FASE 0 COMPLETA.**

### P1 (se nota al usarlo en serio)
3. ~~**BD en tiempo real**~~ — ✅ HECHO por el camino corto (21-ago): merge atómico por celda (`01030f3`) + señal de invalidación en vivo (`87af34f`). CRDT solo si hace falta.
4. ~~**Fórmulas 2.0**~~ — ✅ HECHO (`4d2939b`, 21-ago): fechas/listas como valores, current/index, ~55 funciones, prop("Relación"). Queda P2: editor con autocompletado.
5. ~~**Relaciones bidireccionales**~~ — ✅ HECHO (`512a9aa`, 21-ago): campo espejo con sincronía + limpieza al purgar. Queda P2: límite 1/∞.
6. ~~**Timeline y Calendario editables**~~ — ✅ HECHO en lo gordo (`2ef0a92`, 21-ago): arrastrar eventos/barras, redimensionar, zoom Mes/Trimestre/Año, hora visible, línea de hoy. Quedan P1-P2: dependencias + tabla lateral del Timeline, vista semana, crear arrastrando.

**EL TOP-10 DE LA AUDITORÍA ESTÁ COMPLETO.** Novena tanda (pulido, `0c49c01`…`055cc86`): BD embebida→página completa, editar comentario propio, vista Semana, Favorito/Copiar enlace en el árbol, sidebar redimensionable.

## Lo que queda (a demanda, según se note al usarlo)
- **L / arquitectura**: dependencias con flechas + tabla lateral del Timeline; invitados externos por página (choca con el SSO-only: necesitaría decidir cómo entra un no-miembro); bloque sincronizado; ecuaciones KaTeX; CRDT por celda.
- **Fase 2 restante**: skeletons, sistema de toasts genérico, tooltips con kbd, micro-transiciones, sidebar peek, embeds (Figma/Maps/PDF), columnas del editor arrastrables, @fecha y :emoji:, plantillas propias, PWA con BD offline, rate limit API, export ZIP/PDF con subpáginas, backup del workspace, historial con diff, deep-links a bloque, Home con widgets.

### P2 (pulido / nicho) — cuando lo grande esté
- Ecuaciones LaTeX (KaTeX, `$$` y `/math`), embeds genéricos (Figma/X/Maps/PDF/iframe), columnas con ancho ajustable y añadir columna a un layout, bloque sincronizado / botón / breadcrumb. Ver dimensión 1.

## Convenciones (recordatorio, ver CLAUDE.md)
- Commit por funcionalidad, español, autor Jose. `npm run build` + `npx tsc --noEmit` + `npm run check` limpios.
- No romper vistas existentes (tabla/kanban/calendario/galería/timeline/lista/form/gráfica).
- Implementar como Notion, sin apaños.
