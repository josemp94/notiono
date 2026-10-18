# Notiono — Planteamiento técnico maestro
### Clon de Notion self-hosted a medida para Jose · v2 (diseño multi-agente, Fable 5) · 2026-08-14

> Este documento es el resultado de un diseño por subsistemas: 12 expertos (Fable 5), cada uno
> profundizando en su área con crítica adversarial. Sustituye al planteamiento v1.

---

## Resumen ejecutivo

**Qué construimos.** Notiono: un Notion privado en el NAS de Jose —páginas por bloques + bases de datos con vistas (tabla/kanban/calendario) + **gráficas interactivas reales ligadas a los datos**—, gratis, y **operable por IA**: Dobby crea y actualiza datos por API (p. ej. mete el extracto bancario y las gráficas se refrescan solas).

**Stack, en una frase.** Monolito **Next.js 16 + TypeScript + tRPC + Prisma 6 + PostgreSQL + Redis**, editor **BlockNote**, gráficas **Apache ECharts**, Auth.js v5, desplegado en Docker sobre el DS923+ tras el reverse proxy de Synology + Cloudflare + Let's Encrypt.

**Por qué resuelve lo que las otras no.** AFFiNE/AppFlowy son bonitos pero **no tienen gráficas**; NocoDB las cobra; Grist las tiene pero se ve como Airtable y no es "operable por IA" a medida. Notiono junta las tres cosas que Jose quería y ninguna daba junta: **estética propia + gráficas de verdad + API para que Dobby lo mantenga**, todo gratis y en su casa.

**Filosofía de diseño (lo que mantiene el proyecto sano):**
- *API-first ("si Dobby no puede por API, no está terminado").*
- *Los datos mandan sobre el documento* (fiabilidad financiera primero).
- *Aburrido por dentro, bonito por fuera*: Postgres clásico, sin CRDT; la sofisticación se gasta en las gráficas y la marca.
- *Desarrollo por fases*, cada una desplegable y usable; anti-scope-creep estricto.

**Cómo se construye.** Por fases: **0** andamiaje (ya hecho, compila) → **1** editor+páginas → **2** bases de datos+vistas → **3** gráficas/dashboards → **4** multiusuario/familia → **5** pulido+branding+migración. Cada fase con criterios de aceptación y tests (Vitest + Playwright).

---

## Índice

**Parte I — Núcleo (secciones 1–12)** · **Parte II — Paridad Notion completa (secciones 13–24)**

1. Visión, alcance y principios
2. Arquitectura general y stack
3. Modelo de datos y almacenamiento
4. Editor de bloques (el corazón Notion)
5. Bases de datos y vistas
6. Gráficas y dashboards (el diferenciador)
7. Sincronización, guardado y colaboración
8. Autenticación, multiusuario y permisos
9. API y automatización (cómo lo mantiene Dobby)
10. Despliegue, DevOps y operación en el NAS
11. Migración de datos y branding
12. Roadmap por fases, testing, riesgos y decisiones abiertas
13. Colaboración en tiempo real
14. Comentarios, menciones y notificaciones
15. Compartición, permisos granulares y publicación web
16. Vistas avanzadas de base de datos
17. Propiedades avanzadas y motor de fórmulas
18. Plantillas
19. Bloques avanzados y maquetación
20. Búsqueda, quick find y command palette
21. Importación y exportación
22. Historial de versiones, papelera y navegación
23. API pública, integraciones y webhooks
24. PWA, offline y experiencia móvil

---
---

# Visión, alcance y principios

## 1. Visión

**Notiono es el sistema operativo personal de Jose: un Notion privado, gratis y operable por IA, donde las bases de datos se ven en gráficas de verdad.** No es un clon exhaustivo de Notion; es la intersección entre lo que Jose usa realmente (finanzas de autónomo, tareas, notas, plantillas) y lo que Notion hace mal o cobra caro: gráficas interactivas nativas, API sin fricción para que Dobby lea/escriba datos, y soberanía total del dato en el NAS.

**Frase guía:** *"Si Dobby no puede hacerlo por API, no está terminado. Si Jose no lo usa en 2 semanas, no se construye."*

## 2. Qué se clona de Notion (y qué NO)

Criterio de corte: **(a)** ¿lo usa Jose hoy o en 6 meses? **(b)** ¿su coste de mantenimiento cabe en un proyecto de una persona? **(c)** ¿es operable vía API? Si falla (a) o (b), fuera.

| Feature Notion | ¿Se clona? | Criterio |
|---|---|---|
| Páginas jerárquicas + editor de bloques | ✅ Sí (BlockNote) | Núcleo. Sin esto no hay producto |
| Bases de datos con propiedades tipadas | ✅ Sí | Núcleo de finanzas/tareas |
| Vistas: tabla, kanban, lista, calendario | ✅ Sí | Casos reales de Jose |
| Filtros, ordenación, agrupación guardados por vista | ✅ Sí | Imprescindible para "Gastos deducibles 2T" |
| Fórmulas | ⚠️ Parcial | Subset (~15 funciones: aritmética, fechas, if, concat). El 95% del uso real con el 10% del esfuerzo |
| Relations + Rollups | ⚠️ Parcial | Relations sí (factura→cliente); rollups solo sum/count/avg en v1.x |
| **Gráficas ligadas a BD** | ✅✅ Mejor que Notion | Diferenciador. ECharts interactivo, no el addon de pago de Notion |
| Plantillas de página y de fila | ✅ Sí | "Nueva factura", "Cierre mensual" |
| Adjuntos (facturas PDF/imagen) | ✅ Sí | Deducibles. Almacenamiento en el propio NAS, coste cero |
| API estilo Notion (CRUD páginas/BD/filas) | ✅✅ Mejor | Primer ciudadano, no añadido |
| Búsqueda global | ✅ Sí | Postgres FTS, suficiente mono-usuario |
| Comentarios y menciones | ❌ No (v1) | Mono-usuario; se revisa al entrar familia |
| Colaboración en tiempo real (CRDT/multi-cursor) | ❌ No | Coste técnico brutal, valor casi nulo con 1-4 usuarios que no coeditan a la vez. Lock optimista por página basta |
| Compartir público / web publishing | ❌ No | Riesgo de exposición del NAS sin beneficio |
| Wikis de equipo, permisos granulares por bloque | ❌ No | Permisos por espacio (Jose / Familia) cuando toque, nunca por bloque |
| IA integrada tipo Notion AI | ❌ No | Dobby YA es la IA; duplicarlo dentro es scope creep |
| Importador Notion, integraciones (Slack, GCal…) | ❌ No en v1 | Importador CSV sí; el resto lo puentea Dobby |
| Apps nativas móvil/desktop | ❌ No | PWA responsive. Punto |

## 3. Personas y escenarios

**P1 — Jose, autónomo (usuario principal, web).** Diseñador/dev freelance. Domingo por la tarde: abre "Finanzas 2026", registra 4 gastos con foto de factura desde el móvil, marca dos como deducibles, y mira la gráfica de barras ingresos vs. gastos del trimestre para estimar el modelo 130. *Escenario crítico:* trimestre fiscal — filtra deducibles del 2T, exporta CSV, adjuntos localizables en <10 s cada uno.

**P2 — Dobby, asistente IA (usuario principal, API).** Cada mañana lee la BD de tareas y prepara el resumen del día. Cuando Jose le dice por WhatsApp "apunta 42€ de gasolina, deducible", Dobby hace `POST /rows` con propiedades tipadas y recibe validación estricta (error claro si el tipo no cuadra, no un 500). Mensualmente genera la página "Cierre de julio" desde plantilla y rellena los agregados. *Necesita:* API key con scopes, idempotencia en escrituras, esquema de BD consultable (`GET /databases/:id/schema`) para no alucinar propiedades.

**P3 — Familia (futuro, 2-4 usuarios).** Maite y familia: lista de la compra compartida, calendario de eventos, gastos comunes. *Implicación hoy:* el modelo de datos lleva `workspace_id` y `owner_id` desde el día 1 aunque solo exista un workspace. No se construye nada más de multi-tenant todavía.

## 4. Backlog MoSCoW por fases

### MUST — Fase 1 "Núcleo" (v0.1–v0.4)
| # | User story | Aceptación |
|---|---|---|
| M1 | Como Jose, creo páginas anidadas con editor de bloques (texto, headings, listas, toggle, código, imagen) | Árbol lateral, drag&drop de bloques, autosave <1 s |
| M2 | Como Jose, creo BD con propiedades: texto, número, moneda, select, multiselect, fecha, checkbox, relación, archivo | Tipos validados en Prisma + tRPC |
| M3 | Como Jose, uso vistas tabla y kanban con filtros/orden/agrupación guardados | Cada vista persiste su config |
| M4 | Como Dobby, hago CRUD completo de páginas y filas vía REST con API key | Endpoints documentados (OpenAPI), errores 4xx tipados, rate limit |
| M5 | Como Jose, inicio sesión seguro (Auth.js, credenciales + passkey opcional) | Sin registro abierto; usuarios seed |
| M6 | Como Jose, adjunto facturas a filas y las abro desde la tabla | Ficheros en volumen del NAS, límite 20 MB |

### MUST — Fase 2 "Diferenciador" (v0.5–v0.8)
| # | User story | Aceptación |
|---|---|---|
| M7 | Como Jose, inserto un bloque gráfica ligado a una BD: barras, líneas, tarta, área, con agregación (sum/count/avg) por propiedad y periodo | ECharts, tooltip, click en serie → filtra la tabla |
| M8 | Como Jose, la gráfica se actualiza al cambiar datos (incl. cambios hechos por Dobby vía API) | Refresco ≤5 s (polling/invalidation Redis) |
| M9 | Como Jose, duplico plantillas ("Factura", "Cierre mensual") con un click y Dobby puede instanciarlas por API | Endpoint `POST /templates/:id/instantiate` |
| M10 | Como Jose, busco cualquier página/fila desde ⌘K | FTS <300 ms sobre 10k filas |

### SHOULD — Fase 3 "Pulido" (v0.9–v1.0)
- S1: Fórmulas subset y rollups sum/count/avg.
- S2: Vista calendario (fechas de facturas/tareas).
- S3: Importador/exportador CSV por BD.
- S4: Backup automatizado (pg_dump + adjuntos → Hyper Backup) con restore probado.
- S5: PWA instalable con captura de foto para facturas.
- S6: Papelera con retención 30 días y undo de borrado.

### COULD — post-v1 (solo si Jose lo pide con uso real)
- C1: Multi-workspace + invitación familia. C2: Vista galería. C3: Webhooks salientes (Dobby reacciona a cambios en vez de poll). C4: Modo oscuro. C5: Historial de versiones de página.

### WON'T (v1 y previsiblemente nunca)
- W1: Coedición en tiempo real. W2: Publicación pública. W3: IA embebida. W4: Apps nativas. W5: Permisos por bloque. W6: Marketplace de integraciones. W7: Sincronización offline completa.

## 5. Principios de producto y diseño

1. **API-first, "operable por IA":** toda acción de UI tiene equivalente API documentado. Errores legibles por máquina (código + mensaje + campo), esquemas consultables, escrituras idempotentes (header `Idempotency-Key`). Dobby es un usuario de primera clase, no un script.
2. **Los datos mandan sobre el documento:** las BD son la columna vertebral; las páginas las decoran. Ante conflicto de esfuerzo, gana la fiabilidad del dato financiero.
3. **Cero coste marginal:** nada que requiera SaaS de pago. Todo corre en el DS923+ dentro de ~3 GB de RAM presupuestada para Notiono.
4. **Aburrido por dentro, bonito por fuera:** Postgres relacional clásico, sin CRDT ni event-sourcing. La sofisticación se gasta en las gráficas y en la marca (#ff5c28, Bricolage/Hanken/Plex Mono, densidad tipo herramienta, no tipo landing).
5. **Pérdida de datos = bug P0:** autosave, papelera, backups verificados. Un gasto deducible perdido es dinero perdido.
6. **Convención sobre configuración:** pocas opciones, buenos defaults. Si una preferencia no la pediría Jose, no existe.
7. **Preparado para familia, no construido para familia:** decisiones de esquema sí (workspace_id), features multiusuario no.

## 6. Anti-scope-creep (reglas duras)

- Ninguna feature entra al backlog sin user story de Jose o de Dobby con caso de uso datado.
- Regla 2-de-3: cada release toca máximo 2 frentes de {editor, BD/gráficas, API}.
- "Paridad con Notion" **no** es argumento válido; "Jose lo necesitó esta semana" sí.
- Todo Could hiberna 30 días antes de implementarse; si nadie lo reclama, muere.
- Presupuesto de dependencias: añadir una librería nueva exige quitar o justificar frente a las existentes.

## 7. Criterios de éxito medibles y Definition of Done v1

**Éxito de producto (medir a 60 días de v1):**
- Jose registra ≥90% de sus movimientos financieros en Notiono (abandono real de la herramienta anterior).
- Dobby ejecuta ≥10 operaciones API/semana sin intervención manual y con <2% de errores 4xx/5xx.
- Cierre trimestral fiscal (deducibles + export) en <30 min, contra ~2 h actuales.
- Uso sostenido: ≥4 días/semana con al menos una escritura.

**DoD técnico de v1:**
- [ ] Todos los Must (M1–M10) y S1–S6 en producción en el NAS, tras reverse proxy + Cloudflare + TLS.
- [ ] p95 de carga de página <1,5 s y de mutación tRPC <400 ms en LAN; gráfica de 5k filas renderiza <1 s.
- [ ] OpenAPI publicada; Dobby completa sin ayuda el flujo "alta de gasto con adjunto + aparece en gráfica".
- [ ] Backup nocturno automático y **un restore completo ensayado con éxito** documentado.
- [ ] Cero endpoints sin auth; API keys con scopes read/write y rate limit activo.
- [ ] Lighthouse accesibilidad ≥90; usable en móvil (registro de gasto con foto en <60 s).
- [ ] Uptime ≥99% en 30 días medido desde fuera de la LAN.

**v1 está "done" cuando Jose puede borrar su cuenta de Notion sin perder nada que le importe — y no la echa de menos.**

---

# Arquitectura general y stack

## 1. Visión de conjunto

NOTIONO es un **monolito Next.js 16** desplegado como contenedor único en el DS923+, con Postgres y Redis reutilizados como servicios ya existentes en el NAS. No hay backend separado: el App Router sirve la UI (Server Components) y la API (tRPC sobre Route Handlers). Dobby (la IA) consume la misma API tRPC vía HTTP con una API key de servicio, sin ruta paralela: **un solo contrato de datos para humanos y agente**.

```mermaid
flowchart LR
  subgraph Cliente
    B[Navegador Jose<br/>React 19 + BlockNote + ECharts]
  end
  subgraph Internet
    CF[Cloudflare DNS/proxy<br/>+ Let's Encrypt]
  end
  subgraph NAS[Synology DS923+ / Docker]
    RP[Reverse Proxy Synology :443]
    subgraph APP[Contenedor notiono - 1.5GB limit]
      N[Next.js 16 standalone<br/>RSC + Route Handlers]
      T[tRPC routers]
      S[Capa servicios]
      P[Prisma 6 Client]
    end
    PG[(Postgres 16<br/>contenedor existente)]
    RD[(Redis<br/>contenedor existente)]
    FS[/Volumen NAS<br/>/volume1/notiono/uploads/]
  end
  D[Dobby<br/>OpenClaw en el NAS]

  B -->|HTTPS| CF --> RP --> N
  N --> T --> S --> P --> PG
  S -->|cache/colas/sesiones| RD
  N -->|/api/files| FS
  D -->|tRPC HTTP + API key| RP
  D -->|crons: digest, recordatorios| RP
```

**Flujo de escritura típico** (editar un bloque): navegador → mutación tRPC (`blocks.update`) con payload validado por zod → servicio `BlockService` aplica reglas (permisos, versión) → Prisma escribe en Postgres en transacción → invalidación de clave en Redis (`page:{id}`) → respuesta tipada al cliente, que ya hizo *optimistic update* vía TanStack Query. **Flujo de lectura**: RSC pide la página → servicio consulta Redis; si hay *miss*, Prisma → Postgres → se cachea con TTL 60s → HTML renderizado en servidor, hidratación mínima (solo el editor es cliente).

## 2. Estructura de carpetas

App única (no monorepo — un solo desplegable, un solo `package.json`; Turborepo sería sobreingeniería para un usuario):

```
notiono/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/                  # layout con sidebar
│   │   │   ├── p/[pageId]/page.tsx # página/documento
│   │   │   ├── db/[dbId]/page.tsx  # vistas de base de datos
│   │   │   └── search/page.tsx
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   └── files/[...path]/route.ts   # streaming de uploads
│   │   └── layout.tsx
│   ├── server/
│   │   ├── routers/               # pages.ts, blocks.ts, databases.ts,
│   │   │   └── _app.ts            # rows.ts, files.ts, search.ts, dobby.ts
│   │   ├── services/              # lógica de negocio pura
│   │   ├── repos/                 # acceso a datos (Prisma queries)
│   │   ├── trpc.ts                # initTRPC, procedures, middlewares
│   │   └── context.ts             # sesión + apiKey → ctx
│   ├── lib/
│   │   ├── db.ts                  # singleton PrismaClient
│   │   ├── redis.ts               # singleton ioredis
│   │   ├── cache.ts               # helpers get/set/invalidate
│   │   └── zod/                   # schemas compartidos cliente/servidor
│   ├── components/
│   │   ├── editor/                # BlockNote wrapper ("use client")
│   │   ├── database/              # tabla, kanban, calendario
│   │   └── charts/                # ECharts lazy-loaded
│   └── hooks/
├── Dockerfile                     # multi-stage → standalone
└── docker-compose.yml
```

## 3. Estrategia de capas

- **Server Components por defecto**: sidebar, listado de páginas, vistas de tabla en lectura. `"use client"` solo donde hay interactividad real: BlockNote, drag&drop, filtros de vistas, gráficos. Regla práctica: la frontera cliente empieza en el componente hoja, nunca en el layout.
- **Doble vía de lectura, una de escritura**: los RSC pueden llamar directamente a `services/` (server-side, sin HTTP, usando el *server caller* de tRPC), mientras que toda mutación pasa por tRPC. Así el primer render no paga round-trip y las escrituras quedan centralizadas.
- **Routers finos, servicios gordos**: un router tRPC solo hace `input(zodSchema) → service.method(ctx, input)`. La lógica (permisos, versionado de bloques, cascada al borrar) vive en `services/`; las queries Prisma en `repos/`. Esto permite que un cron de Dobby o un script de migración reutilicen servicios sin tocar HTTP.
- **Validación zod en el borde**: cada procedure define su schema en `lib/zod/` y se reutiliza en formularios cliente (`react-hook-form` + resolver). El contenido BlockNote se valida estructuralmente (schema recursivo de bloques con `z.lazy`) antes de persistir como JSONB — crítico porque Dobby genera bloques programáticamente y un JSON malformado rompería el editor.
- **Errores**: `TRPCError` con códigos semánticos (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT` para conflictos de versión). Un `errorFormatter` central adjunta `zodError` aplanado para pintar errores de campo. En cliente, `error.data.code` decide entre toast, redirect o revalidación. Los servicios lanzan errores de dominio propios (`PageNotFoundError`) que un middleware mapea a `TRPCError` — los servicios no conocen tRPC.

## 4. Rendimiento en el NAS (12GB compartidos)

- **`output: "standalone"`** en `next.config.ts`: imagen final ~150MB sobre `node:22-alpine`, sin `node_modules` completo. `NODE_OPTIONS=--max-old-space-size=1024` y límite Docker `mem_limit: 1536m` (margen para picos de Prisma). Presupuesto total NOTIONO: ~2GB incluyendo su cuota de Postgres/Redis compartidos.
- **Redis como amortiguador de Postgres**: cache de árbol de navegación (se recalcula caro, cambia poco), contenido de página (TTL 60s + invalidación explícita en mutación), resultados de vistas de BD con filtros (clave = hash del filtro), sesiones Auth.js y *rate limiting* de la API de Dobby (para que un cron desbocado no tumbe el NAS).
- **SSR vs CSR**: SSR para la primera carga (el DS923+ con Ryzen R1600 renderiza HTML sin problema y ahorra JS al cliente); a partir de ahí, navegación tipo SPA con prefetch de TanStack Query. **Sin ISR ni cache de página completa de Next**: contenido privado mono-usuario, el `revalidate` de Next aporta poco y complica invalidación — Redis manual es más predecible.
- **Ficheros en volumen del NAS**, no en Postgres: subida por Route Handler con streaming a `/volume1/notiono/uploads/{pageId}/`, metadatos en Postgres, servido con `sendfile` y cabeceras `Cache-Control` largas (nombres con hash). Evita inflar la BD y los backups de Postgres.
- ECharts y BlockNote con `next/dynamic` (ssr: false) para no cargarlos en rutas que no los usan; Prisma con `connection_limit=5` en la URL para no agotar conexiones del Postgres compartido.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa | Por qué se descartó |
|---|---|---|
| tRPC | REST + OpenAPI | Cliente y servidor en el mismo repo y mismo TS: tRPC da tipos extremo a extremo gratis. REST obligaría a mantener spec y codegen para un único consumidor externo (Dobby), que puede llamar tRPC por HTTP igualmente. |
| tRPC | GraphQL | Resolvers, schema SDL y servidor aparte para un solo usuario: coste sin beneficio. El problema N+1 que GraphQL introduce es especialmente peligroso en un NAS. |
| Monolito Next | Backend NestJS/Fastify separado | Dos contenedores, dos despliegues, duplicación de tipos y ~300-500MB extra de RAM. El único argumento (escalar API aparte) no aplica con un usuario. |
| App Router | Pages Router | RSC reduce el JS enviado (clave en un editor pesado como BlockNote), layouts anidados encajan con sidebar+página, y Pages es vía muerta en Next 16. |
| JSONB para bloques | Tabla relacional por bloque | Híbrido elegido: fila por bloque con `content` JSONB. Puramente relacional multiplicaría joins; un solo JSONB por página impediría referencias y búsqueda por bloque. |
| Postgres FTS (`tsvector`) | Meilisearch/Typesense | Un contenedor menos (~500MB RAM ahorrados); FTS con `websearch_to_tsquery` + índice GIN sobra para un corpus personal. |
| Ficheros en volumen | MinIO/S3 | MinIO añade otro servicio; el NAS *es* el almacenamiento. Se pierde presigned URLs, irrelevante en single-user. |

## 6. Riesgos técnicos y mitigaciones

1. **Presión de memoria en el NAS** (Next + Postgres + Redis + Dobby + otros servicios). *Mitigación*: `mem_limit` por contenedor, `max-old-space-size`, monitorización con alerta de Dobby si el contenedor supera 80%, y `restart: unless-stopped` como red de seguridad ante OOM-kill.
2. **Escrituras concurrentes Jose + Dobby sobre la misma página** (sin CRDT en v1). *Mitigación*: columna `version` con bloqueo optimista — la mutación incluye la versión esperada y devuelve `CONFLICT` si no coincide; los crons de Dobby escriben en páginas propias (digest, inbox) para minimizar colisión. CRDT (Yjs) queda como evolución, no como base.
3. **Prisma con JSONB profundo**: queries sobre contenido de bloques pueden degenerar. *Mitigación*: `repos/` puede usar `$queryRaw` tipado con índices GIN cuando Prisma no genere SQL razonable; la búsqueda nunca escanea JSONB, usa la columna `tsvector` materializada por trigger.
4. **Exposición a Internet de un servicio casero**: *Mitigación*: Cloudflare proxied con acceso restringido, Auth.js con sesión única + rate limit en Redis, API key de Dobby distinta de la sesión humana y con scopes (p.ej. sin `users.delete`), cabeceras de seguridad en el reverse proxy.
5. **Acoplamiento a BlockNote** (formato JSON propio en BD). *Mitigación*: los servicios normalizan a un formato de bloque propio y estable; BlockNote es detalle de presentación, y un export Markdown periódico (cron de Dobby) garantiza que los datos sobreviven al editor.

---

# Modelo de datos y almacenamiento

## Filosofía: híbrido documento-JSON + filas reales

NOTIONO separa dos mundos con requisitos opuestos:

- **Páginas (notas)**: contenido libre, jerárquico, editado como un todo por BlockNote. Se guarda como **un solo documento JSONB** (`Page.content`). No necesitamos consultar bloques individuales por SQL; el editor carga/guarda el doc completo. Un bloque-por-fila (estilo Notion real) multiplicaría escrituras, complicaría el orden y no aporta nada si nadie consulta bloques sueltos.
- **Bases de datos del usuario (Collections)**: aquí sí queremos `GROUP BY`, `SUM`, filtros por fecha/categoría para gráficas. Cada fila es un **Record real** en Postgres. Las celdas van en un JSONB `cells` (esquema flexible: el usuario añade campos sin `ALTER TABLE`), pero **materializamos con generated columns** las dos dimensiones que dominan la agregación financiera: fecha e importe.

**Trade-offs asumidos**: el JSONB de celdas pierde tipado a nivel de Postgres (lo compensamos validando en tRPC contra `Field.type` y con columnas generadas para lo crítico); a cambio ganamos esquema dinámico sin migraciones por workspace. La alternativa EAV (tabla `CellValue` con una fila por celda) da índices perfectos por campo pero triplica filas y complica lecturas; solo compensaría con >10⁶ registros por colección — fuera del caso de Jose. Regla práctica: **JSONB por defecto; columna materializada cuando un campo se usa en WHERE/GROUP BY de gráficas** (fecha, importe, y opcionalmente categoría).

## Esquema Prisma

```prisma
// schema.prisma — Prisma 6, PostgreSQL
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id String @id @default(cuid())
  email String @unique
  name String
  createdAt DateTime @default(now())
  sessions Session[]; members Member[]; tokens ApiToken[]
}
model Session {           // sesión web (cookie httpOnly)
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  @@index([userId])
}
model ApiToken {          // acceso de Dobby (IA) vía API
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  name String            // "dobby-prod"
  tokenHash String @unique // sha256; nunca en claro
  scopes String[]        // ["pages:write","records:write"]
  lastUsedAt DateTime?; revokedAt DateTime?
  @@index([userId])
}
model Workspace {
  id String @id @default(cuid())
  name String
  members Member[]; pages Page[]; collections Collection[]
}
model Member {
  id String @id @default(cuid())
  workspaceId String; userId String; role Role @default(EDITOR)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, userId])
}
enum Role { OWNER EDITOR VIEWER }
model Page {
  id String @id @default(cuid())
  workspaceId String
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  parentId String?             // árbol: null = raíz del workspace
  parent Page? @relation("PageTree", fields: [parentId], references: [id], onDelete: Cascade)
  children Page[] @relation("PageTree")
  title String @default("Sin título"); icon String?
  content Json @default("[]")   // doc BlockNote completo (JSONB)
  rank String                   // orden fraccional entre hermanos
  deletedAt DateTime?           // papelera (soft delete)
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  versions Version[]; collections Collection[]
  @@index([workspaceId, parentId, rank]) // listar hijos ordenados
  @@index([workspaceId, deletedAt])       // papelera
}
model Collection {        // "base de datos": Movimientos, Tareas…
  id String @id @default(cuid())
  workspaceId String
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  pageId String?
  page Page? @relation(fields: [pageId], references: [id], onDelete: SetNull)
  name String; deletedAt DateTime?
  fields Field[]; records Record[]; views View[]; charts Chart[]
  @@index([workspaceId])
}
model Field {             // definición de columna
  id String @id @default(cuid())
  collectionId String
  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  key String; name String; type FieldType
  options Json @default("{}")  // {choices:[{id,label,color}]} para SELECT
  rank String; required Boolean @default(false)
  @@unique([collectionId, key])
}
enum FieldType { TEXT NUMBER DATE CHECKBOX SELECT MULTI_SELECT URL FILE RELATION CURRENCY }
model Record {            // fila real
  id String @id @default(cuid())
  collectionId String
  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  cells Json @default("{}") // { "importe": -42.5, "fecha": "2026-06-03", "cat": "opt_x" }
  rank String; deletedAt DateTime?
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  // dateKey / amount: generated columns creadas por migración SQL (abajo)
  @@index([collectionId, rank])
  @@index([collectionId, deletedAt])
}
model View {
  id String @id @default(cuid())
  collectionId String
  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  name String; kind String   // "table" | "board" | "calendar"
  config Json @default("{}")  // filtros, sorts, agrupación, columnas
}
model Chart {
  id String @id @default(cuid())
  collectionId String
  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  name String; kind String    // "bar" | "line" | "pie"
  config Json                 // { x, y, agg, groupBy, bucket }
}
model Version {           // historial de páginas
  id String @id @default(cuid())
  pageId String
  page Page @relation(fields: [pageId], references: [id], onDelete: Cascade)
  content Json; title String; authorId String?  // null si lo escribió Dobby
  createdAt DateTime @default(now())
  @@index([pageId, createdAt(sort: Desc)])
}
```

`onDelete` en cascada baja de Workspace → todo; borrar una Collection arrastra Fields/Records/Views/Charts. La **papelera** es `deletedAt` en Page/Collection/Record: las queries filtran `deletedAt: null`; un cron purga (`DELETE` real) a los 30 días.

## Orden fraccional

Para reordenar sin renumerar hermanos, `rank` es una clave lexicográfica tipo *fractional indexing* (lib `fractional-indexing`): para insertar entre `a0` y `a1` se genera `a0V`; entre `a0` y `a0V`, `a0G`. Mover una página = **UPDATE de una sola fila** (su `rank`), y el índice `(workspaceId, parentId, rank)` devuelve los hijos ya ordenados con `ORDER BY rank`. Si tras miles de inserciones en el mismo hueco las claves crecen mucho, un job de rebalanceo reasigna ranks limpios — nunca es urgente.

## Celdas agregables: generated columns + GIN

Migración SQL manual (Prisma la respeta con `prisma migrate dev --create-only` y edición del `.sql`):

```sql
-- Columnas materializadas desde cells (STORED: indexables)
ALTER TABLE "Record"
  ADD COLUMN date_key date GENERATED ALWAYS AS
    ( NULLIF(cells->>'fecha','')::date ) STORED,
  ADD COLUMN amount numeric(14,2) GENERATED ALWAYS AS
    ( NULLIF(cells->>'importe','')::numeric ) STORED;

