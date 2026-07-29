# PLAN.md — Plan d'implémentation du backend

Document de pilotage. Il est mis à jour à la fin de chaque étape (case cochée,
décisions techniques, modifications rétroactives).

- Spécification de référence : `docs/cahier-des-charges.md` (fait foi)
- Contexte permanent : `CLAUDE.md`
- Porte de validation d'une étape : `npm run verify` doit sortir en code 0

**Statut global : plan validé le 2026-07-28. Étapes 0 à 6 terminées. Prochaine étape : 7.**
Décisions métier arrêtées en §3 (D1 à D4) et §4 (D5, D6). La règle 3 de
`CLAUDE.md` a été réécrite en conséquence (D6).

---

## 1. État des lieux constaté

| Point | Constat |
|---|---|
| Node | v22.17.0 — conforme (Node 20+) |
| npm | 10.9.2 |
| git | 2.51.2 — **le dossier n'est pas encore un dépôt git** (`git init` à l'étape 0) |
| Docker | client 29.2.1 — démon opérationnel depuis le 2026-07-28, voir l'incident de poste à l'étape 0 |
| Supabase CLI | en dépendance de développement, pile locale démarrée (PostgreSQL 17.6) |
| poppler | `pdftoppm` 25.07.0 disponible dans le PATH — conforme à l'étape 7 |
| `.env.local` | généré le 2026-07-28, non versionné (vérifié par `git check-ignore`) |
| Contenu de test | `conte d'afrique/` contient 16 PDF, 16 EPUB et 16 couvertures — matière réelle pour l'étape 7 et les seeds |
| Projet Node | aucun `package.json` — le socle est à créer intégralement |

**Prérequis levés le 2026-07-28** : Docker démarré, pile Supabase locale en
marche, `.env.local` généré. Les tests d'intégration peuvent désormais tourner
contre la vraie base locale, comme l'exige CLAUDE.md.

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
| `book_pages` : protection **applicative** et non plus seulement base | **écart assumé avec la règle de sécurité n°1 de CLAUDE.md** | Voir §2.6 ci-dessous |
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

### 2.6 `book_pages` — écart assumé avec la règle de sécurité n°1

**Ce qui est vrai.** `book_pages` a RLS activée et une politique de refus total.
Aucun client `anon` ou `authenticated` ne l'atteint : ni privilège `SELECT`, ni
politique permissive. De ce côté, la protection est intacte.

**Ce qui ne l'est pas.** Le serveur y accède avec `service_role`, qui contourne
RLS par construction. Sur cette table — la plus sensible du schéma, puisqu'elle
porte le contenu vendu — **la base ne rattrape donc pas une erreur applicative**.
Une requête serveur qui oublierait de vérifier les droits obtiendrait les pages.

C'est un écart avec la règle n°1 de `CLAUDE.md`, et il doit rester visible.

**La compensation, architecturale.** Un point de passage unique,
`src/lib/content/page-service.ts`, où la vérification par `access_for` est
intégrée et placée **avant** toute lecture de contenu. Il est impossible
d'obtenir une page sans traverser le contrôle, parce qu'aucun autre chemin
n'existe.

**Ce qui rend la règle réelle plutôt que verbale :**
`tests/unit/book-pages-architecture.test.ts` parcourt `src/**` et échoue si un
autre fichier référence `book_pages`. Vérifié par une sonde jetable : un fichier
tiers mentionnant la table fait tomber le test, qui redevient vert une fois la
sonde retirée. Sans ce test, la protection du contenu ne reposerait que sur la
mémoire du prochain développeur.

Un troisième contrôle vérifie que l'appel à `getAccess` **précède** la lecture
dans le fichier : lire puis filtrer laisserait une fenêtre où le contenu est en
mémoire, et un `return` oublié suffirait à le laisser sortir.

**Option plus forte, chiffrée pour l'étape 16.** Voir l'estimation en fin
d'étape 16.

### 2.7 Signature des webhooks

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

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 (26 tests),
  la pile Supabase locale tourne, `.env.local` est généré.
- **Objectif** — Un dépôt qui compile, se relit, se teste, et une pile
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

#### Incident de poste — Supabase Studio désactivé

Le disque `C:` est arrivé à saturation pendant le premier
`npx supabase start`. Docker a alors écrit des couches d'images tronquées.
Conséquence durable : dans l'image `supabase/studio`, le fichier
`/usr/local/bin/docker-entrypoint.sh` fait **0 octet** tout en restant marqué
exécutable, ce que Linux signale par `exec format error`. Le conteneur échoue
en boucle et fait échouer `supabase start` en entier.

Supprimer puis retélécharger l'image ne corrige rien : le magasin de contenu de
containerd conserve le blob tronqué et le réutilise — c'est aussi pourquoi
l'espace disque libéré par la suppression n'était pas revenu.

Les huit autres images de la pile ont été vérifiées une par une : toutes saines.

**Décision : `[studio] enabled = false` dans `supabase/config.toml`**, motif
écrit dans le fichier. L'interface d'administration web n'a aucun rôle dans un
chantier backend — psql et les tests d'intégration inspectent la base. La
capture d'emails (`mailpit`, port 54324) reste active : elle sert à l'étape 2.

**Dette de poste à solder, hors périmètre projet :** réparer le blob exige de
purger le stockage Docker (Docker Desktop → Troubleshoot → Clean / Purge data),
ce qui détruirait les volumes des projets `archora` et `atlink` présents sur la
machine. À faire après sauvegarde de ces volumes. Studio se réactive ensuite en
repassant le drapeau à `true`.

Note secondaire : le conteneur `vector` (collecteur de journaux) redémarre en
boucle. Il n'a aucun rôle fonctionnel ici et ne bloque ni la base, ni
l'authentification, ni le stockage. À regarder si les journaux deviennent utiles.

---

### Étape 1 — Schéma de base de données, RLS, seeds

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 : 96 tests,
  dont 52 d'intégration et de sécurité contre la base locale réelle. Cycle
  complet rejoué depuis une base vierge (`db:reset` puis `db:seed` puis
  `verify`).
- **Objectif** — La totalité du modèle (§8, amendé par D1 à D4 et §2.2),
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

#### Décisions techniques prises à l'étape 1

| Décision | Raison |
|---|---|
| `app_now()` remonté en migration 0002, avant toutes les tables | Les colonnes horodatées prennent `app_now()` comme valeur par défaut. Une ligne insérée sans horodatage explicite pendant un test à horloge décalée porterait sinon l'heure réelle. Une fonction ne peut pas servir de défaut avant d'exister |
| Migrations nommées `202607280000NN_nom.sql` | Convention d'horodatage attendue par la CLI Supabase, tout en restant lisiblement séquentielles |
| Le déclencheur de création de profil est livré à l'étape 1, non à l'étape 2 | La table `users` et le mécanisme qui la peuple forment un tout. Sans lui, aucun test de sécurité ne pourrait créer d'utilisateur par le chemin réel |
| Table nommée `public.users`, et non `profiles` | §8.1 la nomme ainsi et la spécification fait foi. Elle est adossée à `auth.users`, qui reste la source de vérité de l'authentification |
| `public.users.suspendu` ajouté | §4.3 F11 prévoit la suspension d'un compte. L'ajouter maintenant évite une migration corrective à l'étape 13 |
| Sécurité en **deux barrières** : privilèges ET politiques | Une politique oubliée sur une table laisse tout passer si le privilège subsiste ; un privilège de lecture expose toutes les lignes sans RLS. Les deux sont posées dans la seule migration 0010, pour que le modèle se relise d'un tenant |
| `alter default privileges … revoke all` sur les tables futures | Toute table créée par une migration ultérieure sera muette par défaut. Un oubli d'octroi devient visible, au lieu d'ouvrir silencieusement l'accès |
| Le rôle et la suspension sont protégés par le **privilège de colonne**, pas par RLS | Une politique RLS agit sur les lignes, jamais sur les colonnes. `grant update (nom_complet, langue_preferee)` est la seule façon d'empêcher un utilisateur de se promouvoir administrateur |
| Aucun privilège d'écriture sur `orders` pour un client | Structurant : une commande est créée par le serveur, qui relit les prix en base. Le client ne peut donc pas soumettre son propre montant |
| `publie_le` en `timestamptz` alors que §8.1 dit `date` | La fenêtre de 3 mois se teste en déplaçant l'horloge à la seconde près |
| Types TypeScript générés depuis la base (`npm run db:types`) | Une requête mal orthographiée devient une erreur de compilation. C'est aussi ce qui a permis de supprimer les `any` que le lint refusait |
| Suppression d'un utilisateur en cascade sur ses commandes | Cohérent avec le droit à l'effacement (§11.2). **À arbitrer avant production** : la conservation des factures répond à des obligations comptables qui peuvent contredire cette cascade |
| `applyPercentage` porte le seul `eslint-disable` du dépôt | Le 100 y est un diviseur de pourcentage, pas une conversion de devise. La levée est locale, commentée et unique |

**Ce que les tests prouvent, au-delà du dénombrement :** aucune table du schéma
`public` sans RLS ni sans politique explicite (vérifié par énumération de
`pg_tables`, pas par relecture) ; un utilisateur ne peut ni s'octroyer un droit,
ni se promettre le téléchargement, ni se promouvoir administrateur, ni créer une
commande, ni prolonger son abonnement, ni lire quoi que ce soit d'un autre ; le
rejeu d'un même octroi échoue au niveau base, y compris pour deux octrois
manuels dont l'origine est nulle ; et `app_now()` ignore le décalage d'horloge
dès que l'artefact d'activation est absent.

---

### Étape 2 — Authentification

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 : 142 tests.
  Cycle rejoué depuis une base vierge, `npm run build` vert, six routes servies.
