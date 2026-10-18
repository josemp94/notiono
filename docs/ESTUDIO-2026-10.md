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
