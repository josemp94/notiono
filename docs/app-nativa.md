# App nativa de Android — plan vivo

Tarea: el encargo original lo guarda Dobby fuera del repo (`~/Dobby/encargos/hechos/NATIVA-TASK.md`). Este fichero es el estado: quien retome la
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
- [x] 2.0.1: Acciones rápidas (página, tarea en la BD elegida, foto, buscar) y Páginas recientes (favoritas + últimas abiertas); casilla de Lista en círculo; vistas previas en el selector (`previewImage` PNG + `previewLayout` + `providePreview` de Android 15).
- [x] 2.0.1 publicada en la web (`public/notiono.apk`, `src/lib/apk.json`): `versionCode 4`, `lintRelease` 0 errores, `apksigner` con la huella de siempre (`8c9bb7dc…cb8e9a`), sha256 `c1d26d52…aa1d05f`; copia en `~/notiono-apk/notiono-2.0.1.apk`. Falta desplegar.
- [x] 2.0.2 (`versionCode 5`): la app se cerraba al soltar una tarjeta del Kanban (NPE de `arrastre!!` dentro de `graphicsLayer {}`, que Compose repite al cambiar el estado antes de recomponer); además el clic se quedaba el «soltar» y la pulsación larga sin mover no sacaba el menú. Prueba sin servidor en `bd/KanbanTest.kt` (roja antes del arreglo). Copia en `~/notiono-apk/notiono-2.0.2.apk`, misma firma (`8c9bb7dc…cb8e9a`). Falta desplegar.
- [x] 2.0.3 (`versionCode 6`): los widgets se quedaban en blanco (Xiaomi 13T, HyperOS 3). Pintan al instante lo último bueno y refrescan detrás, repintado al abrir/reiniciar/actualizar/cambiar de sesión, `initialLayout` propio, tarjeta de Inicio automático y batería, y registro de diagnóstico que llega al servidor (`AppRegistro`, migración `20261018220000_registro_app`). Ver «Widgets en blanco (2.0.3)» abajo. Copia en `~/notiono-apk/notiono-2.0.3.apk`, misma firma (`8c9bb7dc…cb8e9a`). Falta desplegar.

- [x] 2.1.0 (`versionCode 7`): revisión a fondo frente a la app de Notion para Android, con su plan, inventario y bitácora en `docs/REVISION-APP-2026-10.md`. Robustez (la app ya no se cierra con respuestas raras del servidor o del proxy, enlaces raros, ids repetidos, sin apps que abrir; no pierde lo escrito al guardar el título, al girar ni con la cámara; red de seguridad que apunta los fallos inesperados en el registro como tipo `fallo`), recorrido de la app como una persona contra Notiono local comprobado en el servidor (`scripts/recorrido-android.ts`) y lo que faltaba para el uso diario: deshacer/rehacer, avisos que abren su fila y se marcan deslizando, modo oscuro a mano, compartir enlace, zoom en imágenes, compartir varios archivos hacia la app y reordenar favoritos. `lintRelease` 0 errores, `apksigner` con la huella de siempre (`8c9bb7dc…cb8e9a`), sha256 `b7e86d2c…67cebb6`; copia en `~/notiono-apk/notiono-2.1.0.apk`. Falta desplegar.

- [x] 2.2.0 (`versionCode 8`): los widgets **seguían en blanco** en el Xiaomi de Jose con la 2.1.0 → reescritos con RemoteViews clásicos, sin Glance (ver «Widgets en blanco (2.2.0)» abajo); widget nuevo **Calendario**; **recordatorios a su hora** como Notion (servidor, web y app con alarmas exactas) y Ajustes → Diagnóstico con los permisos. `lintRelease` 0 errores, `apksigner` con la huella de siempre (`8c9bb7dc…cb8e9a`), sha256 `fafabfd8…5252e649`, 4,0 MB; copia en `~/notiono-apk/notiono-2.2.0.apk`. Lleva la migración `20261019120000_recordatorios`. Falta desplegar.