- **Objectif** — Inscription, connexion, vérification d'email,
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

#### Décisions techniques prises à l'étape 2

| Décision | Raison |
|---|---|
| Les gestionnaires sont des fonctions `Request → Response`, sans `next/headers` | Un test les appelle directement, sans démarrer de serveur : c'est le vrai code qui est éprouvé, et la suite reste rapide. Les cookies sont lus dans l'en-tête de la requête et posés sur la réponse |
| Jeton porté par l'en-tête **et** par un cookie `HttpOnly` | L'en-tête est le porteur naturel d'une API ; le cookie existe parce que la console `/dev` est servie dans un navigateur, qui ne pose pas d'en-tête d'autorisation sur une navigation ordinaire. `SameSite=Lax` neutralise l'essentiel du CSRF (§5.2) |
| Le rôle n'est **jamais** lu depuis les métadonnées du jeton | Ces métadonnées sont modifiables par le client via l'API d'Auth. Le rôle vient de `public.users`, relu à chaque requête. Un test écrit `role: admin` dans les métadonnées et vérifie que `/me` répond toujours `user` |
| Le profil est relu **à chaque requête** | CLAUDE.md règle 4. C'est ce qui permet à une suspension de prendre effet immédiatement, alors que le jeton reste cryptographiquement valide |
| Limitation des tentatives avancée de l'étape 16 à l'étape 2 | §5.2 l'exige explicitement pour la connexion. La clé combine IP et email : par IP seule un réseau partagé bloquerait des innocents, par email seul n'importe qui verrouillerait le compte d'autrui. La tentative refusée n'est pas comptée, sinon l'insistance prolongerait le blocage |
| Mot de passe : 10 caractères, au moins une lettre et un chiffre | Le compte porte des moyens de paiement et une bibliothèque achetée. La règle est posée deux fois — Zod pour expliquer le refus en français, `config.toml` pour que Supabase l'applique par tout autre chemin |
| Déconnexion et changement de mot de passe passent par l'API d'administration | `signOut()` et `updateUser()` de supabase-js s'appuient sur une session interne, qu'un client construit à partir du seul en-tête d'autorisation ne possède pas : ils échouaient silencieusement. **Vérifié empiriquement** : avec `admin.signOut`, le jeton est refusé dès l'appel suivant ; sans lui, il reste accepté |
| `email_sent` relevé à 200 dans `config.toml` | La suite crée des dizaines de comptes, chacun déclenchant un email de vérification. À 2 par heure, les tests échouaient en 429 sans qu'aucun défaut applicatif soit en cause. Valeur locale uniquement, les emails ne quittent pas la machine |

**Trouvaille de sécurité, remontée par un test de l'étape :** une seconde
inscription sur une adresse déjà connue renvoyait 429, tandis qu'une adresse
nouvelle renvoyait 201 — il suffisait de comparer les codes de réponse pour
savoir si une adresse possède un compte. La limite de fréquence des emails de
confirmation est désormais traitée comme un succès, et un test compare les deux
réponses **octet par octet**. La même précaution vaut pour la demande de
réinitialisation, qui répond 204 dans tous les cas, et pour la connexion, dont
le message ne distingue pas un mot de passe faux d'une adresse inconnue.

---

### Étape 3 — Adaptateurs locaux et console de simulation

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 : 204 tests.
  Cycle rejoué depuis une base vierge, `npm run build` vert et sans
  avertissement.
- **Objectif** — Les contrats `PaymentProvider` et `Mailer`, leurs
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

#### Décisions techniques prises à l'étape 3

| Décision | Raison |
|---|---|
| Transport HTTP **injectable** dans `FakePaymentProvider` | Le vrai gestionnaire de webhooks n'arrive qu'à l'étape 9. Les tests capturent la requête émise et vérifient sa signature avec le module réel, sans dépendre d'un récepteur qui n'existe pas encore |
| Le corps est sérialisé **une seule fois** | C'est cette chaîne exacte qui est signée puis transmise. Re-sérialiser après signature change l'ordre des clés et les espaces, donc les octets, donc la signature : c'est l'erreur classique de ce montage, et un test la reproduit délibérément |
| Identifiant d'événement imposable (`id`) | Permet de rejouer un événement à l'identique depuis la console, donc d'éprouver l'idempotence pour de bon à l'étape 9 |
| Aucun type du contrat ne nomme un prestataire | §7.3.4. Un type qui s'appellerait `StripeSession` ferait entrer sa terminologie dans toute la base de code. Le vocabulaire retenu est celui du métier, en français |
| `FileMailer` écrit du `.eml` RFC 5322, non du JSON | Un JSON maison serait plus simple, mais on ne verrait pas ce que le destinataire verra. En-têtes accentués encodés selon la RFC 2047, sans quoi « Votre commande est prête » s'affiche en caractères illisibles |
| La console lit la base, mais n'y écrit qu'à la remise à zéro | Voir ci-dessous |
| Refus en **404**, non en 403 | En production ces routes ne doivent pas seulement être interdites : elles ne doivent pas exister. Un 403 confirmerait à un visiteur qu'une console de simulation est déployée. Un test vérifie en plus que le corps du refus ne contient ni « dev », ni « simulation », ni « console » |
| Le garde-fou lit `process.env` directement | Et non l'environnement validé et mémorisé : il doit rester exact quelle que soit l'ordre de lecture de la configuration, et être vérifiable par un test qui bascule la variable |

**L'exception assumée sur la remise à zéro.** `CLAUDE.md` pose que la console ne
modifie jamais la base directement. Cette règle vise les **transitions
métier** — payer, souscrire, annuler — qui passent toutes par un événement
signé, sans exception. Remettre le jeu de démonstration à zéro n'est pas une
transition métier : c'est l'équivalent de `npm run db:reset`, en plus rapide.
Une console dotée d'un bouton « réinitialiser » qui ne réinitialise rien ne
servirait à personne. Deux garde-fous encadrent l'exception : la fonction SQL
refuse de s'exécuter si l'artefact `dev_clock_activation` est absent — donc sur
toute base où les seeds de développement n'ont pas été joués — et elle n'efface
aucune donnée de catalogue. Les deux sont testés.

**Deux obstacles rencontrés, tous deux instructifs.**

- **`pg_safeupdate`.** Supabase l'active sur le rôle de l'API : tout `DELETE` ou
  `UPDATE` sans clause `WHERE` y est refusé, garde-fou contre l'effacement
  accidentel d'une table entière. La fonction de remise à zéro en fait quatorze,
  délibérément : chacune porte désormais un `where true` explicite, et le
  commentaire de la migration dit pourquoi.
- **Traçage de fichiers de Next.** Un `path.join(process.cwd(), …)` dynamique
  dans `FileMailer` faisait embarquer tout le projet dans le bundle. Corrigé par
  le commentaire d'exclusion documenté par Next ; le build ne produit plus
  aucun avertissement.

**Transparence sur la méthode.** La migration 0015 a été corrigée **en place**
après l'échec dû à `pg_safeupdate`, comme les migrations 0012 à 0014 avant elle :
jamais commitée, jamais appliquée ailleurs que sur la base locale, rejouée
intégralement depuis zéro. La règle « jamais de migration modifiée après
application » reste entière pour tout ce qui est commité (voir R1).

---

### Étape 4 — Moteur de droits d'accès

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 : 261 tests,
  dont 37 pour la seule matrice de droits. Cycle rejoué depuis une base vierge,
  `npm run build` vert.
- **Objectif** — La fonction unique qui répond à « cet utilisateur peut-il
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

#### Décisions techniques prises à l'étape 4

| Décision | Raison |
|---|---|
| `access_for_books` est l'**implémentation de référence**, `access_for` un simple raccourci | Il ne doit exister qu'une écriture des règles. Un test compare les deux sur tout le catalogue, titre par titre |
| Les fonctions sont `security definer` | Elles lisent `entitlements` et `subscriptions`, tables auxquelles `anon` n'a aucun accès. Sans cela, un visiteur ne pourrait jamais lire un conte gratuit |
| Table `business_settings` : **source unique**, fenêtre de 90 jours, grâce de 7 jours | Une politique RLS ne peut pas lire l'environnement du processus Node. Les variables `NEW_RELEASE_WINDOW_DAYS` et `PAYMENT_GRACE_PERIOD_DAYS` ont été **retirées** : les conserver en aurait fait une seconde source, que seul un test de concordance aurait surveillée — c'est-à-dire qu'il aurait constaté la divergence une fois installée, au lieu de la rendre impossible. L'application lit la table, avec un cache de 30 secondes invalidé à l'écriture |
| Bornes des paramètres métier en base, par contrainte `CHECK` | Fenêtre 0–730 jours, grâce 0–90 jours. Un formulaire d'administration se contourne : par un appel direct, un script de reprise ou une console. La contrainte, elle, tient |
| Table d'audit `business_settings_audit` | Ces réglages ont un effet commercial direct : savoir qui les a changés, quand et depuis quelles valeurs n'est pas un luxe. Le déclencheur ne trace que les changements réels de valeur |
| Fonction `titres_impactes_par_fenetre` | **Effet rétroactif** : modifier la fenêtre fait basculer, à la seconde, des titres vendus à l'unité vers la lecture incluse — sans migration ni déploiement. L'écran d'administration (étape 13) doit afficher ce nombre AVANT validation, dans les deux sens : titres qui entrent, titres qui sortent |
| `access_for` est `security definer` | Elle doit pouvoir lire `business_settings` quel que soit le rôle appelant, y compris `anon`. Le jour où le privilège de lecture publique serait retiré, rien ne doit cesser de fonctionner pour un visiteur |
| `src/domain/access` ne contient **que des types** | Un test parcourt le répertoire et échoue s'il y trouve `inclus_abonnement`, `peut_telecharger`, un calcul de fenêtre ou de grâce, ou seulement une fonction exportée — la tentation d'y glisser un calcul viendrait avec la première fonction |
| L'appelant TypeScript vit dans `src/lib/access` | `src/domain` ne connaît ni Next, ni Supabase (règle ESLint). L'appelant doit parler à la base : sa place est dans `lib` |
| Une erreur de résolution **lève**, elle n'ouvre pas | Un moteur de droits en panne doit refuser. Test dédié avec un client simulé en échec |
| `book_pages` reste **totalement fermé** aux clients | On aurait pu y poser une politique appelant `access_for` ; ce serait plus faible que l'existant, puisque aucun privilège `SELECT` n'y est accordé. Ouvrir la table exposerait les chemins de stockage |
| `reading_progress` en écriture appelle `access_for` | Sans cette condition, la table deviendrait un journal des titres qu'on a tenté d'ouvrir sans y avoir droit, et un moyen de tester l'existence d'un identifiant |
| Les favoris n'exigent **pas** l'accès au titre | On met en favori ce qu'on envisage d'acheter. Seule condition : le titre est au catalogue, sinon les favoris révéleraient les titres en préparation |

