# Estudio de mejoras — octubre 2026

> Revisión completa de Notiono frente a Notion hecha el 17-oct-2026 leyendo el código (commit `59718bc`,
> 379 commits) en tres frentes: editor y navegación, bases de datos, y colaboración/plataforma/seguridad.
> `docs/notion-parity.md` (19-ago) y `docs/historico/AUDIT-NOTION-PARITY.md` se habían quedado ~50 commits atrás: muchos ❌
> de ahí ya están hechos (ecuaciones, columnas arrastrando, estilo de página, bloqueo, seguir página…).
> Este documento manda sobre ellos para el plan; la tabla de paridad se irá poniendo al día por tandas.
>
> Leyenda: ✅ hecho · 🟡 parcial · ❌ falta. Esfuerzo: S (horas) · M (un día) · L (varios días).

## 1. Foto rápida

Notiono ya cubre el día a día de Notion para una familia: páginas de bloques con colaboración en vivo,
8 vistas de BD, 21 tipos de campo, fórmulas, relaciones bidireccionales, rollups (20 agregados),
permisos por página con herencia, comentarios con reacciones y menciones, bandeja con push real,
historial con diff, publicación con contraseña y caducidad, API REST, webhooks, PWA y modo sin conexión.

Lo que más se echa en falta, por orden de lo que se nota al usarlo:

1. **Arrastrar en el Kanban** (no funcionaba en móvil) y el **selector de icono** (32 emojis fijos). → Hecho en esta tanda.
2. **Agujeros de seguridad** que rompen los permisos por página (API v1, tokens, notificaciones). → Hecho en la tanda 2.
3. **El menú de bloque** es pobre (solo Borrar / Colores / Copiar enlace) y **en móvil no existe**.
4. **Pegar un enlace** no ofrece nada (Notion pregunta: mención / marcador / insertar).
5. **Automatizaciones** (cuando cambie X → haz Y): no hay ninguna.

## 2. Tanda 1 — peticiones de Yago (hecho)

| Petición | Estado | Dónde |
|---|---|---|
| Columnas mucho más estrechas; la de casilla, solo lo que ocupa la casilla | ✅ mínimo 32 px; las casillas nacen estrechas | `cellText.ts` `MIN_COL_WIDTH`, `TableView.tsx` `estrecha()` |
| Nombre de columna totalmente vacío | ✅ se guarda vacío; en menús se ve «Sin nombre» | `nombreCampo()` |
| Líneas verticales entre celdas, iguales que las horizontales | ✅ por defecto, con interruptor «Líneas verticales» | `TableView.tsx` `lineaV`, `DbToolbar.tsx` |
| Iconos de página como Notion | ✅ pestañas Emojis (catálogo completo, búsqueda en castellano, recientes, aleatorio), Iconos (257 dibujos × 9 colores) y Subir (archivo, arrastrar, pegar o enlace) | `PageIcon.tsx`, `iconosPagina.tsx`, `emojisBusqueda.ts` |
| Kanban: arrastrar tarjetas y grupos como Notion | ✅ se levanta y sigue al puntero, hueco donde caerá, el resto se aparta animado; en móvil con pulsación larga | `KanbanView.tsx` (dnd-kit) |

Probado en PC y móvil (toque real por CDP): cruzar columnas, reordenar, mover grupos, vista ordenada,
columna vacía, carriles y recarga.

## 3. Seguridad (tanda 2, hecho)

| # | Problema | Riesgo | Arreglo | Estado |
|---|---|---|---|---|
| S1 | La **API REST v1** solo mira el espacio de trabajo: ignora las páginas restringidas | Alto | pasar `nivelDePagina`/`exigeNivel` en cada handler de `src/app/api/v1/*` | ✅ `exigeApi`/`paginaDe` en `apiAuth.ts`; restringida sin invitación = 404, sin nivel = 403; el listado filtra |
| S2 | Cualquier miembro (no lector) puede **crear tokens de API** | Alto (amplifica S1) | `apiTokens.create` solo dueño/admin | ✅ de otra forma: el token actúa con el rol y los permisos de quien lo creó (y deja de valer si sale del espacio), así que no amplía nada; cada uno ve sus tokens, dueño/admin todos con su autor |
| S3 | Las notificaciones de **mención, asignación y vencimiento** llegan a quien no puede ver la página (título + enlace) | Medio | filtrar destinatarios por `nivelDePagina` (`comments.ts`, `db.ts` assign, `notifications.ts` checkDue) | ✅ `filtraQuienesVen` (también seguidores y `notifyMention`) |
| S4 | **SSRF** en la vista previa de enlaces: sigue redirecciones sin revalidar la IP | Medio | `redirect: "manual"` y revalidar cada salto | ✅ cada salto se revalida y la IP comprobada es la que se conecta (sin DNS rebinding); cuerpo tope 200 KB |
| S5 | Páginas publicadas **indexables** por buscadores, sin opción | Medio (privacidad familiar) | `robots: noindex` por defecto + interruptor «Permitir buscadores» | ✅ noindex en todo (meta, `X-Robots-Tag`, `robots.txt`); el interruptor queda para cuando alguien lo pida |
| S6 | `publicAuth.ts` usa un secreto de desarrollo si falta `AUTH_SECRET` | Bajo | fallar en producción en vez de usar el secreto fijo | ✅ `authSecret.ts` (sesión pública y token de colaboración) |