- [x] 2.3.0 (`versionCode 9`): **Inicio personalizable**, el mismo de la web (lo pidió Yago). `PantallaInicio` pinta los bloques (recientes, mis tareas, tareas para hoy, próximas fechas con recordatorios, favoritos, enlaces fijados) en el orden y con la visibilidad de `inicio.get` (caché si no hay red) y «Personalizar» los edita con flechas (subir/bajar, mostrar/ocultar, restablecer, enlaces a página o web con nombre) y «Abrir al iniciar»; guarda con `inicio.guardar` (se pinta ya, va a la caché y, sin red, a la cola). La lógica (`ui/inicio/ConfigInicio.kt`) es la de `src/lib/inicio.ts` y se prueba en `ConfigInicioTest`. «Abrir al iniciar» solo al abrir la app desde el icono (`ArranqueInicio.pendiente`, que rearma `MainActivity.onCreate` sin estado guardado ni intent con destino), nunca al volver a Inicio; decide con lo guardado sin esperar a la red. `HojaElegirPagina` (sale de `HojaMover`) elige páginas. Capturas nuevas `inicio_bloques` e `inicio_personalizar` en `CapturasTest`. 85 pruebas JVM (5 de integración saltadas sin Notiono local; `CapturasTest` pasada aparte contra Notiono local), `lintRelease` sin errores, `apksigner` con la huella de siempre (`8c9bb7dc…cb8e9a`), sha256 `611eca66…1ebe32`, 4,0 MB; copia en `~/notiono-apk/notiono-2.3.0.apk`. Lleva la migración `20261022120000_inicio_personalizable`. Falta desplegar.

- [x] 2.4.0 (`versionCode 10`): **espacios y compartir como la web** (la propuesta 1 de `docs/ESTUDIO-2026-10.md` §8, con el detalle allí). Selector con no leídos por espacio y «Nuevo espacio» (`ui/espacios/Espacios.kt`), Ajustes → General y Personas (`ui/espacios/AjustesEspacio.kt`), «Compartir» de una página (`ui/pagina/Compartir.kt`), «Mover a» con el espacio abajo, avisos `space`/`share` en la bandeja y en la notificación (que trae los de todos los espacios con `app.avisos`), y modo invitado (`Puede`, lo mismo que esconde la web). Lo que tocó la base: el espacio activo es observable (`Sesion.espacioFlujo`; `rememberConsulta` vuelve a empezar al cambiarlo), cada petición puede llevar su espacio (`Api.query/mutation(…, espacio)`), la caché va por espacio (`Cache.clave`; ya no se borra al cambiar), un cambio en cola lleva el suyo (`Pendiente.espacio`), los widgets lo recuerdan (`ConfigWidget.espacio`) y una página o fila de otro espacio pasa a él (`Espacios.buscaPagina`). Novedades en Ajustes. 109 pruebas JVM (6 de integración saltadas sin Notiono local; el recorrido, aparte contra Notiono local, en verde), `lintRelease` sin errores, `apksigner` con la huella de siempre (`8c9bb7dc…cb8e9a`), sha256 `dda98433…2fa3ff5`, 4,1 MB; copia en `~/notiono-apk/notiono-2.4.0.apk`. Necesita el servidor de `d901c34` (sin él, los avisos caen a los del espacio activo y el modo invitado da «prohibido»). Falta desplegar.
- [x] 2.4.1 (`versionCode 11`, 29-oct-2026): **las casillas se marcan tocándolas en todas las vistas**. En la Lista, el Kanban y la Galería la casilla era un dibujo (`ValorCelda`) y el toque abría la ficha (la Tabla ya la cambiaba). Ahora `CasillaTocable` (`bd/Celdas.kt`): 40 dp de toque, `ponCelda` (optimista y con cola), sin abrir la ficha y, en solo lectura, sin tocar. En la Lista la primera casilla visible va delante del título y la fila hecha sale tachada; en las tarjetas sale aunque esté sin marcar. Calendario, Cronograma, Inicio y Mis tareas no pintan casillas. `bd/CasillaTest` (roja sin el arreglo) y capturas en `bd/CasillaCapturasTest` (`-Proborazzi.test.record=true`). La web, igual en el mismo día (`Casilla.tsx`). 110 pruebas JVM por tandas, `lintRelease` limpio, `apksigner` con la huella de siempre (`8c9bb7dc…cb8e9a`), sha256 `45cedcc2…0f88f5`; copia en `~/notiono-apk/notiono-2.4.1.apk`. Falta desplegar.

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
- **Casillas (2.4.1, 29-oct-2026)**. La batería JVM entera de golpe la mató systemd-oomd
  (pico de 3,4 GB): se corre **por tandas** (`--tests 'com.monrealperez.notiono.<paquete>.*'`,
  con `./gradlew --stop` entre una y otra). Con la máquina así de cargada saltó
  `WidgetsFallosTest.laConfiguracionQueGuardoGlanceSeConserva`: cancelaba su DataStore y
  esperaba 200 ms, pero DataStore no suelta el fichero hasta que el `Job` termina; ahora
  `cancelAndJoin`. No lo rompió el cambio de las casillas (los widgets no usan esas vistas).