**Une interprétation que je signale.** Le plan disait « brouillon ou archivé,
jamais lisible hors admin ». Appliqué tel quel à un titre **archivé**, cela
contredirait §3.1, qui promet à l'acheteur un accès « sans limite de durée ».
Retirer un titre du catalogue est une décision éditoriale : elle ne peut pas
révoquer un droit payé, ce serait un manquement au contrat de vente. La règle
retenue, et testée :

| Statut | Acheteur | Abonné | Visiteur |
|---|---|---|---|
| `publie` | lecture et téléchargement | selon fenêtre et inclusion | extrait |
| `archive` | **lecture et téléchargement conservés** | rien | rien (`none`) |
| `brouillon` | rien, même avec un droit | rien | rien (`none`) |

Un titre en brouillon n'a jamais été vendu : un droit portant sur lui serait une
anomalie, et n'ouvre donc pas l'accès. Un test le vérifie.

**Ce que la matrice prouve, au-delà des neuf cas obligatoires :** essai valant
abonnement actif ; impayé conservant l'accès pendant la grâce puis le perdant ;
annulation tenant jusqu'à la fin de période payée ; abonnement `actif` dont la
période est échue n'ouvrant plus rien ; droits à durée limitée expirés ;
ouverture de la fenêtre de vente **au jour près** ; conte gratuit à l'intérieur
de sa fenêtre ; conte gratuit **et** acheté renvoyant `purchase` — un acheteur
ne voit jamais « gratuit » ; conte gratuit **et** couvert par l'abonnement
renvoyant `subscription` ; et le pont complet `DevClock` → paramètre de session
→ `app_now()` → `access_for`, qui fait basculer la fenêtre de 3 mois en
déplaçant l'horloge.

**Un test m'a repris pendant l'écriture.** Le contrôle d'ouverture de la fenêtre
échouait à +70 jours : mon abonné de test avait une période de 30 jours, donc
échue avant même que la fenêtre s'ouvre. Le scénario était contradictoire, pas
le moteur.

---

### Étape 5 — API catalogue

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 : 323 tests,
  dont 44 pour le seul catalogue. Cycle rejoué depuis une base vierge,
  `npm run build` vert.
- **Objectif** — Liste paginée, filtres, tri, recherche, fiche détail,
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

#### Décisions techniques prises à l'étape 5

| Décision | Raison |
|---|---|
| La liste est une **fonction PostgreSQL**, pas une requête assemblée en TypeScript | La recherche plein texte doit passer par les index GIN, ce qu'un filtre appliqué après coup ne permet pas ; le total de pagination doit être calculé dans la même passe, sinon c'est un aller-retour de plus à chaque page ; et le repli de prix d'une zone sur l'autre est une jointure, pas une boucle |
| Deux vecteurs de recherche, sur `books` et sur `book_translations` | Les termes cherchés vivent dans deux tables : titre et résumé dépendent de la langue, auteur et origine culturelle appartiennent au livre |
| Configuration `french` pour la recherche | Sans elle, « animaux » et « animal » seraient deux termes sans rapport, et une recherche sur l'un manquerait l'autre |
| Fonction `themes_texte` déclarée immuable | `array_to_string` est marquée *stable* dans PostgreSQL parce qu'elle accepte `anyarray`. Sur `text[]` le résultat est déterministe : l'enveloppe restreint la signature et peut donc être immuable sans mentir — ce que la colonne générée exige |
| Un **départage stable** clôt tous les tris | Sans lui, deux titres de même rang peuvent s'échanger entre deux requêtes : un titre apparaîtrait en double d'une page à l'autre, un autre disparaîtrait |
| Le filtre `acces=abonnement` applique la **fenêtre de vente** | « Accessible par abonnement » signifie accessible maintenant. Lister un titre encore en vente exclusive comme inclus serait une promesse fausse |
| Une entrée sans traduction publiée dans la langue demandée **n'apparaît pas** | Il n'y aurait rien à afficher. C'est aussi ce qui garde une traduction en brouillon hors du catalogue |
| Brouillon, archivé et slug inconnu renvoient tous **404** | Du point de vue d'un visiteur, les trois doivent se ressembler : sinon le catalogue à venir serait devinable un slug à la fois |
| Le catalogue n'expose **aucun chemin de stockage** | Un test cherche `fichier_lecture`, `fichier_telechargement` et `chemin_haute` dans la réponse brute |
| La zone est un paramètre d'**affichage** | Provisoire et sans effet financier (D4 point 5). La zone d'encaissement est déterminée au paiement, depuis le pays réel du moyen de paiement |
| L'extrait délègue au service de pages | Il ne réimplémente ni la longueur de l'extrait ni le contrôle d'accès : ce sont les mêmes règles qui servent le lecteur en ligne |
| Limitation de débit sur la lecture **anonyme** | D3 point 6. Un utilisateur connecté est déjà identifiable et traçable ; un visiteur ne l'est pas, et un conte gratuit entier est une cible d'aspiration |

**Formule de popularité — à arbitrer.** §4.1 F2 demande un tri par popularité
sans la définir. Retenu : **nombre d'achats payés + nombre de lecteurs
distincts**, les deux flux de revenus pesant le même poids. Sans cela, un titre
très lu par les abonnés serait invisible face à un titre peu vendu, ou
l'inverse. C'est un choix, pas une donnée de la spécification : dites-moi si
vous voulez pondérer autrement.

**Pages de démonstration ajoutées aux seeds.** Six pages pour trois titres. La
chaîne d'ingestion (étape 7) produira les vraies ; sans celles-ci, chaque test
de lecture buterait sur une absence de contenu plutôt que sur la règle qu'il
vise.

**Le test d'architecture de `book_pages` a mordu**, sur un commentaire de la
route d'extrait qui nommait la table. Reformulé plutôt qu'assoupli : une règle
stricte et triviale à respecter vaut mieux qu'un test malin. Le nom de la table
n'apparaît désormais qu'à un seul endroit du code applicatif.

---

### Étape 6 — Service de fichiers protégé

- [x] **Terminée le 2026-07-28.** `npm run verify` sort en code 0 : 349 tests,
  dont 26 pour le seul service de fichiers. Cycle rejoué depuis une base
  vierge, `npm run build` vert.
- **Objectif** — Buckets privés, droits vérifiés à chaque requête, URL
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

#### Décisions techniques prises à l'étape 6

| Décision | Raison |
|---|---|
| Quatre bucket : `book-sources`, `book-pages`, `book-downloads` privés, `covers` **public** | Une couverture est un argument de vente : elle doit être indexable (§5.4) et servie par le CDN. Les trois autres ne sortent jamais sans URL signée |
| Refus **explicite** sur les bucket privés, en plus de l'absence de politique | `storage.objects` refuse déjà tout par défaut ; l'intention doit malgré tout se lire dans le schéma (CLAUDE.md règle 1) |
| Pas de `comment on table storage.objects` | Cette table appartient à `supabase_storage_admin` : poser des politiques y est permis, la commenter ne l'est pas. Constaté par sonde avant d'adapter |
| Les plafonds de durée sont appliqués **dans le code**, pas seulement en configuration | Un `.env` recopié d'un autre projet rendrait un lien de contenu payant partageable pendant des heures. Un test force `SIGNED_URL_TTL=86400` et vérifie que 300 s s'applique quand même |
| `dureeValidite()` est exportée et testée seule | C'est une décision de sécurité : elle mérite mieux qu'une vérification indirecte à travers une route |
| Le fichier **téléchargeable** n'a jamais la durée longue, même pour un titre gratuit | La gratuité porte sur la LECTURE (§3.2). Un lien de fichier valable une heure serait partageable — précisément ce que §6.2 cherche à empêcher |
| `Cache-Control: private, no-store` sur tout contenu payant | La réponse porte une URL signée nominative. Seuls les titres gratuits sont cachables par le CDN (D6) |
| La borne de l'extrait est vérifiée **avant** l'existence de la page | Sans cet ordre, un visiteur distinguerait « page absente » de « page interdite » et retrouverait la longueur du livre en sondant page après page. Un acheteur, lui, reçoit bien 404 : il connaît déjà la longueur |
| `expire_le` est calculé sur l'heure **réelle**, non sur l'horloge simulée | La signature émise par le stockage expire selon le temps du monde, que la console ait déplacé l'horloge métier ou non. Annoncer autre chose serait mentir |
| Le quota anonyme ne vise que les visiteurs | Un utilisateur connecté est déjà identifiable, traçable et suspendable. Lui compter ses pages gênerait la lecture d'un enfant qui feuillette, sans rien protéger |

