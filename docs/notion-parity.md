# Notiono — Biblia de paridad con Notion

> Documento maestro para llevar Notiono lo más cerca posible de Notion 1:1.
> **Inventario verificado leyendo el código el 19-ago-2026** (última revisión: commit ~414ca6c). Sustituye al
> gap-analysis de agosto-2026, que se había quedado muy desfasado.
> Leyenda: ✅ hecho · 🟡 parcial · ❌ falta.
>
> Regla al actualizar este doc: marca ✅ solo lo que exista en el código, con el nombre real
> del fichero o del símbolo. Si dudas, ábrelo y míralo.
>
> **17-oct-2026:** hay un estudio más reciente, [`ESTUDIO-2026-10.md`](ESTUDIO-2026-10.md), con los huecos
> verificados contra el código de octubre y el plan por tandas. Para planificar, manda ese.

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
| Selección / Selección múltiple | ✅ | ✅ `select`, `multiselect` — 10 colores, crear al vuelo y editar desde el desplegable (renombrar, color, borrar, reordenar arrastrando). Las **etiquetas** de Notion son esto (notion.com/es/help/database-properties): agrupar por Selección múltiple pone la fila en **cada una** de sus etiquetas (`groupBy`, 2.5.2), en la Lista salen como pastillas y la lupa de la BD encuentra por etiqueta. ❌ Tablero agrupado por Selección múltiple (Notion sí; aquí el arrastre identifica la tarjeta por fila y saldría repetida) |
| Estado | ✅ | ✅ `status` con grupos Por hacer / En curso / Hecho y opciones movibles entre grupos |
| Fecha | ✅ | ✅ `date` con hora, rango y recordatorio en la bandeja al llegar el día |
| Casilla / URL / Correo / Teléfono | ✅ | ✅ — la casilla se marca en todas las vistas sin abrir la ficha; como en Notion va con las demás propiedades (en la Lista, a la derecha) y no tacha el título (2.5.1, notion.com/help/lists) |
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
- ✅ **Agrupar** en Tabla, Kanban, Lista y Galería, y **subagrupar** en la Tabla y en el Kanban (carriles horizontales plegables). En el Kanban, además, **suma por columna**, **ocultar columnas de grupo** (con sección «Ocultas» para recuperarlas) y **«Mostrar grupos vacíos»** (columnas y carriles; por defecto sí, como Notion).
- ✅ **Vista Matriz** (oct-2026, `MatrixView.tsx`, `src/lib/matriz.ts`; no existe en Notion, que la monta con un tablero subagrupado): un campo de casilla/selección/estado en cada eje, las tarjetas se colocan solas, arrastrar entre celdas cambia las dos propiedades, «+ Nueva» por celda y rótulo/color por celda. Plantilla **«Matriz de Eisenhower»** (galería y `/` del editor).
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
- ✅ Propios: bloques **`database`** (BD embebida o enlazada, que recuerda su vista), **`callout`** («Llamada»), **`toc`** (tabla de contenidos), **`bookmark`** («Enlace web»: tarjeta OpenGraph o reproductor de YouTube/Vimeo) y **`equation`** («Ecuación»: TeX con KaTeX, clic para editar con vista previa; solo en bloque, no inline); inline **`mention`** (@página) y **`personMention`** (@persona, que notifica).
- ✅ Autosave (800 ms contenido / 600 ms título), export a Markdown, portada, icono emoji, ancho completo, solo-lectura para `viewer`.
- ✅ **Columnas** (dos o tres, desde el menú `/`): hechas a mano con los mismos nombres de bloque que el paquete de pago de BlockNote (`columnList`/`column`), cuyas clases CSS ya vienen en la hoja de estilos. Con **ancho ajustable arrastrando** el borde entre columnas y **«+» para añadir columna** a un layout ya creado (solo ratón). En el móvil se apilan. ❌ Crear columnas arrastrando un bloque al lado de otro.
- ✅ **Dibujo a mano** (29-oct-2026, no existe en Notion; lo pedía la app de notas de Pablo): bloque `drawing` que **se porta como una imagen** (2.5.1): en «Medios» del menú `/` junto a Imagen, guías para cambiar el ancho, alinear, leyenda y descargar en una barra al pasar, 6 puntos como cualquier bloque (sin «Convertir en», como las imágenes), con un lienzo a pantalla completa de **Excalidraw** (MIT, `src/components/dibujo/LienzoDibujo.tsx`): bolígrafo, lápiz, rotulador y subrayador, goma, texto, formas, seleccionar, colores, grosores, deshacer; fondo liso/cuadrícula/puntos/rayas; zoom de pellizco. Se guarda la escena (JSON, editable) y una vista previa PNG como Asset (lo que se ve en la página, `/s/`, exportar y la app). La app usa la misma página (`/dibujo`) en un WebView.
- ✅ **«/subpágina»**: crea una página hija colgando de la actual y la enlaza en el sitio del cursor con la mención.
- ✅ **Subpáginas enlazadas en su madre** como los bloques «página» de Notion (oct-2026, `src/server/subpaginas.ts`): crear una hija desde el panel lateral, la app o la API deja su enlace al final de la madre; renombrarla pone al día el enlace en vivo (en la madre y donde se la mencione); moverla de madre se lleva el enlace; duplicar enlaza las hijas copiadas y pone la copia debajo. Todo por operaciones de bloque en el documento Yjs vivo. **Subpágina y enlace son un solo objeto** (oct-2026, `docs/subpaginas.md`): borrarla en el árbol quita su enlace, borrar el enlace la manda a la papelera (con «Deshacer»), y restaurarla la devuelve con su enlace en su sitio.
- ❌ **Sync block**, **breadcrumb block**, **botón**, embeds de Maps/Figma/PDF, **ecuación**, **subpágina embebida** como bloque.
- ✅ **Comentarios en línea** sobre una selección, con respuestas y resolver (`YjsThreadStore`: los hilos viajan dentro del documento compartido).
- ❌ **@fecha** en el editor.
- ✅ **«Convertir en → Llamada»** en la barra de formato y **«Copiar enlace al bloque»** en el menú del tirador: la URL `/p/<página>#<bloque>` abre la página, salta hasta el bloque y lo destaca.
- ✅ **Menú del tirador (6 puntos) como el de Notion** (oct-2026, `menuTirador.tsx`): buscador, Convertir en (incl. Llamada y Página), Color de texto y fondo, Duplicar (Ctrl+D), Mover a (con buscador), Copiar enlace, Comentar y Eliminar (Supr); en los bloques de página además Abrir en nueva pestaña / en panel lateral, Renombrar, Icono y Favoritos (mover y duplicar actúan sobre la página). Soltar un bloque en una página del panel lateral lo mueve allí. En táctil, tirador compacto al tocar un bloque y las mismas acciones en una hoja. ❌ Selección multibloque con acciones masivas.
- ✅ **Panel lateral de página** («side peek», `PanelPagina.tsx`, `?vistazo=<id>`): editable y con edición simultánea, ancho ajustable, abrir a pantalla completa, Esc/X/Atrás; Alt+clic en un enlace. En el móvil, a pantalla completa.
- ✅ **⋯ → «Apariencia y diseño»** como Notion (notion.com/es/help/customize-and-style-your-content): Estilo (Predeterminado/Serif/Mono), **Texto pequeño** (`Page.smallText`, el cuerpo a 14 px) y Ancho completo (2.5.2; antes iban sueltos y sin texto pequeño).
- ✅ **Color de página** (2.5.2, no existe en Notion —super.so/blog/how-to-change-the-background-color-in-notion-2023—; lo pedía la app de notas de Pablo): en «Apariencia y diseño», con la paleta de fondos de Notion (Predeterminado, Gris, Marrón, Naranja, Amarillo, Verde, Azul, Morado, Rosa, Rojo; valores de matthiasfrank.de/en/notion-colors). Tiñe suave el fondo de la página (también en oscuro, en el panel lateral, en `/s/` y en la fila abierta) y deja una barrita de su color donde se lista: Lista y Tabla (en el borde, sin mover el título), tarjetas de Galería, Tablero y Matriz, «Visitado recientemente», buscador y widget Nota. Las filas tienen el suyo (`Record.color`, ⋯ de la ficha). `src/lib/colorPagina.ts`, `src/components/ColorPagina.tsx`, `--pag-*` en `globals.css`; la app, `ui/comun/ColorPagina.kt` (`npm run check` mira que coincidan). No choca con el «Color condicional» de Notion (reglas y color por etiqueta, que tiñen la fila entera): es un acento aparte.
- ✅ **Backlinks**: sección «N enlaces entrantes» al pie de la página (`pages.backlinks`).