## 4. Huecos frente a Notion, por zonas

### 4.1 Editor y páginas
| Hueco | Valor | Esf. |
|---|---|---|
| Menú del bloque: **Duplicar, Convertir en, Mover a, Comentar** | Alto | M |
| **Bloques en móvil**: hoy el `⠿` y el `+` están ocultos en táctil sin alternativa (`globals.css`) → pulsación larga con hoja inferior | Alto | M |
| **Pegar URL** → elegir mención / marcador / insertar | Alto | M |
| Embeds: Google Maps, Figma, X, Spotify, PDF en línea, iframe genérico (hoy solo YouTube/Vimeo) | Medio | S |
| Botón de **código en línea** en la barra de formato | Medio | S |
| **Renombrar** desde el árbol lateral; **Duplicar** en el menú «⋯» de la página | Medio | S |
| **Texto pequeño** en el estilo de página | Bajo | S |
| **Contador de palabras** | Bajo | S |
| **Buscar en la página** que abra los desplegables | Medio | M |
| Vista previa lateral (peek) de páginas normales, no solo de filas | Medio | M |
| Tabla simple: fila/columna de cabecera y color por celda | Medio | M |
| Bloque **botón de plantilla**, **bloque sincronizado**, **enlace a página** en tarjeta grande, **migas de pan** | Medio | M–L |
| Ecuación **en línea** | Bajo | M |

### 4.2 Bases de datos
| Hueco | Valor | Esf. |
|---|---|---|
| **Cálculos del pie** incompletos: faltan valores únicos, mediana, rango, % no vacíos (ya existen en `rollup.ts`) | Medio | S |
| **Altura de fila** (corta / media / alta) | Medio | S |
| **Vista por defecto** explícita (hoy es la primera pestaña y cambia al reordenar) | Medio | S |
| **Bloquear vista** | Medio | S |
| **Editor de fórmulas** con autocompletado y resultado en vivo | Alto | M |
| **Plantillas de fila** por base de datos (y repetitivas) | Alto | M–L |
| **Automatizaciones**: «cuando cambie / se cree → poner valor, avisar, webhook» | Alto | L |
| Vista **Mapa** interactiva (ya hay campo Lugar con geocodificación) | Medio | M |
| Formularios: lógica condicional y campos persona/archivos/multiselección/relación | Medio | M |
| Fechas: **recordatorio por celda** y zona horaria | Medio | M |
| Tablas enormes: virtualización real de filas | Medio | M |

### 4.3 Colaboración y plataforma
| Hueco | Valor | Esf. |
|---|---|---|
| **Respuestas en hilo** en comentarios (hoy son planos) | Medio | M |
| Comentarios en línea del editor desconectados de menciones/bandeja | Medio | M |
| Bandeja con pestañas **Sin leer / Todo** | Medio | S |
| Recordatorios con **planificador** en el servidor (hoy solo se revisan al abrir la app) | Alto | M |
| **Actualizaciones optimistas** (la interfaz espera al servidor en cada cambio) | Alto (sensación de rapidez) | M |
| **Carga diferida** de BlockNote, ECharts, KaTeX… (hoy van en el primer paquete) | Alto (arranque en móvil) | S–M |
| **Ctrl+P** como cambio rápido de página | Bajo | S |
| «Duplicar como plantilla» en páginas publicadas | Bajo | S |
| Invitados y grupos | Bajo para una familia | L |
| Correo (resúmenes, correo→página) e IA | Medio | L |

## 5. Ideas propias (más allá de Notion)

Pensadas para el uso real de la familia (tareas, casa, recetas, viajes), sin servicios de pago:

