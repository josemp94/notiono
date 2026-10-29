"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  CircleCheck,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileText,
  Globe,
  GripVertical,
  Link2,
  MoreHorizontal,
  Plus,
  Pin,
  RotateCcw,
  Settings2,
  Star,
  StickyNote,
  X,
  Zap,
} from "lucide-react";
import { AccionesRapidas, BlocNotas, ElegirBdTareas, ElegirNota, ListaRecordatorios, NotaFijada, TARJETA } from "@/components/inicio/BloquesNuevos";
import { trpc } from "@/trpc/react";
import { getRecents, RECENTS_EVENT, type Recent } from "@/lib/recents";
import { fechaTarea } from "@/lib/cellText";
import {
  destinoAlIniciar,
  diaLocal,
  inicioPorDefecto,
  lleva,
  mueve,
  proximasFechas,
  saludoInicio,
  tareasDeHoy,
  TITULO_BLOQUE,
  urlValida,
  type BloqueInicio,
  type ConfigInicio,
  type EnlaceInicio,
} from "@/lib/inicio";
import { tomaArranqueEnInicio } from "@/lib/arranque";
import { IconoPagina } from "@/components/PageIcon";
import { MovePageModal } from "@/components/MovePage";
import { AbrirAlIniciar, useInicio } from "@/components/AbrirAlIniciar";
import { BotonPanel } from "@/components/AppShell";
import { coverStyle } from "@/components/PageCover";

const BLOQUE: Record<BloqueInicio, { titulo: string; icono: ReactNode; vacio: string }> = {
  recientes: { titulo: TITULO_BLOQUE.recientes, icono: <Clock size={15} />, vacio: "Aún no has abierto ninguna página en este dispositivo." },
  tareas: { titulo: TITULO_BLOQUE.tareas, icono: <CircleCheck size={15} />, vacio: "No tienes nada asignado." },
  hoy: { titulo: TITULO_BLOQUE.hoy, icono: <CalendarCheck size={15} />, vacio: "Nada para hoy ni vencido." },
  proximas: { titulo: TITULO_BLOQUE.proximas, icono: <CalendarDays size={15} />, vacio: "Nada en los próximos 7 días." },
  favoritos: { titulo: TITULO_BLOQUE.favoritos, icono: <Star size={15} />, vacio: "Marca páginas con la estrella para verlas aquí." },
  enlaces: { titulo: TITULO_BLOQUE.enlaces, icono: <Link2 size={15} />, vacio: "Fija páginas o webs que uses a menudo." },
  acciones: { titulo: TITULO_BLOQUE.acciones, icono: <Zap size={15} />, vacio: "" },
  bloc: { titulo: TITULO_BLOQUE.bloc, icono: <StickyNote size={15} />, vacio: "" },
  nota: { titulo: TITULO_BLOQUE.nota, icono: <Pin size={15} />, vacio: "Elige qué página ver aquí." },
  recordatorios: { titulo: TITULO_BLOQUE.recordatorios, icono: <Bell size={15} />, vacio: "No tienes recordatorios pendientes." },
};

type Tarea = { recordId: string; pageId: string; dbTitle: string; title: string; status: string; date: string };

/**
 * Inicio, como el Home de Notion: saludo y, debajo, los bloques que cada persona elige
 * y ordena con «Personalizar» (src/lib/inicio.ts; se guarda en el servidor, así vale en
 * otro ordenador y en la app). También decide «Abrir al iniciar» (src/lib/arranque.ts).
 */
export default function Inicio() {
  const { data: me, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) return null;
  // El invitado de página no tiene tareas ni recordatorios del espacio: solo lo
  // compartido con él (en Notion le pasa igual).
  return me?.wsRole === "guest" ? <InicioInvitado nombre={me.workspace?.name ?? ""} /> : <InicioMiembro />;
}

/** Inicio de un invitado: las páginas que le han compartido en este espacio. */
function InicioInvitado({ nombre }: { nombre: string }) {
  const { data: tree } = trpc.pages.tree.useQuery();
  const raices = (tree ?? []).filter((p) => !p.parentId);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-6 flex items-center gap-2">
        <BotonPanel />
        <h1 className="font-display text-2xl font-extrabold md:text-3xl">Compartido contigo</h1>
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Eres invitado en «{nombre}»: solo ves las páginas que te han compartido, y lo que cuelga de ellas.
      </p>
      {raices.length ? (
        <Tarjetas paginas={raices} />
      ) : (
        <p className="text-sm text-[var(--muted)]">Ya no tienes páginas compartidas en este espacio.</p>
      )}
    </div>
  );
}

