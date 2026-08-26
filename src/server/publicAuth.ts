import { createHmac } from "crypto";

/**
 * Cookie de acceso a una página pública con contraseña: su valor es un HMAC de
 * token+hash con AUTH_SECRET. Atada al hash a propósito: cambiar la contraseña
 * invalida todas las cookies repartidas.
 */
const secret = () => process.env.AUTH_SECRET ?? "dev-secret-cambiar-en-prod";

export const publicCookieName = (token: string) => `pub_${token}`;

export const publicCookieValue = (token: string, passwordHash: string) =>
  createHmac("sha256", secret()).update(`${token}|${passwordHash}`).digest("base64url");
