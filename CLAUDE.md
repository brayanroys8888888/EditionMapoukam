# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

Contexte permanent du projet. Lis ce fichier au début de chaque session.

## Le projet

Plateforme de contes africains illustrés pour enfants, avec deux modèles économiques
qui coexistent :

- **Abonnement** — donne accès à la **lecture en ligne** du catalogue. Ne donne
  jamais le droit de télécharger.
- **Achat à l'unité** — donne le droit de **télécharger** le fichier (PDF et EPUB)
  et de lire ce titre en ligne sans limite de durée.

Cette séparation est la règle métier centrale. Toute confusion entre les deux est
un bug critique.

Public : parents de 28 à 45 ans, dont une part importante en Afrique francophone
sur connexion lente. Langues : français et anglais.

La spécification complète est dans `docs/cahier-des-charges.md`. Elle fait foi.
En cas de contradiction entre ce fichier et la spécification, la spécification
gagne — signale-moi la contradiction plutôt que de trancher seul.

## Mode de développement : 100 % local, aucun service externe

**Aucune clé API de service externe n'est utilisée dans ce projet à ce stade.**
Aucun compte Stripe, aucun compte Resend, aucun service tiers. Tout tourne sur la
machine de développement.

Les actions qui dépendraient normalement d'un tiers sont **simulées par des
adaptateurs locaux**, derrière les mêmes interfaces que leurs futurs équivalents
réels :

| Service réel (plus tard) | Adaptateur local (maintenant) |
|---|---|
| Stripe | `FakePaymentProvider` + console de simulation |
| Resend (emails transactionnels) | `FileMailer` — écrit les emails dans `.mails/` |
| Emails d'authentification | Interface de capture d'emails de Supabase local |
| Supabase hébergé | Supabase local via Docker (`supabase start`) |

**Règle structurante :** seul l'**émetteur** est simulé, le **récepteur** est réel.
Le faux prestataire de paiement envoie de vrais webhooks signés vers le vrai
gestionnaire de webhooks. La vérification de signature, l'idempotence et l'octroi
atomique des droits sont donc développés et testés pour de bon.

Toute la logique métier ignore complètement quel adaptateur est branché. Si un
morceau de logique métier mentionne « Stripe » ou « Resend », c'est un défaut de
conception à corriger.

## Stack

| Couche | Technologie |
|---|---|
| Runtime | Node 20+, TypeScript strict |
| Framework | Next.js (App Router), routes API |
| Base de données | PostgreSQL via Supabase local (Docker) |
| Auth | Supabase Auth (local) |
| Stockage | Supabase Storage local (buckets privés) |
| Paiement | `FakePaymentProvider`, derrière l'interface `PaymentProvider` |
| Emails | `FileMailer`, derrière l'interface `Mailer` |
| Traitement PDF | poppler (`pdftoppm`, `pdftotext`) en sous-processus |
| Images | `sharp` |
| Filigrane PDF | `pdf-lib` |
| Tests | Vitest (unitaires et intégration) |

**Licences — interdiction stricte.** Ne jamais introduire `PyMuPDF` ni `ebooklib` :
elles sont sous AGPL, ce qui contaminerait une application exposée en réseau.
Toute nouvelle dépendance doit être sous licence permissive (MIT, Apache 2.0, BSD).
Les binaires GPL appelés en sous-processus (poppler) sont autorisés.

**Une exception, nommée et bornée : `axe-core`, sous MPL-2.0.** Accordée le
3 août 2026 pour les tests d'accessibilité automatisés de l'étape F14.

Trois conditions, et l'exception tombe si l'une cesse d'être vraie :

1. **Dépendance de développement uniquement.** Elle n'est jamais distribuée avec
   l'application, ni incluse dans un bundle client.
2. **Aucun fichier d'`axe-core` n'est modifié.** MPL-2.0 est un copyleft *au
   fichier* : il n'oblige qu'à publier les fichiers qu'on modifie. N'en modifier
   aucun rend l'obligation sans objet.
3. **L'exception vaut pour `axe-core` seul**, et ne crée aucun précédent pour
   d'autres licences ni pour d'autres paquets sous MPL.

**Pourquoi c'est écrit plutôt que toléré.** MPL-2.0 n'a pas l'effet de l'AGPL,
qui est la raison de l'interdiction de PyMuPDF et d'ebooklib — celle-là
contaminerait une application exposée en réseau. La distinction est réelle, mais
une exception tacite devient un précédent : dans six mois, personne ne saurait
plus si MPL a été autorisée par décision ou par inattention.

