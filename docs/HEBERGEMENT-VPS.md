# Héberger Édition Mapoukam sur un VPS — la pile complète

> Rédigé le 21 septembre 2026. Destiné à l'administrateur du serveur, qui n'a
> pas besoin d'avoir suivi le développement pour l'appliquer.
>
> **Conventions.** `DOMAINE` désigne le nom de domaine définitif (par exemple
> `editionmapoukam.com`). Tout ce qui est écrit `EN_MAJUSCULES` entre chevrons
> — `<POSTGRES_PASSWORD>` — est une valeur à fournir, jamais à recopier telle
> quelle.
>
> **Procédure à répéter une fois à blanc** avant la vraie bascule : elle
> déplace une base de production.

---

## 0. En une page

Le site est une application **Next.js 16** (Node.js) adossée à **Supabase**
(PostgreSQL 17, authentification, stockage de fichiers, API). Les deux
tournent sur le même VPS : l'application en service `systemd`, Supabase en
conteneurs Docker, et **Nginx** devant les deux, en HTTPS.

```
Internet ──► Nginx :443  (certificats Let's Encrypt)
              ├─ DOMAINE, www.DOMAINE ──► Next.js        127.0.0.1:3000  (systemd)
              └─ api.DOMAINE          ──► passerelle Supabase 127.0.0.1:8000
                                           ├─ /auth/v1     authentification (gotrue)
                                           ├─ /rest/v1     API (PostgREST)
                                           └─ /storage/v1  fichiers (couvertures, pages, PDF)

Docker   : postgres 17 · gotrue · postgrest · storage · passerelle · studio · …
           Postgres et la passerelle n'écoutent QUE sur 127.0.0.1.
Hors VPS : SMTP (codes de connexion), API Resend (emails de l'application),
           Notch Pay (paiements), Google (connexion), DNS.
```

Pourquoi Supabase doit être public, sur `api.DOMAINE` : le **navigateur** y va
directement. Les couvertures sont servies depuis le bucket public, et les liens
de téléchargement sont des URL signées du stockage.

**Ordre d'exécution.** Les sections suivent les composants, pas la chronologie.
Dans l'ordre :

> **3** serveur → **4** paquets → **5** Supabase → **6 bis** application
> (clonage, `.env.local`, build, service) → **7** Nginx et HTTPS → **6** reprise
> des données → **8** services extérieurs → **9** recette → **10** tâches et
> sauvegardes → **11** bascule.

La reprise des données vient après Nginx parce que la copie des fichiers passe
par `https://api.DOMAINE`, et elle utilise le CLI Supabase installé avec
l'application.

---

## 1. Le serveur

| | Minimum | Recommandé | Pourquoi |
| --- | --- | --- | --- |
| RAM | 8 Go | 8 Go et + | Supabase occupe 2 à 3 Go au repos ; **le dépôt d'un conte en consomme environ 3 de plus** ; Next.js quelques centaines de Mo. À 4 Go, un dépôt peut faire tuer Postgres par le système. |
| Processeur | 2 cœurs | 4 cœurs | rendu des pages PDF, filigranes |
| Disque | 40 Go SSD | 80 Go SSD | la base est petite ; le **stockage croît** (pages rendues, copies filigranées par acheteur) |
| Système | Ubuntu 24.04 LTS | — | les commandes ci-dessous le supposent |
| Swap | 4 Go | 4 Go | filet de sécurité pendant un dépôt |

Accès : **SSH par clé uniquement**, un utilisateur non root pour l'application.

---

## 2. La pile logicielle

> La liste seule, avec un bloc d'installation à exécuter d'un tenant, est dans
> [`VPS-A-INSTALLER.md`](./VPS-A-INSTALLER.md).

### Sur le serveur

