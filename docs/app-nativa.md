# App nativa de Android — plan vivo

Tarea: `NATIVA-TASK.md` (raíz del repo). Este fichero es el estado: quien retome la
sesión sigue desde la primera casilla sin marcar. Se commitea con cada fase.

## Checklist

### F0 · Plan
- [x] Leer CLAUDE.md, AGENTS.md y docs; plan en este fichero.

### F1 · Servidor: sesión de la app (RFC 8252)
- [ ] Migración `AppAuthCode` (código de un solo uso, 2 min, challenge S256).
- [ ] `/api/auth/oidc/start?app=1&challenge=…` y callback → `notiono://auth?code=…` (el flujo web igual).
- [ ] `POST /api/app/sesion {code, verifier}` → token de sesión; `DELETE` la borra.
- [ ] `GET /api/app/version` (lee `src/lib/apk.json`).

### F2 · Servidor: bloques y Yjs
- [ ] Config de los bloques propios sin React (`src/components/editor/esquemaBloques.ts`) usada por las specs de React y por el esquema espejo del servidor.
- [ ] `src/server/app/bloquesYjs.ts`: leer bloques de un Y.Doc (siempre sobre una copia), aplicar operaciones por bloque con diff mínimo, conservar marcas que la app no conoce (comentarios en línea).
- [ ] Puente con Hocuspocus (`openDirectConnection` en el proceso de `server.mjs`); sin él, sobre `Page.ydoc` con bloqueo de fila. `Page.content` siempre por `jsonLimpio`.
- [ ] Router `app` (`src/server/routers/app.ts`): `pagina`, `aplicar`, …
- [ ] Pruebas en `npm run check`: cliente Yjs conectado recibe las ops, edición concurrente en otro bloque no se pierde, ida y vuelta de todos los tipos de bloque.

### F3 · Servidor: datos para la app
- [ ] `app.vista`: filas de una vista con el motor de la web (filtros, orden, búsqueda, grupos, subtareas, computados, colores, totales).
- [ ] Lo que pidan los widgets y la app (sin duplicar lógica en Kotlin).

### F4 · App: esqueleto
- [ ] Proyecto Gradle `app-android/` (Kotlin DSL + catálogo), firma desde `~/notiono-apk/firma.properties`.
- [ ] Tema (marca, claro/oscuro), arranque, edge-to-edge, atrás predictivo, icono adaptativo.
- [ ] Red: cliente tRPC/superjson, sesión (Custom Tab + PKCE), caché sin conexión y cola de cambios.
- [ ] Navegación: panel lateral con el árbol, Inicio, Buscar, Mis tareas, Bandeja, Ajustes.

### F5 · App: editor de bloques
- [ ] Modelo de bloques ↔ JSON BlockNote (conserva lo desconocido) ↔ Spannable.
- [ ] EditText con InputConnection propio; teclado (Enter, Retroceso, Markdown), menú `/`, `@`, barra de formato.
- [ ] Todos los tipos de bloque; subir archivos; tabla; ecuación; columnas apiladas; BD embebida.
- [ ] Sincronía por operaciones (rebote 1 s), cambios remotos por bloque, indicador de estado.

### F6 · App: bases de datos
- [ ] Tabla, Kanban, Lista, Galería, Calendario, Cronograma, Gráfica, Formulario.
- [ ] Filtros/orden/agrupación/búsqueda, ficha de fila con todas las propiedades, crear BD/columnas/vistas.

### F7 · App: resto de Notiono
- [ ] Comentarios, bandeja, enlaces entrantes, historial, papelera, plantillas, publicar, icono/portada, bloquear, tipografía, espacios, importar/exportar, compartir hacia Notiono, atajos, avisos con WorkManager, actualizaciones.

### F8 · Widgets (Glance)
- [ ] Nota, Lista de BD, Nota rápida.

### F9 · Verificación
- [ ] `npm run build` y `npm run check`.
- [ ] Pruebas JVM (fixtures reales del editor web).
- [ ] Integración contra Notiono local (PGlite + `server.mjs`).
- [ ] Capturas Roborazzi revisadas (claro/oscuro, 390 dp).
- [ ] `testDebugUnitTest`, `lintRelease`, `assembleRelease`, `apksigner`, `aapt2 dump badging`; APK en `~/notiono-apk/notiono-2.0.0.apk`.

### F10 · Documentación y entrega
- [ ] `npm run apk:publicar` adaptado (sin publicar).
- [ ] CLAUDE.md, `docs/android.md`, este fichero.

## Bitácora (decisiones y comprobaciones)

- **18-oct-2026 · Versiones**: AGP 9.4.1 (Kotlin integrado), Kotlin 2.4.21, Gradle 9.x,
  Compose BOM 2026.09.00, JDK 17 de `~/.bubblewrap`. Son las estables del día.
- **Caché local sin Room**: respuestas guardadas como JSON en ficheros por clave y la cola
  de cambios en un fichero; Room obligaría a KSP para guardar lo mismo. Si un día hace
  falta consultar la caché (no solo leerla), entonces Room.
- **Leer Yjs siempre sobre una copia**: `y-prosemirror` BORRA del documento los nodos que
  no puede convertir con el esquema que se le da. Convertir el documento vivo con un
  esquema incompleto destruiría contenido en todos los navegadores conectados.
- **Comentarios en línea**: viven como marca `comment` en el texto Yjs y `docToBlocks` la
  ignora. Al reescribir un bloque desde la app se vuelven a poner sobre el texto que no
  cambió (si no, el diff los quitaría).