## Commandes

```bash
supabase start           # démarre la pile locale (base, auth, storage, mail)
supabase stop            # arrête la pile locale

npm run dev              # serveur de développement
npm run build            # build de production
npm run typecheck        # tsc --noEmit — doit sortir en 0
npm run lint             # eslint — doit sortir en 0
npm run test             # tous les tests — doivent tous passer
npm run db:migrate       # applique les migrations
npm run db:reset         # réinitialise la base locale et rejoue les seeds
npm run db:seed          # jeu de données de démonstration
npm run verify           # typecheck + lint + test — LA porte de validation
```

`npm run verify` est la commande qui valide une étape. Elle doit sortir en code 0.

### Lancer UN test, et pas les 1354 autres

`npm run test` passe par `scripts/porte-tests.mjs`, qui **transmet ses arguments
à Vitest**. Tout filtre rend l'exécution *partielle* et désarme le contrôle
d'effectif — le contrôle des tests ignorés, lui, s'applique toujours.

```bash
npm run test -- tests/unit/money.test.ts        # un fichier
npm run test -- -t "expire"                     # par nom de test
npm run test:unit                               # le projet `unit` seul
npm run test:brut                               # Vitest nu, sans la porte
npx vitest run tests/integration/orders.test.ts # équivalent, plus direct
npm run rendu                                   # Playwright (rendu visuel)
npm run audit:epub                              # configuration Vitest séparée
```

Trois projets Vitest, séparés parce qu'ils n'ont pas les mêmes besoins
(`vitest.config.ts`) :

| Projet | Contenu | Base requise |
| --- | --- | --- |
| `unit` | `tests/unit/` — logique pure | non |
| `integration` | `tests/integration/`, `tests/security/`, `tests/e2e/` | **oui** |
| `composants` | `tests/composants/` — rendu jsdom | non |

Les tests d'intégration **partagent une base** et tournent donc en série
(`fileParallelism: false`). Un test qui MUTE le jeu de démonstration doit le
rendre intact, sans quoi il fait tomber des fichiers qui ne parlent pas de lui.

### ⚠️ Le port 3000 — deux exigences contradictoires

- **`npm run verify` exige que RIEN n'écoute sur le port 3000.**
  `tests/unit/middleware.test.ts` simule une panne réseau ; un serveur qui
  répond la lui refuse.
- **`npm run rendu` exige au contraire un serveur en marche.**

Arrêter le serveur de développement avant `verify`, le relancer après. Un
serveur tué brutalement laisse le port occupé et ses processus de rendu morts :
**tout répond alors 500**, sur un code parfaitement sain.

### Après CHAQUE migration

```bash
npm run db:migrate       # applique
npm run db:types         # RÉGÉNÈRE src/lib/supabase/database.types.ts
```

Le second n'est pas optionnel : `src/lib/admin/service.ts` contraint ses appels
RPC aux fonctions réellement présentes dans le type généré. Une fonction ajoutée
en SQL et non régénérée **ne compile pas** — ce qui est le comportement voulu.

Les migrations sont numérotées et **jamais modifiées après application** : on
ajoute une migration corrective. Le dépôt en est à la **0060**.

## Architecture — les quatre couches, et ce qui les sépare

```
src/domain/   RÈGLES PURES. Aucune E/S, aucun réseau, aucune base, aucun
              `new Date()`. Des fonctions et des types. C'est la couche qu'on
              peut tester sans rien allumer.

src/lib/      ADAPTATEURS ET APPELANTS. Clients Supabase, poppler, sharp,
              stockage, HTTP. Cette couche TRANSPORTE des arguments ; elle
              n'invente pas de règle.

src/app/      ROUTES API et ÉCRANS (App Router). Valide avec Zod, appelle
              `src/lib`, ne décide jamais d'un droit.

supabase/     LA BASE — et le siège des règles les plus sensibles.
migrations/   Fonctions `security definer`, politiques RLS.
```

### La règle qui explique tout le reste : UNE seule implémentation

Une règle écrite deux fois diverge, et c'est toujours la copie qui a l'air
d'avoir raison. Le projet pousse donc chaque règle à l'endroit le plus bas
possible, et tout le reste l'appelle :

| Règle | Unique implémentation | Qui l'appelle |
| --- | --- | --- |
| Qui a le droit de lire quoi | `access_for_books` (migration 0016) | l'application **et** les politiques RLS |
| Ce qui manque pour publier | `manques_pour_publication` | le déclencheur de publication **et** les écrans d'administration |
| État réel d'un abonnement | `statut_effectif` contre `app_now()` | jamais une comparaison de dates faite en TypeScript |
| Remboursement | `refund_order` | le webhook **et** l'administration |

