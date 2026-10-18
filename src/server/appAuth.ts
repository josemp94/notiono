import crypto from "node:crypto";

/**
 * Inicio de sesión de la app nativa de Android, como cualquier app nativa (RFC 8252):
 * el SSO se abre en una Custom Tab del sistema y, al volver, el callback OIDC no pone
 * la cookie (la Custom Tab no es la app) sino que redirige a `notiono://auth?code=…`.
 * La app canjea ese código, junto con el verificador PKCE que solo ella conoce, por
 * un token de sesión normal (`POST /api/app/sesion`).
 *
 * El verificador evita que otra app que se registre el mismo esquema `notiono://` y
 * cace el código pueda usarlo: sin el verificador, el código no vale nada.
 */

type DB = typeof import("@/lib/db").db;

/** Cookie que marca, entre el inicio y el callback del SSO, que quien entra es la app. */
export const APP_CHALLENGE_COOKIE = "oidc_app";

/** El código solo tiene que sobrevivir al salto de la Custom Tab a la app. */
const CODE_TTL_MS = 2 * 60_000;

/** S256 de PKCE: base64url(sha256(verificador)). */
export function s256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** Un challenge S256 son 32 bytes en base64url: 43 caracteres. */
export function esChallenge(c: string | null | undefined): c is string {
  return !!c && /^[A-Za-z0-9_-]{43}$/.test(c);
}

/** RFC 7636: el verificador mide entre 43 y 128 caracteres «unreserved». */
export function esVerificador(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(v);
}

/** ¿Este verificador es el del challenge? (comparación en tiempo constante). */
export function verificadorCasa(verifier: string, challenge: string): boolean {
  const a = Buffer.from(s256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const hashCodigo = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

/** Emite el código de un solo uso para la app (se guarda solo su hash). */
export async function emiteCodigoApp(db: DB, userId: string, challenge: string): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  // Limpieza perezosa: los caducados no sirven para nada.
  await db.appAuthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.appAuthCode.create({
    data: { codeHash: hashCodigo(code), userId, challenge, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return code;
}

/**
 * Canjea el código: devuelve el usuario si el código existe, no ha caducado y el
 * verificador casa. El código se gasta SIEMPRE al primer intento, salga bien o mal:
 * así no se puede probar verificadores contra el mismo código.
 */
export async function canjeaCodigoApp(db: DB, code: string, verifier: string): Promise<string | null> {
  const codeHash = hashCodigo(code);
  const fila = await db.appAuthCode.findUnique({ where: { codeHash } });
  if (!fila) return null;
  // Solo uno de dos canjes simultáneos borra la fila: el otro se queda sin sesión.
  const { count } = await db.appAuthCode.deleteMany({ where: { codeHash } });
  if (count !== 1) return null;
  if (fila.expiresAt.getTime() < Date.now()) return null;
  if (!verificadorCasa(verifier, fila.challenge)) return null;
  return fila.userId;
}
