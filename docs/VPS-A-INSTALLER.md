# VPS — ce qu'il faut installer

> Liste de référence pour le serveur d'Édition Mapoukam. La procédure complète,
> avec la configuration de chaque élément, est dans
> [`HEBERGEMENT-VPS.md`](./HEBERGEMENT-VPS.md).

## 1. Le serveur

| | Valeur |
| --- | --- |
| Système | **Ubuntu 24.04 LTS** |
| Mémoire | **8 Go** de RAM (4 Go ne suffisent pas : un dépôt de conte consomme ~3 Go) |
| Processeur | 4 cœurs (2 au minimum) |
| Disque | 80 Go SSD (40 au minimum) |
| Swap | 4 Go |
| Accès | SSH par clé, un utilisateur non root |

## 2. Les logiciels du système

| Logiciel | Version | À quoi il sert |
| --- | --- | --- |
| **Docker Engine** | récente | fait tourner Supabase (base, authentification, stockage) |
| **Docker Compose** (plugin) | **≥ 2.24.4** | orchestre Supabase ; la syntaxe `!override` du fichier de surcharge l'exige |
| **Node.js** | **22 LTS** | exécute l'application Next.js — 20 ne suffit pas, le client de stockage exige 22 |
| npm | fourni avec Node 22 | installe les dépendances de l'application |
| **git** | — | récupère le code |
| **poppler-utils** | — | `pdftoppm` et `pdftotext`, appelés par l'ingestion des PDF |
| **Nginx** | — | HTTPS et proxy vers l'application et Supabase |
| **certbot** + `python3-certbot-nginx` | — | certificats Let's Encrypt |
| **postgresql-client-17** | **17** | `psql` et `pg_dump` : migration et sauvegardes. Doit être de la même version que la base (17) ; il vient du dépôt officiel PostgreSQL |
| **rclone** | — | copie des fichiers lors de la migration, et envoi des sauvegardes hors du serveur |
| **ufw** | — | pare-feu (ports 22, 80, 443 seulement) |
| **fail2ban** | — | bloque les tentatives de connexion SSH répétées |
| **unattended-upgrades** | — | mises à jour de sécurité automatiques |
| curl, ca-certificates, gnupg | — | nécessaires aux installations ci-dessus |

## 3. Installé par Docker, sans rien faire à la main

`docker compose pull` télécharge les images de Supabase auto-hébergé, dans les
versions fixées par la branche **`self-hosted/v0.8.1`** :

PostgreSQL 17 · gotrue (authentification) · PostgREST (API) · storage-api
(fichiers) · passerelle d'API · Studio (tableau de bord) · postgres-meta ·
supavisor (pooler) · realtime · imgproxy · edge-runtime.

## 4. Installé par npm, sans rien faire à la main

`npm ci` dans le dossier de l'application installe toutes les dépendances
**exactement** comme le fichier de verrouillage `package-lock.json` les décrit.
À noter :

- les **dépendances de développement sont nécessaires** au build (TypeScript,
  entre autres) : ne pas utiliser `--omit=dev` ;
- `sharp` télécharge tout seul son binaire Linux ;
- le **CLI Supabase** fait partie des dépendances, et sert à la migration de la
  base (`npx supabase db dump`) : pas besoin de l'installer à part.

## 5. Ce qu'il ne faut PAS installer

| Logiciel | Pourquoi |
| --- | --- |
| MySQL / MariaDB | le site utilise PostgreSQL, fourni par Supabase dans Docker |
| PostgreSQL serveur (`apt install postgresql`) | idem — seul le **client** 17 est nécessaire |
| PHP, Apache | inutiles ; Nginx fait le proxy |
| PM2 | l'application tourne sous `systemd` |
| Le CLI Supabase global | déjà fourni par `npm ci` |

## 6. Hors du serveur — des comptes, pas des logiciels

| Service | Existe déjà |
| --- | --- |
| **Resend** : SMTP des codes de connexion, et API des emails de l'application | oui — le nouveau domaine doit y être vérifié |
| **Notch Pay** : paiements (mode test) | oui — l'adresse du webhook change |
| **Google Cloud** : connexion par Google | oui — l'adresse de retour change |
| **DNS** : `DOMAINE`, `www.DOMAINE`, `api.DOMAINE` | à pointer vers le VPS |

---

## 7. Tout installer, d'un seul bloc

À exécuter sur un Ubuntu 24.04 neuf, avec un utilisateur qui a `sudo`.

```bash
set -euo pipefail

# ── Système de base ─────────────────────────────────────────────────────────
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git poppler-utils \
                    nginx certbot python3-certbot-nginx rclone \
                    ufw fail2ban unattended-upgrades

# ── Docker Engine + plugin Compose (dépôt officiel Docker) ─────────────────
curl -fsSL https://get.docker.com | sudo sh

# ── Node.js 22 LTS (dépôt NodeSource) ──────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# ── Client PostgreSQL 17 (dépôt officiel PostgreSQL) ───────────────────────
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
     https://www.postgresql.org/media/keys/ACCC4CF8.asc
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-client-17

# ── Mises à jour de sécurité automatiques ──────────────────────────────────
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

# ── Swap de 4 Go ───────────────────────────────────────────────────────────
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
```

Le pare-feu, l'utilisateur de l'application et la configuration SSH ne sont
**pas** dans ce bloc : une erreur à cet endroit peut couper l'accès au serveur.
Ils se font à la main, en suivant le §3 de `HEBERGEMENT-VPS.md`.

## 8. Vérifier que tout est là

```bash
node -v                   # v22.x
npm -v
docker --version
docker compose version    # 2.24.4 ou plus
git --version
pdftoppm -v               # poppler
pdftotext -v
psql --version            # 17.x
pg_dump --version         # 17.x
nginx -v
certbot --version
rclone version
free -h                   # 8 Go de mémoire, 4 Go de swap
```