CREATE INDEX record_coll_date_idx ON "Record" ("collectionId", date_key)
  WHERE "deletedAt" IS NULL;
CREATE INDEX record_cells_gin ON "Record" USING gin (cells jsonb_path_ops);
```

Agregación **gasto por mes y categoría**:

```sql
SELECT date_trunc('month', r.date_key) AS mes,
       COALESCE(c.label, 'Sin categoría') AS categoria,
       SUM(-r.amount) AS gasto
FROM "Record" r
LEFT JOIN LATERAL (
  SELECT opt->>'label' AS label
  FROM "Field" f, jsonb_array_elements(f.options->'choices') opt
  WHERE f."collectionId" = r."collectionId" AND f.key = 'categoria'
    AND opt->>'id' = r.cells->>'categoria'
) c ON true
WHERE r."collectionId" = $1 AND r."deletedAt" IS NULL
  AND r.amount < 0 AND r.date_key >= date_trunc('year', now())
GROUP BY 1, 2 ORDER BY 1, 3 DESC;
```

Usa el índice parcial `(collectionId, date_key)`; el GIN cubre filtros ad-hoc tipo `cells @> '{"deducible": true}'`.

## Versionado, migraciones y seed

- **Versiones**: al guardar una Page se inserta un snapshot en `Version` con *debounce* (máx. 1 cada 5 min por página, y siempre antes de escrituras de Dobby). Retención: últimas 50 por página. Los Records no versionan snapshot completo; basta `updatedAt` + (futuro) auditoría de la API.
- **Migraciones**: `prisma migrate dev` en local, `prisma migrate deploy` en el contenedor al arrancar. Las generated columns e índices GIN viven en migraciones editadas a mano — nunca `db push`.
- **Seed** (`prisma/seed.ts`): usuario Jose, workspace "Casa", token de Dobby, y la colección **Movimientos** con fields `fecha:DATE`, `importe:CURRENCY`, `categoria:SELECT`, `factura:FILE`, más Tareas y Notas de ejemplo.

## Integridad y validación por Field.type

Postgres no valida el JSONB, así que la frontera es la capa tRPC: un validador Zod construido dinámicamente desde los `Field` de la colección — `NUMBER/CURRENCY → z.number().finite()`, `DATE → z.string().date()`, `CHECKBOX → z.boolean()`, `SELECT → z.enum(ids)`, `MULTI_SELECT → array de ids`, `RELATION →` cuid existente. Claves desconocidas se rechazan (`strict()`); `required` se exige en creación. Al **cambiar el tipo de un Field** se migra en transacción (cast fila a fila; lo incoercible pasa a `null` y se reporta). Al **borrar un Field**, `UPDATE ... SET cells = cells - 'key'` limpia huérfanas. Las generated columns añaden una segunda red: un `importe` no numérico falla el INSERT en Postgres, garantizando que las gráficas nunca ven basura.

---

# Editor de bloques (el corazón Notion)

## Por qué BlockNote

Necesitamos un editor **block-based**, con UX Notion "de serie", extensible con bloques propios, y con un **formato JSON estructurado** que una IA (Dobby) pueda generar sin abrir un navegador.

| Criterio | **BlockNote** | Tiptap | Lexical | BlockSuite | Plate |
|---|---|---|---|---|---|
| Base | ProseMirror | ProseMirror | Propia (Meta) | Propia (CRDT) | Slate |
| UX Notion out-of-the-box | **Sí, nativa** | No | No | Sí (acoplada a AFFiNE) | Parcial |
| Modelo de datos | **JSON de bloques anidados, estable** | JSON ProseMirror plano | JSON propio verboso | Yjs-first (binario) | JSON Slate |
| Bloques custom | `createReactBlockSpec` (declarativo) | Node + NodeView | Nodes custom | Complejo | Plugins Slate |
| Markdown import/export | **Built-in** | Vía extensiones | Manual | Parcial | Vía plugins |
| Generación server-side (`ServerBlockNoteEditor`) | **Sí, oficial** | Con esfuerzo | Posible | No | Posible |
| Colaboración futura | Yjs | Yjs | Yjs | Nativa | Yjs |

**Decisión: BlockNote.** Es el único que da la UX Notion completa gratis *y* un JSON que Dobby puede escribir con un system prompt corto. Riesgo (breaking changes) acotado **pineando versión** y aislando el editor tras un `<NotionoEditor>`.

## Catálogo de bloques por fase

**Fase 1 (built-in):** párrafo, H1–H3, viñetas, numerada, **to-do**, cita, código (Shiki), divisor, imagen, tabla básica.
**Fase 2 (custom):** **toggle**, **callout**, **bookmark/embed** (URL→tarjeta OG), **referencia a página** (`@`).
**Fase 3 (custom pesados):** **base de datos embebida** (`{databaseId, viewId}`), **gráfica embebida** (config de query + tipo). Regla: los bloques Fase 3 **no guardan datos dentro del documento**, solo referencias (IDs).

### Cómo se implementa un bloque custom (callout)

```tsx
const Callout = createReactBlockSpec(
  { type: "callout",
    propSchema: { emoji: { default: "💡" }, color: { default: "yellow", values: ["yellow","red","blue","gray"] } },
    content: "inline" },
  { render: ({ block, contentRef }) => (
      <div className={`callout callout-${block.props.color}`}>
        <span onClick={openEmojiPicker}>{block.props.emoji}</span>
        <div ref={contentRef} />
      </div> ) }
);
```

### Gráfica embebida (sin contenido editable)

```tsx
const ChartBlock = createReactBlockSpec(
  { type: "chart",
    propSchema: { databaseId:{default:""}, chartType:{default:"bar",values:["bar","line","pie"]},
      xProp:{default:""}, yProp:{default:""}, aggregation:{default:"count"} },
    content: "none" },
  { render: ({ block, editor }) => {
      const data = useDatabaseQuery(block.props.databaseId);
      if (!block.props.databaseId)
        return <ChartConfigPlaceholder onSave={(p) => editor.updateBlock(block, { props: p })} />;
      return <NotionoChart type={block.props.chartType} data={aggregate(data, block.props)} />;
    } }
);
const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: Callout, chart: ChartBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, pageLink: PageLinkInline },
});
```

La **referencia a página** es un `createReactInlineContentSpec` con prop `pageId`, chip con icono+título resuelto por SWR.

## UX: slash menu, drag&drop, atajos

- **Slash menu:** `SuggestionMenuController triggerCharacter="/"`, partiendo de `getDefaultReactSlashMenuItems` + items propios (callout, chart, database, "Pedir a Dobby…").
- **`@` menu:** segundo controller que busca páginas (`/api/search`) e inserta el inline `pageLink`.
- **Drag&drop y selección multi-bloque:** de serie. **Atajos** y markdown shortcuts (`# `, `- `, `[] `) incluidos.
- **Imágenes:** prop `uploadFile` → `POST /api/upload` (guarda en `/uploads` con nombre hasheado, valida MIME/tamaño). Cubre paste, drag-in y file picker.

## Serialización y API para Dobby

**Page.content = `Block[]` de BlockNote tal cual** (JSONB). No inventamos formato intermedio:

```json
[
  { "id":"a1","type":"heading","props":{"level":1},"content":[{"type":"text","text":"Plan Q3","styles":{}}],"children":[] },
  { "id":"a2","type":"callout","props":{"emoji":"⚠️","color":"red"},"content":[{"type":"text","text":"Fecha límite: 30/09","styles":{}}],"children":[] },
  { "id":"a3","type":"chart","props":{"databaseId":"db_7","chartType":"bar","xProp":"mes","yProp":"gasto"},"content":[],"children":[] }
]
```

- **Guardado:** `onChange` → debounce 800 ms → `PATCH /api/pages/:id { content }`. Optimista.
- **Markdown / server-side** (`@blocknote/server-util`):

```ts
import { ServerBlockNoteEditor } from "@blocknote/server-util";
const editor = ServerBlockNoteEditor.create({ schema }); // ¡mismo schema que el cliente!
const blocks = await editor.tryParseMarkdownToBlocks(dobbyMarkdown);
await prisma.page.create({ data: { title, content: blocks } });
// Export: const md = await editor.blocksToMarkdownLossy(page.content);
```

Estrategia Dobby en dos niveles: **(1)** contenido normal → escribe markdown y el servidor lo convierte (cero schema en el prompt); **(2)** bloques custom (callout, chart) → emite JSON de bloques según mini-contrato documentado, validado con Zod server-side. Ediciones parciales: `POST /api/pages/:id/blocks` (append/insertar) y `PATCH .../blocks/:blockId`, sobre el array JSON sin editor.

## Riesgos y rendimiento

- **Breaking changes de BlockNote:** versión pineada, editor encapsulado, tests de round-trip JSON↔markdown en CI antes de cada upgrade.
- **Sincronización de schemas cliente/servidor:** schema en paquete compartido (`/lib/editor-schema.ts`) importado por ambos.
- **JSON de Dobby inválido:** validación Zod + fallback (bloque desconocido → se conserva y se muestra "no soportado", nunca se descarta).
- **Documentos grandes (1.000+ bloques):** memoizar `render`, lazy-load con `IntersectionObserver` (no montar charts/databases fuera de viewport), cache SWR. La escapatoria estructural (como Notion) es **dividir en subpáginas**.
- **Colaborativo:** fuera de alcance ahora; guardar el JSON (no binario CRDT) deja la puerta abierta a Yjs sin hipotecar el formato.

---

# Bases de datos y vistas

## Modelo base

```prisma
model Collection { id String @id @default(cuid()); name String; icon String?; fields Field[]; records Record[]; views View[]; ownerId String; createdAt DateTime @default(now()) }
model Field  { id String @id @default(cuid()); collectionId String; name String; key String; type FieldType; config Json; order Int; @@unique([collectionId, key]) }
model Record { id String @id @default(cuid()); collectionId String; cells Json; naturalKey String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; @@unique([collectionId, naturalKey]) }
model View   { id String @id @default(cuid()); collectionId String; name String; type ViewType; config Json; order Int }
```

`Record.cells` es un JSONB plano `{ [fieldKey]: valor }`. El `key` del campo es un slug estable (`importe`, `fecha`) independiente del nombre visible: renombrar un campo no reescribe registros.

## Tipos de columna

Cada tipo define: `config` (esquema Zod), validación de escritura y normalización de la celda.

| Tipo | config | Celda almacenada |
|---|---|---|
| `text` | `{ multiline?: bool }` | `string` |
| `number` | `{ precision: 0-8, format?: "plain"\|"percent" }` | `number` |
| `currency` | `{ currency: "EUR", precision: 2 }` | `number` (unidades, no céntimos; Zod redondea a precision) |
| `select` | `{ options: [{ id, label, color }] }` | `string` (option.id, no el label) |
| `multiselect` | igual que select | `string[]` de option.ids |
| `date` | `{ includeTime: bool, timezone?: string }` | ISO-8601 `"2026-08-14"` o con hora — ordenable lexicográficamente, clave para SQL |
| `checkbox` | `{}` | `boolean` |
| `url` | `{}` | `string` validada con `z.string().url()` |
| `relation` | `{ targetCollectionId, many: bool }` | `string[]` de record ids destino |
| `rollup` | `{ relationFieldKey, targetFieldKey, agg: "sum"\|"count"\|"avg"\|"min"\|"max" }` | **no se almacena en cells**: se calcula (ver abajo) |
| `formula` | `{ expression: string, resultType: "number"\|"text"\|"bool" }` | valor **materializado** en `cells` + recálculo en escritura |

Ejemplo de campo select para movimientos:

```json
{
  "name": "Categoría", "key": "categoria", "type": "select",
  "config": { "options": [
    { "id": "opt_food", "label": "Comida", "color": "green" },
    { "id": "opt_taxes", "label": "Impuestos", "color": "red" }
  ]}
}
```

**Validación**: un `cellValidator(field)` devuelve el esquema Zod por tipo; el mutador tRPC `records.update` valida cada celda contra su campo antes de mergear con `jsonb` (`cells: { ...prev, ...patch }`). Los ids de select se verifican contra `config.options`. Valores desconocidos → error 400, nunca escritura silenciosa.

## Vistas y View.config

```json
{
  "type": "table",
  "config": {
    "filters": { "op": "and", "conditions": [
      { "field": "fecha", "cmp": "gte", "value": "2026-01-01" },
      { "field": "deducible", "cmp": "eq", "value": true }
    ]},
    "sorts": [{ "field": "fecha", "dir": "desc" }],
    "columns": [
      { "field": "concepto", "width": 280 },
      { "field": "importe", "width": 120 },
      { "field": "iva", "hidden": true }
    ],
    "groupBy": null
  }
}
```

- **Tabla**: edición inline celda a celda (mutación optimista con `patch` parcial), orden/anchos/ocultas viven en `config.columns`; drag de columnas reordena ese array.
- **Kanban**: `groupBy` apunta a un campo `select`; columnas = `config.options` del campo + columna "Sin valor". Drag entre columnas = `records.update` con el nuevo option.id. Orden dentro de columna: campo oculto `_rank` (fractional indexing tipo `"a0"`, `"a0V"`).
- **Calendario** (fase 2): `config.dateField`; **galería**: `config.coverField` + `config.cardFields`; **lista**: subconjunto de tabla.

## Motor de filtros/orden/agrupación

`View.config` se compila a SQL crudo sobre JSONB con `Prisma.$queryRaw` y **parámetros ligados siempre** (tagged template), nunca interpolación de valores. Las claves de campo se validan contra la lista real de `Field.key` de la colección antes de compilar — así ninguna clave arbitraria del cliente llega al SQL.

```sql
-- filtro: fecha >= X AND categoria = Y, orden fecha desc
SELECT id, cells FROM "Record"
WHERE "collectionId" = $1
  AND (cells->>'fecha') >= $2                       -- ISO ordena bien como texto
  AND (cells->>'categoria') = $3
ORDER BY (cells->>'fecha') DESC NULLS LAST
LIMIT 50 OFFSET 0;
```

Números se castean: `((cells->>'importe')::numeric) > $2` con guardia `cells->>'importe' ~ '^-?[0-9.]+$'` o directamente `(cells->'importe')::numeric` si se garantiza tipo en escritura (lo garantizamos con Zod, así que basta el cast del operador `->` que preserva el tipo JSON: `(cells->'importe')::numeric`). Multiselect: `cells->'tags' ? $2` (operador `?` de jsonb) o `@>` para "contiene todos": `cells->'tags' @> '["opt_a"]'::jsonb`.

Agrupación kanban en una query:

```sql
SELECT cells->>'estado' AS group_id,
       jsonb_agg(jsonb_build_object('id', id, 'cells', cells)
                 ORDER BY cells->>'_rank') AS records,
       count(*) AS total
FROM "Record"
WHERE "collectionId" = $1
GROUP BY 1;
```

**Rendimiento**: índice GIN general `CREATE INDEX record_cells_gin ON "Record" USING gin (cells jsonb_path_ops);` para `@>`, más índices de expresión bajo demanda para campos calientes de colecciones grandes: `CREATE INDEX idx_mov_fecha ON "Record" ((cells->>'fecha')) WHERE "collectionId" = 'col_x';`. Con <100k registros por colección esto sobra; paginación por cursor (`(fecha, id)`) en tabla infinita.

El compilador de filtros es una función pura `compileFilter(node, fieldMap): Prisma.Sql` recursiva sobre `and/or`, con whitelist de `cmp` por tipo (`date: gte/lte/eq`, `text: eq/contains` con `ILIKE` y escape de `%_`).

## Fórmulas y rollups (fase 2)

**Nunca `eval`/`Function`.** Evaluador propio en tres pasos: tokenizer → parser Pratt → intérprete de AST. Gramática mínima:

```
expr    := or
or      := and ("or" and)*
and     := cmp ("and" cmp)*
cmp     := add (("=" | "!=" | ">" | "<" | ">=" | "<=") add)?
add     := mul (("+" | "-") mul)*
mul     := unary (("*" | "/") unary)*
unary   := "-" unary | primary
primary := NUMBER | STRING | field ref {campo} | fn "(" args ")" | "(" expr ")"
fn      := if | round | abs | concat | year | month | days_between | empty
```

Ejemplo (deducibles): `{importe} * {porcentaje_deduccion} / 100`. Acotado: máx. 50 nodos AST, profundidad 10, sin bucles ni asignación, tipado del resultado verificado contra `resultType` al guardar el campo. Las referencias `{campo}` se resuelven contra `fieldMap`; referencia a campo inexistente = error de compilación al guardar, no en runtime.

**Recalculo**: al escribir un registro se recalculan sus fórmulas en el mismo `records.update` (grafo de dependencias por colección, orden topológico, ciclos rechazados al definir el campo). Rollups: al escribir en la colección origen, un job (o recálculo síncrono si <100 relacionados) actualiza la celda materializada de los registros que apuntan vía la relación inversa. Materializar hace que filtros/orden sobre fórmulas y rollups usen el mismo motor SQL sin casos especiales.

## Relaciones (fase 2)

Celda `string[]` de ids + tabla puente para integridad y consultas inversas:

```prisma
model RecordLink { fromRecordId String; toRecordId String; fieldId String; @@id([fromRecordId, fieldId, toRecordId]); @@index([toRecordId, fieldId]) }
```

La celda es la fuente para render rápido; `RecordLink` da el índice inverso (necesario para rollups y para limpiar referencias al borrar un registro, en la misma transacción).

## API para Dobby: upsert idempotente

```ts
// tRPC: dobby.upsertRecord
input: z.object({
  collection: z.string(),          // key o id
  naturalKey: z.string(),          // p.ej. "mov:2026-08-12:amazon:-34.99" o id bancario
  cells: z.record(z.unknown()),    // por fieldKey; se valida por tipo
})
```

Implementación: `prisma.record.upsert({ where: { collectionId_naturalKey }, update: { cells: merged }, create: {...} })` apoyado en el `@@unique([collectionId, naturalKey])`. Reenviar el mismo movimiento bancario no duplica. `dobby.ensureCollection` acepta un esquema declarativo `{ name, fields: [{ key, type, config }] }` y hace diff contra los campos existentes (crea los que faltan, nunca borra ni cambia tipo sin flag explícito). Para selects, `dobby.upsertRecord` acepta labels y auto-crea la opción si `config.allowAutoCreate: true` — clave para que el agente categorice sin fricción.

## MVP vs después

**MVP**: text, number, currency, select, multiselect, date, checkbox, url; vistas tabla + kanban; filtros/sorts/groupBy compilados a SQL; edición inline; upsert idempotente de Dobby y `ensureCollection`; índice GIN. Cubre movimientos, kanban de tareas y deducibles (el % deducible puede ser un number editado a mano hasta que lleguen fórmulas).

**Fase 2**: formula + rollup + relation (van juntos: rollup depende de relation), calendario/galería/lista, índices de expresión automáticos por uso, vistas compartidas/permisos, historial de celda.

---

# Gráficas y dashboards

Este es el diferenciador de NOTIONO: las gráficas no son imágenes ni embeds, son visualizaciones vivas conectadas a las Collections del usuario. Cambias una celda, cambia la gráfica. El caso de referencia es el dashboard de finanzas de Jose: importa su extracto bancario (o Dobby lo hace por él) y al instante ve ingresos vs gastos por mes, top categorías, balance acumulado y KPIs.

## Por qué ECharts

| Criterio | ECharts | Recharts | Chart.js | Visx | Nivo |
|---|---|---|---|---|---|
| Tipos de gráfica | Enorme (combo, sunburst, heatmap, gauge) | Básicos | Medios | Los que construyas | Amplios |
| Interactividad nativa | dataZoom, brush, toolbox, drill por eventos | Limitada | Media (plugins) | Manual | Media |
| Rendimiento con muchos puntos | Canvas + renderizado incremental, decenas de miles de puntos | SVG, sufre >2k puntos | Canvas, bien | Depende de ti | SVG/Canvas mixto |
| Theming declarativo | JSON `option` completo | Props React | Config JS | Código | Props |
| SSR / export imagen | Sí (server-side rendering a SVG/PNG) | No | Parcial | No | Parcial |
| Peso | ~350KB (tree-shakeable a ~150KB) | ~100KB | ~70KB | Variable | ~300KB |
| Licencia / self-host | Apache 2.0, cero llamadas externas | MIT | MIT | MIT | MIT |

**Decisión: ECharts.** Tres razones de peso para NOTIONO:

1. **El `option` de ECharts es JSON declarativo puro**, igual que nuestro `spec`. La traducción spec→gráfica es una función pura sin JSX intermedio, lo que permite que el servidor (y Dobby vía API) generen gráficas sin tocar React.
2. **Interactividad de serie**: `dataZoom` para rangos de fechas, eventos `click` por serie/dato para drill-down, tooltips con formatters — todo lo que un dashboard financiero necesita sin plugins.
3. **Rendimiento y self-host**: canvas rendering aguanta años de movimientos bancarios, y no hay dependencias de CDN ni telemetría — coherente con la filosofía self-hosted de NOTIONO.

Recharts se descartó por rendimiento SVG y pobreza de tipos; Visx por coste de desarrollo (es un toolkit, no una librería de gráficas); Nivo por peso sin ventaja clara; Chart.js quedó segundo pero su interactividad avanzada requiere plugins de terceros.

## El `spec` de un Chart

Cada Chart es una fila en Postgres con un `spec` JSONB validado con Zod. Anatomía:

```json
{
  "version": 1,
  "source": {
    "collectionId": "col_movimientos",
    "viewId": null,
    "filters": [
      { "field": "fld_fecha", "op": "gte", "value": "{{dashboard.dateFrom}}" },
      { "field": "fld_fecha", "op": "lte", "value": "{{dashboard.dateTo}}" }
    ]
  },
  "dimension": { "field": "fld_fecha", "dateBucket": "month" },
  "breakdown": { "field": "fld_tipo" },
  "measures": [
    { "field": "fld_importe", "agg": "sum", "label": "Importe" }
  ],
  "chart": { "type": "bar", "stacked": false },
  "style": {
    "palette": ["#ff5c28", "#2d9d78", "#4a5568", "#e2b93b"],
    "numberFormat": { "style": "currency", "currency": "EUR", "compact": true },
    "legend": true
  }
}
```

- **`source`**: Collection o View (una View aporta sus filtros ya definidos; los `filters` del spec se añaden con AND). Los valores `{{dashboard.*}}` se resuelven contra el filtro global del dashboard.
- **`dimension`**: el group-by. Si el campo es fecha, `dateBucket` acepta `day | week | month | quarter | year` (se traduce a `date_trunc` en SQL). `breakdown` es una segunda dimensión que genera series (p. ej. tipo ingreso/gasto).
- **`measures`**: campo + agregación `sum | avg | count | min | max`. `count` admite `field: null` (cuenta registros). Un KPI o un combo pueden llevar varias measures.
- **`chart.type`**: `bar | stackedBar | line | area | pie | donut | kpi | combo`. En `combo`, cada measure declara su `seriesType` y eje (`yAxisIndex`).
- **`style`**: paleta (el naranja de marca `#ff5c28` primero), formato numérico (€ con separador de miles vía `Intl.NumberFormat("es-ES")`, `compact` para "12,4 mil €"), leyenda, etc.

## Cálculo en servidor: SQL sobre `Record.cells`

Las gráficas **nunca** se calculan en el cliente trayendo todos los registros. El procedure tRPC `chart.data` compila el spec a una query de agregación sobre el JSONB `cells` de la tabla `Record`.

**Ingresos vs gastos por mes** (dimension=fecha/month, breakdown=tipo, measure=sum importe):

```sql
SELECT
  date_trunc('month', (r.cells->>'fld_fecha')::date) AS bucket,
  r.cells->'fld_tipo'->>'value'                      AS serie,
  SUM((r.cells->>'fld_importe')::numeric)            AS valor
FROM "Record" r
WHERE r."collectionId" = 'col_movimientos'
  AND r."deletedAt" IS NULL
  AND (r.cells->>'fld_fecha')::date >= $1   -- dashboard.dateFrom
  AND (r.cells->>'fld_fecha')::date <= $2   -- dashboard.dateTo
GROUP BY 1, 2
ORDER BY 1;
```

**Top categorías de gasto** (dimension=categoría, filtro tipo=Gasto, sum importe en valor absoluto, limit 8):

```sql
SELECT
  r.cells->'fld_categoria'->>'value'            AS categoria,
  SUM(ABS((r.cells->>'fld_importe')::numeric))  AS total
FROM "Record" r
WHERE r."collectionId" = 'col_movimientos'
  AND r."deletedAt" IS NULL
  AND r.cells->'fld_tipo'->>'value' = 'Gasto'
  AND (r.cells->>'fld_fecha')::date BETWEEN $1 AND $2
GROUP BY 1
ORDER BY total DESC
LIMIT 8;
```

Para el **balance acumulado** se agrega por mes y se aplica una window function: `SUM(SUM(importe)) OVER (ORDER BY bucket)`.

**Caché en Redis.** El resultado se guarda con clave derivada del contenido:

```
chart:{chartId}:{sha256(spec + filtrosResueltos)}   TTL 300s
```

La **invalidación** es por colección, no por chart: toda mutación de registros (`record.create/update/delete`, importación CSV, API) hace `INCR collection:{id}:version`, y esa versión forma parte de la clave de caché. Así no hay que rastrear qué charts dependen de qué: al cambiar los datos, la clave antigua simplemente deja de usarse y expira sola. Coste: una lectura extra a Redis por render; beneficio: consistencia inmediata tras insertar el extracto.

## Interactividad y drill-down

- **Tooltips**: `tooltip.formatter` con `Intl.NumberFormat` → "Marzo 2026 · Gastos: −1.842,50 €".
- **Zoom**: `dataZoom` (slider + rueda) en series temporales largas.
- **Filtrar por click**: click en un sector del donut de categorías emite `chart:filter` al contexto del dashboard; las demás gráficas re-consultan con ese filtro añadido.
- **Drill-down**: el evento `click` de ECharts devuelve el datapoint; NOTIONO reconstruye los filtros que lo definen (bucket + breakdown + filtros activos) y abre un panel lateral con la tabla de registros subyacentes — literalmente la Collection filtrada:

```ts
chartInstance.on("click", (p) => {
  openDrillDown({
    collectionId: spec.source.collectionId,
    filters: [
      ...resolvedFilters,
      { field: "fld_fecha", op: "inBucket", value: p.name },      // "2026-03"
      { field: "fld_tipo", op: "eq", value: p.seriesName },        // "Gasto"
    ],
  });
});
```

De la barra de "Gastos marzo" a los 47 movimientos que la componen, en un click, con edición inline incluida.

**Dashboards**: un Dashboard es una página con bloques Chart en grid (col-span configurable) más un **filtro global de fechas** (presets: este mes, últimos 6 meses, año, personalizado) que se inyecta en los `{{dashboard.dateFrom/dateTo}}` de todos los specs. Los KPIs son charts con `type: "kpi"`: renderizan el número grande, delta vs periodo anterior (misma query con rango desplazado) y color semántico.

## Dobby refresca el dashboard

Cuando Dobby procesa el extracto mensual de Jose, hace dos llamadas REST:

```
POST /api/v1/collections/col_movimientos/records:batchCreate
  → inserta N movimientos → dispara INCR collection:col_movimientos:version

POST /api/v1/dashboards/dash_finanzas/refresh
  → recalcula en caliente los charts (warm cache) y devuelve el resumen
```

La segunda llamada es opcional (la invalidación por versión ya garantiza datos frescos al abrir), pero pre-calienta la caché y devuelve los KPIs en JSON, que Dobby usa para el mensaje de WhatsApp: "Extracto importado. Julio: +2.310 € ingresos, −1.980 € gastos, balance +330 €. Ojo: Restaurantes +41% vs junio."

## Dashboard de finanzas de Jose: specs concretos

Cuatro bloques sobre `col_movimientos` (fecha, concepto, importe, tipo, categoría):

**1. KPI Balance del periodo** (col-span 4):
```json
{ "source": { "collectionId": "col_movimientos" },
  "measures": [{ "field": "fld_importe", "agg": "sum", "label": "Balance" }],
  "chart": { "type": "kpi", "compare": "previousPeriod" },
  "style": { "numberFormat": { "style": "currency", "currency": "EUR" },
             "positiveColor": "#2d9d78", "negativeColor": "#ff5c28" } }
```

**2. Ingresos vs gastos por mes** (barras agrupadas, col-span 8): el spec de la sección anterior, con `breakdown` por `fld_tipo` y paleta `["#2d9d78", "#ff5c28"]`.

**3. Top categorías de gasto** (donut, col-span 6):
```json
{ "source": { "collectionId": "col_movimientos",
    "filters": [{ "field": "fld_tipo", "op": "eq", "value": "Gasto" }] },
  "dimension": { "field": "fld_categoria" },
  "measures": [{ "field": "fld_importe", "agg": "sum", "abs": true }],
  "chart": { "type": "donut", "limit": 8, "otherBucket": true },
  "style": { "palette": ["#ff5c28", "#e2b93b", "#4a5568", "#2d9d78", "#9f7aea",
             "#38b2ac", "#ed64a6", "#a0aec0"] } }
```

**4. Balance acumulado** (área, col-span 6): `dimension` mes, measure sum con `"cumulative": true`, `chart.type: "area"`, relleno degradado de `#ff5c28` al 15% de opacidad.

El resultado: Jose abre NOTIONO, elige "Últimos 6 meses" y ve su vida financiera completa — y cualquier número sospechoso está a un click de los movimientos que lo explican.

