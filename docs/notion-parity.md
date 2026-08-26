# Notiono — Biblia de paridad con Notion

> Documento maestro para llevar Notiono lo más cerca posible de Notion 1:1.
> **Inventario verificado leyendo el código el 19-ago-2026** (última revisión: commit ~414ca6c). Sustituye al
> gap-analysis de agosto-2026, que se había quedado muy desfasado.
> Leyenda: ✅ hecho · 🟡 parcial · ❌ falta.
>
> Regla al actualizar este doc: marca ✅ solo lo que exista en el código, con el nombre real
> del fichero o del símbolo. Si dudas, ábrelo y míralo.

---

## 0. Retrato del estado actual

Notiono es hoy un Notion self-hosted funcional para una familia: páginas de bloques con
autosave, árbol de páginas, 8 tipos de vista de base de datos, 21 tipos de campo, comentarios,
menciones, notificaciones, historial de versiones, publicación web, plantillas, import/export,
API REST y PWA instalable. Lo que falta es, sobre todo, **colaboración simultánea**, **bloques
avanzados** (columnas, embeds) y **permisos por página**.

---

## 1. BASES DE DATOS

### 1.1 Tipos de propiedad

Lista real: `FIELD_TYPES` en `src/server/routers/db.ts` y `TYPES`/`FIELD_LABELS` en
`src/components/database/shared.tsx`.

| Tipo | Notion | Notiono |
|---|---|---|
| Título / Texto | ✅ | 🟡 no hay tipo "título": el título es el primer campo `text`. Con **texto enriquecido** vía markdown inline (**negrita**, *cursiva*, `código`, ~~tachado~~, enlaces), pintado en todas las vistas; se edita el crudo |
| Número | ✅ | ✅ formatos normal, euros, porcentaje y barra (con máximo configurable); falta anillo |
| Selección / Selección múltiple | ✅ | ✅ `select`, `multiselect` — 10 colores, crear al vuelo y editar desde el desplegable (renombrar, color, borrar, reordenar arrastrando) |
| Estado | ✅ | ✅ `status` con grupos Por hacer / En curso / Hecho y opciones movibles entre grupos |
| Fecha | ✅ | ✅ `date` con hora, rango y recordatorio en la bandeja al llegar el día |
| Casilla / URL / Correo / Teléfono | ✅ | ✅ |
| **Persona** | ✅ | ✅ `person` — varios miembros del espacio, avatar de iniciales, filtro por persona |
| **Archivos y multimedia** | ✅ | ✅ `files` — adjuntos a `/api/upload` (máx. 8 MB), miniatura si es imagen |
| Fecha de creación / Última edición | ✅ | ✅ `created_time`, `last_edited_time` |
| **Creado por / Editado por** | ✅ | ✅ `created_by`, `last_edited_by` (`Record.createdById/updatedById`) |
| ID único | ✅ | ✅ `id` con `seq` por colección, prefijo editable y botón para copiar el enlace de la fila |
| Botón | ✅ | ✅ `button` — al pulsarlo aplica valores a la fila (casilla, estado, fecha de hoy, número, texto); en Notion además abre páginas/webhooks |
| Relación | ✅ | 🟡 `relation` unidireccional (sin campo espejo en la BD destino) |
| Rollup | ✅ | 🟡 `count, sum, avg, min, max, values` |
| Fórmula | ✅ | 🟡 evaluador propio, 13 funciones (ver 1.4) |
| **Botón** (acciones) | ✅ | ❌ |
| **Lugar** (mapa) | ✅ | ✅ `location` — buscador de direcciones (Nominatim/OSM vía `/api/geo`), mini-mapa Leaflet en la celda y «Cómo llegar» |

**Siguiente en prioridad:** del catálogo de tipos solo queda el matiz del Botón
(abrir páginas/webhooks) y un tipo Título explícito; el resto está.

### 1.2 Tipos de vista