| Composant | Version | Rôle |
| --- | --- | --- |
| Docker Engine + plugin `compose` | ≥ 2.24 | fait tourner Supabase |
| Node.js | **22 LTS** | exécute l'application. `package.json` dit `>=20`, mais le client de stockage exige 22. |
| npm | celui de Node 22 | installation **par le verrou** (`npm ci`) |
| git | — | récupérer le code |
| **poppler-utils** | — | `pdftoppm`, `pdftotext` : l'ingestion des PDF les appelle. Sans eux, elle bascule sur un chemin de secours plus lent. |
| Nginx | — | HTTPS, proxy, plafonds de taille |
| certbot + `python3-certbot-nginx` | — | certificats |
| ufw, fail2ban, unattended-upgrades | — | durcissement |
| `postgresql-client-17` | 17 | `psql` pour la migration et les sauvegardes |
| rclone | — | copie des fichiers lors de la migration |

### Supabase auto-hébergé (conteneurs)

Base PostgreSQL 17, **gotrue** (authentification), **PostgREST** (API),
**storage-api** (fichiers), la **passerelle** (Envoy, port 8000), Studio
(tableau de bord), postgres-meta, supavisor (pooler), realtime, imgproxy,
edge-runtime. L'application n'utilise que base, authentification, API et
stockage ; les autres tournent sans gêner, 8 Go suffisent.

### Hors du serveur

| Service | Sert à | Existe déjà ? |
| --- | --- | --- |
| **SMTP** | envoyer les **codes à six chiffres** (inscription, mot de passe oublié). Sans lui, **plus personne ne peut confirmer son adresse**. | oui : Resend, `smtp.resend.com:465`. Une boîte mail Hostinger peut le remplacer pour cet usage. |
| **API Resend** | les emails **de l'application** (confirmations de commande…) — `MAILER=resend` | oui. L'application n'a **pas** d'adaptateur SMTP : une boîte Hostinger ne remplace pas cet usage-là. |
| Notch Pay | paiements (mode test) | oui |
| Google Cloud | connexion par Google | oui |
| DNS | `DOMAINE`, `www.DOMAINE`, `api.DOMAINE` | à configurer |

---

## 3. Préparer le serveur

```bash
# Utilisateur de l'application
sudo adduser --disabled-password --gecos "" mapoukam
sudo usermod -aG docker mapoukam        # après l'installation de Docker, §4

# Pare-feu : SSH, HTTP, HTTPS, et rien d'autre
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# SSH : clés seulement (dans /etc/ssh/sshd_config)
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
sudo systemctl restart ssh

sudo apt update && sudo apt install -y fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Swap de 4 Go
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

> ⚠️ **Docker contourne ufw.** Un port publié par un conteneur est ouvert sur
> Internet **même si ufw le bloque** : Docker écrit ses propres règles
> iptables. C'est pourquoi le §5.3 lie les ports de Supabase à `127.0.0.1`, et
> le §9 vérifie depuis l'extérieur qu'ils sont bien fermés.

---

## 4. Installer les paquets

```bash
# Docker (dépôt officiel)
curl -fsSL https://get.docker.com | sudo sh

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Le reste
sudo apt install -y git poppler-utils nginx certbot python3-certbot-nginx rclone \
                    postgresql-client-17