**Le test central de l'étape**, et il passe : un abonné actif obtient 200 sur la
page 1 du titre et **403 sur son téléchargement** — mêmes utilisateur et titre,
seule la nature de l'accès change. Le message d'erreur explique la différence,
sans quoi l'abonné croirait à une panne.

**Objets de démonstration déposés par les tests.** Les seeds SQL posent les
chemins ; les objets vivent dans le stockage, hors de portée d'une migration.
Sans eux, `createSignedUrl` échouerait sur « objet introuvable » et chaque test
buterait là plutôt que sur la règle qu'il vise.

**Un test m'a repris.** J'attendais 404 sur une page inexistante d'un titre
payant demandée anonymement ; l'implémentation renvoie 403. Elle a raison :
vérifier la borne de l'extrait avant l'existence empêche l'énumération. C'est
mon attente qui était fausse, et le cas est désormais testé dans les deux sens.

#### Durcissement du bucket public (correction demandée après validation)

Le bucket `covers` est le seul en accès libre du projet. Aucune barrière
technique ne l'y limite aux couvertures : un bucket public l'est pour tout ce
qu'on y met. Une erreur d'aiguillage dans la chaîne d'ingestion y déposerait des
pages de livre ou un fichier complet, librement téléchargeables et indexables —
et le modèle économique tomberait sans qu'aucune alarme ne se déclenche.

| Garantie | Mise en œuvre |
|---|---|
| **Un seul module y écrit** | `src/lib/storage/covers.ts`. Un test d'architecture parcourt `src/**` et échoue si un autre fichier appelle `from('covers')`. Un second test vérifie que ce module ne dépose que du `image/webp`, jamais un PDF ni un EPUB |
| **Chemins non devinables** | Le nom de fichier repose sur un jeton aléatoire de 32 caractères, jamais sur le titre ni sur un identifiant séquentiel. Sans cela, la couverture d'un titre en brouillon serait accessible à qui devine l'URL, et les prochaines parutions du client fuiteraient avant leur annonce. Les seeds suivent la même règle |
| **Résolutions bornées** | Trois tailles d'affichage seulement — vignette 320 px, fiche 800 px, mise en avant 1600 px. `publierCouverture` refuse toute image plus large, et la borne est vérifiée dans le module, pas seulement chez l'appelant. L'original haute définition reste dans le stockage privé, avec les fichiers sources : c'est lui qui servirait à une réimpression |

Le test d'intégration sur la chaîne d'ingestion — vérifier que **seule** la
couverture atterrit dans ce bucket — est livré à l'étape 7, la chaîne n'existant
pas encore.

---

### Étape 7 — Chaîne d'ingestion des PDF

- [x] **Objectif** — Un PDF déposé produit automatiquement : analyse, pages
  WebP en deux résolutions, couverture, EPUB à mise en page fixe, couche texte,
  fiche en brouillon (§7.4).
- **Dépendances** — étapes 1, 6
- **Fichiers produits** *(emplacements corrigés à la livraison : le calcul pur
  reste dans `src/domain/`, tout ce qui touche un sous-processus, le disque ou
  la base passe dans `src/lib/` — voir les décisions ci-dessous)*
  - `src/domain/ingestion/text.ts` — normalisation, recollage des lettrines
  - `src/domain/ingestion/epub.ts` — EPUB à mise en page fixe assemblé à la
    main (aucune dépendance AGPL), avec bloc de texte masqué accessible quand
    la couche texte existe
  - `src/domain/ingestion/slug.ts` — slug du titre, et résolution des collisions
  - `src/lib/ingestion/poppler.ts` — résolution **vérifiée** des binaires
  - `src/lib/ingestion/analyze.ts` — `pdfinfo`/`pdftotext`, nombre de pages,
    dimensions, présence d'une couche texte, empreinte
  - `src/lib/ingestion/render-pages.ts` — `pdftoppm` puis `sharp`, deux
    résolutions
  - `src/lib/ingestion/cover.ts` — vignette, fiche, mise en avant
  - `src/lib/ingestion/storage.ts` — dépôt dans les trois bucket privés
  - `src/lib/ingestion/pages-repository.ts` — seul module autorisé à écrire
    dans `book_pages`
  - `src/lib/ingestion/pipeline.ts` — orchestration, reprise, journalisation
  - `src/app/api/admin/books/ingest/route.ts`
  - `supabase/migrations/20260728000021_ingestion_empreinte.sql` — idempotence
  - `tests/unit/ingestion-text.test.ts`, `ingestion-epub.test.ts`,
    `ingestion-slug.test.ts`
  - `tests/integration/ingestion.test.ts` — chaîne complète sur un PDF réel
  - `tests/integration/ingestion-corpus.test.ts` — extraction sur les **seize**
    contes de `conte d'afrique/`
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

#### Décisions techniques prises à l'étape 7

| Décision | Raison |
|---|---|
| Les modules à effets de bord vivent dans `src/lib/ingestion/`, pas `src/domain/` | Écart avec l'arborescence annoncée plus haut. `src/domain` est réservé au calcul pur — une règle ESLint et un test y interdisent la lecture directe de l'heure. Poppler, `sharp` et le stockage n'y ont pas leur place. Restent purs, donc dans `src/domain/ingestion/` : `text.ts`, `epub.ts`, `slug.ts` |
| Chaque binaire poppler est **résolu et vérifié** au lieu d'être appelé par le PATH | Sur ce poste, Git for Windows livre un `pdftotext.exe` issu d'Xpdf qui **masque** celui de poppler. Xpdf ne connaît pas `-bbox`, dont l'extraction dépend — alors que `pdftoppm` et `pdfinfo` résolvaient bien vers poppler. La chaîne aurait mélangé deux outillages sans le signaler. La bannière de version est lue et doit mentionner poppler |
| Le faux discriminant écarté : « Glyph & Cog » | Les **deux** bannières le mentionnent, poppler étant un fork d'Xpdf qui en crédite les auteurs. Filtrer là-dessus aurait rejeté les deux outils |
| `pdftoppm` écrit dans un dossier temporaire, jamais sur la sortie standard | Vérifié : sous Windows, un préfixe `-` est pris au pied de la lettre et produit un fichier nommé `-.png`, en laissant stdout **vide**. Une chaîne qui s'y serait fiée aurait produit des pages de zéro octet, sans erreur ni code de retour |
| Détection de la lettrine **géométrique**, jamais lexicale | Le gabarit du corpus détache la lettrine : `pdftotext` rend « I l y a très longtemps ». Une règle « majuscule isolée » corromprait « Y a-t-il », phrase française normale. Le discriminant est la hauteur du glyphe : lettrines à 2,96 × la médiane, toute autre majuscule isolée à 1,30 × au plus |
| « À » et « Ô » ne sont **jamais** recollés | Ce sont des mots français complets. « À l'entrée du village » est la sortie correcte ; recoller donnerait « Àl'entrée ». Mais « A u milieu » doit devenir « Au milieu » — un « A » non accentué en tête de phrase est nécessairement un mot coupé. La distinction tient sur l'accent seul, et les seize contes la confirment |
| `œ` et `æ` **conservés** dans le texte, **transcrits** dans le slug | Deux règles contraires pour deux usages contraires. Dans un conte, « oeufs » est une faute d'orthographe ; dans une URL, « œ » n'est pas un caractère ASCII. Chaque module documente le versant opposé |
| Deux résolutions : 1600 px et 800 px | §5.1 — une part importante de l'audience est en Afrique francophone sur connexion lente. L'allégée est aussi plus compressée (qualité 62 contre 80) : son rôle est de peser peu. Un test vérifie qu'elle fait moins de la moitié du poids de la haute |
| Mise à l'échelle par **poppler**, pas par `sharp` | Le rendu part des vecteurs du PDF à la taille finale, au lieu d'agrandir une image déjà tramée. Le texte des illustrations reste net |
| EPUB assemblé à la main, avec JSZip (MIT) pour seule dépendance | CLAUDE.md interdit `PyMuPDF` et `ebooklib` (AGPL). Les bibliothèques EPUB courantes tombent sous cette interdiction |
| Images **JPEG** dans l'EPUB, WebP en ligne | Les deux sorties n'ont pas le même lecteur. En ligne, un navigateur récent, où WebP pèse moins lourd. L'EPUB doit s'ouvrir **partout**, y compris sur les liseuses anciennes : WebP n'est un type autorisé que depuis EPUB 3.3. Un test vérifie que les octets embarqués sont bien du JPEG, et non seulement que le manifeste l'annonce |
| `mimetype` en première entrée du zip, **non compressée** | Exigence OCF : c'est ce qui permet de reconnaître un EPUB sans le décompresser. Compressée ou déplacée, l'archive reste un zip valide et s'ouvre à la main — mais un distributeur la refuse. Erreur silencieuse à la fabrication, bruyante à la publication. Le test lit les octets 30 à 58 du fichier produit |
| Bloc de texte masqué par `clip-path`, jamais par `display: none` | Correctif d'accessibilité de §7.4.2. `display: none` retire l'élément de l'arbre d'accessibilité : la synthèse vocale ne le voit plus du tout. C'est le piège exact que le correctif doit éviter, et un test l'interdit nommément |
| Les métadonnées d'accessibilité **changent** selon la présence d'une couche texte | Annoncer `textual` sur un album muet serait une fausse déclaration : un lecteur malvoyant choisirait le titre sur cette foi et n'y trouverait rien à écouter (§7.4.4) |
| `dcterms:modified` tronqué à la seconde | EPUB 3 impose `AAAA-MM-JJTHH:MM:SSZ`. `toISOString()` produit des millisecondes, qu'un validateur refuse |
| L'ingestion crée le livre en **brouillon**, et n'y touche plus | §7.4.3 étape 6. `publie_le` reste nul — la fenêtre de vente de 3 mois ne court donc pas encore. `inclus_abonnement`, `disponible_achat` et `gratuit` restent faux : la chaîne ne décide jamais du modèle économique d'un titre (§3.2) |
| Idempotence par l'empreinte SHA-256 du **contenu** | Migration corrective 0021. Un double clic dans le back-office, un envoi relancé après coupure : chacun créerait un second livre en brouillon avec ses images en double. Le nom du fichier ne peut pas servir — il change à chaque réenregistrement, le contenu non |
| Unicité **partielle** de l'empreinte : seulement sur `statut = 'termine'` | Un échec — PDF corrompu, stockage coupé — ne doit pas interdire de redéposer le fichier une fois le problème réglé. Une contrainte simple aurait transformé chaque échec en impasse définitive |
| La route de dépôt **téléverse** le fichier ; le client ne désigne jamais un chemin serveur | Accepter un chemin aurait donné à tout compte administrateur une lecture arbitraire du système de fichiers : déposer un `.env` l'aurait recopié dans le stockage, puis rendu par une URL signée. Restreindre à un dossier autorisé n'aurait fait que déplacer le problème sur la qualité de la vérification anti-remontée |
| La signature `%PDF-` est vérifiée sur les octets | Le type déclaré par le client n'est pas une preuve. Un test envoie un fichier annonçant `application/pdf` qui n'en est pas un |
| Le nettoyage après échec efface les **fichiers**, jamais le livre en brouillon | Le brouillon porte la trace de l'échec pour l'éditeur, il est invisible au catalogue, et le supprimer effacerait la ligne de suivi qui explique ce qui s'est passé. Seuls les fichiers occupent du stockage sans que rien ne les rattache |