- **Captura rápida**: compartir desde el móvil (Web Share Target de la PWA) → crea una página o fila en la bandeja de entrada de Notiono.
- **Recordatorios de verdad**: planificador en el servidor que dispara push a la hora exacta (no al abrir la app) y repeticiones (cada día / semana / mes).
- **Tareas repetitivas**: al marcar como hecha una fila con «Repetir», se crea la siguiente con la fecha movida.
- **Vista «Hoy»** en el inicio: lo que vence hoy de todas las BD, recordatorios y menciones sin leer.
- **Plantillas familiares** listas: menú semanal + lista de la compra, viaje con checklist, mantenimiento de la casa, gastos compartidos.
- **Dobby dentro de Notiono**: el webhook de tareas ya existe; un botón «Pedir a Dobby» en una fila o página.

## 6. Plan por tandas

1. ✅ **Peticiones de Yago** (tablas, iconos, Kanban).
2. ✅ **Seguridad** S1–S6.
3. **BD baratos**: cálculos del pie, altura de fila, vista por defecto, bloquear vista.
4. **Editor**: menú de bloque completo (también en móvil), pegar URL, embeds, código en línea, renombrar/duplicar.
5. **Rendimiento**: carga diferida y actualizaciones optimistas en lo más usado.
6. **Recordatorios y repetición**: planificador en el servidor + tareas repetitivas.
7. **Fórmulas y plantillas de fila**; después automatizaciones.

Cada tanda se prueba en PC y móvil en una copia aparte antes de subirla.

## 7. Fallos menores vistos al leer

- `globals.css`: ocultar `.bn-side-menu` en táctil quita también el botón `+`, no solo el `⠿`.
- `FormFields.tsx`: los tipos no soportados en formularios se omiten sin avisar al dueño.
- `Notification.type` en `schema.prisma` documenta 4 tipos y se usan 6 (`form`, `follow`).
- `ratelimit.ts` es en memoria: válido con una réplica, dejaría de limitar con varias.

## 8. Espacios y compartir (25-oct)

Encargo: Gio quiere compartir con Rocío solo una parte de su Notiono y tener aparte un
espacio común de la casa. Regla de Jose a mitad del encargo: **todo como en Notion**.

### Por qué faltaba «Nuevo espacio»

No hubo un motivo. `ddd269e` (compartir espacios y roles) ya montó el selector y la
cookie `notiono_ws` pensando en varios espacios por persona (los compartidos); solo
faltó crear más. Revisado lo que podía romperse con varios espacios propios:

- **Recientes** (localStorage): ya iban por espacio (`notiono.recents.<id>`). **Inicio**
  y «Abrir al iniciar»: por persona y espacio (`Member.inicio`). **Búsqueda, Mis tareas,
  tokens y webhooks**: por espacio activo. Nada se mezclaba.
- **Bandeja**: por espacio; lo de los demás espacios no se veía → ahora el selector
  enseña sus no leídos.
- **Push y enlaces**: un aviso de otro espacio abría «Página no encontrada» → ahora
  pasa a ese espacio y la abre (`/api/espacio/<id>?a=…`).
- **Contexto sin cookie**: caía en el espacio más antiguo al que tuvieras acceso, que
  podía ser uno ajeno → ahora el propio primero.
- **App Android**: manda `notiono_ws` y su hoja lee `workspace.list`: ve los espacios nuevos.

### Qué dice Notion (centro de ayuda) y qué se ha copiado

- *Create, join & leave workspaces*: el selector con el nombre del espacio, desplegable
  con los espacios y el activo marcado, crear uno nuevo; salir en Ajustes → General →
  «Zona de peligro». Copiado tal cual (el selector, arriba a la izquierda como hoy en Notion).
- *Delete a workspace*: «Eliminar todo el espacio» en la Zona de peligro, escribiendo su
  nombre. Copiado.
- *Workspace settings*: General con nombre e icono (emoji o imagen). Copiado, con el
  selector de iconos de las páginas.
- *Add members, admins, guests*: miembros frente a invitados; invitar por correo con
  rol; invitaciones pendientes; cambiar rol y quitar; convertir un invitado en miembro;
  pestañas Miembros e Invitados. Copiado en Ajustes → Personas (y «Invitar miembros» del
  selector, que abre lo mismo). Roles presentados con nombre y qué pueden hacer:
  Propietario del espacio, Miembro (nuestro editor) y Lector (nuestro viewer).
- *Sharing & permissions*: «Compartir» de una página invita por correo con Acceso total /
  Editar / Comentar / Ver; el invitado la ve en «Compartido» del panel; las subpáginas
  heredan. Copiado.
- *Move & duplicate content between workspaces*: «Mover a» lleva abajo el selector de
  espacio; a otro espacio, la página **se duplica** tras «Entiendo, duplicar» y el
  original se queda; enlaces, relaciones y permisos pueden romperse. Copiado.
