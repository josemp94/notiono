# El móvil

Notiono se usa en el móvil tanto como en el ordenador (y desde el APK, ver
`android.md`, es *solo* móvil). Esto recoge lo que hay que tener en cuenta y cómo
comprobarlo sin desplegar.

## Lo que se da por hecho en escritorio y en el móvil no existe

**No hay «pasar el ratón por encima».** Todo lo que estuviera escondido detrás de un
hover era, en el móvil, sencillamente inalcanzable: abrir la ficha de una fila, el
menú «···» de una columna, el «+» de crear una subpágina, las acciones de un
comentario. Se resuelve con la clase **`.al-pasar`**: escondido al ratón, visible en
pantalla táctil. Lo que de verdad necesita ratón —arrastrar filas, el tirador de
ancho de columna— se queda escondido a propósito: enseñarlo sería prometer algo que
con el dedo no funciona.

**El dedo no acierta en 28 px.** `.toque` deja 40×40 en táctil sin tocar el
escritorio; `.toque-estrecho` solo el alto, para lo que va en fila y no puede
ensancharse. Los menús colgantes se agrandan solos: el panel lleva `data-menu`.

**La pantalla mide 390 px, no 1440.** Un H1 de 3em son 48 px ahí: los encabezados del
editor van a los tamaños de Notion (30/24/20 px) cambiando la variable `--level` de
BlockNote, con `.bn-container` delante porque su hoja se carga después. Y cualquier
rejilla de dos columnas necesita `min-w-0` en la columna elástica, o un valor largo
—una URL— la estira y desplaza el panel entero de lado.

## La tabla

El margen izquierdo de cada fila (arrastrar, abrir ficha) mide **`GUTTER_WIDTH`**
(`src/lib/cellText.ts`) y ese ancho va **forzado** en todas sus celdas: cabecera,
filas, subtotales de grupo y pie. No es cosmético: es el punto del que cuelgan las
columnas congeladas (`frozenOffsets`). Cuando no cuadraba —`w-14` pedía 56 px y el
navegador encogía la columna a 35— quedaba una rendija de 21 px por la que se veía
pasar el resto de la tabla al desplazar en horizontal. Si tocas ese margen, cuadra
las dos cosas.

Lo que sigue sin estar: **la cabecera no se queda fija al bajar** por la tabla. El
contenedor de la tabla es `overflow-x-auto`, o sea que también es contenedor de
scroll vertical, y un `sticky top` ahí no se pega a nada. Arreglarlo pide que la
tabla scrollee por dentro en vertical, que en táctil trae sus propios problemas.

## Cómo se comprueba sin base de datos ni despliegue

Con un banco de pruebas: se empaqueta el componente real con esbuild, con `trpc`
sustituido por datos de mentira, se compila `globals.css` con postcss y se abre a
390×844 con Playwright. Así se ven —y se miden— cosas que a ojo no se ven: que el
hueco entre el margen y la primera congelada es de 0 px, que el panel de una ficha
mide 390 y no 422, que un input recorta con puntos suspensivos.

Medir, no mirar: `getBoundingClientRect()` sobre las celdas dice la verdad; una
captura reducida, no. Lo que parecían restos de contenido colándose por el margen
resultaron ser, con la lupa puesta, los bordes de fila.

## Navegación, teclado y editor

- **El panel lateral se abre desde arriba a la izquierda** (`BotonPanel`, en
  `AppShell.tsx`), en la barra superior de cada pantalla, como en Notion. La barra de
  abajo (`BarraInferior.tsx`) es Inicio, Buscar, Nueva, Tareas y Bandeja.
- **El teclado encoge la página** (`interactive-widget=resizes-content` en
  `layout.tsx`, lo pide BlockNote): así la barra de formato del editor queda sobre el
  teclado. Mientras está abierto, la barra de abajo se esconde (si no, flotaría sobre
  las teclas).
- **Enter en Android**: ProseMirror deja que el navegador parta el párrafo y lo lee del
  DOM. BlockNote 0.53 ignoraba ese cambio y Enter no hacía nada; se arregló en 0.55.
  Playwright con `keyboard.press("Enter")` **no** lo reproduce: hay que imitar a Gboard
  por CDP (`Input.dispatchKeyEvent` con keyCode 229 y `Input.insertText("\n")`).
- **Búsqueda, bandeja y comentarios van a pantalla completa** en el móvil.
- **El tirador de bloque (⠿ +) no se enseña en táctil**; en la tabla, tocar el título de
  una fila abre su ficha en vez de editarlo.

## BlockNote pisa las tablas que no son suyas

Una BD embebida vive dentro del editor, y la hoja de BlockNote aplica a toda tabla bajo
`.ProseMirror` `table-layout: fixed`, `width: 100%`, `min-width: auto !important` y
`position: relative` en cada celda. Resultado: columnas aplastadas (una fecha partida
letra a letra) y la columna congelada montada encima de la vecina. Nuestras tablas
llevan la clase `.tabla-bd` y en `globals.css` se les devuelve lo suyo; el mínimo de
cada columna viaja en la variable `--min-col`. Si añades otra tabla que pueda acabar
dentro del editor, ponle `.tabla-bd`.

## La app entera en local, sin Docker ni Postgres

Para revisar pantallas de verdad (no solo componentes sueltos) se puede levantar todo
en el PC con **PGlite** (Postgres en WASM) servido por socket:

```bash
# en una carpeta temporal
npm i @electric-sql/pglite @electric-sql/pglite-socket
npx pglite-server -d ./pgdata -p 55432 -m 10
# en el repo
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable&connection_limit=1&pgbouncer=true"
npx prisma migrate deploy
npx next dev -p 3100
```

`pgbouncer=true` es obligatorio: PGlite comparte una sola sesión y las sentencias
preparadas de Prisma chocan («prepared statement "s0" already exists»). El login es
solo SSO, así que se crea a mano un usuario, su espacio (`ensureWorkspace` de
`src/server/provision.ts`) y una fila en `Session` con un token conocido, y se pone
esa cookie (`notiono_session`) en Playwright. Sin `server.mjs` no hay edición
simultánea, pero el resto funciona.
