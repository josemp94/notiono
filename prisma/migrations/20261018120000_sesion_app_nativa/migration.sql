-- Código de un solo uso con el que la app nativa canjea su sesión tras el SSO (RFC 8252 + PKCE).
CREATE TABLE "AppAuthCode" (
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppAuthCode_pkey" PRIMARY KEY ("codeHash")
);

ALTER TABLE "AppAuthCode" ADD CONSTRAINT "AppAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
