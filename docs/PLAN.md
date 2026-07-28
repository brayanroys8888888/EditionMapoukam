# PLAN.md — Plan d'implémentation du backend

Document de pilotage. Il est mis à jour à la fin de chaque étape (case cochée,
décisions techniques, modifications rétroactives).

- Spécification de référence : `docs/cahier-des-charges.md` (fait foi)
- Contexte permanent : `CLAUDE.md`
- Porte de validation d'une étape : `npm run verify` doit sortir en code 0

**Statut global : plan validé le 2026-07-28. Étape 0 en cours.**
Décisions métier arrêtées en §3 (D1 à D4) et §4 (D5, D6). La règle 3 de
`CLAUDE.md` a été réécrite en conséquence (D6).

---

## 1. État des lieux constaté

| Point | Constat |
|---|---|
| Node | v22.17.0 — conforme (Node 20+) |
| npm | 10.9.2 |
| git | 2.51.2 — **le dossier n'est pas encore un dépôt git** (`git init` à l'étape 0) |
| Docker | client 29.2.1 installé, **démon non démarré** — bloquant pour `supabase start` |
| Supabase CLI | **non installé** — sera ajouté en dépendance de développement (`npx supabase`) |
| poppler | `pdftoppm` 25.07.0 disponible dans le PATH — conforme à l'étape 7 |
| `.env.local` | **absent** — seul `env.example.txt` est présent |
| Contenu de test | `conte d'afrique/` contient 16 PDF, 16 EPUB et 16 couvertures — matière réelle pour l'étape 7 et les seeds |
| Projet Node | aucun `package.json` — le socle est à créer intégralement |

**Deux actions vous incombent avant l'étape 0 :** démarrer Docker Desktop, puis
me laisser lancer `npx supabase start` pour récupérer les clés locales et écrire
`.env.local`. Sans le démon Docker, aucune étape à partir de la 1 ne peut être
validée, puisque les tests d'intégration tournent contre la vraie base locale.

---

## 2. Décisions de structure

### 2.1 Arborescence

```
src/
  app/
    api/                 routes API (App Router, route handlers)
    dev/                 console de simulation, rudimentaire
  lib/
    config/              lecture et validation de l'environnement (Zod)
    clock/               service d'horloge injectable
    logger/              logger du projet (aucun console.log)
    supabase/            fabriques de clients (anon, utilisateur, service_role)
    http/                helpers de réponse, erreurs publiques, limitation de débit
    money/               devises, sous-unités, formatage
    crypto/              signature HMAC des webhooks
  domain/
    access/              moteur de droits — cœur du système
    catalog/
    orders/
    subscriptions/
    downloads/
    ingestion/
    stats/
  adapters/
    payment/             interface PaymentProvider + FakePaymentProvider
    mail/                interface Mailer + FileMailer
supabase/
  migrations/            migrations SQL numérotées
  seed.sql               jeu de démonstration
tests/
  unit/                  logique pure, sans base
  integration/           routes + base locale réelle
  security/              isolation entre utilisateurs (RLS)
  e2e/                   parcours complets pilotés par la console
docs/
```

Règle d'étanchéité : `src/domain/**` ne connaît ni Next.js, ni Supabase, ni un
quelconque prestataire. Il reçoit ses dépendances (horloge, dépôt de données,
prestataire de paiement, mailer) par injection. Une règle ESLint interdira les
imports de `next/*`, `@supabase/*` et `src/adapters/**` depuis `src/domain/**`.

### 2.2 Tables complémentaires à la section 8 de la spécification