- **Espacios (2.4.0, 25-oct-2026)**. Trampas de las pruebas que costaron: en Robolectric,
  `compose.waitUntil` con una condición que no mira la pantalla no deja correr el hilo
  principal (lo que sigue a una llamada de red se queda esperando): hay que meter
  `compose.waitForIdle()` en la condición. Un `delay` en `Dispatchers.Main` (el envío del
  editor) no avanza con `mainClock`: hace falta `shadowOf(mainLooper).idleFor(…)`. Y el
  `LaunchedEffect` de los destinos de `Principal` puede seguir en otro hilo tras la red con
  el despachador de pruebas: navega dentro de `withContext(Dispatchers.Main.immediate)`.
  Sin red de verdad en MockWebServer: `onResponseStart(SocketEffect.CloseSocket())` (un 503
  es «error del servidor», no «sin conexión»). Una vez, en el recorrido completo, la página
  de la papelera quedó archivada al final (un `pages.archive` repetido); no se repitió en
  las pasadas siguientes ni pasando el recorrido solo.
- **Vista Matriz y subpáginas (web, 19-oct-2026), sin APK nuevo.** La app no conoce el
  tipo de vista `matrix`: `PantallaBD.kt` pinta lo desconocido como Tabla (no se cae), y
  `src/server/app/vista.ts` se la sirve **agrupada por sus dos ejes** (filas y, dentro,
  columnas) con el rótulo de cada celda («Hacer · Urgente»…), que la tabla de la app ya
  sabe pintar. Lo prueba `scripts/integracion-matriz.ts`. Las subpáginas: la app crea la
  hija con `pages.create` (el servidor deja el enlace al final de la madre) y luego pone
  el suyo en el cursor por `app.aplicar`; ahí `sinEnlaceDoble` (src/server/subpaginas.ts)
  borra el del servidor para que no queden dos.
