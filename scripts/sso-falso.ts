/**
 * Un SSO de mentira (OIDC mínimo) para las pruebas de integración: autoriza a «Ana»
 * sin preguntar. El servidor de Notiono se arranca con OIDC_ISSUER=http://127.0.0.1:55433.
 */
import { createServer } from "node:http";

export function ssoFalso() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:55433");
    const json = (o: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(o));
    };
    if (url.pathname === "/.well-known/openid-configuration") {
      json({
        authorization_endpoint: "http://127.0.0.1:55433/authorize",
        token_endpoint: "http://127.0.0.1:55433/token",
        userinfo_endpoint: "http://127.0.0.1:55433/userinfo",
      });
    } else if (url.pathname === "/authorize") {
      const vuelta = new URL(url.searchParams.get("redirect_uri")!);
      vuelta.searchParams.set("code", "codigo-sso");
      vuelta.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: vuelta.toString() }).end();
    } else if (url.pathname === "/token") json({ access_token: "at-ana" });
    else if (url.pathname === "/userinfo") json({ sub: "ana", email: "ana@example.com", name: "Ana" });
    else res.writeHead(404).end();
  });
  return new Promise<typeof server>((ok) => server.listen(55433, "127.0.0.1", () => ok(server)));
}