---

# Sincronización, guardado y colaboración

## Filosofía general

Notiono empieza con un usuario (Jose) en varios dispositivos y crecerá a familia con edición concurrente **ocasional**. Eso permite una estrategia por fases donde cada fase resuelve un problema real y ninguna añade infraestructura antes de necesitarla:

| Fase | Problema real | Solución | Coste |
|---|---|---|---|
| MVP | "No quiero pulsar guardar y no quiero perder texto" | Autosave con debounce + versionado optimista | Bajo |
| Familia | "Quiero ver los cambios de otros sin refrescar" | WebSocket + Redis pub/sub para invalidación | Medio |
| LATER | "Dos personas escriben en el mismo párrafo a la vez" | Yjs + Hocuspocus (CRDT) | Alto — diferir |

## Fase 1 (MVP): autosave con versionado optimista

### Qué se envía: doc completo, no deltas

BlockNote serializa la página como un JSON de bloques. En MVP **se envía el documento completo** en cada guardado. Razones:

- Un doc de notas familiar rara vez supera 100–300 KB; comprimido con gzip (automático en HTTP) queda en decenas de KB.
- Los deltas exigen que cliente y servidor compartan una base exacta contra la que aplicar el parche — eso es, en la práctica, reinventar mal un CRDT.
- El doc completo hace el servidor **idempotente y sin estado**: `UPDATE ... SET content = $json` y listo.

### Cadencia y trigger

```ts
// hooks/useAutosave.ts (esquema)
const save = useDebouncedCallback(flush, 1200);      // 1–1.5s tras dejar de teclear
useInterval(() => dirty && flush(), 15_000);          // red de seguridad periódica
useBeforeUnload(() => dirty && flushSync());          // salir de la página
useVisibilityChange(hidden => hidden && flush());     // cambiar de pestaña/app (móvil)
```

Debounce de ~1,2 s tras la última tecla, con flush forzado cada 15 s si el usuario no para de escribir, y flush en `visibilitychange`/`beforeunload`. Nunca se guarda en cada keystroke.

### Versionado y detección de conflicto

Cada página lleva un entero `version` (optimistic concurrency control clásico):

```
pages: id, content jsonb, version int, updated_at, updated_by
page_snapshots: page_id, version, content jsonb, created_at  -- historial
```

El mutation de guardado hace compare-and-swap:

```ts
// tRPC pages.save
input: { pageId, content, baseVersion }

const res = await db.execute(sql`
  UPDATE pages SET content = ${content}, version = version + 1,
         updated_at = now(), updated_by = ${userId}
  WHERE id = ${pageId} AND version = ${baseVersion}
  RETURNING version`);

if (res.rowCount === 0) {
  const current = await getPage(pageId);
  throw new TRPCError({ code: 'CONFLICT', cause: current }); // devuelve doc+versión del server
}
```

**Resolución de "el server tiene versión más nueva"** — pragmática, sin merges de JSON:

1. **Mismo usuario, otro dispositivo (caso dominante del MVP):** el cliente guarda su copia local como snapshot ("versión recuperada de este dispositivo"), carga la del servidor y muestra un banner: *"Esta página se actualizó en otro dispositivo — [Ver mi versión]"*. Nunca se pisa nada silenciosamente; nunca se intenta fusionar JSON de bloques (frágil y peligroso).
2. **Prevención antes que curación:** al ganar foco la pestaña (`focus`/`visibilitychange`), el cliente hace un `pages.head` barato (`{version}`) y recarga si está atrasado. Esto elimina el 90% de conflictos multi-dispositivo: casi siempre son "editaste en el móvil, abriste el portátil viejo".

### UI optimista + indicador de guardado

```
estado: 'saved' | 'saving' | 'offline-pending' | 'conflict'
```

El usuario escribe contra el estado local siempre (el editor **es** la fuente de verdad mientras edita); el indicador ("Guardado ✓ / Guardando… / Sin conexión — se guardará al reconectar") es un detalle pequeño pero es lo que da confianza para no tener botón de guardar.

### Offline básico: cola de un elemento por página

No hace falta una cola de operaciones. Basta con persistir en `localStorage`/IndexedDB el último doc no confirmado:

```ts
{ [pageId]: { content, baseVersion, savedAt } }
```

Al fallar el fetch → estado `offline-pending`, reintento con backoff al recuperar `online`. Al reabrir la app, si hay pendientes, se reintenta el CAS; si da CONFLICT, se aplica el flujo del banner. Como cada entrada es "el último estado completo", la cola no crece ni se corrompe.

## Fase 2 (familia): realtime para listas y tableros — no para el doc

Aquí el objetivo es **presencia y frescura**, no co-edición: si Maite mueve una tarjeta del tablero o añade un ítem a la lista de la compra, Jose lo ve en segundos.

### Arquitectura

```
Cliente A ──ws──► Servidor WS (Node, ws/socket.io)
Cliente B ──ws──► Servidor WS (otra instancia)
                     ▲              ▲
                     └── Redis pub/sub ──┘   canal: notiono:events
Mutations tRPC ──► publish tras commit en Postgres
```

Redis pub/sub existe solo para cruzar instancias (Next en varios pods o WS separado del server HTTP). Con una sola instancia funciona igual y no estorba.

### Eventos: notificar, no transportar datos

Los eventos son **señales de invalidación**, no llevan payload de negocio. Los datos siempre se re-leen por tRPC (una sola fuente de verdad, cero problemas de orden/duplicados):

```ts
type RealtimeEvent =
  | { t: 'page.updated';  pageId: string; version: number; by: string }
  | { t: 'list.changed';  listId: string }
  | { t: 'board.changed'; boardId: string }
  | { t: 'presence';      pageId: string; users: {id, name}[] };
```

En el cliente, el handler mapea evento → invalidación de React Query:

```ts
ws.on(ev => {
  switch (ev.t) {
    case 'list.changed':  utils.lists.byId.invalidate({ id: ev.listId }); break;
    case 'board.changed': utils.boards.byId.invalidate({ id: ev.boardId }); break;
    case 'page.updated':
      if (ev.by !== me.id && ev.version > localVersion) showRefreshBanner();
  }
});
```

Nótese `page.updated`: para el doc abierto **no** se pisa el editor; se ofrece recargar (o se recarga solo si el usuario no tiene cambios locales). La co-edición real es Fase 3.

Presencia ("Maite está viendo esta página"): clave efímera en Redis `presence:{pageId}` con TTL 30 s renovado por heartbeat del WS. Barato y se autolimpia.

### Suscripciones

El cliente se suscribe por sala (`family:{familyId}` para listas/tableros, `page:{pageId}` para presencia). El servidor valida pertenencia con la misma sesión de auth que tRPC.

## Multi-dispositivo, reconexión y consistencia

- **Reconexión WS:** backoff exponencial con jitter (1s → 30s máx). Al reconectar, el cliente **no confía en haber recibido todo**: invalida las queries visibles y hace `pages.head` de la página abierta. Regla de oro: el WS acelera la frescura, pero la corrección nunca depende de él — con el WS caído, la app degrada a "como el MVP" (refetch on focus de React Query, `staleTime` corto en listas).
- **Orden/duplicados:** irrelevantes por diseño — los eventos solo invalidan; refetches redundantes se deduplican solos en React Query.
- **Consistencia:** Postgres es la única verdad; `version` monotónica por página da un total order trivial sin relojes vectoriales.

## Fase 3 (LATER): CRDT con Yjs/Hocuspocus — solo si duele

**Cuándo:** cuando de verdad dos personas editan *el mismo doc a la vez* con frecuencia y el banner de conflicto se vuelve molesto (medible: nº de CONFLICTs entre usuarios distintos por semana). En una familia, la concurrencia real suele ser sobre **listas** (ítem-a-ítem, ya resuelto en Fase 2 porque cada ítem es una fila y las mutaciones son granulares), no sobre prosa.

**Por qué diferirlo — el coste real:**

- **Doble modelo de datos:** el doc pasa de "JSON en Postgres" a "estado binario Yjs" que hay que persistir (updates append-only + compactación), snapshotear a JSON para búsqueda/export, y migrar en ambos sentidos.
- **Servidor stateful nuevo:** Hocuspocus mantiene docs en memoria, necesita sticky sessions o un solo nodo, hooks de auth propios, y su propia historia de backups.
- **Historial/versiones se complica:** los snapshots por versión que ya tienes dejan de ser triviales.
- **Debugging duro:** estados corruptos de CRDT son mucho peores que un CONFLICT explícito.

**Cómo mantener la puerta abierta hoy, gratis:** BlockNote ya soporta Yjs de fábrica (colaboración vía `provider`), así que la migración futura no toca la UI del editor; y el guardado como "doc JSON completo + versión" es exactamente el snapshot que Hocuspocus necesitaría como semilla. No hay que preparar nada más.

---

# Autenticación, multiusuario y permisos

## 1. Autenticación con Auth.js v5 (Credentials)

### Estrategia de sesión: JWT firmado, no sesiones en BD

Con Credentials provider, Auth.js v5 **no soporta sesiones de base de datos** (el adapter no crea registro de sesión con ese provider), así que la decisión práctica es **JWT en cookie**. Justificación adicional: NOTIONO corre en un solo servidor doméstico, no necesitas revocación instantánea multi-nodo, y evitas un round-trip a Postgres por request. Mitiga el punto débil del JWT (no revocable) así: TTL corto (`maxAge: 7d`, `updateAge: 24h`) y un campo `sessionVersion` en `User` — al cambiar contraseña o "cerrar sesión en todos los dispositivos" incrementas la versión y el callback `jwt` invalida tokens viejos:

```ts
// auth.ts
export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600 },
  providers: [Credentials({
    async authorize(creds) {
      const parsed = zLogin.safeParse(creds);
      if (!parsed.success) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      // verificación en tiempo ~constante: hash dummy si no existe el usuario
      const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, parsed.data.password);
      return ok && user ? { id: user.id, email: user.email, sv: user.sessionVersion } : null;
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.uid = user.id; token.sv = user.sv; }
      else {
        const db = await prisma.user.findUnique({ where: { id: token.uid }, select: { sessionVersion: true } });
        if (!db || db.sessionVersion !== token.sv) return null; // revoca
      }
      return token;
    },
    session({ session, token }) { session.user.id = token.uid; return session; },
  },
  cookies: { sessionToken: { options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" } } },
});
```

### Hash de contraseñas

**Argon2id** (`@node-rs/argon2`): `memoryCost: 19456 KiB, timeCost: 2, parallelism: 1` (recomendación OWASP). bcrypt es aceptable como fallback (cost 12) pero Argon2id resiste mejor GPU/ASIC. Nunca loguees el body del login.

### CSRF y cookies

Auth.js gestiona el token CSRF (double-submit cookie) en sus endpoints. Con `secure: true` la cookie sale como `__Secure-authjs.session-token`. `SameSite=Lax` cubre el CSRF clásico de formularios cross-site; para tus mutaciones tRPC, exige `Content-Type: application/json` y verifica cabecera `Origin` contra tu dominio en el handler (defensa extra barata).

### Rate-limit de login (Redis)

Doble contador: por IP (10 intentos / 15 min) y por email (5 / 15 min, protege contra ataques distribuidos a una cuenta). Backoff exponencial en vez de bloqueo duro para no permitir DoS de cuentas:

```ts
async function checkLoginRate(ip: string, email: string) {
  const [ipN, emN] = await Promise.all([
    redis.incr(`rl:ip:${ip}`), redis.incr(`rl:em:${sha256(email)}`),
  ]);
  if (ipN === 1) await redis.expire(`rl:ip:${ip}`, 900);
  if (emN === 1) await redis.expire(`rl:em:${sha256(email)}`, 900);
  if (ipN > 10 || emN > 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
}
```

### Recuperación de contraseña

Token aleatorio de 32 bytes, **guardado hasheado (SHA-256)** en tabla `PasswordResetToken { tokenHash, userId, expiresAt }`, TTL 30 min, un solo uso. Respuesta idéntica exista o no el email. Al consumirlo: nueva contraseña + `sessionVersion++` (cierra todas las sesiones). Envío por SMTP (Resend o similar).

### OIDC futuro

Deja el esquema Prisma con las tablas estándar de Auth.js (`Account`, etc.) desde el día 1. Añadir Google/Authentik después es solo sumar un provider y vincular por email verificado (con confirmación explícita, nunca auto-link silencioso).

## 2. Modelo de permisos

### Esquema

```prisma
model Membership {
  userId      String
  workspaceId String
  role        Role     // OWNER | EDITOR | VIEWER
  @@id([userId, workspaceId])
}
model PageShare {   // fase familia: compartir página suelta
  pageId  String
  userId  String
  access  Access   // VIEW | EDIT
  @@id([pageId, userId])
}
```

Jerarquía: `OWNER > EDITOR > VIEWER`. Regla de resolución para una página: máximo entre (rol en el workspace de la página) y (share directo sobre la página o un ancestro — los shares heredan hacia abajo, estilo Notion).

### Guards en tRPC

Todo cuelga de `protectedProcedure`; la autorización se hace **siempre en servidor, por recurso, nunca confiando en IDs del cliente**:

```ts
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, userId: ctx.session.user.id } });
});

// Guard de workspace parametrizado por rol mínimo
const workspaceProcedure = (minRole: Role) =>
  protectedProcedure.input(z.object({ workspaceId: z.string().cuid() }))
    .use(async ({ ctx, input, next }) => {
      const m = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: ctx.userId, workspaceId: input.workspaceId } },
      });
      if (!m || rank(m.role) < rank(minRole)) throw new TRPCError({ code: "FORBIDDEN" });
      return next({ ctx: { ...ctx, role: m.role } });
    });

// Guard por página (workspace o share)
async function assertPageAccess(userId: string, pageId: string, need: "VIEW" | "EDIT") {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { workspaceId: true, path: true } });
  if (!page) throw new TRPCError({ code: "NOT_FOUND" }); // no filtres existencia
  const m = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: page.workspaceId } } });
  if (m && (need === "VIEW" || m.role !== "VIEWER")) return;
  const share = await prisma.pageShare.findFirst({
    where: { userId, pageId: { in: ancestorIds(page.path) } }, // herencia por ancestros
  });
  if (!share || (need === "EDIT" && share.access !== "EDIT")) throw new TRPCError({ code: "NOT_FOUND" });
}

export const pageRouter = router({
  update: protectedProcedure.input(zPageUpdate).mutation(async ({ ctx, input }) => {
    await assertPageAccess(ctx.userId, input.pageId, "EDIT");
    return prisma.page.update({ where: { id: input.pageId }, data: input.data });
  }),
});
```

Detalle importante: responde `NOT_FOUND` (no `FORBIDDEN`) cuando no hay acceso, para no revelar que la página existe.

## 3. Uso familiar y aislamiento

- **Un usuario por persona, sin cuentas compartidas.** Cada miembro tiene su workspace personal creado en el registro (invitación por enlace firmado que solo Jose/owner puede generar; sin registro abierto).
- **Aislamiento por defecto = denegar.** Toda query de listado filtra por membership: `where: { workspace: { members: { some: { userId } } } }`. Nunca "listar y filtrar en cliente". La búsqueda global también pasa por el mismo filtro.
- Compartir es **explícito y granular** (página o subárbol, VIEW/EDIT), revocable desde la UI del dueño.
- Encaje con la filosofía OpenClaw de contextos separados: igual que cada persona habla con su agente en su propio contexto, en NOTIONO cada persona ve solo su grafo de páginas; el cruce solo existe donde hay un share explícito, y Dobby respeta esa misma frontera (ver §4): cuando Dobby actúa "para Maite", usa un token con los permisos de Maite, no un token global.

## 4. Acceso de Dobby (API de servicio)

**Nada de puertas traseras ni saltarse guards.** Dobby es un principal más:

- Tabla `ApiToken { id, name, userId, tokenHash, scopes: string[], lastUsedAt, expiresAt, revokedAt }`. El token en claro (`notiono_sk_<32 bytes base64url>`) se muestra una sola vez; en BD solo **SHA-256 del token** (basta hash rápido: el token ya tiene 256 bits de entropía, no necesita Argon2). Lookup por prefijo corto indexado + comparación `timingSafeEqual`.
- **Scopes**: `pages:read`, `pages:write`, `search:read`… El guard de token comprueba scope **y además** ejecuta los mismos `assertPageAccess`/membership del usuario al que pertenece el token. Scope acota; permisos del usuario mandan.
- Dos modos: (a) token ligado a la cuenta de servicio `dobby@notiono` que es EDITOR solo de los workspaces donde se le invite, o (b) un token por miembro de la familia para acciones "en nombre de". Empieza con (a).
- **Rotación**: `expiresAt` a 90 días, endpoint de rotación que emite el nuevo antes de revocar el viejo (solape de 24 h). Revocación inmediata poniendo `revokedAt`.
- Middleware: `Authorization: Bearer` → resuelve token → construye `ctx.userId` igual que una sesión, marca `ctx.via = "api"` y aplica rate-limit propio por token en Redis. Los routers no distinguen sesión de token: mismos guards.
- Audita cada llamada de API (tabla `AuditLog`: token, procedimiento, recurso, timestamp).

## 5. Hardening

- **Headers** (middleware de Next o Caddy/nginx): `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `X-Frame-Options: DENY`.
- **CSP** con nonce por request: `default-src 'self'; script-src 'self' 'nonce-<x>' 'strict-dynamic'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Empieza en `Content-Security-Policy-Report-Only` una semana y luego endurece.
- **Secretos**: `AUTH_SECRET` (32+ bytes), `DATABASE_URL`, SMTP y Redis en `.env` con permisos `600`, fuera de git; rota `AUTH_SECRET` si sospechas fuga (invalida todos los JWT, que es justo lo que quieres). Postgres y Redis escuchando solo en localhost/red interna, nunca expuestos.
- **2FA futuro**: TOTP (otplib) con secreto cifrado en BD + 10 códigos de recuperación hasheados; el flag `mfaVerified` viaja en el JWT y se exige en el callback `jwt`. Obligatorio para OWNER cuando llegue la fase familia.
- Extra: deshabilita registro abierto, logs de auth sin PII sensible, backups de Postgres cifrados, y fail2ban/Crowdsec delante del subdominio.

---

# API y automatización (cómo lo mantiene Dobby)

## Dos superficies, una frontera clara

Notiono expone **dos superficies de API** sobre la misma capa de servicios:

1. **tRPC** — consumida solo por el frontend Next.js. Sesión de usuario (cookie), tipado end-to-end, procedures optimizadas para la UI (mutaciones optimistas, suscripciones, paginación por cursor de la vista). No es un contrato estable: puede cambiar con cada deploy.
2. **REST v1** (`/api/v1/*`) — la superficie de **automatización** para Dobby y los crons de OpenClaw. Token de servicio, contrato versionado y estable, payloads JSON validados con Zod, y semántica **idempotente** en todo lo que un cron pueda re-ejecutar.

**Por qué separar:** tRPC acopla cliente y servidor (bien para la web, fatal para un agente externo que llama con `curl`); un agente necesita URLs estables, errores predecibles y auth por token, no por cookie. **La frontera:** ambas superficies son *thin adapters* sobre los mismos servicios de dominio (`services/pages.ts`, `services/records.ts`…). Regla: **cero lógica de negocio en los routers**; si Dobby no puede hacer algo por REST que la web sí puede por tRPC, es un bug de arquitectura.

```
Next UI ──tRPC──┐
                ├──> services/* ──> Prisma ──> Postgres
Dobby ──REST v1─┘         └──> eventBus ──> webhooks salientes
```

## Autenticación, scopes, rate-limit, versionado, errores

- **Token de servicio**: `Authorization: Bearer nly_sk_...` (hash SHA-256 en tabla `ApiToken`, nunca en claro). Cada token tiene `scopes: string[]` — p. ej. el token de Dobby-finanzas: `["records:write", "records:read", "charts:refresh"]`; el de Dobby-editor añade `pages:write`, `collections:write`. Scope insuficiente → `403 FORBIDDEN_SCOPE`.
- **Rate-limit** por token: 300 req/min (burst 60) vía bucket en Postgres/Redis; cabeceras `X-RateLimit-Remaining` y `Retry-After` en el 429. Los endpoints batch cuentan 1 request, no N — así incentivamos que los crons usen batch.
- **Versionado** por path (`/api/v1/`): dentro de v1 solo cambios aditivos; breaking → `/api/v2/` con v1 mantenida ≥6 meses. Cada respuesta lleva `X-Notiono-Api-Version`.
- **Errores estándar** (mismo shape siempre, parseable por un LLM):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "records[2].fecha: Invalid date",
  "details": [{ "path": "records.2.fecha", "issue": "invalid_date" }], "requestId": "req_8f2ka" } }
```

Códigos: `UNAUTHORIZED` (401), `FORBIDDEN_SCOPE` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500). Los `details` reproducen el error de Zod, de modo que Dobby puede autocorregir el payload y reintentar.

## Catálogo REST v1

### Pages y bloques

| Verbo | Ruta | Uso |
|---|---|---|
| `POST` | `/api/v1/pages` | Crear página con árbol de bloques |
| `PATCH` | `/api/v1/pages/:id` | Título, icono, `blocks` (replace o parche) |
| `GET` | `/api/v1/pages/:id?include=blocks` | Leer página + bloques |
| `POST` | `/api/v1/pages/:id/blocks:append` | Añadir bloques al final (para logs/diarios) |

```ts
const zBlock: z.ZodType<Block> = z.lazy(() => z.object({
  id: z.string().optional(),            // omitido => el server genera cuid
  type: z.enum(["heading", "paragraph", "bulletListItem", "table", "chartEmbed", "collectionView"]),
  props: z.record(z.unknown()).default({}),
  content: z.array(z.object({ type: z.literal("text"), text: z.string(),
    styles: z.record(z.boolean()).default({}) })).optional(),
  children: z.array(zBlock).default([]),
}));
const zCreatePage = z.object({
  parentId: z.string().nullable(), title: z.string().min(1),
  icon: z.string().optional(), blocks: z.array(zBlock).default([]),
});
```

Request/response de `POST /pages`:

```json
// → { "parentId": "pg_finanzas", "title": "Resumen Julio 2026", "icon": "📊",
//     "blocks": [ { "type": "heading", "props": { "level": 2 },
//                   "content": [{ "type": "text", "text": "Gastos del mes" }] },
//                 { "type": "chartEmbed", "props": { "chartId": "cht_gastos_cat" } } ] }
// ← 201
{ "id": "pg_9k2m", "url": "/finanzas/resumen-julio-2026", "blockCount": 2, "createdAt": "2026-08-14T09:00:00Z" }
```

### Collections, fields, records

| Verbo | Ruta | Uso |
|---|---|---|
| `POST` | `/api/v1/collections` | Crear colección (con `fields` inline) |
| `POST` | `/api/v1/collections/:id/fields` | Añadir campo (aditivo, nunca destruye datos) |
| `PATCH` | `/api/v1/fields/:id` | Renombrar, opciones de select |
| `POST` | `/api/v1/collections/:id/records:upsert` | **Upsert batch idempotente** |
| `GET` | `/api/v1/collections/:id/records` | Lectura con filtros |
| `DELETE` | `/api/v1/records/:id` | Soft-delete |

**Lectura con filtros** (lo que usan tanto las gráficas como Dobby para razonar):

```
GET /api/v1/collections/col_movs/records
    ?filter=and(gte(fecha,"2026-07-01"),lt(fecha,"2026-08-01"),eq(tipo,"Gasto"))
    &sort=-fecha&limit=200&cursor=eyJ...
```

```json
{ "records": [ { "id": "rec_a1", "fields": { "fecha": "2026-07-30", "descripcion": "TJ-BM ARDOI",
    "importe": -38.92, "tipo": "Gasto", "categoria": "Alimentación/Súper" } } ],
  "nextCursor": null, "total": 143 }
```

### Charts y webhooks

| Verbo | Ruta | Uso |
|---|---|---|
| `POST` | `/api/v1/charts/:id/refresh` | Recalcular query materializada → `{ "refreshedAt": ..., "rows": 12 }` |
| `POST` | `/api/v1/charts:refresh` | `{ "collectionId": "col_movs" }` — refresca todas las que dependan de esa colección |
| `POST/GET/DELETE` | `/api/v1/webhooks` | Alta/lista/baja de suscripciones salientes |

En la práctica Dobby casi nunca llama a `refresh` a mano: el upsert ya marca dirty las charts dependientes (ver eventos).

## Idempotencia y upsert por clave natural

El caso crítico: el cron de OpenClaw procesa el extracto, falla a mitad, y se relanza. **Nada puede duplicarse.** Cada colección puede declarar una `naturalKey`; para `Movimientos` la clave es un **hash normalizado** `sha256(fecha|importe_céntimos|descripcion_normalizada|seq_del_día)` — el `seq` (posición entre movimientos idénticos del mismo día, o el saldo posterior si el banco lo da) desambigua dos cafés de 1,50 € el mismo día. El hash lo calcula el cliente (helper compartido) y también lo verifica el servidor.

```ts
const zUpsertRecords = z.object({
  keyField: z.string().default("naturalKey"),
  onConflict: z.enum(["update", "skip"]).default("update"),
  records: z.array(z.object({
    naturalKey: z.string(),                 // hash hex
    fields: z.record(z.unknown()),
  })).min(1).max(500),
});
```

```json
// POST /api/v1/collections/col_movs/records:upsert
// → { "onConflict": "update", "records": [
//     { "naturalKey": "9f3ac1…", "fields": { "fecha": "2026-08-12", "descripcion": "TJ-BM ARDOI",
//       "importe": -42.10, "tipo": "Gasto", "categoria": "Alimentación/Súper", "mes": "2026-08" } } ] }
// ← 200
{ "created": 37, "updated": 2, "skipped": 0,
  "results": [{ "naturalKey": "9f3ac1…", "id": "rec_x9", "action": "created" }],
  "chartsMarkedDirty": ["cht_gastos_cat", "cht_resumen_mensual"] }
```

Implementación: `prisma.$transaction` + `INSERT ... ON CONFLICT (collection_id, natural_key) DO UPDATE` (índice único compuesto). Además, cualquier `POST` mutador acepta cabecera **`Idempotency-Key`**: misma clave en 24 h → se devuelve la respuesta cacheada sin re-ejecutar. Los crons de OpenClaw usan `Idempotency-Key: extracto-2026-08` y pueden relanzarse con total tranquilidad.

## Cómo Dobby genera contenido de páginas

Dobby no escribe JSON de BlockNote a mano: usa un **helper builder** (`@notiono/blocks`, publicado también como skill para OpenClaw) que garantiza estructura válida:

```ts
import { page, h2, p, bullets, table, chart, collectionView } from "@notiono/blocks";