Notiono tiene 8 (`VIEW_TYPES` en `DbToolbar.tsx`): ✅ Tabla, Kanban, Lista, Galería, Calendario,
**Cronograma/Timeline**, Gráfica, Formulario (con **enlace público** `/f/<token>`: cualquiera
con el enlace envía filas sin cuenta; ocultar una columna en la vista la quita del formulario,
y hay **campos obligatorios** con asterisco, validados también en el servidor, y **mensaje
de gracias personalizable**).
Faltan de Notion: ❌ **Mapa** (requiere campo Lugar), ❌ **Feed**, ❌ **Panel/Dashboard** con
widgets y filtros globales.

### 1.3 Configuración de vistas

Hecho:
- ✅ **Filtros con grupos AND/OR anidados** (`FilterNodesEditor`, `viewData.ts`), hasta 2 niveles, con `está vacío` / `no está vacío` en todos los tipos y **fechas relativas** (hoy, esta semana, este mes, últimos/próximos 7 días).
- ✅ **Agrupar en Tabla** en secciones plegables con contador y subtotales por grupo; selector de campo de agrupación también para el Kanban.
- ✅ **Búsqueda interna** de la base de datos (lupa en la barra de vistas).
- ✅ **Orden multi-campo**; Selección y Estado ordenan por el orden de sus opciones.
- ✅ **Visibilidad de propiedades** por vista (botón «Propiedades», `hiddenFields`).
- ✅ **Fila de cálculos** en Tabla: Contar todo, No vacías, Vacías, % no vacías, Suma, Media, Mín, Máx.
- ✅ **Card size** (pequeña/media/grande) y **card preview** en Kanban y Galería.
- ✅ **Panel de registro** lateral (`RecordPanel.tsx`) con propiedades editables + cuerpo de bloques, en Tabla, Calendario, Cronograma, Galería y Lista.
- ✅ Renombrar/borrar vista, «Mostrar como», exportar CSV, campo de fecha del Calendario, inicio/fin del Cronograma, config de Gráfica (barras/líneas/tarta/donut × contar/sumar/media).
- ✅ **Cronograma con tabla lateral fija** (los títulos no se van con el scroll horizontal; clic abre la ficha) y sección **«Sin fecha»** con «Planificar hoy».
- ✅ **Dependencias en el Cronograma**: flechas entre tareas vía una relación de la BD consigo misma (selector «Dependencias» con «+ Crear campo Bloqueada por»); se crean arrastrando del puntito del fin de una barra a otra barra y se quitan desde la ficha.