node -v        # v22.x
pdftoppm -v    # poppler
docker compose version
```

Si `postgresql-client-17` est introuvable, ajouter d'abord le dépôt officiel
PostgreSQL (`apt.postgresql.org`) : Ubuntu 24.04 ne fournit que le client 16,
et un `pg_dump` plus ancien que le serveur refuse de fonctionner.

---

## 5. Supabase auto-hébergé

### 5.1 Récupérer la composition officielle

```bash
sudo mkdir -p /srv/editionmapoukam && sudo chown mapoukam: /srv/editionmapoukam
sudo -iu mapoukam
cd /srv/editionmapoukam
git clone --depth 1 --branch self-hosted/v0.8.1 https://github.com/supabase/supabase
mkdir supabase-projet
cp -rf supabase/docker/. supabase-projet
cd supabase-projet && cp .env.example .env
```

La version est **épinglée**. Pour en prendre une plus récente, relire ce
document en la comparant : les noms de services et de variables changent
d'une version à l'autre.

### 5.2 Les secrets et les réglages (`supabase-projet/.env`)

```bash
sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh
```

Ces scripts génèrent `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` et les
nouvelles clés. **Relire le `.env` ensuite**, puis compléter à la main :

| Variable | Valeur |
| --- | --- |
| `POSTGRES_PASSWORD` | long, **lettres et chiffres seulement** (il entre dans des URL de connexion) |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | accès à Studio ; le mot de passe doit contenir une lettre, sans caractère spécial |
| `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `LOGFLARE_*`, `S3_PROTOCOL_ACCESS_KEY_*`, `REALTIME_DB_ENC_KEY` | **toutes** à remplacer : les valeurs d'exemple sont publiques |
| `POOLER_TENANT_ID` | un identifiant court, par exemple `mapoukam` |
| `SUPABASE_PUBLIC_URL` | `https://api.DOMAINE` |
| `API_EXTERNAL_URL` | `https://api.DOMAINE/auth/v1` — **même forme que dans le `.env.example` de la version installée** |
| `SITE_URL` | `https://DOMAINE` |
| `ADDITIONAL_REDIRECT_URLS` | `https://DOMAINE/api/auth/google/retour,https://www.DOMAINE/api/auth/google/retour` |
| `JWT_EXPIRY` | `3600` |
| `DISABLE_SIGNUP` | `false` |
| `ENABLE_EMAIL_SIGNUP` | `true` |
| `ENABLE_EMAIL_AUTOCONFIRM` | **`false`** — l'adresse doit être confirmée par le code |
| `ENABLE_PHONE_SIGNUP` | `false` — le site n'a pas de connexion par téléphone |
| `ENABLE_ANONYMOUS_USERS` | `false` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Resend : `smtp.resend.com` / `465` / `resend` / `<clé API Resend>` — ou ceux de la boîte Hostinger |
| `SMTP_ADMIN_EMAIL` | l'expéditeur, sur un domaine **vérifié** chez le fournisseur SMTP (voir §8) |
| `SMTP_SENDER_NAME` | `Édition Mapoukam` |
| `COMPOSE_FILE` | **`docker-compose.yml:docker-compose.override.yml`** — voir l'encadré |
| `REGION` | une valeur réelle, par exemple `eu-west-1` : les clients S3 du §6.3 en ont besoin |

> ⚠️ **`COMPOSE_FILE` est posé par le `.env` officiel à `docker-compose.yml`
> seul.** Tant qu'il n'est pas modifié, Docker **ignore** le fichier de
> surcharge du §5.3, sans aucun message. Les gabarits d'email et le plafond de
> taille ne seraient pas appliqués, et rien ne le dirait.

### 5.3 Ce que ce projet exige en plus (`supabase-projet/docker-compose.override.yml`)

```yaml
services:
  auth:
    environment:
      # Les gabarits qui portent le CODE à six chiffres. Sans eux, gotrue envoie
      # son gabarit par défaut, qui ne contient qu'un lien — et les écrans de
      # confirmation et de mot de passe oublié deviennent inutilisables.
      # gotrue les télécharge par URL : le §7 les sert depuis Nginx.
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: "https://api.DOMAINE/modeles-email/confirmation.html"
      GOTRUE_MAILER_TEMPLATES_RECOVERY: "https://api.DOMAINE/modeles-email/recovery.html"
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "Confirmez votre adresse — Édition Mapoukam"
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Réinitialiser votre mot de passe — Édition Mapoukam"
      GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: "true"
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true"
      GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: "10"
      GOTRUE_SMTP_MAX_FREQUENCY: "60s"
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "30"
      # Les trois suivantes ne figurent pas dans l'exemple officiel de gotrue :
      # les noms sont ceux de sa configuration, mais le test de recette du §9
      # doit le CONFIRMER. Leurs valeurs par défaut (6 chiffres, 1 heure) sont
      # déjà celles du projet ; seule la longueur du mot de passe diffère (6).
      GOTRUE_MAILER_OTP_LENGTH: "6"
      GOTRUE_MAILER_OTP_EXP: "3600"
      GOTRUE_PASSWORD_MIN_LENGTH: "10"

  storage:
    environment:
      # Écrit EN DUR à 50 Mo dans la composition officielle. Les buckets du
      # projet acceptent 100 Mo (sources PDF) et 200 Mo (copies filigranées) :
      # sans ceci, le dépôt d'un gros conte échoue sur le VPS alors qu'il passe
      # aujourd'hui en ligne.
      FILE_SIZE_LIMIT: "209715200"

  # Postgres (via le pooler) et la passerelle : localhost SEULEMENT.
  # `!override` REMPLACE la liste des ports au lieu de l'allonger — sans lui,
  # Compose ajouterait ces lignes aux publications sur 0.0.0.0 sans les retirer.
  supavisor:
    ports: !override
      - "127.0.0.1:${POSTGRES_PORT}:5432"
      - "127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543"
  api-gw:
    ports: !override
      - "127.0.0.1:8000:8000"
```

