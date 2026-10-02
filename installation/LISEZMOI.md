# Installer Édition Mapoukam sur un VPS en une commande

`installer.sh` monte tout le site sur un serveur neuf : logiciels, pare-feu,
code, `.env`, base de données, migrations, compilation, Nginx, certificat
HTTPS et compte administrateur. À la fin, il suffit d'ouvrir
**https://editionsmapoukam.com**.

---

## Ce qu'il faut avant

1. **Un VPS Ubuntu 24.04** (ou 22.04, ou Debian 12). 4 Go de mémoire
   recommandés (2 Go possibles, construction plus lente), 20 Go de disque libre (le script refuse en dessous de 10). Un accès SSH en `root` ou
   avec `sudo`.
2. **Trois enregistrements DNS de type A**, chez le registrar du domaine, qui
   pointent tous vers l'adresse IP du VPS :

   ```
   editionsmapoukam.com        A   <IP du VPS>
   www.editionsmapoukam.com    A   <IP du VPS>
   api.editionsmapoukam.com    A   <IP du VPS>
   ```

   Si le DNS n'est pas encore propagé au lancement, le script attend
   30 minutes en vérifiant toutes les 30 secondes, et affiche l'adresse IP à
   renseigner.

---

## Où et comment le lancer

### Étape 1 (facultative) : envoyer la configuration sur le serveur (depuis votre PC)

Le fichier `installation/mapoukam.conf` est **déjà rempli** avec les clés
Notch Pay, Resend et Google. Il n'est pas dans git, car il contient des
secrets : il faut donc l'envoyer vous-même.

**Sans ce fichier, l'installation réussit quand même** : le site et le
back-office fonctionnent, et le compte `admin@editionsmapoukam.com` est créé.
Seules les fonctions qui dépendent d'un service extérieur sont éteintes :
paiement simulé, pas d'emails, pas de connexion Google. Vous pourrez déposer
le fichier plus tard, puis relancer le script.

Depuis le dossier du projet, sur votre PC :

```bash
scp installation/mapoukam.conf root@<IP du VPS>:/root/mapoukam.conf
```

### Étape 2 : lancer l'installation (sur le serveur)

```bash
ssh root@<IP du VPS>
cd /root
curl -fsSL https://raw.githubusercontent.com/brayanroys8888888/EditionMapoukam/main/installation/installer.sh -o installer.sh
bash installer.sh
```

Le script lit `mapoukam.conf` **dans le même dossier que lui**, donc
`/root/mapoukam.conf`. Pour lui donner un autre fichier :
`bash installer.sh /chemin/vers/ma.conf`.

Comptez **15 à 25 minutes** la première fois, surtout pour la compilation du
site. À la fin, le script affiche :

```
==> Installation terminée

    Ouvrez : https://editionsmapoukam.com

    Paiement        Notch Pay (mode test)
    Codes par email actifs (via smtp.resend.com:465)
    Emails du site  envoyés par Resend depuis noreply@editionsmapoukam.com
    Google          actif (supabase)

    Administration   https://editionsmapoukam.com/fr/admin
    Identifiants     admin@editionsmapoukam.com / Adm-…-7
```

Les identifiants administrateur sont aussi enregistrés dans
`/root/mapoukam-admin.txt`.

---

## Le fichier de configuration

Seul `DOMAINE` est vraiment nécessaire. Toute valeur vide reçoit sa valeur par
défaut, et **chaque fonction à laquelle il manque une clé est éteinte
proprement au lieu de faire échouer le site** :

| Fonction | Allumée si… | Sinon |
| --- | --- | --- |
| Paiement Notch Pay | les 3 clés sont remplies **et** ce sont des clés de test (`pk_test.…`), ou `NOTCHPAY_AUTORISER_PRODUCTION=true` | paiement simulé |
| Emails du site (Resend) | `RESEND_API_KEY` est remplie, la clé est acceptée par Resend, et le domaine de `RESEND_FROM_EMAIL` est **vérifié** chez Resend | les emails sont écrits sur le disque |
| Codes à 6 chiffres (inscription, mot de passe oublié) | la même clé Resend, et un port SMTP sortant est ouvert chez l'hébergeur (465, 587 ou 2587) | les inscriptions sont confirmées automatiquement |
| Connexion Google | `GOOGLE_CLIENT_ID` **et** `GOOGLE_CLIENT_SECRET` sont remplis | bouton Google masqué |

