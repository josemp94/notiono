# Auditoría de paridad TOTAL con Notion — funcionalidad y aspecto

> **Fecha:** 20-ago-2026 · **Base:** commit `acd33bd` (main) · **Método:** lectura del código real por 8 auditorías
> paralelas (una por dimensión), con verificación cruzada manual de los hallazgos conflictivos.
> **Revisión 21-ago-2026 (hasta `69b02b8`, verificado en código):** cerrados los huecos nº 1 (uploadFile en
> `Editor.tsx:86` y `RecordPanel.tsx:71`), nº 2 (shiki vía `@blocknote/code-block`, `mention.tsx:62`), nº 3
> (selección múltiple + lote en `TableView.tsx:78-255`) y nº 9 (10 colores con variante dark vía `--tag-*` en
> `globals.css:45-69` + `OPTION_COLORS` en `cellText.ts:86`; Kanban tiñe con `color-mix`).
> **Segunda tanda 21-ago-2026 (`7db1359`…`598a9ee`):** densidad de fila 32px, modal de confirmación propio (los 8
> `confirm()` fuera), callout con 10 colores (y verificado que la toolbar y el menú de bloque de BlockNote traen los
> colores de texto/fondo de serie), paginación por cursor en la API REST, navegación ↑↓ en el panel de fila, «+ Añadir
> grupo» en Kanban y avisos al comentar/asignar.
> **Tercera tanda 21-ago-2026 (`624467b`, `16350aa`):** arreglado el desbordamiento del editor de filtros
> (las filas envuelven y el popover pasa a w-96) y hechos los **permisos por página** (ver/comentar/editar/total,
> herencia por ancestro restringido más cercano, impuestos en servidor; `services/perms.ts` + sección «Acceso» en
> Compartir).
> **Cuarta tanda 21-ago-2026 (`ff8b7d5`…`5792695`): FASE 0 COMPLETA.** Importar el ZIP de export de Notion
> (jerarquía, BDs, adjuntos y enlaces reescritos; `lib/importNotion.ts` + `lib/notionMd.ts` probado en check),
> detección de tipos al importar CSV (`lib/csvTipos.ts`, también probado) y `POST /databases/:id/query` en la API
> (filtros/orden con `applyViewConfig`, el mismo motor que las vistas). Del bloque de migración queda solo el
> export (subpáginas a ZIP, PDF/HTML, backup del workspace), que es P1.
> **Quinta tanda 21-ago-2026 (`01030f3`…`9287c3d`), ya en Fase 1:** BD en tiempo real por el camino corto —
> merge atómico por celda en Postgres (editar campos distintos de una fila ya no se pisa; jsonb `||`/`-` en
> `updateCell` y en el PATCH REST) + señal de invalidación en vivo por la sala Yjs de la página
> (`useDbLive.ts`: los cambios de otros aparecen al momento) — y **rollups completos** (las ~20 agregaciones
> de Notion en `lib/rollup.ts`, probadas en check). El CRDT por celda (camino largo) queda para si hace falta.
> **Sexta tanda 21-ago-2026 (`4d2939b`): Fórmulas 2.0.** El motor gana fechas y listas como tipos de valor,
> `current`/`index` con map/filter/find/some/every perezosos, ~40 funciones nuevas (fecha, lista, texto) y
> contexto rico en `db.computed` (multiselect/persona como listas, `prop("Relación")` = títulos enlazados).
> 20 asserts en check. Queda como P2 el editor con autocompletado y las props arbitrarias de filas enlazadas
> (los rollups ya cubren eso).
> **Séptima tanda 21-ago-2026 (`3ff6c77`, `512a9aa`):** los Recientes se van del sidebar al Ctrl+K (feedback de
> Jose + es donde los pone Notion, y de paso cierra «la búsqueda abre vacía»), y **relaciones bidireccionales**:
> campo espejo emparejado por `config.mirrorFieldId` con sincronía en `updateCell` (`services/relations.ts`),
> des-emparejado al borrar una mitad, y limpieza de referencias colgantes al purgar filas (tRPC y API).
> **Octava tanda 21-ago-2026 (`2ef0a92`): Calendario y Cronograma editables — EL TOP-10 QUEDA COMPLETO.**
> Arrastrar eventos entre días (hora y duración conservadas) y hora visible en el Calendario; zoom
> Mes/Trimestre/Año, arrastrar barras y redimensionar con tirador en el Cronograma, con línea de «hoy».
> Quedan como P1-P2 de esa área: dependencias + tabla lateral del Timeline (la vista semana del Calendario ya está: `bab6708`).
> **Novena tanda 21-ago-2026 (`0c49c01`…`055cc86`), pulido:** abrir BD embebida como página completa, editar el
> comentario propio, vista Semana del Calendario, Favorito + Copiar enlace en el menú del árbol y sidebar
> redimensionable (200–480px, persistente). El indicador de guardado ya se mostraba bien (fila desfasada).
> Fuera de alcance deliberado (L o choca con el SSO): dependencias con flechas + tabla lateral del Timeline,
> invitados externos por página, bloque sincronizado, ecuaciones KaTeX y el resto de Fase 2 a demanda.
> **Décima tanda 22-ago-2026 (peek + tabla fina):** modos de apertura side/center/página completa
> (`view.config.openIn` + `openInOf`, selector «Abrir filas en»; página completa = `?r=` sobre `/p/[pageId]`),
> peek redimensionable (360–900px, localStorage) con botón de expandir, Escape cierra menús (Popover) y panel,
> Kanban abre ficha al pulsar la tarjeta, botón ABRIR en la celda del título, copiar y «Expandir» al pasar el
> ratón por celdas de texto/URL/correo/tel, ellipsis también en URL/correo/tel, **envolver texto por columna**
> (`wrapCols` + `wrapOf`, el ajuste por vista queda como default), **clic en la cabecera abre el menú completo**
> (nombre editable, ordenar asc/desc, filtrar —abre el popover de la barra vía `FILTER_MENU_EVENT`—, ocultar,
> ajustar texto, duplicar propiedad con valores, insertar izquierda/derecha) y **reordenar columnas arrastrando**
> (`moveField`; `Field.order` ya era fraccional: sin migración). La REST gana `afterFieldId` en POST fields.
> **Undécima tanda 22-ago-2026:** **comentarios de fila** (`Comment.recordId` con migración; hilo `CommentThread`
> compartido con el panel de página, avisos y push a `?r=`), **reordenar tarjetas dentro de una columna del Kanban**
> (`moveRecord`, solo sin orden activo), **reordenar las pestañas de vista arrastrando** (`View.order` fraccional con
> backfill; la primera pestaña es la vista por defecto; duplicar vista cae a la derecha) y **descripción de
> propiedad** (`Field.config.description`, ℹ + tooltip en cabecera y ficha).
> **Duodécima tanda 22-ago-2026 (lote «barato y visible»):** **filtrar/ordenar/graficar por fórmulas y
> rollups** (cálculo extraído a `services/computados.ts` + `conComputados` funde los valores en las celdas:
> tabla, gráfica y `POST /query` dan lo mismo; la gráfica puede usar una fórmula como eje), **export con
> subpáginas a ZIP y copia de seguridad del espacio** (`pages.exportTree` + `lib/exportZip.ts`: MD + CSV +
> adjuntos con enlaces reescritos; menú ⋯ y Ajustes), **«Editado por X hace Y»** en la barra superior,
> **diff visual del historial** (`lib/diff.ts`, LCS por líneas), **plantilla de fila por defecto** (estrella),
> **imagen en la Galería** con ajuste recortar/entera (`imageFit`), **límite de un solo vínculo** en
> relaciones (`config.single`), **suma por columna en el Kanban** (`kanbanSum`) y separadores en el menú
> de columna.
> **Decimotercera tanda 23-ago-2026 (resto del lote barato):** **editar opciones de etiqueta desde el
> desplegable** (⋯ por opción: nombre, paleta de colores, grupo del Estado, borrar con confirmación;
> arrastrar reordena y en Estado adopta el grupo de destino), **sistema de toasts con «Deshacer»**
> (`Toast.tsx`, patrón de Confirmar; borrar fila —suelta, en lote o desde la ficha— ya no pide
> confirmación porque se deshace desde el aviso), **favoritos reordenables** (`Favorite.order` fraccional
> con migración + `favorites.move` + drag en el sidebar), **la celda de ID copia el enlace de la fila**
> (URL absoluta `/p/…?r=…`), **Ctrl+Mayús+L** alterna claro/oscuro y **skeletons de carga** (`.esqueleto`)
> en página y BD.
> **Decimocuarta tanda 23-ago-2026:** **formulario público** — «Compartir formulario» en la vista
> Formulario publica `/f/<token>` (token en `view.config.publicToken`, sin migración); cualquiera con el
> enlace envía filas sin cuenta vía `POST /api/form/<token>` (valida cada valor por tipo y solo acepta
> campos visibles y compatibles; crea por `services/db.createRecord`, con webhooks y `seq`). Ocultar una
> columna en la vista la quita del formulario. `FieldInput` extraído a `FormFields.tsx` (sin tRPC) y
> compartido por la vista interna y la pública. **Campos obligatorios**: asterisco por campo en la vista
> interna (`view.config.requiredFields`), validados en cliente y en el endpoint; el checkbox no puede ser
> obligatorio (false es respuesta válida). **Mensaje de gracias personalizable** (`thanksMessage`).
> **Navegación por teclado en la tabla**: clic selecciona la celda (anillo), flechas por la rejilla
> (recorrida por el DOM, sobrevive a grupos y subtareas), Intro edita o abre el selector, Escape sale;
> documentada en la ventana de Atajos.
> **Decimoquinta tanda 23-ago-2026:** **ocultar columnas de grupo en el Kanban** (`hiddenGroups`, ojo en
> la cabecera + sección «Ocultas» para recuperarlas), **«borrado por» en la papelera**
> (`Page.archivedById`, migración `20260823110000_borrado_por`; se limpia al restaurar) y
> **Ctrl+[ / Ctrl+]** atrás/adelante (sin altKey: en el teclado español los corchetes van con AltGr).
> La vista semana del Calendario resultó estar ya hecha (`bab6708`): se corrige la cabecera de la auditoría.
> **Decimosexta tanda 23-ago-2026:** **tabla lateral del Cronograma** (columna de títulos sticky con clic
> para abrir la ficha + sección «Sin fecha» con «Planificar hoy») y **tipo de campo Botón** (etiqueta +
> acciones campo→valor sobre la fila: casilla, estado/selección, «@hoy», número, texto; configurado en el
> menú de la columna; sin valor en celda → fuera de conversiones y vacío en CSV).
> **Decimoséptima tanda 24-ago-2026:** **texto enriquecido en celdas de texto** vía markdown inline
> (`lib/mdInline.tsx`): **negrita**, *cursiva*, ~~tachado~~, `código`, [enlaces](https://…) y URLs sueltas
> se pintan formateados (tabla + títulos de Kanban/Lista/Galería/Calendario/Cronograma) y el clic edita el
> crudo. El valor sigue siendo un string a propósito — filtros, fórmulas, CSV, búsqueda y API intactos —
> y solo se enlazan http(s) (un `[x](javascript:…)` queda como texto). Deliberadamente sin anidar formatos.
> **Decimoctava tanda 24-ago-2026 (servidor + Kanban):** **rate limit del formulario público** (30
> envíos/IP/formulario cada 10 min, `src/server/ratelimit.ts` con asserts; documentado en `docs/api.md`),
> **aviso a los miembros al llegar una respuesta pública** (Notification type "form" + push con enlace a la
> fila; rama de la campana por cortesía de la sesión de fixes, `757d0ce`) y **subagrupar el Kanban en
> carriles plegables** («Carriles por»; soltar en un carril adopta su valor; columnas y carriles comparten
> `gruposDe`/`claveDe`/`valorDeGrupo`).
> **Decimonovena tanda 24-ago-2026 (editor):** **ancho de columnas ajustable** (prop `ancho` = flex-grow,
> aplicada al `.bn-block-outer` ancestro con un efecto; el tirador reparte con la vecina conservando la
> suma), **«+» para añadir columna** a un layout ya creado (borde derecho, al pasar el ratón; ambos solo
> ratón — en táctil las columnas se apilan) y **«/subpágina»** (crea la página hija colgando de la actual
> y la enlaza con la mención en el sitio del cursor). Queda el drag-to-create-column (L).
> **Vigésima tanda 24-ago-2026 (editor, cont.):** **«Convertir en → Llamada»** en la barra de formato
> (`blockTypeSelectItems`) y **enlaces directos a un bloque**: «Copiar enlace al bloque» en el menú del
> tirador (item propio con el patrón de los de serie: `useExtensionState(SideMenuExtension)`) + salto con
> destello al abrir `/p/<id>#<bloque>`, con reintentos por la carga asíncrona.
> **Vigesimoprimera tanda 24-ago-2026:** **filtros en Ctrl+K** — chips de tipo (Todo/Páginas/BDs) y de
> edición reciente (Hoy/7/30 días) bajo el buscador, aplicados en servidor en ambas ramas de `pages.search`
> (`Prisma.empty` para componer el SQL); los recientes no se filtran, como Notion.
> **Vigesimosegunda tanda 24-ago-2026 (UX de BD, verificada con banco Playwright):** **la ficha re-mide
> los textos al cambiar el ancho** (ResizeObserver en `WrappedTextCell`; el alto se calculaba al montar y el
> panel restaura su ancho de localStorage después → 40px de hueco muerto por campo, medido) y alinea las
> etiquetas arriba; **la barra de scroll horizontal se ve** (el pulgar heredaba `--border`, contraste ~1.1:1
> → `--muted` vía `.barra-scroll`); **envolver texto por defecto en TODAS las columnas de texto** y también
> en **URL/correo/teléfono** (`WRAP_TYPES`; la celda pinta el valor envuelto y el clic edita — un input no
> puede envolver), con **toda la fila alineada arriba** como Notion; **menús colgantes con fundido de 120ms**
> (`[data-menu]` + el atributo en los 7 inline que no lo llevaban, que ganan de paso los objetivos táctiles)
> y **«Copiar enlace» (privado) en el menú ⋯ de la página**. Corrección a la dimensión 7: el editor SÍ tiene
> max-width (708px vía `max-w-3xl`, `Editor.tsx:251`) — esa fila estaba desfasada.
> **Vigesimotercera tanda 24-ago-2026 (paridad S-M):** **formatos de número** ($, £, decimales fijos 0-3 y
> el **Anillo** de progreso con su «Máximo», junto a la barra); **renombrar adjuntos** (lápiz inline en la
> celda Archivos; el Asset conserva el original); **el panel plegado asoma flotante** al pasar el ratón por
> el borde izquierdo o el botón (300ms de gracia, solo escritorio); **«Copiar enlace a la vista»** en el
> menú de la vista + la BD a página completa honra `?v=`; y **candado «Bloquear página/BD»** (`Page.locked`
> con migración, pill «Bloqueada» clicable en la barra, contenido a solo lectura; anti-accidentes, no
> permiso — como en Notion).
> **Vigesimocuarta tanda 24-ago-2026:** **formato de fecha por columna** (largo «24 ago 2026», corto
> «24/08/2026» o relativo «hoy/ayer/en 3 días», y reloj 12/24h; la celda pinta el TEXTO formateado y el
> clic pasa a los inputs nativos — asserts de los tres en check) y **descripción de la base de datos**
> (`Collection.description` con migración + `setCollectionDescription` en la capa de servicio; editable
> bajo el título, placeholder al pasar el ratón).
> **Vigesimoquinta tanda 24-ago-2026:** **icono de página con imagen subida** («Subir una imagen» en el
> selector; el icono guarda la URL del Asset y `IconoPagina` pinta emoji o imagen en árbol, favoritos,
> migas, buscador, menciones, mover a, papelera y vistas enlazadas; `emojiIcono` la omite en textos planos).
> Nota de infraestructura: origin/main pasa a ser el punto de sincronía entre sesiones (hubo un
> `reset --hard origin/main` externo a media tanda; los commits se empujan al terminar cada función).
> **Vigesimosexta tanda 24-ago-2026:** **portada reposicionable** («Reposicionar» + arrastre con pointer
> events; el desplazamiento viaja en el propio string `url:<src>|y=<0-100>`, sin migración, y `coverStyle`
> lo aplica también en las páginas públicas) y **reacciones emoji en comentarios** (`Comment.reactions`
> con migración + `comments.react`; pills emoji+recuento con toggle y «+» con los seis rápidos, en hilos
> de página y de fila). Reparto de carriles acordado con la otra sesión por mensaje (editor+API/datos para
> ella; compartir/comentarios/chrome para esta).
> Toda evidencia cita `fichero:línea` del repo. Leyenda: ❌ falta · ⚠️ parcial · ✅ ok (puede diferir en detalle).
> Severidad: **P0** = cualquier usuario lo nota a diario · **P1** = se nota al usarlo en serio · **P2** = nicho/pulido.
> Esfuerzo: **S** < 1 día · **M** = días · **L** = semana(s).

---

## Resumen ejecutivo

| # | Dimensión | Paridad estimada |
|---|---|---|
| 1 | Editor y tipos de bloque | **~62 %** |
| 2 | Tipos de propiedad de BD | **~74 %** |
| 3 | Vistas de BD | **~50 %** |
| 4 | Filtros/orden **85 %** · Fórmulas/rollups/relaciones **~40 %** | **~60 %** |
| 5 | Páginas, navegación, sidebar, búsqueda | **~72 %** |
| 6 | Colaboración, compartir, permisos | **~62 %** |
| 7 | Aspecto / estética / UX | **~72 %** |
| 8 | Plantillas, import/export, API, PWA, atajos | **~58 %** |

**Paridad global estimada: ~62 %.** El esqueleto está (8 vistas, 20 tipos de campo, tiempo real en docs,
filtros al nivel de Notion), pero faltan interacciones que un usuario de Notion toca cada día
(subir un archivo al editor, seleccionar varias filas, arrastrar en Timeline/Calendario) y dos motores
enteros (Fórmulas 2.0 y permisos por página).

### Los 10 huecos más importantes

1. ~~**Subir imagen/vídeo/audio/archivo desde el editor**~~ — ✅ HECHO (`8f5c884`): `uploadFile` → `/api/upload` en editor y panel de fila.
2. ~~**Bloque de código sin resaltado de sintaxis**~~ — ✅ HECHO (`dc00069`): shiki vía `@blocknote/code-block`, ~48 lenguajes.
3. ~~**Selección múltiple de filas + acciones masivas**~~ — ✅ HECHO (`69b02b8`): checkbox por fila + borrar/editar propiedad en lote.
4. ~~**Permisos por página**~~ — ✅ HECHO (`16350aa`): ACL con herencia impuesta en servidor; faltan solo invitados externos por página (P1).
5. ~~**Las BD no son tiempo-real y las celdas son last-write-wins**~~ — ✅ HECHO por el camino corto (`01030f3`, `87af34f`): merge atómico por celda (campos distintos ya no se pisan; misma celda gana el último, como Notion) + los cambios de otros aparecen al momento. CRDT real solo si algún día hace falta.
6. ~~**Fórmulas: 13 funciones vs ~70 de Notion Formula 2.0**~~ — ✅ HECHO (`4d2939b`): fechas y listas como valores, `current`/`index`, ~55 funciones, `prop("Relación")`. Queda P2: editor con autocompletado.
7. ~~**Relación unidireccional + rollups a medias**~~ — ✅ HECHO: campo espejo con sincronía y limpieza al purgar (`512a9aa`) + las ~20 agregaciones (`9287c3d`). Queda P2: límite 1/∞ por relación.
8. ~~**Timeline y Calendario de solo lectura**~~ — ✅ HECHO en lo gordo (`2ef0a92`): arrastrar/redimensionar/zoom/hora; la vista semana también (`bab6708`). Quedan dependencias y tabla lateral del Timeline (P1-P2).
9. ~~**Modo oscuro roto en las etiquetas**~~ — ✅ HECHO (`56740cb`): 10 colores con variante clara/oscura (`--tag-*` en `globals.css`).
10. ~~**Migración e intercambio pobres**~~ — ✅ CASI HECHO (`ff8b7d5`, `3af6270`, `5792695`): ZIP de Notion, tipos en CSV y API con paginación+filtros. Queda el export (subpáginas/PDF/HTML, backup) y CSV a BD existente, P1.

---

## 1. Editor y tipos de bloque (~62 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| Subir imagen desde el bloque | Drag&drop o botón «Subir» además de URL | ✅ | `Editor.tsx:86,102` pasa `uploadFile: subirArchivo` (`8f5c884`) | — | — |
| Subir vídeo/audio/archivo | Igual que imagen | ✅ | Ídem; también en `RecordPanel.tsx:71` | — | — |
| Código: resaltado de sintaxis | Colores por lenguaje (~60 lenguajes) | ✅ | `mention.tsx:62` `createCodeBlockSpec(codeBlockOptions)` de `@blocknote/code-block` (`dc00069`) | — | — |
| Código: selector de lenguaje y wrap | Dropdown + ajuste de línea | ✅ | Selector con ~48 lenguajes vía `codeBlockOptions` | — | — |
| Ecuaciones LaTeX (bloque e inline) | KaTeX en `$$` y `/math` | ❌ | Cero referencias a katex/math en `src/components/editor/` | P2 | L |
| Embeds: Figma / X / Maps / PDF / iframe | Bloque Embed genérico + previews específicas | ❌ | `src/lib/embed.ts:1-20` solo reconoce YouTube/Vimeo; el resto cae a tarjeta OpenGraph (`bookmarkBlock.tsx:48-60`) | P2 | M |
| Bookmark con OpenGraph | Tarjeta con imagen/título/dominio | ✅ | `bookmarkBlock.tsx:33-84` + `linkPreview` con anti-SSRF | — | — |
| Columnas: crear 2/3 desde `/` | También arrastrando un bloque al lado de otro | ⚠️ | `Editor.tsx:281-297` crea `columnList`; **no** hay drag-to-create-column | P1 | L |
| Columnas: ancho ajustable arrastrando | Tirador entre columnas | ✅ | Prop `ancho` (flex-grow) + tirador que reparte con la columna vecina conservando la suma (`columnBlock.tsx`, tanda 19) | — | — |
| Columnas: añadir columna a un layout ya creado | Botón + en el borde | ✅ | «+» en el borde derecho del layout al pasar el ratón (tanda 19) | — | — |
| Bloque sincronizado | Contenido espejado en varias páginas | ❌ | No existe en `editorSchema` (`mention.tsx:57-68`) | P2 | L |
| Bloque botón | Ejecuta acciones / inserta plantilla | ❌ | No existe | P2 | L |
| Bloque breadcrumb | Ruta de ancestros en el cuerpo | ❌ | No existe | P2 | M |
| Mención de fecha `@hoy`/`@fecha` | Inline, con recordatorio opcional | ❌ | `mention.tsx` solo define `mention` (@página) y `personMention` | P2 | M |
| Menú de bloque (drag handle): Convertir en, Color, Duplicar, Copiar enlace, Comentar | Menú contextual completo por bloque | ⚠️ | «Convertir en» ofrece la Llamada y el tirador tiene Eliminar/Colores/«Copiar enlace al bloque» (tanda 20); toc/bookmark/database se insertan, no se convierten (sin celda de texto) | P2 | S |
| Colores de texto y fondo (9+9) | Desde el menú de formato y de bloque | ✅ | Verificado en BlockNote 0.53: `ColorStyleButton` en la toolbar y `BlockColorsItem` en el menú de bloque van de serie con `defaultStyleSpecs`; callout con 10 colores `--tag-*` (`calloutBlock.tsx:7-19`) | — | — |
| Comentario anclado a un bloque | Además del comentario sobre selección | ❌ | Solo selección de texto (`Editor.tsx:88-89`, `FloatingComposerController`) | P2 | L |
| Toggle heading / listas toggle / cita / divisor / tabla | Básicos | ✅ | `defaultBlockSpecs` de BlockNote 0.53 vía `mention.tsx:57-68` | — | — |
| Tabla simple: merge de celdas, colores | Extras de la tabla | ⚠️ | La tabla de BlockNote; merge sin verificar, sin personalización | P2 | M |
| Subpágina como bloque / enlace a página como bloque | `/page` crea subpágina en el sitio; link-to-page | ✅ | «/subpágina» crea la hija y la enlaza con la mención (tanda 19); enlace-a-página = mención @ | — | — |
| Export Markdown fiel | Callout/columnas/BD sobreviven al export | ⚠️ | `blocksToMarkdownLossy` (`Editor.tsx:197`); callout→blockquote y toc→ul OK (`calloutBlock.tsx:41-49`, `tocBlock.tsx:42-49`), pero `database` desaparece y `column` exporta `<div>` vacío (`columnBlock.tsx:22-31`) | P2 | M |
| Estilo por página (Serif/Mono, texto pequeño) | Menú ⋯ de página | ❌ | No existe; fuentes solo globales | P2 | M |
| Ancho completo | Toggle por página | ✅ | `Editor.tsx:34-49,170` | — | — |
| Menú `/` en español + placeholder | Localizado | ✅ | Diccionario `es` + items custom (`Editor.tsx:250-337`) | — | — |
| Imagen: caption, resize, alineación | Manipulación directa | ⚠️ | Props de BlockNote (`caption`, `previewWidth`); resize sin verificar en vivo | P2 | S |

**Notas:** BlockNote 0.53 trae de serie bastante de lo que falta (resaltado con plugin, colores, resize);
gran parte de esta dimensión es *activar* capacidades, no construirlas. Lo único estructuralmente caro:
columnas interactivas, synced block y ecuaciones.

---

## 2. Tipos de propiedad de BD (~74 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| Cobertura de tipos | 23 tipos | ⚠️ | 21 en `FIELD_TYPES` (`services/db.ts:24`, Botón incluido — tanda 16); faltan **Lugar** y un **Título** real | P2 | — |
| Tipo Título | Tipo especial; abre la página, no se borra | ⚠️ | El título es "el primer campo `text`" (`routers/db.ts:207,337`); flexible pero implícito | P2 | M |
| Número: formatos | ~30 monedas, decimales configurables, %, barra **y anillo**, «mostrar número» | ✅ | €/$/£, decimales 0-3 o automático y Anillo con «Máximo» (tanda 23); más monedas si algún día hacen falta | — | — |
| Fecha: formato visible y hora 12/24 | Configurable (relativo, DD/MM/AAAA…) | ✅ | Largo/corto/relativo + reloj 12/24 por columna; la celda enseña el texto formateado y el clic edita (tanda 24) | — | — |
| Fecha: recordatorio en la celda | «Recordar 1 día antes» al poner la fecha | ⚠️ | El aviso existe pero centralizado: `notifications.checkDue` al abrir la app (`notifications.ts:50-122`), no configurable por celda | P2 | M |
| Fecha: zona horaria | Selector TZ | ❌ | Sin config en `Field.config` | P2 | M |
| Select/Status: colores de opción | 10 colores | ✅ | 10 en `Cell.tsx:216` COLOR_NAMES + variante dark (`56740cb`) | — | — |
| Opciones: reordenar arrastrando, renombrar/recolorear desde la celda | Edición in-place | ✅ | ⋯ por opción en el desplegable: nombre, color, grupo, borrar; drag reordena (tanda 13) | — | — |
| Persona | Varios, avatar, notifica | ✅ | `Cell.tsx:389-463`; sin notificación automática al asignar (solo menciones) | P2 | S |
| Archivos | Varios, preview, descarga | ✅ | Con renombrar inline (lápiz, tanda 23); el Asset conserva el nombre original | — | — |
| Relación bidireccional (campo espejo) | «Mostrar en <BD destino>» | ✅ | `mirror` en addRelation + sincronía en updateCell (`services/relations.ts`, `512a9aa`) | — | — |
| Relación: límite 1/∞, limpieza al borrar fila | Configurable y con cascada | ⚠️ | Limpieza al PURGAR hecha (`limpiaReferencias`); falta el límite 1/∞ | P2 | S |
| Rollup: agregaciones | ~24 (median, range, earliest/latest, % vacío, checked…) | ✅ | ~20 en `lib/rollup.ts` (`9287c3d`), probadas en check | — | — |
| Fórmula | ~70 funciones, tipos fecha/lista | ✅ | ~55 funciones con fechas/listas/`current` (`formula.ts`, `4d2939b`) | — | — |
| Botón (propiedad) | Acciones: editar props, abrir página, webhook | ✅ | Editar propiedades (tanda 16) + «Al terminar, abrir» página (`config.abrePageId`, tanda 22); webhook descartado (los webhooks salientes ya disparan con record.updated) | — | — |
| Lugar (mapa) | Dirección + mapa + vista Mapa | ❌ | No existe | P2 | L |
| Texto enriquecido en celdas | Negrita/enlaces/menciones dentro de una celda | ⚠️ | Markdown inline (`lib/mdInline.tsx`, tanda 17): negrita/cursiva/tachado/código/enlaces pintados en tabla y títulos de las 5 vistas; se edita el crudo (el valor sigue siendo string: filtros/CSV/API intactos). Sin menciones ni edición WYSIWYG | P2 | L |
| Menú de columna: duplicar propiedad, insertar izq/dcha, ocultar | Menú completo | ✅ | Clic en la cabecera abre el menú completo: nombre, ordenar, filtrar, ocultar, wrap, congelar, tipo, duplicar (con valores, jsonb), insertar izq/dcha, borrar (`TableView.tsx` FieldMenu, tanda 10) | — | — |
| Descripción de propiedad (ℹ) | Texto de ayuda por campo | ✅ | `Field.config.description` (sin migración): textarea en el menú de la columna + ℹ/tooltip (tanda 11) | — | — |
| Conversión de tipo | Convierte valores al cambiar tipo | ✅ | `services/db.ts:270-344`; multiselect divide por comas | — | — |
| ID único clicable | El ID enlaza a la fila | ✅ | Botón de copiar al pasar el ratón: URL absoluta `/p/…?r=…` (tanda 13) | — | — |

---

## 3. Vistas de BD (~50 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| **Tabla** — reordenar columnas arrastrando | Drag del encabezado | ✅ | Cabecera arrastrable + `moveField` en el servicio (tanda 10) | — | — |
| Tabla — selección múltiple + acciones masivas | Checkbox por fila, borrar/editar en lote | ✅ | `TableView.tsx:78-255` checkbox + barra de lote (`69b02b8`) | — | — |
| Tabla — fila de cálculos, agrupar+subagrupar, ancho, congelar, envolver, reordenar filas | — | ✅ | `TableView.tsx:427-485`, `DbToolbar.tsx:287-347`, `lib/calc.ts` | — | — |
| Tabla — abrir fila: modos peek lateral/central/completo | Selector side/center/full | ✅ | `view.config.openIn` + «Abrir filas en»; peek redimensionable y expandible; en las 6 vistas, Kanban incluido (tanda 10) | — | — |
| Tabla — navegación ↑↓ entre filas abiertas | Anterior/siguiente en el panel | ✅ | Prop `nav` en `RecordPanel.tsx`, cableada en Tabla sobre el orden visible (`d36aabb`) | — | — |
| Tabla — navegación por teclado entre celdas | Flechas + Enter edita + Esc | ✅ | Selección con anillo, rejilla recorrida por el DOM (`td[data-celda]`), Intro edita o abre el selector (tanda 14) | — | — |
| **Kanban** — agrupar por select/status/person/checkbox | + fecha | ✅ | `KanbanView.tsx:51-83` | — | — |
| Kanban — reordenar tarjetas DENTRO de una columna | Drag con orden manual | ✅ | Soltar sobre una tarjeta coloca encima/debajo (`moveRecord`); solo sin orden activo, como Notion (tanda 11) | — | — |
| Kanban — añadir grupo/opción desde el tablero | «+ Añadir grupo» | ✅ | Crea la opción del select/estado in situ (`KanbanView.tsx`, `a00f570`) | — | — |
| Kanban — ocultar columnas de grupo, agregados por columna, subagrupar | — | ✅ | Agregados (`kanbanSum`, tanda 12), ocultar columnas (`hiddenGroups`, tanda 15) y subagrupar en carriles plegables («Carriles por», `subGroupByFieldId`, tanda 18) | — | — |
| **Timeline** — zoom (día/semana/mes/trimestre/año) | Selector de escala | ✅ | Mes/Trimestre/Año con bandas de mes (`2ef0a92`) | — | — |
| Timeline — arrastrar para mover/redimensionar/crear | Interacción directa con barras | ✅ | Mover arrastrando + tirador de duración + línea de hoy (`2ef0a92`); crear arrastrando no | — | — |
| Timeline — dependencias (flechas) + tabla lateral | Ambas | ⚠️ | Tabla lateral ✅: columna de títulos fija (sticky) + sección «Sin fecha» con «Planificar hoy» (tanda 16); dependencias no (nicho familia) | P2 | L |
| Timeline — hoy marcado + botón Hoy | — | ✅ | `TimelineView.tsx:91-93,138` | — | — |
| **Calendario** — vista semana | Toggle mes/semana | ✅ | Toggle guardado en la vista (`bab6708`) | — | — |
| Calendario — arrastrar evento para cambiar fecha; crear arrastrando | Drag&drop | ✅ | Arrastrar a otro día conserva hora y duración (`2ef0a92`); crear sigue con el + | — | — |
| Calendario — multi-día, saltar a hoy | — | ✅ | `CalendarView.tsx:59-64,95` | — | — |
| Calendario — hora del evento visible | «9:00 Reunión» | ✅ | Hora delante del título si la hay (`2ef0a92`) | — | — |
| **Lista / Galería** — agrupar, tamaño tarjeta, preview | — | ✅ | `ListView.tsx:38-42`, `GalleryView.tsx:45-86` | — | — |
| Galería — ajuste de imagen (fit/cover) | Configurable | ✅ | La vista previa de Archivos pinta la imagen; `imageFit` recortar/entera (tanda 12) | — | — |
| **Gráfica** — 5 tipos, apilado, filtra antes de agregar, buckets de fecha | — | ✅ | `ChartView.tsx:49-162`, `db.ts:916` (commits recientes) | — | — |
| **Formulario** — compartir públicamente | URL pública tipo Notion Forms | ✅ | `/f/<token>` + `POST /api/form/<token>` (token en `view.config.publicToken`; validación por tipo en servidor; ocultar columna = quitar pregunta) — tanda 14 | — | — |
| Formulario — campos obligatorios, página de gracias personalizable | Validación + branding | ✅ | Obligatorios (asterisco, `requiredFields`, validados en cliente y endpoint) + mensaje de gracias editable (`thanksMessage`) — tanda 14 | — | — |
| **Comunes** — crear/renombrar/duplicar/borrar vista | — | ✅ | `DbToolbar.tsx:69-91` | — | — |
| Comunes — reordenar vistas arrastrando; vista por defecto | Drag de pestañas + default | ✅ | `View.order` fraccional + pestañas arrastrables; la primera es la default (tanda 11) | — | — |
| Comunes — límite de carga configurable (25/50/100) | Por vista | ⚠️ | 80 fijo + scroll infinito (`TableView.tsx:100-111`) — funcionalmente cubierto | P2 | S |
| Comunes — «Abrir como página completa» una BD embebida | Expandir | ✅ | Icono junto a las pestañas (`0c49c01`) | — | — |
| Comunes — copiar enlace a la vista; descripción de BD; bloquear BD | — | ✅ | Enlace por vista (`?v=`) y candado (tanda 23); descripción bajo el título (tanda 24) | — | — |

---

## 4. Filtros, orden, fórmulas, rollups, relaciones (filtros ~85 % · resto ~40 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| Matriz de operadores por tipo | Texto/número/select/status(grupo)/multiselect/person(`me`)/files/checkbox/fecha completa | ✅ | `viewData.ts:186-259` (`opsFor`) — implementada en los commits recientes | — | — |
| Anclas relativas en fecha (`{rel:"today"}`) | «es anterior a → Hoy» | ✅ | `viewData.ts:113-157`, UI `DbToolbar.tsx:662-681` | — | — |
| Grupos anidados 3 niveles + chips con popover | Editor avanzado | ✅ | `DbToolbar.tsx:490-579` (depth<3), chips `DbToolbar.tsx:784-853` | — | — |
| Filtrar por fórmula/rollup/relación | Fórmula según tipo de resultado; rollup any/every/none | ✅ | `conComputados` + operadores propios de formula/rollup; relación ya tenía selector (tanda 12) | — | — |
| Filtro personal («solo para mí») | Toggle «Save for everyone» | ❌ | Todo filtro va a `view.config` compartida | P2 | L |
| Orden multi-campo | + reordenar criterios | ✅ | `DbToolbar.tsx:156-219` | — | — |
| **Fórmulas: funciones de fecha** | ~15 (`now`, `dateAdd`, `dateBetween`, `formatDate`…) | ✅ | 14: now/today/parseDate/dateAdd/dateSubtract/dateBetween/formatDate/year/month/date/day/hour/minute/timestamp (`4d2939b`) | — | — |
| Fórmulas: funciones de lista | ~14 (`map`, `filter`, `sort`, `unique`…) | ✅ | map/filter/find/findIndex/some/every (con `current`/`index`), join/unique/sort/reverse/first/last/at/slice/includes/sum/mean | — | — |
| Fórmulas: texto avanzado | `replace`, `test`, `split`, `substring`, `trim`, `format`, `toNumber`… | ✅ | Todas esas + replaceAll/startsWith/endsWith/empty | — | — |
| Fórmulas: acceder a relaciones | `prop("Relación").map(…)` | ✅ | `prop("Relación")` = lista de títulos enlazados (props arbitrarias de la fila enlazada: vía rollup) | — | — |
| Fórmulas: editor con autocompletado/resaltado | Editor rico con ayuda | ⚠️ | Textarea plana + botones de campo (`shared.tsx:131-171`) | P2 | M |
| Rollup: 24 agregaciones | median/range/earliest/latest/%/checked… | ✅ | `lib/rollup.ts` (`9287c3d`) | — | — |
| Relación bidireccional / limpieza / límite | — | ✅ | Espejo + limpieza hechos (`512a9aa`); límite 1/∞ P2 (ver dimensión 2) | — | — |
| Motor único cliente+servidor | El mismo resultado en tabla, gráfica y API | ✅ | Cliente, `chartData` y `POST /query` de la API comparten `applyViewConfig` (`5792695`) | — | — |

---

## 5. Páginas, navegación, sidebar, búsqueda (~72 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| Sidebar: secciones Favoritos/Recientes/árbol | + Compartido + Teamspaces | ⚠️ | `Sidebar.tsx:195-286`; sin sección «Compartido» separada ni teamspaces (workspaces cubren el caso familia) | P2 | M |
| Árbol: drag&drop, + al pasar, menú contextual | Menú completo (Favorito, Copiar enlace, Renombrar, abrir en pestaña) | ✅ | Favorito y Copiar enlace añadidos (`055cc86`); renombrar se hace en la página (el título) | — | — |
| Búsqueda Ctrl+K por título y contenido | + recientes al abrir + filtros (creador/fecha) | ✅ | Recientes al abrir (`3ff6c77`) + chips de tipo y fecha de edición (tanda 21); sin filtro de creador (Page no guarda creador) | — | — |
| Breadcrumb clicable | Truncado con «…» si es largo | ✅ | `p/[pageId]/page.tsx:97-140` | — | — |
| Favoritos/Recientes reordenables | Drag | ✅ | Favoritos con `Favorite.order` fraccional + drag en el sidebar (tanda 13); Recientes son cronológicos por definición | — | — |
| Historial de versiones | + diff visual + para BD | ⚠️ | Snapshot/restaurar/autor OK y diff visual ✅ («Ver los cambios», `lib/diff.ts`, tanda 12); sigue siendo solo de docs, no de BD | P2 | M |
| Papelera con jerarquía y restaurar | + «borrado por» | ✅ | `trash/page.tsx`; «por X» con `Page.archivedById` (tanda 15) | — | — |
| Icono de página | Emoji **o imagen subida** | ✅ | «Subir una imagen» + `IconoPagina` en todos los sitios con icono (tanda 25) | — | — |
| Portada: reposicionar + galería (Unsplash) | Crop/offset | ✅ | «Reposicionar» arrastrando (`url:…|y=`, tanda 26); la galería Unsplash queda fuera (autoalojado sin llamadas a terceros) | — | — |
| Home/Inicio con widgets | Recientes, tareas, eventos | ❌ | `(app)/page.tsx:7-23` redirige a la primera página; `/my-tasks` cubre parte | P2 | L |
| Wiki (página verificada) | Verificación con caducidad | ❌ | No existe (nicho para familia) | P2 | L |
| Duplicar página con copia profunda | — | ✅ | `pages.ts:448-474,575-681` con remapeo de IDs | — | — |
| Copiar enlace privado (botón) | En menú y cabecera | ⚠️ | Solo URL pública en `SharePublish.tsx:77-93` | P2 | S |
| Deep-links a bloque/heading (#anchor) | Copiar enlace al bloque | ✅ | «Copiar enlace al bloque» en el tirador + salto con destello al abrir /p/<id>#<bloque> (tanda 20) | — | — |
| Peek: abrir página en panel lateral | Ctrl+clic → peek | ❌ | Solo navegación completa (las filas de BD sí tienen `RecordPanel`) | P2 | M |
| Atajos de navegación | Ctrl+P, Ctrl+[ ], Ctrl+Shift+L | ✅ | Ctrl+K, Ctrl+\, Ctrl+Alt+N, ?, Ctrl+Mayús+L (tema) y Ctrl+[ ] atrás/adelante (tanda 15; Ctrl+P es Ctrl+K) | — | — |
| Notificaciones por comentario/asignación | Además de menciones y vencimientos | ✅ | Tipos `comment` y `assign` con push y bandeja (`comments.ts`, `db.ts updateCell`, `598a9ee`) | — | — |
| Multi-workspace con selector | — | ✅ | `Sidebar.tsx:469-536` | — | — |

---

## 6. Colaboración, compartir, permisos (~62 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| Tiempo real en páginas doc | Yjs + persistencia + offline | ✅ | `collab/hocuspocus.ts:27-93`, `server.mjs`, `useCollaboration.ts:76-120` (y-indexeddb en :104); comprobado en producción 20-ago | — | — |
| **Tiempo real en BD** | Tablas/propiedades/vistas sincronizan en vivo | ✅ | Señal por la sala Yjs de la página + invalidación (`useDbLive.ts`, `87af34f`); no es CRDT pero se ve al momento | — | — |
| Conflictos en celdas | CRDT también en propiedades | ⚠️ | Merge atómico por campo en Postgres (`01030f3`): campos distintos nunca se pisan; la MISMA celda a la vez gana el último, como Notion | P2 | L |
| Cursores + presencia | Nombre/color + avatares | ✅ | `Presence.tsx:12-53` | — | — |
| Comentarios de página + inline con resolver | — | ✅ | `CommentsPanel.tsx`, `YjsThreadStore` (`useCollaboration.ts:111-116`) | — | — |
| Respuestas anidadas + reacciones emoji | En cualquier comentario | ⚠️ | Reacciones ✅ (`Comment.reactions` + pills con toggle, tanda 26); respuestas anidadas no (el hilo plano cubre a una familia) | P2 | M |
| Editar comentario propio | Editar además de borrar | ✅ | `comments.edit` + lápiz inline (`7eb2fee`) | — | — |
| @mención dentro de un comentario | Notifica | ✅ | «@Nombre» casa contra los miembros (sin mayúsculas/acentos) y avisa con push al hilo (tanda 26); sin autocompletar (texto plano a propósito) | — | — |
| Comentarios en filas/celdas de BD | Discusión por registro | ✅ | `Comment.recordId` + sección Comentarios en la ficha (`CommentThread`, tanda 11); por celda/propiedad no (nicho) | — | — |
| **Permisos por página** | Total/editar/comentar/ver + herencia + restaurar | ✅ | `Page.restricted` + `PagePermission`, `services/perms.ts`, impuesto en pages/db/comments/colaboración (`16350aa`); API v1 exenta (token de espacio) | — | — |
| Invitados externos por página | Email con acceso a UNA página | ❌ | Solo invitación al workspace | P1 | L |
| Grupos de miembros | Permisos por grupo | ❌ | Sin modelo | P2 | M |
| Publicar: duplicar-como-plantilla, SEO, caducidad, contraseña | Opciones del share público | ⚠️ | `/s/[token]` solo on/off; resuelve BD embebidas (`s/[token]/page.tsx:54-61`) | P2 | M |
| Subpáginas públicas navegables | El share incluye hijos | ❌ | Cada página se publica por separado | P2 | M |
| Feed «Actualizaciones» por página + Editado por X hace Y | Actividad visible | ❌ | Solo versiones; sin `lastEditedBy` visible en cabecera | P2 | M |
| Seguir página (watch) | Aviso de cambios | ❌ | Sin modelo de suscripción | P2 | M |
| Push reales + diagnóstico | — | ✅ | `push.ts:39-71`, `api/health`, Ajustes→Estado (`settings/page.tsx:220-246`) | — | — |

---

## 7. Aspecto, estética, UX (~72 % estructural)

*(La marca naranja y las fuentes Bricolage/Hanken/Plex Mono son intencionadas y NO cuentan como desviación.)*

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| **Pills de etiqueta en modo oscuro** | Cada color tiene variante dark legible | ✅ | `--tag-*` claro/oscuro en `globals.css:45-69`; texto `var(--tag-fg)` (`56740cb`) | — | — |
| Colores de etiqueta | 10 | ✅ | `cellText.ts:86` OPTION_COLORS con 10 | — | — |
| **Diálogos nativos** | Notion jamás usa `confirm()` | ✅ | Modal propio `Confirmar.tsx` (singleton con promesa) en los 8 sitios (`5da0b35`) | — | — |
| Densidad de tabla | Filas ~32px, celdas 14px | ✅ | `py-1.5` (~32px de fila) en las celdas de `TableView.tsx` (`7db1359`) | — | — |
| Ancho de contenido del editor | 708px centrado / full | ✅ | `max-w-3xl` centrado + toggle Ancho completo (`Editor.tsx:251`); la fila anterior estaba desfasada | — | — |
| Sidebar redimensionable | Drag del borde | ✅ | 200–480px persistente en localStorage (`055cc86`) | — | — |
| Sidebar peek al pasar el ratón (plegado) | Hover-reveal | ✅ | Panel flotante al pasar por el borde o el botón, con 300ms de gracia (`AppShell.tsx`, tanda 23) | — | — |
| Transiciones/micro-animaciones | Hover, apertura de popovers, colapsos suaves | ✅ | Menús con fundido de 120ms vía `[data-menu]` respetando reduced-motion (tanda 22) | — | — |
| Skeletons de carga | Shimmer en tablas/páginas | ✅ | `.esqueleto` en `globals.css`; página, BD y BD embebida (tanda 13) | — | — |
| Tooltips con atajo | Estilizados, kbd a la derecha | ⚠️ | Solo `title=""` nativo; kbd solo en la ventana Atajos (`Shortcuts.tsx:107-112`) | P2 | M |
| Menús: separadores, altura de item | Dividers + ~28px + kbd hints | ⚠️ | `Popover.tsx:92` bien (radius/sombra); faltan dividers | P2 | S |
| Toast genérico con Deshacer | Sistema de toasts | ✅ | `Toast.tsx` (host en AppShell); borrar fila suelta/lote/ficha con «Deshacer» y sin confirmación (tanda 13) | — | — |
| Modo oscuro base, scrollbars, focus, z-index, iconos lucide, headings responsive, táctil 40px | — | ✅ | `globals.css:20-77,232-260`; z-index ordenado | — | — |
| Página pública /s/ con tema | — | ✅ | `PublicView.tsx:30-50` | — | — |
| Drag&drop: ghost/indicadores | Línea de inserción + ghost | ⚠️ | Línea sí (`Sidebar.tsx:783-789`); sin ghost | P2 | S |
| Indicador de guardado | «Guardando…/Guardado» visible | ✅ | Se muestra en la barra del editor (`Editor.tsx:188-194`; la fila estaba desfasada) | — | — |

---

## 8. Plantillas, import/export, API, PWA, atajos (~58 %)

| Área | Qué hace Notion | Estado | Evidencia | Sev. | Esf. |
|---|---|---|---|---|---|
| Galería de plantillas | Miles + categorías + crear la tuya | ⚠️ | 6 fijas sin categorías (`lib/templates.ts:21-185`); no se puede guardar una página propia como plantilla | P2 | M |
| Plantillas de fila + default | Marcar una como predeterminada | ✅ | Estrella en «Nueva fila ▾» (`setDefaultTemplate`, tanda 12) | — | — |
| **Importar ZIP de export de Notion** | Migración completa | ✅ | `lib/importNotion.ts` en cliente (fflate): jerarquía, BDs, adjuntos y enlaces (`ff8b7d5`); omite los .md de filas de BD | — | — |
| Importar MD / CSV | + frontmatter, tipos autodetectados, a BD existente | ⚠️ | MD y CSV con **tipos autodetectados** (`lib/csvTipos.ts`, `3af6270`); falta importar a BD existente (append/merge) | P2 | M |
| Importar HTML / Word / Evernote / Trello | Soportados | ❌ | No existen | P2 | L |
| Exportar página con subpáginas (ZIP) | Árbol completo + imágenes | ✅ | `pages.exportTree` + `lib/exportZip.ts` (MD+CSV+adjuntos, tanda 12) | — | — |
| Exportar PDF / HTML | Por página o árbol | ❌ | No existe | P2 | M |
| Backup del workspace completo | Export total | ✅ | Ajustes → Copia de seguridad (mismo export con pageId null, tanda 12) | — | — |
| API: CRUD de páginas/BD/campos/vistas/registros | — | ✅ | `src/app/api/v1/**`, `docs/api.md` al día | — | — |
| **API: paginación** | Cursor + `page_size` | ✅ | `GET /databases/:id/records?limit&cursor` con `next_cursor`/`has_more` (`5d01eb3`, probado en check-api) | — | — |
| API: filtros y sorts en la query | Body `filter`/`sorts` como Notion | ✅ | `POST /databases/:id/query` con `applyViewConfig` (`5792695`), en docs y check-api | — | — |
| API: search endpoint + rate limit | — | ❌ | Search solo en tRPC; sin rate limit (`apiAuth.ts`) | P2 | M |
| Webhooks firmados con reintentos | — | ✅ | `webhooks.ts`, backoff 1s/5s/25s | — | — |
| PWA: manifest + SW + push | — | ✅ | `manifest.ts`, `public/sw.js:38-108` | — | — |
| PWA: datos de BD offline | Notion cachea lo visitado | ⚠️ | Solo app-shell; docs offline vía y-indexeddb, BD no | P2 | L |
| Atajos: cobertura | ~15+ (turn-into Ctrl+Shift+0-9, nav Ctrl+[ ], tema) | ⚠️ | 4 globales + los de BlockNote (`AppShell.tsx:36-61`) | P2 | S |
| Markdown al escribir + `:emoji:` + `@fecha` | En vivo | ⚠️ | BlockNote cubre los básicos (#, -, [], >, ```) y el `:emoji:` YA viene de serie (el default UI monta el emoji picker con «:»; la auditoría lo daba por ausente — corregido tanda 22); sin `@fecha` | P2 | M |

\* P0 relativo al objetivo declarado («paridad 1:1 y migrar desde Notion»); si nadie migra datos ni usa la API con BD grandes, tratar como P1.

---

## Plan de trabajo priorizado por fases

Agrupado en bloques delegables (cada bloque es autocontenido y cabe en una sesión de trabajo o pocas).

### FASE 0 — P0: lo que cualquier usuario nota a diario

**Bloque 0.A — Editor esencial (S-M, el mejor ratio esfuerzo/impacto de toda la auditoría)**
1. ~~Configurar `uploadFile` de BlockNote apuntando a `/api/upload`~~ ✅ (`8f5c884`).
2. ~~Activar resaltado de sintaxis en el bloque de código~~ ✅ (`dc00069`).
3. ~~Colores de texto y fondo~~ ✅ (verificados de serie en BlockNote; callout a 10 colores en `28d9f6e`).

**Bloque 0.B — Tabla: filas en serio (M-L)**
4. ~~Selección múltiple de filas con acciones masivas~~ ✅ (`69b02b8`; borrar en lote reversible + editar propiedad; duplicar en lote no incluido).
5. ~~Densidad de fila ~32px~~ ✅ (`7db1359`).

**Bloque 0.C — Modo oscuro y diálogos (S-M)**
6. ~~Variante oscura de `OPTION_COLORS` + 10 colores~~ ✅ (`56740cb`).
7. ~~Sustituir los 8 `confirm()` por un modal propio~~ ✅ (`5da0b35`, `Confirmar.tsx`).

**Bloque 0.D — Permisos por página (L, el P0 caro)**
8. ~~ACL por página con herencia, impuesta en servidor~~ ✅ (`16350aa`; el toggle Restringir es el «override» y quitarlo restaura la herencia).

**Bloque 0.E — Datos dentro/fuera (M-L; P0 si el objetivo es migrar desde Notion)**
9. ~~Importar el ZIP de export de Notion~~ ✅ (`ff8b7d5`, + tipos de CSV en `3af6270`).
10. ~~Paginación por cursor en la API REST de registros~~ ✅ (`5d01eb3`, + filtros/orden en `5792695`).

**→ FASE 0 COMPLETA (21-ago-2026).**

### FASE 1 — P1: paridad al usarlo en serio

**Bloque 1.A — Motor de datos (fórmulas/relaciones/rollups)**
- ~~Fórmulas 2.0~~ ✅ (`4d2939b`); el editor con autocompletado queda como P2.
- ~~Relación bidireccional (campo espejo) + limpieza de referencias~~ ✅ (`512a9aa`); el límite 1/∞ queda P2.
- ~~Rollups: median, range, earliest/latest, %…~~ ✅ (`9287c3d`).
- Filtrar por fórmula/rollup/relación (operadores según tipo de resultado; rollup any/every/none).

**Bloque 1.B — Vistas interactivas**
- ~~RecordPanel: modos peek lateral/central/pantalla completa + navegación anterior/siguiente~~ ✅ (tanda 10); quedan los comentarios de fila (necesita `Comment`→`Record` del bloque 1.D).
- Timeline: zoom día/semana/mes/trimestre/año, arrastrar para mover/redimensionar/crear, tabla lateral; dependencias después.
- Calendario: arrastrar eventos, crear arrastrando, hora visible, vista semana.
- Kanban: reordenar dentro de la columna, añadir grupo desde el tablero, agregados por columna.
- Comunes: ~~reordenar columnas de tabla arrastrando~~ ✅ (tanda 10), vista por defecto + reordenar pestañas de vista, ~~abrir BD embebida como página completa~~ ✅.
- Formulario: página de gracias configurable (~~URL pública~~ ~~campos obligatorios~~ ✅ tanda 14).

**Bloque 1.C — BD en tiempo real (o mitigación)**
- ~~Camino corto: señal de invalidación por el WebSocket de /collab + merge por celda~~ ✅ (`87af34f`, `01030f3`; el merge fue mejor que comparar `updatedAt`: jsonb atómico en Postgres, sin falsos conflictos).
- Camino largo (paridad real): mover `Record.cells` a Yjs. Solo si el corto se queda corto en la práctica.

**Bloque 1.D — Colaboración y páginas**
- Comentarios: en filas de BD, editar el propio, notificar al comentar y al asignar persona.
- Historial: diff visual entre versiones; «Editado por X hace Y» en cabecera.
- Deep-links a bloque (#blockId con scroll; BlockNote expone IDs de bloque en el DOM).
- Copiar enlace (privado) en el menú del árbol y en cabecera; renombrar desde el árbol.
- Export: página con subpáginas a ZIP (MD + imágenes), backup del workspace.
- API: `filter`/`sorts` en el body reutilizando `applyViewConfig`, endpoint search.
- Sidebar redimensionable.
- Editor: bloque «enlace a página»/subpágina desde `/`, menú de bloque con «Convertir en» incluyendo los bloques custom.

### FASE 2 — P2: pulido y nicho (elegir a demanda)

- **Editor:** ecuaciones KaTeX, bloque sincronizado, bloque botón, breadcrumb block, `@fecha`, embeds Figma/X/Maps/PDF/iframe genérico, ancho de columnas arrastrando y drag-to-create-column, comentarios por bloque, estilo por página (Serif/Mono/pequeño), export fiel de BD y columnas.
- **BD:** tipo Botón (propiedad), Lugar + vista Mapa, texto enriquecido en celdas, descripción de propiedad, anillo en Número, monedas/decimales, zona horaria y formato de fecha, recordatorio por celda, reordenar/renombrar opciones in place, duplicar/insertar columna, ID clicable, subagrupar Kanban, agregados en Kanban, semana en Calendario si no cayó en Fase 1.
- **Navegación:** Home con widgets, wiki/verificación, peek de páginas, filtros de búsqueda + recientes al abrir Ctrl+K, favoritos/recientes reordenables, icono-imagen, portada reposicionable + galería, «borrado por» en papelera, atajos restantes (Ctrl+Shift+L, Ctrl+[ ], turn-into), `:emoji:`.
- **Colaboración:** reacciones + hilos anidados, @mención en comentarios, seguir página, feed de actualizaciones, grupos de miembros, publicación con contraseña/caducidad/duplicar-como-plantilla, subpáginas públicas navegables.
- **UX:** skeletons, sistema de toasts con Deshacer genérico, tooltips estilizados con kbd, dividers en menús, micro-transiciones (popovers, colapsos), sidebar peek, ghost de drag, indicador de guardado visible, ancho 708px del editor, plantillas propias + categorías, PWA con datos de BD offline, rate limit en la API.

---

### Advertencias de fiabilidad de esta auditoría

- Todo lo marcado con evidencia se leyó del código; aun así, lo que depende del comportamiento por defecto de BlockNote (colores en toolbar, resize de imagen, turn-into) conviene confirmarlo en el navegador antes de darlo por hecho o por roto.
- Dos correcciones sobre informes intermedios, verificadas a mano: **NO** hay reordenar columnas arrastrando (el drag de `TableView.tsx` es ancho de columna y orden de filas) y los `confirm()` nativos son **8**, no 4.
- `docs/notion-parity.md` sigue siendo fiable como inventario de lo hecho; este documento lo complementa con el detalle de lo que falta y su prioridad. Al cerrar cada bloque del plan, actualizar ambos.
