"use client";

import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, Smartphone } from "lucide-react";
import { confirmar } from "@/components/Confirmar";
import { AbrirAlIniciar } from "@/components/AbrirAlIniciar";
import { AjustesEspacio, PersonasEspacio } from "@/components/Espacios";
import { trpc } from "@/trpc/react";
import apk from "@/lib/apk.json";
import { WEBHOOK_EVENTS } from "@/lib/webhookEvents";
import { usePeople } from "@/components/database/Cell";
import { exportaZipConEditor } from "@/components/editor/exportarZip";
import type { PaginaExport } from "@/lib/exportZip";

export default function SettingsPage() {
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  // Sembrar una sola vez: re-sembrar en cada refetch (foco, poll) machacaba
  // lo que se estuviera tecleando.
  const sembrado = useRef(false);
  useEffect(() => {
    if (me?.name && !sembrado.current) {
      sembrado.current = true;
      setName(me.name);
    }
  }, [me?.name]);

  // #espacio / #personas (desde el selector de espacios): esas secciones se pintan al
  // llegar los datos, después del salto del navegador, así que se baja a mano.
  const saltado = useRef(false);
  useEffect(() => {
    if (!me || saltado.current) return;
    saltado.current = true;
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [me]);

  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      setNameMsg("Guardado");
      utils.auth.me.invalidate();
    },
    onError: (e) => setNameMsg(e.message),
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:px-8 md:py-12">
      <h1 className="font-display mb-6 text-2xl font-extrabold md:text-3xl">Ajustes</h1>

      {/* Como Notion: lo tuyo («Mi cuenta») y lo del espacio activo, cada uno en su grupo. */}
      <GrupoAjustes titulo="Mi cuenta" />
      <section className="mb-8">
        <div className="mb-2 text-sm text-[var(--muted)]">Cuenta (SSO)</div>
        <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          {me?.email ?? "…"}
          {me?.role === "admin" && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">admin</span>}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 font-bold">Nombre visible</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={() => {
              setNameMsg(null);
              updateProfile.mutate({ name });
            }}
            disabled={updateProfile.isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
        {nameMsg && <p className="mt-2 text-xs text-[var(--muted)]">{nameMsg}</p>}
      </section>

      <section className="mt-8">
        <h2 className="font-display mb-2 font-bold">Al abrir Notiono, mostrar</h2>
        <AbrirAlIniciar />
      </section>

      <PushSection />
      <AppSection />
      <CopiaNasSection />

      <GrupoAjustes titulo={`Espacio · ${me?.workspace?.name ?? "…"}`} />
      <AjustesEspacio />
      {/* Un invitado solo tiene las páginas que le compartieron: nada del espacio entero. */}
      {me && me.wsRole !== "guest" && (
        <>
          <section id="personas" className="mt-8 scroll-mt-4">
            <h2 className="font-display mb-2 font-bold">Personas</h2>
            <PersonasEspacio />
          </section>
          <BackupSection />
          <ApiTokensSection />
          <WebhooksSection />
        </>
      )}

      <GrupoAjustes titulo="Instalación" />
      <EstadoSection />
    </div>
  );
}

function ApiTokensSection() {
  const utils = trpc.useUtils();
  const { data: tokens } = trpc.apiTokens.list.useQuery();
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const create = trpc.apiTokens.create.useMutation({
    onSuccess: ({ token }) => {
      setNewToken(token);
      setName("");
      utils.apiTokens.list.invalidate();
    },
  });
  const revoke = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => utils.apiTokens.list.invalidate(),
  });
  const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString() : "nunca");

  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 font-bold">API</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Tokens para la API REST (<code>/api/v1</code>) de este espacio. Cada token puede lo mismo que
        tú: no ve las páginas restringidas a las que no te han invitado. Ver <code>docs/api.md</code>.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del token (p. ej. «asistente finanzas»)"
          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() => name.trim() && create.mutate({ name: name.trim() })}
          disabled={create.isPending || !name.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Crear token
        </button>
      </div>
      {newToken && (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">
          <p className="mb-1 text-xs text-[var(--muted)]">
            Copia el token ahora: no se volverá a mostrar.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs">{newToken}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newToken)}
              className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--hover)]"
            >
              Copiar
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 space-y-1">
        {tokens?.length === 0 && <p className="text-xs text-[var(--muted)]">Sin tokens.</p>}
        {tokens?.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              {t.name}
              {t.autor && <span className="text-xs text-[var(--muted)]"> · de {t.autor}</span>}
            </span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              creado {fmt(t.createdAt)} · usado {fmt(t.lastUsed)}
            </span>
            <button
              onClick={async () => {
                if (await confirmar(`¿Revocar el token «${t.name}»?`, "Revocar")) revoke.mutate({ id: t.id });
              }}
              className="shrink-0 text-xs text-red-500 hover:underline"
            >
              Revocar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Copia de seguridad del espacio entero: páginas en Markdown, BDs en CSV, adjuntos. */
function BackupSection() {
  const utils = trpc.useUtils();
  const people = usePeople();
  const [estado, setEstado] = useState<string | null>(null);

  async function descargar() {
    setEstado("Preparando…");
    try {
      const pages = await utils.pages.exportTree.fetch({ pageId: null });
      const r = await exportaZipConEditor({
        pages: pages as unknown as PaginaExport[],
        rootId: null,
        people,
        nombre: "notiono_copia",
        onProgress: setEstado,
      });
      setEstado(`Listo: ${r.paginas} páginas${r.adjuntos ? ` y ${r.adjuntos} adjuntos` : ""}.`);
    } catch {
      setEstado("No se pudo generar la copia.");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-display mb-2 font-bold">Copia de seguridad</h2>
      <p className="mb-2 text-sm text-[var(--muted)]">
        Descarga todo el espacio en un ZIP: las páginas en Markdown, las bases de datos en CSV y
        los adjuntos que referencian.
      </p>
      <button
        onClick={descargar}
        disabled={estado !== null && !estado.startsWith("Listo") && !estado.startsWith("No se pudo")}
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <Download size={15} /> Descargar copia (ZIP)
      </button>
      {estado && <p className="mt-2 text-xs text-[var(--muted)]">{estado}</p>}
    </section>
  );
}

/**
 * «Copia en el NAS»: la hace la app de Android (Ajustes → Copia en el NAS), que sube un
 * Word por página a tu Synology Drive; aquí solo se ve cómo le fue (lo que informa la app,
 * sin credenciales). Notion no tiene copia automática (notion.com/es/help/back-up-your-data).
 */
function CopiaNasSection() {
  const { data: c } = trpc.app.estadoCopia.useQuery();
  const fecha = (d: Date | string) =>
    new Date(d).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 flex items-center gap-2 font-bold">
        <HardDrive size={16} /> Copia en el NAS
      </h2>
      {!c || !c.activa ? (
        <p className="text-sm text-[var(--muted)]">
          La app de Android puede guardar sola una copia en Word de tus páginas en tu Synology Drive (una
          carpeta por página con subpáginas o base de datos), cada 6 horas y al poco de editar. Se activa en la
          app: <b>Ajustes → Copia en el NAS</b>. Tu contraseña del NAS se queda en el móvil.
        </p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <div>
            {c.ultima ? `Última copia: ${fecha(c.ultima)}` : "Aún no ha terminado ninguna copia"}
            {c.ultima && ` · ${c.paginas} ${c.paginas === 1 ? "página" : "páginas"}`}
          </div>
          {c.carpeta && <div className="text-xs text-[var(--muted)]">En {c.carpeta}, en tu Synology Drive</div>}
          {c.error && <div className="mt-1 text-xs text-red-500">Último error: {c.error}</div>}
          <div className="mt-1 text-xs text-[var(--muted)]">
            La hace la app de Android (Ajustes → Copia en el NAS) · informó {fecha(c.actualizado)}
          </div>
        </div>
      )}
    </section>
  );
}

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * La app nativa de Android, para descargar desde aquí: el APK viaja dentro del
 * despliegue (`public/notiono.apk`, versión en `src/lib/apk.json`), así que siempre es
 * el de esta versión. La app avisa sola cuando hay una más nueva (`/api/app/version`).
 * En el ordenador sigue valiendo instalar la web desde Chrome/Edge; en Android, no:
 * ahí se instala la app (ver `SwRegister`).
 */
function AppSection() {
  const mb = (apk.bytes / 1024 / 1024).toFixed(1).replace(".", ",");
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (/Android/i.test(navigator.userAgent)) return;
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <section className="mt-10">
      <h2 className="font-display mb-1 flex items-center gap-2 font-bold">
        <Smartphone size={16} /> App de Android
      </h2>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Notiono nativa para el móvil: páginas, bases de datos y bandeja con avisos, widgets en la
        pantalla de inicio (nota, tareas, acciones rápidas, páginas recientes) y «Compartir con
        Notiono» desde otras apps. Funciona sin conexión: lo último que viste se queda en el móvil y
        los cambios se mandan al volver la red. Cuando hay una versión nueva, la propia app avisa.
      </p>
      <a
        href="/notiono.apk"
        download="notiono.apk"
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
      >
        <Download size={16} /> Descargar el APK
      </a>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Versión {apk.version} · {mb} MB · Android 8 o superior
      </p>
      <details className="mt-3 text-sm text-[var(--muted)]">
        <summary className="cursor-pointer">Cómo se instala</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Descarga el archivo en el móvil y ábrelo.</li>
          <li>
            Android avisará de que viene de fuera de su tienda: dale permiso a Chrome esa vez.
            Es lo normal al instalar una app que no está en Play Store.
          </li>
          <li>
            Si tenías la app anterior de Notiono, se instala encima (es la misma firma) y no
            hay que quitarla antes.
          </li>
          <li>Entra con tu cuenta la primera vez y ya se queda.</li>
          <li>Para los widgets: mantén pulsado el fondo de la pantalla de inicio → Widgets → Notiono.</li>
        </ol>
        <p className="mt-2">
          En iPhone no hay app: se abre esta web en Safari y se usa Compartir → «Añadir a
          pantalla de inicio».
        </p>
      </details>
      <p className="mt-3 text-sm text-[var(--muted)]">
        En el ordenador:{" "}
        {deferred ? (
          <button
            onClick={async () => {
              await deferred.prompt();
              setDeferred(null);
            }}
            className="text-brand hover:underline"
          >
            Instalar Notiono
          </button>
        ) : (
          <>
            «Instalar» desde <b>Chrome</b> o <b>Edge</b> (icono a la derecha de la barra de
            direcciones).
          </>
        )}
      </p>
    </section>
  );
}

/**
 * Estado de la instalación. Sirve para saber, sin entrar al servidor, si el último
 * despliegue dejó activas las piezas que dependen de la configuración.
 */
function EstadoSection() {
  const [salud, setSalud] = useState<{ collab?: string | null; ts?: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setSalud)
      .catch(() => setError(true));
  }, []);

  const fila = (nombre: string, ok: boolean, detalle: string) => (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span className={`size-2 rounded-full ${ok ? "bg-green-500" : "bg-amber-500"}`} />
      <span className="font-medium">{nombre}</span>
      <span className="text-[var(--muted)]">{detalle}</span>
    </li>
  );

  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 font-bold">Estado</h2>
      <p className="mb-2 text-xs text-[var(--muted)]">
        Cómo ha quedado el último despliegue. Si algo sale en ámbar, la función está apagada.
      </p>
      {error && <p className="text-sm text-red-500">No se ha podido consultar el estado.</p>}
      {salud && (
        <ul>
          {fila(
            "Edición simultánea",
            Boolean(salud.collab),
            salud.collab ? salud.collab : "apagada: al compilar no se indicó la dirección del servidor",
          )}
          {fila("Servidor", true, `respondió a las ${new Date(salud.ts ?? Date.now()).toLocaleTimeString()}`)}
        </ul>
      )}
    </section>
  );
}