**La règle d'accès à `book_pages` a été scindée, et non assouplie.** La chaîne
doit alimenter cette table, que l'étape 4 avait réservée à un module unique. Ce
que cette règle protège est la **lecture** : la garantie « aucune page ne sort
sans être passée par `access_for` » ne tient que parce qu'aucun autre chemin de
lecture n'existe. L'écriture fait entrer du contenu, elle n'en fait pas sortir.

| Module | Droit | Vérifié par |
|---|---|---|
| `src/lib/content/page-service.ts` | Seul à **lire**, et toujours après `getAccess` | Position de `getAccess(` avant celle de `from('book_pages')` |
| `src/lib/ingestion/pages-repository.ts` | Seul à **écrire**, et **incapable de lire** | Aucun `.select(`, aucun `.single(`/`.maybeSingle(`, uniquement `upsert` et `delete` |

La dernière clause est ce qui empêche l'ouverture de dégénérer : sans elle, le
module d'écriture deviendrait un second chemin de lecture sans contrôle de
droits, et la garantie d'origine tomberait sans que rien ne le signale.

**Le test d'intégration promis à l'étape 6 est livré** : seule la couverture
atterrit dans le bucket public, aux trois formats attendus, et les trois bucket
privés restent inaccessibles au client — vérifié avec un vrai client soumis à
RLS, pas par lecture du code.

**Le corpus est un corpus de test, pas un exemple.** Les assertions
d'extraction tournent sur les **seize** contes, pas sur un seul : un défaut de
gabarit se répète d'un titre à l'autre, et le vérifier sur un exemplaire ne
prouverait rien sur les quinze autres. La chaîne complète, elle, est jouée sur
un conte réel — quatorze pages, une minute de traitement.

**Un test m'a repris.** J'attendais le slug `petit-baobab` ; l'ingestion produit
`petit-baobab-2`. Le jeu de démonstration porte déjà ce slug, et la résolution
de collision a fonctionné exactement comme prévu. C'est mon attente qui était
fausse, et le test vérifie désormais le cas de collision — sur la vraie
contrainte d'unicité de la base, ce qui vaut mieux que ce que j'avais écrit.

#### Point en suspens — validation par epubcheck

`epubchecker` est en dépendance de développement, mais le paquet npm **ne
contient pas** le validateur : son script d'installation télécharge l'archive
Java depuis GitHub. Ce poste n'a pas accès au réseau, le téléchargement échoue
**sans faire échouer `npm install`**, et le dossier `vendors/` reste absent.

Le test correspondant est donc conditionné à la présence réelle du fichier —
c'est le seul test ignoré de la suite, et il est nommé pour qu'on le voie. Il ne
remplace pas les vérifications de structure, qui s'exécutent toujours et
couvrent la conformité OCF, la déclaration de mise en page fixe, la cohérence du
manifeste et du dos, la validité des images embarquées et le bon échappement
XML.

Pour l'activer sur un poste connecté : `npm rebuild epubchecker`, puis
`npm run verify`. **À faire avant toute remise du premier titre à un
distributeur.**

---

### Étape 8 — Panier et commandes

- [x] **Objectif** — Panier multi-titres, commande en `en_attente`, calcul du
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

#### Décisions techniques prises à l'étape 8

| Décision | Raison |
|---|---|
| Le panier ne porte **aucun prix** | `cart_items` ne contient qu'un livre et une langue. Figer un prix au panier aurait créé une seconde source de vérité — celle que le client voit — et l'écart entre les deux serait devenu une faille commerciale plutôt qu'un bogue d'affichage |
| `GET /api/cart` ne rend **aucun total** | Le total dépend de la zone d'ENCAISSEMENT, que seule la commande connaît. En annoncer un depuis la zone d'affichage reviendrait à promettre un montant qu'on ne facturera peut-être pas |
| Le repli de zone est décidé **pour la commande entière**, pas ligne par ligne | Appliqué par ligne, D4 point 8 produirait un panier facturé moitié en FCFA moitié en euros. Or `orders` ne porte qu'une devise, et `sumAmounts` refuse d'additionner deux devises. Si un seul titre manque à l'appel dans la zone demandée, la commande bascule en international |
| La création de commande passe par une fonction PostgreSQL | Le client Supabase ne sait pas ouvrir une transaction. Deux insertions séparées laisseraient, sur coupure, une commande SANS ligne — un montant à payer sans rien à livrer |
| Cette fonction ne calcule **aucun prix** | Recalculer en SQL aurait créé une seconde implémentation de la grille tarifaire, que rien n'aurait tenue en phase avec `src/domain/orders`. Elle reçoit des montants déjà résolus côté serveur |
| Le statut n'est pas un paramètre de la fonction | Une commande naît toujours `en_attente`. Laisser l'appelant le choisir aurait fait de cette fonction un chemin d'octroi de droits contournant le gestionnaire de webhooks |
| Aucun décompte de code promotionnel à la création | Une commande `en_attente` peut être abandonnée : décompter dès maintenant consommerait le code pour des paniers jamais réglés. L'enregistrement appartient à l'étape 9, ce que le commentaire de `promo_redemptions` annonçait déjà |
| Un code **refusé** n'est pas rattaché à la commande | Sinon le gestionnaire de webhooks croirait devoir le décompter à l'encaissement |
| Un code refusé **n'empêche jamais de commander** | Bloquer sur un code expiré immobiliserait un panier parfaitement valide. Le total est rendu sans remise, avec le motif du refus |
| La remise est **plafonnée au sous-total** | Une remise de 10 € sur un panier de 4,99 € donnerait un total négatif — un remboursement offert par un code de réduction |
| Un code en **montant** est refusé sur une autre devise | L'appliquer reviendrait à convertir sans taux de change : 5 sur un panier en FCFA retirerait cinq francs là où le code promettait cinq euros. Un pourcentage, lui, s'applique partout |
| `total_confirme` ne sert **qu'à comparer** | Ce n'est pas un prix soumis par le client : c'est un accusé de réception. Un montant qui ne correspond pas fait échouer la commande, il ne la modifie jamais |
| Le panier est vidé **après** l'écriture de la commande | Sur échec, l'utilisateur retrouve son panier intact plutôt qu'un panier vide et aucune commande |
| La commande d'autrui rend **404, jamais 403** | Un 403 confirmerait son existence : en sondant des identifiants, on apprendrait le rythme des ventes. Le filtre sur `user_id` est dans la requête — la ligne d'autrui n'est jamais chargée |
| Un titre non publié et un identifiant inconnu répondent **pareil** | Sans quoi le catalogue à venir serait devinable un identifiant à la fois |
| Les refus de panier sont **nommés**, jamais silencieux | Un panier qui se vide sans explication est perçu comme une panne. Quatre motifs distincts, parce que chacun appelle une action différente de l'utilisateur |

**Un `grant` m'a repris.** `revoke all on function … from public` retire aussi
le droit à `service_role`, qui n'en hérite que par `public`. La création de
commande échouait sur « permission denied for function ». Le `grant execute …
to service_role` explicite est la convention déjà suivie par les migrations
0013, 0014, 0015 et 0019 — je l'avais omise.

**Un test m'a repris.** J'affirmais qu'aucune commande n'était écrite en
comptant *toutes* celles de l'utilisateur — or les tests précédents en avaient
déjà créé. L'assertion compte désormais l'écart avant/après, et vérifie en plus
que le panier reste intact pour que l'utilisateur puisse confirmer sans tout
refaire.

---

### Étape 9 — Paiement simulé et gestionnaire de webhooks

- [x] **Objectif** — Tunnel branché sur `FakePaymentProvider`, vrai gestionnaire
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

#### Décisions techniques prises à l'étape 9

