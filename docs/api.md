# API REST (v1)

API para automatizar bases de datos (p. ej. que un asistente mantenga finanzas o tareas).

## Autenticación

Crea un token en **Ajustes → API** (se muestra en claro una sola vez). Cada token está
scopeado a un workspace: la API solo ve/modifica datos de ese espacio.

Ojo: el token es de **espacio completo** — los permisos por página (páginas
restringidas) no se aplican a la API v1. No des un token a quien no deba ver todo el
espacio.

Todas las llamadas llevan la cabecera:

```
Authorization: Bearer ntn_…
```

Errores: JSON `{ "error": "…" }` con código 400 (cuerpo inválido), 401 (token inválido)
o 404 (no existe / no es de tu workspace).

## Endpoints

### Listar bases de datos

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/databases
# → [{ "id": "…", "title": "Finanzas", "icon": "💶" }]
```

### Leer una base de datos (campos + registros)

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/databases/<id>
# → { "id", "title", "icon", "fields": [{ "id", "name", "type" }], "records": [{ "id", "cells", "parentId" }] }
```

Las `cells` son un objeto `{ fieldId: valor }`; usa los `fields` para mapear nombres.

### Crear una base de datos

Crea la base de datos entera de una vez: página, columnas y vistas.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
        "name": "Gastos de casa",
        "icon": "💶",
        "fields": [
          { "name": "Concepto", "type": "text" },
          { "name": "Importe",  "type": "number" },
          { "name": "Estado",   "type": "status" },
          { "name": "Fecha",    "type": "date" }
        ],
        "views": [{ "type": "table" }, { "type": "kanban", "name": "Por estado" }]
      }' \
  http://localhost:3000/api/v1/databases
# → 201 {
#      "id": "<collectionId>", "pageId": "…", "title": "Gastos de casa", "icon": "💶",
#      "fields": [{ "id", "name", "type" }, …],
#      "views":  [{ "id", "name", "type" }, …]
#    }
```

El `id` que devuelve es el de la **base de datos** (la colección), que es el que
piden el resto de rutas; `pageId` es el de su página, para enlazarla.

- `fields` y `views` son opcionales: sin ellos nace con una columna de texto
  («Nombre») y una vista Tabla. Sin ninguna de las dos no se podría ni abrir.
- `parentId` (opcional) la cuelga de otra página del mismo espacio.
- **No** nace con filas de ejemplo, al revés que la creada desde la web.
- Guarda los `id` de las columnas: son la clave de `cells` al crear registros.

Tipos de columna: `text`, `number`, `select`, `multiselect`, `status`, `person`,
`files`, `checkbox`, `date`, `url`, `email`, `phone`, `created_time`,
`last_edited_time`, `created_by`, `last_edited_by`, `id`.
Tipos de vista: `table`, `kanban`, `calendar`, `timeline`, `gallery`, `chart`,
`list`, `form`.

### Añadir una columna

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "name": "Categoría", "type": "select" }' \
  http://localhost:3000/api/v1/databases/<id>/fields
# → 201 { "id", "name", "type" }
```

`afterFieldId` (opcional) coloca la columna nueva justo detrás de esa; sin él va al final.

### Renombrar una columna, cambiar su tipo o su configuración

```bash
# renombrar
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "name": "Categoría del gasto" }' \
  http://localhost:3000/api/v1/fields/<fieldId>

# cambiar el tipo (convierte las celdas)
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "type": "text" }' \
  http://localhost:3000/api/v1/fields/<fieldId>
# → { "id", "name", "type", "config", "converted": 12 }
```

**Cambiar el tipo no es un cambio de nombre**: convierte el valor de todas las
celdas y lo que no se pueda convertir se pierde, además de reescribir las opciones
de la columna. `converted` dice cuántas celdas se tocaron. Si en la misma llamada
envías `config` y `type`, manda el tipo: se aplica el último.

Las columnas calculadas (`relation`, `rollup`, `formula`) no se pueden convertir:
devuelven 400.

### Borrar una columna

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/fields/<fieldId>
# → { "ok": true }   (se pierden sus valores en todas las filas)
```

### Añadir una vista

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "type": "calendar", "name": "Vencimientos" }' \
  http://localhost:3000/api/v1/databases/<id>/views
# → 201 { "id", "name", "type" }
```

Sin `name` se le pone el del tipo («Tabla», «Kanban»…). La vista se configura sola
con lo que encuentra: el Kanban se agrupa por la primera columna de selección y el
calendario usa la primera de fecha.

### Crear una página de documento

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "title": "Actas de reunión", "icon": "📝" }' \
  http://localhost:3000/api/v1/pages
# → 201 { "id", "title", "icon", "parentId" }
```

Nace vacía. El contenido de una página no se escribe todavía por API.

### Crear un registro

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "cells": { "<fieldId>": "Compra super", "<fieldId2>": 42.5 }, "parentId": null }' \
  http://localhost:3000/api/v1/databases/<id>/records
# → 201 { "id", "cells", "parentId", "createdAt" }
```

`parentId` (opcional) crea un sub-elemento de otro registro de la misma base de datos.

### Listar registros (paginado)

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/databases/<id>/records?limit=100"
# → { "records": [{ "id", "cells", "parentId", "createdAt", "updatedAt" }], "next_cursor", "has_more" }
```

`limit` va de 1 a 500 (100 por defecto). Si `has_more` es `true`, pide la siguiente
página repitiendo la llamada con `cursor=<next_cursor>`. `GET /databases/<id>` sigue
devolviendo todos los registros de golpe; para bases de datos grandes usa esto.

### Consultar registros (filtros y orden)

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "filters": [
      { "fieldId": "<fieldId>", "op": "contains", "value": "compra" },
      { "type": "group", "op": "or", "filters": [
        { "fieldId": "<estadoId>", "op": "is", "value": "<optionId>" },
        { "fieldId": "<fechaId>", "op": "this_week", "value": "" }
      ]}
    ],
    "filterOp": "and",
    "sorts": [{ "fieldId": "<fieldId>", "dir": "asc" }],
    "limit": 100
  }' \
  "http://localhost:3000/api/v1/databases/<id>/query"
# → { "records": […], "next_cursor", "has_more", "total" }
```

