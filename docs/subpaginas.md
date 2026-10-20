# Subpáginas: árbol y enlace, un solo objeto

Una subpágina y su enlace en la madre (un párrafo con SOLO la mención de la página, lo
que deja `/subpágina`) son lo mismo, como los bloques «página» de Notion. El servidor
los mantiene a la par por operaciones de bloque en el documento Yjs vivo de la madre
(`src/server/subpaginas.ts`), así que quien la tenga abierta lo ve al momento y lo
que esté escribiendo no se pisa.

| Qué haces | Qué pasa |
|---|---|
| Crear una hija (panel lateral, app, API) | Su enlace, al final de la madre |
| Renombrarla / cambiarle el icono | El enlace (y toda mención) se pone al día |
| Moverla a otra madre («Mover a», arrastrar en el árbol o soltar el bloque en el panel lateral) | El enlace sale de la vieja y va al final de la nueva |
| Mandarla a la papelera desde el árbol, el menú ⋯ o la app | Su enlace sale de la madre y se guarda dónde estaba (`Page.sitioEnlace`) |
| Borrar su enlace en la madre (Supr, «Eliminar» del menú de los 6 puntos, el móvil, la app nativa) | La hija va a la papelera con su subárbol; el editor avisa «… movida a la papelera · Deshacer» |
| Deshacer (Ctrl+Z) o pegar el enlace cortado | Si ya estaba en la papelera, sale de ella |
| Restaurarla de la papelera | Vuelve con lo que se fue a la vez, y su enlace a su sitio (o al final si ese sitio ya no existe). Nunca dos |
| Restaurarla con la madre aún en la papelera | Vuelve a la raíz del espacio, como en Notion |
| Purga a los 30 días, «Vaciar papelera», borrar del todo | Se quitan los enlaces que apuntaran a lo borrado en cualquier página |
| Restaurar una versión del historial | No cambia qué páginas existen: las hijas vivas que la versión no tenía se enlazan al final y los enlaces a hijas en la papelera no vuelven |

Las hijas que se van con su madre a la papelera conservan sus enlaces dentro de ella:
al restaurar, el subárbol vuelve intacto.

## Cómo distingue borrar de mover (servidor de colaboración)

La regla vive en `collab/hocuspocus.ts`, no en el navegador: así vale igual para la
web, el móvil y la app nativa, que escriben todos en el mismo documento.

- Cada vez que Hocuspocus guarda un documento (unos 2 s tras el último cambio) se
  resumen sus enlaces (`resumenEnlaces` en `src/lib/subpaginas.ts`) y se comparan con
  los del guardado anterior (`cambiosEnlaces`). Se mira el **estado**, no las
  operaciones: mover un bloque (dentro de la página o entre columnas), cortarlo y
  pegarlo, que lo toque otra pestaña o que llegue la edición sin conexión (Yjs nunca
  borra lo que ese cliente no vio) no cambian el estado.
- Un enlace cuenta como quitado solo si no queda **ningún** enlace a esa página y
  su bloque, si sigue, ya no la menciona (convertirlo en título o escribir junto al
  chip no es borrarlo).
- Se espera un margen (`MARGEN_PAPELERA`, 4 s) y se vuelve a mirar el documento vivo.
  Solo entonces, y solo si la página sigue siendo **hija de esa madre** (lo que se
  movió a otra madre ya no lo es) y no está ya en la papelera, se archiva.
- Si aparece el enlace a una hija que está en la papelera, sale de ella. Por eso
  cortar y pegar mucho más tarde también acaba bien.
- Un documento recién abierto o sin estrenar no tiene «antes»: nunca archiva nada.
- Las menciones dentro de un texto y los enlaces a páginas que no son hijas no
  archivan nunca.

## Reparar lo que dejó suelto la versión anterior

Antes de esto, borrar en el árbol dejaba el enlace en la madre y borrar el enlace
dejaba la página en el árbol. La reparación lo arregla sin borrar páginas ni
contenido:

- hija viva sin enlace en su madre viva → se crea el enlace al final de la madre;
- enlace a una hija que está en la papelera → se quita (vuelve al restaurarla, a ese sitio);
- enlace a una página que ya no existe → se quita;
- dos enlaces a la misma hija → se deja el primero.

No toca menciones dentro de un texto ni enlaces a páginas que no son hijas. Es
idempotente: una segunda pasada dice «Nada que arreglar.».

Va dentro de la imagen (`collab/dist/reparar-subpaginas.mjs`, lo compila
`npm run build:collab`) y no escribe en la base de datos por su cuenta: firma con
`AUTH_SECRET` una petición a `POST /api/interno/reparar-subpaginas` del servidor en
marcha, que escribe en el documento vivo de cada página. Por eso la app tiene que
estar levantada.

```bash
# En seco: lista lo que haría (espacio, madre e hija con id y título, arreglo). No cambia nada.
sudo docker exec notiono-app node collab/dist/reparar-subpaginas.mjs

# Aplicando
sudo docker exec notiono-app node collab/dist/reparar-subpaginas.mjs --aplicar

# Solo un espacio de trabajo
sudo docker exec notiono-app node collab/dist/reparar-subpaginas.mjs --espacio <id-del-espacio> [--aplicar]
```

Fuera del contenedor (en local): `AUTH_SECRET=… node collab/dist/reparar-subpaginas.mjs --url http://127.0.0.1:3100`.

## Pruebas

- `npm run check`: la lógica pura (resumen y cambios de enlaces, sitios, arreglos).
- `scripts/integracion-subpaginas.ts` contra un Notiono local con `/collab` (ver
  «La app entera en local» en `docs/movil.md`), con `BASE_URL`, `SESION`,
  `DATABASE_URL` y `AUTH_SECRET` de esa instalación. `SOLO=borrado` o
  `SOLO=reparacion` para pasar solo esa parte (son las lentas: esperan el margen).