> **Vérifier le nom des services** avant de démarrer :
> `docker compose config --services`. Selon la version, la passerelle
> s'appelle `api-gw` ou `kong`. Un nom faux ne lève pas d'erreur : la surcharge
> crée un service fantôme, et le port reste ouvert.

### 5.4 Démarrer

```bash
docker compose pull
docker compose up -d
docker compose ps                      # tous « healthy »
ss -tlnp | grep -E ':5432|:6543|:8000' # 127.0.0.1 UNIQUEMENT, jamais 0.0.0.0
```

Si la passerelle refuse de démarrer sur une erreur d'`entrypoint`, les
fichiers ont été récupérés avec des fins de ligne Windows (CRLF) : cloner
directement sur le serveur, jamais depuis un poste Windows.

**Studio** n'est pas publié sur Internet (§7). Pour l'ouvrir, depuis son propre
poste : `ssh -L 8000:127.0.0.1:8000 mapoukam@<IP_DU_VPS>`, puis
`http://localhost:8000`.

La **connexion PostgreSQL**, pour les scripts et la migration, passe par le
pooler, avec un nom d'utilisateur **qualifié par le tenant** :

```
postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres
```

---

## 6. La base de données : reprendre les données actuelles

La production tourne aujourd'hui sur le projet Supabase hébergé
`gfwlzhpuaupayaydyecv`. On en copie **la base** (comptes et mots de passe
compris) puis **les fichiers**, qu'un dump de base ne contient pas.

> ❌ **Ne jamais lancer `npm run db:seed` ni `db:reset` sur ce serveur.** Le
> jeu de démonstration écrit dix contes fictifs et des comptes d'essai. C'est
> un outil de développement.

### 6.1 Sauvegarder l'ancienne base

La chaîne de connexion de l'ancien projet se trouve dans le tableau de bord
Supabase → **Connect** (mode *Session pooler*). Le mot de passe de la base
peut y être réinitialisé si personne ne le connaît.

```bash
cd /srv/editionmapoukam/app      # le dépôt, cloné au §6 bis — le CLI Supabase y est installé
ANCIENNE="postgresql://<chaîne affichée par le tableau de bord>"

npx supabase db dump --db-url "$ANCIENNE" -f roles.sql  --role-only
npx supabase db dump --db-url "$ANCIENNE" -f schema.sql
npx supabase db dump --db-url "$ANCIENNE" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes" -x "storage.objects"
```

`storage.objects` est **exclu à dessein** : ses lignes seront recréées par la
copie des fichiers (§6.3). Les restaurer séparément laisserait la base désigner
des fichiers absents — et une couverture absente n'affiche pas le substitut
prévu, elle affiche une **image cassée**.

### 6.2 Restaurer, puis appliquer les migrations manquantes

```bash
NOUVELLE="postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"

psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$NOUVELLE"
```

Ensuite, **comparer** la dernière migration enregistrée à la dernière du dépôt :

```bash
psql "$NOUVELLE" -c "select version from supabase_migrations.schema_migrations order by version desc limit 3;"
ls supabase/migrations | tail -3
```

