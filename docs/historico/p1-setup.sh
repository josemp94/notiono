#!/usr/bin/env bash
set -e
cd ~/Projects/notiono
tar -xzf _p1.tgz && rm -f _p1.tgz
echo 'DATABASE_URL="postgresql://notely:notely@localhost:5432/notely"' > .env
echo 'AUTH_SECRET="dev-secret-cambiar-en-prod"' >> .env
# prisma.seed en package.json (via node)
node -e 'const fs=require("fs");const p=require("./package.json");p.prisma={seed:"tsx prisma/seed.ts"};fs.writeFileSync("package.json",JSON.stringify(p,null,2))'
echo "[setup] instalando tsx..."
npm install -D tsx >/tmp/p1.log 2>&1
echo "[setup] prisma generate + migrate + seed..."
npx prisma generate >>/tmp/p1.log 2>&1
npx prisma migrate dev --name init >>/tmp/p1.log 2>&1
npx prisma db seed >>/tmp/p1.log 2>&1
echo "[setup] build..."
npm run build >>/tmp/p1.log 2>&1 && echo "P1_BUILD_OK" >>/tmp/p1.log || echo "P1_BUILD_FAIL" >>/tmp/p1.log
