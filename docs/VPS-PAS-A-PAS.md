# Installer Édition Mapoukam sur un VPS — pas à pas

> Document **autonome** : tout ce qui est nécessaire est ici. Aucun autre
> fichier n'est à consulter pour dérouler cette procédure.
>
> Le domaine est déjà inscrit partout : **`editionsmapoukam.com`**. Il n'y a
> rien à remplacer.
>
> À chaque étape, la ligne **« Où vous êtes »** dit dans quel dossier lancer la
> commande, et le **✅** dit ce que vous devez voir avant de continuer. Si un ✅
> ne se vérifie pas, **arrêtez-vous** : les étapes suivantes échoueront de
> façon plus difficile à comprendre.

---

## Ce que ce serveur va faire tourner

Un site de contes illustrés en Next.js, et **sa base de données complète** :
PostgreSQL, l'authentification, l'API et le stockage des fichiers (la pile
Supabase), le tout en conteneurs Docker, avec Nginx devant pour le HTTPS.

```
Internet ──► Nginx (443)
              ├─ editionsmapoukam.com      ──► l'application      127.0.0.1:3000
              └─ api.editionsmapoukam.com  ──► la passerelle      127.0.0.1:8000
                                                ├─ /auth/v1      l'authentification
                                                ├─ /rest/v1      l'API de données
                                                └─ /storage/v1   les fichiers
```

## Ce qu'il faut avant de commencer

| | Valeur |
| --- | --- |
| Serveur | **8 Go de RAM**, 4 cœurs, 80 Go SSD, **Ubuntu 24.04** |
| Accès | SSH, avec un compte capable de `sudo` |
| Domaine | `editionsmapoukam.com`, avec accès à sa zone DNS |

> ⚠️ **8 Go, pas 4.** Le dépôt d'un conte illustré occupe environ 3 Go de
> mémoire le temps de sa conversion. Avec 4 Go, c'est PostgreSQL que le
> système arrête pour faire de la place — et la panne ne ressemble pas du tout
> à un manque de mémoire.

---

## Étape 0 · Les trois enregistrements DNS

**Où vous êtes :** chez le registrar du domaine, pas encore sur le serveur.

Créer trois enregistrements de type **A**, pointant tous vers l'adresse IP du
VPS :

```
editionsmapoukam.com          A    <IP du VPS>
www.editionsmapoukam.com      A    <IP du VPS>
api.editionsmapoukam.com      A    <IP du VPS>
```

Le troisième est celui qu'on oublie : c'est lui qui sert les couvertures des
livres et les téléchargements, appelés **directement par le navigateur** du
visiteur.

✅ Après quelques minutes, `ping api.editionsmapoukam.com` depuis n'importe
quelle machine doit répondre l'IP du VPS. La propagation peut prendre jusqu'à
une heure ; les certificats de l'étape 11 en dépendent.

---

## Étape 1 · Sécuriser le serveur

**Où vous êtes :** connecté en SSH sur le VPS. Le dossier n'a pas d'importance.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y fail2ban unattended-upgrades

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Ajouter 4 Go de mémoire d'échange, filet de sécurité pendant les dépôts de
contes :

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

✅ `sudo ufw status` affiche **trois règles** (22, 80, 443) et rien d'autre.
✅ `free -h` affiche 4 Go de `Swap`.

---

## Étape 2 · Installer les quatre logiciels nécessaires