---

## 3. COLABORACIÓN, PERMISOS Y ORGANIZACIÓN

- ✅ Espacios compartidos con roles `owner` / `editor` / `viewer` (`viewer` no puede mutar nada: se bloquea en `workspaceProcedure`, no solo en la UI).
- ✅ **Varios espacios por persona** (oct-2026, `docs/ESTUDIO-2026-10.md` §8): «Nuevo espacio» en el selector, nombre e icono, Ajustes → General (Zona de peligro: salir / eliminar escribiendo el nombre) y Personas (invitar por correo o usuario del NAS, **invitaciones pendientes**, cambiar rol, quitar, **traspasar la propiedad**), avisos al añadir a alguien, no leídos por espacio en el selector.
- ✅ **«Mover a» otro espacio**: duplica allí, como Notion («Entiendo, duplicar»).
- ✅ **Invitados de página** (guests): «Compartir» invita a alguien de fuera del espacio, que solo ve esa página y sus subpáginas (sección «Compartido»). ❌ Aún no ven las bases embebidas de la página ni pueden volver a compartir.
- ✅ **Todo lo anterior también en la app de Android** (2.4.0, 25-oct-2026): selector con no leídos por espacio y «Nuevo espacio», Ajustes → General y Personas, «Compartir» de una página, «Mover a» otro espacio, avisos `space`/`share` que pasan a su espacio, y la app usable como invitado de página. Cada espacio guarda lo suyo sin conexión y los widgets siguen con su espacio.
- ✅ **Comentarios** de página con resolver y borrar (`CommentsPanel.tsx`).
- ✅ **Menciones** @página y @persona + **bandeja de notificaciones** con contador.
- ✅ **Historial de versiones** con UI (snapshot con throttle de 2 min, últimas 50, restaurar). Solo páginas `doc`.
- ✅ **Buscador global Ctrl+K**, que busca por título y **dentro del texto de los bloques**, con **filtros** de tipo (Páginas/Bases de datos) y de edición reciente (Hoy/7/30 días). Desde la 2.5.2 encuentra también las **filas de BD** (las notas de una BD «Notas») por título y cuerpo y las abre como página (`pages.search` con `filas: true`; web y app). Como Notion, **no** busca por el valor de las propiedades (notion.com/es/help/search: «Los valores de las propiedades, como las etiquetas… no se incluyen»): eso lo hace la lupa de la BD.
- ✅ **Favoritos** (reordenables arrastrando) y **Recientes** en el sidebar.
- ✅ **Papelera** con jerarquía, retención de 30 días con purga perezosa, vaciar, buscar y «borrado por».
- ✅ **Publicar página en la web** (`/s/<token>`, solo lectura, resuelve también las BD embebidas).
- ✅ **Recordatorios**: al abrir la app avisa en la bandeja de lo que tienes asignado y ya vence.
- ✅ **Colaboración en tiempo real**: edición simultánea, cursores con nombre y **avatares de presencia** en la cabecera.
- ✅ **Compartir por página** con herencia padre→hijo; niveles Ver / Comentar / Editar / Acceso total (`services/perms.ts`).
- ❌ Hilos anidados y reacciones en comentarios; seguir página.
- ❌ Publicación con contraseña, caducidad o control de indexación.