| Table | Justification | Référence |
|---|---|---|
| `carts`, `cart_items` | panier multi-titres | §4.2 F9 |
| `promo_codes`, `promo_redemptions` | codes promotionnels | §4.3 F12, §3.4 |
| `book_prices` | deux zones tarifaires | §3.3, décision D4 |
| `currencies` | nombre de décimales par devise (XAF/XOF n'en ont pas) | décision D4 |
| `webhook_events` | idempotence des webhooks | §9.1, CLAUDE.md règle 5 |
| `book_pages` | sortie de l'ingestion : images WebP par résolution, couche texte | §7.4.3 |
| `ingestion_jobs` | suivi et rejouabilité de l'ingestion | §7.4.3 |
| `payment_events` | journal des événements du prestataire | §9.1 |
| `email_log` | trace des emails émis, alimente la console | §9.2 |

Toutes suivent la même règle : RLS activée, refus par défaut, politique
explicite, test d'isolation entre deux utilisateurs.

### 2.3 Écarts assumés avec la section 8 de la spécification

Ces écarts résultent des décisions D1 à D4. Ils sont consignés ici parce que la
spécification fait foi et qu'un écart doit être traçable.

| Écart | Nature | Raison |
|---|---|---|
| `entitlements.type` ne comporte plus la valeur `abonnement` | **retrait** d'une valeur d'énumération | L'accès par abonnement est recalculé, jamais matérialisé. Aucune ligne ne doit jamais porter ce type (D1) |
| `books.prix` est supprimé | **retrait** d'une colonne | Tous les prix passent par `book_prices`. Conserver les deux conduirait à une divergence (D4) |
| `books.gratuit` ajouté | ajout | Conte gratuit complet de l'offre Découverte, §3.3 (D3) |
| `books.nb_pages_extrait` ajouté | ajout | Longueur de l'extrait réglable par titre (D3, point 8) |
| `book_translations.statut` ajouté | ajout | Une traduction en brouillon reste invisible, même pour un acheteur (D2, point 4) |
| `orders.zone`, `order_items.devise`, `order_items.zone` ajoutés | ajout | Fige les conditions tarifaires au moment de l'achat (D4) |
| `entitlements.source_id` ajouté | ajout | Porte l'origine du droit et rend possible l'index unique qui garantit l'idempotence au niveau base (D1 point 8) |
| `subscriptions.zone` ajouté | ajout | Zone figée à la souscription, jamais recalculée (D4, point 4) |
| `orders.prestataire` accepte `fake` | élargissement d'énumération | Mode de développement local ; `stripe` et `mobile_money` restent prévus |

### 2.4 Nommage

La spécification décrit les colonnes en français (`inclus_abonnement`,
`peut_telecharger`, `publie_le`) ; CLAUDE.md impose l'anglais pour le code.
**Décision : les colonnes SQL gardent les noms français de la spécification** —
c'est le contrat de données, et la spécification fait foi. Le code TypeScript
expose des types dont les propriétés reprennent ces mêmes noms, via une couche
de mapping unique par table. Les noms de fonctions, variables, fichiers et
fonctions SQL restent en anglais.

### 2.5 Horloge injectable, et son passage jusqu'au RLS

`Clock` est une interface (`now(): Date`), avec `SystemClock` (production),
`FixedClock` (tests) et `DevClock` (décalage persisté dans `.devclock.json`,
jamais instancié si `NODE_ENV === 'production'`). Le décalage vit dans un
fichier et non en base : la console ne doit jamais écrire en base, et le
décalage doit survivre au rechargement du serveur.

La décision D1 impose que le moteur de droits soit une fonction PostgreSQL
appelable par les politiques RLS. Une politique RLS ne reçoit aucun paramètre
applicatif : il faut donc un pont entre l'horloge injectée et le SQL.

**Mécanisme retenu, avec trois durcissements obligatoires.**

```sql
-- Artefact d'activation. La TABLE est créée par migration, mais la LIGNE
-- n'est insérée que par le seed de développement. En production, la table
-- est vide : l'override est physiquement inopérant, quel que soit le code.
create table public.dev_clock_activation (
  id smallint primary key default 1 check (id = 1),
  note text not null
);

create function app_now() returns timestamptz
  language plpgsql stable
  security definer set search_path = public, pg_temp
as $$
declare
  v_override text;
begin
  -- (a) sans l'artefact d'activation, app.now est ignoré, point final
  if not exists (select 1 from public.dev_clock_activation) then
    return now();
  end if;
  v_override := nullif(current_setting('app.now', true), '');
  if v_override is null then
    return now();
  end if;
  return v_override::timestamptz;
end;
$$;
```

Toutes les fonctions du moteur prennent `p_at timestamptz default app_now()`.
L'application passe l'instant explicitement quand elle appelle la fonction
elle-même ; les politiques RLS retombent sur `app_now()`.

- **(a) L'override est conditionné à un artefact de base, pas à une variable
  d'application.** La ligne de `dev_clock_activation` est créée par
  `supabase/seed.sql`, jamais par une migration. Une base de production n'a pas
  cette ligne, donc `app_now()` y vaut `now()` même si le code applicatif était
  compromis ou mal configuré. `app_now()` est `security definer` afin de
  pouvoir lire cet artefact depuis une politique RLS évaluée en tant qu'`anon`.
- **(b) `app.now` n'est jamais dérivé d'une entrée utilisateur** — ni en-tête
  HTTP, ni paramètre de requête, ni cookie, ni corps de requête. Sa seule
  source est le `DevClock`, c'est-à-dire un état détenu par le serveur
  (`.devclock.json`) et modifiable uniquement par la console `/dev`. Un seul
  module du dépôt a le droit d'émettre `SET LOCAL app.now` :
  `src/lib/supabase/dev-clock-session.ts`. Un test parcourt les sources et
  échoue si la chaîne `app.now` apparaît ailleurs.
- **(c) Test obligatoire** : positionner `app.now` **sans** l'artefact
  activateur et vérifier que `app_now()` renvoie l'heure réelle. Complété par
  le test symétrique — artefact présent et `app.now` positionné → l'heure
  décalée est bien retournée — et par un test vérifiant qu'un client anonyme ne
  peut pas influencer `app_now()`.

### 2.6 Signature des webhooks

En-tête `x-webhook-signature: t=<timestamp>,v1=<hmac>` où
`hmac = HMAC-SHA256(secret, "<timestamp>.<corps brut>")`, comparaison à temps
constant, tolérance de 5 minutes. Le corps brut est lu avant tout parsing.
`FAKE_WEBHOOK_SECRET` vient de l'environnement, jamais du code. Ce schéma est
calqué sur les conventions du marché pour qu'un prestataire réel se substitue
sans toucher au gestionnaire.

---

## 3. Décisions métier arrêtées

### D1 — L'accès par abonnement est calculé, jamais matérialisé

1. `entitlements` ne contient que les faits non recalculables : les achats
   (`type = 'achat'`) et les octrois manuels d'un administrateur
   (`type = 'offert'`). **La valeur `abonnement` est retirée de l'énumération**
   — aucune ligne ne doit jamais porter ce type. Écart consigné en §2.3.
2. Le calcul d'accès est implémenté comme une **fonction PostgreSQL**, pas
   seulement en TypeScript, afin que les politiques RLS puissent l'appeler. Une
   politique RLS ne peut pas invoquer du code applicatif : une seule
   implémentation, appelée à la fois par le RLS et par l'application. La couche
   TypeScript n'est qu'un appelant typé, elle ne réimplémente aucune règle.
3. Signature : `getAccess(userId, bookId) -> { canRead, canDownload, reason }`,
   avec `reason ∈ { 'purchase', 'granted', 'subscription', 'free', 'preview',
   'none' }`. Le champ sert au débogage et permet à l'interface d'afficher
   « Inclus dans votre abonnement » plutôt que « Vous possédez ce conte ».
   Sa sémantique exacte est fixée par D5.
4. Version par lot obligatoire : `getAccessForBooks(userId, bookId[])`, résolue
   en **une seule requête**. Sans elle, l'affichage d'un catalogue de 40 contes
   déclencherait 40 requêtes.
5. Un abonnement au statut `impaye` donne toujours accès **pendant sa période
   de grâce**. L'accès ne s'arrête qu'à l'issue de celle-ci.
6. Toutes les comparaisons de dates — expiration d'abonnement, fenêtre de
   3 mois — passent par l'horloge injectable, jamais par `now()` directement
   (mécanisme en §2.5).
7. Les neuf tests du moteur de droits restent obligatoires (étape 4).
8. **Idempotence garantie par la base, pas seulement par le code.** Un index
   unique sur `entitlements` interdit deux droits identiques pour un même
   utilisateur, un même livre et une même origine :

   ```sql
   create unique index entitlements_unique_origin
     on public.entitlements (user_id, book_id, type, source_id)
     nulls not distinct;
   ```

   `source_id` porte l'origine du droit : identifiant de commande pour un
   `achat`, `null` pour un `offert` (la clause `nulls not distinct` empêche
   alors deux octrois manuels en double). Le traitement concurrent de deux
   webhooks identiques **échoue au niveau base**, il n'est pas seulement filtré
   en amont par `webhook_events`. Les deux protections coexistent : la table
   `webhook_events` est la première ligne de défense, l'index unique la
   dernière, et c'est elle qui tient sous concurrence réelle.

**Composition de la décision d'accès** (corrigée, voir D5) : `canRead` est un
**OU logique** entre toutes les sources de droit — l'ordre d'évaluation n'a
aucune importance. `canDownload` est calculé **indépendamment de `reason`** : il
ne dépend que de l'existence d'un entitlement `achat` ou `offert` portant
`peut_telecharger = true`.

### D2 — Un droit porte sur le livre, jamais sur une version linguistique

1. Vrai pour l'achat comme pour l'abonnement. Un achat donne accès à **toutes**
   les versions linguistiques publiées du conte, y compris celles publiées
   après l'achat.
2. **`order_items.langue` est purement informatif** — facture, langue choisie à
   l'achat, statistiques de vente. Elle ne doit **jamais** apparaître dans une
   vérification de droits. Consigné ici et en `COMMENT ON COLUMN` dans la
   migration, pour qu'aucune évolution future ne l'utilise par erreur.
3. Le téléchargement d'un conte acheté propose toutes les combinaisons
   disponibles **langue × format** (PDF, EPUB). Le fichier filigrané est généré
   par combinaison, à la demande. Chaque téléchargement est journalisé avec sa
   langue et son format.
4. Seules les versions linguistiques **publiées** sont accessibles. Une
   traduction en brouillon reste invisible, même pour un acheteur — d'où
   `book_translations.statut`.
5. Le prix ne dépend pas de la langue : `book_prices` est indexée sur
   `(book_id, zone)` uniquement, sans dimension linguistique. Un test vérifie
   que commander le même conte en français ou en anglais produit un montant
   identique.
6. Le lecteur permet de basculer de langue sans quitter la lecture dès que
   plusieurs versions publiées existent. La progression est conservée **par
   livre**, pas par langue — conforme à la clé `(user_id, book_id)` de §8.

### D3 — Le conte gratuit est un drapeau sur `books`

1. `gratuit` est une décision d'administration qui **prime sur les règles
   automatiques d'éligibilité** : un conte gratuit est lisible même s'il est
   encore dans sa fenêtre de vente exclusive de 3 mois. Cette primauté porte
   sur l'**octroi** de la lecture, pas sur l'ordre d'évaluation ni sur le
   libellé de `reason` — voir D5.
2. Le moteur accepte `userId = null`. `getAccess(null, bookId)` renvoie
   `canRead = true, canDownload = false, reason = 'free'` pour un conte gratuit,
   et `canRead = false, reason = 'preview'` sinon. Ce chemin anonyme a ses
   propres tests, **y compris au niveau RLS** : la fonction PostgreSQL doit
   gérer un appelant non authentifié.
3. `reason = 'free'` fait partie de l'énumération. Le téléchargement reste
   soumis à la règle générale : achat uniquement, jamais accordé par `gratuit`.
4. `gratuit` et `disponible_achat` sont indépendants. Un conte peut être lisible
   gratuitement en ligne **et** vendu au téléchargement — c'est la configuration
   recherchée pour le titre d'appel.
5. Plusieurs contes peuvent être gratuits simultanément. Le drapeau est
   modifiable à tout moment depuis le back-office : c'est un levier commercial,
   pas une propriété permanente.
6. **Limitation de débit obligatoire sur la lecture anonyme** : un livre entier
   accessible sans compte est une cible d'aspiration automatisée. Le nombre de
   pages servies par heure est limité par adresse IP pour les utilisateurs non
   authentifiés.
7. Les pages d'un conte gratuit passent par le **même** chemin protégé que les
   autres (URL signées) : un seul chemin de code, aucun bucket public. Seules la
   durée de validité et la mise en cache diffèrent (voir point ouvert P1 en §4).
8. La longueur de l'extrait des autres contes est portée par un champ par livre,
   `books.nb_pages_extrait`, avec valeur par défaut issue de la configuration —
   certains contes courts ne supportent pas qu'on en dévoile cinq pages.

### D4 — Tous les prix passent par `book_prices`

1. **`books.prix` est supprimé.** Aucune exception. Écart consigné en §2.3.
2. `book_prices (book_id, zone, montant, devise)` — `zone ∈ {international,
   afrique}`, `montant` en plus petite unité de la devise.
3. **Devises sans sous-unité** : le franc CFA (XAF, XOF) n'a pas de centimes.
   1 500 FCFA se stocke `1500`, 4,99 EUR se stocke `499`. Une table
   `currencies (code, decimals)` porte cette information et une **fonction
   unique de formatage** l'utilise. Aucune division par 100 codée en dur nulle
   part — une règle ESLint interdira le motif.
4. La devise n'est jamais déduite de la zone par une règle codée en dur : elle
   est stockée sur chaque ligne de `book_prices`, avec le montant. **Aucune
   conversion de taux de change à l'exécution** : chaque prix est écrit à la
   main pour sa zone. La zone `afrique` ne suppose donc pas une devise unique,
   XAF et XOF étant distinctes.
5. Deux résolutions de zone, distinctes :
   - **à l'affichage** — provisoire, depuis l'adresse IP ou un choix
     utilisateur, sans effet financier, modifiable par l'utilisateur ;
   - **à l'encaissement** — définitive, depuis le pays réel du moyen de
     paiement, enregistrée sur la commande.

   Si les deux divergent, le total est recalculé et **affiché avant
   confirmation**. Aucun montant n'est jamais modifié silencieusement.
6. `order_items` conserve `prix_unitaire`, `devise` et `zone` **au moment de
   l'achat** : une évolution de la grille tarifaire ne modifie aucune commande
   passée. Test dédié.
7. La zone d'un abonnement est **figée à la souscription**, jamais recalculée
   aux renouvellements.
8. Si un conte n'a pas de prix pour la zone résolue, on **retombe sur la zone
   internationale** plutôt que d'échouer.

---

## 4. Décisions complémentaires

### D5 — Sémantique exacte de `canRead`, `canDownload` et `reason`

Trois calculs **indépendants**, à ne jamais confondre :

1. **`canRead` — un OU logique entre toutes les sources de droit.** L'ordre
   d'évaluation n'a aucune importance. Les sources sont : le livre est
   `gratuit` ; un entitlement `achat` existe ; un entitlement `offert` existe ;
   un abonnement ouvre le droit (statut éligible **et** `inclus_abonnement`
   **et** hors fenêtre de 3 mois). La primauté de `gratuit` énoncée en D3
   signifie uniquement qu'un conte gratuit reste lisible **à l'intérieur** de sa
   fenêtre de vente de 3 mois.
2. **`canDownload` — indépendant de `reason`.** Il ne dépend que de l'existence
   d'un entitlement `achat` ou `offert` portant `peut_telecharger = true`.
   Jamais accordé par `gratuit`, jamais par un abonnement.
3. **`reason` — le titre le plus fort détenu par l'utilisateur**, dans cet
   ordre :

   ```
   purchase  >  granted  >  subscription  >  free  >  preview
   ```

   Un conte à la fois gratuit et acheté renvoie donc
   `{ canRead: true, canDownload: true, reason: 'purchase' }` : **un acheteur ne
   doit jamais voir « gratuit », il a payé.** Test dédié à l'étape 4.

   `none` est réservé au cas où le livre n'est pas exploitable du tout
   (brouillon ou archivé pour un non-admin) : `canRead = false`, pas même
   l'extrait. `preview` signifie que le livre est publié et que l'utilisateur y
   a droit à l'extrait, sans plus.

L'interface doit lire `canDownload`, jamais déduire un droit depuis `reason`.
C'est documenté sur le type `AccessDecision`.

### D6 — Durée des URL signées

La règle 3 de `CLAUDE.md` a été réécrite pour supprimer la contradiction avec
D3 point 7. Elle dit désormais :

> Les URL signées ont une durée de validité de 300 secondes maximum pour tout
> contenu payant, sans exception. Les titres marqués `gratuit = true` peuvent
> avoir une durée allongée, plafonnée à 3600 secondes, et être mis en cache CDN.
> La vérification des droits reste effectuée à chaque requête dans les deux cas.

Traduction technique : `SIGNED_URL_TTL` (défaut et plafond dur 300 s) pour tout
contenu protégé, `SIGNED_URL_TTL_FREE` (défaut et plafond dur 3 600 s) retenu
uniquement lorsque `gratuit = true`. Les deux plafonds sont appliqués dans le
code, pas seulement dans la configuration : une valeur d'environnement plus
élevée est ramenée au plafond, et un test le prouve. Le chemin de code reste
unique (§D3 point 7) : seuls la durée et l'en-tête de cache diffèrent.

---

## 5. Étapes

Chaque étape est terminée quand **toutes** ces conditions sont réunies :
`npm run verify` en code 0 ; tests du cas nominal **et** des cas d'erreur ; RLS
et test d'isolation pour toute nouvelle table ; validation Zod et test de rejet
pour toute nouvelle route ; aucun secret en dur, aucun `any` non justifié, aucun
`console.log` ; ce fichier à jour ; un commit git.

---

### Étape 0 — Socle technique

- [x] **Livrée le 2026-07-28** — `npm run verify` sort en code 0 (26 tests).
  **Non close** : le dernier critère, `npx supabase start`, est bloqué par le
  démon Docker, arrêté. L'étape sera cochée définitivement dès que la pile
  locale aura démarré et que `.env.local` aura été généré. Aucune étape
  suivante ne commence avant.
- [ ] **Objectif** — Un dépôt qui compile, se relit, se teste, et une pile
  Supabase locale qui démarre. Aucune logique métier.
- **Dépendances** — aucune (démon Docker requis pour la partie Supabase)
- **Fichiers produits**
  - `package.json`, `tsconfig.json` (strict, `noUncheckedIndexedAccess`),
    `eslint.config.mjs`, `vitest.config.ts`, `next.config.ts`, `.gitignore`
  - `.env.example` (repris de `env.example.txt`, complété par
    `SIGNED_URL_TTL_FREE`, `ANON_PAGE_RATE_LIMIT`), `.env.local` non versionné
  - `src/lib/config/env.ts` — validation de l'environnement par Zod, échec
    explicite au démarrage si une variable manque
  - `src/lib/clock/*` — `Clock`, `SystemClock`, `FixedClock`, `DevClock`
  - `src/lib/logger/*`
  - `supabase/config.toml`
  - `tests/unit/clock.test.ts`
- **Critères d'acceptation**
  ```bash
  npx supabase start          # la pile démarre, les clés sont affichées
  npm run typecheck           # code 0
  npm run lint                # code 0
  npm run test                # code 0
  npm run verify              # code 0
  ```

#### Décisions techniques prises à l'étape 0

| Décision | Raison |
|---|---|
| Versions retenues : Next 16.2, React 19.2, TypeScript 6.0, ESLint 10, Vitest 4, Zod 4 | Dernières versions stables au 2026-07-28 |
| Supabase CLI en dépendance de développement, pas d'installation globale | Version épinglée avec le dépôt ; aucun prérequis manuel |
| **Le plugin ESLint de Next.js n'est pas installé** | Le périmètre est backend : il n'y a pas de composants React à auditer. Le lint repose sur `typescript-eslint` en mode `recommendedTypeChecked` |
| `exactOptionalPropertyTypes` **non** activé | `strict` et `noUncheckedIndexedAccess` sont exigés et actifs ; cette option supplémentaire génère surtout du bruit sur les types tiers |
| `baseUrl` retiré de `tsconfig.json` | Déprécié en TypeScript 6 ; `paths` fonctionne seul |
| Clé `eslint` retirée de `next.config.ts` | Next 16 a supprimé l'intégration ESLint du build ; `npm run lint` reste la porte |
| Vitest en deux projets, avec `fileParallelism: false` sur `integration` | Les tests d'intégration partagent une base réelle : le parallélisme entre fichiers y créerait des courses sur les données de seed |
| `npm run test` porte `--passWithNoTests` | Le projet `integration` n'a pas encore de fichiers ; il en aura dès l'étape 1 |
| Le logger écrit par `process.stdout` / `process.stderr`, jamais par `console` | Permet d'interdire `console` par ESLint dans tout le dépôt, sans exception à concéder au logger lui-même |
| `getServerEnv()` est paresseuse et mémorisée | Un test unitaire de logique pure ne doit pas exiger une pile Supabase démarrée |
| Les plafonds d'URL signées sont appliqués par `transform` Zod, pas par un refus | Le plafond est la règle ; une configuration trop généreuse est ramenée au plafond au lieu d'empêcher le démarrage (D6) |
| Une page racine minimale existe dans `src/app` | `next build` exige une route. Ce n'est pas une interface : le périmètre reste backend |

**Garde-fous ESLint vérifiés par une sonde jetable** (fichier temporaire placé
dans `src/domain`, linté, puis supprimé) : import de `@supabase/*`, `new Date()`,
`Date.now()` et division par 100 déclenchent bien chacun une erreur.

---

### Étape 1 — Schéma de base de données, RLS, seeds

- [ ] **Objectif** — La totalité du modèle (§8, amendé par D1 à D4 et §2.2),
  RLS activée et refusante par défaut sur chaque table, jeu de démonstration
  couvrant tous les cas de figure.
- **Dépendances** — étape 0
- **Fichiers produits**
  - `0001_extensions.sql`
  - `0002_enums.sql` — `user_role`, `book_status`, `translation_status`,
    `subscription_status`, `order_status`, `entitlement_type` (**`achat` et
    `offert` uniquement**), `price_zone`, `access_reason`
  - `0003_profiles.sql` — profil adossé à `auth.users`, aucune donnée d'enfant
  - `0004_currencies.sql` — `currencies (code, decimals)`, alimentée avec EUR
    (2), XAF (0), XOF (0)
  - `0005_books.sql` — `books` (**sans `prix`**, avec `gratuit` et
    `nb_pages_extrait`), `book_translations` (avec `statut`), `book_prices`,
    `book_pages`
  - `0006_commerce.sql` — `carts`, `cart_items`, `orders` (avec `zone`),
    `order_items` (avec `devise`, `zone`, et `COMMENT ON COLUMN … langue`
    rappelant qu'elle est informative), `promo_codes`, `promo_redemptions`
  - `0007_access.sql` — `subscriptions` (avec `zone`), `entitlements` (avec
    `source_id` et l'**index unique** `(user_id, book_id, type, source_id)
    nulls not distinct`, D1 point 8), `reading_progress`, `download_logs`
    (avec `langue` et `format`)
  - `0008_infra.sql` — `webhook_events` (contrainte unique sur l'identifiant
    d'événement), `payment_events`, `email_log`, `ingestion_jobs`
  - `0009_app_now.sql` — table `dev_clock_activation` (**vide**, aucune ligne
    insérée par migration) et fonction `app_now()` (§2.5)
  - `0010_rls.sql` — activation et politiques, table par table
  - `supabase/seed.sql` — 8 contes minimum, tirés de `conte d'afrique/` :
    publié il y a plus de 3 mois et inclus dans l'abonnement ; publié il y a
    moins de 3 mois donc hors abonnement ; vendu à l'unité seulement ; inclus
    dans l'abonnement **et** vendu à l'unité ; gratuit ; gratuit **et** vendu ;
    brouillon ; archivé ; un titre avec ses deux versions linguistiques
    publiées et un titre dont la traduction anglaise est en brouillon. **C'est
    aussi le seul endroit qui insère la ligne de `dev_clock_activation`**
    (§2.5 a)
  - `src/lib/supabase/*` — fabriques de clients ; `service_role` illisible côté
    client
  - `src/lib/money/*` — formatage par `currencies`, aucune division par 100
  - `tests/integration/schema.test.ts`, `tests/unit/money.test.ts`,
    `tests/security/rls.test.ts`, `tests/security/app-now.test.ts`
- **Critères d'acceptation**
  ```bash
  npm run db:reset            # migrations + seeds rejoués sans erreur
  npm run test -- security    # A ne lit ni ne modifie les données de B
  npm run test -- money       # 1500 XAF → « 1 500 FCFA » ; 499 EUR → « 4,99 € »
  npm run test -- app-now     # (§2.5 c) sans l'artefact, app.now est ignoré
  npm run verify              # code 0
  ```
  Un test énumère `pg_tables` et échoue si une table de `public` n'a pas
  `rowsecurity = true`. Un autre échoue si une ligne `entitlements` porte un
  type autre que `achat` ou `offert`. Un troisième insère deux fois le même
  droit et vérifie que la base **rejette** le doublon (D1 point 8). Un
  quatrième parcourt les sources et échoue si `app.now` apparaît hors du seul
  module autorisé (§2.5 b).

---

### Étape 2 — Authentification

- [ ] **Objectif** — Inscription, connexion, vérification d'email,
  réinitialisation de mot de passe, rôles `user` / `admin`, sur Supabase Auth
  local.
- **Dépendances** — étape 1
- **Fichiers produits**
  - `src/app/api/auth/{register,login,logout,password/reset,password/update}/route.ts`
  - `src/lib/auth/*` — session serveur, gardes `requireUser` et `requireAdmin`
  - `0011_profile_trigger.sql` — création du profil à l'inscription, rôle `user`
    par défaut, jamais modifiable par l'utilisateur
  - `tests/integration/auth.test.ts`, `tests/security/role-escalation.test.ts`
- **Points de vigilance** — un utilisateur ne doit pas pouvoir se promouvoir
  `admin` : test dédié. Les emails de vérification arrivent dans l'interface de
  capture de Supabase local, pas dans `.mails/`.
- **Critères d'acceptation**
  ```bash
  npm run test -- auth        # inscription, connexion, mauvais mot de passe,
                              # email non vérifié, entrée Zod invalide rejetée
  npm run verify              # code 0
  ```

---

### Étape 3 — Adaptateurs locaux et console de simulation

- [ ] **Objectif** — Les contrats `PaymentProvider` et `Mailer`, leurs
  implémentations locales, et la console `/dev`. Aucune logique métier.
- **Dépendances** — étape 0 (étape 1 pour la lecture d'état par la console)
- **Fichiers produits**
  - `src/adapters/payment/types.ts` — `createCheckoutSession`,
    `createSubscription`, `cancelSubscription`, `refund`,
    `verifyWebhookSignature`, `parseEvent`. Événements normalisés, indépendants
    de tout prestataire.
  - `src/adapters/payment/fake/*` — émet de vrais événements HTTP signés vers
    `/api/webhooks/payments`
  - `src/adapters/mail/{types.ts,file-mailer.ts}` — un `.eml` horodaté par email
    dans `.mails/`
  - `src/adapters/registry.ts` — sélection par `PAYMENT_PROVIDER` et `MAILER`
  - `src/app/dev/**` et `src/app/api/dev/**` — payer / échouer / abandonner,
    souscrire, renouveler, échec de prélèvement, annuler, expirer, avancer
    l'horloge, lister les emails, réinitialiser la démonstration
  - `src/lib/crypto/webhook-signature.ts`
  - `tests/unit/webhook-signature.test.ts`,
    `tests/integration/dev-guard.test.ts`
- **Points de vigilance** — la console n'écrit jamais en base ; toute action
  passe par un événement signé. Toutes les routes `/dev` et `/api/dev`
  répondent 404 si `NODE_ENV === 'production'`, prouvé par un test.
- **Critères d'acceptation**
  ```bash
  npm run test -- dev-guard
  npm run test -- webhook-signature
  npm run verify              # code 0
  ```

---

### Étape 4 — Moteur de droits d'accès

- [ ] **Objectif** — La fonction unique qui répond à « cet utilisateur peut-il
  lire ce titre ? peut-il le télécharger ? ». Module qui concentre le risque du
  projet. Implémentation **en PostgreSQL** (D1 point 2).
- **Dépendances** — étapes 1, 3
- **Fichiers produits**
  - `0012_access_fn.sql` — `access_for(p_user uuid, p_book uuid,
    p_at timestamptz default app_now())` et
    `access_for_books(p_user uuid, p_books uuid[], p_at timestamptz default
    app_now())`, retournant `(canRead, canDownload, reason)`. Une seule
    implémentation ; la version par lot est une jointure, pas une boucle.
  - `0013_rls_access.sql` — les politiques RLS de `book_pages`,
    `reading_progress` et des routes de fichiers appellent `access_for`
  - `src/domain/access/types.ts` — `AccessDecision`, avec commentaire explicite :
    `canDownload` ne se déduit jamais de `reason` (P2)
  - `src/domain/access/index.ts` — `getAccess`, `getAccessForBooks`, appelants
    typés, **aucune règle réimplémentée**
  - `tests/unit/access-sql.test.ts`, `tests/integration/access.test.ts`,
    `tests/security/access-anon.test.ts`
- **Tests obligatoires** (non négociables)

  | Situation | Lecture | Téléchargement | `reason` |
  |---|---|---|---|
  | Abonné actif, titre inclus | oui | **non** | `subscription` |
  | Abonné actif, titre non inclus | non | non | `preview` |
  | Abonnement expiré, titre acheté | **oui** | **oui** | `purchase` |
  | Abonnement expiré, titre non acheté | non | non | `preview` |
  | Titre acheté, jamais abonné | oui | oui | `purchase` |
  | Visiteur non connecté | extrait seulement | non | `preview` |
  | Publié il y a moins de 3 mois, abonné actif | non | non | `preview` |
  | Publié il y a plus de 3 mois, abonné actif | oui | non | `subscription` |
  | Droit octroyé manuellement par un admin | oui | selon le droit | `granted` |

  Complétés par : conte gratuit et visiteur anonyme (`free`, lecture oui,
  téléchargement non) ; conte gratuit **dans** sa fenêtre de 3 mois (lisible
  quand même, D3 point 1) ; **conte gratuit et acheté → `{ canRead: true,
  canDownload: true, reason: 'purchase' }`** — un acheteur ne voit jamais
  « gratuit » (D5) ; conte gratuit et abonné actif → `reason = 'subscription'`
  si l'abonnement ouvre le droit, `free` sinon ; essai en cours (= actif) ; `impaye` pendant la
  grâce (accès maintenu) ; `impaye` après la grâce (accès retiré) ; `annule`
  avant `fin_periode` (accès maintenu) ; brouillon et archivé (jamais lisibles
  hors admin) ; un client anonyme ne peut pas influencer `app_now()` (§2.5) ;
  `getAccessForBooks` sur 40 titres exécute **une** requête et donne exactement
  les mêmes réponses que 40 appels unitaires. Tous les cas temporels sont testés
  en avançant l'horloge injectée.
- **Critères d'acceptation**
  ```bash
  npm run test -- access      # toute la matrice au vert
  npm run verify              # code 0
  ```

---

### Étape 5 — API catalogue

- [ ] **Objectif** — Liste paginée, filtres, tri, recherche, fiche détail,
  extraits, versions linguistiques.
- **Dépendances** — étapes 1, 4
- **Fichiers produits**
  - `src/app/api/catalog/route.ts` — filtres (âge, langue, thème, origine
    culturelle, type d'accès), tri (nouveautés, popularité, alphabétique, prix),
    pagination, recherche plein texte. L'état d'accès de chaque titre est
    résolu par `getAccessForBooks`, **un seul appel**.
  - `src/app/api/catalog/[slug]/route.ts` — fiche détail, versions
    linguistiques **publiées seulement**, suggestions, prix de la zone résolue
    à l'affichage (D4 point 5) avec repli sur `international` (D4 point 8)
  - `src/app/api/catalog/[slug]/excerpt/route.ts` — extrait de
    `nb_pages_extrait` pages, ouvert aux visiteurs
  - `src/domain/catalog/*`
  - `0014_catalog_search.sql`
  - `tests/integration/catalog.test.ts`
- **Points de vigilance** — brouillon et archivé ne sortent jamais du catalogue
  public ; une traduction en brouillon n'apparaît pas ; aucun chemin de fichier
  n'est divulgué ; le tri par prix s'appuie sur `book_prices` de la zone
  résolue.
- **Critères d'acceptation**
  ```bash
  npm run test -- catalog     # filtres, tri, pagination, recherche,
                              # paramètres invalides → 400,
                              # brouillon absent, traduction brouillon absente,
                              # 40 titres → 1 requête d'accès
  npm run verify              # code 0
  ```

---

### Étape 6 — Service de fichiers protégé

- [ ] **Objectif** — Buckets privés, droits vérifiés à chaque requête, URL
  signées courtes, limitation de débit sur la lecture anonyme.
- **Dépendances** — étapes 4, 5
- **Fichiers produits**
  - `0015_storage_buckets.sql` — buckets privés `book-sources`, `book-pages`,
    `book-downloads` ; `covers` public
  - `src/app/api/books/[id]/pages/[page]/route.ts` — une page, une URL signée,
    jamais le livre entier. **Chemin unique**, y compris pour les titres
    gratuits (D3 point 7)
  - `src/app/api/books/[id]/file/route.ts` — refusé sans `canDownload`
  - `src/lib/storage/signed-url.ts` — plafonds appliqués dans le code :
    300 s pour tout contenu payant, 3 600 s pour `gratuit = true` (D6)
  - `src/lib/http/rate-limit.ts` — limite par IP des pages servies aux
    utilisateurs non authentifiés (D3 point 6)
  - `tests/integration/files.test.ts`, `tests/security/files.test.ts`
- **Points de vigilance** — un abonné actif appelant la route de téléchargement
  reçoit 403 : test le plus important de l'étape. Aucune URL publique sur un
  fichier de livre.
- **Critères d'acceptation**
  ```bash
  npm run test -- files       # abonné → lecture oui, téléchargement 403 ;
                              # acheteur → les deux ; visiteur → extrait ;
                              # anonyme au-delà du quota → 429 ;
                              # TTL payant ≤ 300 s et TTL gratuit ≤ 3600 s,
                              #   même avec une variable d'environnement plus
                              #   élevée (D6)
  npm run verify              # code 0
  ```

---

### Étape 7 — Chaîne d'ingestion des PDF

- [ ] **Objectif** — Un PDF déposé produit automatiquement : analyse, pages
  WebP en deux résolutions, couverture, EPUB à mise en page fixe, couche texte,
  fiche en brouillon (§7.4).
- **Dépendances** — étapes 1, 6
- **Fichiers produits**
  - `src/domain/ingestion/analyze.ts` — `pdftotext`, nombre de pages,
    dimensions, présence d'une couche texte
  - `src/domain/ingestion/render-pages.ts` — `pdftoppm` puis `sharp`, deux
    résolutions
  - `src/domain/ingestion/cover.ts` — vignette, fiche, mise en avant
  - `src/domain/ingestion/epub.ts` — EPUB à mise en page fixe assemblé à la
    main (aucune dépendance AGPL), avec bloc de texte masqué accessible quand
    la couche texte existe
  - `src/domain/ingestion/pipeline.ts` — orchestration, reprise, journalisation
  - `src/app/api/admin/books/ingest/route.ts`
  - `tests/integration/ingestion.test.ts` — sur un PDF réel de
    `conte d'afrique/`
- **Points de vigilance** — sous-processus invoqués sans shell, arguments en
  tableau : aucune injection par un nom de fichier (les titres contiennent des
  apostrophes et des accents). L'EPUB doit s'ouvrir dans un lecteur standard.
- **Critères d'acceptation**
  ```bash
  npm run test -- ingestion   # un PDF de N pages → 2N images WebP,
                              # 3 formats de couverture, 1 EPUB valide,
                              # N pages de texte, 1 livre en brouillon
  npm run verify              # code 0
  ```

---

### Étape 8 — Panier et commandes

- [ ] **Objectif** — Panier multi-titres, commande en `en_attente`, calcul du
  montant selon la zone, code promotionnel.
- **Dépendances** — étapes 1, 5
- **Fichiers produits**
  - `src/app/api/cart/**`, `src/app/api/orders/**`
  - `src/domain/orders/pricing.ts` — résolution de zone (affichage vs
    encaissement, D4 point 5), repli sur `international`, aucune conversion de
    taux
  - `src/domain/orders/*` — total, code promotionnel, refus d'un titre déjà
    possédé
  - `tests/unit/order-total.test.ts`, `tests/integration/orders.test.ts`,
    `tests/security/orders.test.ts`
- **Points de vigilance** — le prix est **toujours** relu en base, jamais
  accepté du client. Une commande n'est jamais passée en `paye` ici.
- **Critères d'acceptation**
  ```bash
  npm run test -- orders      # panier, total, promo, prix falsifié rejeté,
                              # même conte en FR et en EN → montant identique,
                              # grille modifiée après coup → commande inchangée,
                              # zone d'encaissement ≠ affichage → total
                              #   recalculé et confirmation requise,
                              # A ne voit pas la commande de B
  npm run verify              # code 0
  ```

---

### Étape 9 — Paiement simulé et gestionnaire de webhooks

- [ ] **Objectif** — Tunnel branché sur `FakePaymentProvider`, vrai gestionnaire
  de webhooks : signature vérifiée, traitement idempotent, octroi atomique.
- **Dépendances** — étapes 3, 4, 8
- **Fichiers produits**
  - `src/app/api/checkout/route.ts`, `src/app/api/webhooks/payments/route.ts`
  - `src/domain/orders/fulfillment.ts` — passage en `paye` **et** création des
    entitlements dans une seule transaction
  - `0016_fulfillment_fn.sql` — fonction SQL transactionnelle
  - `tests/integration/webhooks.test.ts`
- **Tests obligatoires** — signature invalide → rejet, aucun droit ; même
  événement deux fois → traité une fois, aucun doublon ; **deux webhooks
  identiques traités en parallèle → l'un des deux échoue sur violation de
  l'index unique de `entitlements`, et un seul droit existe au final** (D1
  point 8 : la garantie est cherchée au niveau base, la déduplication en amont
  est délibérément désactivée le temps de ce test) ; paiement réussi → commande
  payée et droits créés atomiquement ; paiement échoué → aucun droit, commande
  `echoue` ; horodatage hors tolérance → rejet ; corps altéré après signature →
  rejet ; échec au milieu de l'octroi → rien n'est écrit.
- **Critères d'acceptation**
  ```bash
  npm run test -- webhooks
  npm run verify              # code 0
  ```

---

### Étape 10 — Cycle de vie des abonnements

- [ ] **Objectif** — `essai` → `actif` → renouvellement, échec de prélèvement,
  annulation, expiration. Tout déclenchable depuis la console, testable en
  avançant l'horloge.
- **Dépendances** — étapes 4, 9
- **Fichiers produits**
  - `src/domain/subscriptions/state-machine.ts` — transitions, fonction pure
  - `src/domain/subscriptions/handlers.ts` — réaction aux webhooks
  - `src/app/api/subscriptions/route.ts` — souscription, changement d'offre,
    annulation
  - `tests/unit/subscription-state.test.ts`,
    `tests/integration/subscriptions.test.ts`
- **Tests obligatoires** — essai de 7 jours puis `actif` ; échec de prélèvement
  → `impaye`, accès maintenu pendant `PAYMENT_GRACE_PERIOD_DAYS` puis retiré ;
  annulation → accès maintenu jusqu'à `fin_periode` puis retiré ; expiration →
  lecture par abonnement perdue, **achats toujours accessibles** (le bug
  classique, test dédié) ; zone figée à la souscription et inchangée après
  renouvellement (D4 point 7).
- **Critères d'acceptation**
  ```bash
  npm run test -- subscription
  npm run verify              # code 0
  ```

---

### Étape 11 — Téléchargement filigrané

- [ ] **Objectif** — Fichier filigrané généré à la demande par combinaison
  langue × format, journalisé, avec limitation de débit (§9.4, §10.2).
- **Dépendances** — étapes 6, 9
- **Fichiers produits**
  - `src/domain/downloads/watermark.ts` — `pdf-lib`, filigrane discret (email
    de l'acheteur + référence de commande)
  - `src/domain/downloads/service.ts` — cache **indexé par utilisateur**,
    journalisation avec langue et format, quota par période
  - `src/app/api/downloads/[bookId]/route.ts` — paramètres `langue` et `format`
    validés par Zod
  - `tests/integration/downloads.test.ts`
- **Points de vigilance** — le filigrane porte l'email de l'acheteur : ce
  fichier ne doit jamais être servi à un autre utilisateur. Test dédié. Une
  traduction en brouillon n'est jamais téléchargeable, même par un acheteur
  (D2 point 4).
- **Critères d'acceptation**
  ```bash
  npm run test -- downloads   # abonné → 403 ; acheteur → PDF et EPUB, FR et EN ;
                              # traduction brouillon → 404 ;
                              # journal renseigné avec langue et format ;
                              # quota dépassé → 429 ;
                              # fichier de A jamais servi à B
  npm run verify              # code 0
  ```

---

### Étape 12 — Progression de lecture

- [ ] **Objectif** — Enregistrer et relire la dernière page atteinte, par livre
  et non par langue (D2 point 6).
- **Dépendances** — étapes 4, 6
- **Fichiers produits**
  - `src/app/api/reading-progress/route.ts` (GET, PUT)
  - `tests/integration/reading-progress.test.ts`,
    `tests/security/reading-progress.test.ts`
- **Points de vigilance** — pas de progression sur un livre qu'on n'a pas le
  droit de lire ; page hors bornes rejetée ; changer de langue conserve la
  progression ; A ne lit ni n'écrit la progression de B.
- **Critères d'acceptation**
  ```bash
  npm run test -- reading-progress
  npm run verify              # code 0
  ```

---

### Étape 13 — API d'administration

- [ ] **Objectif** — Catalogue, utilisateurs, commandes, codes promotionnels
  (§4.3 F10 à F12).
- **Dépendances** — étapes 2, 7, 8, 10
- **Fichiers produits**
  - `src/app/api/admin/books/**` — création, modification, publication,
    archivage, versions linguistiques et leur statut, prix par zone, bascule du
    drapeau `gratuit` (D3 point 5)
  - `src/app/api/admin/users/**` — recherche, suspension, octroi manuel
    (`type = 'offert'`)
  - `src/app/api/admin/orders/**` — liste, remboursement
  - `src/app/api/admin/promos/**`
  - `tests/integration/admin.test.ts`, `tests/security/admin.test.ts`
- **Points de vigilance** — chaque route admin est refusée à un utilisateur
  ordinaire (403) et à un visiteur (401) : test **route par route**, pas un
  test global.
- **Critères d'acceptation**
  ```bash
  npm run test -- admin
  npm run verify              # code 0
  ```

---

### Étape 14 — Statistiques agrégées

- [ ] **Objectif** — Chiffre d'affaires par période et par flux, abonnés actifs,
  inscriptions, résiliations, titres les plus lus et achetés, répartition
  linguistique (§4.3 F13).
- **Dépendances** — étapes 10, 13
- **Fichiers produits**
  - `src/app/api/admin/stats/route.ts`, `src/domain/stats/*` — agrégations SQL,
    jamais en mémoire
  - `tests/integration/stats.test.ts`
- **Points de vigilance** — revenu d'abonnement et revenu unitaire strictement
  séparés ; les montants de devises différentes ne sont **jamais additionnés**
  (D4 point 4 : aucune conversion à l'exécution) — l'agrégation est ventilée par
  devise ; bornes de période lues via l'horloge injectée.
- **Critères d'acceptation**
  ```bash
  npm run test -- stats       # chiffres attendus sur un jeu figé,
                              # EUR et XAF jamais additionnés
  npm run verify              # code 0
  ```

---

### Étape 15 — Emails transactionnels

- [ ] **Objectif** — Confirmation de commande, bienvenue d'abonnement, échec de
  prélèvement, liens de téléchargement, via `FileMailer`.
- **Dépendances** — étapes 3, 9, 10, 11
- **Fichiers produits**
  - `src/domain/mail/templates/*` — modèles bilingues, choisis d'après
    `langue_preferee`
  - `src/domain/mail/dispatch.ts` — émission consécutive aux événements métier,
    jamais bloquante pour la transaction
  - `tests/integration/mail.test.ts`
- **Points de vigilance** — un email ne contient jamais d'URL signée durable :
  il renvoie vers la bibliothèque, qui régénère l'URL à la demande. Un échec
  d'envoi n'annule jamais un droit déjà acquis. Les montants sont formatés par
  la fonction unique de `src/lib/money`.
- **Critères d'acceptation**
  ```bash
  npm run test -- mail        # un paiement réussi écrit un .eml dans .mails/,
                              # dans la langue du destinataire,
                              # montant correctement formaté en EUR et en XAF
  npm run verify              # code 0
  ```

---

### Étape 16 — Durcissement et parcours de bout en bout

- [ ] **Objectif** — Revue de sécurité, limitation de débit globale, gestion
  homogène des erreurs, et les deux parcours complets pilotés par la console.
- **Dépendances** — toutes les précédentes
- **Fichiers produits**
  - `src/lib/http/rate-limit.ts` étendu — par IP et par utilisateur, en-têtes
    standard
  - `src/lib/http/error-handler.ts` — aucune fuite de détail interne
  - `src/app/api/health/route.ts`
  - `tests/e2e/purchase-journey.test.ts` — inscription → panier → paiement →
    droits → téléchargement filigrané → journal
  - `tests/e2e/subscription-journey.test.ts` — inscription → abonnement →
    lecture → avance de l'horloge → renouvellement → échec → grâce →
    expiration → **les achats restent accessibles**
  - `docs/SECURITY-REVIEW.md`
  - Section « Brancher un prestataire réel » ci-dessous, complétée
- **Critères d'acceptation**
  ```bash
  npm run test -- e2e
  npm run build               # code 0
  npm run verify              # code 0
  ```

---

## 6. Ce que je ne ferai pas sans votre accord

- Modifier `docs/cahier-des-charges.md`
- Installer un SDK de service externe
- Ajouter une dépendance non permissive
- Inventer une règle métier absente de la spécification : je m'arrête et je
  demande
- Désactiver ou ignorer un test pour faire passer `npm run verify`

---

## 7. Modifications rétroactives

*(section alimentée si une étape déjà validée doit être reprise ; chaque entrée
indique la raison, la portée et le résultat de `npm run verify` relancé en
entier)*

Aucune à ce jour.

---

## 8. Brancher un prestataire réel

*(section rédigée à l'étape 16)*