/**
 * Avisos push: hay que activarlos en cada dispositivo, porque la suscripción es
 * del navegador, no de la cuenta.
 */
function PushSection() {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [soportado, setSoportado] = useState(true);
  const { data: publicKey } = trpc.push.publicKey.useQuery();
  const { data: suscrito, refetch } = trpc.push.isSubscribed.useQuery(
    { endpoint: endpoint ?? "" },
    { enabled: Boolean(endpoint) },
  );
  const subscribe = trpc.push.subscribe.useMutation({ onSuccess: () => refetch() });
  const unsubscribe = trpc.push.unsubscribe.useMutation({ onSuccess: () => refetch() });

  // ¿Este navegador ya tiene suscripción? (el service worker se registra en producción)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSoportado(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEndpoint(sub?.endpoint ?? null))
      .catch(() => setSoportado(false));
  }, []);

  const activar = async () => {
    setEstado(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setEstado("Has bloqueado los avisos en este navegador.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey!,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await subscribe.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh!,
        auth: json.keys!.auth!,
      });
      setEndpoint(json.endpoint!);
      setEstado("Listo: este dispositivo recibirá avisos.");
    } catch {
      setEstado("No se ha podido activar en este navegador.");
    }
  };

  const desactivar = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribe.mutateAsync({ endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setEndpoint(null);
    setEstado("Avisos desactivados en este dispositivo.");
  };

  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 font-bold">Avisos en el móvil y el escritorio</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Recibe una notificación cuando te mencionen o te toque una tarea, aunque no tengas Notiono
        abierto. Hay que activarlo <b>en cada dispositivo</b>. En el móvil, instala antes la app
        desde el navegador.
      </p>
      {!soportado ? (
        <p className="text-sm text-[var(--muted)]">Este navegador no admite avisos push.</p>
      ) : suscrito ? (
        <button
          onClick={desactivar}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-brand hover:text-[var(--foreground)]"
        >
          Desactivar en este dispositivo
        </button>
      ) : (
        <button
          onClick={activar}
          disabled={!publicKey}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Activar en este dispositivo
        </button>
      )}
      {estado && <p className="mt-2 text-xs text-[var(--muted)]">{estado}</p>}
    </section>
  );
}