- **Widgets en blanco (2.2.0, 19-oct-2026)**. Con la 2.1.0 Jose los seguía viendo en
  blanco «la mayor parte del tiempo» (Xiaomi 13T, HyperOS 3). Su `AppRegistro` del 18 al
  19-oct: 129 filas, todas de widgets, por parejas `fallo · ~50 ms · Sin conexión` + `ok`
  en el mismo segundo, ningún error de composición, nada de 03:34 a 07:23 UTC.

  **Causa real** (leída en las fuentes de Glance 1.2.0, `glance-*-sources.jar`):
  - **Glance nunca pinta en el receptor.** `GlanceAppWidgetReceiver.onUpdate` solo
    llama a `update`, que abre una `Session` *en memoria* y encola un trabajo normal de
    WorkManager (`SessionManager.startSession`: `OneTimeWorkRequest`, sin urgencia);
    el `SessionWorker` es quien compone y manda los RemoteViews. En HyperOS los trabajos
    de una app en segundo plano se retrasan (cubo restringido, sin inicio automático) y
    el proceso muere a menudo antes de que corran. Al correr en el proceso nuevo,
    `getSession` no encuentra la sesión y, como `runAttemptCount == 0`, el trabajo
    **falla con «No session available» sin pintar nada ni pasar por nuestro código**:
    por eso el registro no enseña errores. El escritorio se queda con lo que tuviera:
    el `initialLayout` tras reiniciar o recargarse el lanzador, o nada.
  - **Las parejas del registro**: con `SizeMode.Exact` Glance compone el contenido una
    vez por tamaño (`ForEachSize`: vertical y horizontal); cada composición lanzaba su
    propio refresco. El primero fallaba en ~50 ms porque recién arrancado el proceso en
    segundo plano Android aún no le deja salir a la red (`activeNetwork` es null), y esa
    composición pintaba «Sin conexión» o lo viejo; el escritorio enseña la que toca por
    orientación.
  - Lo que el registro no decía: qué se pintaba. Ahora cada pintado se apunta.

  **Arreglo**: fuera Glance; RemoteViews clásicos (`widgets/Widgets.kt`, `Vistas.kt`,
  `Calendario.kt`), con los mismos receptores (los widgets ya puestos siguen) y su
  configuración migrada del DataStore de Glance (`datastore/appWidget-<id>`).
  - `onUpdate` (y cada toque) **pinta síncrono y sin red** lo último bueno, que vive en
    disco por widget (`filesDir/widgets/<id>.json`, resumido: lo que se pinta). Sin
    nada guardado aún, lo saca de la caché de red de la 2.1.0. Nunca un hueco: datos o
    un texto que dice qué pasa («Cargando…», «Sin conexión. Toca para reintentar.»,
    «Inicia sesión…», «Toca para elegir…»; si algo revienta, «No se pudo pintar»).
  - La red, **solo detrás** (`goAsync`, 25 s como mucho): espera a red utilizable (4 s),
    reintenta un corte (a los 1,5 s y 4 s) y solo apunta fallo si falla el último
    intento; sin red, un trabajo de WorkManager con red (`widgets-red`) lo repite.
  - Listas con `RemoteCollectionItems` (`core-remoteviews`: en línea desde Android 12,
    sin servicio); toques de fila por una plantilla y `AccionWidgetActivity` (abre o
    marca la casilla sin verse). Marcar se ve al momento (se cambia lo guardado) y el
    cambio va detrás.
  - Calendario grande/pequeño por `RemoteViews(Map<SizeF, RemoteViews>)` (lo elige el
    escritorio por el tamaño real); antes de Android 12, por las opciones del widget.
  - Una alarma inexacta a medianoche repinta (el «hoy» del Calendario) sin red.

  **Pruebas**: `WidgetsFallosTest` llama a `onUpdate` como el sistema y aplica los
  RemoteViews que se publican dentro de un `AppWidgetHostView`: sin red ni nada guardado
  («Cargando…» y luego «Sin conexión», con el trabajo con red encolado), proceso nuevo con
  servidor de 8 s (pinta lo guardado en < 1,5 s), caché de la 2.1.0, configuración de
  Glance, 500/401/HTML/JSON raro, primer intento cortado (ok, sin «fallo»), sin sesión,
  sin configurar, marcar una fila y el registro de cada pintado. Con la 2.1.0 no pueden
  pasar: su `onUpdate` no pinta nada.

  **Cómo mirarlo desde el servidor** (tras desplegar y que Jose abra la 2.2.0):
  ```sql
  -- Qué enseña cada widget: «pinta · nota#12 · datos|cache|aviso|vacio|config|sesion|fallo · N elem · AxB dp · kB»
  SELECT r.fecha, r.version, r.mensaje FROM "AppRegistro" r
  WHERE r.tipo = 'widget' AND r.mensaje LIKE 'pinta%' ORDER BY r.fecha DESC LIMIT 50;
  -- Refrescos: «lista#7 · periodico · ok · 230 ms · 2 intentos» o «… · fallo …»
  SELECT r.fecha, r.mensaje FROM "AppRegistro" r
  WHERE r.tipo = 'widget' AND r.mensaje NOT LIKE 'pinta%' ORDER BY r.fecha DESC LIMIT 50;
  -- Avisos: permisos que faltan, recordatorios que sonaron (con su retraso), bandeja sin permiso
  SELECT r.fecha, r.mensaje FROM "AppRegistro" r WHERE r.tipo = 'avisos' ORDER BY r.fecha DESC LIMIT 50;
  ```
  Si salen pintados con `datos`/`cache` y Jose lo sigue viendo en blanco, el problema ya
  es del lanzador (no de que no se pinte); si no salen pintados durante horas, HyperOS
  no deja arrancar la app (inicio automático / batería).