- Diferencias que quedan: Notion admite varios propietarios (aquí uno, que se traspasa),
  invita por correo (aquí también por usuario del NAS, que es el SSO) y no tiene rol Lector.

### Hecho

- `b4b67a4` **Nuevo espacio** (nombre + icono, entra en él), renombrar e icono; el alta por SSO y el botón comparten `creaEspacio` (`services/espacios.ts`); tope de 20 espacios propios.
- `0b91413` **Ajustes del espacio** como Notion: General (nombre, icono, Zona de peligro con salir / eliminar escribiendo el nombre, nunca el último propio), Personas (invitar por correo o usuario del NAS, **invitaciones pendientes** que se canjean en el primer login —tabla `Invitacion`—, cambiar rol, quitar, **traspasar la propiedad**) y **aviso** en la bandeja y push al añadir a alguien.
- `30b36f8` **Avisos y enlaces entre espacios**: no leídos de cada espacio en el selector y abrir una página de otro espacio pasando a él.
- `8b0849b` **«Mover a» otro espacio** = duplicar allí (con las bases embebidas, sin lo que no ves, sin permisos, quitando relaciones a bases que no viajan). De paso, duplicar en el mismo espacio ya no pierde la restricción de las páginas restringidas.
- `b782d57` **Arreglos de permisos** vistos al auditar (valen también para páginas restringidas): relaciones/rollups leían bases que no ves; `updateCell` aceptaba cualquier fila en una relación y escribía en ella por el espejo; reaccionar/resolver comentarios no miraba el nivel; el formulario público avisaba a todos; la sala en vivo no revalidaba el nivel de la página.
- `2893c23` **Invitados de página** (los *guests* de Notion), estancos y cerrados por defecto: lista `PERMITIDO_INVITADO` en `trpc.ts`, nivel solo por página en `perms.ts`, sección «Compartido», Inicio propio, pendientes (`InvitacionPagina`) y avisos. Probado vía por vía en `scripts/integracion-espacios.ts`, con un barrido de los 140 procedimientos y una prueba de mutación (quitar la lista hace fallar la prueba).
- `a249298` Retoques tras revisar las pantallas con capturas (390 px oscuro y 1440 px).
- Salir de un espacio: comprobado que los tokens de API de esa persona dejan de valer (`apiAuth.ts` exige ser miembro) y además se borran.
- Borrar un espacio: páginas, bases, comentarios, versiones, permisos, miembros, tokens, webhooks, avisos e invitaciones en cascada; los archivos subidos (sin FK) se borran a mano salvo los que nombre otro espacio (una copia duplicada allí). Los demás miembros caen en otro espacio sin error.

### Límites conocidos de los invitados (documentados, no son fugas de datos)

- **Bases embebidas** dentro de una página compartida: el invitado no las ve (su página contenedora no cuelga de la compartida). Las bases que son subpáginas sí.
- El **texto** de la página compartida se ve entero, incluidos los títulos de las menciones y enlaces a páginas que no puede abrir (es contenido de la página, como en un documento).
- La **app Android** le responde «prohibido» casi todo (`app.*` está fuera de la lista): para invitados, mejor la web por ahora.
- Un invitado con Acceso total **no puede volver a compartir** la página (en Notion sí); no tiene API, Mis tareas, papelera ni plantillas.

### Propuesto, por prioridad

1. **App Android** (mediano): crear espacio, renombrar e icono, salir, Personas, y pintar los avisos nuevos `space` y `share` (hoy salen como «te mencionó en una página borrada»); y un modo invitado que use solo lo permitido. Su hoja de espacios ya ve los nuevos.
2. **Bases embebidas para invitados** (mediano): que el contenedor herede el nivel de la página que lo enseña (o colgarlo de ella al crearlo). Es lo que más se notará al compartir una página con una tabla dentro.
3. **Duplicar en el mismo espacio copia las bases embebidas** (pequeño): hoy la copia sigue enseñando la base de la original; en otro espacio ya se copian.
4. **Que un invitado con Acceso total pueda compartir** (pequeño, decidir): como Notion; abrir `pages.perms.*` al invitado exige revisar que no vea la lista de miembros.
5. **Correo de invitación** (mediano): no hay SMTP; quien no ha entrado nunca no se entera hasta que entra. Con el SSO del NAS basta avisar por WhatsApp.
6. **Varios propietarios por espacio** (mediano): `Workspace.ownerId` es único en todo el código; el traspaso cubre el caso familiar.
7. **Ctrl+Mayús+número** para saltar de espacio, como Notion (pequeño).
8. Al traspasar el único espacio propio, quien lo era recibe uno nuevo y vacío en su siguiente login (`ensureWorkspace`) (pequeño; quizá es lo deseable).