const blocks = page(
  h2("Resumen Julio 2026"),
  p(`Gasto total: ${fmt(total)} — ${delta > 0 ? "sube" : "baja"} ${fmt(delta)} vs junio.`),
  bullets(topCategorias.map(c => `${c.nombre}: ${fmt(c.total)}`)),
  chart("cht_gastos_cat"),
  collectionView("col_movs", { filter: 'eq(mes,"2026-07")', view: "table" }),
);
await notiono.pages.create({ parentId: "pg_finanzas", title: "Resumen Julio 2026", blocks });
```

Cada helper emite el nodo BlockNote correcto (`type`, `props`, `content[]` con estilos); el server revalida con `zBlock`, así que aunque Dobby construyera el JSON directamente, un bloque malformado devuelve un 422 con `details` accionables.

**Migración del export actual** (`nocodb-export/*.json`): un script `pnpm migrate:nocodb` que (1) crea `col_movs` con fields tipados (`fecha: date`, `importe: number`, `tipo/categoria: select`, `mes: text` — mejor aún, `mes` como campo fórmula derivado de `fecha`); (2) mapea cada objeto de `Movimientos_2026.json` (`Fecha→fecha`, `Descripcion→descripcion`, `Importe→importe`…), calcula el `naturalKey` con el mismo helper del cron, y llama a `records:upsert` en lotes de 500. `Resumen_Mensual` y `Gastos_por_Categoria` **no se migran como datos**: se convierten en charts con query sobre `col_movs` (eran tablas derivadas). Re-ejecutar la migración es un no-op gracias al upsert.

## Webhooks y eventos salientes

Toda mutación publica en un `eventBus` interno; las suscripciones registradas reciben POST firmado:

```json
// POST /api/v1/webhooks
{ "url": "https://openclaw.local/hooks/notiono", "secret": "whsec_…",
  "events": ["records.upserted", "chart.dirty", "page.updated"],
  "filter": { "collectionId": "col_movs" } }
```

Entrega (firma `X-Notiono-Signature: sha256=…` HMAC del body, reintentos 1m/5m/30m, `eventId` para deduplicar):

```json
{ "eventId": "evt_77q", "type": "records.upserted", "occurredAt": "2026-08-14T09:01:12Z",
  "data": { "collectionId": "col_movs", "created": 37, "updated": 2,
            "chartsMarkedDirty": ["cht_gastos_cat"] } }
```

**El ciclo completo del extracto queda así:** cron de OpenClaw descarga el extracto → normaliza + hashea → `records:upsert` con `Idempotency-Key` → Notiono marca dirty las charts dependientes y las recalcula en background → emite `chart.dirty`/`records.upserted` → el webhook despierta a Dobby, que decide si el mes cerró y, si procede, genera con el builder la página "Resumen mensual" y avisa por Telegram. Ninguna intervención humana, ninguna posibilidad de duplicados, y toda la superficie es la misma que auditaría un humano con `curl`.

---

# Despliegue, DevOps y operación en el NAS

## 1. Arquitectura de despliegue

NOTIONO corre como **un único contenedor Next.js standalone** en el DS923+, reutilizando el Postgres 16 y el Redis del stack AFFiNE mediante una red Docker compartida. Nada de duplicar bases de datos: menos RAM, un solo punto de backup.

```
Internet → Cloudflare (DNS, proxy naranja) → Synology Reverse Proxy (443, LE)
        → notiono-app:3000 (red docker "affine_net")
        → postgres:5432 (BD "notiono") · redis:6379 (DB índice 2)
```

## 2. Dockerfile multi-stage (Next 16 standalone)

```dockerfile
# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build   # next.config: output: 'standalone'

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S notiono && adduser -S notiono -G notiono \
 && apk add --no-cache curl
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# prisma CLI + schema para el job de migraciones
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
USER notiono
EXPOSE 3000
CMD ["node", "server.js"]
```

Imagen resultante: ~250 MB. Se etiqueta versionada: `notiono:1.4.2` y `notiono:latest` nunca en prod (rollback imposible sin tags).

## 3. docker-compose.yml en el NAS

`/volume1/docker/notiono/docker-compose.yml`:

```yaml
services:
  notiono-migrate:
    image: registry.local/notiono:${NOTIONO_TAG:?definir tag}
    command: ["npx", "prisma", "migrate", "deploy"]
    env_file: [.env]
    networks: [affine_net]
    restart: "no"

  notiono:
    image: registry.local/notiono:${NOTIONO_TAG:?definir tag}
    container_name: notiono-app
    depends_on:
      notiono-migrate:
        condition: service_completed_successfully
    env_file: [.env]
    environment:
      - NODE_OPTIONS=--max-old-space-size=768
    volumes:
      - /volume1/docker/notiono/uploads:/app/uploads
    networks: [affine_net]
    ports:
      - "127.0.0.1:3005:3000"   # solo loopback; entra por reverse proxy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits: { memory: 1g, cpus: "2" }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    restart: unless-stopped

networks:
  affine_net:
    external: true   # red existente del stack AFFiNE
```

Claves: el **job de migraciones es un servicio separado** que corre `prisma migrate deploy` y termina; la app solo arranca si el job sale con código 0 (`service_completed_successfully`). Así la migración nunca corre en paralelo en varios contenedores ni dentro del arranque de la app. El puerto 3005 se ata a `127.0.0.1` del NAS: solo el reverse proxy de DSM lo alcanza.

## 4. Base de datos y pool

Crear la BD sin tocar AFFiNE (una vez, vía Dobby por SSH):

```bash
docker exec -it affine-postgres psql -U postgres -c \
  "CREATE USER notiono WITH PASSWORD '...'; CREATE DATABASE notiono OWNER notiono;"
```

`DATABASE_URL` con pool acotado — Prisma abre por defecto `num_cpus*2+1` conexiones y el Postgres compartido tiene `max_connections=100` que AFFiNE ya consume en parte:

```
DATABASE_URL=postgresql://notiono:***@postgres:5432/notiono?connection_limit=5&pool_timeout=10
```

Con 5 conexiones sobra para un uso familiar; si aparecieran timeouts, subir a 10 antes que meter PgBouncer (innecesario a esta escala). Redis: reutilizar el existente con **DB índice distinto** (`REDIS_URL=redis://redis:6379/2`) y prefijo de claves `notiono:`.

## 5. Reverse proxy, Cloudflare y TLS

Patrón ya probado con `*.monrealperez.com`:

1. **Cloudflare**: registro `A notiono.monrealperez.com → IP pública` (o CNAME al DDNS), proxy naranja activado, SSL/TLS en modo **Full (strict)**.
2. **DSM → Portal de inicio de sesión → Avanzado → Proxy inverso**: origen `HTTPS notiono.monrealperez.com:443` → destino `HTTP localhost:3005`.
3. En la regla, pestaña **Personalizar encabezado → Crear → WebSocket** (añade `Upgrade` y `Connection`, imprescindible para colaboración en vivo/HMR de nada, pero sí para SSE/WS de Notiono). Añadir además:
   - `X-Forwarded-Proto: https`
   - `X-Real-IP: $remote_addr`
4. Certificado Let's Encrypt en DSM (Seguridad → Certificado) para el subdominio y asignarlo a la regla de proxy. Si Cloudflare proxied bloquea el reto HTTP-01, usar DNS-01 con `acme.sh` + API de Cloudflare (ya montado para otros subdominios) o cert wildcard.
5. Subir `proxy_read_timeout` de la regla a 3600s si hay SSE de larga duración.

## 6. Configuración y secretos

- `/volume1/docker/notiono/.env` con permisos `600 root:root`: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL=https://notiono.monrealperez.com`, SMTP, etc.
- Los secretos **no viajan en la imagen ni en git**; el repo tiene `.env.example`. Dobby los sembró una vez y solo se editan en el NAS.
- Entornos: `dev` en el PC (`docker compose -f compose.dev.yml up` con Postgres/Redis locales y `migrate dev`), `prod` en el NAS (solo `migrate deploy`, jamás `dev` ni `db push`).

## 7. Backups y restauración

Tarea programada de DSM (root, 03:30 diaria), script `/volume1/docker/notiono/backup.sh`:

```bash
#!/bin/sh
set -eu
DIR=/volume1/backups/notiono; DATE=$(date +%F)
docker exec affine-postgres pg_dump -U notiono -Fc notiono > "$DIR/db-$DATE.dump"
tar -C /volume1/docker/notiono -czf "$DIR/uploads-$DATE.tgz" uploads
find "$DIR" -name 'db-*' -mtime +14 -delete
find "$DIR" -name 'uploads-*' -mtime +14 -delete
```

- **Retención**: 14 días locales + copia semanal a nube externa vía Hyper Backup/rclone (el NAS no es un backup de sí mismo).
- **Restauración probada** (ensayar trimestralmente, no solo confiar): `pg_restore -U notiono -d notiono_restore --clean db-YYYY-MM-DD.dump` contra una BD temporal, arrancar un contenedor apuntando a ella y verificar login + una nota. Documentar el tiempo real (objetivo: <15 min).

## 8. CI/CD realista con Dobby

Sin registry público: build en el PC dev, push por SSH.

**Deploy** (Dobby, sesión SSH temporal):

```bash
# En el PC: build y export
docker build -t notiono:1.4.2 . && docker save notiono:1.4.2 | gzip > notiono-1.4.2.tgz
scp notiono-1.4.2.tgz nas:/volume1/docker/notiono/images/
# En el NAS:
docker load < images/notiono-1.4.2.tgz
sed -i 's/^NOTIONO_TAG=.*/NOTIONO_TAG=1.4.2/' .env
docker compose up -d          # corre migrate y luego la app
curl -fsS https://notiono.monrealperez.com/api/health
```

**Rollback**: `NOTIONO_TAG=1.4.1 docker compose up -d`. Como las imágenes viejas quedan cargadas (conservar las 3 últimas, `docker image prune` selectivo), el rollback es <30s. Ojo: si la migración N no es retro-compatible, el rollback de app exige restaurar el dump previo — por eso las migraciones se escriben **expand/contract** (añadir columnas antes de usarlas, borrar en una release posterior).

## 9. Observabilidad y alertas

- **Logs**: json-file rotado (config arriba); `docker logs -f notiono-app` para diagnóstico. Next en standalone loguea a stdout: suficiente.
- **Healthcheck**: endpoint `/api/health` que hace `SELECT 1` a Prisma y `PING` a Redis, devuelve 200/503. Lo usa el healthcheck de Docker y el monitor externo.
- **Alertas a Dobby**: cron cada 5 min en el propio gateway de Dobby (`curl -fsS https://notiono.monrealperez.com/api/health || avisar`), que notifica por el canal familiar si falla 2 comprobaciones seguidas. Complemento: Uptime Kuma si ya corre en el NAS.
- **Auto-recuperación**: `restart: unless-stopped` + healthcheck; opcionalmente autoheal para reiniciar contenedores unhealthy.

## 10. Hardening (expuesto a internet)

- Solo 443 abierto en el router hacia el NAS; el contenedor no publica puertos a la LAN (loopback only).
- Cloudflare delante: WAF gratuito, rate limiting básico, y **regla que bloquea `/api/*` de países no esperados** si se quiere apretar.
- Contenedor: usuario no-root, `read_only: true` viable (con `tmpfs: /tmp` y el volumen de uploads como única escritura), sin capacidades extra.
- DSM: bloqueo automático de IP, 2FA en admin, SSH solo con clave y deshabilitado cuando Dobby no despliega.
- Postgres/Redis **nunca** expuestos fuera de `affine_net`.
- Actualizar imagen base (`node:22-alpine`) en cada release; `docker scout`/trivy en el build.

## 11. Presupuesto de recursos en 12 GB

| Servicio | RAM típica | Límite |
|---|---|---|
| DSM + servicios Synology | ~2 GB | — |
| AFFiNE (app+workers) | ~2–3 GB | ya fijado |
| Postgres 16 compartido | ~0,5–1 GB | shared_buffers 512MB |
| Redis compartido | ~100 MB | maxmemory 256MB |
| **Notiono** | **300–600 MB** | **1 GB / 2 CPU** |
| Margen (cache FS, picos) | ~3 GB | — |

Notiono en reposo consume ~300 MB (`--max-old-space-size=768` evita que Node crezca hasta el límite del cgroup y muera por OOM sin GC previo). El límite de 1 GB actúa de cortafuegos: si algo se dispara, cae Notiono y no el NAS. Con este reparto quedan >2 GB libres; no añadir más stacks pesados sin revisar la tabla.

---

# Migración de datos y branding

## 1. Plan de migración (script único vía API de Notiono)

Un solo script `scripts/migrate.ts` (Node, `tsx`), que lee los seis JSON de `nocodb-export/` y llama a la API de Notiono en tres fases: **(1)** crear Collections + Fields, **(2)** upsert de Records, **(3)** verificación. Se ejecuta con `NOTIONO_TOKEN=... pnpm migrate` y es seguro relanzarlo.

**Idempotencia.** Cada record se inserta con una clave externa `nocoId` (campo oculto tipo `number`) que guarda el `Id` original de NocoDB. El script hace *upsert por `nocoId`*: si existe, actualiza; si no, crea. Las Collections se buscan por `slug` antes de crearse. Así el script puede correrse N veces sin duplicar las 460 filas de movimientos.

**Decisión de diseño:** `Gastos_por_Categoria_2026` y `Resumen_Mensual_2026` son tablas *derivadas* (agregados de Movimientos). Se migran igualmente como Collections (para no perder las notas manuales del resumen), pero se marcan como candidatas a sustituir por vistas agregadas de Notiono cuando existan; el dato fuente canónico es **Movimientos**.

### Mapeos campo a campo

**Movimientos_2026 → Collection `movimientos`** (460 filas)

| Campo NocoDB | Field Notiono | Tipo | Notas |
|---|---|---|---|
| `Id` | `nocoId` | number (oculto) | clave de upsert |
| `Fecha` | `fecha` | date | ISO `YYYY-MM-DD` tal cual |
| `Descripcion` | `descripcion` | text (título) | campo primario de la fila |
| `Importe` | `importe` | currency (EUR, 2 dec.) | negativo = gasto; render en IBM Plex Mono |
| `Tipo` | `tipo` | select | opciones: Gasto (rojo suave), Ingreso (verde) |
| `Categoria` | `categoria` | select | ~30 opciones jerárquicas "Área/Sub" extraídas del dataset |
| `Mes` | `mes` | text | mantener como `2026-MM`; sirve de clave de agrupación |
| `CreatedAt` | — | — | Notiono genera el suyo; no se migra |

**Deducibles_2026 → Collection `deducibles`**

| Campo NocoDB | Field Notiono | Tipo | Notas |
|---|---|---|---|
| `Id` | `nocoId` | number (oculto) | upsert |
| `Concepto` | `concepto` | text (título) | |
| `Fecha` | `fecha` | date | |
| `Importe EUR` | `importe` | currency (EUR) | renombrado sin espacio |
| `Categoria` | `categoria` | select | Equipo, Software, Suministros… |
| `Trimestre` | `trimestre` | select | Q1–Q4; útil para el F-69/130 |
| `Deducible` | `deducible` | select | Sí / Parcial / No |
| `En banco` | `enBanco` | checkbox | NocoDB exporta 0/1 → boolean |
| `Notas` | `notas` | text largo | |

**Facturas → Collection `facturas`**

| Campo NocoDB | Field Notiono | Tipo | Notas |
|---|---|---|---|
| `Id` | `nocoId` | number (oculto) | upsert |
| `Concepto` | `concepto` | text (título) | |
| `Fecha` | `fecha` | date | |
| `Importe EUR` | `importe` | currency (EUR) | |
| `Tipo` | `tipo` | select | Recibida / Emitida |
| `Archivo NAS` | `rutaNas` | text (mono) | ruta literal; en fase 2, adjunto real |

**Tareas → Collection `tareas`**

| Campo NocoDB | Field Notiono | Tipo | Notas |
|---|---|---|---|
| `Id` | `nocoId` | number (oculto) | upsert |
| `Tarea` | `titulo` | text (título) | |
| `Estado` | `estado` | select | Por hacer / En curso / Hecho — orden fijo para kanban |
| `Area` | `area` | select | Finanzas, Casa, Trabajo… |
| `Prioridad` | `prioridad` | select | Alta / Media / Baja |
| `Fecha limite` | `fechaLimite` | date (nullable) | muchos null: tolerar |
| `Notas` | `notas` | text largo | |

**Resumen_Mensual_2026 → Collection `resumenMensual`** — `Mes`→`mes` (text, título), `Ingresos`/`Gastos`/`Balance`→ currency, `Notas`→ text. `Movimientos` (link roto en el export, siempre null) **no se migra**; el conteo se recalcula. **Gastos_por_Categoria_2026 → `gastosCategoria`** — `Mes`→text, `Categoria`→select (mismo catálogo que movimientos), `Total`→currency; `MesCategoria` **se descarta** (es concatenación derivable).

### Verificación post-migración

El script termina con un bloque `verify()` que falla con exit code ≠ 0 si algo no cuadra:

1. **Conteos:** records por collection == filas del JSON (movimientos: 460).
2. **Sumas de control:** `SUM(importe)` de movimientos por mes debe coincidir con `Balance` de `resumenMensual` (tolerancia ±0,01 € por redondeo); ídem suma por categoría vs `gastosCategoria`.
3. **Integridad de selects:** ninguna opción huérfana (toda `categoria` de un record existe en el catálogo del field).
4. **Muestreo:** re-lee 10 records aleatorios por collection y compara campo a campo contra el JSON.
5. Imprime un informe final por tabla: creados / actualizados / sin cambios / errores.

## 2. Recreación de páginas de notas (desde AFFiNE)

Las páginas del hub (Inicio, Proyectos, Casa, Finanzas, Recetas…) se recrean como **docs de bloques** de Notiono en el mismo script (fase 1b), a partir del export markdown de AFFiNE:

- Parser md→bloques: `#`→heading1, `##`→heading2, párrafos→paragraph, listas→bulleted/numbered, `- [ ]`→todo, tablas md→table block, `![]()`→image (subiendo el asset vía endpoint de media).
- **Inicio** se rehace a mano como dashboard: saludo, bloque de accesos rápidos (links a las collections) y vistas embebidas de `tareas` (filtro Estado≠Hecho) y `resumenMensual` (mes actual). Es la portada: merece diseño, no migración literal.
- Jerarquía preservada: cada página AFFiNE → doc raíz en sidebar, subpáginas → docs hijos; los enlaces internos se re-resuelven en una segunda pasada (mapa `títuloAFFiNE → docId`).
- Idempotencia: docs identificados por `slug` derivado del título; si existe, se reemplaza el contenido (los docs de notas no tienen ediciones concurrentes durante la migración).

## 3. Theming: tokens en Tailwind v4

Todo el sistema vive en `app/globals.css`. Un solo acento (el naranja de Jose), neutros cálidos —nunca grises azulados de framework— y modo oscuro por clase `.dark` redefiniendo solo las variables semánticas.

```css
@import "tailwindcss";

@theme {
  /* Marca */
  --color-brand: #ff5c28;
  --color-brand-hover: #e64d1e;
  --color-brand-soft: #fff1ec;      /* fondos de acento, chips */
  --color-brand-ink: #b83a12;       /* texto naranja accesible sobre claro */

  /* Neutros cálidos (base cáscara de huevo, no blanco puro) */
  --color-surface: #faf8f5;
  --color-surface-raised: #ffffff;
  --color-surface-sunken: #f1ede7;
  --color-ink: #1c1917;
  --color-ink-muted: #6f6a63;
  --color-line: #e5e0d8;

  /* Semánticos (finanzas) */
  --color-positive: #1a7f4e;
  --color-negative: #c93a2e;
  --color-warning: #b8860b;

  /* Tipografía */
  --font-display: "Bricolage Grotesque", sans-serif;
  --font-sans: "Hanken Grotesk", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;

  /* Radios: generosos en contenedores, contenidos en controles */
  --radius-control: 0.5rem;
  --radius-card: 0.875rem;
  --radius-pill: 9999px;

  /* Sombras: difusas y cálidas, nunca negras duras */
  --shadow-card: 0 1px 2px rgb(28 25 23 / 0.05), 0 4px 12px rgb(28 25 23 / 0.06);
  --shadow-pop: 0 4px 8px rgb(28 25 23 / 0.08), 0 12px 32px rgb(28 25 23 / 0.12);

  /* Espaciado base 4px (escala Tailwind) + ritmo de página */
  --spacing-gutter: 1.5rem;
  --container-content: 52rem;
}

.dark {
  --color-surface: #171412;
  --color-surface-raised: #211d1a;
  --color-surface-sunken: #120f0e;
  --color-ink: #f2ede7;
  --color-ink-muted: #a39c92;
  --color-line: #322c27;
  --color-brand-soft: #33190f;
  --color-brand-ink: #ff8259;
}
```

Fuentes con `next/font` (subsets `latin`, variable weight) inyectadas como esas variables. Regla de uso: **Bricolage** solo en h1–h3 y cifras-héroe del dashboard; **Hanken** para todo lo demás; **Plex Mono** en importes, fechas tabulares, IDs y código — con `font-variant-numeric: tabular-nums`.

## 4. Guía de estilo de UI

**Principios.** (1) *Papel cálido, tinta oscura, un solo acento*: el naranja se gana su protagonismo usándose poco — acción primaria, estado activo, foco. (2) *Los números son los protagonistas*: en un hub financiero la tabla es la UI; densidad media-alta (filas de 40px, `text-sm`), importes alineados a la derecha en mono, negativos en `--color-negative` sin paréntesis. (3) *Nada de defaults*: ni `shadow-md` azulada, ni `rounded-lg` uniforme, ni gris `slate` — todo pasa por los tokens.

**Componentes base.**
- **Botón primario:** fondo `brand`, texto blanco, `radius-control`, sin borde; hover `brand-hover` + translate-y de -1px con `transition 150ms ease-out`. Secundario: borde `line`, fondo `surface-raised`. Ghost para acciones de tabla.
- **Inputs:** fondo `surface-raised`, borde `line` 1px, foco con anillo `brand` de 2px y borde `brand` — sin el doble outline azul del navegador.
- **Cards:** `surface-raised`, `radius-card`, `shadow-card`, borde 1px `line` (la sombra sola no define bordes en modo oscuro). Cabecera con título en Bricolage `text-base font-semibold`.
- **Sidebar:** fondo `surface-sunken`, 260px, ítems pill (`radius-control`) con estado activo en `brand-soft` + texto `brand-ink` y barra de 3px naranja a la izquierda; secciones (Notas / Finanzas / Tareas) con label uppercase `text-xs tracking-wide` en `ink-muted`.

**Microinteracciones.** Transiciones 150–200ms solo en `color`, `background`, `transform`, `opacity` (nunca `all`). Checkbox de tarea con tick animado (stroke-dashoffset, 200ms) y texto tachado con fade. Fila de tabla con hover `surface-sunken`. Aparición de cards del dashboard con fade+4px stagger de 30ms. `prefers-reduced-motion`: todo a 0.