- **Recordatorios (2.2.0)**. Como Notion: «a la hora, 5/10/15/30 min, 1/2 h antes» y
  «1/2 días, 1 semana antes» a las 9:00; sin hora, el evento cuenta a las 9:00 de Madrid.
  En una celda de fecha van dentro del valor (`{start, end?, reminder, reminderBy}`; el
  servidor pone `reminderBy`) y en una mención de fecha como props (`recordatorio`, `por`).
  Avisa a los asignados de la fila (campos Persona) o, si no hay, a quien lo puso.
  - Servidor: `src/instrumentation.ts` arranca una vuelta cada minuto
    (`src/server/recordatorios.ts`) que crea el aviso `reminder` (key
    `rem:<fila>:<campo>:<instante>`, única: nunca dos veces; hasta 12 h de retraso si el
    servidor estuvo parado) y llama a `sendPush` (web y puente a WhatsApp). Migración
    `20261019120000_recordatorios`: `Notification.recordId`, para abrir la fila.
  - App: `app.recordatorios` (los de los próximos 8 días) al abrir, al cambiar una fecha y
    cada 15 min; `AlarmManager.setExactAndAllowWhileIdle` (`USE_EXACT_ALARM`, y
    `SCHEDULE_EXACT_ALARM` en Android 12), reprogramados tras reiniciar, actualizar o
    conceder el permiso; canal «Recordatorios» con prioridad alta; la notificación abre la
    fila. La alarma y la bandeja comparten `key`: el que llega segundo no se enseña.
  - **Por qué no le llegaban los avisos de la bandeja a Jose** (sin el móvil no se puede
    afirmar cuál): el permiso de notificaciones solo se pedía una vez al arrancar (si lo
    negó, no se volvía a pedir y los avisos se marcaban como vistos sin enseñarse, sin
    dejar rastro), y el único camino era WorkManager cada 15 min, que HyperOS para sin
    inicio automático ni batería libre. Ahora el registro apunta «permisos: faltan …» al
    abrir la app y «bandeja · N nuevos sin poder enseñarlos», y Ajustes → Diagnóstico
    enseña notificaciones (y canales silenciados), alarmas exactas, batería e inicio
    automático con un botón a cada ajuste. Los recordatorios ya no dependen de WorkManager.
  - Menciones de fecha: el recordatorio se pone en la web (pulsando el chip); la app los
    conserva y los avisa, pero aún no tiene selector para ellas.

