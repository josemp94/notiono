import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOidcConfig, buildAuthUrl, appBaseUrl } from "@/server/oidc";
import { APP_CHALLENGE_COOKIE, esChallenge } from "@/server/appAuth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = appBaseUrl(url.origin);
  const cfg = getOidcConfig();
  // La app nativa entra con ?app=1&challenge=<S256>: el callback le devolverá un
  // código en vez de la cookie (ver src/server/appAuth.ts).
  const challenge = url.searchParams.get("app") === "1" ? url.searchParams.get("challenge") : null;
  if (url.searchParams.get("app") === "1" && !esChallenge(challenge)) {
    return NextResponse.json({ error: "challenge PKCE (S256) inválido" }, { status: 400 });
  }
  if (!cfg) return NextResponse.redirect(new URL("/login?e=oidc_off", base));
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = await buildAuthUrl(cfg, base, state);
    const res = NextResponse.redirect(authUrl);
    res.headers.append("Set-Cookie", `oidc_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    // Un inicio web borra la marca de la app: si no, un login web justo después de
    // uno a medias desde la app acabaría redirigiendo a notiono://.
    res.headers.append(
      "Set-Cookie",
      challenge
        ? `${APP_CHALLENGE_COOKIE}=${challenge}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
        : `${APP_CHALLENGE_COOKIE}=; Path=/; Max-Age=0`,
    );
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?e=oidc_fail", base));
  }
}