**Où vous êtes :** même endroit.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo apt install -y git nginx certbot python3-certbot-nginx
```

✅ `docker compose version` répond **2.24.4 ou plus**.
✅ `nginx -v` répond une version.

**Il n'y a rien d'autre à installer.** Node.js, PostgreSQL et les outils de
traitement des PDF vivent **à l'intérieur** des conteneurs. Les installer sur
le serveur ne servirait à rien.

---

## Étape 3 · Créer l'utilisateur et le dossier du site

**Où vous êtes :** même endroit.

```bash
sudo adduser --disabled-password --gecos "" mapoukam
sudo usermod -aG docker mapoukam
sudo mkdir -p /srv/editionmapoukam
sudo chown mapoukam: /srv/editionmapoukam
```

L'application ne tournera jamais en `root` : c'est l'utilisateur `mapoukam`
qui la porte.

---

## Étape 4 · Récupérer le code

**Où vous êtes :** on devient l'utilisateur `mapoukam`.

```bash
sudo -iu mapoukam
cd /srv/editionmapoukam
git clone https://github.com/brayanroys8888888/EditionMapoukam.git app
cd /srv/editionmapoukam/app
```

> ⚠️ **À partir d'ici et jusqu'à l'étape 11, TOUTES les commandes se lancent
> depuis `/srv/editionmapoukam/app`.**
> En cas de doute : `pwd` doit répondre exactement `/srv/editionmapoukam/app`.
> C'est le dossier qui contient `docker-compose.yml`.

✅ `ls docker-compose.yml Dockerfile docker/` trouve les trois.

---

## Étape 5 · Créer le fichier de configuration

**Où vous êtes :** `/srv/editionmapoukam/app`

```bash
cp docker/env.exemple .env
```

Puis générer les six secrets de la pile — mot de passe de la base, clé de
signature, clés d'API :

```bash
docker run --rm -v "$PWD:/app" -w /app node:22-bookworm-slim \
  node docker/generer-cles.mjs >> .env

chmod 600 .env
```

Cette commande passe par un conteneur parce que Node.js n'est pas installé sur
le serveur — et n'a pas à l'être.

> ⚠️ **Ne jamais recopier un `.env` venu d'ailleurs.** Les valeurs d'exemple
> qui circulent dans les tutoriels sont **publiques** : leur clé de service
> ouvre la base entière. Chaque serveur génère les siennes.

✅ `grep -c '^[A-Z_]*=' .env` répond **49**.
✅ `tail -6 .env` montre six lignes nouvelles, dont `POSTGRES_PASSWORD` et
`JWT_SECRET`, avec de longues valeurs aléatoires.

---

## Étape 6 · Renseigner les cinq valeurs du domaine

**Où vous êtes :** `/srv/editionmapoukam/app`

```bash
nano .env
```

Chercher ces cinq lignes (elles pointent sur `localhost` par défaut) et les
remplacer par **exactement** ceci :

```
APP_PUBLIC_URL=https://editionsmapoukam.com
SUPABASE_PUBLIC_URL=https://api.editionsmapoukam.com
SUPABASE_ALIAS_INTERNE=api.editionsmapoukam.com
SMTP_ADMIN_EMAIL=noreply@editionsmapoukam.com
AUTH_REDIRECTIONS_AUTORISEES=https://editionsmapoukam.com/api/auth/google/retour,https://editionsmapoukam.com/api/better-auth/callback/google
```

Enregistrer avec `Ctrl+O`, `Entrée`, puis `Ctrl+X`.

> ⚠️ **Aucune barre oblique à la fin des adresses.** `https://editionsmapoukam.com/`
> produirait des liens à double barre dans les emails.
>
> ⚠️ **Les trois premières sont gravées dans l'application à l'étape 10.** Les
> corriger après coup oblige à refaire cette étape-là. C'est pour cela qu'on
> les renseigne maintenant.

✅ `grep -c 'editionsmapoukam.com' .env` répond **au moins 5**.
✅ `grep -c 'localhost' .env` répond **0**.

---

## Étape 7 · Démarrer la base de données, seule

**Où vous êtes :** `/srv/editionmapoukam/app`

```bash
docker compose up -d db
```

Puis **attendre deux minutes et demie sans rien faire** : la toute première
initialisation joue une centaine de scripts internes.

```bash
sleep 150
docker compose logs db | grep -i fatal
```

✅ La commande `grep` n'affiche **rien**.

Puis le contrôle décisif de toute la procédure :

```bash
docker compose exec -T db psql -U postgres -tAc \
  "select rolname from pg_roles where rolname like 'supabase%' or rolname='authenticator';"
```

✅ **Sept noms** s'affichent : `anon`, `authenticated`, `authenticator`,
`service_role`, `supabase_admin`, `supabase_auth_admin`,
`supabase_storage_admin`.