Usa el **mismo motor que las vistas de la web**: idéntico árbol de filtros (condiciones
`{fieldId, op, value}` y grupos `{type:"group", op, filters}` anidados) e idénticos
operadores — texto: `contains`/`not_contains`/`eq`/`neq`; número: `eq`/`neq`/`gt`/`lt`/
`gte`/`lte`; selección/estado: `is`/`is_not`; fecha: `on`/`before`/`after`/`on_or_before`/
`on_or_after`/`today`/`this_week`/`this_month`… (y `{"rel":"today"}` como valor relativo);
todos: `is_empty`/`not_empty`. `cursor`/`limit` paginan igual que el listado.

### Actualizar celdas (merge)

```bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "cells": { "<fieldId>": "pagado" } }' \
  http://localhost:3000/api/v1/records/<recordId>
```

Solo cambia las celdas incluidas; `null` o `""` borra la celda.

### Escribir el cuerpo de un registro

Cada fila es una página (como en Notion); esto reemplaza su cuerpo entero. Acepta
`{ "markdown": "…" }` (se convierte a bloques en el servidor: encabezados `#`/`##`/`###`,
párrafos, listas `-`/`*` y numeradas, y negrita/cursiva/`código`/enlaces en línea) o
`{ "blocks": [...] }` con bloques BlockNote en crudo.

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "markdown": "## Resultado\n\nTodo **correcto**.\n\n- ver [informe](https://ejemplo.com)" }' \
  http://localhost:3000/api/v1/records/<recordId>/content
# → { "id", "content", "updatedAt" }
```

### Borrar un registro

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/records/<recordId>
# → { "ok": true }  (borra también sus sub-elementos)
```


---

## Errores

Todos los errores son JSON `{ "error": "…" }` con el código que toca:

| Código | Cuándo |
|---|---|
| 400 | el cuerpo no vale (falta un campo, un tipo que no existe), o la operación no se puede hacer (borrar la última vista, convertir una columna calculada) |
| 401 | falta el token o no vale |
| 404 | el recurso no existe **o no es de tu espacio** — desde el token son lo mismo a propósito: así no se puede averiguar qué existe en otro espacio probando ids |

## Probar que todo funciona

```bash
BASE_URL=https://notiono.monrealperez.com NOTIONO_TOKEN=ntn_… npm run check:api
```

Crea una base de datos con columnas y vistas, añade otra columna, la renombra, le
cambia el tipo, añade una vista, escribe un registro y lo vuelve a leer, y comprueba
que sin token responde 401 y que lo de otro espacio responde 404. Deja la base de
datos de prueba creada y dice su id para poder borrarla.

## Avisos salientes (webhooks)

En **Ajustes → Avisos salientes** (solo el propietario del espacio) puedes registrar una URL.
Notiono enviará un `POST` cada vez que se cree, edite o borre una fila de cualquier base de
datos del espacio.

Cuerpo:

```json
{
  "event": "record.created",
  "workspaceId": "cl…",
  "at": "2026-08-19T18:20:00.000Z",
  "data": { "recordId": "cl…", "collectionId": "cl…", "cells": { "…": "…" } }
}
```

Eventos: `record.created`, `record.updated` (incluye `fieldId`), `record.deleted`,
`page.created` y `page.published` (incluye la ruta pública).

Cabeceras:

| Cabecera | Contenido |
|---|---|
| `X-Notiono-Event` | nombre del evento |
| `X-Notiono-Signature` | `HMAC-SHA256(secreto, cuerpo)` en hexadecimal |

Comprobar la firma en Node:

```js
const esperado = crypto.createHmac("sha256", SECRETO).update(cuerpoCrudo).digest("hex");
const valido = esperado === req.headers["x-notiono-signature"];
```

El secreto se muestra **una sola vez** al crear el aviso.

Si tu servicio no responde o falla por su lado (5xx), Notiono reintenta **tres veces**
(1 s, 5 s y 25 s). Si el destino rechaza la petición (4xx) no insiste, porque reintentarlo
daría el mismo resultado. En Ajustes se ve el código del último intento (`0` = no respondió).

## Formulario público (sin token de API)

`POST /api/form/<token>` recibe los envíos del formulario público (`/f/<token>`; el
token se genera con «Compartir formulario» en la vista Formulario). No usa la
autenticación de la API: el propio token del enlace ES la autorización.

```bash
curl -X POST https://tu-notiono/api/form/<token> \
  -H 'Content-Type: application/json' \
  -d '{ "cells": { "<fieldId>": "valor" } }'
# → { "ok": true, "id": "<recordId>" }
```

- Solo acepta **campos visibles** de la vista y de tipos compatibles (texto, número,
  selección, estado, fecha `AAAA-MM-DD`, casilla, URL, correo, teléfono); el resto se
  ignora sin error. Cada valor se valida por tipo.
- Los **campos obligatorios** de la vista devuelven `400 { "error": "required", "fields": [nombres] }` si faltan.
- **Límite**: 30 envíos por IP y formulario cada 10 minutos → `429 { "error": "rate_limited" }`.
- El alta dispara los webhooks (`record.created`) como cualquier otra.