Conséquence pratique : `src/domain/access/` ne contient **que des types**. Un
test parcourt ce répertoire et échoue s'il y trouve une décision d'accès.

### L'administration est la surface la plus privilégiée

Elle passe par `service_role`, donc **RLS est contourné par construction** et le
seul rempart qui reste est le code. D'où trois contrôles indépendants sur chaque
mutation :

1. l'écran ou la route appelle `gardeAdmin` / `exigerAdministrateur` ;
2. la route délègue à une fonction `admin_*` ;
3. la fonction `admin_*` **revérifie le rôle EN BASE** et pose l'acteur pour
   l'audit.

`src/lib/admin/service.ts` ne fait que transporter des arguments. **L'acteur est
toujours le premier paramètre**, et il vient de la session vérifiée — jamais du
corps de la requête.

Un non-administrateur reçoit **404, pas 403** : « vous n'avez pas accès »
confirmerait qu'il y a une administration à cette adresse.

### Le thème est commutable, ce n'est pas une seconde application

```
NEXT_PUBLIC_DESIGN_VERSION=v2     # dans .env.local
```

Les URL, le backend, les droits et les tests sont partagés. Trois pièces
seulement :

| Pièce | Rôle |
| --- | --- |
| `src/design/tokens.css` | les valeurs `--v2-*` et le bloc `[data-design='v2']` |
| `src/design/version.ts` | lit la variable, replie sur `v1` |
| `src/app/layout.tsx` | pose `data-design` sur `<html>` — **tout le commutateur est là** |

**Aucun composant ne connaît le thème.** Ils lisent des jetons qui changent de
valeur sous eux. `src/design/enveloppe.ts` décide séparément, en fonction du
chemin, si un écran reçoit l'en-tête complet, transparent, ou rien.

### L'internationalisation

`src/i18n/fr.json` **fait foi sur la forme** : le type `CleTraduction` en est
dérivé, si bien qu'une clé ajoutée en anglais et oubliée en français ne compile
pas. Un test vérifie la réciproque, que le type ne peut pas exprimer, ainsi que
l'absence de traduction vide.

Une clé manquante replie sur le **français**, jamais sur la clé brute.

## Les tests d'architecture — la clôture invisible

Ces tests échouent sur du code qui compile et qui marche. Les connaître évite de
les découvrir en fin de tâche :

| Test | Ce qu'il interdit |
| --- | --- |
| `clock-discipline` | `new Date()` / `Date.now()` dans `src/domain` — **et il lit aussi les commentaires** |
| `access-purity` | toute règle d'accès hors de la fonction SQL |
| `frontend-architecture` | la clé de service dans un composant ; un droit **déduit** au lieu d'être lu |
| `telechargement-architecture` | le nom `fichier_telechargement` hors du service de téléchargement et de l'ingestion |
| `admin-architecture` | une route d'admin qui simule un paiement ou déplace l'horloge ; **et la garde sur chaque `page.tsx` d'administration** |
| `zone-encaissement-architecture` | une zone d'encaissement acceptée en ENTRÉE d'une route |
| `book-pages-architecture` | une page de livre lue sans passer par le moteur de droits |
| `covers-architecture` | un dépôt de couverture fait ailleurs que par son module |
| `middleware` | il lit `public/` **sur le disque** et exige que chaque entrée traverse sans redirection |
| `design-tokens` | recalcule les contrastes de la palette |
| `plafond-depot` | `next.config.ts` et `TAILLE_MAX_OCTETS` doivent rester alignés |

## La porte de validation, et pourquoi elle est un script

`npm run test` ne lance pas Vitest directement. `scripts/porte-tests.mjs` ferme
trois trous mesurés sur ce dépôt, où **un test qui ne s'exécute pas ne proteste
pas** :

- un `beforeAll` qui expire **saute** ses tests au lieu de les faire échouer —
  vingt-six tests de sécurité ont ainsi disparu d'une exécution ;
- `it.skip` / `it.todo` sortent en **code 0** ;
- `--passWithNoTests` valide une étape sur zéro test.

Deux invariants, tous deux fatals :

1. **aucun test ignoré** — la liste blanche est vide et doit le rester ;
2. **l'effectif ne diminue jamais, FICHIER PAR FICHIER**
   (`tests/effectif-attendu.json`). Un total global ne verrait pas dix tests de
   sécurité remplacés par dix tests de formatage.