> ⚠️ **Au 21 septembre 2026, la migration `20260919000087_admin_couverture_jeton.sql`
> n'a jamais été appliquée à l'ancien projet.** Elle manquera donc à la copie.
> L'appliquer, ainsi que toute migration plus récente, **dans l'ordre** :
>
> ```bash
> psql --variable ON_ERROR_STOP=1 "$NOUVELLE" \
>   -f supabase/migrations/20260919000087_admin_couverture_jeton.sql
> ```
>
> Sans elle, les couvertures n'apparaissent pas dans l'administration.

Contrôle : les mêmes nombres des deux côtés.

```bash
for B in "$ANCIENNE" "$NOUVELLE"; do
  psql "$B" -tAc "select (select count(*) from auth.users) as comptes,
                         (select count(*) from public.books) as livres,
                         (select count(*) from public.orders) as commandes,
                         (select count(*) from public.entitlements) as droits;"
done
```

### 6.3 Copier les fichiers (rclone, par le protocole S3)

Quatre buckets : `covers` (public), `book-sources`, `book-pages`,
`book-downloads` (privés). Les clés S3 de l'ancien projet se créent dans le
tableau de bord → **Storage → Settings → S3 access keys**, qui affiche aussi
l'adresse et la région.

`~/.config/rclone/rclone.conf` :

```ini
[ancien]
type = s3
provider = Other
access_key_id = <clé S3 de l'ancien projet>
secret_access_key = <secret S3 de l'ancien projet>
endpoint = <adresse S3 affichée par le tableau de bord>
region = <région affichée>
force_path_style = true

[nouveau]
type = s3
provider = Other
access_key_id = <S3_PROTOCOL_ACCESS_KEY_ID du .env Supabase>
secret_access_key = <S3_PROTOCOL_ACCESS_KEY_SECRET du .env Supabase>
endpoint = https://api.DOMAINE/storage/v1/s3
region = <REGION du .env Supabase>
force_path_style = true
```

```bash
for B in covers book-sources book-pages book-downloads; do
  rclone copy "ancien:$B" "nouveau:$B" --progress --transfers 4
  echo "$B : $(rclone size "ancien:$B" --json)  ->  $(rclone size "nouveau:$B" --json)"
done
```

Nginx (§7) doit être en place avant cette étape : l'adresse `api.DOMAINE`
passe par lui. `book-downloads` ne contient que des **copies filigranées**,
régénérées à la demande : si sa copie échoue, le site continue de fonctionner.

---

## 6 bis. L'application

### Code et installation

```bash
sudo -iu mapoukam
cd /srv/editionmapoukam
git clone https://github.com/brayanroys8888888/EditionMapoukam.git app
cd app
npm ci          # le verrou fait foi ; ne jamais lancer `npm install` en production
```

### Environnement (`/srv/editionmapoukam/app/.env.local`, droits `600`)

Next.js le lit en production, et c'est aussi le fichier que lisent les
scripts de maintenance.

> ⚠️ **Toute variable `NEXT_PUBLIC_*` est figée AU BUILD.** Elle est recopiée
> dans le code envoyé aux navigateurs. En changer une impose de **reconstruire**
> (`npm run build`) ; un simple redémarrage ne suffit pas.

