# App nativa de Android — plan vivo

Tarea: `NATIVA-TASK.md` (raíz del repo). Este fichero es el estado: quien retome la
sesión sigue desde la primera casilla sin marcar. Se commitea con cada fase.

## Checklist

### F0 · Plan
- [x] Leer CLAUDE.md, AGENTS.md y docs; plan en este fichero.

### F1 · Servidor: sesión de la app (RFC 8252)
- [x] Migración `AppAuthCode` (código de un solo uso, 2 min, challenge S256).
- [x] `/api/auth/oidc/start?app=1&challenge=…` y callback → `notiono://auth?code=…` (el flujo web igual).
- [x] `POST /api/app/sesion {code, verifier}` → token de sesión; cerrar sesión es `auth.logout` (borra la fila).
- [x] `GET /api/app/version` (lee `src/lib/apk.json`).

### F2 · Servidor: bloques y Yjs
- [x] Config de los bloques propios sin React (`src/components/editor/esquemaBloques.ts`) usada por las specs de React y por el esquema espejo del servidor.
- [x] `src/server/app/bloquesYjs.ts`: leer bloques de un Y.Doc (siempre sobre una copia), aplicar operaciones por bloque con diff mínimo, conservar marcas que la app no conoce (comentarios en línea).
- [x] Puente con Hocuspocus (`openDirectConnection` en el proceso de `server.mjs`); sin él, sobre `Page.ydoc` con bloqueo de fila. `Page.content` siempre por `jsonLimpio`.
- [x] Router `app` (`src/server/routers/app.ts`): `bloques`, `aplicar`, `bloquesFila`, `aplicarFila`, `vista`, `markdownABloques`, `exportarMarkdown`, `plantillas`.
- [x] Pruebas en `npm run check`: cliente Yjs conectado recibe las ops, edición concurrente en otro bloque no se pierde, ida y vuelta de todos los tipos de bloque.

### F3 · Servidor: datos para la app
- [x] `app.vista`: filas de una vista con el motor de la web (filtros, orden, búsqueda, grupos, subtareas, computados, colores, totales).
- [x] Markdown ↔ bloques en el servidor (jsdom + conversor de BlockNote) y galería de plantillas. (Lo que surja al hacer la app, aquí.)

### F4 · App: esqueleto
- [x] Proyecto Gradle `app-android/` (Kotlin DSL + catálogo), firma desde `~/notiono-apk/firma.properties`.
- [x] Tema (marca, claro/oscuro), arranque, edge-to-edge, atrás predictivo, icono adaptativo.
- [x] Red: cliente tRPC/superjson, sesión (Custom Tab + PKCE), caché sin conexión y cola de cambios.
- [x] Navegación: panel lateral con el árbol, Inicio, Buscar, Mis tareas, Bandeja, Ajustes, Papelera, Plantillas, página (cabecera, menú «⋯», comentarios, historial, enlaces entrantes, publicar, mover).

### F5 · App: editor de bloques
- [x] Modelo de bloques ↔ JSON BlockNote (conserva lo desconocido) ↔ Spannable, y operaciones por bloque (`Diff`), con pruebas JVM.
- [x] EditText con InputConnection propio; teclado (Enter, Retroceso, Markdown), menú `/`, `@`, barra de formato (pruebas en `TecladoTest`).
- [x] Todos los tipos de bloque; subir archivos; tabla; ecuación; columnas apiladas; BD embebida.
- [x] Sincronía por operaciones (rebote 1 s), cambios remotos por bloque, indicador de estado (`Sincro`).

### F6 · App: bases de datos
- [x] Tabla, Kanban, Lista, Galería, Calendario, Cronograma, Gráfica, Formulario.
- [x] Filtros/orden/agrupación/búsqueda, ficha de fila con todas las propiedades, crear BD/columnas/vistas (servidor: `app.fila`).

### F7 · App: resto de Notiono
- [x] Comentarios, bandeja, enlaces entrantes, historial, papelera, plantillas, publicar, icono/portada, bloquear, tipografía, espacios, importar/exportar, compartir hacia Notiono, atajos, avisos con WorkManager, actualizaciones (al abrir, una vez al día, y en Ajustes).

### F8 · Widgets (Glance)
- [x] Nota (casillas marcables), Lista de BD (casilla y «+»), Nota rápida; configuración al añadirlos, refresco cada 30 min, al cambiar algo en la app y con botón.

