# La pile Docker — Édition Mapoukam en un `docker compose up`

> Rédigé le 22 septembre 2026. Destiné à qui déploie, pas à qui développe :
> le développement quotidien reste `supabase start` + `npm run dev`, et cette
> pile ne le remplace pas.

---

## 0. Ce que c'est, et ce que c'est *à côté de*

Ce dépôt porte **deux chemins de déploiement**, et ils ne se contredisent pas :

| | `docs/HEBERGEMENT-VPS.md` | **cette pile** |
| --- | --- | --- |
| Supabase | la composition **officielle**, branche `self-hosted/v0.8.1`, plus une surcharge | sept services, déclarés ici |
| L'application | un service **systemd**, hors Docker | un conteneur |
| Nginx | sur l'hôte, avec certbot | sur l'hôte pour le TLS ; la **passerelle** est dans la pile |
| Ce qu'on y gagne | la composition officielle suit les montées de version de Supabase | un seul fichier, une seule commande, la même chose partout |
| Ce qu'on y perd | six fichiers à comprendre au lieu d'un | **il faut épingler les images soi-même**, et les suivre |

**Lequel choisir.** Pour la mise en production décrite dans
`HEBERGEMENT-VPS.md`, la composition officielle reste la référence : elle est
maintenue par Supabase, et une montée de version y est un `git pull`. Cette
pile-ci vaut pour ce qu'elle rend possible autrement — une préproduction
jetable, un second environnement, une recette sur une machine neuve, une
reprise après incident — parce qu'elle tient en un fichier qu'on lit en
entier.

Les deux servent **la même application** et **le même schéma** : les 87
migrations, les quatre buckets, les mêmes plafonds.

---

## 1. Les fichiers

```
Dockerfile                        l'image de l'application (Node 22, poppler)
.dockerignore                     ce que le contexte de build n'emporte pas
docker-compose.yml                les huit services
docker/env.exemple                l'environnement, à copier en .env
docker/generer-cles.mjs           les six secrets, sans dépendance
docker/passerelle.conf            Nginx : /auth/v1, /rest/v1, /storage/v1
docker/db-init/01-roles.sql       mots de passe des rôles de service
docker/db-init/02-jwt.sql         le secret de signature, posé sur la base
docker/appliquer-migrations.sh    les 87 migrations, dans l'ordre, une fois
```

---

## 2. Démarrer

```bash
cp docker/env.exemple .env
node docker/generer-cles.mjs >> .env     # POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY…
chmod 600 .env

# Relire .env : les adresses, le courrier, les étiquettes d'images.
docker compose up -d db auth rest storage imgproxy passerelle
docker compose --profile migrations up migrations       # les 87 migrations
docker compose up -d --build app
docker compose ps
```

L'ordre n'est pas décoratif. Le **build de l'application fige les variables
`NEXT_PUBLIC_*`** et peut avoir besoin de joindre l'API : la passerelle doit
répondre avant. Et les migrations créent les buckets — une application
démarrée avant eux sert un catalogue vide, ce qui ressemble à un défaut de
données.

En local, pour que `api.mapoukam.localhost` résolve depuis le navigateur :

```
# Linux/macOS : /etc/hosts   —   Windows : C:\Windows\System32\drivers\etc\hosts
127.0.0.1   api.mapoukam.localhost
```

### Vérifier

```bash
curl -I http://localhost:3000/fr                                      # 200
curl -I http://localhost:3000/dev                                     # 404 en production
curl -s  http://api.mapoukam.localhost:8000/rest/v1/ -H "apikey: $ANON_KEY" | head -c 200
curl -I http://api.mapoukam.localhost:8000/modeles-email/confirmation.html  # 200
curl -I http://api.mapoukam.localhost:8000/                           # 404 : rien d'autre n'est publié

ss -tlnp | grep -E ':3000|:8000|:54322'   # 127.0.0.1 UNIQUEMENT, jamais 0.0.0.0
```

---

## 3. Les huit services

| Service | Rôle | Publié |
| --- | --- | --- |
| `db` | PostgreSQL 17, image `supabase/postgres` — elle apporte les rôles et les extensions que les migrations supposent | `127.0.0.1:54322` |
| `auth` | gotrue — comptes, sessions, codes à six chiffres | non |
| `rest` | PostgREST — l'API de données, sous RLS | non |
| `storage` | storage-api — les quatre buckets | non |
| `imgproxy` | redimensionnement des couvertures | non |
| `passerelle` | Nginx — expose les trois préfixes, et **rien d'autre** | `127.0.0.1:8000` |
| `app` | Next.js 16 | `127.0.0.1:3000` |
| `migrations` | profil `migrations` — les 87 fichiers, une fois chacun | — |
| `studio` + `meta` | profil `studio` — le tableau de bord, par tunnel SSH | `127.0.0.1:54323` |

---

## 4. Les six pièges, et où ils sont traités

Ce sont ceux qui ne se manifestent pas par un message clair.

> **Le `docker-compose.yml` ne porte aucun commentaire**, par choix. Les
> raisons de ses réglages les moins évidents sont donc ici, et **seulement
> ici** : c'est le document à lire avant de « simplifier » une ligne.