Falta:
- ✅ **Agrupar** en Tabla, Kanban, Lista y Galería, y **subagrupar** en la Tabla y en el Kanban (carriles horizontales plegables). En el Kanban, además, **suma por columna** y **ocultar columnas de grupo** (con sección «Ocultas» para recuperarlas).
- ✅ **Duplicar vista** con todos sus ajustes.
- ✅ **Panel de registro** también en Kanban; **modos side/center/página completa** (`view.config.openIn`, selector «Abrir filas en», defaults de Notion; página completa = `/p/<pageId>?r=<recordId>`); **peek redimensionable** arrastrando el borde (localStorage) y botón de expandir; **Escape** cierra menús y panel; **comentarios de fila** en la ficha (`Comment.recordId`, con aviso y push).
- ✅ **Ancho de columna** ajustable arrastrando y persistente por vista (doble clic vuelve al automático).
- ✅ **Congelar columnas** al desplazar en horizontal: se elige hasta cuál en el menú de la columna (por defecto la primera). ✅ **Envolver texto por columna** (`wrapCols`; texto, URL, correo y teléfono envuelven **de fábrica** y el clic en el valor envuelto edita), con **toda la fila alineada arriba** y **barra de scroll horizontal siempre visible** (pulgar en `--muted`). ✅ **Número** con €/$/£, decimales fijos y **anillo** de progreso. ✅ **Renombrar adjuntos**. ✅ **Copiar enlace a la vista** (`?v=`). ✅ **Bloquear página/BD** (candado anti-accidentes). ✅ El **panel plegado asoma** al pasar el ratón por el borde. ✅ **Formato de fecha** por columna (largo/corto/relativo, reloj 12/24) con la celda como texto y clic para editar. ✅ **Descripción de la BD** bajo el título y **menú de cabecera completo al hacer clic** (nombre editable, ordenar asc/desc, filtrar, ocultar, ajustar texto, congelar, tipo, duplicar propiedad con valores, insertar izquierda/derecha, borrar). ✅ **Celdas con acciones al pasar el ratón**: ABRIR en el título, copiar en texto/URL/correo/tel, «Expandir» cuando el contenido no cabe (popup editable).
- ✅ **Reordenar filas arrastrando** (cuando la vista no tiene orden ni agrupación) y **duplicar fila** con sus subtareas.
- ✅ **Reordenar columnas arrastrando** la cabecera (`moveField`, orden fraccional).
- ✅ **Navegación por teclado en la Tabla**: clic selecciona la celda, flechas para moverse (sobrevive a grupos y subtareas), Intro edita o abre el selector, Escape sale.
- ❌ Fila de cálculos fuera de la Tabla.
- ✅ **Plantillas de fila** («Nueva fila ▾», guardadas desde la ficha de una fila).
- ✅ **Color de fila y de tarjeta** por la opción de una etiqueta («Color por»).
- ✅ **Cambiar el tipo** de una columna ya creada, convirtiendo los valores.
- ✅ **Vistas enlazadas**: el menú `/` inserta una base de datos que ya existe en cualquier página.
- ✅ **Color condicional por reglas** («si vence antes de hoy, en rojo»), además del color por etiqueta.
- ✅ **Borrar fila es reversible** (se archiva y el toast trae «Deshacer»; sin diálogo de confirmación, como Notion).
- ✅ **Papelera de filas** con listado, restaurar, borrar para siempre y purga a los 30 días.
- ❌ Bloquear esquema.

### 1.4 Relaciones, rollups y fórmulas

- 🟡 **Relación**: unidireccional. Falta campo espejo («Mostrar en …»), límite 1/∞ y limpieza de referencias al borrar una fila.
- 🟡 **Rollup**: `count, sum, avg, min, max, values`. Faltan `percent_empty`, `median`, `range`, fechas (`earliest`/`latest`) y % marcado.
- 🟡 **Fórmulas** (`src/server/formula.ts`, parser propio sin `eval`): 13 funciones — `if, round, floor, ceil, abs, min, max, concat, length, upper, lower, contains, coalesce`; operadores aritméticos, comparaciones y `and/or/not`; `prop("Campo")` por nombre. Faltan todas las de fecha (`now`, `dateAdd`, `dateBetween`, `formatDate`), `replace`, `slice`, `join`, `test`, `format`, `toNumber`, `empty`, y referenciar una fórmula desde otra. La ayuda de la UI (`shared.tsx`) lista menos funciones de las que el motor soporta.

### 1.5 Otros de base de datos

- ✅ **Sub-elementos** (`Record.parentId`, árbol expandible, `db.addSubRecord`).
- ✅ **Bases de datos embebidas** en una página (bloque `database`, `db.createInline`).
- ✅ Fila como página (`Record.content` con editor de bloques completo).
- ✅ Import/export CSV.
- ✅ **Comentarios de fila** (`Comment.recordId`, hilo en la ficha). ❌ Comentarios por propiedad.

---

## 2. EDITOR Y BLOQUES

Schema único en `src/components/editor/mention.tsx` (`editorSchema`), compartido por el editor,
el panel de registro, el historial y las páginas publicadas.

