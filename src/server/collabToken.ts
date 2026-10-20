import crypto from "node:crypto";
import { authSecret } from "./authSecret";

/**
 * Permiso de corta vida para entrar en una sala de edición simultánea.
 *
 * No se usa la cookie de sesión porque el servidor de colaboración vive en otro
 * subdominio (el proxy del NAS enruta por host) y las cookies no cruzan de uno a
 * otro. El token va firmado con AUTH_SECRET, que comparten web y servidor de
 * colaboración, y caduca pronto: si se filtrase, solo abre esa página y por poco rato.
 */
const TTL_SECONDS = 60 * 60; // una hora: suficiente para una sesión de edición

const secret = () => authSecret();

const sign = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export function createCollabToken(pageId: string, userId: string, role: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const data = `${pageId}.${userId}.${role}.${exp}`;
  return `${data}.${sign(data)}`;
}

export function verifyCollabToken(token: string, pageId: string): { userId: string; role: string } | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [tokenPageId, userId, role, exp, firma] = parts;
  const data = `${tokenPageId}.${userId}.${role}.${exp}`;
  const esperado = sign(data);
  // Comparación en tiempo constante: no filtrar la firma byte a byte.
  if (firma.length !== esperado.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))) return null;
  if (tokenPageId !== pageId) return null; // un permiso de una página no sirve para otra
  if (Number(exp) * 1000 < Date.now()) return null;
  return { userId, role };
}

/**
 * Firma de la reparación de subpáginas (`collab/reparar-subpaginas.ts`), que se lanza
 * dentro del contenedor y pide al servidor en marcha que repare: con la misma
 * AUTH_SECRET, caduca al minuto.
 */
export function firmaReparacion(momento: number): string {
  return sign(`reparar-subpaginas.${momento}`);
}

export function firmaReparacionValida(momento: number, firma: string): boolean {
  const esperado = firmaReparacion(momento);
  return (
    Math.abs(Date.now() - momento) < 60_000 &&
    firma.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))
  );
}