`PAYMENT_PROVIDER`, `MAILER` et `AUTH_GOOGLE` peuvent rester vides : le script
les déduit des clés présentes. Pour forcer un choix, écrivez `fake`,
`notchpay`, `file`, `resend`, `desactive`, `supabase` ou `better-auth`.

Les secrets de la base (mot de passe PostgreSQL, clé JWT, clés d'API) sont
**générés sur le serveur** au premier lancement, puis conservés aux lancements
suivants.

---

## Relancer le script

Le script peut être relancé autant de fois qu'on veut, sans rien perdre : ni
la base, ni les fichiers, ni les secrets, ni le certificat.

- **Après une erreur** : corrigez la cause affichée, puis relancez. Il reprend
  où il s'était arrêté.
- **Pour mettre le site à jour** après un `git push` : relancez-le. Il récupère
  le code, applique les nouvelles migrations et recompile le site.
- **Pour changer une clé** (Resend vérifié, nouvelles clés Google…) :
  modifiez `/root/mapoukam.conf`, puis relancez.

Tout ce qu'il affiche est aussi écrit dans
`/var/log/mapoukam-installation.log`.

---

## Ce qui reste à faire chez les prestataires

Ce sont des réglages à faire sur leurs sites, pas sur le serveur. Le script
rappelle les adresses exactes à la fin.

- **Resend** : vérifier le domaine `editionsmapoukam.com` (resend.com →
  Domains). Tant qu'il n'est pas vérifié, les emails restent éteints et le
  site fonctionne sans eux. Une fois vérifié, relancez le script.
- **Google** (console.cloud.google.com → Identifiants), URI de redirection
  autorisée : `https://api.editionsmapoukam.com/auth/v1/callback`
- **Notch Pay** (business.notchpay.co), URL du webhook :
  `https://editionsmapoukam.com/api/webhooks/payments`

---

## Faire un essai dans GitHub Codespaces, avant le vrai VPS

Le script reconnaît tout seul qu'il tourne dans un codespace. Il saute alors
ce qui n'a de sens que sur un serveur : nom de domaine, certificat, pare-feu,
mémoire d'échange. Il sert le site sur les adresses publiques du codespace,
qui sont déjà en HTTPS.

1. Sur github.com, dans le dépôt : **Code → Codespaces → Create codespace on
   main**. La machine par défaut (2 cœurs, 8 Go) suffit. Gardez l'image par
   défaut : elle contient déjà Docker.
2. Facultatif : pour tester aussi Notch Pay, Resend et Google, glissez
   `mapoukam.conf` dans le dossier `installation/` du codespace. Sans lui,
   l'essai se fait avec les valeurs par défaut.
3. Dans le terminal du codespace :

   ```bash
   bash installation/installer.sh
   ```

À la fin, le script affiche l'adresse du site, de la forme
`https://<nom-du-codespace>-8080.app.github.dev`.

Le script rend lui-même publics les ports **8080** (le site) et **8000** (la
base et les fichiers) : le site en a besoin pour joindre sa propre base. S'il
n'y parvient pas, il le dit : ouvrez l'onglet **PORTS**, faites un clic droit
sur 8080 puis sur 8000, choisissez **Port Visibility → Public**, et relancez
le script.

Ce que l'essai ne vérifie pas : le DNS, le certificat Let's Encrypt et le
pare-feu. Ce sont les seules étapes qui ne tournent que sur le vrai VPS.

Pensez à **arrêter le codespace** après l'essai : le quota gratuit se compte
en heures d'utilisation.

---

## Ce que le script ne fait pas

- **Il ne copie pas les données** du Supabase hébergé (comptes, commandes,
  contes déjà déposés). Le site démarre avec un catalogue vide.
- **Il n'exécute jamais `seed.sql`**, qui ajouterait des contes fictifs et des
  comptes de test.
