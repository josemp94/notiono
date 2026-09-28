"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { emojiIcono } from "@/components/PageIcon";

/**
 * La bandeja de notificaciones (menciones, asignaciones, vencimientos…).
 *
 * Se abre desde el panel lateral y desde la barra de abajo del móvil, así que vive
 * aparte: un único anfitrión montado en el shell que escucha un evento.
 */
export const BANDEJA_EVENT = "notiono:bandeja";
export const abrirBandeja = () => window.dispatchEvent(new Event(BANDEJA_EVENT));

/** Notificaciones sin leer, para el contador de quien abre la bandeja. */
export function useNoLeidas(): number {
  return trpc.notifications.unreadCount.useQuery().data ?? 0;
}

function when(d: Date) {
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function BandejaHost() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener(BANDEJA_EVENT, abrir);
    return () => window.removeEventListener(BANDEJA_EVENT, abrir);
  }, []);

  const { data: unread } = trpc.notifications.unreadCount.useQuery();
  const { data: items } = trpc.notifications.list.useQuery(undefined, { enabled: open });
  const refresh = () =>
    Promise.all([utils.notifications.list.invalidate(), utils.notifications.unreadCount.invalidate()]);
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: refresh });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh });

  // Al abrir la app se buscan vencimientos (como la purga de la papelera: sin cron).
  const checkDue = trpc.notifications.checkDue.useMutation({
    onSuccess: (r) => {
      if (r.created > 0) refresh();
    },
    onError: () => {},
  });
  const checkDueMutate = checkDue.mutate;
  useEffect(() => checkDueMutate(), [checkDueMutate]);

  return (
    <>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
            <div
              className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Bell size={18} /> Notificaciones
                </h2>
                <div className="flex items-center gap-2">
                  {!!unread && (
                    <button
                      onClick={() => markAll.mutate()}
                      disabled={markAll.isPending}
                      className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-50"
                    >
                      Marcar todas como leídas
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto px-2 pb-3">
                {(items ?? []).length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Nada por aquí: ni menciones ni vencimientos.</p>
                )}
                {(items ?? []).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markRead.mutate({ id: n.id });
                      setOpen(false);
                      if (n.page) router.push(`/p/${n.page.id}`);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--border)]/30"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={n.read ? "text-[var(--muted)]" : ""}>
                        {n.type === "due" ? (
                          <>
                            Te toca: <span className="font-medium">{n.title || "una tarea"}</span> en «
                            {n.page ? `${emojiIcono(n.page.icon)}${n.page.title || "Sin título"}` : "una base borrada"}»
                          </>
                        ) : n.type === "comment" ? (
                          <>
                            <span className="font-medium">{n.actor?.name || n.actor?.email || "Alguien"}</span> comentó en «
                            {n.page ? `${emojiIcono(n.page.icon)}${n.page.title || "Sin título"}` : "una página borrada"}»
                            {n.title ? <>: «{n.title}»</> : null}
                          </>
                        ) : n.type === "assign" ? (
                          <>
                            <span className="font-medium">{n.actor?.name || n.actor?.email || "Alguien"}</span> te asignó{" "}
                            <span className="font-medium">{n.title || "una tarea"}</span> en «
                            {n.page ? `${emojiIcono(n.page.icon)}${n.page.title || "Sin título"}` : "una base borrada"}»
                          </>
                        ) : n.type === "form" ? (
                          // Sin actor: quien envía el formulario público es anónimo.
                          <>
                            Nueva respuesta del formulario de «
                            {n.page ? `${emojiIcono(n.page.icon)}${n.page.title || "Sin título"}` : "una base borrada"}»
                            {n.title ? <>: «{n.title}»</> : null}
                          </>
                        ) : n.type === "follow" ? (
                          <>
                            <span className="font-medium">{n.actor?.name || n.actor?.email || "Alguien"}</span> editó «
                            {n.page ? `${emojiIcono(n.page.icon)}${n.page.title || "Sin título"}` : "una página borrada"}», que sigues
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{n.actor?.name || n.actor?.email || "Alguien"}</span> te mencionó en «
                            {n.page ? `${emojiIcono(n.page.icon)}${n.page.title || "Sin título"}` : "una página borrada"}»
                          </>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">{when(n.createdAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
