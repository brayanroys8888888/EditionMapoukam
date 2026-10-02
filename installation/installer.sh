#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo --preserve-env=CODESPACES,CODESPACE_NAME,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN,GITHUB_TOKEN bash "$0" "$@"
  fi
  echo "Lancez ce script en root : sudo bash $0" >&2
  exit 1
fi

JOURNAL=/var/log/mapoukam-installation.log
touch "$JOURNAL"
chmod 600 "$JOURNAL"
exec > >(tee -a "$JOURNAL") 2>&1

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${1:-$ICI/mapoukam.conf}"

etape() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
alerte() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }
echec() {
  trap - ERR
  printf '\n\033[1;31mÉCHEC : %s\033[0m\n' "$*"
  printf 'Journal complet : %s\n' "$JOURNAL"
  printf 'Relancer le script après correction reprend là où il s’est arrêté, sans rien perdre.\n'
  exit 1
}
trap 'echec "ligne $LINENO : $BASH_COMMAND"' ERR

reessayer() {
  local max=$1 n=1
  shift
  until "$@"; do
    if (( n >= max )); then return 1; fi
    alerte "nouvel essai ($((n + 1))/$max) : $*"
    sleep $(( n * 5 ))
    n=$(( n + 1 ))
  done
}

declare -A C=() E=() T=()