Le fichier d'effectif se met à jour **automatiquement quand tout est vert**.
Toute baisse doit être corrigée à la main, dans le même commit.

⚠️ **Un conte ingéré à l'essai reste dans la base et compte dans le jeu de
démonstration aux yeux des tests.** `access.test.ts` et `schema.test.ts`
attendent **10** livres et échouent sur 11 ou 12 — sans qu'aucun message ne parle
d'administration. Effacer les contes d'essai après chaque essai manuel.

## La console de simulation

Une interface de développement, montée sur `/dev`, permet de déclencher à la main
tout ce qui viendrait normalement d'un service externe :

- payer une commande avec succès
- faire échouer un paiement
- abandonner un paiement
- souscrire un abonnement
- simuler un renouvellement réussi
- simuler un échec de prélèvement
- simuler une annulation
- simuler l'expiration d'un abonnement
- **avancer le temps** d'un nombre de jours donné, pour tester les fins de période
  et la fenêtre de 3 mois des nouveautés sans attendre
- consulter les emails envoyés

Chaque action de cette console émet un vrai événement signé vers le vrai
gestionnaire de webhooks. Elle ne modifie jamais la base de données directement.

**Garde-fou obligatoire :** toutes les routes sous `/dev` sont inaccessibles si
`NODE_ENV === 'production'`. Un test doit le prouver.

## Règles de sécurité — non négociables

1. **RLS activé sur toutes les tables**, en refus par défaut. Aucune table sans
   politique explicite. Une table sans RLS est une faille, pas un oubli.
2. **La clé `service_role` ne quitte jamais le serveur.** Jamais dans un composant
   client, jamais dans une variable `NEXT_PUBLIC_*`.
3. **Les buckets de fichiers sont privés.** Aucun fichier de livre n'est jamais
   accessible par URL publique. L'accès passe systématiquement par une route
   serveur qui vérifie les droits puis émet une URL signée.
   Les URL signées ont une durée de validité de 300 secondes maximum pour tout
   contenu payant, sans exception. Les titres marqués `gratuit = true` peuvent
   avoir une durée allongée, plafonnée à 3600 secondes, et être mis en cache
   CDN. La vérification des droits reste effectuée à chaque requête dans les
   deux cas.
4. **Les droits sont toujours vérifiés côté serveur**, à chaque requête, contre la
   table `entitlements`. Jamais de confiance accordée à un état transmis par le
   client.
5. **Les webhooks sont la seule source de vérité** sur l'état d'un paiement. Une
   redirection de navigateur ne déclenche jamais l'octroi d'un droit. Signature
   vérifiée systématiquement, traitement idempotent. Cette règle s'applique aussi
   au faux prestataire.
6. **Aucun secret en dur dans le code.** Les valeurs locales vivent dans
   `.env.local`, non versionné.
7. **Aucune donnée d'enfant collectée.** Le compte appartient au parent adulte. Pas
   de prénom, d'âge ni de date de naissance d'enfant, nulle part dans le schéma.

## Règles métier à ne pas confondre

- Un abonnement **expiré** retire l'accès en lecture aux titres couverts par
  l'abonnement, mais **ne retire jamais** l'accès aux titres achetés à l'unité.
  C'est le bug classique de ce type de plateforme — il doit avoir un test dédié.
- Le droit de téléchargement (`peut_telecharger`) n'est accordé que par un achat,
  jamais par un abonnement.
- Un titre peut être simultanément inclus dans l'abonnement et vendu à l'unité.
  Les champs `inclus_abonnement` et `disponible_achat` sont indépendants.
- Les nouveautés sont vendues seules pendant 3 mois avant d'entrer dans
  l'abonnement. Cette règle s'applique par comparaison avec `publie_le`.

## Conventions de code

- TypeScript en mode `strict`. Aucun `any` implicite ou explicite sans commentaire
  justifiant.
- Pas de `console.log` en production — utiliser le logger du projet.
- Toute route API valide ses entrées avec Zod avant tout traitement.
- Les erreurs renvoyées au client ne divulguent jamais de détail interne.
- **Le temps ne se lit jamais avec `new Date()` directement dans la logique
  métier.** Il passe par un service `clock` injectable, pour que la console de
  simulation puisse avancer le temps et que les tests soient déterministes.
- Nommage : anglais pour le code, français pour les messages destinés à
  l'utilisateur.