> ⚠️ **Si cette liste est vide, ne continuez pas.** Tout le reste échouera, et
> les messages d'erreur ne parleront jamais de la base. Recommencez avec une
> base neuve :
> ```bash
> docker compose down -v
> ```
> puis reprenez au début de cette étape 7.

---

## Étape 8 · Démarrer le reste de l'infrastructure

**Où vous êtes :** `/srv/editionmapoukam/app`

```bash
docker compose up -d auth rest storage imgproxy passerelle
sleep 45
docker compose ps
```

✅ **Six conteneurs**, tous en `Up`. **Aucun ne doit afficher `Restarting`.**

Si l'un redémarre en boucle, lire sa raison avant d'aller plus loin — par
exemple pour l'authentification :

```bash
docker compose logs auth | tail -20
```

---

## Étape 9 · Créer les tables du site

**Où vous êtes :** `/srv/editionmapoukam/app`

```bash
docker compose --profile migrations run --rm migrations
```

✅ La sortie se termine par **`Migrations appliquées : 87`**.

Vérifier que les quatre espaces de stockage existent :

```bash
docker compose exec -T db psql -U postgres -tAc \
  "select string_agg(id,' ' order by id) from storage.buckets;"
```

✅ `book-downloads book-pages book-sources covers`

> ⚠️ **Ne jamais lancer de commande contenant `seed`.** Elle remplirait le
> catalogue de dix contes fictifs et de comptes d'essai. C'est un outil de
> développement.

---

## Étape 10 · Construire et lancer le site

**Où vous êtes :** `/srv/editionmapoukam/app`

```bash
docker compose up -d --build app
```

**Cinq à dix minutes** la première fois : l'application est compilée sur place.

```bash
docker compose ps
curl -I http://localhost:3000/fr
```

✅ **Sept conteneurs** en `Up`, aucun en `Restarting`.
✅ `curl` répond **HTTP/1.1 200 OK**.

---

## Étape 11 · Nginx et le certificat HTTPS

**Où vous êtes :** on redevient administrateur.

```bash
exit
sudo nano /etc/nginx/sites-available/editionmapoukam
```

Coller **tel quel** — il n'y a rien à remplacer :

```nginx
# Le site.
server {
    listen 80;
    server_name editionsmapoukam.com;

    # Le dépôt d'un conte envoie jusqu'à 100 Mo. Sans cette ligne, Nginx
    # refuse au-delà de 1 Mo et chaque dépôt échoue.
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Un dépôt de conte prend plusieurs dizaines de secondes.
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}

# www redirige vers l'adresse courte, pour ne pas servir le site en double.
server {
    listen 80;
    server_name www.editionsmapoukam.com;
    return 301 https://editionsmapoukam.com$request_uri;
}

# La base, l'authentification et les fichiers.
server {
    listen 80;
    server_name api.editionsmapoukam.com;
    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

Enregistrer (`Ctrl+O`, `Entrée`, `Ctrl+X`), puis :

```bash
sudo ln -s /etc/nginx/sites-available/editionmapoukam /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

✅ `nginx -t` répond « syntax is ok » et « test is successful ».

Puis les certificats :

```bash
sudo certbot --nginx -d editionsmapoukam.com -d www.editionsmapoukam.com -d api.editionsmapoukam.com
```

Certbot pose le HTTPS, la redirection automatique et le renouvellement.

✅ `sudo certbot certificates` liste les trois noms.

---

## Étape 12 · Vérifier

**Où vous êtes :** sur **votre propre machine**, pas sur le VPS.

```bash
curl -I https://editionsmapoukam.com/fr        # 200
curl -I https://editionsmapoukam.com/dev       # 404 — la console de test est fermée
curl -I https://api.editionsmapoukam.com/      # 404 — rien d'autre n'est publié
```

Les deux `404` ne sont pas des erreurs : ce sont deux portes qui doivent être
fermées. La première est la console de simulation, la seconde l'accès direct à
la base.

Vérifier enfin que rien d'autre n'est ouvert sur Internet :

