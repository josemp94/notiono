"use client";

import { useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { createUserStore } from "@blocknote/core";
import { DefaultThreadStoreAuth } from "@blocknote/core/comments";
import { YjsThreadStore } from "@blocknote/core/yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { trpc } from "@/trpc/react";

/** Colores de cursor: estables por usuario, para reconocerse de un vistazo. */
const CURSOR_COLORS = ["#ff5c28", "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#eab308"];
const colorFor = (id: string) =>
  CURSOR_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CURSOR_COLORS.length];

export type Collaboration = {
  fragment: Y.XmlFragment;
  /** Copia local del documento: abre al instante y aguanta sin conexión. */
  local: IndexeddbPersistence;
  provider: HocuspocusProvider;
  user: { name: string; color: string };
  /** Hilos de comentarios en línea: viven en el mismo documento, así que se guardan solos. */
  threadStore: YjsThreadStore;
  /** Cache compartida de nombres y avatares, para cursores y comentarios. */
  userStore: ReturnType<typeof createUserStore>;
  /**
   * Contenido con el que hay que estrenar el documento compartido, o null si ya
   * lo estrenó otro. Lo siembra el navegador porque convertir bloques a Yjs
   * necesita el esquema del editor, que no se puede cargar en el servidor.
   */
  seed: unknown[] | null;
  /** Ya está sembrado (o no hacía falta): la semilla guardada sobra. */
  semillaUsada: () => void;
};

/**
 * El servidor entrega el contenido para estrenar la página UNA sola vez (es lo
 * que evita que dos pestañas lo dupliquen). Si el editor se vuelve a montar
 * antes de sembrar —React lo hace, y también al volver atrás o reconectar—, la
 * segunda petición recibe null y la página se abría vacía, con el riesgo de que
 * lo primero que se escribiera pisara el contenido de verdad. Por eso la
 * semilla se guarda aquí hasta que se usa, y la petición en curso se comparte.
 */
const semillas = new Map<string, unknown[]>();
const preparando = new Map<string, Promise<unknown[] | null>>();
function preparar(
  pageId: string,
  pedir: (i: { id: string }) => Promise<{ seed: unknown }>,
): Promise<unknown[] | null> {
  let p = preparando.get(pageId);
  if (!p) {
    p = pedir({ id: pageId })
      .then((r) => {
        if (Array.isArray(r.seed) && r.seed.length) semillas.set(pageId, r.seed);
        return semillas.get(pageId) ?? null;
      })
      .finally(() => preparando.delete(pageId));
    preparando.set(pageId, p);
  }
  return p;
}

/**
 * Conecta la página al servidor de edición simultánea, si la instalación tiene uno
 * (NEXT_PUBLIC_COLLAB_URL). Sin esa variable devuelve null y el editor sigue
 * funcionando como siempre, con su autosave: la colaboración es opcional.
 *
 * El permiso de sala NO es la cookie: el WebSocket no pasa por el resto de la app,
 * así que la web emite un token firmado (una hora, solo para esta página) que viaja
 * dentro del protocolo de Hocuspocus.
 */
export function useCollaboration(
  pageId: string,
  me?: { id: string; name: string | null; email: string } | null,
): { collab: Collaboration | null; fallo: boolean } {
  const url = process.env.NEXT_PUBLIC_COLLAB_URL;
  // El contenido a sembrar (o null si siembra otro); null-de-estado = aún no se sabe.
  const [inicio, setInicio] = useState<{ seed: unknown[] | null } | null>(null);
  const [fallo, setFallo] = useState(false);
  const utils = trpc.useUtils();
  const ensureYdoc = trpc.pages.ensureYdoc.useMutation();
  const collabToken = trpc.pages.collabToken.useMutation();

  // Antes de conectar hay que preparar el documento: quien llega primero se lleva
  // el contenido de la página para estrenarlo, o el primero en entrar la vería vacía.
  const ensureMutate = ensureYdoc.mutateAsync;
  const tokenMutate = collabToken.mutateAsync;
  useEffect(() => {
    if (!url || !me) return;
    let cancelled = false;
    setInicio(null);
    setFallo(false);
    preparar(pageId, ensureMutate)
      .then((seed) => !cancelled && setInicio({ seed }))
      // El editor sigue funcionando con su autosave, pero a solas: eso hay que
      // decirlo. Callarlo fue justo lo que dejó la colaboración rota sin que se
      // notara, con cada pestaña escribiendo en su propia copia.
      .catch(() => !cancelled && setFallo(true));
    return () => {
      cancelled = true;
    };
  }, [url, me, pageId, ensureMutate]);

  const collab = useMemo(() => {
    if (!url || !inicio || !me) return null;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url,
      name: pageId,
      document: doc,
      /**
       * Permiso firmado que emite la web para esta página. Es una función a
       * propósito: el proveedor la llama en cada (re)conexión, así que un permiso
       * caducado —duran una hora— se renueva solo. Antes, quien dejaba la página
       * abierta toda la tarde se quedaba sin sincronizar al volver, y encima en
       * silencio, porque el servidor corta la sesión sin dar explicaciones.
       */
      token: async () => (await tokenMutate({ id: pageId })).token,
    });
    // Los miembros del espacio, para poner cara y nombre a cursores y comentarios.
    const userStore = createUserStore(async (userIds: string[]) => {
      const miembros = await utils.workspace.members.fetch();
      return userIds.map((id) => {
        const m = miembros?.members?.find((x) => x.userId === id);
        return { id, username: m?.name || m?.email || "Alguien", avatarUrl: "" };
      });
    });

    // Copia en el propio navegador: la página abre con lo último que se vio aunque
    // no haya red, y lo escrito sin conexión se fusiona al volver (Yjs resuelve el
    // cruce de cambios; por eso no hace falta preguntar "¿qué versión conservo?").
    const local = new IndexeddbPersistence(`notiono-${pageId}`, doc);

    return {
      provider,
      local,
      fragment: doc.getXmlFragment("document-store"),
      user: { name: me.name || me.email || "Alguien", color: colorFor(me.id) },
      threadStore: new YjsThreadStore(
        me.id,
        doc.getMap("threads"),
        // Un invitado de solo lectura no puede comentar: el servidor rechaza sus escrituras.
        new DefaultThreadStoreAuth(me.id, "editor"),
      ),
      userStore,
      seed: inicio.seed,
      semillaUsada: () => semillas.delete(pageId),
    };
  }, [url, inicio, me, pageId, utils, tokenMutate]);

  // Al cambiar de página se cierra la conexión anterior.
  useEffect(() => {
    return () => {
      collab?.provider.destroy();
      // La copia local se cierra, pero NO se borra: es lo que permite abrir sin red.
      collab?.local.destroy();
    };
  }, [collab]);

  return { collab, fallo };
}