function InicioMiembro() {
  const router = useRouter();
  const { data: me } = trpc.auth.me.useQuery();
  const { datos, error, guardar, fallo } = useInicio();
  const { data: tree, isError: sinArbol } = trpc.pages.tree.useQuery();
  const [editando, setEditando] = useState(false);
  const config = datos?.config ?? inicioPorDefecto();
  const paginas = datos?.paginas ?? {};
  const visible = (id: BloqueInicio) => editando || config.bloques.some((b) => b.id === id && b.visible);

  const { data: tasks } = trpc.db.myTasks.useQuery();
  const { data: favoritos } = trpc.favorites.list.useQuery(undefined, { enabled: visible("favoritos") });
  const { data: recordatorios } = trpc.inicio.recordatorios.useQuery(undefined, { enabled: visible("proximas") || visible("recordatorios") });

  // localStorage solo existe en el cliente: leerlo en un efecto evita el
  // desajuste de hidratación.
  const [recientes, setRecientes] = useState<Recent[]>([]);
  useEffect(() => {
    const wid = me?.workspace?.id;
    if (!wid) return;
    const leer = () => setRecientes(getRecents(wid));
    leer();
    window.addEventListener(RECENTS_EVENT, leer);
    return () => window.removeEventListener(RECENTS_EVENT, leer);
  }, [me?.workspace?.id]);

  // «Abrir al iniciar»: solo si la pestaña acaba de arrancar aquí. Mientras se decide no
  // se pinta nada, para que no asome el Inicio antes de saltar a la página.
  const arranque = useRef<boolean | null>(null);
  const [decidiendo, setDecidiendo] = useState(true);
  useLayoutEffect(() => {
    if (arranque.current === null) arranque.current = tomaArranqueEnInicio();
    if (!arranque.current) setDecidiendo(false);
  }, []);
  useEffect(() => {
    if (!arranque.current) return;
    if (error || sinArbol) {
      arranque.current = false;
      setDecidiendo(false);
      return;
    }
    const wid = me?.workspace?.id;
    if (!datos || !tree || !wid) return;
    arranque.current = false;
    const veo = new Set(tree.map((p) => p.id));
    const destino = destinoAlIniciar(datos.config.abrir, (id) => veo.has(id), getRecents(wid)[0]?.pageId);
    if (destino) router.replace(`/p/${destino}`);
    else setDecidiendo(false);
  }, [datos, tree, me?.workspace?.id, error, sinArbol, router]);
  // Red de seguridad: si algo no llega nunca, que se vea el Inicio.
  useEffect(() => {
    const t = setTimeout(() => setDecidiendo(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (decidiendo) return null;

  const nombre = me?.name?.split(" ")[0] ?? "";
  const [saludo] = saludoInicio(nombre).split(" · ");
  const hoy = diaLocal();
  const tareas: Tarea[] = tasks ?? [];
  const portadas = Object.fromEntries((tree ?? []).map((p) => [p.id, p.cover]));

  const contenido = (id: BloqueInicio): ReactNode => {
    switch (id) {
      case "recientes":
        return recientes.length ? <Tarjetas paginas={recientes.slice(0, 8).map((r) => ({ id: r.pageId, title: r.title, icon: r.icon }))} portadas={portadas} /> : null;
      case "favoritos":
        return favoritos?.length ? <Tarjetas paginas={favoritos} portadas={portadas} /> : null;
      case "tareas":
        return tareas.length ? (
          <>
            <Lista>{tareas.slice(0, 6).map((t) => <FilaTarea key={t.recordId} t={t} />)}</Lista>
            {tareas.length > 6 && <VerTodas />}
          </>
        ) : null;
      case "hoy": {
        const lista = tareasDeHoy(tareas, hoy);
        return lista.length ? (
          <>
            <Lista>{lista.slice(0, 8).map((t) => <FilaTarea key={t.recordId} t={t} vencida={t.vencida} />)}</Lista>
            <VerTodas />
          </>
        ) : null;
      }
      case "proximas": {
        const lista = proximasFechas(tareas, recordatorios ?? [], hoy).slice(0, 10);
        return lista.length ? (
          <Lista>
            {lista.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/p/${p.pageId}${p.recordId ? `?r=${p.recordId}` : ""}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20"
                >
                  <span className="shrink-0 text-[var(--muted)]">{p.tipo === "recordatorio" ? <Bell size={14} /> : <CircleCheck size={14} />}</span>
                  <span className="min-w-0 flex-1 truncate">{p.titulo || "Sin título"}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{fechaTarea(p.inicio)}</span>
                </Link>
              </li>
            ))}
          </Lista>
        ) : null;
      }
      case "acciones":
        return (
          <>
            {editando && config.tareas && <div className="mb-2"><ElegirBdTareas config={config} guardar={guardar} /></div>}
            <AccionesRapidas config={config} guardar={guardar} />
          </>
        );
      case "bloc":
        // Lee lo guardado al montarse; luego manda lo que se escribe aquí.
        return datos ? <BlocNotas inicial={config.bloc} /> : null;
      case "nota":
        return (
          <>
            {editando && <ElegirNota config={config} guardar={guardar} />}
            {config.nota && paginas[config.nota] ? <NotaFijada pageId={config.nota} titulo={paginas[config.nota].title} /> : null}
          </>
        );
      case "recordatorios":
        return recordatorios?.length ? <ListaRecordatorios lista={recordatorios} /> : null;
      case "enlaces":
        if (editando) return <EditorEnlaces config={config} paginas={paginas} guardar={guardar} />;
        return config.enlaces.some((e) => e.tipo === "web" || paginas[e.pageId]) ? <Enlaces enlaces={config.enlaces} paginas={paginas} /> : null;
    }
  };

  const secciones = config.bloques.filter((b) => b.visible).map((b) => ({ id: b.id, c: contenido(b.id) })).filter((s) => s.c);

  return (
    <div className="mx-auto max-w-3xl px-6 pb-10 pt-4 md:pt-6">
      <div className="flex min-h-9 items-center justify-end gap-1">
        {editando ? (
          <>
            <button
              onClick={() => guardar({ ...config, bloques: inicioPorDefecto().bloques })}
              title="Vuelve a los bloques de siempre (tus enlaces se quedan)"
              className="toque-estrecho flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              <RotateCcw size={15} strokeWidth={1.75} /> Restablecer
            </button>
            <button
              onClick={() => setEditando(false)}
              className="toque-estrecho flex items-center gap-1.5 rounded-md bg-brand px-3 py-1 text-sm font-medium text-white"
            >
              <Check size={15} strokeWidth={2} /> Listo
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditando(true)}
            title="Elegir qué bloques ver y en qué orden"
            className="toque-estrecho flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
          >
            <Settings2 size={16} strokeWidth={1.75} /> Personalizar
          </button>
        )}
      </div>

      {/* Solo el saludo, como el Home de Notion (sin fecha ni buscador: buscar está en el panel y en Ctrl+K). */}
      <h1 className="font-display mb-8 mt-2 text-center text-2xl font-bold md:mb-10 md:text-3xl">{saludo}</h1>

      {fallo && <p className="mb-4 text-center text-sm text-red-500">No se pudo guardar: {fallo}</p>}

      {editando ? (
        <ModoPersonalizar config={config} guardar={guardar} contenido={contenido} />
      ) : (
        <>
          {secciones.map((s, i) => (
            <section key={s.id} className="group/seccion mb-8">
              <Encabezado
                id={s.id}
                // El ⋯ de cada sección, como en Notion: subir, bajar u ocultarla.
                mover={(d) => {
                  const j = config.bloques.findIndex((b) => b.id === secciones[i + d]?.id);
                  const k = config.bloques.findIndex((b) => b.id === s.id);
                  if (j >= 0) guardar({ ...config, bloques: lleva(config.bloques, k, j) });
                }}
                primera={i === 0}
                ultima={i === secciones.length - 1}
                ocultar={() => guardar({ ...config, bloques: config.bloques.map((b) => (b.id === s.id ? { ...b, visible: false } : b)) })}
              />
              {s.c}
            </section>
          ))}
          {secciones.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              Aquí saldrán tus páginas recientes y lo que tengas asignado. Abre una página del panel para empezar.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Encabezado({
  id,
  mover,
  ocultar,
  primera,
  ultima,
}: {
  id: BloqueInicio;
  mover?: (d: -1 | 1) => void;
  ocultar?: () => void;
  primera?: boolean;
  ultima?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--hover)] disabled:opacity-40";
  return (
    <div className="relative mb-2 flex items-center">
      <h2 className="flex flex-1 items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
        {BLOQUE[id].icono} {BLOQUE[id].titulo}
      </h2>
      {ocultar && (
        <button
          onClick={() => setMenu((m) => !m)}
          title="Opciones de la sección"
          aria-label="Opciones de la sección"
          className={`toque al-pasar flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] md:opacity-0 md:group-hover/seccion:opacity-100 ${menu ? "md:opacity-100" : ""}`}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      {menu && ocultar && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div data-menu="" className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl">
            <button disabled={primera} onClick={() => (setMenu(false), mover?.(-1))} className={item}>
              <ArrowUp size={15} strokeWidth={1.75} /> Subir
            </button>
            <button disabled={ultima} onClick={() => (setMenu(false), mover?.(1))} className={item}>
              <ArrowDown size={15} strokeWidth={1.75} /> Bajar
            </button>
            <button onClick={() => (setMenu(false), ocultar())} className={item}>
              <EyeOff size={15} strokeWidth={1.75} /> Ocultar sección
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Modo «Personalizar»: cada bloque con su interruptor y para moverlo, arrastrar (ratón)
 * o las flechas (táctil). Los ocultos se quedan atenuados para poder volver a mostrarlos.
 */
function ModoPersonalizar({
  config,
  guardar,
  contenido,
}: {
  config: ConfigInicio;
  guardar: (c: ConfigInicio) => void;
  contenido: (id: BloqueInicio) => ReactNode;
}) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const bloques = config.bloques;
  const pon = (b: ConfigInicio["bloques"]) => guardar({ ...config, bloques: b });

  return (
    <div>
      <section className="mb-6 rounded-lg border border-[var(--border)] p-4">
        <h2 className="mb-2 text-sm font-medium">Al abrir Notiono, mostrar</h2>
        <AbrirAlIniciar />
      </section>

      {bloques.map((b, i) => (
        <section
          key={b.id}
          onDragOver={(e) => {
            if (arrastrando === null) return;
            e.preventDefault();
            setSobre(i);
          }}
          onDragLeave={() => setSobre((s) => (s === i ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            if (arrastrando !== null) pon(lleva(bloques, arrastrando, i));
            setArrastrando(null);
            setSobre(null);
          }}
          className={`mb-4 rounded-lg border p-3 transition-colors ${
            sobre === i && arrastrando !== i ? "border-brand" : "border-[var(--border)]"
          } ${arrastrando === i ? "opacity-40" : ""}`}
        >
          <div className="flex items-center gap-1">
            <span
              draggable
              onDragStart={(e) => {
                setArrastrando(i);
                e.dataTransfer.effectAllowed = "move";
                const tarjeta = e.currentTarget.closest("section");
                if (tarjeta) e.dataTransfer.setDragImage(tarjeta, 16, 16);
              }}
              onDragEnd={() => {
                setArrastrando(null);
                setSobre(null);
              }}
              title="Arrastra para mover"
              className="hidden cursor-grab text-[var(--muted)] md:block"
            >
              <GripVertical size={16} />
            </span>
            <div className={`flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium ${b.visible ? "" : "opacity-50"}`}>
              <span className="text-[var(--muted)]">{BLOQUE[b.id].icono}</span>
              <span className="truncate">{BLOQUE[b.id].titulo}</span>
              {!b.visible && <span className="text-xs font-normal text-[var(--muted)]">· oculto</span>}
            </div>
            <BotonIcono titulo="Subir" deshabilitado={i === 0} onClick={() => pon(mueve(bloques, i, -1))}>
              <ArrowUp size={16} strokeWidth={1.75} />
            </BotonIcono>
            <BotonIcono titulo="Bajar" deshabilitado={i === bloques.length - 1} onClick={() => pon(mueve(bloques, i, 1))}>
              <ArrowDown size={16} strokeWidth={1.75} />
            </BotonIcono>
            <BotonIcono
              titulo={b.visible ? "Ocultar" : "Mostrar"}
              onClick={() => pon(bloques.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)))}
            >
              {b.visible ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
            </BotonIcono>
          </div>
          {b.visible && (
            <div className="mt-2">
              {contenido(b.id) ?? <p className="px-1 py-2 text-sm text-[var(--muted)]">{BLOQUE[b.id].vacio}</p>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function BotonIcono({
  titulo,
  onClick,
  deshabilitado,
  children,
}: {
  titulo: string;
  onClick: () => void;
  deshabilitado?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      className="toque flex items-center justify-center rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * Las tarjetas de «Visitado recientemente» (y Favoritos), como las del Home de Notion: la
 * portada arriba (o una franja gris), el icono montado encima y el título debajo.
 */
function Tarjetas({ paginas, portadas = {} }: { paginas: { id: string; title: string; icon: string | null }[]; portadas?: Record<string, string | null> }) {
  return (
    <div className="barra-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {paginas.map((p) => {
        const portada = portadas[p.id];
        return (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className={`flex h-36 w-36 shrink-0 flex-col transition hover:shadow-md ${TARJETA}`}
          >
            <div className="h-11 shrink-0 bg-[var(--hover)]" style={portada ? coverStyle(portada) : undefined} />
            <div className="-mt-4 px-3">
              <IconoPagina icon={p.icon} size={26} fallback={<FileText size={26} strokeWidth={1.5} className="text-[var(--muted)]" />} />
            </div>
            <div className="mt-1.5 line-clamp-3 px-3 text-sm font-semibold leading-snug">{p.title || "Sin título"}</div>
          </Link>
        );
      })}
    </div>
  );
}

function Lista({ children }: { children: ReactNode }) {
  return <ul className={`divide-y divide-[var(--border)] ${TARJETA}`}>{children}</ul>;
}

function VerTodas() {
  return (
    <Link
      href="/my-tasks"
      className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
    >
      Ver todas <ArrowRight size={14} />
    </Link>
  );
}

function FilaTarea({ t, vencida }: { t: Tarea; vencida?: boolean }) {
  return (
    <li>
      <Link
        href={`/p/${t.pageId}?r=${t.recordId}`}
        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20"
      >
        <span className="min-w-0 flex-1 truncate">{t.title || "Sin título"}</span>
        <span className="hidden shrink-0 items-center gap-1 text-xs text-[var(--muted)] sm:flex">
          <Database size={12} /> {t.dbTitle || "BD"}
        </span>
        {t.date && (
          <span className={`shrink-0 text-xs ${vencida ? "font-medium text-red-500" : "text-[var(--muted)]"}`}>
            {vencida ? `Vencida · ${fechaTarea(t.date)}` : fechaTarea(t.date)}
          </span>
        )}
        {t.status && <span className="shrink-0 rounded bg-[var(--border)]/50 px-1.5 py-0.5 text-xs">{t.status}</span>}
      </Link>
    </li>
  );
}

const hostDe = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Enlaces fijados: las páginas con su icono y título de ahora; las que ya no veo, fuera. */
function Enlaces({ enlaces, paginas }: { enlaces: EnlaceInicio[]; paginas: Record<string, { title: string; icon: string | null }> }) {
  return (
    <Lista>
      {enlaces.map((e) => {
        if (e.tipo === "web") {
          return (
            <li key={e.id}>
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20"
              >
                <Globe size={16} strokeWidth={1.75} className="shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1 truncate">{e.titulo || hostDe(e.url)}</span>
                {e.titulo && <span className="hidden shrink-0 text-xs text-[var(--muted)] sm:inline">{hostDe(e.url)}</span>}
              </a>
            </li>
          );
        }
        const p = paginas[e.pageId];
        if (!p) return null;
        return (
          <li key={e.id}>
            <Link href={`/p/${e.pageId}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20">
              <span className="flex w-4 shrink-0 justify-center">
                <IconoPagina icon={p.icon} size={16} fallback={<FileText size={16} strokeWidth={1.75} className="text-[var(--muted)]" />} />
              </span>
              <span className="min-w-0 flex-1 truncate">{e.titulo || p.title || "Sin título"}</span>
            </Link>
          </li>
        );
      })}
    </Lista>
  );
}

const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Añadir, quitar, renombrar y reordenar los enlaces fijados (dentro de «Personalizar»). */
function EditorEnlaces({
  config,
  paginas,
  guardar,
}: {
  config: ConfigInicio;
  paginas: Record<string, { title: string; icon: string | null }>;
  guardar: (c: ConfigInicio) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [web, setWeb] = useState<{ url: string; titulo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enlaces = config.enlaces;
  const pon = (e: EnlaceInicio[]) => guardar({ ...config, enlaces: e });

  const anadeWeb = () => {
    if (!web) return;
    const bruta = web.url.trim();
    // «ejemplo.es» a secas se entiende como https://ejemplo.es.
    const url = urlValida(bruta) ?? (/^[a-z]+:/i.test(bruta) ? null : urlValida(`https://${bruta}`));
    if (!url) {
      setError("Pon una dirección web, como https://ejemplo.es");
      return;
    }
    pon([...enlaces, { id: nuevoId(), tipo: "web", url, ...(web.titulo.trim() ? { titulo: web.titulo.trim() } : {}) }]);
    setWeb(null);
    setError(null);
  };

  return (
    <div>
      {enlaces.length > 0 && (
        <Lista>
          {enlaces.map((e, i) => {
            const p = e.tipo === "pagina" ? paginas[e.pageId] : undefined;
            const original = e.tipo === "web" ? hostDe(e.url) : p ? p.title || "Sin título" : "Página que ya no existe o no puedes ver";
            return (
              <li key={e.id} className="flex items-center gap-2 px-2 py-1">
                <span className="flex w-5 shrink-0 justify-center text-[var(--muted)]">
                  {e.tipo === "web" ? (
                    <Globe size={16} strokeWidth={1.75} />
                  ) : (
                    <IconoPagina icon={p?.icon} size={16} fallback={<FileText size={16} strokeWidth={1.75} />} />
                  )}
                </span>
                <input
                  key={`${e.id}:${e.titulo ?? ""}`}
                  defaultValue={e.titulo ?? ""}
                  placeholder={original}
                  aria-label="Nombre del enlace"
                  onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                  onBlur={(ev) => {
                    const titulo = ev.currentTarget.value.trim();
                    if (titulo === (e.titulo ?? "")) return;
                    pon(enlaces.map((x) => (x.id === e.id ? { ...x, titulo: titulo || undefined } : x)));
                  }}
                  className={`min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-sm outline-none hover:bg-[var(--hover)] focus:bg-[var(--hover)] ${
                    p || e.tipo === "web" ? "placeholder:text-[var(--foreground)]" : "line-through opacity-60"
                  }`}
                />
                <BotonIcono titulo="Subir" deshabilitado={i === 0} onClick={() => pon(mueve(enlaces, i, -1))}>
                  <ArrowUp size={15} strokeWidth={1.75} />
                </BotonIcono>
                <BotonIcono titulo="Bajar" deshabilitado={i === enlaces.length - 1} onClick={() => pon(mueve(enlaces, i, 1))}>
                  <ArrowDown size={15} strokeWidth={1.75} />
                </BotonIcono>
                <BotonIcono titulo="Quitar" onClick={() => pon(enlaces.filter((x) => x.id !== e.id))}>
                  <X size={15} strokeWidth={1.75} />
                </BotonIcono>
              </li>
            );
          })}
        </Lista>
      )}

      {web ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] p-3">
          <input
            autoFocus
            value={web.url}
            onChange={(e) => setWeb({ ...web, url: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && anadeWeb()}
            placeholder="https://…"
            inputMode="url"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            value={web.titulo}
            onChange={(e) => setWeb({ ...web, titulo: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && anadeWeb()}
            placeholder="Nombre (opcional)"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setWeb(null);
                setError(null);
              }}
              className="toque-estrecho rounded-md px-3 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
            >
              Cancelar
            </button>
            <button onClick={anadeWeb} className="toque-estrecho rounded-md bg-brand px-3 py-1 text-sm font-medium text-white">
              Añadir
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setEligiendo(true)}
            className="toque-estrecho flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
          >
            <Plus size={15} strokeWidth={1.75} /> Página
          </button>
          <button
            onClick={() => setWeb({ url: "", titulo: "" })}
            className="toque-estrecho flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
          >
            <Plus size={15} strokeWidth={1.75} /> Web
          </button>
        </div>
      )}

      {eligiendo && (
        <MovePageModal
          pageId=""
          titulo="Fijar una página"
          onClose={() => setEligiendo(false)}
          onElegir={(pageId) => {
            setEligiendo(false);
            pon([...enlaces, { id: nuevoId(), tipo: "pagina", pageId }]);
          }}
        />
      )}
    </div>
  );
}
