/**
 * Secreto con el que se firman los permisos de colaboración y las cookies de las
 * páginas publicadas con contraseña. En producción es obligatorio: con el valor de
 * desarrollo, que está en el repo, cualquiera podría fabricarse esas firmas.
 */
const DESARROLLO = "dev-secret-cambiar-en-prod";

export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta AUTH_SECRET: en producción no se usa el secreto de desarrollo.");
  }
  return DESARROLLO;
}