| Variable | Obligatoire | Valeur |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | oui | `https://api.DOMAINE` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | oui | `ANON_KEY` du `.env` Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | `SERVICE_ROLE_KEY` du `.env` Supabase — **jamais** dans une variable `NEXT_PUBLIC_` : l'application refuse de démarrer si c'est le cas |
| `NEXT_PUBLIC_APP_URL` | oui | `https://DOMAINE` |
| `FAKE_WEBHOOK_SECRET` | **oui, même en production** | 8 caractères au moins ; le démarrage échoue sans lui |
| `NEXT_PUBLIC_DESIGN_VERSION` | non (défaut `v2`) | **recopier la valeur de Vercel** |
| `PAYMENT_PROVIDER` | non (défaut `fake`) | `notchpay` |
| `NOTCHPAY_PUBLIC_KEY` / `NOTCHPAY_PRIVATE_KEY` / `NOTCHPAY_HASH_KEY` | si `notchpay` | recopier de Vercel — voir `docs/NOTCHPAY.md` |
| `NOTCHPAY_AUTORISER_PRODUCTION` | non | `false` tant que les paiements sont en test |
| `MAILER` | non (défaut `file`) | **`resend`** — `file` écrit les emails sur le disque et n'envoie rien |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | si `resend` | recopier de Vercel ; l'expéditeur doit être sur un domaine vérifié chez Resend |
| `AUTH_GOOGLE` | non (défaut `desactive`) | **recopier de Vercel** (`better-auth` depuis le 16 septembre) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `BETTER_AUTH_SECRET` | si `better-auth` | recopier de Vercel |
| `AUTH_CONFIRMATION_AUTOMATIQUE` | non | `false` — un SMTP est en place |
| `DATABASE_URL` | pour les scripts seulement | la connexion du §5.4 ; l'application elle-même ne s'en sert pas |
| `SIGNED_URL_TTL`, `SIGNED_URL_TTL_FREE`, `EXCERPT_PAGES_DEFAULT`, `ANON_PAGE_RATE_LIMIT`, `INVOICE_RETENTION_YEARS`, `LOG_LEVEL` | non | recopier de Vercel s'ils y sont posés ; sinon les défauts conviennent |

La liste de référence, commentée, est `.env.example`. Le moyen le plus sûr de
ne rien oublier : **exporter les variables de Vercel** (Settings → Environment
Variables), puis remplacer les quatre qui changent — l'URL et les deux clés
Supabase, et l'URL du site.

### Construire et lancer

```bash
chmod 600 .env.local
npm run build
```

`/etc/systemd/system/editionmapoukam.service` :

```ini
[Unit]
Description=Édition Mapoukam — application Next.js
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=mapoukam
WorkingDirectory=/srv/editionmapoukam/app
Environment=NODE_ENV=production
# 127.0.0.1 : seul Nginx doit pouvoir joindre l'application.
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now editionmapoukam
journalctl -u editionmapoukam -f      # le journal
```

Sur un VPS, **aucune fonction n'est coupée à 60 secondes** comme sur Vercel :
les `maxDuration` du code n'y ont pas d'effet, et c'est tant mieux pour le
dépôt de contes et la génération des filigranes.

---

## 7. Nginx et HTTPS

`/etc/nginx/sites-available/editionmapoukam` :

```nginx
# ── Le site ────────────────────────────────────────────────────────────────
server {
    listen 80;
    server_name DOMAINE www.DOMAINE;

    # Le dépôt d'un conte envoie jusqu'à 100 Mo. Nginx plafonne à 1 Mo par
    # défaut : sans cette ligne, chaque dépôt réel échoue — et le dépôt a déjà
    # quatre plafonds alignés sur ce nombre dans le code.
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Un dépôt de conte et la première génération d'un filigrane prennent
        # plusieurs dizaines de secondes.
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}

# ── Supabase ───────────────────────────────────────────────────────────────
server {
    listen 80;
    server_name api.DOMAINE;

    # L'application y dépose les sources (100 Mo) et les copies filigranées
    # (jusqu'à 200 Mo).
    client_max_body_size 200m;

    # Les trois services dont le site a besoin. RIEN d'autre n'est publié :
    # ni Studio, ni postgres-meta (`/pg/`), qui donnent la main sur la base.
    location ~ ^/(auth|rest|storage)/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }

    # Les gabarits d'email à code, téléchargés par gotrue (§5.3).
    location /modeles-email/ {
        alias /srv/editionmapoukam/app/supabase/templates/;
    }

    location / {
        return 404;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/editionmapoukam /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Une fois le DNS pointé vers le VPS :
sudo certbot --nginx -d DOMAINE -d www.DOMAINE -d api.DOMAINE
```