| Piège | Ce qu'on voit | Traité par |
| --- | --- | --- |
| **`POSTGRES_USER` ne doit PAS être posé** | la base démarre, se déclare **saine**, et reste nue : aucun rôle de service, migrations en échec sur `supabase_admin`, `auth`/`rest`/`storage` en boucle | son **absence** du service `db`. L'image initialise son cluster avec `supabase_admin`, et c'est son `migrate.sh` qui crée `authenticator`, `anon`, `service_role`… Poser `postgres` écrase ce défaut |
| **Les scripts d'init vont dans `init-scripts/`** | `role "authenticator" does not exist` pendant l'initialisation, puis une base sans rôles | les deux montages vers `/docker-entrypoint-initdb.d/init-scripts/`. La **racine** de ce répertoire est jouée par PostgreSQL **avant** `migrate.sh`, donc avant la création des rôles |
| **Un `alter` sur un rôle absent arrête tout le fichier** | `storage` en boucle sur un refus d'authentification, `storage.buckets` jamais créée, migration 0020 en échec — quatre symptômes, une ligne | `docker/db-init/01-roles.sql` : chaque rôle n'est traité **que s'il existe** (`supabase_functions_admin` n'est pas dans cette pile) |
| **Le délai de grâce du contrôle de santé** | `dependency failed to start: container ... is unhealthy`, alors que la base s'initialise normalement | `start_period: 120s` et `retries: 20`. La **première** initialisation joue une centaine de migrations internes et dure plus de 150 s |
| **`storage.buckets` est créée par le service `storage`** | la migration 0020 échoue sur `relation "storage.buckets" does not exist`, et le site refuse de démarrer | une attente de cette table dans `docker/appliquer-migrations.sh`. `service_started` garantit que le conteneur est **lancé**, jamais qu'il a **fini** |
| **Le quota d'emails de gotrue** | gotrue reçoit une valeur vide là où il attend un entier | `GOTRUE_RATE_LIMIT_EMAIL_SENT: "30"` **en dur** : cette variable n'existe pas dans `docker/env.exemple`, et une référence non résolue arrive vide |
| **Plafond de stockage à 50 Mo** | un gros conte refuse de se déposer, sans parler de taille | `FILE_SIZE_LIMIT: "209715200"`. La valeur est écrite **en dur** dans la composition officielle de Supabase ; les buckets du projet acceptent 100 et 200 Mo |
| **`NEXT_PUBLIC_*` figées au build** | une URL ou une direction visuelle changée « ne prend pas » après redémarrage — et l'écart ne se voit **que** dans un navigateur | les `args:` du service `app`. Next recopie ces valeurs dans le JavaScript envoyé au client : il faut **reconstruire**, pas redémarrer |
| **Une URL qui ne résout que d'un côté** | l'application marche dans le navigateur et échoue côté serveur | l'alias réseau de `passerelle` (`SUPABASE_ALIAS_INTERNE`) |
| **Docker contourne ufw** | Postgres joignable depuis Internet malgré le pare-feu | tous les `ports:` sont liés à `127.0.0.1` |
| **La barre finale de `proxy_pass`** | gotrue répond 404, comme si la route n'existait pas | `docker/passerelle.conf` |
| **Gabarits d'email non servis** | l'email arrive avec un lien, pas un code : l'inscription est une impasse | `GOTRUE_MAILER_TEMPLATES_*` + `/modeles-email/` |

À quoi s'ajoutent deux règles que la pile applique en silence :

- **`seed.sql` n'est jamais exécuté.** Le jeu de démonstration écrit dix contes
  fictifs et des comptes d'essai ; et `access.test.ts` attend exactement dix
  livres, ce qui rend l'erreur discrète longtemps.
- **`supabase_migrations.schema_migrations`** est la table du CLI, pas une
  table à nous. Une base reprise d'un projet hébergé arrive avec elle déjà
  remplie, et seules les migrations manquantes sont rejouées.

---

## 5. Exploitation

```bash
# Mettre à jour l'application
git pull
docker compose --profile migrations up migrations    # AVANT de reconstruire
docker compose up -d --build app

# Les journaux
docker compose logs -f app
docker compose logs -f auth

# Un script de maintenance, dans le conteneur de l'application
docker compose exec app node scripts/purge-invoices.mjs
docker compose exec app node scripts/creer-admin.mjs

# psql
docker compose exec db psql -U postgres
```

### Sauvegardes

Deux choses à sauver, et un dump de base ne contient **que la première** :

```bash
docker compose exec -T db pg_dump --format=custom -U postgres postgres > base-$(date +%F).dump
docker run --rm -v editionmapoukam_fichiers-storage:/src -v "$PWD":/dest alpine \
  tar -czf /dest/fichiers-$(date +%F).tar.gz -C /src .
```

> Une sauvegarde qui reste sur le serveur ne protège pas du serveur. La copier
> ailleurs chaque nuit, et **essayer une restauration** au moins une fois.

---

## 6. Devant la pile : Nginx et HTTPS

Rien dans cette pile ne porte de certificat. Sur un VPS, le Nginx de l'hôte
reste celui de `HEBERGEMENT-VPS.md` §7 — mêmes `server`, mêmes plafonds, mêmes
délais — à ceci près que le bloc `location /modeles-email/` n'a plus besoin
d'`alias` : la passerelle les sert déjà.

```nginx
server { listen 80; server_name DOMAINE www.DOMAINE;
         client_max_body_size 100m;
         location / { proxy_pass http://127.0.0.1:3000; … } }

server { listen 80; server_name api.DOMAINE;
         client_max_body_size 200m;
         location / { proxy_pass http://127.0.0.1:8000; … } }
```

Puis `certbot --nginx -d DOMAINE -d www.DOMAINE -d api.DOMAINE`.

Et, dans `.env`, les trois lignes qui changent alors :

```
APP_PUBLIC_URL=https://DOMAINE
SUPABASE_PUBLIC_URL=https://api.DOMAINE
SUPABASE_ALIAS_INTERNE=passerelle.interne
```

La troisième parce qu'un alias qui capterait `api.DOMAINE` enverrait le
conteneur `app` parler TLS à un port qui n'écoute qu'en clair — et l'erreur
ne nommerait ni l'alias, ni le schéma.