**Iconografía.** [Lucide](https://lucide.dev) en 16/20px, `stroke-width: 1.75`, color `ink-muted` (el activo hereda `brand-ink`). Un icono por ítem de sidebar y por tipo de collection; jamás emoji en la UI cromada (sí permitidos en contenido del usuario).

**Vacíos y toques personales.** Estados vacíos con una frase con voz ("Sin movimientos este mes. Milagro."), no "No data". Saludo del Inicio con nombre y hora. Estas dos cosas, más los neutros cálidos, son lo que más aleja el resultado del look genérico.

## 5. Logo e identidad mínima

Logotipo = wordmark **"notiono"** en Bricolage Grotesque SemiBold, minúsculas, en `--color-ink`, con el **punto final en naranja** (`notiono.`) — barato, memorable, escala bien. Símbolo para espacios pequeños: una **"n" minúscula de Bricolage en blanco sobre cuadrado naranja** con `radius-card` proporcional (el "superellipse" a 22% del lado).

**Favicon:** SVG único con media query para modo oscuro:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#ff5c28"/>
  <text x="32" y="46" font-family="Bricolage Grotesque, sans-serif"
        font-size="42" font-weight="600" fill="#fff" text-anchor="middle">n</text>
</svg>
```

Exportado también a `icon.png` 512px (PWA/OG) y `apple-icon.png` con el texto convertido a trazado para no depender de la fuente instalada. El mismo cuadrado naranja sirve de avatar en metadatos OG, con el wordmark completo en la imagen social 1200×630 sobre fondo `#faf8f5`.

---

# 12. Roadmap por fases, testing, riesgos y decisiones

## 12.1 Roadmap detallado

Cada fase termina **desplegada en el NAS y usable**; no se arranca la siguiente sin cerrar los criterios de aceptación (CA) de la anterior. Estimaciones para desarrollo asistido por IA (Dobby + Claude Code) a tiempo parcial.

| Fase | Alcance | Entregables concretos | Criterios de aceptación (resumen) | Esfuerzo |
|---|---|---|---|---|
| **0** ✅ | Andamiaje | Repo, Next 16 + tRPC + Prisma 6 compilando, Docker en NAS, dominio+SSL, login básico, CI mínima | Hecho: build verde y app desplegada | — |
| **1** | Editor + páginas | BlockNote con bloques estándar, árbol de páginas anidadas con orden fraccional, autosave con debounce, papelera, buscador por título, versión-snapshot básica | Página con 10 tipos de bloque sobrevive a recarga; reordenar/mover páginas sin corrupción; papelera restaura; e2e verdes | 1–1,5 sem |
| **2** | Bases de datos + vistas | Colecciones, campos tipados (texto, número, moneda, select, multiselect, fecha, checkbox, url), vista **tabla** (edición inline, filtros, orden) y **kanban** (drag entre columnas), API REST v1 con upsert idempotente para Dobby | Colección "Movimientos" con 500 filas usable con fluidez; filtro+orden correctos vs. SQL de referencia; upsert repetido no duplica | 1,5–2 sem |
| **3** | Gráficas + dashboards | Motor de agregación en servidor (group-by mes/categoría + sum/avg/count), Chart spec, tipos barras/líneas/donut/KPI, bloque "gráfica embebida", dashboard Finanzas con filtro global de fechas, cache Redis + endpoint `refresh` | Dashboard con 3 gráficas + KPI; editar un registro → gráfica refleja el cambio (con refresh) ; inserción por API de Dobby actualiza todo sin intervención | ~1 sem |
| **4** | Multiusuario/familia | Roles owner/editor/viewer, compartición por página, vistas calendario/galería/lista, relaciones + rollups, fórmulas simples, refresco en vivo (WS/pubsub) | Usuario viewer no ve/edita lo no compartido (probado por e2e); fórmula `importe*1.21` correcta; kanban de otro usuario se refresca solo | ~2 sem |
| **5** | Pulido + branding + migración | Tema completo (#ff5c28, tipografías), modo oscuro, migración NocoDB (460 movimientos) + Tareas + páginas AFFiNE vía API, PWA básica, hardening final, runbook de operación | Migración verificada fila a fila (checksums/conteos); Lighthouse ≥ 90 en rendimiento/accesibilidad; backup+restauración ensayados | ~1 sem |

**Fase 1 desglosada en tareas** (orden de ejecución):

1. **Integrar BlockNote** en una página fija: render + serialización a `Page.content` (JSONB). *(0,5 d)*
2. **Autosave**: debounce ~800 ms, UI optimista, indicador "Guardando…/Guardado", guard de versión (si el servidor va por delante, avisar, no machacar). *(1 d)*
3. **Árbol de páginas**: CRUD, `parentId`, orden fraccional (`fractional-indexing`), sidebar con drag&drop y expandir/colapsar. *(1,5 d)*
4. **Bloques estándar**: to-do, toggle, callout, código con resaltado, imagen (upload a `/uploads`), divisor, cita. *(1–1,5 d)*
5. **Referencia a página** (`@página`) con autocompletado. *(0,5 d)*
6. **Papelera**: `archivedAt`, vista de papelera, restaurar, purga a 30 días (cron). *(0,5 d)*
7. **Buscador** por título (ILIKE + índice; contenido full-text queda para Fase 5). *(0,5 d)*
8. **Snapshots de versión**: guardar snapshot cada N minutos de edición activa. *(0,5 d)*
9. **Tests + CI de fase** (ver 12.2). *(1 d)*

## 12.2 Estrategia de testing

Principio: **la pirámide de verdad**. Mucho unit barato en la lógica pura (agregaciones, filtros, orden), integración donde vive el riesgo real (tRPC+Prisma+JSONB), y pocos e2e pero que cubran los flujos que definen el éxito del proyecto. Todo con **datos semilla deterministas** (`prisma/seed.ts` con faker seedeado + un extracto bancario de ejemplo fijo en `fixtures/extracto-ejemplo.json`).

| Nivel | Herramienta | Qué se prueba | Ejemplos concretos |
|---|---|---|---|
| Unit | Vitest | Lógica pura sin BD | Agregaciones de gráficas (sum/avg por mes con meses vacíos, timezone, redondeo €); traducción de `View.config` → predicados de filtro (combinaciones AND/OR, fechas relativas); orden fraccional (inserción entre vecinos, no colisiona tras 1000 reordenaciones); evaluador de fórmulas (precedencia, división por cero, tipos mixtos, **rechazo de expresiones maliciosas**); serialización/deserialización de bloques (round-trip JSON idéntico) |
| Integración | Vitest + Postgres de test (contenedor efímero o BD `notiono_test`) | Routers tRPC y REST v1 contra Prisma real | Upsert idempotente de registros (2ª llamada = 0 duplicados); consultas sobre `Record.cells` JSONB devuelven lo mismo que el unit predice; permisos en cada procedure (viewer no puede mutar); migraciones aplican limpio desde cero |
| E2E | Playwright (contra build de producción) | Flujos reales de usuario | (1) crear página con N bloques, recargar, contenido intacto; (2) crear colección + 20 registros + kanban, arrastrar tarjeta entre columnas y verificar persistencia; (3) crear gráfica de barras, editar un registro, verificar que la gráfica cambia; (4) login/logout, sesión expirada, viewer bloqueado |
| API Dobby | Vitest (integración) + script smoke post-deploy | Contrato de automatización | Insertar `fixtures/extracto-ejemplo.json` por REST → conteo exacto de filas; re-ejecutar → idempotencia; llamar `charts/:id/refresh` → cache invalidada y agregados correctos; token con scope insuficiente → 403 |
| CI | GitHub Actions (o Gitea Actions) | En cada push/PR | `lint` + `tsc --noEmit` + unit + integración (Postgres como service container) + e2e en Chromium; artefacto de imagen Docker solo si todo verde |

**Definición de "hecho/perfecto" por fase:** (a) CA de la tabla escritos como tests e2e y **en verde**; (b) unit+integración de las piezas nuevas ≥ cobertura de los caminos críticos (no perseguimos %, perseguimos casos); (c) desplegado en el NAS y **revisión manual de Jose** (15 min con checklist); (d) smoke de API de Dobby pasa contra producción; (e) sin errores en logs durante 48 h de uso real. Solo entonces se congela la fase.

## 12.3 Riesgos técnicos y mitigaciones

- **Complejidad del editor** (el mayor riesgo): no construir nada sobre ProseMirror a pelo; usar BlockNote y limitar los bloques por fase. Los bloques que embeben vistas/gráficas llegan solo cuando esas piezas existen (F2–F3). Test de round-trip de serialización como red de seguridad ante upgrades de BlockNote (fijar versión, actualizar solo con e2e verdes).
- **Rendimiento JSONB en NAS**: las agregaciones sobre `Record.cells` pueden degradarse con miles de filas. Mitigación escalonada: índices GIN → columnas materializadas para campos calientes (fecha, importe) → cache Redis de resultados de gráfica con invalidación por escritura. Presupuesto: dashboard < 1,5 s con 5.000 registros (medirlo en CI con seed grande).
- **Pérdida de datos por autosave/concurrencia**: guard de versión optimista desde F1, snapshots periódicos, y backup diario probado (una restauración ensayada por fase). CRDT (Yjs) **no** entra hasta que haya edición simultánea real.
- **Recursos del NAS**: Next standalone, límites de memoria por contenedor, reutilizar Postgres/Redis existentes. Healthcheck + aviso a Dobby si el contenedor se reinicia.
- **Bus factor (solo Dobby mantiene el código)**: código pequeño y tipado, tests como documentación ejecutable, `ARCHITECTURE.md` + runbook de despliegue/rollback en el repo, dependencias pocas y maduras. Cualquier dev (o futura IA) debe poder retomar el proyecto con `docker compose up` + leer 2 documentos.
- **Scope creep**: la lista MUST/SHOULD/LATER está congelada; cualquier "¿y si además…?" va a un backlog de Fase 5+, nunca a la fase en curso.

## 12.4 Decisiones abiertas (confirmar antes de cada fase)

**Antes de Fase 1:**
1. **Nombre y subdominio definitivos** (NOTIONO → `app.monrealperez.com`, `notas.…` u otro): afecta a branding, cookies y SSL; cambiarlo luego es barato pero molesto.
2. **Confirmar BlockNote** como editor (recomendado) frente a BlockSuite; última ventana para cambiar sin coste.
3. **Búsqueda**: ¿solo títulos en F1 (recomendado) o full-text de contenido ya?

**Antes de Fase 2:**
4. **Clave de idempotencia** de movimientos bancarios: propongo `(fecha, importe, saldo)`; confirmar que el extracto real no produce colisiones legítimas.
5. **Moneda**: ¿solo EUR (más simple) o multi-divisa desde el modelo?

**Antes de Fase 3:**
6. **Refresco de gráficas**: ¿recálculo al vuelo en cada carga (simple) o cache Redis + `refresh` explícito (recomendado para el NAS)?

**Antes de Fase 4:**
7. **Modelo familiar**: ¿un workspace por persona + compartidos, o un workspace familiar común con permisos por página?
8. **¿Merece la pena WS/presencia ya**, o la familia usará esto de forma tan asíncrona que puede esperar?

**Antes de Fase 5:**
9. **Migración AFFiNE**: ¿re-crear solo las páginas clave a mano vía API (recomendado) o intentar conversión automática del export?
10. **Fecha de corte** para apagar NocoDB/AFFiNE tras verificar la migración de finanzas.

---

# Colaboración en tiempo real

## 1. Arquitectura: Yjs + Hocuspocus sobre el stack existente

BlockNote trae soporte nativo de Yjs (`collaboration: { provider, fragment }`), así que la pieza central es un **documento Yjs por página** sincronizado vía WebSocket. Usamos **Hocuspocus** (servidor Yjs de los autores de Tiptap) como proceso Node separado en el mismo `docker-compose` del NAS, en lugar de escribir un servidor propio: nos da auth por hooks, throttling, debounce de persistencia y extensión Redis ya resueltos.

```
Navegador (BlockNote + y-prosemirror + awareness)
   │  WebSocket wss://notiono.local/collab
   ▼
Hocuspocus (contenedor Node)
   ├─ onAuthenticate → valida sesión Auth.js (JWT/cookie) + permisos de página
   ├─ onLoadDocument → reconstruye Y.Doc desde Postgres
   ├─ onStoreDocument (debounced 2-4 s) → persiste update + snapshot
   └─ Redis pub/sub (extensión) → opcional para >1 réplica
   ▼
PostgreSQL (Prisma)
```

Cada página tiene un nombre de documento `page:<pageId>`. Las **filas de base de datos** (tablas tipo Notion) usan documentos separados `db:<databaseId>` (ver §4), evitando cargar cientos de filas en el Y.Doc de la página.

## 2. Persistencia Yjs en Postgres: updates append-only + snapshots

Los updates de Yjs son binarios y mergeables. El patrón robusto es un log append-only con compactación periódica a snapshot:

```prisma
model YDocUpdate {
  id        BigInt   @id @default(autoincrement())
  docName   String   // "page:<uuid>" | "db:<uuid>"
  update    Bytes    // update binario de Yjs
  createdAt DateTime @default(now())
  @@index([docName, id])
}

model YDocSnapshot {
  docName      String   @id
  state        Bytes    // Y.encodeStateAsUpdate(doc) compactado
  stateVector  Bytes
  lastUpdateId BigInt   // hasta qué update incluye
  updatedAt    DateTime @updatedAt
}
```

Pseudo-código de los hooks de Hocuspocus:

```ts
onLoadDocument: async ({ documentName, document }) => {
  const snap = await prisma.yDocSnapshot.findUnique({ where: { docName } })
  if (snap) Y.applyUpdate(document, snap.state)
  const tail = await prisma.yDocUpdate.findMany({
    where: { docName, id: { gt: snap?.lastUpdateId ?? 0 } }, orderBy: { id: 'asc' }
  })
  tail.forEach(u => Y.applyUpdate(document, u.update))
  return document
}

onStoreDocument: async ({ documentName, document }) => {
  // debounced por Hocuspocus (p.ej. 3 s, máx. 10 s)
  await prisma.yDocUpdate.create({ data: { docName, update: Y.encodeStateAsUpdate(document, lastPersistedSV) } })
  if (updatesSinceSnapshot(docName) > 200) await compact(docName) // snapshot + DELETE de updates viejos
}
```

**Convivencia con el JSON actual y el versionado**: el Y.Doc pasa a ser la *fuente de verdad* del contenido, pero mantenemos la columna `Block.content`/`Page.contentJson` como **proyección derivada**: en `onStoreDocument` serializamos también `editor.document` (JSON de BlockNote) y lo escribimos vía Prisma. Así, búsqueda full-text, exportaciones, API pública y el historial de versiones existente siguen funcionando sin tocar nada. El versionado guarda, además del JSON, el `stateVector` del momento, lo que permite en el futuro *diffs* semánticos con `Y.snapshot`.

## 3. Presencia, multi-cursor y awareness

El protocolo **awareness** de Yjs (efímero, no persistido) transporta todo esto sin coste en BD:

```ts
provider.setAwarenessField('user', {
  id: session.user.id,
  name: session.user.name,
  color: colorFromId(session.user.id), // paleta determinista
  avatarUrl: session.user.image,
})
```

- **Multi-cursor y selección remota**: `y-prosemirror` (que BlockNote usa por debajo) pinta cursores y rangos de selección de otros usuarios automáticamente a partir del awareness; solo aportamos CSS (caret con etiqueta de nombre, selección con el color al 20% de opacidad).
- **Quién está en la página**: un componente `PresenceAvatars` se suscribe a `awareness.on('change')` y muestra la pila de avatares en la cabecera (con overflow "+3"). Al cerrar pestaña o perder conexión, Hocuspocus expira el estado (~30 s) y el avatar desaparece.
- **Presencia a nivel de workspace** (punto verde en el sidebar): no abrimos un socket por página; publicamos `{ userId, pageId, ts }` en un doc awareness ligero `presence:<workspaceId>` compartido.

## 4. Sincronización en vivo de bases de datos (celdas)

Las vistas tipo tabla/kanban no son ProseMirror, pero Yjs sirve igual usando tipos compartidos:

```
Y.Doc "db:<databaseId>"
 └─ Y.Map "rows"
     └─ rowId → Y.Map { propId → valor }   // celdas
 └─ Y.Map "schema"                          // definición de propiedades
```

Al editar una celda: `rows.get(rowId).set(propId, value)` → todos los clientes con esa vista abierta ven el cambio al instante (y ECharts se re-renderiza con un `observeDeep`). En `onStoreDocument` proyectamos el Y.Map a las filas Prisma (`Row`, `CellValue`) para que filtros/ordenaciones server-side y las gráficas agregadas sigan consultando SQL. Escrituras concurrentes sobre la **misma celda** resuelven por last-writer-wins (semántica de Y.Map), que es exactamente lo que hace Notion; celdas distintas nunca conflictúan.

## 5. Offline, reconexión y merge

- El provider (`@hocuspocus/provider`) se combina con **y-indexeddb**: cada página abierta persiste su Y.Doc localmente. Sin red, el usuario sigue editando; los updates se acumulan en IndexedDB.
- Al reconectar, el handshake `sync step 1/2` intercambia *state vectors* y solo viajan los deltas; el merge es **automático y sin conflictos** por construcción CRDT — no hay diálogos de "elige versión".
- UI: indicador de estado (`synced / connecting / offline`) escuchando `provider.on('status')`, como el "reconectando" de Notion.

**Límites reales en el NAS**:
- *Memoria*: cada Y.Doc abierto vive en RAM del servidor. Con `unloadDocument` tras el último cliente + debounce, un NAS con 4-8 GB soporta decenas de docs simultáneos sin problema (un doc típico son cientos de KB). Documentos con años de historial crecen: la compactación de §2 y `gc: true` en Yjs lo contienen.
- *Escalado*: con una sola instancia no hay problema; si algún día hay réplicas, Hocuspocus requiere **sticky sessions** en el reverse proxy (o la extensión Redis para fan-out entre instancias). Para uso familiar/personal: una instancia y punto.

## 6. Migración desde el guardado optimista actual, sin romper datos

Estrategia **lazy, por página, con doble escritura**:

1. **Flag por página**: `Page.collabMode: "json" | "crdt"` (default `json`). Nada cambia para páginas existentes.
2. **Conversión perezosa**: la primera vez que se abre una página en modo colaborativo, el servidor (endpoint tRPC `page.enableCollab`) construye el Y.Doc desde el JSON guardado — BlockNote permite `editor.blocksToYXmlFragment`-equivalente creando un editor headless con el JSON e inicializando el fragment — guarda el snapshot inicial y marca `collabMode = "crdt"`. Operación idempotente y transaccional: si falla, la página sigue en JSON.
3. **Doble escritura permanente** (no temporal): como el JSON se sigue proyectando en cada `onStoreDocument` (§2), cualquier rollback consiste en volver a poner `collabMode = "json"`; el JSON nunca está desactualizado más de unos segundos.
4. **El guardado optimista actual (mutaciones tRPC por bloque) queda deshabilitado en el editor** cuando `collabMode = "crdt"` — el transporte pasa a ser exclusivamente el WebSocket — pero se conserva para la API y automatizaciones: escrituras server-side se aplican *al Y.Doc* (cargarlo, mutar, persistir) en vez de a la tabla, para que la verdad no se bifurque.
5. **Backfill opcional**: un script nocturno convierte en lote las páginas restantes cuando la fase esté estabilizada.

Regla de oro de toda la fase: **una sola fuente de verdad por página** (el Y.Doc cuando `crdt`), y todo lo demás (JSON, SQL de celdas, índices de búsqueda) son proyecciones regenerables. Eso es lo que hace la migración reversible y el sistema depurable.

---

El directorio `notion-clone/` está vacío, así que diseño el subsistema desde cero alineado con el stack indicado (Next.js 16 + tRPC + Prisma 6 + Postgres + Redis + BlockNote + Auth.js).

# Comentarios, menciones y notificaciones — NOTIONO

## 1. Modelo de datos (Prisma)

```prisma
model CommentThread {
  id          String    @id @default(cuid())
  pageId      String
  page        Page      @relation(fields: [pageId], references: [id], onDelete: Cascade)
  // Anclaje
  blockId     String?               // id del bloque BlockNote (null => hilo a nivel de página)
  anchor      Json?                 // { type: "inline", markId, quotedText, from, to } | { type: "block" }
  orphaned    Boolean   @default(false) // el bloque/marca ya no existe
  // Estado
  resolved    Boolean   @default(false)
  resolvedBy  String?
  resolvedAt  DateTime?
  createdBy   String
  createdAt   DateTime  @default(now())
  comments    Comment[]

  @@index([pageId, resolved])
  @@index([blockId])
}

model Comment {
  id        String        @id @default(cuid())
  threadId  String
  thread    CommentThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  authorId  String
  author    User          @relation(fields: [authorId], references: [id])
  body      Json          // rich text BlockNote (inline content con menciones)
  bodyText  String        // texto plano para búsqueda/preview
  createdAt DateTime      @default(now())
  editedAt  DateTime?
  deletedAt DateTime?     // soft delete ("Comentario eliminado")
  reactions Reaction[]
  mentions  Mention[]

  @@index([threadId, createdAt])
}

model Reaction {
  id        String  @id @default(cuid())
  commentId String
  comment   Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  userId    String
  emoji     String  // "👍", "❤️"...
  @@unique([commentId, userId, emoji])
}

model Mention {
  id         String      @id @default(cuid())
  kind       MentionKind
  // Origen: puede vivir en un comentario o en el cuerpo de una página
  commentId  String?
  comment    Comment?    @relation(fields: [commentId], references: [id], onDelete: Cascade)
  pageId     String?     // página donde aparece (para menciones en el doc)
  blockId    String?
  // Destino según kind
  targetUserId String?
  targetPageId String?
  dateValue    DateTime?
  remindAt     DateTime? // solo @fecha con recordatorio
  createdBy  String
  createdAt  DateTime @default(now())

  @@index([targetUserId])
  @@index([remindAt])
}

enum MentionKind { USER PAGE DATE }

model Notification {
  id        String           @id @default(cuid())
  userId    String           // receptor
  type      NotificationType
  actorId   String?          // quien la provocó
  pageId    String?
  threadId  String?
  commentId String?
  payload   Json             // preview, quotedText, título de página...
  groupKey  String?          // p.ej. "comment:<threadId>" para agregación
  readAt    DateTime?
  archivedAt DateTime?
  createdAt DateTime         @default(now())

  @@index([userId, readAt, createdAt(sort: Desc)])
  @@index([userId, groupKey])
}

enum NotificationType { MENTION COMMENT REPLY ASSIGNMENT REMINDER INVITATION RESOLVED }

model Reminder {
  id        String   @id @default(cuid())
  mentionId String   @unique
  userId    String
  fireAt    DateTime
  recurrence String? // RRULE opcional
  firedAt   DateTime?
  @@index([fireAt, firedAt])
}

model PushSubscription {
  id       String @id @default(cuid())
  userId   String
  endpoint String @unique
  keys     Json   // { p256dh, auth } Web Push
}

model NotificationPreference {
  userId  String @id
  inApp   Boolean @default(true)
  email   Boolean @default(true)
  push    Boolean @default(true)
  whatsapp Boolean @default(false) // vía Dobby/OpenClaw
  emailDigestMins Int @default(480) // agrupación de email
}
```

## 2. Anclaje y supervivencia a ediciones

Clave del diseño: **el ancla vive dentro del documento, no solo en la BD**.

- **Comentario de bloque**: `blockId` referencia el `id` estable que BlockNote asigna a cada bloque. Sobrevive a cualquier edición del texto; solo muere si se borra el bloque.
- **Comentario inline**: al crear el hilo, insertamos en el contenido inline una **marca persistente** (custom inline style/mark de BlockNote): `{ styles: { commentMark: "thr_abc123" } }` sobre el rango seleccionado. Como la marca viaja con el texto en el CRDT/documento, el subrayado amarillo se mueve con las ediciones igual que en Notion. En `anchor` guardamos redundancia defensiva: `{ markId, quotedText, from, to }`.
- **Reconciliación**: al guardar una página, un paso post-save recorre el doc y compara marcas presentes vs. hilos abiertos. Si la marca de un hilo desapareció (texto borrado), se marca `orphaned=true`; el hilo no se pierde: se muestra en el panel lateral con el `quotedText` original en gris, como hace Notion. Resolver un hilo elimina la marca del doc (o la atenúa), reabrirlo la reinserta si es posible mediante búsqueda difusa de `quotedText`.

## 3. Menciones: parseo y almacenamiento

En el editor, `@` abre un menú de sugerencias (BlockNote `SuggestionMenu`) con tres secciones: personas, páginas, fechas. Al confirmar, se inserta **inline content custom**, no texto plano:

```json
{ "type": "mention", "props": { "kind": "user", "userId": "u_42", "fallbackText": "@Maite" } }
{ "type": "mention", "props": { "kind": "page", "pageId": "pg_7" } }
{ "type": "mention", "props": { "kind": "date", "iso": "2026-09-01", "remind": "P0DT9H" } }
```

Nunca se parsea con regex el texto guardado: la fuente de verdad es el nodo estructurado. En el hook de guardado (tRPC `page.update` / `comment.create`) se hace un **diff de menciones**: se extraen los nodos `mention` del JSON, se sincronizan con la tabla `Mention` (crear nuevas, borrar retiradas) y solo las **nuevas** generan notificación (evita re-notificar en cada edición). La mención a página crea además un backlink; la de usuario renderiza avatar+nombre resueltos en vivo (si el usuario cambia de nombre, se actualiza); la de fecha con `remind` crea un `Reminder`.

## 4. Inbox de notificaciones

**Fan-out en escritura**: un evento de dominio (`comment.created`, `mention.created`, `page.assigned`, `reminder.fired`, `invite.sent`) se publica en una cola BullMQ (`Redis`). El worker `notify` calcula receptores:

- Comentario nuevo → participantes del hilo + suscritos a la página (autor, quien la editó) menos el actor.
- Mención → el mencionado.
- Resolver hilo → autor del hilo.

**Agregación** estilo Notion via `groupKey`: "3 comentarios nuevos de Pablo en *Presupuesto boda*" es una fila lógica en la UI. El router tRPC `inbox.list` agrupa por `groupKey` con `DISTINCT ON` y devuelve el último item + contador. `inbox.markRead` acepta ids o un `groupKey` completo; `inbox.unreadCount` alimenta el badge (cacheado en Redis, invalidado por el worker).

**Entrega multicanal** (worker respeta `NotificationPreference`):
1. **In-app**: insert en `Notification` + `PUBLISH notify:user:<id>`.
2. **Web Push**: `web-push` con VAPID a cada `PushSubscription`; limpiar endpoints 410.
3. **Email**: no inmediato — job retardado `emailDigestMins`; si al dispararse sigue sin leer, se envía digest (como Notion, que solo emailea lo no visto).
4. **WhatsApp vía Dobby/OpenClaw**: el worker hace POST al webhook del Gateway de OpenClaw (`/hooks/notify` con token) con `{userPhone, text}`; Dobby lo entrega por WhatsApp. Ideal para `REMINDER` y `MENTION` de alta prioridad. Mapeo user→teléfono en el perfil.

## 5. Recordatorios (@remind)

`Reminder` es la tabla-fuente; el motor es un **scheduler de barrido + cola**:

- Cron cada minuto (BullMQ repeatable job): `SELECT * FROM Reminder WHERE fireAt <= now() AND firedAt IS NULL FOR UPDATE SKIP LOCKED` → encola `reminder.fired` por fila y marca `firedAt`. `SKIP LOCKED` permite múltiples workers sin duplicados.
- Recurrencia: si hay `recurrence` (RRULE), tras disparar se calcula la siguiente ocurrencia y se reprograma en lugar de cerrar.
- Editar la fecha en el doc actualiza `Mention.remindAt` y el `Reminder` (upsert por `mentionId`); borrar la mención cancela el recordatorio (cascade lógico en el diff de menciones).

## 6. Tiempo real

- Canales Redis pub/sub: `page:<id>:comments` (hilos/reacciones de la página abierta) y `notify:user:<id>` (inbox global).
- El servidor WS (mismo proceso que ya usa la colaboración, o `tRPC subscription` sobre WS) se suscribe con un cliente Redis dedicado y reenvía eventos tipados: `thread.created`, `comment.added`, `comment.reacted`, `thread.resolved`, `inbox.new`.
- El cliente usa `useSubscription` + caché de TanStack Query: los eventos hacen `setQueryData` optimista (no refetch completo); el badge del inbox sube en caliente. Reconexión → refetch de `inbox.unreadCount` y del hilo activo como resincronización.
- Los propios comentarios se escriben por tRPC mutation (no por WS), garantizando que la BD es siempre la fuente de verdad y el WS solo es difusión.

**Resumen**: marcas persistentes en el doc para anclaje inline resistente a ediciones, menciones como nodos estructurados con diff en guardado, inbox con fan-out por cola BullMQ y agregación por `groupKey`, recordatorios con barrido `SKIP LOCKED`, y difusión en tiempo real por Redis pub/sub, con puente webhook a Dobby/OpenClaw para WhatsApp.

---

Tengo el contexto del documento maestro (modelo `Page` con materialized path, guards tRPC existentes, Auth.js JWT). Aquí va la sección completa.

---

# Compartición, permisos granulares y publicación web

> Sustituye al modelo básico owner/editor/viewer de la sección de auth. Objetivo: paridad con Notion en compartición: permisos por página heredables, grupos, invitados, enlaces con caducidad y "Publish to web", sin comprometer un NAS expuesto a internet.

## 1. Modelo de datos

Cuatro niveles de acceso (como Notion): `FULL_ACCESS` (gestiona compartición) > `EDIT` > `COMMENT` > `VIEW`. Los permisos se declaran sobre páginas y **heredan hacia abajo por el árbol**; una subpágina puede tener *overrides* que amplían o restringen.

```prisma
enum Access { FULL_ACCESS EDIT COMMENT VIEW NONE } // NONE = override de revocación

model Teamspace {          // "espacios": Jose, Familia, Casa…
  id          String  @id @default(cuid())
  workspaceId String
  name        String
  isDefault   Boolean @default(false)   // todos los miembros entran al default
  members     TeamspaceMember[]
  pages       Page[]
}
model TeamspaceMember {
  teamspaceId String
  userId      String
  role        Access   // acceso base a TODO el teamspace
  @@id([teamspaceId, userId])
}

model Guest {              // invitado: usuario real SIN Membership de workspace
  userId      String  @id  // mismo modelo User; se distingue por ausencia de Membership
  invitedById String
  createdAt   DateTime @default(now())
}

model PagePermission {     // override por página, usuario O teamspace
  id          String  @id @default(cuid())
  pageId      String
  userId      String?      // exactamente uno de los dos
  teamspaceId String?
  access      Access
  @@unique([pageId, userId])
  @@unique([pageId, teamspaceId])
  @@index([userId])
}

model ShareLink {
  id         String   @id @default(cuid())
  pageId     String
  tokenHash  String   @unique      // SHA-256; el token solo viaja en la URL
  access     Access   @default(VIEW) // VIEW o COMMENT; nunca EDIT anónimo
  expiresAt  DateTime?
  maxUses    Int?
  useCount   Int      @default(0)
  createdById String
  revokedAt  DateTime?
}

model PublicPage {
  pageId       String  @id
  slug         String  @unique      // /pub/[slug]
  allowIndexing Boolean @default(false)
  includeChildren Boolean @default(true)
  publishedById String
  publishedAt  DateTime @default(now())
}

model AccessLog {
  id        String   @id @default(cuid())
  at        DateTime @default(now())
  userId    String?            // null = anónimo (link/público)
  pageId    String
  action    String             // "view" | "edit" | "share.grant" | "link.use" | "publish"…
  via       String             // "member" | "teamspace" | "share" | "link:<id>" | "public"
  ip        String?
  @@index([pageId, at])
}
```

## 2. Resolución eficiente de permisos (materialized path)

`Page.path` ya existe (`"root.abc.def"`). El acceso efectivo de un usuario sobre una página es:

1. **Overrides de página** (usuario directo, luego teamspace) sobre la página o el **ancestro más cercano** — el más profundo gana, y `NONE` corta la herencia (así restringes una subpágina dentro de un árbol compartido).
2. Si no hay override: **rol de teamspace** de la página.
3. Si no: rol de workspace (`Membership`), donde OWNER ⇒ `FULL_ACCESS`.
4. Invitados (sin Membership): solo llegan por 1.

Una sola query trae todos los overrides relevantes del linaje:

```ts
async function effectiveAccess(userId: string, page: Page): Promise<Access> {
  const ids = [page.id, ...ancestorIds(page.path)];           // linaje completo
  const teamIds = await memberTeamspaceIds(userId);            // cacheado en Redis 60s
  const perms = await prisma.pagePermission.findMany({
    where: { pageId: { in: ids },
      OR: [{ userId }, { teamspaceId: { in: teamIds } }] },
  });
  // ordena por profundidad del pageId en `ids` (más cercano primero); usuario > teamspace a igual profundidad
  const nearest = pickNearest(perms, ids);
  if (nearest) return nearest.access;                          // puede ser NONE
  if (page.teamspaceId && teamIds.includes(page.teamspaceId))
    return teamspaceRole(userId, page.teamspaceId);
  return workspaceFallback(userId, page.workspaceId);          // OWNER→FULL_ACCESS…
}
```

Coste: 2-3 queries indexadas por request (linaje viene gratis del path; `IN` sobre ≤10 ids). Con 4 usuarios no hace falta closure table; si el árbol pasara de ~8 niveles o miles de shares, se migra a closure table sin tocar la API (la función `effectiveAccess` es el único punto de resolución). **Regla de oro: nadie consulta `PagePermission` directamente; todo pasa por el guard.**

```ts
const pageProcedure = (need: Access) =>
  protectedProcedure.input(z.object({ pageId: z.string().cuid() }))
    .use(async ({ ctx, input, next }) => {
      const page = await pageRepo.byId(input.pageId);
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      const acc = await effectiveAccess(ctx.userId, page);
      if (rank(acc) < rank(need)) throw new TRPCError({ code: "NOT_FOUND" }); // no filtrar existencia
      audit(ctx, page.id, need === "VIEW" ? "view" : "edit", "member");
      return next({ ctx: { ...ctx, page, access: acc } });
    });
```

Gestionar compartición (`share.grant`, `share.revoke`, crear links, publicar) exige `FULL_ACCESS` sobre la página — nunca basta con EDIT, igual que en Notion.

## 3. Invitados

Un guest es un `User` normal **sin `Membership`**: se registra vía invitación por email (token de un solo uso, 7 días), y solo ve lo que `PagePermission` le concede explícitamente. En el sidebar, su workspace muestra únicamente "Compartido conmigo". Cierres necesarios: la búsqueda global y la API filtran por `effectiveAccess`; un guest no puede crear páginas raíz ni invitar a terceros; el owner ve la lista de guests por página y los revoca desde ahí (borra el `PagePermission`, el `User` queda inerte). Caso real: compartir "Presupuesto boda" con Maite sin que entre al resto.

## 4. Enlaces de compartición

URL `https://notiono.example.com/s/<token>` (token de 32 bytes, en BD solo el hash). El handler valida `revokedAt`, `expiresAt`, `maxUses`, incrementa `useCount` y registra en `AccessLog` con `via: "link:<id>"`. El acceso por link es **solo lectura o comentario**: si el visitante quiere editar, debe iniciar sesión y tener permiso real. La sesión de link se materializa como cookie firmada de corta vida (1h) ligada al `linkId`, para no rehacer la validación en cada asset. Rate-limit por IP en `/s/*` (Redis, 60/min) — es superficie anónima expuesta.

## 5. Publicar en la web

`PublicPage` activa render **SSR público** en `/pub/[slug]` (subárbol si `includeChildren`). Claves de seguridad:

- **Renderer separado**: `/pub` usa un serializador *read-only* que emite HTML desde los bloques con una **allowlist de tipos** (texto, listas, imágenes, tablas, gráficas como SVG estático). Nunca hidrata el editor ni llama a tRPC privado; los datos entran por `props` del RSC. Así es imposible filtrar campos privados por accidente: lo que no está en el serializador no existe.
- Menciones a usuarios, backlinks a páginas no públicas y propiedades marcadas privadas se **omiten en serialización**, no se ocultan con CSS.
- `robots.txt` y `<meta name="robots" content="noindex">` salvo `allowIndexing`.
- Adjuntos públicos se sirven por URLs firmadas re-mapeadas (`/pub/asset/<hash>`), jamás la ruta interna del NAS.
- **Cloudflare delante**: `/pub/*` con `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` y purge por API al editar/despublicar; el resto del sitio `no-store`. WAF + "Under Attack" disponible; el origen (Synology) solo acepta IPs de Cloudflare. Al despublicar: borrar `PublicPage` + purge inmediato de la zona del slug.

## 6. Teamspaces para la familia

Estructura mínima: **"Jose" (privado)**, **"Familia" (default)**, opcionalmente "Casa". Cada `Page` raíz pertenece a un teamspace; el rol de `TeamspaceMember` da el acceso base a todo el espacio y los `PagePermission` afinan (p. ej. Familia = `EDIT` general, pero "Finanzas" con override `NONE` para los niños). Crear/archivar teamspaces y gestionar miembros: solo OWNER del workspace. El sidebar se agrupa por teamspace, como Notion.

## 7. Auditoría

`AccessLog` es *append-only* (sin endpoint de borrado; retención 12 meses vía cron mensual). Se registran: vistas y ediciones de página, cada uso de share link (con IP), cada grant/revoke de permiso y cada publish/unpublish. UI: pestaña "Actividad" por página (quién y cuándo, agrupado por día) y vista global para el OWNER filtrable por `via` — la pregunta que responde es "¿quién ha visto esto y por dónde entró?". Los eventos de compartición se escriben **en la misma transacción** que el cambio de permiso: un grant sin log no puede existir.

**Orden de implementación** (dentro de la Fase 4): teamspaces + `PagePermission` con herencia → guests → share links → auditoría → publicación web al final, tras revisar el hardening de Cloudflare, porque es la única pieza que abre contenido anónimo al exterior.

---

**Nota de integración:** esta sección amplía la sección 8 del documento (`/home/node/.openclaw/workspace/notion-clone/PLANTEAMIENTO.md`): sustituye `PageShare` y el enum `Role` de 3 niveles por `PagePermission` + `Access` de 4 niveles, reutiliza `Page.path` (materialized path, línea ~1156) y el patrón de guards existente (`protectedProcedure`, `assertPageAccess`). También revierte el "❌ Compartir público / web publishing" de la tabla de alcance (línea ~72), que ahora pasa a estar cubierto con las salvaguardas del punto 5. Extensión: ~1150 palabras.

---

# Vistas avanzadas de base de datos

Todas las vistas comparten el mismo pipeline: `View.config` (JSON validado con Zod por `ViewType`) → compilador de filtros/sorts sobre JSONB (`Prisma.$queryRaw` con parámetros ligados) → payload agrupado por la query → componente React. Lo que cambia entre vistas es **qué campos son estructurales** (fecha, portada, grupo) y **cómo se agrupa en SQL**. `ViewType` se amplía: `TABLE | BOARD | CALENDAR | GALLERY | LIST | TIMELINE`.

## Calendario

```json
{ "type": "calendar", "config": {
  "dateField": "fecha",
  "endDateField": "fecha_fin",
  "cardFields": ["importe", "estado"],
  "colorBy": "categoria",
  "filters": { "op": "and", "conditions": [] }
}}
```

- **Query**: una sola consulta por rango visible (mes ± 1 semana). Un evento multi-día intersecta el rango si `inicio <= rangoFin AND coalesce(fin, inicio) >= rangoInicio`:

```sql
SELECT id, cells FROM "Record"
WHERE "collectionId" = $1 AND "deletedAt" IS NULL
  AND (cells->>'fecha') <= $3
  AND coalesce(cells->>'fecha_fin', cells->>'fecha') >= $2;
```

- **Render**: grid CSS de 7 columnas; los eventos multi-día se pintan como barras que abarcan `gridColumn: start / span n`, con *lane assignment* greedy por fila para que no se solapen (mismo algoritmo que Google Calendar simplificado). Máx. 3 barras por celda + "+N más" (popover).
- **Drag**: soltar en otro día = `records.update` con `{ fecha: nuevaFecha, fecha_fin: nuevaFecha + duraciónOriginal }` (se preserva la duración). Optimista con rollback. Arrastrar el borde derecho de la barra edita solo `fecha_fin`.
- Si `endDateField` es `null`, todo evento es de un día y el render degrada a chips simples.

## Galería

```json
{ "type": "gallery", "config": {
  "coverField": "foto",
  "coverFit": "cover",
  "cardSize": "medium",
  "cardFields": ["nombre", "importe", "tags"],
  "sorts": [{ "field": "createdAt", "dir": "desc" }]
}}
```

- `coverField` apunta a un campo `FILE` (o `URL` de imagen); la celda guarda `{ fileId, thumbUrl }` — el **thumbnail se genera al subir** (sharp, 480px webp) y se sirve estático; la galería nunca carga originales.
- Sin portada: fallback a un degradado determinista por `record.id` (hash → hue), como Notion.
- Render: CSS grid `repeat(auto-fill, minmax(Npx, 1fr))` según `cardSize` (`small` 180 / `medium` 260 / `large` 360). Paginación infinita por cursor, misma que tabla.
- Click en tarjeta abre el registro en *peek* lateral (componente compartido con todas las vistas).

## Lista

Subconjunto de tabla, sin coste nuevo de backend: mismo compilador, `config.columns` limitado.

```json
{ "type": "list", "config": {
  "titleField": "concepto",
  "metaFields": ["fecha", "importe"],
  "filters": {}, "sorts": []
}}
```

Render: filas de una línea (título a la izquierda, metadatos alineados a la derecha en gris), sin edición inline salvo checkbox; ideal embebida en páginas (`{databaseId, viewId}` de Fase 3).

## Timeline (Gantt)

```json
{ "type": "timeline", "config": {
  "startField": "inicio", "endField": "fin",
  "zoom": "week",
  "groupBy": "proyecto",
  "showDependencies": true,
  "showTable": ["concepto", "estado"]
}}
```

- **Render**: dos paneles con scroll vertical sincronizado — mini-tabla fija a la izquierda (`showTable`) y lienzo de barras a la derecha. El eje temporal es una transformación lineal `x = (fecha − epoch) * pxPorDía`; virtualización vertical con `@tanstack/react-virtual` (mismas filas que la tabla). Las flechas de dependencia se pintan en un `<svg>` overlay con paths ortogonales (fin de A → inicio de B).
- **Drag**: cuerpo de barra = mover ambas fechas; asas izquierda/derecha = editar `inicio`/`fin` por separado. Snap al día (o a la semana en zoom `month`). Todo es un solo `records.update`.
- **Query**: idéntica al calendario (intersección de rango) + `GROUP BY` opcional para carriles por `groupBy`.

### Dependencias

Las dependencias son relaciones tipadas dentro de la misma colección — tabla propia, no JSONB, porque necesitamos integridad e inversas baratas:

```prisma
model RecordLink {
  id       String @id @default(cuid())
  fromId   String   // bloqueante
  toId     String   // bloqueado
  type     LinkType // BLOCKS | PARENT
  from     Record @relation("out", fields: [fromId], references: [id], onDelete: Cascade)
  to       Record @relation("in",  fields: [toId],  references: [id], onDelete: Cascade)
  @@unique([fromId, toId, type])
  @@index([toId, type])
}
enum LinkType { BLOCKS PARENT }
```

Al crear un link `BLOCKS` se rechazan ciclos con un CTE recursivo (`WITH RECURSIVE` desde `toId`; si alcanza `fromId` → 400). Al arrastrar una tarea, opción "empujar dependientes": si `inicio(B) < fin(A)` tras el drag, se desplaza B en cascada (misma CTE, actualización en transacción, límite de profundidad 20).

## Sub-items (jerarquía)

Mismo mecanismo: `RecordLink` con `type: PARENT` (un solo padre por registro — se garantiza con `@@unique([toId, type])` parcial vía migración SQL). En tabla y lista, `config.subItems: true` activa el render en árbol: la query trae todos los registros del filtro y el cliente ensambla el árbol (con <100k filas por colección es trivial); los hijos cuya raíz no pasa el filtro se muestran aplanados. Colapso/expansión se persiste en `localStorage`, no en la vista (es estado de sesión, no configuración). Los rollups de la Fase 2 funcionan sobre `PARENT` igual que sobre `RELATION`: "3/5 subtareas hechas" es `count` filtrado sobre hijos.

## Tablero avanzado

```json
{ "type": "board", "config": {
  "groupBy": "estado",
  "subGroupBy": "responsable",
  "columnOrder": ["opt_todo", "opt_doing", "opt_done"],
  "hiddenGroups": ["opt_archivado"],
  "wipLimits": { "opt_doing": 3 },
  "colorColumns": true
}}
```

- **Columnas por cualquier campo discreto**: `select` (opciones), `persona` (miembros del workspace), o **fecha bucketizada** (`groupBy: { field: "fecha", bucket: "week" }` → columnas "Esta semana", "Próxima", "Sin fecha"). El compilador emite la expresión de grupo adecuada: `cells->>'estado'`, `cells->>'responsable'`, o `date_trunc('week', (cells->>'fecha')::date)::text`.
- **Sub-agrupación**: filas horizontales dentro del tablero (swimlanes). Una sola query con doble clave:

```sql
SELECT cells->>'responsable' AS lane,
       cells->>'estado'      AS col,
       jsonb_agg(jsonb_build_object('id', id, 'cells', cells)
                 ORDER BY cells->>'_rank') AS records
FROM "Record"
WHERE "collectionId" = $1 AND "deletedAt" IS NULL
GROUP BY 1, 2;
```

El cliente pivota `(lane, col) → celda del grid`. Drag entre celdas actualiza **dos campos** en un solo patch (`{ estado, responsable }`) más `_rank` fractional.
- **WIP**: puramente visual + confirmación. Si `count(columna) >= wipLimits[col]`, la cabecera se pinta en rojo y el drop pide confirmar (no se bloquea en servidor: es una guía, no una regla de integridad).
- "Agrupar por / sub-agrupar" es la misma pareja `groupBy`/`subGroupBy` reutilizada en tabla (grupos colapsables con agregados por grupo: `sum(importe)` en la cabecera, calculado en la misma query con `GROUPING SETS`).

## Vistas guardadas y linked databases

Cada `View` **es** una vista guardada: filtros, sorts, agrupación y layout persisten en su fila; la barra de la base de datos es un tab-strip ordenado por `View.order`, con "+ Añadir vista" (duplica el config de la actual como punto de partida). Los cambios de config se guardan con debounce de 800 ms vía `views.update`; un cambio "sucio" sin guardar (filtro temporal) vive en estado de URL (`?f=...`) hasta que el usuario pulsa "Guardar en la vista".

**Linked databases**: el bloque embebido de Fase 3 guarda `{ collectionId, viewId }` — la colección es única (una sola fuente de Records), pero cada página puede embeberla con **una View distinta**: la página "Fiscal" embebe la colección Movimientos con filtro `deducible = true` en tabla, y el dashboard la embebe como calendario. Crear un embed ofrece "usar vista existente" o "crear vista nueva para este bloque" (una View más en la misma colección, marcada `inline: true` para no saturar el tab-strip de la base original). Borrar el bloque no borra la View inline hasta la purga de papelera, de modo que deshacer el borrado la recupera.

**Coste marginal real**: calendario, galería y lista reutilizan el 90% del motor (compilador + peek + paginación). Lo único genuinamente nuevo de esta sección es `RecordLink` (una tabla, dos tipos de arista) y el lienzo del timeline — que es donde hay que presupuestar el tiempo de UI.

---

He revisado el planteamiento existente (`/home/node/.openclaw/workspace/notion-clone/PLANTEAMIENTO.md`: esquema Prisma con Collection/Field/Record+cells JSONB, `RecordLink`, evaluador Pratt de ~15 funciones, rollups sum/count/avg). La sección nueva extiende eso hasta paridad total sin contradecirlo. Aquí está:

---

# Propiedades avanzadas y motor de fórmulas (paridad Notion)

## 1. Relaciones bidireccionales (two-way relations)

En Notion una relación puede ser unidireccional o mostrar una propiedad sincronizada en la colección destino. En Notiono la verdad vive en un solo sitio — la tabla puente `RecordLink` — y la "bidireccionalidad" es metadato de presentación, lo que elimina por diseño los bugs de desincronización:

```prisma
model Field {
  // ...campos existentes
  pairedFieldId String? @unique // si es RELATION two-way: el Field espejo en la colección destino
}
```

`config` de una relation pasa a: `{ targetCollectionId, many: bool, twoWay: bool, pairedFieldId? }`. Al activar two-way, `fields.update` crea en transacción el Field espejo en la colección destino (`type: RELATION`, `targetCollectionId` apuntando de vuelta, `pairedFieldId` cruzados). **Sincronización**: escribir la celda A→B inserta/borra filas en `RecordLink` y hace *fan-out* del patch a las celdas espejo (`cells[pairedKey]` de los records destino) en la misma transacción — el diff de ids entrantes/salientes se calcula contra `RecordLink`, nunca contra la celda, así una celda corrupta no propaga basura. Borrar un record limpia sus links y las celdas espejo con un `UPDATE ... SET cells = jsonb_set(...)` por el índice inverso `@@index([toRecordId, fieldId])`. Borrar uno de los dos Fields degrada el otro a unidireccional (`pairedFieldId = null`), como hace Notion.

## 2. Rollups completos

`config`: `{ relationFieldKey, targetFieldKey, agg, dateFormat? }`. Paridad total de agregaciones, agrupadas por lo que devuelven:

| Grupo | `agg` | Semántica |
|---|---|---|
| Originales | `show_original`, `show_unique` | lista de valores (unique deduplica) — esto es también el **Lookup**, ver abajo |
| Recuento | `count_all`, `count_values`, `count_unique`, `count_empty`, `count_not_empty` | sobre celdas del campo destino |
| Porcentaje | `percent_empty`, `percent_not_empty`, `percent_checked`, `percent_unchecked`, `percent_per_group` | checked/unchecked solo si el destino es checkbox |
| Numéricas | `sum`, `avg`, `median`, `min`, `max`, `range` | range = max − min |
| Fechas | `earliest`, `latest`, `date_range` | destino date; `date_range` devuelve `{start,end}` renderizado según `dateFormat` |
| Booleanas | `checked`, `unchecked` | recuento de checkbox |

Implementación: `rollup(field, record)` resuelve ids vía `RecordLink`, carga las celdas destino en un solo `WHERE id = ANY($ids)` y agrega en TypeScript (median y percent no son componibles en SQL incremental y los conjuntos son pequeños). El valor se **materializa en `cells`** como ya decidió el planteamiento base, así `compileFilter` ordena/filtra rollups gratis. La invalidación reutiliza el índice inverso: escribir el record X dispara recálculo de los rollups de todos los records que llegan a X por `RecordLink` (síncrono <100 afectados, job en cola si más). Rollup sobre rollup se permite con el mismo grafo de dependencias de fórmulas (cross-colección: el grafo pasa a ser por workspace, no por colección).

## 3. Lookup

No es un tipo nuevo: es un rollup con `agg: "show_original"` y azúcar en la UI ("traer campo de la relación"). La celda materializada guarda `valor[]`; con `many: false` el render muestra el escalar. Esto replica exactamente el comportamiento de Notion, donde lookup y rollup comparten motor.

## 4. Propiedades del sistema y nuevos tipos

Ampliación del enum: `PERSON FILE_MEDIA STATUS EMAIL PHONE PLACE BUTTON AUTO_ID CREATED_TIME CREATED_BY LAST_EDITED_TIME LAST_EDITED_BY FORMULA ROLLUP`.

- **created/last edited time/by**: *virtuales* — no viven en `cells`; el resolver los proyecta desde `Record.createdAt/updatedAt` y dos columnas nuevas `createdById/lastEditedById String?` (null = Dobby, igual que en `Version.authorId`). Cero coste de escritura, y `compileFilter` los mapea a columnas reales en vez de a `cells->>`.
- **AUTO_ID**: `config: { prefix?: string }`. Columna real `seq Int` en Record asignada con una secuencia Postgres **por colección** (`CREATE SEQUENCE record_seq_<collectionId>`), asignada en el INSERT — inmutable, sin huecos rellenados, render `"${prefix}-${seq}"`. Nunca en `cells`: a prueba de ediciones.
- **PERSON**: celda `string[]` de `User.id`, validada contra `Member` del workspace. Render con avatar; es el tipo que alimenta filtros "Mis tareas" (`{person} contiene currentUser`).
- **FILE_MEDIA**: celda `[{ id, name, url, mimeType, size }]`; los bytes van al almacén de adjuntos ya previsto para páginas, la celda solo referencia.
- **STATUS**: select con grupos: `config: { groups: [{ id, name: "to-do"|"in-progress"|"done", optionIds: [...] }], options: [...] }`. Los tres grupos son fijos (paridad Notion); el kanban puede agrupar por opción o por grupo, y las fórmulas exponen el grupo vía `propGroup("Estado")`.
- **EMAIL/PHONE/PLACE**: `string` con validación Zod (`z.string().email()`, E.164 laxo, y `{ name, lat?, lng? }` para place con geocoding opcional vía Nominatim). URL ya existe.
- **BUTTON**: no almacena celda; `config: { actions: Action[] }` con `Action = { kind: "createRecord", collectionId, cellsTemplate } | { kind: "updateProps", patchTemplate } | { kind: "openUrl", urlTemplate }`. Los templates admiten `{campo}` resueltos con el mismo parser de fórmulas (reutilización directa). Se ejecuta server-side en un procedure `buttons.run` con los permisos del usuario que pulsa — nunca del creador del botón — y las mutaciones pasan por los mismos validadores de celda.

## 5. Motor de fórmulas — paridad Notion 2.0

Se conserva el pipeline seguro ya decidido (tokenizer → parser Pratt → intérprete AST, **jamás `eval`**), ampliando gramática y runtime:

**Tipos**: `number | string | boolean | date | person | list<T>`, con `null` propagable. El type-checker corre al **guardar** el campo (inferencia bottom-up sobre el AST contra los tipos de los Fields referenciados); error de tipos = no se guarda, nunca revienta en runtime. `resultType` se infiere, ya no lo declara el usuario.

**Gramática ampliada** (delta sobre la base):

```
cmp     := add (("=="|"!="|">"|"<"|">="|"<=") add)?
add     := mul (("+"|"-") mul)*            // "+" concatena strings, como Notion
unary   := ("-"|"not") unary | postfix
postfix := primary ("." fn "(" args ")")*   // estilo método: prop("Tags").map(...)
primary := NUMBER|STRING|"true"|"false"|LAMBDA_VAR|fn"("args")"|"("expr")"|"["args"]"
lambda  := expr                              // en map/filter/…; "current" e "index" ligados
ternario: cond ? a : b (azúcar de if)
```

**Catálogo (~50 funciones)**, mismo nombre y firma que Notion:

- *Lógica*: `if, ifs, and, or, not, empty, ifEmpty, equal, unequal`
- *Números*: `add, subtract, multiply, divide, mod, pow, abs, round, ceil, floor, sqrt, cbrt, exp, ln, log10, log2, max, min, sum, mean, median, toNumber, sign, pi, e`
- *Texto*: `concat, format, join, slice/substring, length, contains, test, match, replace, replaceAll, split, lower, upper, trim, padStart, padEnd, repeat, link, style/unstyle`
- *Fechas*: `now, today, date, year, month, week, day, hour, minute, dateAdd, dateSubtract, dateBetween, dateRange, dateStart, dateEnd, formatDate, parseDate, fromTimestamp, timestamp` — `dateBetween/dateAdd` con unidades `"years"…"milliseconds"`; `formatDate` con tokens Luxon (lib ya sin dependencias pesadas)
- *Listas* (lambdas): `map, filter, find, findIndex, some, every, sort, reverse, unique, flat, includes, at, first, last, concat, count` — dentro de la lambda, `current` e `index` son variables ligadas del intérprete (un scope-frame en el evaluador, sin closures JS del usuario)
- *Contexto*: `prop("Nombre")`, `props relacionales` (`prop("Cliente")` sobre relation devuelve `list<record>` y permite `.map(current.prop("Nombre"))`, la joya de Fórmulas 2.0), `id()`, `createdTime()`, `createdBy()`, `lastEditedTime()`, `lastEditedBy()`, `name/email` sobre person

**`prop()` sobre relaciones y rollups**: al compilar, las referencias se clasifican en locales (celda propia), rollup (celda materializada) o *relacionales* (requieren fetch de records destino). El evaluador recibe un `EvalContext { cells, fieldMap, resolveRelated(fieldKey): Cell[][] }` con carga perezosa y memoizada por batch — recalcular 500 fórmulas de una colección hace como mucho un query por relación referenciada.

**Recalculo por grafo**: se mantiene el diseño base (grafo de dependencias, orden topológico, ciclos rechazados al guardar) con dos extensiones: (1) el grafo es por **workspace** e incluye aristas fórmula→campo, rollup→relación y fórmula→rollup, persistido en una tabla `FieldDep { fromFieldId, toFieldId }` para invalidación sin recompilar expresiones; (2) editar una **fórmula** o un Field referenciado dispara recálculo masivo en background por lotes de 500 records con progreso en UI. Límites: 200 nodos AST, profundidad 12, 10.000 iteraciones de lambda por evaluación, timeout 50 ms/celda — cualquier exceso deja la celda en `{ error: "..." }` que la UI pinta como en Notion.

**Orden de implementación**: sistema virtuales + AUTO_ID + STATUS + EMAIL/PHONE (baratos, fase 2.0) → two-way + rollups completos + lookup (2.1) → fórmulas 2.0 con listas y lambdas (2.2) → BUTTON y PLACE (2.3).

---

Puntos clave del diseño: `RecordLink` como única verdad de las relaciones (two-way sin desincronización posible), lookup = rollup `show_original` (un motor, dos UIs), propiedades de sistema proyectadas desde columnas reales (no JSONB), botones ejecutados server-side con permisos del pulsador, y fórmulas con type-check en guardado + `current/index` como variables ligadas del intérprete (sin closures de usuario). Todo materializa en `cells`, así el compilador SQL de filtros existente cubre fórmulas y rollups sin casos especiales.

---

# Subsistema de Plantillas — NOTIONO

## 1. Visión general

El subsistema de plantillas cubre cuatro capacidades: plantillas de página, plantillas de base de datos (por colección, con default), plantillas recurrentes (cron) y variables dinámicas. Todo se apoya en un único modelo `Template` que guarda un **snapshot serializado** de la estructura (bloques BlockNote + propiedades + subpáginas), y un **motor de instanciación** común que resuelve variables y materializa el árbol.

Principio clave: una plantilla **no referencia** páginas vivas; almacena una copia congelada (JSON) en el momento de guardarla. Así editar la página original no rompe la plantilla, igual que en Notion.

## 2. Esquema Prisma

```prisma
enum TemplateKind {
  PAGE        // plantilla de página suelta
  DB_ROW      // plantilla de registro de una colección
}

enum RecurrenceFreq {
  DAILY
  WEEKLY
  MONTHLY
}

model Template {
  id           String        @id @default(cuid())
  workspaceId  String
  workspace    Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  kind         TemplateKind
  name         String
  icon         String?
  description  String?

  // Solo para DB_ROW: colección a la que pertenece
  collectionId String?
  collection   Collection?   @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  isDefault    Boolean       @default(false)   // plantilla por defecto del botón "Nueva"
  sortOrder    Int           @default(0)

  // Galería
  isBuiltIn    Boolean       @default(false)   // factura, CRM, etc. (seed)
  category     String?                          // "finanzas", "crm", "productividad"

  // Snapshot congelado de la estructura (ver §3)
  content      Json

  recurrence   TemplateRecurrence?
  createdById  String
  createdBy    User          @relation(fields: [createdById], references: [id])
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([collectionId, isDefault])
  @@index([workspaceId, kind, category])
}

model TemplateRecurrence {
  id           String         @id @default(cuid())
  templateId   String         @unique
  template     Template       @relation(fields: [templateId], references: [id], onDelete: Cascade)
  freq         RecurrenceFreq
  interval     Int            @default(1)      // cada N días/semanas/meses
  byWeekday    Int[]                            // [1,3,5] = L,X,V (WEEKLY)
  byMonthDay   Int?                             // 1..31, -1 = último día (MONTHLY)
  timeOfDay    String         @default("08:00")
  timezone     String         @default("Europe/Madrid")
  // destino: colección (crea fila) o página padre (crea subpágina)
  targetCollectionId String?
  targetPageId       String?
  enabled      Boolean        @default(true)
  nextRunAt    DateTime                         // precalculado, indexado para el poller
  lastRunAt    DateTime?

  @@index([enabled, nextRunAt])
}

model TemplateInstantiation {
  id          String   @id @default(cuid())
  templateId  String
  pageId      String                            // página/registro creado
  source      String                            // "manual" | "recurrence" | "api"
  createdAt   DateTime @default(now())
  @@index([templateId, createdAt])
}
```

`TemplateInstantiation` da idempotencia al cron (¿ya se creó la de hoy?) y auditoría ("creado desde plantilla X").

## 3. Formato del snapshot (`content`)

```jsonc
{
  "version": 1,
  "page": {
    "title": "Cierre mensual — {{date:MMMM yyyy}}",
    "icon": "📊",
    "properties": {                 // solo DB_ROW; keys = propertyId de la Collection
      "status": { "select": "Pendiente" },
      "responsable": { "person": "{{me}}" },
      "fecha": { "date": "{{date}}" }
    },
    "blocks": [ /* árbol BlockNote serializado */ ],
    "children": [ /* subpáginas anidadas, mismo shape recursivo */ ]
  }
}
```

Las subpáginas anidadas (`children`) permiten que una plantilla de registro cree su propia estructura interna (p. ej. la plantilla "Reunión" crea la fila + subpágina de actas con secciones).

## 4. Variables dinámicas

Sintaxis `{{var[:formato]}}`, resueltas **en el momento de instanciar** (server-side, nunca en cliente):

| Variable | Resuelve a |
|---|---|
| `{{date}}` / `{{date:dd/MM/yyyy}}` | fecha de instanciación (tz del workspace), formato via `date-fns` |
| `{{date+7d}}`, `{{date-1m}}` | offsets (d/w/m/y) — útil para "vencimiento" |
| `{{me}}` | usuario que instancia (id → mention/person property) |
| `{{me.name}}`, `{{me.email}}` | campos del usuario |
| `{{week}}`, `{{month}}`, `{{year}}` | número de semana ISO, nombre de mes, año |
| `{{seq}}` | contador por plantilla (facturas: `FAC-{{year}}-{{seq:0000}}`) |

Implementación: un walker recursivo sobre el JSON del snapshot que aplica un `resolveVars(node, ctx)` a strings de títulos, texto de bloques y valores de propiedades. Los tokens `@date`/`@me` del editor se serializan a esta sintaxis al guardar la plantilla. Para `{{seq}}` se usa `UPDATE ... RETURNING` sobre una fila de contador dentro de la misma transacción.

## 5. Flujo de instanciación

`instantiateTemplate(templateId, ctx, overrides)` — una transacción Prisma:

1. Cargar `Template.content`; validar permisos del actor sobre el destino.
2. Construir `ctx` (usuario, fecha en tz del workspace, colección destino).
3. Resolver variables sobre una copia del snapshot.
4. Aplicar `overrides` (merge superficial sobre `title`/`properties`).
5. Crear la `Page` raíz (y `Row` si `kind = DB_ROW`, validando propiedades contra el esquema actual de la Collection: propiedades desaparecidas se descartan con warning).
6. Recorrer `blocks` regenerando ids de bloque (nunca reutilizar los del snapshot) e insertar el documento BlockNote.
7. Recursión para `children`.
8. Registrar `TemplateInstantiation` y devolver `pageId`.

**Guardar como plantilla** es el flujo inverso: serializar página + subpáginas (límite de profundidad 5 / 500 bloques), convertir menciones de fecha/usuario en tokens si el usuario lo pide, y persistir el snapshot.

## 6. Plantillas de base de datos: UX del botón "Nueva"

- El botón "Nueva" de cada Collection tiene dropdown: lista de plantillas (`sortOrder`), "＋ Nueva plantilla" y menú por ítem (Set as default / Duplicar / Eliminar).
- `isDefault = true` (único por colección; se garantiza en el mutation con `updateMany({ isDefault: false })` previo dentro de la transacción): clic directo en "Nueva" instancia esa plantilla.
- Sin default: "Nueva" crea fila vacía; el dropdown sigue ofreciendo las plantillas.

tRPC router:

```ts
templates: {
  list:        query({ collectionId?, kind?, category? })
  get:         query({ id })
  create:      mutation({ kind, name, content, collectionId? })
  createFromPage: mutation({ pageId, kind, collectionId? })
  update / delete / setDefault / reorder
  instantiate: mutation({ id, overrides? })
  recurrence: { set: mutation({ templateId, rule }), remove, listRuns }
}
```

## 7. Plantillas recurrentes (motor cron)

Poller cada 60 s (worker Node aparte o `setInterval` en el server con advisory lock de Postgres para no duplicar en multi-instancia):

```sql
SELECT ... FROM "TemplateRecurrence"
WHERE enabled AND "nextRunAt" <= now()
FOR UPDATE SKIP LOCKED;
```

Por cada fila: instanciar con `ctx.user = createdBy` de la plantilla y `source = "recurrence"`, comprobando antes en `TemplateInstantiation` que no existe ya una instancia para ese `nextRunAt` (idempotencia ante reinicios). Después recalcular `nextRunAt` con la regla (freq/interval/byWeekday/byMonthDay en la tz configurada; `byMonthDay = -1` → último día del mes). Si el server estuvo caído, se ejecuta **una** instancia de recuperación y se salta al siguiente slot futuro (comportamiento Notion-like: no rellena huecos).

Ejemplo: "Daily standup" — `WEEKLY, byWeekday [1..5], 08:00 Europe/Madrid`, destino colección "Reuniones", título `Standup {{date:EEEE d MMM}}`.

## 8. Galería de plantillas

Vista "Plantillas" del workspace con dos pestañas: **Built-in** y **Mis plantillas**, filtrables por `category`. Las built-in se cargan con `prisma db seed` (`isBuiltIn: true`, workspace-agnósticas mediante un workspace `system`; al usarlas se clonan al workspace del usuario):

- **Factura** — fila DB con `{{seq}}`, `{{date}}`, `{{date+30d}}` (vencimiento), subpágina con tabla de líneas.
- **Cierre mensual** — página con checklist (conciliar, F-69, remesas) y título `Cierre {{month}} {{year}}`. Recurrencia mensual sugerida (`byMonthDay: -1`).
- **CRM** — colección completa (caso especial: `content` incluye definición de propiedades de la Collection) + plantillas de fila "Lead" y "Cliente".
- **Tareas** — fila con estado, prioridad, `{{me}}` como asignado.
- **Notas de reunión** — fila + subpágina con Asistentes / Agenda / Acuerdos / Acciones.

## 9. API HTTP para Dobby

Además de tRPC, endpoint REST autenticado por API key (scope `templates:instantiate`):

```
POST /api/templates/:id/instantiate
Authorization: Bearer nly_xxx
{
  "overrides": {
    "title": "Factura Muebles Pérez",
    "properties": { "cliente": "Muebles Pérez", "importe": 1250.5 }
  },
  "targetCollectionId": "col_facturas",   // opcional si la plantilla ya lo fija
  "actAsUserId": "usr_jim"                // para resolver {{me}}
}
→ 201 { "pageId": "pg_abc", "url": "/w/family/pg_abc", "resolved": { "seq": 47 } }
```

`GET /api/templates?collectionId=...` para descubrimiento. Rate limit por key y registro en `TemplateInstantiation.source = "api"`, de modo que Dobby pueda crear la factura mensual o el cierre desde un cron externo sin tocar la UI.

## 10. Casos límite

- **Esquema divergente**: propiedades del snapshot que ya no existen en la Collection → se ignoran y se devuelven en `warnings`.
- **Recursión**: prohibido que una plantilla contenga un bloque "instanciar plantilla" que apunte a sí misma (check en `create/update`).
- **Borrado de Collection** → cascade borra sus plantillas DB_ROW y recurrencias (FK con `onDelete: Cascade`).
- **Permisos**: instanciar exige permiso de escritura en el destino, no sobre la plantilla (las built-in son solo-lectura).

---

# Bloques avanzados y maquetación

## 1. Columnas / layout

BlockNote no soporta columnas de forma nativa en el core, pero existe el paquete oficial `@blocknote/xl-multi-column`, que es el punto de partida correcto: aporta los tipos `columnList` y `column` más el `dropCursor` de arrastre lateral. Si lo implementas tú, el modelo es un bloque contenedor de dos niveles:

```ts
// Esquema conceptual (ProseMirror)
columnList: { content: "column{2,}" }
column:     { content: "block+", attrs: { width: { default: 1 } } }
```

- `width` es un **peso relativo** (flex-grow), no píxeles: así el layout sobrevive a cambios de viewport. Notion hace lo mismo (ratios que suman 1).
- **Creación por arrastre**: intercepta el drop en `handleDrop`; si el cursor cae en el tercio lateral de un bloque, envuelve ambos en `columnList` con dos `column`. Si el destino ya es una columna, inserta una `column` hermana.
- **Colapso**: al vaciarse una columna, un plugin `appendTransaction` la elimina; si queda una sola, desenvuelve el `columnList` (invariante: nunca existe `columnList` con <2 columnas).
- **Serialización**: en JSON los `children` de cada `column` son bloques normales; en Markdown, degradar a secuencia lineal (columna 1, luego columna 2). Media query: en móvil, `flex-direction: column`.
- Prohíbe anidar `columnList` dentro de `column` (Notion tampoco lo permite): valídalo en el schema con `content: "block+"` excluyendo `columnList`, o normaliza en transacción.

## 2. Synced blocks

El bloque sincronizado es **referencia, no copia**. Dos entidades:

```sql
CREATE TABLE synced_blocks (
  id UUID PRIMARY KEY,
  origin_page_id UUID NOT NULL,
  content JSONB NOT NULL,        -- array de bloques BlockNote
  updated_at TIMESTAMPTZ
);
```

Block spec en el documento:

```ts
createBlockSpec({
  type: "syncedBlock",
  propSchema: { syncedBlockId: { default: "" }, isOrigin: { default: false } },
  content: "none",  // el contenido NO vive en el doc
})
```

Claves de implementación:

- El **contenido vive fuera del documento** (tabla propia o doc Yjs independiente por synced block). El bloque en la página solo guarda `syncedBlockId`. Esto evita el problema de duplicar y reconciliar.
- **Render**: el componente React del bloque monta un **sub-editor BlockNote anidado** (editable) apuntando al fragmento Yjs `synced:{id}`. Con y-websocket/Hocuspocus, dos páginas abiertas con el mismo synced block colaboran en tiempo real gratis: es el mismo documento CRDT.
- **Resolución de referencia**: al cargar la página, resuelve en batch todos los `syncedBlockId` (una query `WHERE id = ANY(...)`). Referencia rota → placeholder "Bloque original eliminado" con opción de desanclar.
- **Copia**: al copiar/pegar un synced block, pega la referencia (mismo id), no el contenido. "Unsync" = materializar: inserta el `content` como bloques normales y borra la referencia.
- Marca visual (borde rojo/naranja como Notion) vía CSS cuando el sub-editor tiene foco. Evita ciclos: prohíbe insertar un synced block dentro de sí mismo (comprueba la cadena de ids al insertar).

## 3. Bloques de estructura y utilidades

**Table of contents** — bloque sin props que se autoalimenta:

```ts
type: "tableOfContents", content: "none"
```

El componente suscribe a `editor.onChange`, recorre `editor.document` filtrando `heading` (incluye toggle headings), y renderiza enlaces con sangría por `level`. Cada heading necesita `id` estable (BlockNote ya da `block.id`); el click hace `scrollIntoView` sobre `[data-id]`. No serializa contenido: en Markdown emite lista de enlaces generada en export.

**Breadcrumb** — `content: "none"`, sin props. Resuelve la cadena de ancestros de la página actual con un CTE recursivo sobre `pages(id, parent_id, icon, title)` y renderiza `Padre / Hijo / Actual`. Es puramente derivado: el JSON solo guarda `{ type: "breadcrumb" }`.

**Toggle headings** — no crees un tipo nuevo: extiende `heading` con prop `isToggleable: { default: false }` (BlockNote 0.22+ lo trae de serie con `isToggleable`). Los hijos colapsados van en `children` del heading; el estado abierto/cerrado es **local** (localStorage por blockId), no del documento, igual que Notion. En Markdown export, emite el heading y los hijos linealmente.

**Botón** — bloque que ejecuta acciones:

```ts
propSchema: {
  label: { default: "Botón" },
  actions: { default: "[]" }  // JSON string: [{type:"insertBlocks", blocks:[...]},
                              //  {type:"openPage", pageId}, {type:"editProp",...}]
}
```

El runner itera acciones: `insertBlocks` usa `editor.insertBlocks(tpl, buttonBlock, "after")` con **ids regenerados** en cada ejecución (si reutilizas ids, la segunda pulsación colisiona). Whitelist de tipos de acción; nada de eval. Para "columna de botones", simplemente botones dentro de `column`.

**Ecuaciones LaTeX** — dos specs con KaTeX:

- Inline: `createInlineContentSpec({ type: "inlineMath", propSchema: { latex: {...} }, content: "none" })`. Render con `katex.render(latex, el, { throwOnError: false })`; al clicar, popover con textarea + preview en vivo.
- Block: `type: "mathBlock"`, `content: "none"`, prop `latex`, `displayMode: true`.
- Serialización Markdown: `$...$` y `$$...$$` (parse de entrada con regla de input `$$\s` → convertir a mathBlock).

**Subpágina inline** — `type: "pageLink"`, props `pageId`, y título/icono resueltos en render (no los guardes en props o se desincronizan; como mucho cachea `titleSnapshot` para SSR). Crear subpágina desde slash menu = `INSERT INTO pages (parent_id = paginaActual)` + insertar el bloque. Al borrar el bloque, la página va a papelera (soft delete), no se destruye: detecta la eliminación diffeando ids de `pageLink` en `onChange` o en el guardado server-side.

## 4. Embeds ricos

Un único spec genérico + registro de proveedores:

```ts
type: "embed",
propSchema: { url: {...}, provider: {...}, height: { default: 400 }, caption: {...} }
```

Registro por proveedor con regex y estrategia:

| Proveedor | Detección | Estrategia |
|---|---|---|
| Figma | `figma.com/(file\|design\|proto)/` | iframe `figma.com/embed?embed_host=notiono&url=` |
| PDF | extensión/MIME | `<embed type="application/pdf">` o pdf.js (mejor control) |
| Google Maps | `google.com/maps` | iframe embed API |
| Google Drive | `drive.google.com/file/d/(ID)` | iframe `/file/d/ID/preview` |
| Twitter/X | `(twitter\|x).com/.+/status/` | oEmbed `publish.twitter.com/oembed` (server-side) |
| Vídeo/Audio | YouTube/Vimeo/archivo | iframe oficial o `<video>/<audio>` nativo |
| CodeSandbox/StackBlitz | dominio | iframe con `?embed=1` |

Seguridad, innegociable:

- **oEmbed siempre server-side** (`/api/oembed?url=`): evita CORS, filtra por **whitelist de dominios** y previene SSRF (resuelve DNS y rechaza IPs privadas/link-local antes de fetch).
- Todo iframe con `sandbox="allow-scripts allow-same-origin allow-popups"` (ajusta por proveedor; PDFs locales sin `allow-same-origin`), `referrerpolicy="no-referrer"`, `loading="lazy"`.
- HTML de oEmbed (tweets): **nunca** `dangerouslySetInnerHTML` directo; renderízalo dentro de un iframe `srcdoc` sandboxeado o usa el widget JS oficial en iframe aislado.
- URL no whitelisteada → degradar a bookmark (tarjeta con favicon/título vía metadata scraping server-side).
- Resize: handle inferior que actualiza `props.height` con `editor.updateBlock`.

## 5. Bases de datos inline, full-page y linked views

Modelo: la **base de datos es una entidad propia** (`databases`, `database_rows`, `database_views`), nunca vive en el JSON del documento. Tres modos sobre el mismo dato:

- **Full-page**: `pages.type = "database"`; la página renderiza el componente database en vez del editor.
- **Inline**: bloque `{ type: "databaseBlock", props: { databaseId, viewId } }` — la DB "pertenece" a esa página (se crea con ella, se borra con ella).
- **Linked view**: bloque `{ type: "linkedDatabase", props: { databaseId, viewId } }` — referencia a una DB existente; la **vista es propia del bloque** (filtros/orden/agrupación propios sobre datos compartidos). Es la misma mecánica de referencia que synced blocks: los datos son únicos, la configuración de vista (`database_views.config JSONB`) es por instancia. Icono distintivo (flecha, como Notion) para señalar que es enlazada.

Ambos bloques comparten componente React (`<DatabaseView databaseId viewId editable />`); la única diferencia es la propiedad de ciclo de vida (cascade delete solo en inline).

## 6. Página: cover, iconos y anchura

Esto es **metadato de página, fuera del documento BlockNote**:

```sql
ALTER TABLE pages ADD COLUMN icon TEXT,          -- emoji o URL
  cover_url TEXT, cover_position REAL DEFAULT 0.5,  -- reposición vertical
  is_full_width BOOLEAN DEFAULT false;
```

- El cover se renderiza sobre el editor con `object-position: 50% ${position*100}%` y drag para reposicionar; guarda solo el ratio.
- Ancho: `is_full_width` alterna `max-width: 900px` ↔ `100%` en el contenedor del editor (transición CSS). Con columnas activas, el modo ancho es donde el layout multicolumna brilla — respétalo también en export a PDF.
- El icono se reutiliza en breadcrumb, `pageLink` y sidebar: resuélvelo siempre desde `pages`, única fuente de verdad.

**Regla transversal de serialización**: todo bloque referencial (synced, pageLink, linkedDatabase, embed) guarda solo ids/props en el JSON del documento y resuelve contenido en render; el export Markdown degrada con gracia (enlaces, `$$`, listas para TOC, lineal para columnas). Así el documento sigue siendo portable y el estado compartido nunca se bifurca.

---

# Búsqueda, Quick Find y Command Palette

## 1. Estrategia general: Postgres FTS, no Meilisearch

En un NAS con recursos limitados, Meilisearch añade un proceso residente (~300-500 MB RAM con índices medianos), otro contenedor que mantener, y un problema de sincronización: cada edición de bloque tendría que replicarse al índice externo, con riesgo de deriva. Postgres FTS elimina todo eso: el índice vive junto a los datos, se actualiza en la misma transacción (consistencia garantizada), y un índice GIN sobre `tsvector` responde en milisegundos para el volumen realista de un workspace personal/familiar (decenas de miles de páginas). Meilisearch solo compensaría con millones de documentos o si necesitáramos typo-tolerance avanzada; para eso basta añadir `pg_trgm` como fallback difuso. Decisión: **FTS nativo de Postgres + pg_trgm**, cero infraestructura extra.

## 2. Esquema e indexación de páginas

Añadimos a `Page` una columna generada por trigger (no `GENERATED ALWAYS` porque la extracción del JSONB de BlockNote requiere una función recursiva, no una expresión inmutable simple... en realidad sí podría marcarse `IMMUTABLE`, pero el trigger nos deja además desnormalizar `plain_text` para `ts_headline`):

```sql
ALTER TABLE "Page"
  ADD COLUMN plain_text text NOT NULL DEFAULT '',
  ADD COLUMN search_vector tsvector;

-- Extrae texto plano del doc JSON de BlockNote (bloques anidados,
-- inline content con {type:'text', text:'...'}).
CREATE OR REPLACE FUNCTION blocknote_to_text(doc jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(string_agg(t.txt, ' '), '')
  FROM (
    WITH RECURSIVE blocks(b) AS (
      SELECT jsonb_array_elements(doc)
      UNION ALL
      SELECT jsonb_array_elements(b->'children')
      FROM blocks
      WHERE jsonb_typeof(b->'children') = 'array'
    )
    SELECT jsonb_array_elements(b->'content')->>'text' AS txt
    FROM blocks
    WHERE jsonb_typeof(b->'content') = 'array'
  ) t
  WHERE t.txt IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION page_search_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.plain_text := blocknote_to_text(NEW.content);
  NEW.search_vector :=
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.title,''))), 'A') ||
    setweight(to_tsvector('spanish', unaccent(left(NEW.plain_text, 200000))), 'C');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_page_search
  BEFORE INSERT OR UPDATE OF title, content ON "Page"
  FOR EACH ROW EXECUTE FUNCTION page_search_trigger();

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_page_search ON "Page" USING gin (search_vector);
-- Fallback difuso para títulos con typos ("reseta" → "receta"):
CREATE INDEX idx_page_title_trgm ON "Page" USING gin (title gin_trgm_ops);
```

Notas: `setweight A/C` implementa "título > contenido"; `unaccent` es clave en español ("cumpleaños" vs "cumpleanos"); el `left(..., 200000)` protege del límite de 1 MB de `tsvector` en páginas gigantes. Para no recalcular en cada keystroke del editor (autosave), el trigger se dispara solo en el `UPDATE` real de `content`, y el autosave ya está debounced a ~1 s en el cliente.

## 3. Búsqueda en registros de bases de datos

`Record.cells` es JSONB `{fieldId: value}`. Indexamos los valores textuales (text, select, url, email; los números y fechas se buscan por filtros estructurados, no por FTS):

```sql
ALTER TABLE "Record" ADD COLUMN search_vector tsvector;

CREATE OR REPLACE FUNCTION record_search_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('spanish', unaccent(
    coalesce((
      SELECT string_agg(
        CASE jsonb_typeof(v.value)
          WHEN 'string' THEN v.value #>> '{}'
          WHEN 'array'  THEN (SELECT string_agg(e #>> '{}', ' ')
                              FROM jsonb_array_elements(v.value) e)
          ELSE NULL
        END, ' ')
      FROM jsonb_each(NEW.cells) v
    ), '')
  ));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_record_search
  BEFORE INSERT OR UPDATE OF cells ON "Record"
  FOR EACH ROW EXECUTE FUNCTION record_search_trigger();

CREATE INDEX idx_record_search ON "Record" USING gin (search_vector);
```

Los nombres de propiedades (`Field.name`) y títulos de `Collection` entran en el índice de páginas contenedoras o en una consulta ILIKE trivial (son pocos miles de filas; no necesitan tsvector).

## 4. La consulta unificada

Un solo endpoint tRPC `search.query({ q, types?, cursor?, limit=20 })` ejecuta:

```sql
WITH q AS (SELECT websearch_to_tsquery('spanish', unaccent($1)) AS tsq)
SELECT * FROM (
  SELECT p.id, 'page' AS kind, p.title, p.icon, p.updated_at,
         ts_rank(p.search_vector, q.tsq) AS rank,
         ts_headline('spanish', p.plain_text, q.tsq,
           'StartSel=<mark>, StopSel=</mark>, MaxWords=18, MinWords=8') AS snippet
  FROM "Page" p, q
  WHERE p.search_vector @@ q.tsq
    AND p.deleted_at IS NULL
    AND p.workspace_id = $2
    AND has_page_access(p.id, $3)          -- función de permisos, ver §7

  UNION ALL

  SELECT r.id, 'record', c.name || ' — ' || record_title(r), c.icon, r.updated_at,
         ts_rank(r.search_vector, q.tsq) * 0.8,   -- registros pesan algo menos
         ts_headline('spanish', record_text(r), q.tsq) 
  FROM "Record" r JOIN "Collection" c ON c.id = r.collection_id, q
  WHERE r.search_vector @@ q.tsq
    AND has_page_access(c.page_id, $3)
) u
ORDER BY rank DESC, updated_at DESC
LIMIT $4 OFFSET $5;
```

`websearch_to_tsquery` acepta sintaxis de usuario real (`"frase exacta"`, `-excluir`, `o OR`), nunca lanza error de parseo. Si devuelve 0 resultados y `length(q) >= 3`, ejecutamos el fallback trigram: `WHERE title % $1 ORDER BY similarity(title, $1) DESC` — cubre typos sin coste cuando el FTS acierta.

**Paginación**: keyset sobre `(rank, updated_at, id)` serializado en `cursor` opaco; `OFFSET` solo como fallback en las 3 primeras páginas (más allá nadie pagina en un buscador).

## 5. Quick Find (⌘K) — navegación

- **Apertura instantánea**: el modal se monta lazy pero se *pre-hidrata* con datos ya en caché: los 10 recientes (tabla `RecentVisit(user_id, page_id, visited_at)`, upsert en cada navegación) llegan con el payload inicial de la app, así el modal vacío es útil en 0 ms.
- **Debounce 150 ms** + `AbortController`: cada keystroke cancela la request anterior (tRPC + `signal`). Con índice GIN, el p95 del query es <30 ms; el presupuesto de 300 ms se va en red, y en LAN del NAS sobra.
- **Cache cliente**: TanStack Query con `staleTime: 30s` por término — repetir "f" → "fa" → "f" no re-consulta.
- **Filtros por tipo**: chips `Páginas | Bases de datos | Registros | Acciones` que mapean a `types[]` del endpoint (poda ramas del UNION, más rápido aún).
- **Teclado**: `↑/↓` navega, `Enter` abre, `⌘Enter` abre en peek lateral, `Tab` cicla filtros, `Esc` cierra. Selección con roving tabindex y `aria-activedescendant` (accesible).
- **Ranking combinado**: el peso A/C ya prioriza título; encima aplicamos boost cliente-side a (1) coincidencia de prefijo exacto en título, (2) páginas visitadas en los últimos 7 días (`rank * 1.5`), imitando el "frecency" de Notion.

## 6. Command Palette — acciones

Mismo modal, segundo modo: si el input empieza por `>` (o pestaña "Acciones"), se busca en un **registro estático cliente-side** — sin red, filtrado con fuzzy match (fzf-style) sobre `{id, título, alias[], icono, atajo, run()}`:

```ts
registerCommand({
  id: 'page.create', title: 'Crear página', aliases: ['nueva', 'new page'],
  shortcut: '⌘N', run: (ctx) => ctx.router.push(await createPage(ctx.currentSpace))
});
```

Categorías: **Crear** (página, base de datos, plantilla), **Vista** (cambiar a tabla/kanban/calendario — solo visibles si `ctx` es una colección: los comandos declaran `isVisible(ctx)`), **Insertar bloque** (delega en el slash-menu de BlockNote en el cursor), **Dobby** (acciones del asistente: "resumir esta página", "preguntar a Dobby…" — el comando abre el panel de chat con la página como contexto, vía el endpoint tRPC `dobby.run`), **Navegación** (ajustes, papelera, importar). Los comandos contextuales reciben `ctx = { pageId, collectionId, selection }`.

## 7. Permisos: filtrado en SQL, nunca en cliente

Regla absoluta: un resultado no accesible no debe ni existir en la respuesta (ni siquiera su título — eso ya filtra información). Implementación:

```sql
CREATE OR REPLACE FUNCTION has_page_access(p_page uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "PagePermission" pp
    WHERE pp.page_id = ANY (page_ancestors(p_page))  -- herencia por árbol
      AND (pp.user_id = p_user
           OR pp.group_id IN (SELECT group_id FROM "GroupMember"
                              WHERE user_id = p_user))
      AND pp.level >= 'read'
  )
$$;
```

Para que no destroce el rendimiento (se evalúa por fila candidata), se materializa: tabla `EffectivePageAccess(page_id, user_id)` mantenida por trigger sobre `PagePermission` y sobre movimientos de páginas en el árbol; la búsqueda hace un `JOIN` directo con índice `(user_id, page_id)`. Los registros heredan el permiso de la página de su colección. Además, `ts_headline` se calcula **después** del filtro de permisos (subquery externa), para no gastar CPU en snippets que se descartarían.

## 8. Índices — resumen

| Índice | Tabla | Para |
|---|---|---|
| GIN `search_vector` | Page, Record | FTS principal |
| GIN `title gin_trgm_ops` | Page | typos / fuzzy |
| BTree `(user_id, visited_at DESC)` | RecentVisit | recientes del ⌘K |
| BTree `(user_id, page_id)` | EffectivePageAccess | filtro de permisos |
| BTree `(workspace_id, updated_at DESC)` | Page | desempate de ranking |

Con esto, Notiono cubre el trío completo de Notion — búsqueda full-text con snippets resaltados, Quick Find instantáneo con recientes y filtros, y paleta de comandos extensible — sin ningún servicio adicional en el NAS.

---

# Importación y exportación

## Visión general

El subsistema de import/export de Notiono se apoya en tres piezas: un **modelo intermedio (IR)** de bloques/páginas/bases de datos, **adaptadores** por formato (que traducen hacia/desde el IR), y una **cola de trabajos** (BullMQ sobre Redis) que ejecuta todo en background. Nada de esto corre en el request de tRPC: la mutation solo valida, sube el fichero a storage (S3/MinIO) y encola.

```
Fichero subido ──> ImportJob (cola) ──> Adaptador ──> IR ──> Persistencia (Prisma, tx por lotes)
Página/DB ──> ExportJob (cola) ──> IR ──> Serializador ──> Artefacto (ZIP/PDF/CSV) ──> URL firmada
```

El IR es deliberadamente cercano a BlockNote: árbol de bloques tipados (`paragraph`, `heading`, `table`, `image`, `callout`, `toggle`…) más entidades `Page`, `Database` (schema de fields) y `Row`. Cada adaptador solo tiene que resolver "su formato ↔ IR", nunca formato ↔ formato.

---

## Importadores

### Notion (export ZIP)

Es el importador estrella y el más delicado, porque el export de Notion es "Markdown & CSV" con convenciones propias:

- Cada página es `Nombre <hash32>.md`; sus hijas viven en una carpeta homónima `Nombre <hash32>/`.
- Cada base de datos es `Nombre <hash32>.csv` (+ opcionalmente `_all.csv`) y sus filas-página son `.md` dentro de la carpeta.
- Los enlaces internos son rutas relativas URL-encoded con el hash incluido.

**Flujo (worker):**

1. **Extracción streaming** del ZIP (`yauzl`), nunca en memoria completa; los ficheros van a un directorio temporal de trabajo.
2. **Pase 1 — inventario**: se recorre el árbol y se construye un grafo `hash32 → {tipo, ruta, padre}`. La jerarquía de páginas se reconstruye directamente de la estructura de carpetas: `A <h1>/B <h2>.md` ⇒ B es hija de A.
3. **Pase 2 — bases de datos**: por cada CSV se infiere el schema (ver detección de tipos abajo), con heurísticas Notion-específicas: columnas con valores separados por `, ` y baja cardinalidad ⇒ `multi_select`; valores `Yes/No` ⇒ `checkbox`; celdas que son nombres de otras páginas del inventario ⇒ `relation`. La primera columna es siempre el `title`. Cada fila se casa con su `.md` correspondiente (por título) para que la fila-página conserve su contenido.
4. **Pase 3 — contenido**: cada `.md` se parsea a IR con `remark` + extensiones (callouts de Notion se exportan como quote con emoji: los detectamos y los promovemos a bloque `callout`; toggles llegan como `<details>`; ecuaciones como `$$`).
5. **Pase 4 — resolución de enlaces**: los links relativos con hash se resuelven contra el mapa del pase 1 y se reescriben como menciones internas (`page://<uuid-nuevo>`). Guardamos `notionHash → notionoPageId` en tabla `ImportMapping`, clave para la idempotencia y para futuros imports incrementales.
6. **Persistencia** en transacciones por lotes de ~50 páginas (una tx gigante bloquearía Postgres en workspaces grandes).

### Evernote (.enex)

XML con notas en ENML (HTML restringido) y adjuntos en base64 (`<resource>`). Se parsea con SAX (streaming: los .enex pueden pesar GB). ENML → HTML → IR reutilizando el adaptador HTML. Los `<en-media hash="...">` se resuelven contra el hash MD5 del resource y se convierten en bloques `image`/`file`. Los tags de Evernote se convierten en una propiedad `multi_select` si el usuario elige "importar como base de datos", o se descartan con aviso. Los notebooks se mapean a páginas contenedoras.

### Word / HTML

`.docx` → HTML vía `mammoth` (conserva headings, listas, tablas, imágenes embebidas como base64) → adaptador HTML → IR. El adaptador HTML normaliza con una whitelist: todo lo no mapeable se degrada a párrafo con rich text (nunca se pierde texto). Tablas HTML → bloque `table` de BlockNote, no a base de datos (eso solo lo hace CSV).

### Markdown

El caso simple: un `.md` o un ZIP de `.md`. Reutiliza el pipeline del pase 3 de Notion (nuestro `server-util` de markdown ya hace md ↔ bloques BlockNote; el adaptador de import es su inversa con las extensiones de front-matter: si hay YAML front-matter, sus claves se ofrecen como propiedades). Con ZIP, la jerarquía sale de las carpetas.

### CSV → base de datos

1. **Sniffing**: delimitador (`,` `;` `\t`), encoding (UTF-8/latin1 vía BOM + heurística), cabecera sí/no.
2. **Detección de tipos** sobre una muestra de hasta 1.000 filas, por columna y en cascada: `checkbox` (todos ∈ {true,false,yes,no,1,0}) → `number` (parseable con locale, admite `€`, `%`, separador de miles) → `date` (ISO, `dd/mm/yyyy`, etc., vía `date-fns`) → `url` / `email` / `phone` (regex) → `select` (cardinalidad ≤ 25 y ratio valores únicos/filas < 0,3) → `multi_select` (ídem tras split por `,`) → fallback `text`. Umbral: un tipo gana si ≥ 95 % de valores no vacíos lo cumplen.
3. **Pantalla de mapeo** (esto es un paso interactivo, no del worker): la API devuelve el schema propuesto + 10 filas de preview; el usuario puede renombrar columnas, cambiar tipos, elegir columna título, descartar columnas o mapear a una base de datos existente. La confirmación (`mapping` JSON) es lo que se encola.
4. Ingesta streaming con `csv-parse`, validando cada celda contra el tipo final; los errores por fila se acumulan en un informe (fila 214: "abc" no es número → guardada como texto en propiedad de fallback o vacía, según opción).

---

## Exportadores

- **Markdown**: página → `.md` (nuestro server-util). Espacio → ZIP replicando exactamente la convención de Notion (carpetas por jerarquía, `Nombre <shortid>.md`), lo que hace el export **re-importable** y compatible con herramientas del ecosistema. Bases de datos → CSV + carpeta con las filas-página en md.
- **HTML**: mismo árbol pero serializando bloques a HTML semántico con una hoja CSS embebida (standalone, sin JS). Toggles → `<details>`, callouts → `<aside class="callout">`.
- **PDF**: render server-side con **Playwright/Chromium headless** en un contenedor worker dedicado (pool de páginas, no un browser por job). El worker abre una ruta interna `/render/:pageId?token=...` (token de un solo uso, sin sesión de usuario) que pinta la página con el CSS de impresión: fuentes embebidas, `page-break-inside: avoid` en bloques, cabecera/pie con título y numeración vía `page.pdf({ displayHeaderFooter })`. Espacio completo → un PDF por página, comprimidos en ZIP (concatenar PDFs enormes es frágil; se ofrece como opción con `pdf-lib`).
- **Base de datos → CSV**: respeta la vista activa (filtros, orden, columnas visibles) o "todo"; fórmulas y rollups se exportan por su valor calculado; relations por el título de la página relacionada.
- **Workspace completo (backup lógico)**: ZIP con Markdown + CSV **más** un `notiono-export.json` con el IR crudo (ids, schemas exactos, permisos, comentarios) — el backup fiel es el JSON; el md/csv es la versión legible. Un import de este ZIP en otra instancia restaura sin pérdida.

## Adjuntos e imágenes

En **import**, toda referencia binaria (fichero del ZIP, resource ENML, base64 de docx, URL http externa si el usuario activa "descargar imágenes remotas") pasa por un único servicio: dedupe por SHA-256, subida a S3 (`workspace/{wsId}/files/{sha}.{ext}`), límite por fichero (50 MB configurable) y reescritura del bloque a `file://<mediaId>`. En **export**, los binarios se descargan a una carpeta `assets/` del ZIP y los bloques se serializan con rutas relativas; en PDF se inyectan vía URL firmada de corta duración.

## Background, progreso e idempotencia

- **Colas** BullMQ: `import` (concurrencia baja, jobs pesados), `export`, `export-pdf` (aislada, por el coste de Chromium). Reintentos con backoff (3), timeout por job, y ficheros temporales con TTL.
- **Progreso**: el job actualiza `Job.progress` (fase + n/total: "Parseando páginas 340/812") en Postgres; el cliente lo recibe por la suscripción tRPC/SSE `jobs.onProgress`. Al terminar: `completed` con URL firmada del artefacto (expira en 24 h) o informe de import (creadas/omitidas/errores).
- **Idempotencia**: cada petición lleva `idempotencyKey` (hash del fichero + opciones + workspace); si existe un job no fallido con esa clave, se devuelve el existente. Dentro del import, la tabla `ImportMapping` permite reanudar un job caído sin duplicar páginas (upsert por `(jobId, sourceKey)`).

## API (para Dobby)

Router tRPC `io.*`, expuesto también como REST con API key de bot:

```ts
io.import.createUpload({ filename, size })        // → { uploadUrl, fileId } (PUT directo a S3)
io.import.start({ fileId, format: "notion"|"enex"|"docx"|"markdown"|"csv",
                  targetPageId?, csvMapping?, idempotencyKey })  // → { jobId }
io.import.previewCsv({ fileId })                  // → { schema propuesto, sampleRows }
io.export.start({ scope: {pageId?|databaseId?|workspace: true},
                  format: "markdown"|"html"|"pdf"|"csv"|"backup",
                  includeSubpages, viewId? })      // → { jobId }
io.jobs.get({ jobId })                             // → { status, progress, resultUrl?, report? }
io.jobs.onProgress({ jobId })                      // suscripción SSE
```

Ejemplo típico de Dobby (backup nocturno): `export.start({ workspace: true, format: "backup" })` desde un cron, poll a `jobs.get`, y descarga del ZIP con la URL firmada. Todo scopeado por permisos: el bot solo exporta lo que su membership puede leer, y los imports siempre aterrizan bajo una página donde tenga permiso de escritura.

*(~1.250 palabras)*

---

# Historial de versiones, papelera y navegación/personalización — Diseño NOTIONO

## 1. Historial de versiones de página

### Estrategia de almacenamiento (delta + snapshot periódico)

No se guarda el documento completo en cada edición. Modelo de tres niveles:

1. **Autosave continuo**: el contenido vivo está en `Page.content` (JSON BlockNote).
2. **Versiones delta**: cada N minutos de edición activa (debounce de 10 min por editor, o al cerrar sesión de edición) se persiste un registro `Version` con **diff estructural** (JSON Patch RFC 6902 sobre el árbol de bloques, que es estable porque cada bloque tiene `id`).
3. **Snapshot completo cada K versiones** (K=20) o cuando el diff acumulado supera el 60% del tamaño del doc. Reconstruir la versión X = snapshot completo anterior más cercano + aplicar deltas hacia delante (máx. 19 aplicaciones, milisegundos).

```prisma
model Version {
  id          String   @id @default(cuid())
  pageId      String
  page        Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  seq         Int                  // monótono por página
  kind        VersionKind          // SNAPSHOT | DELTA
  content     Json                 // doc completo o JSON Patch
  baseSeq     Int?                 // seq del snapshot base (solo DELTA)
  titleAtTime String
  iconAtTime  String?
  sizeBytes   Int
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  createdAt   DateTime @default(now())
  label       String?              // "restaurado", nombre manual
  @@unique([pageId, seq])
  @@index([pageId, createdAt])
}
enum VersionKind { SNAPSHOT DELTA }
```

### Retención (estilo Notion, por plan)

- Free: 7 días · Plus: 30 · Business: 90 · Enterprise: ilimitado.
- Job diario: borra versiones expiradas, pero **antes de borrar un SNAPSHOT del que dependen deltas vivos, materializa el delta más antiguo superviviente como nuevo SNAPSHOT**. Además, compactación: versiones de más de 30 días se adelgazan a 1/día (se conserva la última del día).

### UI

- Panel lateral derecho con **línea de tiempo agrupada por día**; entradas muestran hora, autores del intervalo y etiqueta.
- Clic → render de solo lectura de esa versión en el lienzo principal.
- **Diff visual**: se calcula bloque a bloque por `id`: bloques añadidos (fondo verde), eliminados (rojo, tachados, reinsertados visualmente en su posición original), modificados (diff de texto inline con `diff-match-patch` sobre el texto plano del bloque). Toggle "mostrar cambios".
- **Restaurar**: no destructivo — se crea primero una versión SNAPSHOT del estado actual con `label: "antes de restaurar"`, y luego se copia el contenido de la versión elegida a `Page.content`. tRPC: `version.list`, `version.get(seq)` (reconstruye en servidor), `version.restore(seq)`.

## 2. Papelera

### Esquema (columnas en Page)

```prisma
model Page {
  // ...existente...
  deletedAt     DateTime?   // null = viva
  deletedById   String?
  deletedRootId String?     // id de la página raíz de la operación de borrado
  @@index([workspaceId, deletedAt])
}
```

**Decisiones clave:**

- **Borrado jerárquico**: al borrar una página, una transacción marca `deletedAt` en todo su subárbol (CTE recursiva vía `$queryRaw`) y estampa `deletedRootId` con el id de la página raíz borrada. Esto permite que la papelera **liste solo raíces** (`deletedRootId = id`) y que restaurar una raíz restaure exactamente los descendientes borrados *en esa misma operación* (los que ya estaban borrados antes, con otro `deletedRootId`, permanecen en papelera — igual que Notion).
- **Restaurar**: limpia `deletedAt/deletedById/deletedRootId` del conjunto. Si el padre original sigue borrado o no existe, la página se recoloca en la raíz del teamspace/espacio privado con nuevo orden fraccional al final.
- **Papelera por workspace**, con filtro "en la página actual" (subárbol) como Notion. Búsqueda: `ILIKE` sobre título + índice trigram (`pg_trgm`) sobre `titleText`; suficiente sin tocar el índice de búsqueda principal (que excluye `deletedAt IS NOT NULL`).
- **Purga a 30 días**: cron diario `DELETE ... WHERE deletedAt < now() - interval '30 days'`; el `onDelete: Cascade` arrastra bloques, versiones y comentarios; los ficheros subidos se encolan para borrado en el storage (tabla `FileGarbage`).
- Toda query de lectura normal filtra `deletedAt: null` mediante extensión de Prisma Client (`$extends` con filtro global) para no olvidarlo en ningún resolver.

## 3. Duplicar / mover

- **Mover** (entre secciones o teamspaces): cambia `parentId` + `fractionalIndex` (+ `teamspaceId` de todo el subárbol si cruza espacios, en transacción). Los **backlinks no se tocan**: las menciones referencian `pageId`, que es estable. Se valida que el destino no sea descendiente del origen (evitar ciclos). Si el destino tiene permisos más restrictivos, se avisa antes de confirmar.
- **Duplicar**: copia recursiva del subárbol con mapa `oldId → newId`. Al copiar `content`, se reescriben las menciones/links internos **que apunten a páginas dentro del subárbol duplicado** hacia sus nuevos ids; las menciones a páginas externas se dejan apuntando al original (comportamiento Notion). Título con sufijo "(copia)". Se copian icono/cover/propiedades; **no** se copian versiones ni comentarios. Para árboles grandes (>200 páginas) se ejecuta como job asíncrono con progreso. La tabla `Backlink(sourcePageId, targetPageId)` se rellena al reparsear el contenido copiado.

## 4. Favoritos, recientes, sidebar, breadcrumbs

```prisma
model Favorite {
  id        String @id @default(cuid())
  userId    String
  pageId    String
  index     String            // orden fraccional, arrastrable
  @@unique([userId, pageId])
}
model RecentVisit {
  userId    String
  pageId    String
  visitedAt DateTime @updatedAt
  @@id([userId, pageId])      // upsert; se listan top 20 por visitedAt
}
model SidebarState {          // por usuario y workspace
  id          String @id @default(cuid())
  userId      String
  workspaceId String
  sectionOrder Json           // ["favorites","teamspaces","shared","private"]
  collapsed    Json           // { sectionId|teamspaceId|pageId: true }
  @@unique([userId, workspaceId])
}
```

- **Sidebar**: secciones Favoritos / Teamspaces / Compartido / Privado; orden de secciones y de teamspaces arrastrable (dnd-kit), estado de colapso persistido con debounce (optimistic update, sin bloquear UI). El árbol de páginas se carga perezosamente por nivel (`page.children`).
- **Breadcrumbs**: cadena de ancestros calculada con CTE recursiva ascendente (o materializando `path` cacheado); colapsa el medio con "…" si hay más de 4 niveles; cada crumb es navegable y muestra icono.
- **Recientes**: se registran al abrir página (upsert), alimentan el switcher Cmd+K.

## 5. Personalización de página

```prisma
model Page {
  // ...
  icon        String?    // "emoji:🎯" | "url:https://..." | "file:<fileId>"
  coverUrl    String?    // url o file:<fileId>
  coverPosY   Float      @default(0.5)  // 0..1, reposicionar verticalmente
  fullWidth   Boolean    @default(false)
  smallText   Boolean    @default(false)
  font        PageFont   @default(DEFAULT)
  locked      Boolean    @default(false)
  lockedById  String?
}
enum PageFont { DEFAULT SERIF MONO }
```

- **Icono**: picker con tabs emoji / subir (crop cuadrado, límite 5 MB) / enlace; prefijo en el string discrimina el tipo sin columna extra.
- **Cover**: galería predefinida, subida o URL; "Reposicionar" arrastra verticalmente y guarda `coverPosY` (se aplica como `object-position`). El cover y el icono viajan también en `Version` (campos `*AtTime`) para restauraciones fieles.
- **Bloqueo**: `locked=true` desactiva la edición del editor en cliente y **se valida en servidor** en cada mutación de contenido (excepto desbloquear, permitido a quien pueda editar). Estas propiedades se heredan al duplicar.

## 6. Teamspaces / wikis y home

```prisma
model Teamspace {
  id          String @id @default(cuid())
  workspaceId String
  name        String
  icon        String?
  isDefault   Boolean @default(false)   // "General", todos son miembros
  access      TeamspaceAccess @default(OPEN) // OPEN | CLOSED | PRIVATE
  homePageId  String?  @unique          // página de inicio del teamspace (wiki home)
  members     TeamspaceMember[]
}
model Workspace {
  // ...
  homePageId  String? // página de inicio del workspace (vista "Inicio")
}
```

- Cada teamspace tiene raíces de páginas propias (`Page.teamspaceId`, `parentId = null`). Convertir una página en **wiki** = marcarla `homePageId` del teamspace: gana vista de inicio con "páginas destacadas", propietarios y verificación (campo futuro `verifiedUntil` en Page, ya contemplado).
- **Home del workspace**: vista compuesta (recientes, favoritos, "continúa donde lo dejaste" desde `RecentVisit`, accesos a teamspaces); configurable como página real si el admin fija `homePageId`.

### Resumen de decisiones

| Decisión | Elección | Por qué |
|---|---|---|
| Versionado | Delta JSON-Patch + snapshot cada 20 | ~90% menos almacenamiento; reconstrucción O(K) |
| Borrado | `deletedAt` + `deletedRootId` | restaurar-con-hijos exacto por operación |
| Backlinks al mover | ids estables, sin reescritura | menciones nunca se rompen |
| Sidebar/favoritos | estado por usuario, orden fraccional | consistente con el árbol de páginas |
| Bloqueo | validado en servidor | el cliente no es frontera de seguridad |

Todo el diseño se apoya en el esquema existente (`Page`, `Version`, orden fraccional) sin migraciones destructivas: solo columnas nuevas y cuatro tablas (`Favorite`, `RecentVisit`, `SidebarState`, `Teamspace*`).

---

He revisado el planteamiento existente (`/home/node/.openclaw/workspace/notion-clone/PLANTEAMIENTO.md`, sección 9) para mantener coherencia con lo ya diseñado: prefijos `nly_`, colecciones/records, DSL de filtros `and(gte(...))`, shape de errores, `Idempotency-Key`. La nueva sección extiende aquello (que era API interna para Dobby) a API pública con paridad Notion. Aquí está la sección:

---

# API pública, integraciones y webhooks

> La REST v1 interna (sección 9) era "la API de Dobby". Esta sección la promociona a **API pública estilo Notion**: contrato documentado, OAuth para terceros, webhooks robustos e integraciones concretas. Todo se apoya en la misma capa `services/*`: la API pública es otro *thin adapter*, no un fork.

## 1. API pública: superficie y convenciones

Base: `https://notiono.example.com/api/public/v1`. Versionado **por cabecera** (`Notiono-Version: 2026-08-15`, estilo Notion/Stripe: fecha de snapshot del contrato; sin cabecera → última estable) además del `/v1` de ruta para breaking mayores. Toda respuesta lleva `X-Notiono-Api-Version` y `requestId`.

**Recursos** (nombres alineados con Notion para que los SDKs/mentales de la gente funcionen):

| Recurso | Endpoints | Notas |
|---|---|---|
| Pages | `POST /pages` · `GET /pages/:id` · `PATCH /pages/:id` · `DELETE /pages/:id` (archivar) | `parent` polimórfico: `{page_id}` o `{database_id}` |
| Blocks | `GET /blocks/:id` · `GET /blocks/:id/children` · `PATCH /blocks/:id` · `POST /blocks/:id/children` (append) · `DELETE /blocks/:id` | children paginados por cursor |
| Databases | `POST /databases` · `GET /databases/:id` · `PATCH /databases/:id` | Mapea a `Collection`; el schema de fields viaja en `properties` |
| Data sources / records | `POST /databases/:id/query` · `POST /pages` (parent=database) · upsert batch `POST /databases/:id/records:upsert` | `query` acepta `filter` (JSON, no DSL — ver abajo), `sorts`, `page_size`≤100 |
| Users | `GET /users` · `GET /users/:id` · `GET /users/me` | `me` devuelve el bot/integración del token |
| Search | `POST /search` | `query` + `filter.object` (`page`/`database`), FTS de Postgres |
| Comments | `POST /comments` · `GET /comments?block_id=` | Se activa con la fase familia; el recurso existe desde v1 para no romper contrato |

**Filtros:** la API pública usa el formato JSON de Notion (`{"and":[{"property":"fecha","date":{"on_or_after":"2026-07-01"}}]}`) y el server lo compila al mismo AST que el DSL interno `and(gte(...))`. Un solo motor de filtros, dos sintaxis de entrada.

**Paginación por cursor** en toda lista: `{"has_more": true, "next_cursor": "eyJ..."}` + parámetro `start_cursor`. Cursor opaco (base64 de `{lastId, lastSort}`), estable ante inserciones.

**Límites de tamaño** (validados con Zod, error 422 con `details`): 100 bloques por append, 2000 chars por rich text, 500 records por upsert, payload total 1 MB, profundidad de bloques ≤ 10.

**OpenAPI autogenerado:** cada endpoint se define una vez con `zod-openapi` — el mismo esquema Zod valida el request y emite el spec. `GET /api/public/v1/openapi.json` + Scalar UI en `/developers`. Regla de CI: si un endpoint no aparece en el spec, el build falla.

## 2. Autenticación: tokens internos + OAuth 2.0

**Internal integration tokens** (lo de hoy, formalizado): `nly_sk_...`, creados desde Ajustes → Integraciones, con scopes y expiración opcional. Para Jose y Dobby.

**OAuth 2.0** para terceros (Authorization Code + PKCE obligatorio; sin implicit ni password):

```
GET  /oauth/authorize?client_id=&redirect_uri=&response_type=code&scope=pages:read records:write&state=&code_challenge=
POST /oauth/token          (code→access_token, refresh; client_secret_basic o PKCE)
POST /oauth/revoke
```

Consent screen server-rendered: nombre/logo de la app, scopes en lenguaje humano ("Leer tus páginas", "Escribir en Finanzas") y **selector de recursos**: como en Notion, el usuario elige a qué páginas/colecciones concretas accede la integración (tabla `IntegrationAccess`).

```prisma
model OAuthApp    { id String @id; name String; logoUrl String?; clientId String @unique
                    clientSecretHash String; redirectUris String[]; scopes String[]
                    ownerId String; createdAt DateTime @default(now()) }
model OAuthGrant  { id String @id; appId String; userId String; scopes String[]
                    resourceIds String[]   // páginas/colecciones consentidas
                    createdAt DateTime; revokedAt DateTime? }
model OAuthToken  { id String @id; grantId String; accessTokenHash String @unique
                    refreshTokenHash String? @unique; expiresAt DateTime; lastUsedAt DateTime? }
```

Access tokens opacos (hash SHA-256 en BD, como los `nly_sk_`), TTL 1 h, refresh rotativo con detección de reuso (reuso → revocar toda la familia del grant). Middleware único de auth: resuelve `Bearer` → `{principal, scopes, resourceIds}` sea token interno u OAuth; los services no distinguen.

## 3. Webhooks salientes, en serio

Sobre el `eventBus` ya diseñado, formalizado:

- **Tipos de evento:** `page.created|updated|archived`, `block.updated`, `database.schema_updated`, `records.created|upserted|deleted`, `chart.dirty`, `comment.created`. Payload fino (ids + delta mínimo); el consumidor rehidrata por API — evita filtrar contenido a endpoints comprometidos.
- **Firma:** `X-Notiono-Signature: t=1723710000,v1=hex(hmac_sha256(secret, t + "." + body))`. El timestamp dentro de la firma mata replays (>5 min → rechazar). Endpoint de verificación inicial tipo Notion: al crear la suscripción se envía `{"verification_token": ...}` que hay que confirmar.
- **Reintentos:** cola en Postgres (`WebhookDelivery`: `eventId`, `subscriptionId`, `attempt`, `nextRetryAt`, `status`). Backoff 1m/5m/30m/2h/12h; tras 5 fallos la suscripción pasa a `paused` y se notifica al dueño. Worker con `FOR UPDATE SKIP LOCKED` — sin infraestructura nueva.
- **Deduplicación:** `eventId` (`evt_...`) estable por evento; el consumidor guarda los últimos N ids. Entrega *at-least-once*, orden no garantizado (`occurredAt` para reordenar).

## 4. Integraciones concretas

**OpenClaw/Dobby — integración de primera clase.** Deja de ser "un token" y pasa a app OAuth interna preinstalada con página propia de estado (últimas llamadas, webhooks entregados, errores 4xx recientes — oro para depurar alucinaciones de esquema). El paquete `@notiono/blocks` + un skill `notiono` para OpenClaw envuelven el SDK. El ciclo extracto→upsert→webhook→resumen de la sección 9 queda intacto, ahora sobre la superficie pública.

**Google Calendar (2-way sync).** Una colección con campo fecha se puede vincular a un calendario: OAuth de Google (scope `calendar.events`), tabla `SyncLink {recordId, gcalEventId, etag, lastSyncedAt}`. Notiono→GCal: el eventBus dispara upsert del evento. GCal→Notiono: *push notifications* de Google (watch channel, renovación cada 7 días) + `syncToken` incremental como respaldo. Conflictos: gana el `updatedAt` más reciente; empate → gana Notiono y se anota en auditoría. Sin campo fecha obligatorio no hay vínculo — se valida al crear el link.

**Crear páginas por email.** Dirección de entrada por destino: `add+pg_inbox@notiono.example.com` (o alias aleatorio no adivinable). Un worker IMAP (o el relay SMTP del NAS) parsea: asunto → título, cuerpo (markdown/texto) → bloques vía el mismo builder, adjuntos → ficheros. Antispam mínimo: solo remitentes en allowlist del workspace; lo demás se descarta y se audita. Caso real: reenviar una factura desde el móvil y que aparezca como página con el PDF adjunto en "Deducibles".

**Slack/Telegram.** Salientes primero (barato): una suscripción de webhook con `format: "slack"` o `format: "telegram"` hace que Notiono renderice el evento como mensaje legible ("37 movimientos nuevos en *Finanzas 2026*") en vez de JSON. Entrantes: comando `/notiono add ...` → el bot llama a la API pública con el token del usuario vinculado. Telegram ya lo cubre Dobby; Slack solo si aparece un caso real (anti-scope-creep).

## 5. Rate limiting, auditoría y SDK

**Rate limit por token** (no por IP): sliding window en Redis, 3 req/s sostenido con burst 9 (paridad Notion), `429` + `Retry-After` + cabeceras `X-RateLimit-*`. Los tokens internos de Dobby mantienen su cupo alto (300/min); las apps OAuth de terceros, el cupo bajo. Endpoints batch cuentan 1.

**Auditoría:** tabla append-only `AuditLog {id, principal (token/app/user), action, resourceType, resourceId, requestId, ip, at}`. Toda mutación de API pública escribe una fila en la misma transacción. Vista en Ajustes: "qué ha hecho cada integración esta semana", filtrable. Retención 12 meses, exportable a CSV.

**SDK JS** (`@notiono/sdk`, generado del OpenAPI + envoltorio a mano):

```ts
const notiono = new NotionoClient({ auth: process.env.NOTIONO_TOKEN });
const { results } = await notiono.databases.query("col_movs", {
  filter: { property: "mes", select: { equals: "2026-07" } }, sorts: [{ property: "fecha", direction: "desc" }],
});
for await (const page of notiono.search.iterate({ query: "factura" })) { /* pagina solo */ }
```

Incluye: reintento automático en 429/5xx con backoff, iteradores async que ocultan cursores, tipos generados de los fields de cada colección (`pnpm notiono typegen`), y verificación de firmas de webhook (`notiono.webhooks.verify(req)`).

**Orden de construcción** (respetando el roadmap): (1) formalizar REST v1 → pública con OpenAPI y rate limit por token, (2) webhooks robustos (ya eran COULD C3 — suben a SHOULD porque OAuth y GCal dependen de ellos), (3) tokens internos con UI, (4) OAuth 2.0, (5) email-in y GCal, (6) SDK. Slack/Comments quedan detrás de un caso de uso real.

---

**Resumen de decisiones clave:** versionado por cabecera con fecha (estilo Notion/Stripe) sobre `/v1`; un solo motor de filtros con dos sintaxis; OAuth Authorization Code + PKCE con consent screen que selecciona recursos concretos; webhooks at-least-once con firma HMAC timestamped, cola en Postgres y pausa tras 5 fallos; Dobby como app OAuth de primera clase con panel de observabilidad propio; rate limit por token con paridad Notion (3 req/s); auditoría transaccional append-only; SDK generado del OpenAPI con iteradores y verificación de firmas. Palabras: ~1.250. Coherente con la sección 9 existente (misma capa de servicios, mismos prefijos `nly_`/`evt_`/`whsec_`, mismo shape de errores).

---

# PWA, offline y experiencia móvil

## Filosofía: PWA como estrategia móvil (decisión para Jose)

**No habrá apps nativas iOS/Android.** Mantener dos apps nativas más el backend es inasumible para un solo dev (dos lenguajes/toolchains más, revisiones de App Store, firmas, releases sincronizadas: fácilmente 2–3× el coste total del proyecto). La alternativa es una **PWA instalable**: la misma app Next.js, instalada desde el navegador, con icono en el home screen, pantalla completa sin barra de URL, offline y notificaciones push. Para el uso real de Notiono (leer/editar notas, marcar to-dos, mover tarjetas, fotografiar una factura), la PWA da **el 100% del valor perceptible**; lo que se pierde frente a nativo es marginal y está listado honestamente al final. **→ Decisión abierta para Jose (añadir a 12.4, antes de Fase 3):** confirmar PWA como estrategia móvil definitiva, sabiendo que en iOS exige "Añadir a pantalla de inicio" para push y standalone.

## 13.1 PWA instalable sobre Next.js

**Librería: [Serwist](https://serwist.pages.dev)** (`@serwist/next`), el sucesor mantenido de `next-pwa` (abandonado) construido sobre los módulos de Workbox. Razones: soporta App Router y `output: standalone` (nuestro Docker), el service worker se escribe en TypeScript y pasa por el mismo build, y trae precache del app-shell y estrategias de runtime declarativas. Alternativa descartada: SW artesanal — más control, pero reinventa expiración de caches, versionado de precache y navigation fallback, que es justo donde se cometen los errores que dejan a usuarios atrapados en versiones viejas.

`app/manifest.ts` (Next lo sirve como `/manifest.webmanifest`):

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Notiono', short_name: 'Notiono',
    description: 'Notas y bases de datos de la familia Monreal',
    id: '/', start_url: '/', scope: '/',
    display: 'standalone',
    background_color: '#0f0f10', theme_color: '#0f0f10',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {   // ver 13.4
      action: '/api/share', method: 'POST', enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }] },
    },
  } as MetadataRoute.Manifest;
}
```

Detalles que marcan la diferencia: icono **maskable** (Android recorta en círculo), `apple-touch-icon` de 180px y `viewport-fit=cover` + `env(safe-area-inset-*)` en CSS para el notch. Splash en iOS: la genera el propio iOS desde icono + `background_color`; no invertimos en `apple-touch-startup-image` por tamaño de pantalla (mantenimiento absurdo). Instalación: en Android Chrome ofrece el prompt (`beforeinstallprompt` → botón "Instalar Notiono" en ajustes); en iOS es manual (Compartir → Añadir a pantalla de inicio) y mostraremos un tooltip una sola vez.

## 13.2 Offline: qué funciona y cómo

**Qué funciona sin conexión (contrato honesto):**
- **Leer** las últimas ~50 páginas visitadas y el árbol del sidebar (cacheados en IndexedDB al visitarlas).
- **Editar** cualquiera de esas páginas: BlockNote edita contra estado local; el guardado usa la **cola de un elemento por página** ya definida en §7 (Offline básico) — el SW no añade una segunda cola, reutilizamos esa.
- **Crear** páginas nuevas y registros de colecciones (id generado en cliente con `uuidv7`, marcados `pending`; el upsert idempotente de la API absorbe reintentos duplicados).
- **No funciona** offline: gráficas nuevas (requieren agregación en servidor; se muestra el último render cacheado con badge "datos de <fecha>"), búsqueda, subida de ficheros (se encola solo la referencia + blob en IndexedDB).

**Capas de almacenamiento:**

| Capa | Qué guarda | Mecanismo |
|---|---|---|
| Cache Storage (SW) | App-shell, JS/CSS/fuentes, imágenes de `/uploads` | Workbox strategies |
| IndexedDB (`idb`, ~1 KB) | Docs de páginas + versión, árbol, cola pending, blobs de fotos pendientes | Store `pages`, `tree`, `outbox` |
| `navigator.storage.persist()` | — | Pedirlo tras instalar, evita eviction |

**Service worker** (`app/sw.ts` con Serwist):

```ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist, NetworkFirst, StaleWhileRevalidate, CacheFirst, ExpirationPlugin } from 'serwist';

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,          // app-shell: chunks, CSS, fuentes, /offline
  skipWaiting: true, clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith('/api/trpc'),
      handler: new NetworkFirst({ cacheName: 'data', networkTimeoutSeconds: 4 }) },   // solo queries GET
    { matcher: ({ url }) => url.pathname.startsWith('/uploads'),
      handler: new CacheFirst({ cacheName: 'media',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 86400 })] }) },
    { matcher: ({ request }) => ['style', 'script', 'font', 'image'].includes(request.destination),
      handler: new StaleWhileRevalidate({ cacheName: 'assets' }) },
    ...defaultCache,
  ],
  fallbacks: { entries: [{ url: '/offline', matcher: ({ request }) => request.mode === 'navigate' }] },
});
serwist.addEventListeners();
```

Decisiones: **network-first con timeout de 4 s para datos** (frescura ante todo; si el NAS no responde, se sirve el cache y la UI marca "sin conexión"); **las mutaciones nunca pasan por el SW** — las gestiona la cola de la app (§7), que ya sabe de `baseVersion`, CAS y conflictos; un SW replicando eso a ciegas rompería el versionado optimista.

**Sincronización al reconectar:** evento `online` + `visibilitychange` → drenar el outbox (CAS por página; CONFLICT → banner de §7). `Background Sync` API solo como mejora progresiva en Android/Chrome (reintenta aunque cierres la app); en iOS no existe, así que el drenaje en primer plano es el camino principal. **Si algún día se activa Yjs (§7 Fase 3), este diseño encaja sin cambios**: `y-indexeddb` persiste el doc local y el CRDT hace el merge al reconectar — la cola CAS desaparece para docs y queda solo para registros de colecciones.

## 13.3 UX móvil

- **Navegación**: sidebar como drawer deslizable (gesto desde el borde + botón hamburguesa), cerrado por defecto en `<768px`; barra inferior con 4 accesos (Home, Búsqueda, Inbox, +Nueva). Todo objetivo táctil ≥44px.
- **Editor táctil**: BlockNote funciona en móvil, pero afinamos: toolbar de formato **fija sobre el teclado** (en lugar del popover flotante, incómodo con selección táctil), slash-menu a pantalla casi completa, y drag&drop de bloques mediante **pulsación larga en el handle** (el drag nativo de BlockNote/ProseMirror es usable pero fino: aumentamos el hit-area del handle a 44px en touch). `visualViewport` API para que el teclado no tape el cursor.
- **Foto de factura**: en el registro de finanzas, botón "📷 Foto" → `<input type="file" accept="image/*" capture="environment">` abre la cámara trasera directamente. Cliente: recomprime a ~1600px/JPEG 80 (canvas) antes de subir (una factura no necesita 12 MP por HSDPA del pueblo), sube a `/uploads` y adjunta al campo `attachment` del registro. Offline: el blob queda en el outbox de IndexedDB.

## 13.4 Compartir hacia Notiono: Share Target y web clipper

- **Web Share Target** (declarado en el manifest, ver arriba): con Notiono instalada, aparece en la hoja de compartir de Android (iOS no lo soporta — límite honesto). Compartir un enlace, texto o una foto → `POST /api/share` (route handler que valida sesión) → crea una página en **Inbox** con el contenido y notifica. Caso estrella: compartir el PDF de una factura desde la app del banco directamente a Notiono.
- **Web clipper**: extensión de navegador MV3 (Chrome/Firefox, ~200 líneas): botón → coge `document.title`, URL y selección (o `Readability.js` para el artículo entero) → `POST /v1/pages` de la API REST (§9) con un token de scope `pages:write` guardado en las opciones de la extensión. Sin backend nuevo: es un cliente más de la API de Dobby. En iOS, el sustituto es un **Atajo de iOS** que hace el mismo POST (los Atajos hacen peticiones HTTP; coste: escribir una guía de 5 pasos).

## 13.5 Notificaciones push (VAPID) integradas con el inbox

`web-push` (npm) con claves VAPID en secretos del NAS. Tabla `PushSubscription (userId, endpoint UNIQUE, p256dh, auth, userAgent, createdAt)`; el cliente se suscribe tras un gesto explícito (ajustes → "Activar notificaciones", nunca al cargar). Emisor: el mismo worker de eventos de §7/§9 — cuando algo cae en el inbox (mención `@Jose`, ítem de Share Target, aviso de Dobby "extracto importado", recordatorio de fecha), se envía `{title, body, url}`; el SW lo pinta con `self.registration.showNotification` y `notificationclick` abre la URL. Suscripciones caducadas (410) se borran. **iOS**: funciona desde 16.4 **solo si la PWA está instalada** en el home screen — otra razón para la guía de instalación.

## 13.6 Límites honestos PWA vs nativo

| Capacidad | PWA | Impacto en Notiono |
|---|---|---|
| Background sync real (app cerrada) | Solo Android/Chrome; iOS no | Bajo: sync al abrir cubre el caso real |
| Push en iOS | Solo con PWA instalada (16.4+) | Medio: exige instalar; guía de 1 vez |
| Share Target en iOS | No existe | Medio: se cubre con Atajo de iOS |
| Biometría | No hay Face ID "de app"; **passkeys/WebAuthn** dan login con huella/cara | Bajo: passkey como 2º factor futuro (§8 OIDC) |
| Widgets, App Intents, badges iOS | No | Nulo para v1 |
| Almacenamiento | Evictable si hay presión de disco | Mitigado con `storage.persist()` + el servidor es la verdad |

**Fase sugerida:** manifest + instalable + cache de lectura en **Fase 3** (pulido); Share Target, push y clipper en **Fase 4** (familia), que es cuando el inbox y las menciones existen.