| Décision | Raison |
|---|---|
| L'ordre des opérations du gestionnaire est la sécurité même | 1. lire le corps **brut** ; 2. vérifier la signature **avant tout parsing** ; 3. journaliser ; 4. appliquer. Inverser 2 et 3 ferait traiter un corps non authentifié ; inverser 3 et 4 rendrait un rejeu indiscernable d'un premier passage |
| `webhook_events` distingue **reçu** et **traité** | Un événement reçu dont l'application échoue garde `traite_le` nul : une réémission le reprend au lieu de le croire fait. Marquer « traité » à la réception aurait transformé chaque panne passagère en paiement définitivement perdu |
| Un événement authentifié mais non appliqué rend **500** | Un prestataire réel réémet tant qu'il n'a pas reçu de 200. Répondre 200 sur un événement non traité le ferait cesser, et le paiement resterait sans droits |
| Un rejeu déjà traité rend **200** | C'est le fonctionnement normal, pas une erreur : un 500 ferait boucler le prestataire |
| Un corps à signature invalide est journalisé sous un identifiant **préfixé** | Sans préfixe, une contrefaçon portant l'identifiant d'un événement à venir ferait rejeter le vrai comme un rejeu. Un test le vérifie |
| Les réponses du gestionnaire sont **muettes** | Un prestataire n'a besoin que du code HTTP. Détailler la cause d'un rejet indiquerait à un attaquant ce qui manque à sa contrefaçon |
| Verrou de ligne `for update` sur la commande, **avant** toute lecture d'état | Sans lui, deux webhooks concurrents liraient tous deux `en_attente` et tenteraient tous deux l'octroi. L'index unique de `entitlements` reste la dernière ligne de défense (D1 point 8), éprouvée séparément |
| Un échec qui arrive **après** un paiement réussi ne défait rien | Les événements d'un prestataire ne sont pas garantis dans l'ordre, et un paiement encaissé ne se retire pas sur la foi d'un message tardif : cela demande un remboursement explicite |
| Un remboursement **retire** le droit acquis | §3.2 fait du droit la contrepartie du paiement. Rembourser sans retirer laisserait le contenu accessible gratuitement et à perpétuité. Seuls les droits de **cette** commande sont retirés (`source_id`) : un octroi manuel sur le même titre survit |
| Le code promotionnel n'est décompté **qu'ici**, au paiement | Une commande en attente peut être abandonnée. L'unicité `(promo_code_id, order_id)` empêche qu'un rejeu décompte deux fois |
| Un événement d'abonnement rend **500**, il n'est pas ignoré | L'accepter en silence ferait cesser les réémissions, et l'abonnement serait perdu sans trace. L'étape 10 les traitera |
| Un type **inconnu** est ignoré avec un 200 | Un prestataire en ajoute au fil du temps ; refuser ferait réessayer indéfiniment un événement qui ne nous concerne pas |
| `fulfillment.ts` est dans `src/lib`, non `src/domain` | Même écart qu'à l'étape 7 : il appelle la base. `src/domain` reste au calcul pur |

**Le test d'atomicité, en la faisant échouer.** Une commande dont on a supprimé
les lignes fait lever la fonction *après* le passage en `paye`. Si les deux
écritures n'étaient pas dans la même transaction, la commande resterait payée
sans le moindre droit — le client aurait payé et n'aurait rien reçu. Le test
vérifie que la commande est toujours `en_attente` et `paye_le` toujours nul.

**Le montage entier est éprouvé de bout en bout.** Un dernier test fait
fabriquer, signer et transmettre l'événement par `FakePaymentProvider`, puis
vérifie que le droit de téléchargement est acquis. Aucun raccourci : c'est le
code de production des deux côtés.

**Le schéma m'a repris.** `payment_events` n'a pas de colonne `motif` — elle
porte un `detail jsonb`, commune à tous les types d'événements qui ne
transportent pas les mêmes informations. Ma fonction `fail_order` échouait donc
à l'insertion, et le webhook rendait 500.

---

### Étape 10 — Cycle de vie des abonnements

- [x] **Objectif** — `essai` → `actif` → renouvellement, échec de prélèvement,
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

#### Décisions techniques prises à l'étape 10

| Décision | Raison |
|---|---|
| La machine à états ne dit **jamais** qui a le droit de lire | Les règles d'accès — période de grâce, accès maintenu jusqu'au terme payé — vivent dans `access_for_books`, unique implémentation partagée avec les politiques RLS. Les réécrire ici les ferait diverger, et la divergence porterait sur qui a le droit de lire quoi. La machine ne décide que du **statut** |
| `expire` est le seul état terminal ; `annule` ne l'est pas | La période payée court encore après une annulation, et l'abonnement finira par expirer. C'est ce qui permet à §9.1 de promettre un « accès maintenu jusqu'à la fin de la période payée » |
| Un abonnement **annulé** ne se renouvelle pas | C'est l'objet même de l'annulation. Un prélèvement qui surviendrait après est une erreur du prestataire, pas une reconduction à honorer |
| Un échec de prélèvement sur un abonnement annulé est **refusé** | Le faire basculer en `impaye` rouvrirait une période de grâce sur un abonnement que l'utilisateur a résilié |
| La grâce court depuis le **premier** échec | Un prestataire qui réessaie chaque jour la prolongerait sinon indéfiniment. `demarreGrace` ne rend vrai qu'à la première bascule, et un test vérifie `impaye_depuis` après deux échecs |
| Le renouvellement repart de `fin_periode` si elle est **devant**, de maintenant sinon | Repartir toujours de maintenant offrirait des jours à qui renouvelle en avance ; repartir toujours de `fin_periode` en offrirait à qui a laissé traîner un impayé |
| Zone, devise et montant **jamais** touchés par un renouvellement | D4 point 7. Un test fait annoncer au prestataire une zone différente au renouvellement et vérifie que l'abonnement reste en XAF à 2 500 |
| L'offre du **contrat** prime sur celle de l'événement | Un renouvellement ne change pas d'offre : cela demanderait une souscription nouvelle, à un autre prix |
| Aucune route ne change le statut d'un abonnement | §9.1 : « Ne jamais activer un abonnement sur la seule base d'une redirection navigateur. » Souscrire ouvre une session, annuler transmet la demande — l'événement signé décide. Un test vérifie qu'après un POST, **rien** n'existe en base |
| `GET /api/subscriptions` rend `donne_telechargement: false` | La confusion la plus coûteuse du projet, désamorcée dans la réponse elle-même plutôt que laissée à l'interprétation de l'interface |
| Une transition refusée est journalisée mais rend **200** | Un renouvellement après annulation ne deviendra jamais applicable : un 500 ferait réémettre indéfiniment un événement sans issue |

**Le bug classique a son test dédié, et il est explicite.** Un seul
utilisateur, deux titres, deux issues opposées : à l'expiration, le titre
couvert par l'abonnement passe de `subscription` à `preview` et devient
illisible, tandis que le titre **acheté** reste lisible et téléchargeable avec
`reason = purchase`. Un second test le vérifie cinq ans plus tard, §3.1
promettant à l'acheteur un accès « sans limite de durée ».

**La machine à états est éprouvée sur les trente combinaisons** — cinq états
plus « aucun abonnement », par cinq événements — et non sur les trois d'un
parcours nominal. Un test vérifie qu'aucune combinaison ne lève : une machine
qui plante sur une entrée inattendue est une panne, pas un refus.

**Les scénarios temporels n'attendent jamais.** Les transitions reçoivent une
`FixedClock` ; les vérifications d'accès reçoivent l'instant en paramètre, que
`access_for_books` accepte pour cette raison même.

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
  - `src/app/api/admin/subscriptions/[id]/zone` — **changement de zone d'un
    abonnement** (arbitrage N4, voir ci-dessous)
  - le back-office affiche les **abonnements en anomalie** en évidence, avec
    leur nombre et depuis quand (`abonnements_en_anomalie()`), et la liste des
    manques de chaque brouillon (`manques_pour_publication()`)
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

#### Option évaluée pour l'étape 16 — rôle PostgreSQL dédié au service des pages

**Le problème à résoudre.** `service_role` contourne RLS : sur `book_pages`, la
base ne rattrape pas une erreur applicative (§2.6). La compensation actuelle est
un test d'architecture ; il tient tant que personne ne le désactive.

**L'option.** Un rôle `contenu_lecteur`, sans `BYPASSRLS`, avec le seul
privilège `SELECT` sur `book_pages`, et une politique appelant `access_for`. Le
service de pages ouvrirait ses connexions sous ce rôle en positionnant
l'identifiant de l'utilisateur dans le contexte de session. Une erreur
applicative — un contrôle oublié, une condition inversée — serait alors
**rattrapée par la base**.

**Chiffrage : 2 à 3 jours-homme.**

| Poste | Charge | Détail |
|---|---|---|
| Rôle, privilèges, politique | 0,5 j | Migration, plus la politique appelant `access_for` sur le contexte de session |
| Propagation de l'identité | 1 j | Le point délicat : PostgREST ne permet pas de changer de rôle par requête. Il faut une seconde connexion, ouverte par `pg` sous ce rôle, avec `set local` de l'identifiant — donc un chemin d'accès distinct de celui de `supabase-js` |
| Reprise du service de pages | 0,5 j | Bascule de `supabase-js` vers cette connexion, et adaptation des tests |
| Tests de sécurité | 0,5 à 1 j | Preuve qu'un contrôle applicatif retiré est bien rattrapé par la base — c'est tout l'intérêt de l'option, et c'est ce qui doit être démontré |

**Gain.** Défense en profondeur réelle sur la table la plus sensible : deux
barrières indépendantes au lieu d'une barrière et d'un test.

**Coût caché.** Une seconde voie d'accès à la base, avec son pool, sa gestion
d'erreurs et son contexte de session — donc une surface à maintenir. À mettre en
regard du fait que le test d'architecture, lui, coûte zéro à l'exécution.