Certbot ajoute la redirection HTTP → HTTPS et le renouvellement automatique.

---

## 8. Les services extérieurs à mettre à jour

| Où | Quoi |
| --- | --- |
| **DNS** du domaine | enregistrements `A` : `DOMAINE`, `www.DOMAINE`, `api.DOMAINE` → IP du VPS. Baisser leur TTL à 300 s la veille de la bascule. |
| **Resend** | vérifier le **nouveau** domaine (enregistrements DNS fournis par Resend), puis passer `RESEND_FROM_EMAIL` et `SMTP_ADMIN_EMAIL` dessus. L'expéditeur actuel est sur `edition-mapoukam.royceproject.site`. |
| Boîte Hostinger (si elle remplace Resend pour le SMTP) | enregistrements **SPF, DKIM et DMARC** du domaine, sans quoi les codes finissent en indésirables |
| **Google Cloud** → Identifiants → le client OAuth | origine autorisée `https://DOMAINE` ; URI de redirection `https://DOMAINE/api/better-auth/callback/google` (mode `better-auth`) |
| **Notch Pay** → webhooks | `https://DOMAINE/api/webhooks/payments` |

---

## 9. Recette — avant d'ouvrir au public

Depuis un poste **extérieur** au VPS :

```bash
nmap -Pn -p 22,80,443,3000,5432,6543,8000 <IP_DU_VPS>
# attendu : 22, 80, 443 ouverts — tout le reste FERMÉ ou FILTRÉ

curl -I https://DOMAINE/fr                                   # 200
curl -I https://DOMAINE/dev                                  # 404 : console de simulation fermée en production
curl -I https://api.DOMAINE/                                 # 404 : Studio non publié
curl -I https://api.DOMAINE/pg/                              # 404 : postgres-meta non publié
curl -I https://api.DOMAINE/modeles-email/confirmation.html  # 200
```

Dans un navigateur :

- [ ] les pages publiques, le catalogue, les **couvertures** ;
- [ ] **inscription** : l'email arrive, porte un **code à six chiffres** (et non un simple lien), et le code confirme l'adresse ;
- [ ] **un mot de passe de 9 caractères est refusé** — c'est ce qui confirme que `GOTRUE_PASSWORD_MIN_LENGTH` est bien lu ;
- [ ] mot de passe oublié : code reçu, mot de passe changé ;
- [ ] connexion d'un compte **existant** avec son ancien mot de passe — preuve que les comptes ont survécu à la migration ;
- [ ] connexion par Google ;
- [ ] lecture en ligne d'un titre ;
- [ ] **téléchargement** d'un titre acheté, trois fois de suite : le nom du fichier ne contient aucun `%` ;
- [ ] dans l'administration, **déposer un conte de plus de 50 Mo** — c'est le test du plafond de stockage et de Nginx ;
- [ ] les couvertures apparaissent dans la fiche d'administration (migration `0087`) ;
- [ ] un paiement Notch Pay de test, jusqu'au droit accordé.

---

## 10. Tâches planifiées et sauvegardes

### Tâches (`crontab -e` de l'utilisateur `mapoukam`)

```cron
# Purge légale des factures échues (docs/AVANT-MISE-EN-PRODUCTION.md, B2).
30 3 * * *  cd /srv/editionmapoukam/app && /usr/bin/node scripts/purge-invoices.mjs >> /var/log/editionmapoukam/purge-factures.log 2>&1

# Sauvegarde de la base, chaque nuit.
0 2 * * *   /srv/editionmapoukam/sauvegarde.sh >> /var/log/editionmapoukam/sauvegarde.log 2>&1
```

Ce qui **n'a pas encore de déclencheur automatique**, et ne se résout pas par
l'hébergement : la purge des copies filigranées se lance à la main depuis
l'administration (D1), et les abonnements échus ne changent pas de statut
stocké (B3) — **sans faille d'accès**, le moteur de droits refuse déjà l'accès
à l'échéance. Voir `docs/AVANT-MISE-EN-PRODUCTION.md`, B5.