```bash
nmap -Pn -p 22,80,443,3000,5432,8000,54322 <IP du VPS>
```

✅ Seuls **22, 80 et 443** sont ouverts. Tous les autres doivent être
`closed` ou `filtered`.

Puis ouvrir **https://editionsmapoukam.com/fr** dans un navigateur.

---

## Le site tourne. Ce qu'il ne fait pas encore

À ce stade, tout fonctionne **sauf ce qui dépend d'un service extérieur**. Ces
services sont éteints par défaut, et le site tourne sans eux.

| Éteint | Conséquence |
| --- | --- |
| Envoi d'emails | **Personne ne peut créer de compte** : le code de confirmation à six chiffres n'est envoyé à personne |
| Paiement réel | Aucun encaissement ; le parcours d'achat reste simulable |
| Connexion Google | Le bouton n'apparaît pas ; la connexion par mot de passe fonctionne |

Ces valeurs se trouvent dans le même fichier `.env`, et **appartiennent au
propriétaire du site** — l'administrateur du serveur n'a pas à les connaître.

| Variable | Où la prendre |
| --- | --- |
| `RESEND_API_KEY` | resend.com → API Keys |
| `SMTP_PASS` | la même clé Resend |
| `RESEND_FROM_EMAIL` | `noreply@editionsmapoukam.com`, après vérification du domaine chez Resend |
| `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_HASH_KEY` | business.notchpay.co → Settings → API Keys |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → Identifiants |

Après chaque modification du `.env`, depuis `/srv/editionmapoukam/app` :

```bash
docker compose up -d --build app
```

Il faut **reconstruire**, et pas seulement redémarrer : certaines valeurs sont
inscrites dans le site au moment de la compilation.

Trois adresses à déclarer chez ces services :

- Google, URI de redirection : `https://editionsmapoukam.com/api/better-auth/callback/google`
- Notch Pay, webhook : `https://editionsmapoukam.com/api/webhooks/payments`
- Resend, domaine à vérifier : `editionsmapoukam.com`

---

## Exploitation courante

**Où vous êtes :** `/srv/editionmapoukam/app`, en utilisateur `mapoukam`.

```bash
# Voir l'état
docker compose ps

# Lire les journaux
docker compose logs -f app
docker compose logs -f auth

# Mettre à jour le site après une évolution du code
git pull
docker compose --profile migrations run --rm migrations   # AVANT de reconstruire
docker compose up -d --build app

# Tout arrêter, tout redémarrer
docker compose down
docker compose up -d
```

### Sauvegardes

Deux choses à sauver, et une copie de la base ne contient **que la première** :

```bash
# La base
docker compose exec -T db pg_dump --format=custom -U postgres postgres \
  > /srv/editionmapoukam/base-$(date +%F).dump

# Les fichiers (couvertures, pages, exemplaires)
docker run --rm -v editionmapoukam_fichiers-storage:/src -v /srv/editionmapoukam:/dest \
  alpine tar -czf /dest/fichiers-$(date +%F).tar.gz -C /src .
```

> Une sauvegarde qui reste sur le serveur ne protège pas **du** serveur. La
> copier ailleurs chaque nuit, et **essayer une restauration au moins une
> fois** : une sauvegarde jamais restaurée n'est pas une sauvegarde, c'est une
> intention.

---

## En cas de blocage

| Symptôme | Cause la plus fréquente |
| --- | --- |
| Les sept rôles de l'étape 7 n'apparaissent pas | la base a été initialisée de travers ; `docker compose down -v` puis reprendre à l'étape 7 |
| Un conteneur en `Restarting` | `docker compose logs <nom>` en donne toujours la raison |
| Le site répond 200 mais affiche une erreur | une valeur manque dans `.env` ; `docker compose logs app` la nomme |
| Le dépôt d'un conte échoue sans message clair | `client_max_body_size` absent du bloc Nginx de l'étape 11 |
| « port is already allocated » | un autre service occupe 3000, 8000 ou 54322 |
| Le site est lent puis s'arrête | mémoire insuffisante : vérifier les 8 Go et les 4 Go d'échange |