- ✅ De BlockNote 0.53 (**ahora en español**: el diccionario `es` estaba sin usar): párrafo, encabezados 1-6 y **encabezado plegable**, listas (viñeta, numerada, tareas, toggle), cita, código, divisor, imagen, vídeo, audio, fichero, tabla, enlaces.
- ✅ Propios: bloques **`database`** (BD embebida o enlazada, que recuerda su vista), **`callout`** («Llamada»), **`toc`** (tabla de contenidos) y **`bookmark`** («Enlace web»: tarjeta OpenGraph o reproductor de YouTube/Vimeo); inline **`mention`** (@página) y **`personMention`** (@persona, que notifica).
- ✅ Autosave (800 ms contenido / 600 ms título), export a Markdown, portada, icono emoji, ancho completo, solo-lectura para `viewer`.
- ✅ **Columnas** (dos o tres, desde el menú `/`): hechas a mano con los mismos nombres de bloque que el paquete de pago de BlockNote (`columnList`/`column`), cuyas clases CSS ya vienen en la hoja de estilos. Con **ancho ajustable arrastrando** el borde entre columnas y **«+» para añadir columna** a un layout ya creado (solo ratón). En el móvil se apilan. ❌ Crear columnas arrastrando un bloque al lado de otro.
- ✅ **«/subpágina»**: crea una página hija colgando de la actual y la enlaza en el sitio del cursor con la mención.
- ❌ **Sync block**, **breadcrumb block**, **botón**, embeds de Maps/Figma/PDF, **ecuación**, **subpágina embebida** como bloque.
- ✅ **Comentarios en línea** sobre una selección, con respuestas y resolver (`YjsThreadStore`: los hilos viajan dentro del documento compartido).
- ❌ **@fecha** en el editor.
- ✅ **«Convertir en → Llamada»** en la barra de formato y **«Copiar enlace al bloque»** en el menú del tirador: la URL `/p/<página>#<bloque>` abre la página, salta hasta el bloque y lo destaca. ❌ «Mover a» por bloque y selección multibloque con acciones masivas.
- ❌ Estilo por página (tipografía Default/Serif/Mono, texto pequeño).
- ✅ **Backlinks**: sección «N enlaces entrantes» al pie de la página (`pages.backlinks`).

---

## 3. COLABORACIÓN, PERMISOS Y ORGANIZACIÓN

- ✅ Espacios compartidos con roles `owner` / `editor` / `viewer` (`viewer` no puede mutar nada: se bloquea en `workspaceProcedure`, no solo en la UI).
- ✅ **Comentarios** de página con resolver y borrar (`CommentsPanel.tsx`).
- ✅ **Menciones** @página y @persona + **bandeja de notificaciones** con contador.
- ✅ **Historial de versiones** con UI (snapshot con throttle de 2 min, últimas 50, restaurar). Solo páginas `doc`.
- ✅ **Buscador global Ctrl+K**, que busca por título y **dentro del texto de los bloques**, con **filtros** de tipo (Páginas/Bases de datos) y de edición reciente (Hoy/7/30 días).
- ✅ **Favoritos** (reordenables arrastrando) y **Recientes** en el sidebar.
- ✅ **Papelera** con jerarquía, retención de 30 días con purga perezosa, vaciar, buscar y «borrado por».
- ✅ **Publicar página en la web** (`/s/<token>`, solo lectura, resuelve también las BD embebidas).
- ✅ **Recordatorios**: al abrir la app avisa en la bandeja de lo que tienes asignado y ya vence.
- ✅ **Colaboración en tiempo real**: edición simultánea, cursores con nombre y **avatares de presencia** en la cabecera.
- ❌ **Compartir por página** con herencia padre→hijo; niveles «puede comentar» / «acceso total».
- ❌ Hilos anidados y reacciones en comentarios; seguir página.
- ❌ Publicación con contraseña, caducidad o control de indexación.

---

## 4. UX, NAVEGACIÓN Y DISEÑO