### Sauvegardes (`/srv/editionmapoukam/sauvegarde.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
JOUR=$(date +%F)
DEST=/srv/editionmapoukam/sauvegardes
mkdir -p "$DEST"

# La base : format custom, restaurable avec pg_restore.
pg_dump --format=custom --file "$DEST/base-$JOUR.dump" \
  "postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"

# Les fichiers : le volume de stockage de Supabase.
tar -czf "$DEST/fichiers-$JOUR.tar.gz" -C /srv/editionmapoukam/supabase-projet volumes/storage

# Quatorze jours sur place.
find "$DEST" -type f -mtime +14 -delete
```

> **Une sauvegarde qui reste sur le serveur ne protège pas du serveur.** La
> copier chaque nuit ailleurs — rclone vers un stockage externe — et
> **essayer une restauration** au moins une fois, sur une machine de test.
> C'est ce que faisait le Supabase hébergé ; c'est désormais à l'exploitant.

---

## 11. Bascule et retour en arrière

1. **La veille** : TTL DNS à 300 s ; répétition complète des §6.1 à 6.3.
2. **Le jour** : annoncer une courte maintenance ; plus aucune écriture sur
   l'ancien site — pas de commande, pas de dépôt.
3. Refaire §6.1 → 6.3 : la copie **définitive**.
4. Pointer le DNS sur le VPS ; `certbot` ; dérouler la recette du §9.
5. **Garder Vercel et l'ancien projet Supabase intacts une semaine.**

**Revenir en arrière** : repointer le DNS vers Vercel. Attention, tout ce qui a
été écrit sur le VPS depuis la bascule — commandes, inscriptions — **n'existe
pas** dans l'ancien projet. Décider dans les premières heures.

> Les secrets JWT changent avec le VPS : **toutes les sessions en cours sont
> fermées** à la bascule. Chacun se reconnecte une fois, avec son mot de passe
> habituel.

---

## 12. Exploitation courante

```bash
# Mettre à jour l'application
cd /srv/editionmapoukam/app
git pull
npm ci
npm run build
sudo systemctl restart editionmapoukam

# Une nouvelle migration SQL dans le dépôt : l'appliquer AVANT de redémarrer
psql --variable ON_ERROR_STOP=1 "$NOUVELLE" -f supabase/migrations/<nouveau_fichier>.sql

# Supabase
cd /srv/editionmapoukam/supabase-projet
docker compose ps
docker compose logs -f auth        # ou storage, rest…
```

Les migrations sont numérotées et **jamais modifiées** une fois appliquées :
une correction arrive toujours sous la forme d'un nouveau fichier. Les
appliquer dans l'ordre du nom.

---

## 13. Les pièges, rassemblés

| Piège | Symptôme | Où c'est traité |
| --- | --- | --- |
| Docker contourne ufw | Postgres joignable depuis Internet malgré le pare-feu | §5.3, §9 |
| `COMPOSE_FILE` du `.env` officiel | la surcharge est ignorée sans message | §5.2 |
| Plafond de stockage à 50 Mo, en dur | un gros conte refuse de se déposer | §5.3 |
| Plafond Nginx à 1 Mo par défaut | tout dépôt échoue | §7 |
| Gabarits d'email non servis | l'email arrive sans code, les écrans de confirmation sont inutilisables | §5.3, §7 |
| `NEXT_PUBLIC_*` figées au build | une URL changée « ne prend pas » après redémarrage | §6 bis |
| Migration `0087` absente de l'ancien projet | pas de couvertures dans l'administration | §6.2 |
| `storage.objects` restauré sans ses fichiers | images cassées au lieu du substitut | §6.1 |
| `db:seed` lancé en production | dix contes fictifs dans le catalogue | §6 |
| Fins de ligne Windows | la passerelle Supabase ne démarre pas | §5.4 |
| `FAKE_WEBHOOK_SECRET` absent | l'application refuse de démarrer | §6 bis |
| `MAILER=file` laissé par défaut | aucun email de l'application ne part | §6 bis |