### F9 · Verificación
- [x] `npm run build` y `npm run check`.
- [x] Pruebas JVM (fixtures reales del editor web): 19 sin servidor, 0 fallos (las 3 de integración y capturas se saltan sin Notiono local y pasan con él).
- [x] Integración contra Notiono local (PGlite + `server.mjs`): la del servidor y la de la app en Kotlin con un cliente Yjs a la vez.
- [x] Capturas Roborazzi revisadas (claro/oscuro, 390 dp): 21 por modo, con widgets.
- [x] `testDebugUnitTest`, `lintRelease` (0 errores), `assembleRelease`, `apksigner` (misma firma que la TWA), `aapt2 dump badging` (`com.monrealperez.notiono` 3 / 2.0.0, min 26, target 36); APK en `~/notiono-apk/notiono-2.0.0.apk`.

### F10 · Documentación y entrega
- [x] `npm run apk:publicar` adaptado (sin publicar): versión de `build.gradle.kts` y se niega si el `versionCode` no sube.
- [x] CLAUDE.md, `docs/android.md`, este fichero.

## Estado final (18-oct-2026)

Hecha y comprobada en local; **sin desplegar ni publicar**. Para ponerla en marcha:
desplegar el servidor (lleva la migración `20261018120000_sesion_app_nativa`) y luego
`npm run apk:publicar` con el APK firmado, commit y otro despliegue (ver `docs/android.md`).

Pendiente, a propósito: flechas de dependencias del Cronograma, configurar las acciones
del campo Botón (se hace en la web), hilos de comentarios en línea (se conservan pero la
app no los enseña). Lint deja 50 avisos de estilo o de versiones (las más nuevas exigen
compileSdk 37), ninguno de error.

## Bitácora (decisiones y comprobaciones)

- **BD**: las filas siempre salen de `app.vista` (motor de la web en el servidor); la app
  solo guarda la config de la vista (`db.updateView`) y vuelve a pedirla. Las celdas se
  pintan con el texto que manda el servidor (`textos`) y se editan con una hoja por tipo
  (como la app de Notion). Abrir una fila va siempre a su ficha a pantalla completa (lo
  que hace Notion en Android). Pendiente de pulir: flechas de dependencias del
  Cronograma y configurar las acciones del campo Botón (se hace en la web).

- **Editor: un EditText por bloque dentro de una LazyColumn de Compose** (AndroidView). Su
  `Editable` ES el `SpannableStringBuilder` del modelo (fábrica de Editable propia), con
  spans propios por estilo de BlockNote para volver a JSON sin ambigüedad. El
  `InputConnection` envuelto intercepta `commitText("\n")` (Enter de Gboard) y
  `deleteSurroundingText` con el cursor al principio (el Retroceso que Gboard no manda
  como tecla). Ninguna librería mantenida de editor enriquecido para Compose lo resuelve.
- **Sincronía**: se adopta lo de fuera solo si no hay nada local sin mandar; tras un envío,
  si se siguió escribiendo, se queda lo local y el siguiente envío manda la diferencia.
  Restaurar una versión va por operaciones (borrar todo + insertar), no por
  `pages.versions.restore`, que solo cambia `Page.content` y el documento Yjs lo pisaría.
- **Comentarios en línea (hilos de BlockNote)**: viven en el documento Yjs y la app no los
  enseña; se conservan (el servidor vuelve a poner la marca al reescribir el bloque). Los
  comentarios de página y de fila sí, completos.

- **Integración del servidor** (`scripts/integracion-app.ts`, cabecera con cómo lanzarla):
  servidor de producción (`server.mjs`) sobre PGlite + un SSO falso. Comprobado 18-oct:
  sesión de la app con PKCE (código de un solo uso, verificador malo rechazado), login
  web intacto, operaciones de bloque que llegan a un navegador conectado por `/collab`
  mientras él escribe en otro bloque, vistas, cuerpo de fila, Markdown y logout.
- **BlockNote en Node solo por import()**: su build CommonJS revienta en Node (interop de
  tiptap) y la ESM no. `tsx` compila los `.ts` del repo como CommonJS, así que todo lo de
  BlockNote/Yjs en el servidor se carga con `import()` (esquema.ts, bloquesYjs.ts).
- **Dos copias de yjs en el proceso de producción** (la que empaqueta Next y la de
  `collab/dist`): por el puente solo pasan bytes y JSON, nunca objetos Yjs.
