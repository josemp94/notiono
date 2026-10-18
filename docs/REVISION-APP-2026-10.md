# Revisión a fondo de la app de Android — plan vivo (oct-2026)

Encargo: «Revísala a fondo y que todo funcione bien. Que haga lo mismo que Notion» (Jose,
18-oct-2026; el texto lo guarda Dobby en `~/Dobby/encargos/REVISION-APP-TASK.md`). La app es
`app-android/` (2.0.3). Este fichero es el estado: quien retome sigue desde la primera casilla
sin marcar. Se commitea por tandas.

Leyenda del inventario: ✅ igual · 🟡 parcial (qué falta) · ❌ falta · ➖ no aplica (Notiono no
lo tiene en la web, o no tiene sentido en el teléfono: no se hace).

## Checklist

### R1 · Inventario «Notion para Android» vs la app
- [x] Lista de lo que hace la app de Notion en Android (centro de ayuda y notas de versiones, oct-2026).
- [x] Lectura de todo el código de la app (`app-android/app/src/main`, ~14 000 líneas).
- [x] Inventario abajo, con lo que falta.

### R2 · Robustez (que no se cierre nunca)
- [x] Red: todo error (cuerpo cortado, HTML o JSON raro) sale como `ErrorApi` (`canjear`, `subir`, `getJson`, `versionPublicada`, `postJson`): un único `Api.llama`.
- [x] Enlaces e intents raros: ids validados en `Destino.de` y en `Navegador`; los destinos se consumen una vez (canal, no flujo con repetición).
- [x] `startActivity`/lanzadores sin app que los atienda: `Enlaces.lanza` (correo, teléfono, cámara, permisos, instalador, compartir) y descargas en Android 8–9 o con URL que no es http.
- [x] Claves repetidas en listas perezosas: bloques (`visibles`), filas y grupos (`EstadoBD`), columnas del Kanban, búsqueda, bandeja, favoritos, papelera, menciones.
- [x] Índices sin comprobar: gráfica, tabla del editor (`Tabla.*` con `as?`), menús «/» y «@» con el texto cambiado (`quitaConsulta`).
- [x] Datos que se perdían: título pisado mientras se escribe (`TituloEnEdicion`); lo escrito justo antes de girar con un envío en camino (`Sincro.alCerrar`); la foto de la cámara si Android mata la app (`rememberSaveable`).
- [x] BD: respuestas viejas que pisaban la vista elegida; valores optimistas que volvían a su valor viejo al refrescar o sin red.
- [x] Gestos que leían valores viejos (Kanban y arrastre de bloques): `rememberUpdatedState`.
- [x] Avisos que se repetían; compartir texto con formato (`CharSequence`); fotos de 12 MP en Android 8 (reducidas al leer).
- [x] Caché escrita fuera del hilo principal; árbol leído una vez por página; iconos en un mapa concurrente.
- [x] Red de seguridad: las corrutinas de las pantallas y la de la app apuntan un fallo inesperado en el registro («fallo») y avisan en vez de cerrar la app.
- [x] Pruebas (`RedTest`, `DestinoTest`, `RobustezEditorTest`, `SincroTest`, `EstadoBDTest`, `GraficaTest`, `KanbanTest`, `TituloTest`, `CompartirTest`, `EnlacesTest`): 53 en total, verdes. Las 9 que se podían pasar al código de la 2.0.3, rojas con él.

### R3 · Recorrido real contra Notiono local
- [ ] Notiono local (PGlite + `server.mjs` + SSO falso) con datos realistas.
- [ ] Integración: crear página, escribir con formato, `/`, mover bloques, comentar; BD: fila, cada tipo de propiedad, vistas, filtro, Kanban, calendario, ficha, subtareas; buscar; bandeja; papelera y restaurar; plantillas; compartir hacia la app; widgets. Comprobado en el servidor.
- [ ] Capturas claro/oscuro revisadas una a una.

### R4 · Lo que falta para igualar a Notion (por uso diario)
- [x] 1. Deshacer / rehacer en el editor (barra, Ctrl+Z/Ctrl+Mayús+Z, «Deshacer» al eliminar un bloque). Etiquetas de TalkBack en la barra, el asa y las casillas.
- [ ] 2. Abrir el aviso en su sitio (vencimiento → la fila) y deslizar para marcarlo leído.
- [ ] 3. Compartir el enlace de la página con el menú del sistema.
- [ ] 4. Modo oscuro a mano (Sistema / Claro / Oscuro).
- [ ] 5. Zoom con pellizco en las imágenes.
- [ ] 6. Compartir hacia la app: varias imágenes y archivos cualquiera.
- [ ] 7. Papelera de filas de una BD.
- [ ] 8. Reordenar favoritos.