---

## 4. UX, NAVEGACIÓN Y DISEÑO

- ✅ **Barra superior**: miga de pan, ⭐ favorito, menú ⋯, publicar, comentarios, historial.
- ✅ **Mover a…** con buscador de páginas; **Duplicar** con copia profunda.
- ✅ **Portada** de página (degradados, URL o imagen subida) e icono emoji.
- ✅ **Tema claro/oscuro manual** (`data-theme`, sin parpadeo al cargar).
- ✅ **Plantillas**: galería con 8 (Matriz de Eisenhower, tareas, **Notas**, notas de reunión, CRM, presupuesto, diario, wiki). «Notas» (2.5.2) sigue a la «Docs» de Notion (notion.com/help/guides/documents-database-for-product-teams; no hay ficha oficial de una plantilla «Notes» con sus propiedades): Nombre, **Etiquetas** (Selección múltiple), Creado y Última edición, y vistas «Todas las notas», «Por etiqueta» y «Recientes».
- ✅ **Libretas de la app de Pablo = páginas dentro de páginas**, como en Notion (no tiene libretas): una «libreta» es una página con subpáginas (o una BD), las notas se mueven con «Mover a» y se ven en el árbol. Sus «accesos directos» son los **Favoritos** (barra lateral, Inicio y, en la app, el widget «Favoritos» de Notion —notion.com/es/help/mobile-widgets—, aparte de «Recientes», 2.5.2). La «libreta por defecto» no existe en Notion: en el móvil la página nueva se abre con un desplegable para elegir dónde dejarla y, si no, va a Privado (notion.com/es/help/navigate-with-the-sidebar). Así en la app: «Añadir a ▾» en la página recién creada (botón Nueva, acciones del Inicio, bloc, widgets), y si no se elige, a la raíz del espacio.
- ✅ **Copia en el NAS** (2.5.2, la app de Android; Notion no tiene copia automática —notion.com/es/help/back-up-your-data—): un Word por página en el Synology Drive de cada persona por la API de DSM, reflejando el árbol, cada 6 h y al poco de editar, subiendo solo lo cambiado. La web enseña su estado en Ajustes (ver `docs/app-nativa.md`).
- ✅ **Import/Export**: Markdown ↔ página, CSV ↔ base de datos, **página con subpáginas a ZIP**, **copia de seguridad del espacio entero** (Ajustes; MD + CSV + adjuntos), HTML y **Word (.docx)** de una página o fila (`src/server/docx.ts`, `app.exportarWord`: formato, casillas hechas tachadas, tablas, imágenes y dibujos; web y app). Desde la 2.5.1 todo va por **⋯ → Exportar**, con el diálogo de Notion (`src/components/Exportar.tsx`, `ui/pagina/Exportar.kt`): «Formato de exportación» PDF (impreso con «Formato de página» y «Porcentaje de escala»), HTML, «Markdown y CSV» (con «Incluir subpáginas» = ZIP) y Word como un formato más (Notion no lo tiene). Fuente: notion.com/es/help/export-your-content. La app pide el HTML a `app.exportarHtml` (y el PDF lo imprime Android).
- ✅ **Recordar como Notion** (2.5.1; fuente notion.com/es/help/reminders y …/guides/reminders-and-mentions): no hay «Recordarme…» en el ⋯ (Notion no lo tiene). En el menú `@`, grupo «Fecha o recordatorio» con Hoy, Mañana y «Recordar…»; al escribir `@recordar…` salen los atajos (en 1 hora, esta tarde (19:00), mañana a las 9:00) o la fecha que se entienda (`@recordar el miércoles a la 13:00`; `sugerenciasRecordar` / `AtajosRecordar.sugerencias`). Tocar la mención abre su menú (atajos, día, «Incluir hora», «Recordar» con las antelaciones). La notificación (push y alarma) trae **«Hecho»** y **«Posponer 1 h»** (`/api/recordatorio`), que no son de Notion: posponer **mueve** ese recordatorio (la mención o la celda) si avisaba a la hora de su fecha, y si era «N antes» de un evento lo repite aparte (`Pospuesto`). `app.recordar` sigue en el servidor para la 2.5.0.
- ✅ **Información de la página** al pie del menú ⋯ como Notion: «Recuento de palabras: N», «Última edición por …» y cuándo; lo demás (caracteres, casillas, imágenes y adjuntos, creada) plegado en «Más información» (`pieInfo`, `app.info`; fuente super.so/blog/how-to-check-word-count-in-notion).
- ✅ **PWA instalable** + responsive con drawer; iconos y favicon de marca; iconos de interfaz lucide. Y **app nativa de Android** (`app-android/`, `docs/app-nativa.md`), al día con la web en espacios y compartir desde la 2.4.0.
- ✅ **API REST v1** con tokens por espacio (`docs/api.md`).
- 🟡 **Atajos de teclado**: Ctrl+K (buscar), Ctrl+\ (plegar el panel), Ctrl+Alt+N (nueva página), Ctrl+Mayús+L (modo oscuro) y Ctrl+[ / Ctrl+] (atrás/adelante). Faltan favorito, cambiar de vista y mover bloque.
- ✅ **Tooltips estilo Notion** en los botones del panel: pastilla propia con el atajo en la segunda línea (`data-pista`/`data-atajo` en CSS puro, solo con ratón).
- ✅ **Mis tareas** (`/my-tasks`): lo que tengo asignado por un campo Persona en cualquier base de datos (y lo de mi BD de tareas), por secciones Vencidas/Hoy/Mañana/Próximas/Sin fecha y Completadas plegada, filtro Hoy, **añadir rápido** (título y fecha, a la BD elegida) y el círculo que la marca hecha (`src/lib/tareas.ts`). Como en Notion, una hecha no se tacha (es una fila de BD); las secciones por fecha y el añadir rápido, que Notion no tiene, llevan la tarjeta del Inicio.
- ✅ **Home/Inicio personalizable** (`/`, enlace «Inicio» en el panel; oct-2026): saludo y bloques Recientes, Mis tareas, Tareas para hoy, Próximas fechas (tareas y recordatorios), Favoritos y Enlaces fijados (páginas o webs), que cada persona muestra, oculta y reordena con «Personalizar» (`Member.inicio`, `src/lib/inicio.ts`, router `inicio`); «Abrir al iniciar» (Inicio, última página o una concreta) en Ajustes y en Personalizar, solo al arrancar. Desde la 2.5.0 (29-oct-2026) también **Acciones rápidas** (Página, Lista, Tarea, Foto), **Bloc de notas rápido** (se guarda solo y «Convertir en página»), **Nota fijada** (con sus casillas marcables) y **Recordatorios**. Desde la 2.5.1, como el Home de Notion (fuentes thomasjfrank.com/learn-notion/notion-home, notion.com/es/help/home-and-my-tasks): solo el saludo (sin fecha ni buscador), «Visitado recientemente» con tarjetas de portada e icono, «Próximos eventos», «Mis tareas», todo en la misma tarjeta (también lo que Notion no tiene) y el ⋯ de cada sección con Subir, Bajar y «Ocultar sección» (`TITULO_BLOQUE`).
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
