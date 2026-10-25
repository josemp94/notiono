"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, SmilePlus, Trash2, UserPlus, X } from "lucide-react";
import { confirmar } from "@/components/Confirmar";
import { trpc } from "@/trpc/react";
import { IconoPagina, SelectorIcono } from "@/components/PageIcon";

/** El icono del espacio (el que se elige, como el de una página) o el cuadradito con su inicial. */
export function IconoEspacio({ nombre, icon, size = 20 }: { nombre: string; icon?: string | null; size?: number }) {
  const inicial = (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      className="flex shrink-0 items-center justify-center rounded bg-[var(--active)] font-semibold text-[var(--foreground)]"
    >
      {nombre.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
  if (!icon) return inicial;
  return (
    <span style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }} className="flex shrink-0 items-center justify-center leading-none">
      <IconoPagina icon={icon} size={size} fallback={inicial} />
    </span>
  );
}

/** Botón con el icono que abre el selector de iconos de las páginas (emoji, dibujo o imagen). */
export function ElegirIconoEspacio({
  nombre,
  icon,
  onChange,
  disabled = false,
}: {
  nombre: string;
  icon: string | null;
  onChange: (icon: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? undefined : "Cambiar icono"}
        className="toque flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--hover)] disabled:cursor-default disabled:hover:bg-transparent"
      >
        {icon || nombre.trim() ? (
          <IconoEspacio nombre={nombre} icon={icon} size={24} />
        ) : (
          <SmilePlus size={20} className="text-[var(--muted)]" />
        )}
      </button>
      {open && (
        <SelectorIcono
          icon={icon}
          elegir={(v, seguir) => {
            onChange(v);
            if (!seguir) setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Marco de los diálogos de espacio: fondo oscuro, tarjeta y cierre con Escape. */
export function DialogoEspacio({ titulo, onClose, children }: { titulo: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">{titulo}</h2>
          <button onClick={onClose} className="toque text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** «Nuevo espacio»: nombre e icono; al crearlo se pasa a él (el servidor fija la cookie). */
export function NuevoEspacio({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const create = trpc.workspace.create.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });
  const crear = () => name.trim() && !create.isPending && create.mutate({ name, icon });
  return (
    <DialogoEspacio titulo={<><Plus size={18} /> Nuevo espacio</>} onClose={onClose}>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Un espacio aparte, con sus páginas y sus personas. Lo puedes compartir luego con quien quieras.
      </p>
      <div className="flex items-center gap-2">
        <ElegirIconoEspacio nombre={name} icon={icon} onChange={setIcon} />
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && crear()}
          placeholder="Nombre del espacio (p. ej. Casa)"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>
      {create.error && <p className="mt-2 text-xs text-red-500">{create.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="toque-estrecho rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]">
          Cancelar
        </button>
        <button
          onClick={crear}
          disabled={!name.trim() || create.isPending}
          className="toque-estrecho rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Crear espacio
        </button>
      </div>
    </DialogoEspacio>
  );
}

/** Ajustes → Espacio: nombre e icono (el dueño) y lo que se puede hacer con el espacio. */
export function AjustesEspacio() {
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const ws = me?.workspace;
  const esDueno = me?.wsRole === "owner";
  const [name, setName] = useState("");
  // Sembrar una sola vez por espacio: re-sembrar en cada refetch machacaba lo tecleado.
  const sembrado = useRef<string | null>(null);
  useEffect(() => {
    if (ws && sembrado.current !== ws.id) {
      sembrado.current = ws.id;
      setName(ws.name);
    }
  }, [ws]);
  const [msg, setMsg] = useState<string | null>(null);
  const update = trpc.workspace.update.useMutation({
    onSuccess: async () => {
      setMsg("Guardado");
      await Promise.all([utils.auth.me.invalidate(), utils.workspace.list.invalidate()]);
    },
    onError: (e) => setMsg(e.message),
  });

  return (
    <section id="espacio" className="mt-8 scroll-mt-4">
      <h2 className="font-display mb-2 font-bold">General</h2>
      <div className="flex items-center gap-2">
        <ElegirIconoEspacio
          nombre={name}
          icon={ws?.icon ?? null}
          disabled={!esDueno}
          onChange={(icon) => {
            setMsg(null);
            update.mutate({ icon });
          }}
        />
        <input
          value={name}
          maxLength={80}
          disabled={!esDueno}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && update.mutate({ name })}
          placeholder="Nombre del espacio"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-70"
        />
        {esDueno && (
          <button
            onClick={() => {
              setMsg(null);
              update.mutate({ name });
            }}
            disabled={!name.trim() || name.trim() === ws?.name || update.isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Guardar
          </button>
        )}
      </div>
      {!esDueno && ws && <p className="mt-2 text-xs text-[var(--muted)]">Solo quien es propietario cambia el nombre y el icono.</p>}
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
      <ZonaPeligro />
    </section>
  );
}

/** Los roles del espacio como los presenta Notion: nombre y qué puede hacer cada uno. */
export const ROLES: { id: "owner" | "editor" | "viewer"; nombre: string; desc: string }[] = [
  { id: "owner", nombre: "Propietario del espacio", desc: "Cambia los ajustes del espacio e invita a personas." },
  { id: "editor", nombre: "Miembro", desc: "Ve y edita todo lo que no esté restringido; no cambia los ajustes." },
  { id: "viewer", nombre: "Lector", desc: "Ve el espacio, pero no edita nada." },
];
export const nombreRol = (r: string) => (r === "guest" ? "Invitado" : (ROLES.find((x) => x.id === r)?.nombre ?? r));

/**
 * Personas del espacio (Ajustes → Personas, y el diálogo «Invitar miembros»): añadir
 * por email o usuario del NAS, las invitaciones pendientes, y cambiar el rol, traspasar
 * la propiedad o quitar a alguien. Todo lo comprueba el servidor; aquí solo se esconde.
 */
export function PersonasEspacio() {
  const utils = trpc.useUtils();
  const { data } = trpc.workspace.members.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const esDueno = !!data?.isOwner;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [msg, setMsg] = useState<{ texto: string; error?: boolean } | null>(null);
  const refresh = () => Promise.all([utils.workspace.members.invalidate(), utils.workspace.list.invalidate()]);
  const onError = (e: { message: string }) => setMsg({ texto: e.message, error: true });
  const share = trpc.workspace.share.useMutation({
    onSuccess: async (r) => {
      setMsg({
        texto: r.pendiente
          ? `Invitación pendiente: entrará en el espacio la primera vez que inicie sesión con el NAS.`
          : "Añadido al espacio.",
      });
      setEmail("");
      await refresh();
    },
    onError,
  });
  const setRoleM = trpc.workspace.setRole.useMutation({ onSuccess: refresh, onError });
  const unshare = trpc.workspace.unshare.useMutation({ onSuccess: refresh, onError });
  const cancelInvite = trpc.workspace.cancelInvite.useMutation({ onSuccess: refresh, onError });
  const transfer = trpc.workspace.transfer.useMutation({
    onSuccess: () => window.location.reload(),
    onError,
  });
  const miembros = data?.members.filter((m) => m.role !== "guest");
  const invitados = (data?.members ?? []).filter((m) => m.role === "guest");
  const invitar = () => {
    if (!email.trim() || share.isPending) return;
    setMsg(null);
    share.mutate({ email: email.trim(), role });
  };

  const cambia = async (m: { userId: string; name: string | null; email: string; role: string }, valor: string) => {
    setMsg(null);
    const quien = m.name || m.email;
    if (valor === "quitar") {
      if (await confirmar(`¿Quitar a ${quien} del espacio? Dejará de ver sus páginas.`, "Quitar")) unshare.mutate({ userId: m.userId });
    } else if (valor === "owner") {
      if (await confirmar(`¿Hacer a ${quien} propietario del espacio? Tú pasarás a ser miembro y ya no podrás cambiar los ajustes.`, "Traspasar"))
        transfer.mutate({ userId: m.userId });
    } else {
      if (m.role === "guest" && !(await confirmar(`¿Convertir a ${quien} en ${nombreRol(valor).toLowerCase()}? Verá todo el espacio, no solo lo compartido.`, "Convertir")))
        return;
      setRoleM.mutate({ userId: m.userId, role: valor as "editor" | "viewer" });
    }
  };

  return (
    <div>
      {esDueno && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invitar()}
              placeholder="Email o usuario del NAS"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                className="toque-estrecho flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm"
              >
                <option value="editor">Miembro</option>
                <option value="viewer">Lector</option>
              </select>
              <button
                onClick={invitar}
                disabled={!email.trim() || share.isPending}
                className="toque-estrecho rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Invitar
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Si aún no ha entrado nunca en Notiono, queda como invitación pendiente hasta su primer inicio de sesión.
          </p>
        </>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.error ? "text-red-500" : "text-[var(--muted)]"}`}>{msg.texto}</p>}

      <div className="mb-1 mt-4 text-xs font-medium text-[var(--muted)]">Miembros · {miembros?.length ?? "…"}</div>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {(miembros ?? []).map((m) => {
          const esElDueno = m.userId === data?.ownerId;
          return (
            <li key={m.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--active)] text-xs font-semibold">
                {(m.name || m.email).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {m.name || m.email}
                  {m.userId === me?.id && <span className="text-[var(--muted)]"> (tú)</span>}
                </span>
                {m.name && <span className="block truncate text-xs text-[var(--muted)]">{m.email}</span>}
              </span>
              {esDueno && !esElDueno ? (
                <select
                  value={m.role}
                  onChange={(e) => cambia(m, e.target.value)}
                  aria-label={`Rol de ${m.name || m.email}`}
                  className="toque-estrecho max-w-[45%] rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                  <option value="quitar">Quitar del espacio</option>
                </select>
              ) : (
                <span className="shrink-0 text-xs text-[var(--muted)]">{nombreRol(esElDueno ? "owner" : m.role)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {!!invitados.length && (
        <>
          <div className="mb-1 mt-4 text-xs font-medium text-[var(--muted)]">Invitados · {invitados.length}</div>
          <p className="mb-1 text-xs text-[var(--muted)]">
            Personas de fuera del espacio que solo ven las páginas que se les han compartido (desde «Compartir» de cada página).
          </p>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {invitados.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.name || m.email}</span>
                  {m.name && <span className="block truncate text-xs text-[var(--muted)]">{m.email}</span>}
                </span>
                {esDueno ? (
                  <select
                    value="guest"
                    onChange={(e) => cambia(m, e.target.value)}
                    aria-label={`Acceso de ${m.name || m.email}`}
                    className="toque-estrecho max-w-[45%] rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-xs"
                  >
                    <option value="guest">Invitado</option>
                    <option value="editor">Convertir en miembro</option>
                    <option value="viewer">Convertir en lector</option>
                    <option value="quitar">Quitar del espacio</option>
                  </select>
                ) : (
                  <span className="shrink-0 text-xs text-[var(--muted)]">Invitado</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {esDueno && !!data?.invitaciones.length && (
        <>
          <div className="mb-1 mt-4 text-xs font-medium text-[var(--muted)]">Invitaciones pendientes</div>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {data.invitaciones.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.destino}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">{nombreRol(i.role)}</span>
                <button
                  onClick={() => cancelInvite.mutate({ id: i.id })}
                  className="toque-estrecho shrink-0 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-red-500"
                >
                  Anular
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <dl className="mt-4 space-y-1 text-xs text-[var(--muted)]">
        {ROLES.map((r) => (
          <div key={r.id}>
            <dt className="inline font-medium text-[var(--foreground)]">{r.nombre}:</dt> <dd className="inline">{r.desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** «Invitar miembros» del selector de espacios: las Personas del espacio en un diálogo. */
export function InvitarMiembros({ onClose }: { onClose: () => void }) {
  return (
    <DialogoEspacio titulo={<><UserPlus size={18} /> Invitar miembros</>} onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto">
        <PersonasEspacio />
      </div>
    </DialogoEspacio>
  );
}

/**
 * Zona de peligro de Ajustes → General, como en Notion: un miembro sale del espacio;
 * el propietario lo elimina escribiendo su nombre.
 */
export function ZonaPeligro() {
  const { data: me } = trpc.auth.me.useQuery();
  const ws = me?.workspace;
  const esDueno = me?.wsRole === "owner";
  const { data: spaces } = trpc.workspace.list.useQuery();
  const unico = esDueno && (spaces ?? []).filter((s) => s.isOwner).length <= 1;
  const [borrando, setBorrando] = useState(false);
  const [escrito, setEscrito] = useState("");
  const salir = trpc.workspace.leave.useMutation({ onSuccess: () => (window.location.href = "/") });
  const borrar = trpc.workspace.delete.useMutation({ onSuccess: () => (window.location.href = "/") });
  if (!ws) return null;
  const boton = "toque-estrecho rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50";
  return (
    <div className="mt-6">
      <div className="mb-2 text-xs font-medium text-red-500">Zona de peligro</div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
        <div className="min-w-0 text-sm">
          {esDueno ? "Eliminar todo el espacio" : "Salir del espacio"}
          <div className="text-xs text-[var(--muted)]">
            {unico
              ? "Es tu único espacio propio: para eliminarlo, crea antes otro."
              : esDueno
                ? "Se borra para todas las personas que están en él, con todas sus páginas. No se puede deshacer."
                : "Dejarás de ver sus páginas y desaparecerá de tu selector de espacios."}
          </div>
        </div>
        {esDueno ? (
          <button className={boton} disabled={unico} onClick={() => setBorrando(true)}>
            Eliminar
          </button>
        ) : (
          <button
            className={boton}
            disabled={salir.isPending}
            onClick={async () => {
              if (await confirmar(`¿Salir de «${ws.name}»? Para volver, el propietario tendrá que invitarte otra vez.`, "Salir"))
                salir.mutate({ workspaceId: ws.id });
            }}
          >
            Salir
          </button>
        )}
      </div>
      {salir.error && <p className="mt-2 text-xs text-red-500">{salir.error.message}</p>}
      {borrando && (
        <DialogoEspacio titulo={<><Trash2 size={18} /> Eliminar todo el espacio</>} onClose={() => setBorrando(false)}>
          <p className="text-sm">
            Se borrarán para siempre «{ws.name}», todas sus páginas y bases de datos, y nadie más podrá entrar en él.
          </p>
          <p className="mt-3 text-xs text-[var(--muted)]">Escribe el nombre del espacio para confirmarlo:</p>
          <input
            autoFocus
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            placeholder={ws.name}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          {borrar.error && <p className="mt-2 text-xs text-red-500">{borrar.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setBorrando(false)}
              className="toque-estrecho rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]"
            >
              Cancelar
            </button>
            <button
              disabled={escrito.trim() !== ws.name || borrar.isPending}
              onClick={() => borrar.mutate({ confirmacion: escrito })}
              className="toque-estrecho rounded-lg bg-[#ef4444] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#dc2626] disabled:opacity-50"
            >
              Eliminar el espacio
            </button>
          </div>
        </DialogoEspacio>
      )}
    </div>
  );
}