### Entrega
- [ ] `versionCode` 7, `versionName` 2.1.0; `npm run build` + `npm run check`.
- [ ] `./gradlew testDebugUnitTest lintRelease assembleRelease`, `--stop`.
- [ ] Integración y capturas contra Notiono local.
- [ ] `node scripts/publicar-apk.mjs`, copia en `~/notiono-apk/notiono-2.1.0.apk`, `apksigner` (`8c9bb7dc…cb8e9a`).
- [ ] `docs/app-nativa.md` al día.

## Inventario (R1)

Fuentes de Notion: notion.com/help (`workspaces-on-mobile`, `writing-and-editing-basics`,
`updates-and-notifications`, `use-pages-offline`, `mobile-widgets`, `web-clipper`,
`views-filters-and-sorts`) y notion.com/releases (2022–2026). La ayuda móvil de Notion está
a medias: lo que no documenta para el móvil se compara con lo que hace la web de Notiono.

### Navegación y panel
| Función | Notion Android | App | Estado |
|---|---|---|---|
| Barra inferior | Inicio, Buscar, Bandeja, Nueva (2026: pestañas deslizables con IA y reuniones) | Inicio, Buscar, Nueva, Tareas, Bandeja con insignia | ✅ (IA y reuniones ➖) |
| Panel: espacio, accesos, favoritos, árbol, papelera | ✅ | ✅ espacio, Buscar/Inicio/Bandeja/Ajustes, Favoritos, Páginas, nueva página/BD, plantillas, importar, papelera | ✅ |
| Desplegar hijas con el triángulo | ✅ | ✅ | ✅ |
| Crear subpágina desde el árbol | ✅ | ✅ «+» por fila y en la pulsación larga | ✅ |
| Reordenar y anidar arrastrando | solo documentado en escritorio | Subir/Bajar y «Mover a…» en la pulsación larga | 🟡 sin arrastrar (la web sí arrastra) |
| Reordenar favoritos | ✅ | ❌ (la web arrastra) | 🟡 |
| Cambiar de espacio | tocar el nombre arriba | ✅ hoja de espacios | ✅ |
| Deslizar desde el borde para el panel | — | ✅ (`ModalNavigationDrawer`) | ✅ |
| Atrás predictivo | — | ✅ `enableOnBackInvokedCallback` | ✅ |

### Inicio, Buscar y Bandeja
| Función | Notion Android | App | Estado |
|---|---|---|---|
| Inicio: recientes y mis tareas | Recientes, Favoritos, Eventos, Mis tareas | saludo, Recientes, Mis tareas (lo mismo que la web) | ✅ (eventos de calendario ➖) |
| Buscar en títulos y contenido | ✅ | ✅ `pages.search` con contenido | ✅ |
| Filtros de búsqueda | título, creado por, espacio, en página | tipo y fecha (los de la web) | ✅ (los demás ➖) |
| Recientes al abrir Buscar | — | ✅ | ✅ |
| Buscar sin conexión | — | títulos del árbol guardado | ✅ |
| Bandeja: menciones, comentarios, asignaciones, vencimientos, seguidas | ✅ | ✅ | ✅ |
| Marcar leído / todo leído | ✅ deslizar | tocar abre y marca; «Marcar todas» | 🟡 sin deslizar para marcar leído |
| Abrir el aviso en su sitio | ✅ | abre la página; un vencimiento abre la BD, no la fila | 🟡 |
| Push | ✅ inmediato | WorkManager cada 15 min (sin Firebase, a propósito) | ✅ (inmediato ➖) |
| Archivar avisos, pestañas Sin leer/Todo | ✅ | — | ➖ (la web no los tiene) |