**Recommandation.** À implémenter si le catalogue prend de la valeur ou si
l'équipe s'élargit — le test d'architecture protège d'un oubli, pas d'un
contournement délibéré par quelqu'un qui ne connaît pas l'intention.
- **Critères d'acceptation**
  ```bash
  npm run test -- e2e
  npm run build               # code 0
  npm run verify              # code 0
  ```

---

## 5 bis. Dispositions prises sur les points de poste (2026-07-28)

| Point | Disposition | État |
|---|---|---|
| `conte d'afrique/` hors dépôt | Confirmé par le client : le dossier reste hors git et servira au téléversement des livres par la chaîne d'ingestion (étape 7) | **Réglé** |
| `env.example.txt` redondant | Supprimé. Son contenu est intégralement repris et enrichi dans `.env.example` | **Réglé** |
| `vector` redémarrait en boucle | Cause identifiée : sur Docker Desktop pour Windows, le collecteur ne parvient pas à joindre le socket Docker (« Listing currently running containers failed »), et il entraînait `logflare`. `[analytics] enabled = false`. Aucune perte fonctionnelle : ces services agrègent des journaux de développement ; `docker logs` reste disponible | **Réglé** |
| 3 vulnérabilités `npm audit` | Résolues par `overrides` npm — `sharp >= 0.35.0` et `postcss > 8.5.17` — sans rétrograder Next, ce que proposait le correctif automatique (Next 9.3.3). `npm audit` : 0 vulnérabilité. `npm run verify` et `npm run build` restent verts | **Réglé** |
| Magasin d'images Docker incohérent | Rétabli de lui-même après redémarrage. `docker system df` répond de nouveau. 11,5 Go de cache de compilation purgés au passage — l'espace libre est remonté à 27 Go | **Réglé** |
| Image `supabase/studio` corrompue | **Non réglé, et délibérément.** Le retéléchargement ne corrige rien : containerd croit détenir la couche et la réutilise. Seule une purge complète du stockage Docker la réparerait, ce qui détruirait les volumes des projets `archora` et `atlink` présents sur la machine. Studio est l'interface d'administration web : elle n'a aucun rôle dans un chantier backend, et y consacrer davantage serait disproportionné. Elle se réactive en une ligne le jour d'une purge | **Assumé** |

---

## 5 ter. Arbitrages appliqués (2026-07-29)

Réponses du client aux questions consignées dans `QUESTIONS.md`, et ce qui a été
fait. Ces décisions traversent plusieurs étapes déjà livrées : elles sont donc
regroupées ici plutôt que dispersées.

### Le principe qui en résout trois

> « L'ingestion est permissive, la publication est stricte. »

Un titre ne peut passer au statut `publie` que si son auteur est renseigné et
différent de « À renseigner », son origine culturelle et sa tranche d'âge sont
renseignées, et — s'il est `disponible_achat` — qu'il a un prix dans **chaque
zone active**.

**Vérifié en base, par déclencheur** (migration 0024), et non dans le
formulaire : un contrôle d'interface se contourne par un appel direct à l'API,
se perd à la première refonte, et ne protège pas des scripts d'import. Le
déclencheur tient quel que soit le chemin d'écriture, `service_role` compris.

| Détail | Raison |
|---|---|
| Contrainte **différée** en fin de transaction | Les prix vivent dans une autre table : un script qui insère le livre puis ses prix présenterait, à l'instant de l'insertion, un titre publié sans prix. Vérifier immédiatement le refuserait alors que la transaction complète est valide. Constaté en écrivant la migration — la version immédiate faisait échouer `npm run db:reset` sur les seeds |
| Ne mord **qu'au passage** à `publie` | Un titre déjà publié dont on modifie un champ sans rapport n'est pas revalidé. Sans cela, retirer un prix échouerait avec un message parlant de publication, ce qui égarerait plus qu'il n'aiderait |
| `manques_pour_publication()` exposée séparément | Le back-office (étape 13) affichera la liste des manques **avant** la tentative. La même règle sert aux deux usages, donc aucune divergence possible entre ce que l'écran annonce et ce que le déclencheur refuse |
| Table `active_price_zones` plutôt qu'une constante | Ouvrir une zone est une décision commerciale, qui doit pouvoir se prendre sans migration. La colonne `active` permet de préparer une zone sans l'imposer aux titres déjà publiés |

**Le déclencheur a immédiatement trouvé un défaut réel** : `la-tortue-et-le-lapin`
était publié, vendu à l'unité, et n'avait qu'un prix international. Le jeu de
démonstration a été corrigé — un jeu de données qui viole la règle qu'il sert à
éprouver donne une base de tests fausse.

### Q8.1 — La zone d'encaissement vient du prestataire

`zone_encaissement` a disparu des entrées de `POST /api/orders` **et** de
`POST /api/subscriptions`. Le contrat `PaymentProvider` porte désormais
`paysDuMoyenDePaiement()`, et `zonePourPays()` en dérive la zone.

| Détail | Raison |
|---|---|
| Un pays inconnu retombe sur **international** | La grille la plus chère. L'inverse ferait d'une donnée manquante une remise automatique, et un prestataire qui cesserait de renseigner le pays offrirait le tarif réduit à tout le monde |
| Le pays simulé vit dans une **variable de classe** du faux prestataire | Jamais dans une requête HTTP : un client qui pourrait l'imposer choisirait son propre tarif |
| Un **test d'architecture** échoue si le champ réapparaît | Une commodité retirée revient toujours par la même porte — un correctif pressé, un test à écrire vite. Le test lit les schémas Zod des routes |

La route d'abonnement avait le même défaut, et il était pire : la zone y est
**figée pour toute la vie de l'abonnement** (D4 point 7). Un tarif choisi par
l'abonné, puis verrouillé.

### Q8.2 — Le repli de zone est remplacé par un refus nommé

D4 point 8 prévoyait de retomber sur la zone internationale. Appliqué ligne par
ligne, ce repli facturait un panier moitié en francs CFA, moitié en euros ;
appliqué à la commande entière, il faisait passer silencieusement un acheteur
africain à la grille européenne.

Le repli est retiré de la tarification **et du catalogue** (migration 0028) : la
zone demandée, ou aucun prix. Le titre reste listé — il peut être lisible par
abonnement — simplement sans montant. Un panier dont le total change de devise
sans explication fait abandonner l'acheteur.

Le cas résiduel — une zone ouverte **après** publication — donne
`sans_prix_dans_la_zone`, un refus qui nomme le titre.

### Q9.1 — Remboursement par ligne

`refund_order` accepte désormais un tableau de titres ; `null` vaut
remboursement total. Sur un panier de quatre titres, en rembourser un ne fait
plus perdre les trois autres.

La commande n'est soldée (`rembourse`) que lorsqu'il ne reste plus aucun droit
issu d'elle. Un remboursement partiel la laisse `paye` : elle a bien donné lieu
à un encaissement, et une partie du contenu reste due. Un identifiant étranger à
la commande est écarté — il ne doit pas servir à retirer un droit acquis
ailleurs.

Le geste commercial — rembourser **sans** retirer — reste possible par l'octroi
manuel d'un administrateur, que ce remboursement ne touche pas.

### Q10.1 — `statut_effectif()`, sans tâche planifiée ni écrasement

Deux options écartées, pour la même raison de fond :

* **une tâche planifiée** aurait réintroduit la synchronisation d'état dupliqué
  que D1 avait écartée pour les entitlements. Une tâche de fond qui échoue en
  silence laisse la base dans un état faux sans que rien ne le signale ;
* **écraser `statut`** aurait détruit la distinction annulé/impayé, dont
  l'analyse de rétention (étape 14) a besoin.

`statut` conserve donc ce que le prestataire a rapporté ; `statut_effectif()`
replie les dates. Affichage et statistiques lisent cette fonction, jamais la
colonne.

Elle ne corrige **pas une faille** : le moteur de droits comparait déjà les
dates et refusait l'accès au bon moment. Elle corrige un affichage.

### Q10.2 — `jours_essai` réglable, mais figé sur l'abonnement

Le réglage vit dans `business_settings` ; la valeur appliquée est recopiée sur
chaque abonnement à sa création, exactement comme `order_items.prix_unitaire`
fige le prix facturé.

Sans cette copie, ramener le réglage de sept à trois jours prélèverait au
troisième jour un abonné à qui sept ont été promis. C'est un bug de facturation,
pas un changement de configuration.

### Q8.3 — `src/lib/money` → `src/domain/money`

Le nombre de décimales d'une devise est une règle métier, pas un utilitaire.
`src/domain/orders` l'importait à rebours des couches ; le déplacement supprime
l'entorse au lieu de la documenter. Le message de la règle ESLint suit.

### N1 — Le titre hors zone reste affiché, l'achat seul est désactivé

Le retirer du catalogue appauvrirait la découverte : il peut être parfaitement
lisible par abonnement, ou gratuit. La fiche et la liste portent donc
`achat_hors_zone`, avec un message explicite — « Ce conte n'est pas encore
proposé à l'achat dans votre région » — et **aucun prix d'une autre zone, même
à titre indicatif**.

| Détail | Raison |
|---|---|
| Le cas est **journalisé** en avertissement, avec le titre et la zone | Ce n'est pas un affichage ordinaire : depuis la migration 0024, un titre publié et vendu à l'unité a un prix dans chaque zone active. Sa présence est un résidu à corriger |
| Rien n'est signalé sur un titre **non vendu** à l'unité | L'absence de prix y est normale. Un message d'indisponibilité serait absurde sur un conte gratuit |
| L'accès en lecture n'est pas touché | Le moteur de droits ignore complètement les prix : gratuit ou inclus dans l'abonnement, le titre se lit normalement |

### N2 — L'état dérivé `anomalie`