- Les migrations SQL sont numérotées, jamais modifiées après application — on
  ajoute une migration corrective.

## Stratégie de test

Chaque étape livre ses tests en même temps que son code. Une étape sans test n'est
pas terminée.

- **Unitaires** — logique métier pure : calcul des droits, fenêtre de 3 mois,
  transitions d'état d'abonnement.
- **Intégration** — routes API contre la base locale réelle, pas de mock de base.
- **Sécurité** — pour chaque table, un test qui vérifie qu'un utilisateur A ne peut
  pas lire ou modifier les données d'un utilisateur B.
- **Webhooks** — signature invalide rejetée, événement rejoué deux fois traité une
  seule fois.
- **Temps** — les scénarios d'abonnement (fin de période, échec, expiration) sont
  testés en avançant l'horloge injectée, jamais en attendant.

## Périmètre — backend livré, interface en cours

Le **backend est terminé** : seize étapes, mille tests. Le chantier en cours est
l'**interface**, front-office et back-office, suivant `docs/PLAN-FRONTEND.md`.

Ce fichier a longtemps porté « ne crée pas d'interface utilisateur, ce chantier
est backend ». C'était vrai jusqu'à l'étape 16 ; ce ne l'est plus. La ligne a été
retirée le 3 août 2026, après vérification que la **spécification** l'emporte :
`docs/cahier-des-charges.md` §4.1 et §4.2 décrivent treize écrans, et §5.3 fixe
un objectif WCAG 2.1 AA qui n'a de sens que sur une interface.

**Ce qui ne change pas :** les sept règles de sécurité ci-dessus s'appliquent
intégralement à l'interface. En particulier, **le frontend ne recalcule jamais
une règle métier** — il lit `canRead`, `canDownload`, `prix.affichage`,
`abonnement_a_partir_du`, jamais une valeur qu'il aurait dérivée lui-même. Un
test d'architecture l'impose.

Les maquettes de référence sont décrites dans `docs/maquettes/`. Elles sont une
**intention visuelle**, jamais une autorité sur une donnée ou une règle : leurs
prix, notamment, sont faux et le dossier le dit.

## Avant de déboguer : est-ce seulement le code ?

Trois pannes d'environnement produisent des symptômes qui ressemblent à des
défauts de code. Les écarter d'abord coûte trente secondes.

| Symptôme | Cause probable | Vérification |
| --- | --- | --- |
| « Quelque chose n'a pas fonctionné » sur **tous** les écrans qui lisent la base | **Docker arrêté** | `docker ps` |
| 500 **généralisé**, ou `Jest worker encountered N child process exceptions` | serveur saturé ou tué brutalement ; l'ingestion coûte ~3 Go et ne les rend pas | RAM libre, puis **redémarrer le serveur** |
| Une page en Georgia, sans style | `/fonts/*` ou `/images/*` remangés par le middleware | `curl` sur l'actif |
| `typecheck` échoue sur des types fantômes | `.next/dev/types` à moitié écrit | purger `.next` |

Un **masque CSS qui échoue ne laisse pas un trou : il laisse le disque entier**,
ce qui a tout l'air du dessin voulu. C'est le logo, et ça a déjà trompé.

## Documents de référence

| Fichier | Ce qu'il porte |
| --- | --- |
| `docs/cahier-des-charges.md` | **la spécification, elle fait foi** — ne pas la modifier |
| `docs/PLAN.md` | les seize étapes du backend, et leurs arbitrages numérotés |
| `docs/PLAN-FRONTEND.md` | le chantier d'interface en cours |
| `docs/API-CONTRAT.md` | le contrat des routes |
| `docs/AVANT-MISE-EN-PRODUCTION.md` | ce qui reste à faire avant la mise en ligne |
| `REPRISE.md` | **le point de reprise vivant** — état du chantier, pièges rencontrés, identifiants locaux |
| `docs/maquettes/` | intention visuelle. **Jamais une autorité sur une donnée** : leurs prix sont faux, et le dossier le dit |

`REPRISE.md` est à lire en début de session au même titre que ce fichier : il
porte ce qui est en cours, alors que celui-ci porte ce qui est permanent.

## Ce qu'il ne faut pas faire

- N'installe aucun SDK de service externe (Stripe, Resend, etc.) à ce stade.
- N'invente pas de règle métier absente de la spécification — pose-moi la question.
- Ne passe pas à l'étape suivante si `npm run verify` échoue.
- Ne désactive pas un test pour faire passer la suite.
- Ne modifie pas `docs/cahier-des-charges.md`.