lire_fichier() {
  local -n cible=$1
  local fichier=$2 ligne cle val
  [[ -f "$fichier" ]] || return 0
  while IFS= read -r ligne || [[ -n "$ligne" ]]; do
    ligne="${ligne%$'\r'}"
    [[ "$ligne" =~ ^[[:space:]]*# ]] && continue
    [[ "$ligne" == *=* ]] || continue
    cle="${ligne%%=*}"
    cle="${cle//[[:space:]]/}"
    val="${ligne#*=}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    if [[ "$cle" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then cible[$cle]="$val"; fi
  done < "$fichier"
}

conf() { local x="${C[$1]:-}"; if [[ -n "$x" ]]; then printf '%s' "$x"; else printf '%s' "${2:-}"; fi; }

val() {
  local x
  for x in "${C[$1]:-}" "${E[$1]:-}" "${T[$1]:-}" "${2:-}"; do
    if [[ -n "$x" ]]; then printf '%s' "$x"; return; fi
  done
}

entier() {
  local x
  x="$(val "$1" "$2")"
  if [[ "$x" =~ ^[0-9]+$ ]] && (( x > 0 )); then printf '%s' "$x"; else printf '%s' "$2"; fi
}

parmi() {
  local x=$1 defaut=$2
  shift 2
  local choix
  for choix in "$@"; do
    if [[ "$x" == "$choix" ]]; then printf '%s' "$x"; return; fi
  done
  printf '%s' "$defaut"
}

booleen() {
  case "${1,,}" in
    true|oui|1|yes|vrai) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

etape "Lecture de la configuration"
if [[ -f "$CONF" ]]; then
  lire_fichier C "$CONF"
  info "fichier lu : $CONF"
else
  alerte "aucun fichier $CONF : toutes les valeurs par défaut sont appliquées"
fi

DOMAINE="$(conf DOMAINE editionsmapoukam.com)"
DOMAINE="${DOMAINE#http://}"
DOMAINE="${DOMAINE#https://}"
DOMAINE="${DOMAINE%%/*}"
DOMAINE="${DOMAINE#www.}"
DOMAINE="${DOMAINE,,}"
DEPOT="$(conf DEPOT https://github.com/brayanroys8888888/EditionMapoukam.git)"
BRANCHE="$(conf BRANCHE main)"
RACINE="$(conf DOSSIER /srv/editionmapoukam)"
RACINE="${RACINE%/}"
APP="$RACINE/app"
UTILISATEUR=mapoukam
EMAIL_CERTIFICAT="$(conf EMAIL_CERTIFICAT)"
ATTENTE_DNS_MINUTES="$(conf ATTENTE_DNS_MINUTES 30)"
[[ "$ATTENTE_DNS_MINUTES" =~ ^[0-9]+$ ]] || ATTENTE_DNS_MINUTES=30
API="api.$DOMAINE"
WWW="www.$DOMAINE"

[[ "$DOMAINE" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] \
  || echec "nom de domaine invalide : $DOMAINE"

info "domaine : $DOMAINE"
info "dépôt   : $DEPOT ($BRANCHE)"
info "dossier : $APP"

CODESPACE=0
SITE_HOTE="$DOMAINE"
API_HOTE="$API"
PORT_SITE_CS=8080
PORT_API_CS=8000
if [[ "${CODESPACES:-}" == true && -n "${CODESPACE_NAME:-}" ]]; then
  CODESPACE=1
  TRANSFERT="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  PORT_API_CS="$(conf PASSERELLE_PORT 8000)"
  [[ "$PORT_API_CS" =~ ^[0-9]+$ ]] || PORT_API_CS=8000
  SITE_HOTE="$CODESPACE_NAME-$PORT_SITE_CS.$TRANSFERT"
  API_HOTE="$CODESPACE_NAME-$PORT_API_CS.$TRANSFERT"
  info "mode    : GitHub Codespaces (essai)"
  info "site    : https://$SITE_HOTE"
  info "api     : https://$API_HOTE"
fi

etape "Vérification de la machine"
command -v apt-get >/dev/null || echec "ce script vise Ubuntu ou Debian : apt-get est introuvable"
(( CODESPACE )) || command -v systemctl >/dev/null || echec "systemd est introuvable sur cette machine"
. /etc/os-release
info "système : ${PRETTY_NAME:-inconnu}"
MEMOIRE_MO=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
info "mémoire : ${MEMOIRE_MO} Mo"
(( MEMOIRE_MO >= 3500 )) || alerte "moins de 4 Go de mémoire : la compilation et le dépôt des contes seront lents"
DISQUE_GO=$(( $(df -Pk / | awk 'NR==2 {print $4}') / 1024 / 1024 ))
info "disque libre : ${DISQUE_GO} Go"
(( DISQUE_GO >= 10 )) || echec "il faut au moins 10 Go libres sur / (il en reste ${DISQUE_GO})"

etape "Installation des logiciels du système"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
apt_() { apt-get -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -y -q "$@"; }
if (( CODESPACE )); then
  apt_ update >/dev/null 2>&1 || alerte "certaines sources apt du codespace ne répondent pas : on continue"
  reessayer 3 apt_ install ca-certificates curl git nginx openssl jq iproute2
  docker info >/dev/null 2>&1 || echec "Docker ne répond pas dans ce codespace : créez-le avec l'image par défaut, qui inclut Docker"
  docker compose version >/dev/null 2>&1 || echec "docker compose est absent de ce codespace"
  info "$(docker --version)"
  info "$(docker compose version)"
else
reessayer 3 apt_ update
reessayer 3 apt_ install ca-certificates curl git nginx certbot ufw fail2ban openssl jq iproute2 unattended-upgrades

if systemctl is-active --quiet apache2 2>/dev/null; then
  alerte "Apache occupait le port 80 : il est arrêté et désactivé"
  systemctl disable --now apache2
fi

if ! docker compose version >/dev/null 2>&1; then
  info "installation de Docker"
  if ! reessayer 3 bash -c 'curl -fsSL https://get.docker.com | sh'; then
    alerte "le script officiel de Docker a échoué : paquets de la distribution"
    reessayer 3 apt_ install docker.io docker-compose-v2
  fi
fi
if [[ ! -f /etc/docker/daemon.json ]]; then
  mkdir -p /etc/docker
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker 2>/dev/null || true
fi
systemctl enable --now docker
docker compose version >/dev/null 2>&1 || echec "docker compose est introuvable après installation"
info "$(docker --version)"
info "$(docker compose version)"
fi

if (( CODESPACE )); then
  etape "Mémoire d'échange et pare-feu"
  info "sans objet dans un codespace"
else
etape "Mémoire d'échange"
if [[ -z "$(swapon --show --noheadings 2>/dev/null)" ]]; then
  if { fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none; } \
     && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    info "4 Go d'échange ajoutés"
  else
    rm -f /swapfile
    alerte "cette machine refuse la mémoire d'échange : on continue sans"
  fi
else
  info "déjà présente"
fi

etape "Pare-feu"
PORTS_SSH="22"
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  PORTS_SSH="$PORTS_SSH $(awk '{print $4}' <<<"$SSH_CONNECTION")"
fi
PORTS_SSH="$PORTS_SSH $(ss -ltnpH 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | tr '\n' ' ')"
for p in $(tr ' ' '\n' <<<"$PORTS_SSH" | grep -E '^[0-9]+$' | sort -un); do
  ufw allow "$p/tcp" >/dev/null
  info "SSH autorisé sur le port $p"
done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || alerte "fail2ban n'a pas démarré : on continue sans"
info "ouverts : SSH, 80, 443"
fi

etape "Récupération du code"
id -u "$UTILISATEUR" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$UTILISATEUR"
if getent group docker >/dev/null; then usermod -aG docker "$UTILISATEUR"; fi
mkdir -p "$RACINE"
chown "$UTILISATEUR": "$RACINE"
en_mapoukam() { runuser -u "$UTILISATEUR" -- env HOME="/home/$UTILISATEUR" "$@"; }

if [[ -d "$APP/.git" ]]; then
  reessayer 3 en_mapoukam git -C "$APP" fetch --depth 1 origin "$BRANCHE"
  en_mapoukam git -C "$APP" reset --hard FETCH_HEAD >/dev/null
  info "code mis à jour"
elif [[ -e "$APP" && -n "$(ls -A "$APP" 2>/dev/null)" ]]; then
  echec "$APP existe déjà et n'est pas un dépôt git : déplacez-le puis relancez"
else
  reessayer 3 en_mapoukam git clone --depth 1 --branch "$BRANCHE" "$DEPOT" "$APP"
  info "code récupéré"
fi
info "version : $(en_mapoukam git -C "$APP" log -1 --format='%h %s')"
for f in docker-compose.yml Dockerfile docker/env.exemple docker/passerelle.conf docker/appliquer-migrations.sh; do
  [[ -f "$APP/$f" ]] || echec "le dépôt ne contient pas $f"
done

etape "Fichier d'environnement"
lire_fichier T "$APP/docker/env.exemple"
lire_fichier E "$APP/.env"

VOLUME_DB=editionmapoukam_donnees-db
BASE_NEUVE=1
docker volume inspect "$VOLUME_DB" >/dev/null 2>&1 && BASE_NEUVE=0

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
signer() { printf '%s' "$1" | openssl dgst -sha256 -hmac "$2" -binary | b64url; }
jeton() {
  local role=$1 secret=$2 iat tete charge
  iat=$(date +%s)
  tete=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  charge=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$role" "$iat" "$(( iat + 315360000 ))" | b64url)
  printf '%s.%s.%s' "$tete" "$charge" "$(signer "$tete.$charge" "$secret")"
}
jeton_valide() {
  local j=$1 secret=$2 role=$3
  [[ "$j" =~ ^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$ ]] || return 1
  [[ "$(signer "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}" "$secret")" == "${BASH_REMATCH[3]}" ]] || return 1
  local charge="${BASH_REMATCH[2]}"
  while (( ${#charge} % 4 )); do charge="$charge="; done
  printf '%s' "$charge" | tr '_-' '/+' | openssl base64 -d -A 2>/dev/null | jq -e --arg r "$role" '.role == $r' >/dev/null 2>&1
}

POSTGRES_PASSWORD="${E[POSTGRES_PASSWORD]:-}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  (( BASE_NEUVE )) || echec "une base existe déjà mais .env ne contient plus POSTGRES_PASSWORD : restaurez l'ancien .env"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  info "mot de passe de la base généré"
fi
JWT_SECRET="${E[JWT_SECRET]:-}"
if [[ ${#JWT_SECRET} -lt 32 ]]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  info "secret de signature généré"
fi
ANON_KEY="${E[ANON_KEY]:-}"
SERVICE_ROLE_KEY="${E[SERVICE_ROLE_KEY]:-}"
if ! jeton_valide "$ANON_KEY" "$JWT_SECRET" anon || ! jeton_valide "$SERVICE_ROLE_KEY" "$JWT_SECRET" service_role; then
  ANON_KEY="$(jeton anon "$JWT_SECRET")"
  SERVICE_ROLE_KEY="$(jeton service_role "$JWT_SECRET")"
  info "clés d'API générées"
fi
FAKE_WEBHOOK_SECRET="${E[FAKE_WEBHOOK_SECRET]:-}"
[[ ${#FAKE_WEBHOOK_SECRET} -ge 8 ]] || FAKE_WEBHOOK_SECRET="$(openssl rand -hex 24)"
BETTER_AUTH_SECRET="$(conf BETTER_AUTH_SECRET "${E[BETTER_AUTH_SECRET]:-}")"
[[ ${#BETTER_AUTH_SECRET} -ge 32 ]] || BETTER_AUTH_SECRET="$(openssl rand -hex 32)"

etat_resend() {
  local cle=$1 dom=$2 rep code
  [[ "$dom" == "resend.dev" ]] && { echo inconnu; return; }
  rep=$(curl -sS -m 20 -w $'\n%{http_code}' -H "Authorization: Bearer $cle" https://api.resend.com/domains 2>/dev/null) || { echo inconnu; return; }
  code="${rep##*$'\n'}"
  rep="${rep%$'\n'*}"
  if [[ "$code" == 200 ]]; then
    if jq -e --arg d "$dom" '[.data[]? | select(.name == $d and .status == "verified")] | length > 0' <<<"$rep" >/dev/null 2>&1; then
      echo verifie
    else
      echo non_verifie
    fi
  elif grep -q restricted_api_key <<<"$rep"; then
    echo inconnu
  elif [[ "$code" =~ ^4 ]]; then
    echo cle_invalide
  else
    echo inconnu
  fi
}

port_ouvert() { timeout 8 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null; }

declare -a ETATS=()

NP_PUB="$(val NOTCHPAY_PUBLIC_KEY)"
NP_PRI="$(val NOTCHPAY_PRIVATE_KEY)"
NP_HASH="$(val NOTCHPAY_HASH_KEY)"
NP_PROD="$(booleen "$(val NOTCHPAY_AUTORISER_PRODUCTION false)")"
PAYMENT_PROVIDER="$(conf PAYMENT_PROVIDER)"
NP_COMPLET=0
[[ -n "$NP_PUB" && -n "$NP_PRI" && -n "$NP_HASH" ]] && NP_COMPLET=1
[[ -z "$PAYMENT_PROVIDER" ]] && { (( NP_COMPLET )) && PAYMENT_PROVIDER=notchpay || PAYMENT_PROVIDER=fake; }
PAYMENT_PROVIDER="$(parmi "$PAYMENT_PROVIDER" fake fake notchpay)"
if [[ "$PAYMENT_PROVIDER" == notchpay ]]; then
  if (( ! NP_COMPLET )); then
    alerte "Notch Pay : une des trois clés est vide, paiement simulé à la place"
    PAYMENT_PROVIDER=fake
  elif [[ "$NP_PROD" != true ]] && ! { [[ "$NP_PUB" =~ _test[._] ]] && [[ "$NP_PRI" =~ _test[._] ]] && [[ "$NP_HASH" =~ _test[._] ]]; }; then
    alerte "Notch Pay : clés de production sans NOTCHPAY_AUTORISER_PRODUCTION=true, paiement simulé à la place"
    PAYMENT_PROVIDER=fake
  fi
fi
[[ "$PAYMENT_PROVIDER" == notchpay ]] && ETATS+=("Paiement        Notch Pay$([[ $NP_PROD == true ]] && echo ' (PRODUCTION)' || echo ' (mode test)')") || ETATS+=("Paiement        simulé")

RESEND_API_KEY="$(val RESEND_API_KEY)"
RESEND_FROM_EMAIL="$(val RESEND_FROM_EMAIL)"
[[ -z "$RESEND_FROM_EMAIL" && -n "$RESEND_API_KEY" ]] && RESEND_FROM_EMAIL="noreply@$DOMAINE"
ETAT_RESEND=absent
if [[ -n "$RESEND_API_KEY" ]]; then
  ETAT_RESEND="$(etat_resend "$RESEND_API_KEY" "${RESEND_FROM_EMAIL##*@}")"
  info "Resend : $ETAT_RESEND (${RESEND_FROM_EMAIL##*@})"
fi
MAILER="$(conf MAILER)"
[[ -z "$MAILER" ]] && { [[ -n "$RESEND_API_KEY" ]] && MAILER=resend || MAILER=file; }
MAILER="$(parmi "$MAILER" file file resend)"
if [[ "$MAILER" == resend ]]; then
  if [[ -z "$RESEND_API_KEY" ]]; then
    alerte "Resend : clé vide, les emails de l'application sont écrits sur le disque"
    MAILER=file
  elif [[ "$ETAT_RESEND" == cle_invalide ]]; then
    alerte "Resend : clé refusée par Resend, les emails de l'application sont écrits sur le disque"
    MAILER=file
  elif [[ "$ETAT_RESEND" == non_verifie ]]; then
    alerte "Resend : le domaine ${RESEND_FROM_EMAIL##*@} n'est pas vérifié, les emails de l'application sont écrits sur le disque"
    MAILER=file
  fi
fi

SMTP_HOST="$(val SMTP_HOST smtp.resend.com)"
SMTP_USER="$(val SMTP_USER resend)"
SMTP_PASS="$(val SMTP_PASS)"
[[ -z "$SMTP_PASS" && "$SMTP_HOST" == smtp.resend.com ]] && SMTP_PASS="$RESEND_API_KEY"
SMTP_ADMIN_EMAIL="$(conf SMTP_ADMIN_EMAIL)"
if [[ -z "$SMTP_ADMIN_EMAIL" ]]; then
  [[ -n "$RESEND_FROM_EMAIL" ]] && SMTP_ADMIN_EMAIL="$RESEND_FROM_EMAIL" || SMTP_ADMIN_EMAIL="noreply@$DOMAINE"
fi
SMTP_PORT=""
SMTP_ACTIF=0
if [[ -n "$SMTP_PASS" && -n "$SMTP_HOST" ]]; then
  if [[ "$SMTP_HOST" == smtp.resend.com && ( "$ETAT_RESEND" == non_verifie || "$ETAT_RESEND" == cle_invalide ) ]]; then
    alerte "codes de connexion : Resend n'accepte pas encore l'envoi depuis ${SMTP_ADMIN_EMAIL##*@}"
  else
    for p in $(conf SMTP_PORT "${E[SMTP_PORT]:-465}") 465 587 2587; do
      if port_ouvert "$SMTP_HOST" "$p"; then SMTP_PORT=$p; SMTP_ACTIF=1; break; fi
    done
    (( SMTP_ACTIF )) || alerte "codes de connexion : l'hébergeur bloque les ports SMTP sortants"
  fi
fi
[[ -n "$SMTP_PORT" ]] || SMTP_PORT="$(val SMTP_PORT 465)"
if (( SMTP_ACTIF )); then
  AUTH_CONFIRMATION_AUTOMATIQUE="$(booleen "$(conf AUTH_CONFIRMATION_AUTOMATIQUE false)")"
  ETATS+=("Codes par email actifs (via $SMTP_HOST:$SMTP_PORT)")
else
  SMTP_PASS=""
  AUTH_CONFIRMATION_AUTOMATIQUE=true
  ETATS+=("Codes par email désactivés : les inscriptions sont confirmées automatiquement")
fi
[[ "$MAILER" == resend ]] && ETATS+=("Emails du site  envoyés par Resend depuis $RESEND_FROM_EMAIL") || ETATS+=("Emails du site  écrits sur le disque (aucun envoi)")

GOOGLE_CLIENT_ID="$(val GOOGLE_CLIENT_ID)"
GOOGLE_CLIENT_SECRET="$(val GOOGLE_CLIENT_SECRET)"
AUTH_GOOGLE="$(conf AUTH_GOOGLE)"
[[ -z "$AUTH_GOOGLE" ]] && { [[ -n "$GOOGLE_CLIENT_ID" && -n "$GOOGLE_CLIENT_SECRET" ]] && AUTH_GOOGLE=supabase || AUTH_GOOGLE=desactive; }
AUTH_GOOGLE="$(parmi "$AUTH_GOOGLE" desactive desactive supabase better-auth)"
if [[ "$AUTH_GOOGLE" != desactive && ( -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ) ]]; then
  alerte "Google : identifiant ou secret vide, connexion Google désactivée"
  AUTH_GOOGLE=desactive
fi
GOOGLE_PAR_SUPABASE=false
[[ "$AUTH_GOOGLE" == supabase ]] && GOOGLE_PAR_SUPABASE=true
[[ "$AUTH_GOOGLE" == desactive ]] && ETATS+=("Google          désactivé") || ETATS+=("Google          actif ($AUTH_GOOGLE)")

SIGNED_URL_TTL="$(entier SIGNED_URL_TTL 300)"; (( SIGNED_URL_TTL <= 300 )) || SIGNED_URL_TTL=300
SIGNED_URL_TTL_FREE="$(entier SIGNED_URL_TTL_FREE 3600)"; (( SIGNED_URL_TTL_FREE <= 3600 )) || SIGNED_URL_TTL_FREE=3600

img() { conf "$1" "$2"; }
IMAGE_POSTGRES="$(img IMAGE_POSTGRES public.ecr.aws/supabase/postgres:17.6.1.155)"
IMAGE_GOTRUE="$(img IMAGE_GOTRUE public.ecr.aws/supabase/gotrue:v2.179.0)"
IMAGE_POSTGREST="$(img IMAGE_POSTGREST postgrest/postgrest:v13.0.4)"
IMAGE_STORAGE="$(img IMAGE_STORAGE public.ecr.aws/supabase/storage-api:v1.67.26)"
IMAGE_IMGPROXY="$(img IMAGE_IMGPROXY public.ecr.aws/supabase/imgproxy:v3.8.0)"

declare -a LIGNES=(
  "APP_PUBLIC_URL=https://$SITE_HOTE"
  "SUPABASE_PUBLIC_URL=https://$API_HOTE"
  "SUPABASE_ALIAS_INTERNE=passerelle.interne"
  "AUTH_REDIRECTIONS_AUTORISEES=https://$SITE_HOTE/api/auth/google/retour,https://$SITE_HOTE/api/better-auth/callback/google"
  "APP_PORT=$(entier APP_PORT 3000)"
  "PASSERELLE_PORT=$(entier PASSERELLE_PORT 8000)"
  "POSTGRES_PORT=$(entier POSTGRES_PORT 54322)"
  ""
  "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
  "JWT_SECRET=$JWT_SECRET"
  "ANON_KEY=$ANON_KEY"
  "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  "FAKE_WEBHOOK_SECRET=$FAKE_WEBHOOK_SECRET"
  "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET"
  "JWT_EXPIRY=$(entier JWT_EXPIRY 3600)"
  "REGION=$(val REGION eu-west-1)"
  ""
  "IMAGE_POSTGRES=$IMAGE_POSTGRES"
  "IMAGE_GOTRUE=$IMAGE_GOTRUE"
  "IMAGE_POSTGREST=$IMAGE_POSTGREST"
  "IMAGE_STORAGE=$IMAGE_STORAGE"
  "IMAGE_IMGPROXY=$IMAGE_IMGPROXY"
  "APP_VERSION=local"
  ""
  "SMTP_HOST=$SMTP_HOST"
  "SMTP_PORT=$SMTP_PORT"
  "SMTP_USER=$SMTP_USER"
  "SMTP_PASS=$SMTP_PASS"
  "SMTP_ADMIN_EMAIL=$SMTP_ADMIN_EMAIL"
  "MAILER=$MAILER"
  "RESEND_API_KEY=$RESEND_API_KEY"
  "RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL"
  "AUTH_CONFIRMATION_AUTOMATIQUE=$AUTH_CONFIRMATION_AUTOMATIQUE"
  ""
  "PAYMENT_PROVIDER=$PAYMENT_PROVIDER"
  "NOTCHPAY_PUBLIC_KEY=$NP_PUB"
  "NOTCHPAY_PRIVATE_KEY=$NP_PRI"
  "NOTCHPAY_HASH_KEY=$NP_HASH"
  "NOTCHPAY_AUTORISER_PRODUCTION=$NP_PROD"
  ""
  "AUTH_GOOGLE=$AUTH_GOOGLE"
  "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
  "GOOGLE_PAR_SUPABASE=$GOOGLE_PAR_SUPABASE"
  ""
  "NEXT_PUBLIC_DESIGN_VERSION=$(parmi "$(val NEXT_PUBLIC_DESIGN_VERSION v3)" v3 v1 v2 v3)"
  "SIGNED_URL_TTL=$SIGNED_URL_TTL"
  "SIGNED_URL_TTL_FREE=$SIGNED_URL_TTL_FREE"
  "EXCERPT_PAGES_DEFAULT=$(entier EXCERPT_PAGES_DEFAULT 3)"
  "ANON_PAGE_RATE_LIMIT=$(entier ANON_PAGE_RATE_LIMIT 60)"
  "PAYMENT_GRACE_PERIOD_DAYS=$(entier PAYMENT_GRACE_PERIOD_DAYS 7)"
  "INVOICE_RETENTION_YEARS=$(entier INVOICE_RETENTION_YEARS 10)"
  "LOG_LEVEL=$(parmi "$(val LOG_LEVEL info)" info debug info warn error)"
)

TMP_ENV="$(mktemp "$APP/.env.XXXXXX")"
for ligne in "${LIGNES[@]}"; do
  if [[ -z "$ligne" ]]; then echo; continue; fi
  cle="${ligne%%=*}"
  valeur="${ligne#*=}"
  if [[ "$valeur" == *"'"* ]]; then
    rm -f "$TMP_ENV"
    echec "$cle contient une apostrophe, que docker compose ne sait pas lire"
  fi
  if [[ "$valeur" =~ ^[A-Za-z0-9._:/@,+=%-]*$ ]]; then
    printf '%s=%s\n' "$cle" "$valeur"
  else
    printf "%s='%s'\n" "$cle" "$valeur"
  fi
done > "$TMP_ENV"
[[ -f "$APP/.env" ]] && cp -p "$APP/.env" "$APP/.env.precedent"
mv "$TMP_ENV" "$APP/.env"
chown "$UTILISATEUR": "$APP/.env"
chmod 600 "$APP/.env"
[[ -f "$APP/.env.precedent" ]] && chmod 600 "$APP/.env.precedent"
info ".env écrit ($(grep -c '^[A-Z_]*=' "$APP/.env") variables)"

https_vps() {
etape "Nginx et vérification du nom de domaine"
WEBROOT=/var/www/certbot
mkdir -p "$WEBROOT/.well-known/acme-challenge"
SITE=/etc/nginx/sites-available/editionmapoukam
IPV6=""
[[ -f /proc/net/if_inet6 ]] && IPV6="    listen [::]:80;"

ecrire_http() {
  cat > "$SITE" <<EOF
server {
    listen 80;
$IPV6
    server_name $DOMAINE $WWW $API;
    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
    }
    location / {
        return 503;
    }
}
EOF
}

if [[ ! -f "/etc/letsencrypt/live/$DOMAINE/fullchain.pem" ]]; then
  ecrire_http
fi
ln -sf "$SITE" /etc/nginx/sites-enabled/editionmapoukam
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>&1 | tail -n 2
systemctl enable nginx >/dev/null 2>&1
systemctl reload nginx 2>/dev/null || systemctl restart nginx

IP_PUBLIQUE="$(curl -4 -fsS -m 10 https://api.ipify.org 2>/dev/null || curl -4 -fsS -m 10 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
info "adresse IP de ce serveur : $IP_PUBLIQUE"

TEMOIN="mapoukam-$(openssl rand -hex 12)"
printf '%s' "$TEMOIN" > "$WEBROOT/.well-known/acme-challenge/$TEMOIN"
joignable() { [[ "$(curl -s -m 10 "http://$1/.well-known/acme-challenge/$TEMOIN" 2>/dev/null)" == "$TEMOIN" ]]; }

limite=$(( $(date +%s) + ATTENTE_DNS_MINUTES * 60 ))
premier=1
until joignable "$DOMAINE" && joignable "$API"; do
  if (( $(date +%s) >= limite )); then
    rm -f "$WEBROOT/.well-known/acme-challenge/$TEMOIN"
    echec "$DOMAINE et $API doivent pointer vers $IP_PUBLIQUE (enregistrements DNS de type A). Corrigez la zone DNS puis relancez"
  fi
  if (( premier )); then
    alerte "le domaine n'atteint pas encore ce serveur. Chez le registrar, créez :"
    alerte "  $DOMAINE      A  $IP_PUBLIQUE"
    alerte "  $WWW  A  $IP_PUBLIQUE"
    alerte "  $API  A  $IP_PUBLIQUE"
    alerte "le script vérifie toutes les 30 s pendant $ATTENTE_DNS_MINUTES minutes"
    premier=0
  fi
  sleep 30
done
info "$DOMAINE et $API atteignent ce serveur"
AVEC_WWW=0
if joignable "$WWW"; then
  AVEC_WWW=1
  info "$WWW atteint ce serveur"
else
  alerte "$WWW n'atteint pas ce serveur : il est laissé de côté"
fi
rm -f "$WEBROOT/.well-known/acme-challenge/$TEMOIN"

etape "Certificat HTTPS"
NOMS=(-d "$DOMAINE" -d "$API")
(( AVEC_WWW )) && NOMS+=(-d "$WWW")
if [[ -n "$EMAIL_CERTIFICAT" ]]; then CONTACT=(--email "$EMAIL_CERTIFICAT" --no-eff-email); else CONTACT=(--register-unsafely-without-email); fi
reessayer 2 certbot certonly --webroot -w "$WEBROOT" --cert-name "$DOMAINE" "${NOMS[@]}" \
  --non-interactive --agree-tos "${CONTACT[@]}" --keep-until-expiring --expand \
  --deploy-hook "systemctl reload nginx" \
  || echec "Let's Encrypt a refusé le certificat (voir le journal ci-dessus)"
CERT="/etc/letsencrypt/live/$DOMAINE"
NOMS_CERT="$(openssl x509 -in "$CERT/fullchain.pem" -noout -text)"
if (( AVEC_WWW )) && [[ "$NOMS_CERT" != *"DNS:$WWW"* ]]; then
  AVEC_WWW=0
fi
info "certificat : $(openssl x509 -in "$CERT/fullchain.pem" -noout -enddate | cut -d= -f2)"

NOMS_80="$DOMAINE $API"
(( AVEC_WWW )) && NOMS_80="$NOMS_80 $WWW"
IPV6_443=""
[[ -f /proc/net/if_inet6 ]] && IPV6_443="    listen [::]:443 ssl http2;"
TLS="    ssl_certificate $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;"
ENTETES="        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;"

{
  cat <<EOF
server {
    listen 80;
$IPV6
    server_name $NOMS_80;
    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
$IPV6_443
    server_name $DOMAINE;
$TLS
    client_max_body_size 100m;
    location / {
        proxy_pass http://127.0.0.1:$(entier APP_PORT 3000);
$ENTETES
    }
}

server {
    listen 443 ssl http2;
$IPV6_443
    server_name $API;
$TLS
    client_max_body_size 200m;
    location / {
        proxy_pass http://127.0.0.1:$(entier PASSERELLE_PORT 8000);
$ENTETES
    }
}
EOF
  if (( AVEC_WWW )); then
    cat <<EOF

server {
    listen 443 ssl http2;
$IPV6_443
    server_name $WWW;
$TLS
    return 301 https://$DOMAINE\$request_uri;
}
EOF
  fi
} > "$SITE"
nginx -t 2>&1 | tail -n 2
systemctl reload nginx
info "HTTPS en place"
}

nginx_codespace() {
  etape "Nginx devant le site (port $PORT_SITE_CS)"
  SITE=/etc/nginx/sites-available/editionmapoukam
  cat > "$SITE" <<EOF
server {
    listen $PORT_SITE_CS;
    server_name _;
    client_max_body_size 100m;
    location / {
        proxy_pass http://127.0.0.1:$(entier APP_PORT 3000);
        proxy_http_version 1.1;
        proxy_set_header Host $SITE_HOTE;
        proxy_set_header X-Forwarded-Host $SITE_HOTE;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
EOF
  ln -sf "$SITE" /etc/nginx/sites-enabled/editionmapoukam
  rm -f /etc/nginx/sites-enabled/default
  nginx -t 2>&1 | tail -n 2
  if [[ -s /run/nginx.pid ]] && kill -0 "$(cat /run/nginx.pid)" 2>/dev/null; then
    nginx -s reload
  else
    nginx
  fi
  info "Nginx écoute sur le port $PORT_SITE_CS"
}

if (( CODESPACE )); then
  nginx_codespace
else
  https_vps
fi

etape "Images Docker"
cd "$APP"
dc() { docker compose --project-directory "$APP" -f "$APP/docker-compose.yml" --env-file "$APP/.env" "$@"; }

tirer() {
  local cible=$1 src
  shift
  docker image inspect "$cible" >/dev/null 2>&1 && { info "présente : $cible"; return 0; }
  for src in "$cible" "$@"; do
    if reessayer 3 docker pull -q "$src" >/dev/null; then
      [[ "$src" == "$cible" ]] || docker tag "$src" "$cible"
      info "téléchargée : $cible"
      return 0
    fi
  done
  return 1
}
miroir() {
  case "$1" in
    public.ecr.aws/supabase/*) echo "supabase/${1#public.ecr.aws/supabase/}" ;;
    supabase/*) echo "public.ecr.aws/supabase/${1#supabase/}" ;;
    postgrest/postgrest:*) echo "public.ecr.aws/supabase/postgrest:${1##*:}" ;;
    darthsim/imgproxy:*) echo "public.ecr.aws/supabase/imgproxy:${1##*:}" ;;
    *) echo "public.ecr.aws/docker/library/$1" ;;
  esac
}
for image in "$IMAGE_POSTGRES" "$IMAGE_GOTRUE" "$IMAGE_POSTGREST" "$IMAGE_STORAGE" "$IMAGE_IMGPROXY"; do
  tirer "$image" "$(miroir "$image")" || echec "impossible de télécharger $image"
done
tirer nginx:1.27-alpine public.ecr.aws/nginx/nginx:1.27-alpine || echec "impossible de télécharger nginx:1.27-alpine"
tirer node:22-bookworm-slim public.ecr.aws/docker/library/node:22-bookworm-slim || echec "impossible de télécharger node:22-bookworm-slim"
tirer docker/dockerfile:1.7 || alerte "docker/dockerfile:1.7 injoignable : la compilation tentera sans"

etape "Base de données"
for port in "$(entier APP_PORT 3000)" "$(entier PASSERELLE_PORT 8000)" "$(entier POSTGRES_PORT 54322)"; do
  if [[ -n "$(ss -ltnH "( sport = :$port )")" && -z "$(dc ps -q 2>/dev/null)" ]]; then
    echec "le port $port est déjà occupé par un autre programme : $(ss -ltnpH "( sport = :$port )" | head -1)"
  fi
done

attendre_sante() {
  local service=$1 secondes=$2 id etat fin
  fin=$(( $(date +%s) + secondes ))
  while :; do
    id="$(dc ps -q "$service" 2>/dev/null || true)"
    etat="$( [[ -n "$id" ]] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo absent)"
    [[ "$etat" == healthy || "$etat" == running ]] && return 0
    (( $(date +%s) < fin )) || return 1
    sleep 5
  done
}
compter_roles() {
  dc exec -T db psql -U postgres -tAc "select count(*) from pg_roles where rolname in ('anon','authenticated','authenticator','service_role','supabase_auth_admin','supabase_storage_admin')" 2>/dev/null | tr -d '[:space:]'
}

essai=1
while :; do
  dc up -d db
  info "initialisation (jusqu'à 7 minutes la première fois)"
  if ! attendre_sante db 420; then
    dc logs --tail 40 db || true
    echec "la base ne devient pas disponible"
  fi
  roles="$(compter_roles || true)"
  [[ "$roles" == 6 ]] && break
  if (( BASE_NEUVE && essai == 1 )); then
    alerte "base initialisée de travers ($roles rôle(s) sur 6) : elle est recréée"
    dc down -v
    essai=2
    continue
  fi
  dc logs --tail 40 db || true
  echec "la base ne contient pas les rôles attendus ($roles sur 6)"
done
info "base prête, rôles en place"

etape "Compilation du site (5 à 15 minutes la première fois)"
reessayer 2 dc build app || echec "la compilation du site a échoué (voir le journal ci-dessus)"

etape "Démarrage de tous les services et migrations"
if ! dc up -d --remove-orphans; then
  dc logs --tail 60 migrations || true
  echec "le démarrage a échoué"
fi
code_migrations="$(docker inspect -f '{{.State.ExitCode}}' "$(dc ps -aq migrations)" 2>/dev/null || echo ?)"
[[ "$code_migrations" == 0 ]] || { dc logs --tail 60 migrations || true; echec "les migrations ont échoué"; }
info "$(dc logs --no-log-prefix migrations 2>/dev/null | grep -E 'Migrations appliquées' | tail -1)"

if (( CODESPACE )); then
  etape "Ports publics du codespace"
  if command -v gh >/dev/null 2>&1 \
     && reessayer 6 gh codespace ports visibility "$PORT_SITE_CS:public" "$PORT_API_CS:public" -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    info "ports $PORT_SITE_CS et $PORT_API_CS rendus publics"
  else
    alerte "rendez les ports $PORT_SITE_CS et $PORT_API_CS publics à la main : onglet PORTS, clic droit, Port Visibility, Public"
  fi
fi

etape "Vérification du site"
APP_URL_LOCALE="http://127.0.0.1:$(entier APP_PORT 3000)/fr"
fin=$(( $(date +%s) + 240 ))
until [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$APP_URL_LOCALE" 2>/dev/null)" == 200 ]]; do
  if (( $(date +%s) >= fin )); then
    dc ps || true
    dc logs --tail 60 app || true
    echec "le site ne répond pas sur $APP_URL_LOCALE"
  fi
  sleep 5
done
JOURNAL_APP="$(dc logs app 2>/dev/null || true)"
if [[ "$JOURNAL_APP" == *"Environnement invalide"* ]]; then
  dc logs --tail 40 app || true
  echec "le site refuse une variable d'environnement (voir ci-dessus)"
fi
PAGE="$(curl -s -m 20 "$APP_URL_LOCALE" || true)"
[[ "$PAGE" == *Mapoukam* ]] || { dc logs --tail 60 app || true; echec "le site répond, mais pas avec la page attendue"; }
info "le site répond en local"

for service in auth rest storage passerelle app; do
  id="$(dc ps -q "$service")"
  [[ -n "$id" ]] || echec "le service $service n'est pas démarré"
  if [[ "$(docker inspect -f '{{.RestartCount}}' "$id")" -gt 3 ]]; then
    dc logs --tail 40 "$service" || true
    echec "le service $service redémarre en boucle"
  fi
done

CONSEIL=""
(( CODESPACE )) && CONSEIL=" (les ports $PORT_SITE_CS et $PORT_API_CS sont-ils publics dans l'onglet PORTS ?)"
code_api=""
fin=$(( $(date +%s) + 120 ))
until [[ "$code_api" == 200 ]]; do
  code_api="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://$API_HOTE/auth/v1/health" || true)"
  [[ "$code_api" == 200 ]] && break
  if (( $(date +%s) >= fin )); then
    dc logs --tail 40 auth || true
    echec "https://$API_HOTE/auth/v1/health répond $code_api au lieu de 200$CONSEIL"
  fi
  sleep 5
done
code_site="$(curl -s -o /dev/null -w '%{http_code}' -m 30 "https://$SITE_HOTE/fr" || true)"
[[ "$code_site" == 200 ]] || echec "https://$SITE_HOTE/fr répond $code_site au lieu de 200$CONSEIL"
info "https://$SITE_HOTE répond"
info "https://$API_HOTE répond"

ADMIN_EMAIL="$(conf ADMIN_EMAIL "admin@$DOMAINE")"
ADMIN_AFFICHE=""
if [[ -n "$ADMIN_EMAIL" ]]; then
  etape "Compte administrateur"
  FICHIER_ADMIN=/root/mapoukam-admin.txt
  ADMIN_MDP="$(conf ADMIN_MOT_DE_PASSE)"
  if [[ -z "$ADMIN_MDP" && -f "$FICHIER_ADMIN" ]] && grep -q "^$ADMIN_EMAIL " "$FICHIER_ADMIN"; then
    ADMIN_MDP="$(grep "^$ADMIN_EMAIL " "$FICHIER_ADMIN" | tail -1 | cut -d' ' -f2-)"
  fi
  [[ -n "$ADMIN_MDP" ]] || ADMIN_MDP="Adm-$(openssl rand -hex 8)-7"
  if (( ${#ADMIN_MDP} < 10 )); then
    alerte "ADMIN_MOT_DE_PASSE fait moins de 10 caractères : compte non créé"
  elif dc exec -T app node scripts/creer-admin-prod.mjs "$ADMIN_EMAIL" "$ADMIN_MDP" >/dev/null 2>&1; then
    printf '%s %s\n' "$ADMIN_EMAIL" "$ADMIN_MDP" > "$FICHIER_ADMIN"
    chmod 600 "$FICHIER_ADMIN"
    ADMIN_AFFICHE="$ADMIN_EMAIL / $ADMIN_MDP"
    info "compte prêt (identifiants gardés dans $FICHIER_ADMIN)"
  else
    alerte "le compte administrateur n'a pas pu être créé : relancez le script pour réessayer"
  fi
fi

etape "Installation terminée"
printf '\n    \033[1mOuvrez : https://%s\033[0m\n\n' "$SITE_HOTE"
for e in "${ETATS[@]}"; do info "$e"; done
[[ -n "$ADMIN_AFFICHE" ]] && { echo; info "Administration   https://$SITE_HOTE/fr/admin"; info "Identifiants     $ADMIN_AFFICHE"; }
echo
[[ "$AUTH_GOOGLE" == supabase ]] && info "Chez Google, URI de redirection autorisée : https://$API_HOTE/auth/v1/callback"
[[ "$AUTH_GOOGLE" == better-auth ]] && info "Chez Google, URI de redirection autorisée : https://$SITE_HOTE/api/better-auth/callback/google"
[[ "$PAYMENT_PROVIDER" == notchpay ]] && info "Chez Notch Pay, URL du webhook : https://$SITE_HOTE/api/webhooks/payments"
echo
info "Journal : $JOURNAL"
info "Code et configuration : $APP (fichier .env)"
