# Administration locale — déposer les gros contes depuis un ordinateur

Le site en ligne est hébergé chez Vercel, qui **refuse tout fichier de plus de
4,5 Mo** et coupe un traitement au bout de 60 secondes. Un conte exporté de
Canva pèse souvent 20 à 30 Mo et demande deux à trois minutes de conversion :
l'écran de dépôt en ligne ne peut pas l'accepter.

L'administration locale est **le même écran d'administration**, qui tourne sur
votre ordinateur et écrit directement dans la base du site. C'est votre
ordinateur qui convertit le PDF ; il n'envoie à Supabase que le résultat.
Le conte apparaît aussitôt sur le site en ligne, en brouillon.

---

## Ce qu'il faut

- **Windows 10 ou 11**, avec `winget` (« App Installer », déjà présent sur
  Windows 11 ; sinon dans le Microsoft Store).
- **Une connexion internet.** Un conte de 25 Mo met environ un quart d'heure à
  partir sur une connexion lente : c'est normal, il ne faut pas fermer la
  fenêtre.
- **Environ 2 Go d'espace disque**, et 1 Go de mémoire libre pendant un dépôt.
- **Les trois valeurs de Supabase** : dans le projet Supabase, *Project
  Settings → API* :
  - *Project URL* ;
  - la clé *anon public* ;
  - la clé *service_role*.
- **Votre compte administrateur** du site (adresse et mot de passe habituels).

Node.js et poppler (l'outil qui lit les PDF) sont installés automatiquement
s'ils manquent.

---

## Installation — une seule fois

1. **Récupérer le dossier du projet** sur la machine, par l'un de ces moyens :
   - `git clone https://github.com/brayanroys8888888/EditionMapoukam.git`
   - ou, sur GitHub : *Code → Download ZIP*, puis extraire le ZIP.

   ⚠️ Ne copiez pas le dossier depuis l'ordinateur de développement : il
   contient des fichiers de secrets (`.env.local`, `.env.production.local`)
   qui n'ont rien à faire sur une autre machine.

2. **Double-cliquer sur `admin-local\Installer.cmd`.** L'installateur :
   - installe Node.js et poppler s'ils manquent ;
   - installe les dépendances du site (quelques minutes) ;
   - vous demande les **trois valeurs de Supabase** (la clé *service_role*
     reste masquée pendant la saisie) ;
   - vérifie qu'elles sont acceptées par Supabase ;
   - construit le site (environ cinq minutes) ;
   - pose un raccourci **« Administration Mapoukam »** sur le Bureau.

   Si une étape échoue, le message dit quoi corriger. On peut relancer
   l'installateur autant de fois qu'on veut : il reprend là où il en était.

> Si l'installateur annonce que Node.js est installé « mais pas encore
> visible », fermez la fenêtre et relancez `Installer.cmd` : Windows ne met à
> jour le chemin des programmes que dans les nouvelles fenêtres.

---

## Utilisation

1. **Double-cliquer sur « Administration Mapoukam »** (Bureau).
   Une fenêtre noire s'ouvre et affiche la base à laquelle elle est reliée ;
   le navigateur s'ouvre ensuite sur l'écran de dépôt.
2. **Se connecter** avec le compte administrateur habituel.
3. **Déposer le conte** comme en ligne : choisir le fichier, le type (conte ou
   livret), l'orientation, puis valider. **Ne fermez ni la fenêtre noire ni le
   navigateur** tant que l'écran d'édition du conte ne s'est pas affiché.
4. Compléter la fiche (auteur, âge, prix…) et publier — ici ou sur le site en
   ligne, c'est la même base.
5. **Fermer la fenêtre noire** quand vous avez fini.

L'adresse est `http://localhost:3700`. Elle n'est accessible que depuis cet
ordinateur.

### Après une mise à jour du site

Si le code du site a changé (`git pull`, ou un nouveau ZIP extrait par-dessus),
le lanceur le détecte et **reconstruit le site automatiquement** au démarrage
suivant — cinq minutes, une fois.

---

## Ce que l'administration locale ne fait pas — volontairement

- **Aucun paiement**, ni réel ni simulé : le prestataire y est branché avec
  des clés factices. Les achats se font sur le site en ligne.
- **Aucune console de simulation** (`/dev`) : le site tourne en mode
  production.
- **Aucun email** n'est envoyé d'ici : ceux que l'application écrirait sont
  déposés dans le dossier `.mails-admin-local`.
- **Pas de connexion avec Google** : utilisez l'adresse et le mot de passe.

Elle sert à **déposer des contes**. Tout le reste de l'administration y
fonctionne aussi (c'est la même base), mais le site en ligne reste l'endroit
normal pour le travail courant.

---

## Sécurité — à lire

Le fichier **`admin-local\.env`** contient la clé *service_role* : **un accès
total à la base de production**, qui contourne toutes les protections.

- Il n'est jamais envoyé sur GitHub (le dépôt l'ignore).
- Ne l'envoyez à personne, ne le copiez pas sur une clé USB.
- L'ordinateur doit être protégé par un mot de passe de session.
- Si l'ordinateur est perdu, volé ou revendu : **régénérez la clé
  *service_role*** dans Supabase (*Project Settings → API*), puis mettez la
  nouvelle dans Vercel et dans les autres postes.

Pour changer de clé ou de projet : supprimez `admin-local\.env` et relancez
`Installer.cmd`, ou modifiez le fichier à la main (modèle :
`configuration.exemple.env`). Le site sera reconstruit au prochain démarrage.

---

## En cas de problème

| Ce que vous voyez | Ce qu'il faut faire |
| --- | --- |
| « poppler est introuvable » | `winget install -e --id oschwartz10612.Poppler`, puis rouvrir la fenêtre |
| « La clé service_role est refusée » | la clé a été mal recopiée, ou régénérée depuis : la reprendre dans Supabase |
| « Supabase ne répond pas » | connexion internet, ou adresse du projet erronée dans `admin-local\.env` |
| Le port 3700 est déjà utilisé | ajouter `ADMIN_LOCAL_PORT=3701` dans `admin-local\.env` |
| Le dépôt échoue après de longues minutes | relancer le dépôt ; si l'écran d'administration montre un brouillon **vide** « du même titre », le supprimer d'abord, sinon le nouveau prendra une adresse en `-2` |

Pour contrôler le poste sans rien démarrer :

```
node admin-local\lanceur.mjs --verifier
```

---

## Pour les développeurs

- `lanceur.mjs` — vérifie le poste, construit si besoin (dans
  `.next/admin-local`, avec `tsconfig.admin-local.json`), démarre
  `next start` sur `127.0.0.1`. Toutes ses variables sont posées
  explicitement : sur un poste de développement, Next compléterait sinon
  avec `.env.local`.
- `delai-fetch.cjs` — relève le délai de 300 s du `fetch` de Node, qui faisait
  échouer l'envoi d'un conte de 25 Mo. Partagé avec
  `scripts/deposer-conte-distant.mjs`.
- `tests/unit/admin-local.test.ts` — tient ce que le lanceur impose : mode
  production, jamais le faux prestataire, écoute locale seulement.
- Contexte et mesures : `REPRISE.md`, sections 0 duodecies et 0 quaterdecies.