- **Widgets en blanco (2.0.3, 18-oct-2026)**. Jose, con la 2.0.1 en un Xiaomi 13T
  (HyperOS 3): «al principio pintaban, luego ya nada». Sin móvil ni emulador: razonado
  con las fuentes de Glance 1.2.0 (`glance-*-sources.jar` de Google Maven) y con pruebas.

  **Diagnóstico**, sospechoso a sospechoso:
  - *Red antes de `provideContent`* — **confirmado, causa principal.** Nota, Lista y
    Recientes pedían al servidor (connect 15 s + read 60 s) antes de dar contenido, y
    hasta entonces Glance no publica nada: se ve el `initialLayout`, que era
    `glance_default_loading_layout` (fondo y un `ProgressBar`; en el lanzador de Xiaomi,
    un hueco). Antes de la primera composición no corre el plazo de 45 s
    (`TimeoutOptions.initialTimeout` arranca tras el primer `processEmittableTree`), pero
    `SessionWorker` vigila el reposo: si el móvil está en Doze, *light idle* o *low power
    standby* (`IdleEventBroadcastReceiver`), pone el plazo a **5 s** (`idleTimeout`). Con
    la pantalla apagada eso es lo normal, y en Doze la red de las apps en segundo plano
    está cortada (los paquetes se tiran: el `connect` se cuelga hasta los 15 s). Resultado:
    la sesión se cancela sin haber pintado nada; si el lanzador no tenía vistas guardadas
    (tras reiniciar, actualizar la app o recargarse el lanzador) el widget queda vacío.
  - *Proceso matado a media sesión* — **confirmado.** HyperOS mata la app a menudo. Si
    muere con un `SessionWorker` en marcha, WorkManager lo relanza en el proceso nuevo,
    la `Session` ya no existe (no es persistible) y `doWork` devuelve `success` **sin
    pintar** (`runAttemptCount > 0`, ver `SessionWorker.doWork`).
  - *Actualizar la app / reiniciar* — **confirmado** en nuestro código y en Glance: el
    `MyPackageReplacedReceiver` de Glance solo hace `cleanReceivers()`, y la app no
    escuchaba ni `MY_PACKAGE_REPLACED` ni `BOOT_COMPLETED`; `actualizaTodo` solo saltaba
    con cambios hechos en la app. Android sí manda `APPWIDGET_UPDATE` tras reiniciar o
    actualizar, pero sin «Inicio automático» HyperOS no deja arrancar el proceso por un
    broadcast (*plausible*, no comprobable sin el móvil: el registro lo dirá).
  - *Solo se capturaba `ErrorApi`* — **confirmado, y con un fallo más:** en
    `Api.ejecuta` el cuerpo se leía **fuera** del `catch (IOException)`, así que un
    tiempo agotado o un corte a mitad de respuesta salía como `SocketTimeoutException`
    suelta → error de composición → layout de error de Glance («Can't show content»).
  - *Caché solo sin conexión* — **confirmado** (pruebas rojas): con 401, 5xx o la página
    HTML del proxy con un 200, el widget enseñaba título y mensaje de error, nada de lo
    guardado. Con un JSON de forma rara (sin `bloques`), una nota vacía.
  - *`update` con la sesión abierta* — **confirmado:** `GlanceAppWidget.update` sobre
    una sesión viva solo recarga el estado (`updateGlance`), no vuelve a llamar a
    `provideGlance`: el botón de refrescar o un cambio en la app durante los 45 s de
    sesión no traían datos nuevos.
  - *Sesión en segundo plano* — **descartado:** `Application.onCreate` corre siempre
    antes que cualquier receptor o worker, y el token vive en `SharedPreferences`. Un
    token caducado es el caso 401 de arriba.
  - *Periódico* (`WidgetsWorker`, 30 min, KEEP + red) — bien programado (al arrancar con
    sesión y al entrar), pero solo encolaba sesiones que luego hacían lo de arriba; en el
    cubo «restringido» de HyperOS puede tardar horas.
  - *`SizeMode.Exact`* — cada cambio de opciones del lanzador abre otra composición: con
    el código viejo, otra vuelta por la red antes de pintar.

  **Arreglo** (`widgets/Widgets.kt`):
  - `provideContent` al momento. `rememberDatos` pinta lo último bueno de la caché de
    `Repo` (en `filesDir`: sobrevive a que maten el proceso y a actualizar; su fecha es la
    del fichero) y refresca en un `LaunchedEffect`. El refresco va por `Repo.fresca`
    (solo red, sin caer a la caché), valida la forma y solo entonces guarda; si falla,
    sigue lo último con «Sin actualizar · hace 2 h» (y «· Inicia sesión en la app» con
    401). Sin datos: «Cargando…», «Sin conexión. Toca para reintentar.», «Inicia sesión
    en la app…» o «Toca para elegir…». El aviso se toca para refrescar.
  - Cada petición de repintar escribe `pedido = motivo@ms` en el estado del widget:
    con la sesión abierta, el cambio de estado relanza el refresco (ver arriba).
  - Todo `Throwable` (salvo cancelar) capturado y apuntado: refresco, acciones
    (`MarcaCasilla`, `MarcaFila`, `Refrescar`) y repintados. `WidgetNotiono` sobreescribe
    `onCompositionError`: lo apunta y pinta `widget_cargando` con «No se pudo pintar.
    Toca para abrir Notiono.» en vez del de Glance.
  - `initialLayout` propio (`layout/widget_cargando.xml`: fondo de la app, «Notiono»,
    «Cargando…»). Los widgets ya puestos lo toman al actualizar (es del provider).
  - Se repintan al abrir la app (`MainActivity`), tras reiniciar y actualizar
    (`RepintaReceiver`), al entrar o salir (`Sesion.conectada`), con cambios de la app y
    cada 30 min.
  - `Api`: el cuerpo se lee dentro del `catch`, y las **consultas** son interrumpibles
    (`runInterruptible`: una sesión de widget cancelada corta su petición). Las
    mutaciones no, a propósito: que se cierre una pantalla no puede cortar un cambio.
  - Ajustes → **Widgets** (solo si hay alguno puesto): la explicación sale si la batería
    no está en «Sin restricciones» (se comprueba con `isIgnoringBatteryOptimizations`) o,
    en Xiaomi/Redmi/POCO, si aún no se abrió la pantalla de Inicio automático (no se puede
    comprobar: se recuerda que se ofreció). Los botones se quedan para volver a abrirlas
    (`AutoStartManagementActivity` de `com.miui.securitycenter`, o los detalles de la app
    si no existe; `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, permitido fuera de Play).

  **Pruebas** (`widgets/WidgetsFallosTest.kt`, sesión de Glance real con
  `compose`/`runComposition` y MockWebServer): servidor lento (8 s) en Nota y en Lista,
  500, 401, HTML con 200, JSON sin bloques, proceso nuevo, sin sesión, sin configurar.
  **Con el código de la 2.0.2, 7 de 8 rojas** (la de «sin configurar» ya pasaba); ahora
  verdes. `WidgetsTest.estados` fotografía los estados nuevos
  (`app/build/capturas/estados-widgets.png`, con `-Proborazzi.test.record=true`).

  **Registro de diagnóstico**. En la app, `datos/Registro.kt`: líneas JSON en
  `filesDir/registro.jsonl` (las últimas ~200), con refrescos de widget (widget, motivo,
  resultado, duración, error), cierres inesperados (`setDefaultUncaughtExceptionHandler`,
  que luego deja seguir el cierre) y respuestas 5xx o raras del servidor (`Repo.alFallar`).
  Sin contenido: tipo, clase y **primera línea** del mensaje (las siguientes de un error
  de JSON traen el texto recibido) y la traza solo con clases y líneas. Se manda en lote
  al abrir la app y en el periódico; si falla, queda para la próxima. Ajustes →
  Diagnóstico enseña lo último y tiene «Enviar ahora». Pruebas en `datos/RegistroTest.kt`.
  En el servidor, `POST /api/app/registro` (sesión de la app, 30 envíos/10 min, cuerpo de
  2 MB como mucho, entradas recortadas) y tope de 30 días y 2000 filas por usuario en
  `src/server/appRegistro.ts`; probado en `scripts/checkRegistro.ts` (`npm run check`).
  Para leerlo en el NAS:

  ```bash
  sudo docker exec -it notiono-db psql -U notely notely
  ```
  ```sql
  -- Lo último de todos los móviles
  SELECT r."createdAt", u.email, r.fabricante, r.modelo, r.android, r.version, r.tipo, r.mensaje
  FROM "AppRegistro" r JOIN "User" u ON u.id = r."userId"
  WHERE r."createdAt" > now() - interval '3 days'
  ORDER BY r.fecha DESC LIMIT 200;
  -- Fallos inesperados que la red de seguridad cazó sin cerrar la app (desde la 2.1.0)
  SELECT r.fecha, r.version, r.modelo, r.mensaje, r.traza
  FROM "AppRegistro" r WHERE r.tipo = 'fallo' ORDER BY r.fecha DESC LIMIT 20;
  -- Cierres inesperados con su traza
  SELECT r.fecha, r.version, r.modelo, r.mensaje, r.traza
  FROM "AppRegistro" r WHERE r.tipo = 'cierre' ORDER BY r.fecha DESC LIMIT 20;
  -- Cómo les va a los widgets: fallos frente a aciertos por día
  SELECT date_trunc('day', r.fecha) AS dia, split_part(r.mensaje, ' · ', 3) AS resultado, count(*)
  FROM "AppRegistro" r WHERE r.tipo = 'widget' GROUP BY 1, 2 ORDER BY 1 DESC;
  ```
- **Widgets 2.0.1 (18-oct-2026)**: Jose vio en su Xiaomi (HyperOS) el icono en grande
  al añadir los widgets: no había vista previa. Ahora cada widget lleva
  `android:previewImage` (PNG claro/oscuro sacado de los composables reales por
  `VistasPreviasTest`: el launcher de Xiaomi ignora `previewLayout`), `previewLayout`
  estático para Android 12+ y vista previa generada en Android 15 (`providePreview`;
  `setWidgetPreviews` una vez por `versionCode`, está limitado por el sistema). Para
  igualar la app de notas de Pablo se añadieron **Acciones rápidas** (4×1; «Tarea» solo
  si se elige BD al configurarlo; «Foto» = cámara → página nueva con la foto, por el
  mismo camino que «Compartir con Notiono») y **Páginas recientes** (4×3; favoritas del
  servidor arriba y luego los recientes del móvil, que no tienen fecha de edición del
  servidor: la fecha relativa es la de la última vez que se abrió). En Lista de BD la
  casilla pasa a un círculo de 22 dp con zona de toque de 36 dp; la fila hecha, tachada.
- **Fondos de los widgets en drawables con forma** (`widget_fondo*`): Glance solo
  aplica `cornerRadius` desde Android 12 y la app llega a Android 8; y en un lienzo de
  software (los PNG) tampoco recorta, así que los botones interiores salían cuadrados.
- **Arnés de las capturas de widgets**: el `AndroidView` va con `fillMaxSize()`; sin él
  se medía «como mucho» y las filas de Glance (Nota rápida, Acciones) se encogían a su
  contenido solo en la prueba. Los PNG se pintan dentro de una Activity de Robolectric:
  sin ventana no salen fondos ni el estado de las casillas.

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
