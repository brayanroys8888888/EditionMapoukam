# syntax=docker/dockerfile:1.7
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ L'IMAGE DE L'APPLICATION — Next.js 16, Node 22, poppler.                │
# │                                                                          │
# │ Node 22 et non 20, bien que `package.json` dise `>=20` : le client de    │
# │ stockage exige 22 (docs/VPS-A-INSTALLER.md §2).                          │
# │                                                                          │
# │ `bookworm-slim` et non `alpine` : `sharp` et `@hyzyla/pdfium` embarquent │
# │ des binaires liés à la glibc. Sur musl, ils se résolvent en apparence    │
# │ puis échouent au premier conte déposé — c'est-à-dire en ligne, jamais au │
# │ build.                                                                   │
# └──────────────────────────────────────────────────────────────────────────┘

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAGE 1 — les dépendances, installées PAR LE VERROU.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# `npm ci` et jamais `npm install` : le verrou fait foi. Et surtout pas
# `--omit=dev` — TypeScript et consorts sont NÉCESSAIRES au build.
COPY package.json package-lock.json ./
RUN npm ci


# ─────────────────────────────────────────────────────────────────────────────
# ÉTAGE 2 — le build.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# ┌──────────────────────────────────────────────────────────────────────────┐
# │ TOUTE VARIABLE `NEXT_PUBLIC_*` EST FIGÉE ICI, AU BUILD.                  │
# │                                                                          │
# │ Elle est recopiée dans le code envoyé aux navigateurs. La passer au      │
# │ conteneur au DÉMARRAGE n'a aucun effet sur le code déjà construit : une  │
# │ URL changée « ne prend pas », et rien ne le dit. D'où ces `ARG`, que le  │
# │ `docker-compose.yml` remplit depuis le même `.env` que l'exécution.      │
# └──────────────────────────────────────────────────────────────────────────┘
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_DESIGN_VERSION=v2

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_DESIGN_VERSION=${NEXT_PUBLIC_DESIGN_VERSION} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# poppler est déjà nécessaire ici : le build ne l'appelle pas, mais un écran
# rendu à la construction pourrait. Le coût est nul, l'absence coûte un
# diagnostic.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/* \
 && npm run build


# ─────────────────────────────────────────────────────────────────────────────
# ÉTAGE 3 — l'exécution.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# `pdftoppm` et `pdftotext` : l'ingestion des PDF les appelle en sous-processus.
# Sans eux elle bascule sur un chemin de secours, plus lent, sans le dire.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ┌──────────────────────────────────────────────────────────────────────────┐
# │ `node_modules` EST COPIÉ EN ENTIER, ET CE N'EST PAS UN OUBLI.            │
# │                                                                          │
# │ Deux raisons, toutes deux mesurables :                                   │
# │  1. `next.config.ts` est en TypeScript, et Next exige que `typescript`   │
# │     soit installé pour le lire — au DÉMARRAGE, pas seulement au build.   │
# │     Un `npm prune --omit=dev` fait donc échouer `next start`.            │
# │  2. `sharp` et `@hyzyla/pdfium` sont déclarés `serverExternalPackages` : │
# │     ils ne sont pas groupés, ils sont CHARGÉS depuis `node_modules` à    │
# │     l'exécution. Le `.wasm` de pdfium pèse quatre mégaoctets et se       │
# │     résout par un chemin relatif à son propre paquet.                    │
# └──────────────────────────────────────────────────────────────────────────┘
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/.next         ./.next
COPY --from=builder /app/public        ./public
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Les scripts de maintenance (purge des factures, création d'un administrateur)
# tournent dans CE conteneur, par `docker compose exec`.
COPY --from=builder /app/scripts       ./scripts
COPY --from=builder /app/supabase      ./supabase

# Un utilisateur non privilégié. `.mails` lui appartient : c'est là que
# `FileMailer` écrit quand MAILER=file.
RUN groupadd --system --gid 1001 mapoukam \
 && useradd --system --uid 1001 --gid mapoukam mapoukam \
 && mkdir -p /app/.mails \
 && chown -R mapoukam:mapoukam /app/.mails /app/.next

USER mapoukam
EXPOSE 3000

# `-H 0.0.0.0` : dans un conteneur, se lier à 127.0.0.1 rendrait l'application
# injoignable depuis la passerelle. L'exposition au réseau est décidée par les
# `ports:` du compose, pas ici.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