**Mon premier arbitrage était mauvais, et voici pourquoi.** J'avais laissé un
abonnement `actif` à période échue tel quel, au motif qu'aucune décision n'avait
été prise à son sujet. Mais un tel abonnement **ressemble exactement à un
abonnement sain** : dans la liste des abonnés, dans le tableau de bord, dans les
comptages, rien ne le distingue. Il ne se voit pas — il se fond dans la masse —
et il fausse les statistiques en comptant un abonné actif qui ne paie plus.
C'est la corruption même que `statut_effectif` supprimait pour les annulés et
les impayés.

Rendre visible, ce n'est pas s'abstenir de transition : c'est **nommer
l'anomalie**.

| Détail | Raison |
|---|---|
| Type **distinct** `subscription_status_effectif`, non une valeur ajoutée à l'énumération stockée | `anomalie` n'est jamais rapportée par un prestataire et ne doit jamais être écrite. L'ajouter au type stocké aurait rendu l'écriture possible, et il aurait fallu une contrainte pour l'interdire — autant que le type la rende impossible |
| Tolérance de **48 heures**, configurable | Un renouvellement peut être « en vol ». Sans tolérance, chaque abonnement clignoterait en anomalie à chaque échéance, et le signal deviendrait du bruit — donc inutile |
| `essai` est inclus dans la règle | Un essai qui s'achève sans premier prélèvement est exactement le même signal |
| Comptée **ni en actif ni en expiré** | Avec les actifs, elle gonflerait le nombre d'abonnés payants ; avec les expirés, elle masquerait le défaut d'intégration. Les deux fausseraient l'analyse de rétention, chacune dans un sens |
| Journalisée **à chaque observation**, en avertissement | C'est le signal qu'un webhook a été perdu. Sans cette trace, l'abonnement passerait inaperçu jusqu'à ce que quelqu'un s'étonne des comptages |
| L'accès reste refusé | Inchangé : le moteur de droits comparait déjà les dates |

`statut_effectif` est exposée en **colonne calculée** PostgREST — `select *,
statut_effectif from subscriptions`. La règle vit donc en base, une seule fois,
partagée par l'affichage, les statistiques et le back-office. Le générateur de
types de Supabase n'émet pas les colonnes calculées : le type est affirmé à la
main dans `handlers.ts`, avec le commentaire qui l'explique, plutôt que de
recopier la règle en TypeScript et de la laisser diverger.

### N4 — Changement de zone d'un abonnement (reporté à l'étape 13)

Le gel de la zone (D4 point 7) reste la règle par défaut. Mais **sur un produit
visant la diaspora, la mobilité est un cas réel** : un abonné peut changer de
pays pour de bon.

L'étape 13 livrera donc une action d'administration permettant de changer la
zone d'un abonnement, **tracée** — qui, quand, ancienne et nouvelle zone — et
**jamais accessible à l'utilisateur**, sans quoi le gel n'aurait plus aucun sens.

### Q7.1 — epubcheck versionné, test inconditionnel

Le problème n'était pas le réseau : c'était qu'un `npm install` **réussisse**
alors que le validateur est absent. Une intégration continue aurait été verte
sans rien valider — pire que pas de test, puisque le tableau de bord affirmait
le contraire.

Le validateur est versionné sous `vendors/epubcheck/` (34 Mo, licence BSD à
trois clauses), la dépendance npm est retirée, et le test s'exécute toujours.
**La suite ne comporte plus aucun test ignoré, et l'EPUB produit passe la
validation W3C sans la moindre erreur.**

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

### R1 — Privilèges de `service_role` (étape 1 reprise à l'étape 2)

**Migration corrective `20260728000011_service_role_grants.sql`.** Aucune
migration appliquée n'a été modifiée, conformément à CLAUDE.md.

**Pourquoi c'était nécessaire.** Les tables créées par les migrations 0002 à
0009 n'accordaient à `service_role` que `REFERENCES`, `TRIGGER` et `TRUNCATE` —
ni `SELECT`, ni `INSERT`, ni `UPDATE`, ni `DELETE`. Toute lecture de
`public.users` par le serveur échouait en « permission denied for table users ».
Sans correction, aucune route de l'étape 2 ne pouvait fonctionner.

**Origine, vérifiée et non supposée.** Ce n'est pas une conséquence des
révocations de la migration 0010, qui ne visaient qu'`anon` et `authenticated`.
Les privilèges par défaut du rôle `postgres` dans le schéma `public` — celui
sous lequel les migrations s'exécutent — n'accordent à `service_role` que
`Dxtm`. Contrôlé empiriquement : une table créée à l'instant dans `public`
recevait exactement les mêmes privilèges partiels.

**Pourquoi le défaut a échappé à l'étape 1.** `service_role` n'y était sollicité
que par l'API d'administration de Supabase Auth, qui ne passe pas par PostgREST.
La première lecture d'une table par le serveur a eu lieu à l'étape 2. Les 96
tests de l'étape 1 étaient donc verts sur un socle qui n'aurait pas tenu — un
rappel utile de ce qu'un test ne couvre pas tant qu'il n'exerce pas le chemin
réel.

**Portée.** Octroi explicite à `service_role` sur les tables existantes et sur
les tables futures, plus les séquences. Aucun changement pour `anon` ni
`authenticated`, qui conservent les privilèges restreints de la migration 0010.

**Vérification.** `npm run verify` relancé **en entier** : code 0, 142 tests,
dont les 96 de l'étape 1. Cycle complet rejoué depuis une base vierge.

---

### R2 — Effacement de compte : anonymisation et conservation comptable

**Migrations `…0012_no_cascade_from_users`, `…0013_invoices`,
`…0014_anonymize_and_purge`.** Demandé par le client, en remplacement de la
cascade retenue à l'étape 1.

**Le principe.** Le droit à l'effacement et les obligations comptables ne
s'opposent pas : l'article 17.3.b du RGPD écarte l'effacement lorsque la
conservation répond à une obligation légale. Deux périmètres, et non un
arbitrage : les **données de compte**, effaçables, et les **pièces
comptables**, conservées puis purgées à échéance.

**Ce qui change.**

| Décision | Mise en œuvre |
|---|---|
| Aucune suppression physique d'utilisateur | Toutes les clés étrangères vers `users` passent en `on delete restrict`. Un test énumère `pg_constraint` et échoue s'il subsiste une cascade |
| `public.users` détaché de `auth.users` | La clé étrangère est retirée. C'est ce détachement qui permet de supprimer l'identité d'authentification en conservant la ligne métier — et qui libère l'ancienne adresse email |
| `users.statut ∈ {actif, suspendu, anonymise}` et `users.anonymise_le` | Remplacent le booléen `suspendu`. `anonymise` est un état **terminal**, imposé par un déclencheur : aucune réactivation, même par le serveur |
| Table `invoices` immuable | Numérotation **sans trou** par compteur verrouillé, une séquence PostgreSQL laissant des trous à chaque transaction annulée. `UPDATE` refusé par déclencheur, `DELETE` conservé — c'est par lui que passe la purge, elle-même une obligation |
| La facture porte sa propre copie de l'identité | `facture_nom`, `facture_email`, `facture_adresse` figés à l'émission, jamais resynchronisés. C'est précisément ce qui rend l'anonymisation possible |
| `anonymize_user(uuid)` | Une seule transaction, idempotente. Efface `entitlements`, `reading_progress`, `download_logs`, `favorites`, panier ; remplace l'email par un jeton non réversible ; supprime l'identité d'authentification ; conserve `orders`, `order_items`, `subscriptions`, `invoices` |
| Jeton d'anonymisation tiré au hasard, non haché | Un hachage de l'adresse resterait vulnérable à une attaque par dictionnaire, l'espace des adresses email étant énumérable |
| `purge_expired_invoices(timestamptz)` | Facture échue, puis commande devenue sans facture, puis compte anonymisé devenu orphelin. Instant paramétrable : les tests avancent l'horloge de onze ans plutôt que d'attendre |
| `INVOICE_RETENTION_YEARS`, défaut 10 | Le pays d'immatriculation n'est pas arrêté (§16.2 point 6). La valeur est figée sur chaque facture à l'émission : la modifier n'affecte aucune facture déjà émise |
| Table `favorites` créée (§4.2 F7) | La procédure d'anonymisation doit l'effacer. Une procédure qui oublierait une table de données personnelles donnerait l'illusion de la conformité |
| Information préalable | `GET /api/account/anonymize` renvoie ce qui est effacé, ce qui est conservé, la durée et le caractère irréversible. Source unique, destinée à l'écran de confirmation comme à la politique de confidentialité |

**Le test qui donne son sens à la correction :** le chiffre d'affaires agrégé,
sur les commandes comme sur les factures, est **strictement inchangé** après
anonymisation. Complété par : reconnexion impossible, jeton en circulation
refusé, réactivation refusée par la base, et ancienne adresse email réutilisable
pour une inscription **neuve** dont l'identifiant diffère de l'ancien.

**Conséquence pour l'étape 14.** Les statistiques s'appuient sur `orders` et
`invoices`, jamais sur `users`. Un test le vérifie déjà.

**Une transparence sur la méthode.** Les migrations 0012 à 0014 ont été
corrigées **en place** après un premier échec — `revoke all … from public`
retire l'exécution à `service_role` aussi, ce qui faisait échouer la route de
suppression. Elles n'avaient alors jamais été commitées ni appliquées ailleurs
que sur la base locale, rejouée intégralement depuis zéro. La règle « jamais de
migration modifiée après application » reste entière pour tout ce qui est
commité, comme l'illustre R1.

**Vérification.** `npm run verify` relancé **en entier** : code 0, 162 tests.
`npm run build` : code 0. Cycle rejoué depuis une base vierge.

---

## 8. Brancher un prestataire réel

*(section rédigée à l'étape 16)*
