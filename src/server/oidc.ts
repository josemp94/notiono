// Cliente OIDC (Authorization Code) genérico, dirigido por variables de entorno.
// Pensado para el SSO Server de Synology, pero vale para cualquier proveedor OIDC estándar.
//
// Variables de entorno:
//   OIDC_ISSUER          p.ej. https://sso.tudominio.com/webman/sso   (sin /.well-known)
//   OIDC_CLIENT_ID
//   OIDC_CLIENT_SECRET
//   OIDC_REDIRECT_URI    (opcional) si no se define, se deriva del origin de la petición
//   OIDC_SCOPES          (opcional) por defecto "openid profile email"
//   OIDC_PROVIDER_NAME   (opcional) etiqueta del botón, por defecto "Synology"

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes: string;
  providerName: string;
};

export function getOidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER?.replace(/\/$/, "");
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri: process.env.OIDC_REDIRECT_URI,
    scopes: process.env.OIDC_SCOPES || "openid profile email",
    providerName: process.env.OIDC_PROVIDER_NAME || "Synology",
  };
}

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

let cache: { issuer: string; doc: Discovery } | null = null;

export async function discover(issuer: string): Promise<Discovery> {
  if (cache && cache.issuer === issuer) return cache.doc;
  const url = `${issuer}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OIDC discovery falló (${res.status}) en ${url}`);
  const doc = (await res.json()) as Discovery;
  cache = { issuer, doc };
  return doc;
}

export function redirectUriFor(cfg: OidcConfig, origin: string): string {
  return cfg.redirectUri || `${origin}/api/auth/oidc/callback`;
}

export async function buildAuthUrl(cfg: OidcConfig, origin: string, state: string): Promise<string> {
  const doc = await discover(cfg.issuer);
  const p = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUriFor(cfg, origin),
    scope: cfg.scopes,
    state,
  });
  return `${doc.authorization_endpoint}?${p.toString()}`;
}

type TokenResponse = { access_token?: string; id_token?: string; token_type?: string };

export async function exchangeCode(cfg: OidcConfig, origin: string, code: string): Promise<TokenResponse> {
  const doc = await discover(cfg.issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUriFor(cfg, origin),
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Intercambio de token falló (${res.status})`);
  return (await res.json()) as TokenResponse;
}

/** `usuario`: el nombre de usuario del NAS (preferred_username), para canjear invitaciones hechas por usuario. */
export type OidcUser = { sub: string; email: string; name: string | null; usuario: string | null };

/** Decodifica el payload de un JWT sin verificar firma (solo para leer claims tras un intercambio seguro). */
function decodeJwt(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function resolveUser(cfg: OidcConfig, tokens: TokenResponse): Promise<OidcUser> {
  let claims: Record<string, unknown> = {};
  const doc = await discover(cfg.issuer);
  if (tokens.access_token && doc.userinfo_endpoint) {
    const res = await fetch(doc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
    });
    if (res.ok) claims = (await res.json()) as Record<string, unknown>;
  }
  if (!claims.sub && tokens.id_token) {
    claims = decodeJwt(tokens.id_token) ?? {};
  }
  // DSM manda "" (cadena vacía) para claims ausentes; ?? no lo captura → tratar "" como indefinido.
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const sub = str(claims.sub) ?? str(claims.user_id) ?? str(claims.uid) ?? "";
  const preferred = str(claims.preferred_username) ?? str(claims.username) ?? str(claims.name);
  const emailClaim = str(claims.email);
  const email = (
    emailClaim ?? (preferred ? `${preferred}@sso.local` : sub ? `${sub}@sso.local` : "")
  ).toLowerCase();
  const name = str(claims.name) ?? preferred ?? null;
  return { sub, email, name, usuario: str(claims.preferred_username) ?? str(claims.username) ?? null };
}

/** Base pública de la app para redirecciones propias (evita url.origin = 0.0.0.0:3000 tras un proxy inverso). */
export function appBaseUrl(fallbackOrigin: string): string {
  const r = process.env.OIDC_REDIRECT_URI;
  if (r) {
    try { return new URL(r).origin; } catch {}
  }
  return process.env.APP_ORIGIN || fallbackOrigin;
}