/** Avisos salientes: una URL propia recibe un POST firmado cuando cambian las filas. */
function WebhooksSection() {
  const utils = trpc.useUtils();
  const { data: hooks } = trpc.webhooks.list.useQuery();
  const { data: me } = trpc.workspace.members.useQuery();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const create = trpc.webhooks.create.useMutation({
    onSuccess: (r) => {
      setSecret(r.secret);
      setUrl("");
      utils.webhooks.list.invalidate();
    },
  });
  const remove = trpc.webhooks.remove.useMutation({ onSuccess: () => utils.webhooks.list.invalidate() });

  if (!me?.isOwner) return null; // solo el propietario del espacio

  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 font-bold">Avisos salientes (webhooks)</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Notiono enviará un POST a esta dirección cuando se cree, edite o borre una fila, se cree
        una página o se publique una en la web. Si tu servicio no responde, lo reintenta tres veces
        (1 s, 5 s y 25 s). El cuerpo va firmado en la cabecera <code>X-Notiono-Signature</code> (HMAC-SHA256
        con el secreto), para que puedas comprobar que el aviso viene de aquí.
      </p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mi-servicio.local/hooks/notiono"
          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() =>
            url.trim() &&
            create.mutate({ url: url.trim(), events: [...WEBHOOK_EVENTS] })
          }
          disabled={create.isPending || !url.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Añadir aviso
        </button>
      </div>
      {create.error && <p className="mt-2 text-xs text-red-500">{create.error.message}</p>}
      {secret && (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">
          <p className="mb-1 text-xs text-[var(--muted)]">Copia el secreto ahora: no se volverá a mostrar.</p>
          <code className="break-all text-xs">{secret}</code>
        </div>
      )}
      <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {(hooks ?? []).map((h) => (
          <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{h.url}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {h.lastAt
                ? `último: ${h.lastStatus === 0 ? "sin respuesta" : h.lastStatus} · ${new Date(h.lastAt).toLocaleDateString()}`
                : "sin enviar aún"}
            </span>
            <button onClick={() => remove.mutate({ id: h.id })} className="shrink-0 text-xs text-[var(--muted)] hover:text-red-500">
              Quitar
            </button>
          </li>
        ))}
        {!hooks?.length && <li className="px-3 py-3 text-sm text-[var(--muted)]">Ningún aviso configurado.</li>}
      </ul>
    </section>
  );
}

/** Rótulo de cada grupo de ajustes (Mi cuenta, Espacio…), como los del menú de Ajustes de Notion. */
function GrupoAjustes({ titulo }: { titulo: string }) {
  return (
    <div className="mb-4 mt-12 truncate border-b border-[var(--border)] pb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)] first:mt-0">
      {titulo}
    </div>
  );
}