- **En producción la app escribe SIEMPRE por Yjs** (si la página no tenía documento
  compartido, el puente lo estrena con su `Page.content`): así un navegador que abra la
  página justo entonces no puede sembrar el contenido viejo encima. Sin Hocuspocus
  (`next dev`) y sin `Page.ydoc`, basta `Page.content` como pide la tarea.
- **Markdown en el servidor con jsdom** (`serverExternalPackages`): el mismo conversor que
  la web; `@blocknote/server-util` no sirve en Next porque importa React.

- **18-oct-2026 · Versiones**: AGP 9.4.1 (Kotlin integrado), Kotlin 2.4.21, Gradle 9.8.1,
  JDK 17 de `~/.bubblewrap`. Lo último de AndroidX/OkHttp/Coil exige compileSdk 37 y la tarea
  pide 36: por eso Compose BOM 2026.06.01, core 1.18, lifecycle 2.10, navigation 2.9.6,
  OkHttp 5.4 y Coil 3.5 (las más nuevas que compilan con 36).
- **Robolectric con Android 35** (`app/src/test/resources/robolectric.properties`): el
  SDK 36 de Robolectric exige Java 21 y aquí hay JDK 17. Las pruebas usan la Application
  vacía (la de verdad programa WorkManager al arrancar).
- **17:42 · systemd-oomd mató la sesión** (Gradle 4g + demonio de Kotlin + lo de Jose).
  Desde entonces: Gradle 3g, 2 workers, Kotlin in-process, tests a 1g y un solo fork.
- **Iconos**: los de lucide de la web, sacados a `assets/lucide.json` por
  `scripts/iconos-android.mjs` (interfaz + los 257 de página) y pintados como vector.
- **Emojis**: el selector nativo de AndroidX (`EmojiPickerView`), con búsqueda y recientes.
- **Caché local sin Room**: respuestas guardadas como JSON en ficheros por clave y la cola
  de cambios en un fichero; Room obligaría a KSP para guardar lo mismo. Si un día hace
  falta consultar la caché (no solo leerla), entonces Room.
- **Leer Yjs siempre sobre una copia**: `y-prosemirror` BORRA del documento los nodos que
  no puede convertir con el esquema que se le da. Convertir el documento vivo con un
  esquema incompleto destruiría contenido en todos los navegadores conectados.
- **Comentarios en línea**: viven como marca `comment` en el texto Yjs y `docToBlocks` la
  ignora. Al reescribir un bloque desde la app se vuelven a poner sobre el texto que no
  cambió (si no, el diff los quitaría).

- **Integración de la APP** (`scripts/integracion-android.ts` + `IntegracionTest`): el
  arnés en TS levanta el SSO falso, prepara una página y deja un cliente Yjs tecleando en
  un bloque cada 150 ms; mientras, la prueba Kotlin (capa de red, `EstadoEditor` y
  `Sincro` de la app) entra con PKCE, crea página, BD y fila, busca con el motor de la
  web y edita otro bloque. Comprobado 18-oct: 57 pulsaciones del navegador a la vez,
  ninguna perdida, y lo de la app llega al navegador. (El arnés lanza Gradle con `spawn`
  asíncrono: con `spawnSync` se bloqueaba su propio SSO.)
- **Capturas** (`scripts/capturas-android.ts` + `CapturasTest`, Roborazzi con gráficos
  nativos de Robolectric): una persona nueva por pasada (espacio limpio), datos sembrados
  por tRPC desde la propia prueba y la app ENTERA (`Principal`) recorrida como un
  usuario: por destinos (páginas, cada vista con `?v=`, ficha) y pulsando la barra y el
  panel. 21 capturas por modo, revisadas a mano. Lo que enseñaron y se arregló: el
  cronograma abría en el día 1 (ahora en hoy), barras de la gráfica sin valor, «+ Fila /
  + Columna» encima de la cabecera de la tabla, interlineado doble en textos de 14 sp
  (alturas de línea en sp en vez de em), el campo de Buscar desbordaba la barra, listas
  numeradas del widget con «–».
- **Widgets en pruebas**: `GlanceRemoteViews` + `RemoteViews.apply`. Las listas
  (`LazyColumn` → `setRemoteAdapter`) **solo se aplican si el padre es un
  `AppWidgetHostView`**; con un `FrameLayout` salen vacías sin error. `WidgetsTest` lo
  comprueba (cuenta las filas del adaptador) antes de fotografiar.
- **Enlaces `?v=`**: como en la web, `/p/<id>?v=<vista>` abre esa vista.
- **Accesibilidad**: los botones de solo icono (`BotonIcono`) dicen qué hacen a TalkBack.
