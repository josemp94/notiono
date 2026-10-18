/**
 * Servidor de Notiono.
 *
 * Sirve la app de Next y, en el mismo puerto, la edición simultánea bajo /collab.
 * Van juntos a propósito: el proxy inverso de Synology solo enruta por host y
 * puerto (no admite rutas), así que separar el WebSocket obligaría a un subdominio
 * o a otro proxy delante. Con esto, el DSM sigue apuntando a un único destino.
 *
 * Este fichero NO pasa por el compilador de Next (así lo exige un servidor propio):
 * debe ser JavaScript que Node entienda tal cual. La parte con TypeScript vive en
 * collab/ y se compila a collab/dist/hocuspocus.mjs con `npm run build`.
 */
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { attachConnection, createHocuspocus, puenteApp } from "./collab/dist/hocuspocus.mjs";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const COLLAB_PATH = "/collab";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const hocuspocus = createHocuspocus();
// La app nativa escribe en las páginas a través de Next, que corre en este mismo
// proceso: así sus cambios entran en el documento vivo (src/server/app/documento.ts).
globalThis.__notionoColab = puenteApp(hocuspocus);
// noServer: las conexiones llegan por el "upgrade" de nuestro propio servidor.
const wss = new WebSocketServer({ noServer: true });

const server = createServer((req, res) => handle(req, res));

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (pathname !== COLLAB_PATH && !pathname.startsWith(`${COLLAB_PATH}/`)) {
    // Cualquier otro upgrade (por ejemplo el del modo desarrollo de Next) no es nuestro.
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => attachConnection(hocuspocus, ws, request));
});

server.listen(port, hostname, () => {
  console.log(`[notiono] web y edición simultánea (${COLLAB_PATH}) en http://${hostname}:${port}`);
});
