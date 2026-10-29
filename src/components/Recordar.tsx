"use client";

import { useState } from "react";
import { AlarmClock, BellOff, CalendarClock, Clock, Sunrise, Sunset } from "lucide-react";
import { trpc } from "@/trpc/react";
import { toast } from "@/components/Toast";
import { atajoRecordatorio, ATAJOS, cuandoEvento, enMadrid, type Atajo } from "@/lib/recordatorios";

const ICONO: Record<Atajo, React.ReactNode> = {
  "1h": <Clock size={16} />,
  tarde: <Sunset size={16} />,
  manana: <Sunrise size={16} />,
};

/**
 * «Recordarme…» de una página o una fila (menú ⋯): los atajos de las apps de notas y
 * «Elegir fecha y hora». Pone arriba de la página «Recordatorio: <fecha>» (`app.recordar`),
 * que avisa a su hora con push y en la app; si ya hay uno, se ve aquí y se puede quitar.
 */
export function Recordar({ id, recordId, itemClass, onListo }: { id: string; recordId?: string; itemClass: string; onListo: () => void }) {
  const utils = trpc.useUtils();
  const actual = trpc.app.recordatorio.useQuery({ id, recordId }, { staleTime: 0 });
  const [eligiendo, setEligiendo] = useState(false);
  const [valor, setValor] = useState(() => atajoRecordatorio("manana") ?? "");
  const recordar = trpc.app.recordar.useMutation({
    onSuccess: (r) => {
      utils.app.recordatorio.invalidate({ id, recordId });
      // Sin edición simultánea la página lee Page.content: que se vea ya.
      utils.pages.get.invalidate({ id });
      toast(r.fecha ? `Te lo recordaré ${cuandoEvento(r.fecha)}` : "Recordatorio quitado");
      onListo();
    },
    onError: (e) => toast(e.message),
  });
  const pon = (fecha: string | null) => recordar.mutate({ id, recordId, fecha });

  if (eligiendo)
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <input
          type="datetime-local"
          value={valor}
          min={enMadrid(new Date())}
          onChange={(e) => setValor(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
          aria-label="Fecha y hora del recordatorio"
        />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEligiendo(false)} className="rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)]">
            Cancelar
          </button>
          <button
            onClick={() => valor && pon(valor.slice(0, 16))}
            disabled={!valor || recordar.isPending}
            className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white disabled:opacity-60"
          >
            Recordarme
          </button>
        </div>
      </div>
    );

  return (
    <div>
      <div className="px-3 pb-1 pt-1.5 text-xs text-[var(--muted)]">Recordarme</div>
      {ATAJOS.map(([a, texto]) => {
        const fecha = atajoRecordatorio(a);
        return fecha ? (
          <button key={a} onClick={() => pon(fecha)} disabled={recordar.isPending} className={itemClass}>
            {ICONO[a]}
            {texto}
          </button>
        ) : null;
      })}
      <button onClick={() => setEligiendo(true)} className={itemClass}>
        <CalendarClock size={16} />
        Elegir fecha y hora
      </button>
      {actual.data && (
        <button onClick={() => pon(null)} disabled={recordar.isPending} className={itemClass}>
          <BellOff size={16} />
          <span className="flex-1">Quitar recordatorio</span>
          <span className="text-xs text-[var(--muted)]">{cuandoEvento(actual.data.fecha)}</span>
        </button>
      )}
    </div>
  );
}

/** El botón del menú que abre los atajos. */
export function BotonRecordar({ itemClass, onClick }: { itemClass: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={itemClass}>
      <AlarmClock size={16} />
      Recordarme…
    </button>
  );
}