- ✅ **Barra superior**: miga de pan, ⭐ favorito, menú ⋯, publicar, comentarios, historial.
- ✅ **Mover a…** con buscador de páginas; **Duplicar** con copia profunda.
- ✅ **Portada** de página (degradados, URL o imagen subida) e icono emoji.
- ✅ **Tema claro/oscuro manual** (`data-theme`, sin parpadeo al cargar).
- ✅ **Plantillas**: galería con 6 (tareas, notas de reunión, CRM, presupuesto, diario, wiki).
- ✅ **Import/Export**: Markdown ↔ página, CSV ↔ base de datos, **página con subpáginas a ZIP** y **copia de seguridad del espacio entero** (Ajustes; MD + CSV + adjuntos). ❌ PDF y HTML.
- ✅ **PWA instalable** + responsive con drawer; iconos y favicon de marca; iconos de interfaz lucide.
- ✅ **API REST v1** con tokens por espacio (`docs/api.md`).
- 🟡 **Atajos de teclado**: Ctrl+K (buscar), Ctrl+\ (plegar el panel), Ctrl+Alt+N (nueva página), Ctrl+Mayús+L (modo oscuro) y Ctrl+[ / Ctrl+] (atrás/adelante). Faltan favorito, cambiar de vista y mover bloque.
- ✅ **Tooltips estilo Notion** en los botones del panel: pastilla propia con el atajo en la segunda línea (`data-pista`/`data-atajo` en CSS puro, solo con ratón).
- ✅ **Mis tareas** (`/my-tasks`): lo que tengo asignado por un campo Persona en cualquier base de datos.
- ❌ **Home/Inicio** personalizable.
- ✅ Reposicionar la portada arrastrando. ❌ Galería de imágenes de portada (Unsplash: llamadas a terceros, fuera a propósito).

---

## 5. HOJA DE RUTA

> Hecho el 19-ago-2026: campos Persona, Archivos, Creado por/Editado por · agrupar en Tabla ·
> filtros de vacío y fechas relativas · buscador interno de BD · búsqueda global por contenido ·
> Mis tareas · bloques Llamada y Tabla de contenidos.

> Hecho también el 19-ago-2026 (segunda mitad): fechas con hora y rango · cambiar el tipo de
> una columna · color por etiqueta · plantillas de fila · grupos del campo Estado.

> Hecho también el 19-ago-2026 (tercera tanda): recordatorios de fecha · agrupar en Lista y
> Galería · vistas enlazadas (que recuerdan su vista) · congelar la primera columna ·
> bloque «Enlace web» con vista previa y vídeo incrustado · editor en español.

> Hecho también el 19-ago-2026 (cuarta tanda): reglas de color · borrado reversible de filas ·
> papelera de filas · webhooks salientes · **notificaciones push reales**.

> Hecho también el 20-ago-2026: comentarios en línea y su panel lateral · presencia ·
> webhooks con más eventos y reintentos · edición simultánea servida por la propia app en
> `/collab` · edición sin conexión (y-indexeddb) · subagrupar en la Tabla.

> Hecho también: envolver texto · duplicar vista · Kanban por responsable o por casilla.

**A — Lo siguiente, barato y visible**
1. Elegir hasta qué columna congelar (necesita saber el ancho de cada una).
2. **Columnas** en el editor (a mano: el paquete oficial de BlockNote es de pago).
4. Más eventos de webhook (páginas, comentarios) y reintentos con espera.
5. Envolver texto en celdas y elegir hasta qué columna congelar.

> Decidido **no** hacer: cálculos configurables fuera de la Tabla. El Kanban ya cuenta tarjetas
> por columna y la vista Gráfica cubre los agregados por campo; añadir un tercer sitio donde
> configurar lo mismo era complejidad sin función nueva.

**B — Editor**
6. **Toggle heading** y **embeds/bookmark** (tarjeta OpenGraph).
7. **Columnas/layout** (el más caro de los bloques).
8. **Comentarios en línea** sobre selección de texto.

**C — Colaboración**
10. **Tiempo real con Yjs** (Hocuspocus en el compose + auth por sala + persistencia + `wss` en el proxy DSM). Requiere a Jose delante.
11. **Compartir por página** con herencia.
12. **Notificaciones push reales** (el service worker ya existe; falta VAPID y suscripciones) y **webhooks salientes**.

**D — Redondeo**
13. Relación bidireccional; más rollups; funciones de fecha en fórmulas.
14. Export a PDF/HTML; plantillas de fila; color condicional; ancho de columna.
15. Atajos de teclado y Home personalizable.