### Editor
| Función | Notion Android | App | Estado |
|---|---|---|---|
| Menú de bloques (`+` y `/`) | `+` en la barra | `/` al escribir y `+` en la barra | ✅ |
| Barra sobre el teclado | +, @, comentar, imagen, borrar, sangrar, color, duplicar, ⋯, bajar teclado | +, convertir, B/I/U/S/código, enlace, color, @, sangrar, desangrar, subir, bajar, ⋯, bajar teclado | 🟡 falta deshacer/rehacer |
| Deshacer / rehacer | ⋯ de arriba | ❌ | ❌ |
| Convertir en | ✅ | ✅ | ✅ |
| Colores de texto y fondo | ✅ | ✅ por tramo o por bloque | ✅ |
| Mover / duplicar / borrar bloque | ✅ | ✅ hoja del asa | ✅ |
| Arrastrar bloques | pulsación larga | pulsación larga en el asa | ✅ |
| Seleccionar varios bloques | selección de texto entre bloques (copiar) | ❌ cada bloque es su campo | ❌ |
| Sangrar / desangrar | ✅ | ✅ | ✅ |
| Menciones de página, persona y fecha | ✅ | ✅ (avisa a la persona) | ✅ |
| Recordatorio en la fecha | ✅ | — | ➖ (la web no los tiene en línea) |
| Enlaces | ✅ | ✅ poner/quitar/abrir | ✅ |
| Comentarios de página | ✅ | ✅ con reacciones, resolver, borrar | ✅ |
| Comentarios en línea | botón de la barra | se conservan pero no se ven ni se crean | 🟡 |
| Imágenes, cámara, archivos | ✅ y zoom con pellizco | ✅ galería, cámara, archivos, URL; pantalla completa sin zoom | 🟡 sin pellizco |
| Tablas simples | ✅ | ✅ celdas, filas y columnas | ✅ |
| Desplegables y encabezados plegables | ✅ | ✅ | ✅ |
| Llamadas | ✅ | ✅ emoji y color | ✅ |
| Código | ✅ | ✅ con lenguaje | ✅ |
| Ecuaciones | ✅ | ✅ bloque con vista previa | ✅ (en línea ➖) |
| Columnas | apiladas en el teléfono | apiladas, con separador | ✅ |
| Bloques sincronizados | ✅ | — | ➖ (la web no los tiene) |
| Índice, enlace web, BD embebida, vista enlazada, subpágina | ✅ | ✅ | ✅ |
| Atajos Markdown | ✅ | ✅ `#`, `-`, `1.`, `[]`, `>`, ```` ``` ````, `---` | ✅ |

### Bases de datos
| Función | Notion Android | App | Estado |
|---|---|---|---|
| Vistas | todas | Tabla, Kanban, Lista, Galería, Calendario, Cronograma, Gráfica, Formulario | ✅ |
| Filtros (con grupos), orden, agrupar, subagrupar, buscar | ✅ | ✅ | ✅ |
| Editar cada tipo de propiedad | ✅ | ✅ hoja por tipo | ✅ |
| Crear/editar vistas y propiedades | ✅ | ✅ (relación, rollup, fórmula incluidos) | ✅ |
| Abrir fila como página | ✅ | ✅ ficha a pantalla completa con cuerpo | ✅ |
| Subelementos | ✅ | ✅ | ✅ |
| Relaciones, rollups, fórmulas (lectura) | ✅ | ✅ texto calculado en el servidor | ✅ |
| Kanban: arrastrar entre columnas | ✅ | ✅ (2.0.2) | ✅ |
| Calendario: arrastrar a otro día | — | ❌ | ➖ (no en la ayuda móvil) |
| Cronograma: dependencias | — | sin flechas (la web sí) | 🟡 propuesta |
| Papelera de filas | ✅ | ❌ (la web sí: `db.archivedRecords`) | ❌ |
| Bloquear vista | ✅ | — | ➖ (la web no lo tiene) |
| Crear/personalizar formularios | no en el móvil | se rellenan | ✅ |

### Página
| Función | Notion Android | App | Estado |
|---|---|---|---|
| Icono (emoji, icono, imagen) y portada | ✅ | ✅ | ✅ |
| Reposicionar portada | — | ❌ (la web arrastra) | ➖ en el teléfono |
| Ancho completo | solo tableta | — | ➖ |
| Tipografía | ✅ 3 | ✅ 3 | ✅ |
| Texto pequeño | ✅ | — | ➖ (la web no lo tiene) |
| Bloquear | ✅ | ✅ | ✅ |
| Compartir el enlace (menú del sistema) | ✅ | solo «Copiar enlace» | 🟡 |
| Publicar en la web (contraseña, caducidad) | ✅ | ✅ | ✅ |
| Invitar / permisos por página | ✅ | — (la web sí) | ❌ propuesta |
| Historial de versiones | ver y restaurar | ✅ ver y restaurar | ✅ |
| Papelera, favoritos, copiar enlace, mover, duplicar, exportar, seguir, enlaces entrantes | ✅ | ✅ | ✅ |
| Plantillas | ✅ | ✅ galería | ✅ |

### Sistema
| Función | Notion Android | App | Estado |
|---|---|---|---|
| Sin conexión | por página («Disponible sin conexión») y automático | lo abierto queda en caché; cambios a la cola | 🟡 sin descarga explícita |
| Compartir hacia la app | texto, web, imágenes y archivos; elegir página o BD | texto, enlace e imagen → página nueva o al final de una | 🟡 sin varios ni archivos ni BD |
| Accesos directos del icono | ✅ | ✅ Nueva página, Buscar | ✅ |
| Widgets | Página, Favoritos, Recientes, IA | Nota, Lista de BD, Nota rápida, Acciones, Recientes | ✅ (más que Notion) |
| Modo oscuro | sistema / claro / oscuro | sigue al sistema | 🟡 sin elegir a mano |
| Rendimiento | — | listas perezosas; caché leída en el hilo principal | 🟡 (R2) |

**Resumen:** 74 puntos: 49 ✅ · 13 🟡 · 4 ❌ · 8 ➖.

## Orden de R4

Por uso diario en el móvil:
1. Deshacer / rehacer en el editor.
2. Abrir el aviso en su sitio (vencimiento → la fila) y deslizar para marcarlo leído.
3. Compartir el enlace de la página con el menú del sistema.
4. Modo oscuro a mano (Sistema / Claro / Oscuro).
5. Zoom con pellizco en las imágenes.
6. Compartir hacia la app: varias imágenes y archivos cualquiera.
7. Papelera de filas de una BD.
8. Reordenar favoritos.

Propuestas (grandes o dudosas, no se hacen a medias):
- Comentarios en línea en la app (leer y crear hilos del documento Yjs; necesita servidor).
- Seleccionar varios bloques (el editor es un campo por bloque).
- Invitar y permisos por página desde el móvil.
- «Disponible sin conexión» con descarga de subpáginas.
- Arrastrar páginas en el árbol del panel.
- Flechas de dependencias en el Cronograma.
- Compartir hacia una BD como fila nueva.

## Bitácora
- **R2 (18-oct)**. Leído todo el código buscando lo que cierra la app. Lo más gordo:
  - *Entrar con el proxy contestando HTML*: `canjear` leía y decodificaba fuera del `catch` y
    `MainActivity` solo captura `ErrorApi` → cierre al volver del SSO. Igual al subir archivos.
  - *Un enlace `notiono://pagina/a%2Fb`* (o una mención rota dentro de un documento): la ruta no
    casaba con ningún destino de la navegación → `IllegalArgumentException` y cierre.
  - *Un id repetido* en un documento o una BD: dos claves iguales en una `LazyColumn` cierran la
    app, y además cada vez que se abre esa página.
  - *Sin app de correo, cámara o navegador* (`ActivityNotFoundException`), y descargar en
    Android 8–9 (`SecurityException`: escribir en Descargas pide un permiso que no tenemos).
  - *Perder lo escrito*: el título volvía a lo guardado si la respuesta llegaba mientras se
    seguía escribiendo; girar el móvil con un envío en camino dejaba al editor nuevo sin lo
    último (y su siguiente envío lo deshacía).
  - *Destinos repetidos*: el flujo con `replay = 1` volvía a entregar el último destino al
    volver a entrar tras caducar la sesión (otra fila nueva desde el widget, la cámara…).
  - Pruebas rojas antes del arreglo comprobadas en una copia del código de la 2.0.3
    (`git worktree` en `~/Dobby/tmp`, ya borrada): 9 de 9 (la de la gráfica, dibujando la
    ventana a mano en un bitmap: `captureToImage` no funciona con este montaje de Robolectric).
- **Deshacer (R4.1)**. El editor guarda una «foto» del documento (JSON de bloques + cursor)
  antes de cada cambio: una por operación (`operacion {}` en `EstadoEditor`; lo de dentro no
  cuenta aparte) y una por racha de escritura en un bloque (se corta tras 1,5 s o al cambiar de
  bloque; el campo avisa en `beforeTextChanged`). Deshacer recarga la foto y la sincronía manda
  la diferencia como siempre (`Diff`). Si llega algo de otro dispositivo (`Sincro.adopta` con
  cambios), el historial se borra: volver a una foto entera desharía también lo suyo.

