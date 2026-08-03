# PLAN-FRONTEND.md — Plan d'implémentation de l'interface

**Édition Mapoukam. Soumis à validation le 2 août 2026.**

Ce plan applique la méthode du backend, qui a fonctionné : une étape à la fois,
tests livrés avec le code, `npm run verify` vert avant de passer à la suivante.

Il s'appuie sur `docs/API-CONTRAT.md`, produit en même temps que ce plan, qui
recense les 55 opérations exposées et **douze manques** — six d'entre eux
empêchant purement et simplement un écran d'exister.

---

## 0. Deux points à trancher avant que j'écrive une ligne

### 0.1 Les maquettes sont absentes

`docs/maquettes/` **n'existe pas dans le dépôt**. La recherche porte sur
l'arborescence complète, hors `node_modules` et `.git` : aucun fichier de
maquette, sous aucun nom.

**Ce que cela ne bloque pas.** L'étape 0 ci-dessous ne produit aucun écran : ce
sont des extensions d'API, dérivées du code livré et de la spécification. Je peux
la faire dès votre accord.

**Ce que cela bloque.** L'étape 1 et tout ce qui suit. « Reconstruis-les en
composants, en respectant leur intention visuelle » suppose de les avoir vues.

**Si elles sont perdues**, dites-le : je proposerai une grammaire visuelle
— échelle typographique, palette, densité, comportement des pastilles de filtre —
à valider avant l'étape 1. C'est un aller-retour de plus, pas une impasse.

### 0.2 `CLAUDE.md` contredit cette mission, et doit être corrigé

`CLAUDE.md`, section « Ce qu'il ne faut pas faire », dit aujourd'hui :

> Ne crée pas d'interface utilisateur, sauf la console de simulation `/dev` […]
> Ce chantier est **backend**.

La mission demande l'inverse. Je ne tranche pas seul, conformément à la règle du
fichier lui-même — mais je signale que **la spécification donne raison à la
mission** : `docs/cahier-des-charges.md` §4.1 et §4.2 décrivent treize écrans de
front-office, et §5.3 fixe un objectif WCAG 2.1 AA qui n'a de sens que sur une
interface.

**Ma proposition, à l'étape 0 :** remplacer cette ligne par une délimitation de
périmètre — front-office et back-office **oui**, SDK de service externe
**toujours non**, `docs/cahier-des-charges.md` **toujours pas modifiable**. Les
règles de sécurité 1 à 7 restent intégralement en vigueur et s'appliquent à
l'interface.

Sans cette correction, la prochaine session lira « ne crée pas d'interface » et
défera le travail.

---

## 1. Règles permanentes reprises du backend

Elles s'appliquent **intégralement**, sans adaptation.

| Règle | Où elle est écrite | Ce qu'elle devient côté frontend |
|---|---|---|
| **Aucun test non exécuté** | `scripts/porte-tests.mjs` | Les tests de composant et de bout en bout entrent dans le même décompte. Aucune liste blanche |
| **Effectif par fichier** | `tests/effectif-attendu.json` | Chaque nouveau fichier de test y est inscrit. Une baisse est rouge |
| **Tout test doit prouver qu'il peut échouer** | `docs/PLAN.md` §5 sexies | Contre-test, garde d'effectif, ou mutation consignée au commit. Voir §1.1 |
| **Extraction verbatim** | `docs/PLAN.md` §5 decies | S'étend aux **composants** : un composant redéclaré ou déplacé est extrait par script, jamais réécrit de mémoire. `npm run diff:sql` gagne un équivalent |
| **Fixture aussi forte que ce qu'elle représente** | `docs/PLAN.md` §5 sexies | Pas de « livre bidon » : les tests d'interface consomment le **corpus réel**, servi par la base locale |
| **Une dépendance qui dégrade la validation doit échouer à l'installation** | `docs/PLAN.md` §5 sexies | Les navigateurs Playwright sont installés par un script vérifié, jamais « si disponible » |
| **`npm run verify` vert avant l'étape suivante** | `CLAUDE.md` | Inchangé |

### 1.1 Ce que « prouver qu'il peut échouer » veut dire sur une interface

C'est là que la règle est le plus facile à trahir, parce qu'un rendu de composant
produit toujours *quelque chose*.

- Un test qui vérifie qu'un bouton de téléchargement **est absent** pour un
  abonné doit être accompagné du test qu'il **est présent** pour un acheteur.
  Sans lui, un composant qui ne rend rien du tout passerait les deux.
- Un test qui parcourt une collection découverte (routes, pages, clés de
  traduction) affirme d'abord sa **taille**.
- Un test d'accessibilité qui ne trouve aucune violation sur une page vide ne
  prouve rien : il affirme d'abord que la page a rendu son contenu attendu.

### 1.2 Une seule implémentation, des deux côtés du réseau

**Les pages serveur appellent les mêmes modules `src/lib/*` que les routes API.**
Elles ne réimplémentent aucune décision.

C'est la reprise directe de `docs/PLAN.md` §5 quinquies : trois fois dans ce
projet, une logique d'autorisation présente à deux niveaux a rendu des verdicts
opposés. Le frontend ajoute un troisième niveau — le navigateur — et c'est
exactement là que la divergence coûterait le plus cher.

Un test d'architecture, livré à l'étape 1, échoue si un fichier sous `src/app`
hors `api/` :

- importe `createServiceClient` ;
- calcule une décision d'accès au lieu de lire `acces` ;
- formate un montant au lieu d'afficher `prix.affichage` ;
- compare une date de l'API à `new Date()`.

---

## 2. Décisions techniques proposées

Chacune est un choix, pas une évidence. Dites-moi si vous en voulez une autre.

| Sujet | Proposition | Pourquoi, et l'alternative écartée |
|---|---|---|
| **Styles** | CSS Modules + variables CSS natives | Zéro dépendance, zéro risque de licence, et les jetons de design deviennent des `custom properties` lisibles par le navigateur. *Écarté :* Tailwind (MIT, plus rapide à écrire, mais une couche de plus et des classes illisibles dans un rapport de revue) |
| **Internationalisation** | `next-intl` (MIT) | Gère le routage par langue, les `hreflang` et le repli, tous trois exigés par §5.4 et §5.5. *Écarté :* i18n maison — le routage et les `hreflang` sont précisément la partie qu'on rate à la main |
| **État serveur** | `fetch` dans les Server Components, Server Actions pour les mutations | Aucun client HTTP à installer, aucun jeton dans le navigateur. *Écarté :* TanStack Query — utile, mais superflu quand les cookies sont `HttpOnly` et le rendu serveur |
| **Tests de composant** | Vitest + `@testing-library/react` + `jsdom` (tous MIT) | Même exécuteur que la suite existante, donc **même porte de validation**. Un second exécuteur serait un second endroit où un test peut être ignoré |
| **Tests de bout en bout** | Playwright (Apache-2.0) | Demandé par la mission |
| **Performance** | Lighthouse CI (Apache-2.0) | Demandé par la mission |

### 2.1 Une licence à arbitrer — `axe-core`

Le test d'accessibilité automatisé demandé à l'étape 14 passe, en pratique, par
**`axe-core`**, qui est sous **MPL-2.0**.

`CLAUDE.md` exige « MIT, Apache 2.0, BSD ». **MPL-2.0 n'y figure pas.**

**Ce que je peux en dire.** MPL-2.0 est un copyleft *au fichier* : il n'a pas
l'effet de l'AGPL, qui est la raison de l'interdiction stricte de PyMuPDF et
d'ebooklib. Utilisé en **dépendance de développement**, `axe-core` n'est jamais
distribué avec l'application et aucun de ses fichiers n'est modifié.

**Je ne l'installe pas sans votre accord.** Trois issues :

1. **Accepter MPL-2.0 en dépendance de développement uniquement**, et l'écrire
   dans `CLAUDE.md` comme une exception nommée et bornée. *C'est ce que je
   recommande.*
2. **Refuser**, et écrire les contrôles à la main : contraste calculé,
   `aria-label` présents, ordre de tabulation, cibles tactiles. Couvre peut-être
   la moitié de ce qu'`axe` détecte, pour plusieurs jours de travail.
3. **Refuser**, et sortir l'accessibilité de la porte de validation, comme
   l'audit EPUB. *Je le déconseille* : l'audit EPUB tourne sur seize fichiers
   figés, l'accessibilité se dégrade à chaque composant modifié.

---

## 3. Les étapes

Quinze étapes. Votre séquence est respectée ; **votre étape 0 est scindée en
deux** — les extensions d'API d'un côté, le socle d'interface de l'autre. Les
mélanger reviendrait à valider du backend et du frontend sous un seul verify, et
à ne plus savoir lequel a cassé quoi.

Numérotation : `F0` à `F14`, pour ne pas se confondre avec les seize étapes du
backend.

---

### F0 — Extensions d'API — ✅ LIVRÉE le 3 août 2026

> **`npm run verify` : 1 056 tests dans 58 fichiers, aucun ignoré.**
>
> Douze manques traités. Trois défauts du backend livré trouvés en chemin, tous
> par des tests que cette étape a écrits :
>
> | Défaut | Portée |
> |---|---|
> | Aucune route de rafraîchissement | La session ne tenait pas une heure |
> | `library_for_user` rendait `'offert'` sans aucun droit | Un titre seulement LU s'affichait comme possédé |
> | La même fonction nommait `page_reprise` là où la route lisait `derniere_page` | La reprise de lecture n'aurait jamais fonctionné, sans erreur |
>
> Deux règles permanentes en découlent : `docs/PLAN.md` §5 duodecies (ce qu'un
> système extérieur applique échappe à l'horloge) et §5 quaterdecies (quelle
> horloge pour quelle colonne).

**Objectif.** Livrer les six manques bloquants et quatre des dégradants recensés
en §4 de `docs/API-CONTRAT.md`. **Aucun écran.** C'est du backend, avec le
harnais de test du backend.

**Pourquoi maintenant et pas en cours de route.** Parce que dans trois semaines,
face à une page d'offres sans route de tarifs, la solution la moins coûteuse sera
d'écrire `7,99 €` dans un composant. Ce serait une seconde source de prix —
exactement ce que la décision D4 a supprimé pour les livres, et pour la même
raison.

**Fichiers produits**

- `supabase/migrations/…_catalogue_fenetre_abonnement.sql` — ajoute
  `abonnement_a_partir_du` à `access_for_books` et `catalog_list`, calculé par
  `fenetre_de_vente_ecoulee`, **la fonction du moteur de droits**, pas une copie.
  Redéclarations par **extraction verbatim** (§5 decies), diff produit.
- `supabase/migrations/…_facettes_catalogue.sql` — `catalog_facets()`.
- `supabase/migrations/…_bibliotheque.sql` — `library_for_user()`, droits résolus
  **en lot**.
- `src/app/api/auth/refresh/route.ts`, `src/app/api/auth/session/route.ts`
- `src/app/api/library/route.ts`
- `src/app/api/favorites/route.ts`, `src/app/api/favorites/[bookId]/route.ts`
- `src/app/api/offers/route.ts`, `src/app/api/time/route.ts`
- `src/app/api/catalog/facets/route.ts`
- `src/app/api/orders/[id]/invoice/route.ts`
- `src/lib/storage/covers.ts` — `urlsCouverture()`, seule autorité sur la
  construction d'URL publique
- Modifications : catalogue (`couverture`, `favori`), commandes (`slug`, `titre`,
  `numero_facture`), listes d'administration (`total`, `pages`)
- Tests : `tests/integration/api-frontend.test.ts`,
  `tests/security/routes-frontend.test.ts`

**Dépendances.** Aucune. Base locale démarrée.

**Critères d'acceptation**

```bash
npm run verify                 # 0, effectif en hausse, aucun test ignoré
npm run diff:sql               # une redéclaration = un diff lisible, aucune ligne de code perdue
```

- `tests/security/revue-finale.test.ts` couvre les nouvelles routes **sans
  modification** : elles sont découvertes sur le disque. Chacune est gardée, ou
  inscrite dans `PUBLIQUES` avec une raison écrite.
- Un test prouve que `POST /api/auth/refresh` **échoue** sans cookie de
  rafraîchissement — le contre-test du cas nominal.
- Un test prouve que `GET /api/library` de A ne rend **jamais** un titre de B.
- Un test prouve qu'`abonnement_a_partir_du` et le moteur de droits **s'accordent
  sur les mêmes entrées** : c'est le format imposé par §5 quinquies pour toute
  règle présente à deux endroits.
- `GET /api/orders/{id}/invoice` répond **404** sur la facture d'autrui, jamais
  403.

---

### F1 — Socle d'interface — ✅ LIVRÉE le 3 août 2026

> **`npm run verify` : 1 124 tests dans 62 fichiers, aucun ignoré.**
>
> Trois défauts trouvés en écrivant les tests avant les composants :
>
> | Défaut | Où |
> |---|---|
> | `--creme-accent` à 2,95:1, sous le seuil AA | Palette des maquettes |
> | Région Afrique centrale à 4,48:1 | Palette des maquettes |
> | Onze codes d'erreur d'API sans traduction | Dictionnaires |
>
> Un quatrième, de mon fait : j'avais annoncé 9,6:1 pour l'encre sur le jaune
> d'action. Mesuré, c'est **8,43:1**.
>
> Un troisième projet Vitest — `composants`, en `jsdom` — entre dans **la même
> porte** que le reste. Un second exécuteur aurait été un second endroit où un
> test peut être ignoré sans que la porte le voie.

### F1 (référence) — Socle d'interface : types, jetons, langues, états

**Objectif.** Tout ce dont les écrans dépendent, et aucun écran.

**Fichiers produits**

- `src/domain/api/contract.ts` — enveloppes de réponse **dérivées** des types
  existants (`AccessDecision`, `EntreeCatalogue`, …), jamais réécrites
- `scripts/verifier-contrat-api.mjs` — échoue si une route rend une forme non
  déclarée
- `src/design/tokens.css` — couleurs, échelle typographique, espacements, rayons,
  ombres, points de rupture. **Contrastes AA vérifiés par test, pas à l'œil**
- `src/i18n/` — `fr.json`, `en.json`, configuration `next-intl`, `hreflang`
- `src/components/etats/` — `Chargement`, `Erreur`, `Vide`, `Squelette`
- `src/components/base/` — `Bouton`, `Champ`, `Pastille`, `Pagination`,
  `Tableau`, `Dialogue`
- `src/lib/api/client.ts` — appel serveur unique, rafraîchissement sur 401
  **une seule fois**, traduction de `code` en message
- `vitest.config.ts` — troisième projet `composants` (`jsdom`), délais alignés
- Tests : `tests/composants/base.test.tsx`, `tests/unit/i18n.test.ts`,
  `tests/unit/design-tokens.test.ts`, `tests/unit/frontend-architecture.test.ts`

**Dépendances.** F0.

**Critères d'acceptation**

```bash
npm run verify
npm run contrat:api            # nouveau — le contrat correspond aux routes
```

- **Parité des langues** : un test compare les clés de `fr.json` et `en.json`.
  Une clé absente d'un côté est rouge. Le test affirme d'abord qu'il y a **plus
  de vingt clés** — une comparaison de deux fichiers vides passerait.
- **Contrastes** : un test calcule le ratio de chaque paire texte/fond des jetons
  et exige ≥ 4,5:1 (≥ 3:1 pour le grand texte). **Contre-test** : une paire
  volontairement insuffisante, dans le fichier de test, doit être détectée.
- **Architecture** : le test de §1.2 est livré ici. Il affirme d'abord avoir
  trouvé des fichiers sous `src/app` — un parcours vide ne signale rien
  (`tests/helpers/sources.ts` lève déjà sur ce cas).
- Le troisième projet Vitest est vérifié par `tests/unit/porte-tests.test.ts` :
  ses délais sont alignés, ses fichiers comptés.

---

### F2 — Enveloppe applicative

**Objectif.** Navigation, pied de page, sélecteur de langue, état
d'authentification, gestion globale des erreurs.

**Fichiers produits**

- `src/app/[langue]/layout.tsx`, `src/app/[langue]/error.tsx`,
  `not-found.tsx`, `loading.tsx`
- `src/components/enveloppe/` — `Entete`, `PiedDePage`, `SelecteurLangue`,
  `MenuCompte`, `BanniereErreur`
- `src/middleware.ts` — langue depuis l'URL puis `langue_preferee` puis
  `Accept-Language`, et rafraîchissement de session sur 401
- Tests : `tests/composants/enveloppe.test.tsx`,
  `tests/integration/middleware-langue.test.ts`

**Dépendances.** F1.

**Critères d'acceptation**

```bash
npm run verify
```

- Le sélecteur de langue **conserve la page courante** — `/fr/catalogue/…` →
  `/en/catalogue/…`. Testé sur une route à paramètre, pas seulement sur l'accueil.
- Un visiteur voit « Se connecter » ; un connecté voit son menu. **Les deux
  assertions**, pas seulement la seconde.
- Une erreur serveur affiche `message`, **jamais** un détail technique. Un test
  injecte une réponse 500 et vérifie que la trace n'atteint pas le DOM.
- `error.tsx` se déclenche : un composant qui lève est capturé, pas une page
  blanche.

---

### F3 — Authentification

**Objectif.** Inscription, connexion, mot de passe oublié, vérification d'email.

**Fichiers produits**

- `src/app/[langue]/(auth)/` — `connexion`, `inscription`, `mot-de-passe-oublie`,
  `nouveau-mot-de-passe`, `confirmation`
- `src/components/auth/` — `FormulaireConnexion`, `FormulaireInscription`,
  `ForceMotDePasse`
- Tests : `tests/composants/auth.test.tsx`, `tests/integration/parcours-auth.test.ts`

**Dépendances.** F2, et **Q3 de `docs/API-CONTRAT.md`** tranchée.

**Critères d'acceptation**

```bash
npm run verify
```

- **Les trois indistinguabilités du backend sont préservées dans l'interface.**
  C'est le critère principal de cette étape, et le plus facile à trahir par une
  bonne intention :
  - l'inscription affiche le **même** message que l'adresse soit connue ou non ;
  - la demande de réinitialisation affiche **toujours** « vérifiez votre boîte » ;
  - l'échec de connexion ne dit **jamais** lequel des deux champs est faux.

  Testé par comparaison du DOM rendu dans les deux cas — pas par relecture.
- `email_non_verifie` est le **seul** cas où l'écran nomme la raison, et propose
  de renvoyer l'email.
- Un 429 affiche le délai de `retry-after` et **désactive** le bouton jusqu'à son
  terme.
- Navigation clavier complète, `aria-invalid` et `aria-describedby` sur chaque
  champ en erreur.

---

### F4 — Catalogue

**Objectif.** Grille, filtres, tri, recherche, pagination, et les trois états.

**Fichiers produits**

- `src/app/[langue]/catalogue/page.tsx` — **rendu serveur**, filtres dans l'URL
- `src/components/catalogue/` — `GrilleCatalogue`, `CarteLivre`,
  `BarreFiltres`, `PastilleFiltre`, `SelecteurTri`, `ChampRecherche`
- `src/app/[langue]/sitemap.ts`, `robots.ts`
- Tests : `tests/composants/catalogue.test.tsx`,
  `tests/integration/catalogue-ssr.test.ts`

**Dépendances.** F2, F0 (facettes M8, couvertures M7).

**Critères d'acceptation**

```bash
npm run verify
```

- **Les trois états sont testés séparément** : catalogue rempli, catalogue
  réduit, aucun résultat. Le troisième propose de retirer les filtres — un état
  vide sans issue est un cul-de-sac.
- Les filtres vivent **dans l'URL** : une recherche filtrée est partageable et
  survit au rechargement. Testé par navigation directe sur une URL construite à
  la main.
- **Un titre `achat_hors_zone` reste affiché, seul son achat est désactivé**, avec
  le message de l'API. Contre-test : le même titre dans une zone où il a un prix
  montre le bouton.
- **La carte porte TROIS lignes d'accès, pas deux.** La maquette n'en a que deux
  — un prix, ou « Avec l'abonnement ». La troisième, **« Dans votre
  bibliothèque »**, est ajoutée : ni l'un ni l'autre des deux libellés ne
  convient à quelqu'un qui détient déjà le titre, et **tous deux l'invitent à
  obtenir ce qu'il a déjà**.

  Elle est pilotée par **`acces.reason`**, jamais déduite d'un prix ni d'un
  drapeau, et **prend le pas** sur les deux autres. Trois tests, un par ligne,
  plus un quatrième : un titre `purchase` n'affiche **ni** prix **ni**
  « Avec l'abonnement ». Sans ce dernier, une implémentation qui empilerait les
  trois passerait les trois premiers.

  Deux dimensions se croisent ici et ne doivent jamais être confondues :
  `inclus_abonnement` / `prix` décrivent **le titre**, `acces.reason` décrit
  **l'utilisateur**. Un test d'architecture échoue si un composant de carte lit
  `prix` pour décider d'un libellé d'accès.
- Les couvertures sont servies en `vignette`, avec `width`/`height`, `loading`
  et `sizes`. Un test vérifie qu'aucune image de la grille ne demande la taille
  `fiche` — c'est exactement le gaspillage que §5.1 qualifie de critique.
- La page est rendue **côté serveur** : un test vérifie que le HTML initial
  contient les titres, sans exécution de JavaScript (§5.4).

---

### F5 — Fiche livre

**Objectif.** Toutes les variantes selon les droits, **pilotées par `reason`**.

**Fichiers produits**

- `src/app/[langue]/contes/[slug]/page.tsx` — métadonnées, `hreflang`,
  Schema.org `Book`
- `src/components/fiche/` — `EnteteFiche`, `ActionsFiche`, `SelecteurLangue`,
  `Suggestions`, `BandeauExtrait`
- Tests : `tests/composants/fiche-acces.test.tsx`

**Dépendances.** F4.

**Critères d'acceptation**

```bash
npm run verify
```

- **Une table de vérité complète** : les six valeurs de `reason` × `canRead` ×
  `canDownload`, chacune avec les actions attendues. C'est la matrice de la
  règle métier centrale, et elle est testée exhaustivement, pas par
  échantillonnage.
- **Le test qui compte le plus :** un titre à la fois `gratuit` **et** acheté rend
  `reason: 'purchase'` — l'écran ne doit **jamais** afficher « gratuit » à
  quelqu'un qui a payé.
- **Le second :** un abonné actif (`reason: 'subscription'`, `canDownload:
  false`) ne voit **aucun** bouton de téléchargement, et voit à la place le
  message expliquant que l'achat le donne. Contre-test : un acheteur du même
  titre voit le bouton.
- Un test d'architecture échoue si un composant de fiche **dérive** un droit de
  `reason` au lieu de lire `canDownload`.
- `abonnement_a_partir_du` (M6) pilote « bientôt dans l'abonnement ». Aucun
  calcul de date dans le composant.

---

### F6 — Lecteur en ligne

**Objectif.** Utilisable par un enfant de six ans, seul, sur tablette, à une main
en mobile.

**Fichiers produits**

- `src/app/[langue]/lire/[slug]/page.tsx`
- `src/components/lecteur/` — `Lecteur`, `PageLivre`, `NavigationLecteur`,
  `Sommaire`, `Zoom`, `PleinEcran`, `BasculeLangue`
- `src/lib/lecteur/` — `signature.ts` (renouvellement),
  `prechargement.ts`, `progression.ts` (regroupement)
- Tests : `tests/composants/lecteur.test.tsx`,
  `tests/integration/lecteur-signature.test.ts`

**Dépendances.** F5.

> ### Contrainte de conception — la surveillance de session est PRÉVENTIVE
>
> **Établi par `tests/e2e/session-longue.test.ts` à l'étape F0 :
> `/api/books/[id]/pages/[page]` est une route PUBLIQUE. Elle ne renvoie jamais
> 401 — un jeton mort y vaut « visiteur ».**
>
> Conséquence, et c'est le pire message que la plateforme puisse produire : un
> enfant dont la session meurt en page 12 d'un titre **que ses parents ont
> acheté** ne reçoit pas « reconnectez-vous », mais `403 hors_extrait` —
> « achetez ce titre pour lire la suite ». L'interface accuserait un client de
> ne pas avoir payé ce qu'il a payé, en pleine lecture, sans qu'aucune action
> évidente ne s'offre à lui.
>
> **Trois obligations pour le lecteur, et la troisième est la moins évidente :**
>
> 1. **La validité de session est surveillée indépendamment des réponses aux
>    pages.** Le service des pages n'est pas un signal de session, et ne doit
>    jamais être traité comme tel.
> 2. **Le rafraîchissement est PRÉVENTIF**, déclenché avant l'échéance connue
>    (`expires_in`), jamais en réaction à un premier échec. Sur connexion lente
>    — la condition réelle d'une partie du public — réagir au premier échec
>    arrive déjà trop tard : la page est en vol, l'enfant attend.
> 3. **Un `403 hors_extrait` sur un titre que l'utilisateur possédait au
>    chargement se traite comme une perte de session, jamais comme un refus
>    d'achat.** C'est le filet : si la surveillance préventive a échoué malgré
>    tout, l'interface ne doit pas propager le contresens.

**Critères d'acceptation**

```bash
npm run verify
```

- **Aucun bouton de téléchargement, d'impression ou de partage.** Un test
  parcourt l'arbre rendu et échoue sur la moindre occurrence — et **affirme
  d'abord que l'arbre n'est pas vide**, sinon il passerait sur un composant qui
  ne rend rien.
- **Test de bout en bout obligatoire : session expirée en cours de lecture d'un
  titre ACHETÉ → la lecture continue, et AUCUN message d'achat n'apparaît.** Le
  test affirme d'abord que le titre est bien acheté et bien payant — sur un
  conte gratuit, il passerait sans rien prouver.
- **Une page ouverte longtemps redemande une signature.** Le test avance
  l'horloge simulée au-delà de 300 s et vérifie qu'une **nouvelle** URL est
  demandée. Contre-test : sous 300 s, aucune nouvelle demande — sans quoi un
  composant qui resignerait à chaque rendu passerait le premier test.
- **L'échec d'enregistrement de la progression est invisible.** Un test fait
  échouer `PUT /api/reading/…` et vérifie que la lecture continue, sans message
  d'erreur. **`enregistree: false` ne déclenche aucune reprise** — ce serait
  défaire le regroupement.
- **La page suivante est préchargée.** Testé par l'observation des requêtes, pas
  par relecture du code.
- Navigation par balayage sur mobile, flèches et `Espace` au clavier, zones
  tactiles ≥ 44 px. Le sommaire indique « page 3 sur 5 de l'extrait » quand
  l'accès est partiel, en lisant `lecture`, jamais en comptant.
- La bascule de langue n'apparaît que si plusieurs versions sont publiées, et
  affiche `reprise_depuis` et `ramenee_a_la_fin` quand ils sont renseignés.

---

### F7 — Espace personnel

**Objectif.** Bibliothèque, abonnement, compte, téléchargements.

**Fichiers produits**

- `src/app/[langue]/compte/` — `bibliotheque`, `abonnement`, `commandes`,
  `parametres`, `suppression`
- `src/components/compte/` — `CarteBibliotheque`, `EtatAbonnement`,
  `BoutonTelechargement`, `ListeCommandes`, `NoticeSuppression`
- Tests : `tests/composants/compte.test.tsx`,
  `tests/composants/telechargement.test.tsx`

**Dépendances.** F5, F0 (bibliothèque M2, favoris M3, factures M4).

**Critères d'acceptation**

```bash
npm run verify
```

- **Toutes les combinaisons langue × format sont proposées** pour un titre
  acheté, et le test énumère les versions **publiées** — un titre à deux langues
  offre quatre combinaisons.
- **L'attente est visible.** Le bouton passe en « préparation de votre
  exemplaire », se désactive, et le double-clic ne déclenche pas deux
  générations. Testé par comptage des appels.
- **Un 503 ne propose jamais de repli.** Le test vérifie qu'aucun lien alternatif
  n'apparaît. C'est l'échec fermé, et il doit le rester jusqu'au navigateur.
- **L'état « abonnement expiré + bibliothèque remplie » a son écran, et il doit
  répondre à trois questions sans ambiguïté** :

  | Question | Ce que l'écran doit dire |
  |---|---|
  | **Ce que j'ai perdu** | La lecture en ligne des titres d'abonnement — nommés, pas sous-entendus |
  | **Ce que je garde** | Mes achats, lecture **et** téléchargement, **sans limite de durée** |
  | **Pourquoi** | L'abonnement ouvrait la lecture, jamais le fichier (§3.2) |

  C'est **le cas métier central du projet**, et le bug classique du domaine.
  La maquette de l'espace personnel en fait un état à part entière — huit
  combinaisons, dont celle-ci — et le backend a déjà son test dédié.

  Le test d'interface vérifie qu'un abonné expiré ayant acheté voit ses achats
  **téléchargeables**, et qu'aucun message ne suggère une perte les concernant.
  Contre-test : un abonné expiré **sans** achat voit bien la perte, sans quoi un
  écran qui ne dirait jamais rien passerait le premier.
- L'abonnement affiche `statut`, jamais `statut_rapporte`. `anomalie` est nommé
  et invite à contacter le support — pas « erreur ».
- Après annulation, l'écran dit **jusqu'à quand** l'accès reste ouvert. C'est le
  contresens le plus fréquent du domaine.
- La suppression de compte impose de lire la notice (`GET`) avant de confirmer
  (`POST`).

---

### F8 — Panier, paiement, confirmation

**Objectif.** Le tunnel, sans jamais calculer un montant.

**Fichiers produits**

- `src/app/[langue]/panier/page.tsx`,
  `src/app/[langue]/commandes/[id]/page.tsx`
- `src/components/panier/` — `LignePanier`, `LigneRefusee`, `ChampCodePromo`,
  `RecapitulatifCommande`, `ConfirmationMontant`
- Tests : `tests/composants/panier.test.tsx`,
  `tests/integration/tunnel-achat.test.ts`

**Dépendances.** F7.

**Critères d'acceptation**

```bash
npm run verify
```

- **Le total vient de `PUT /api/orders`, jamais d'une addition.** Un test
  d'architecture échoue sur toute opération arithmétique portant sur
  `prix_unitaire` dans `src/app` ou `src/components`. C'est le piège le plus
  probable de tout ce plan.
- **Les quatre motifs de refus de ligne ont quatre messages distincts**, et
  `deja_possede` propose **d'aller lire** le titre, pas de le retirer.
- **Les six motifs de refus de code promo sont affichés.** Un code écarté en
  silence est perçu comme une panne.
- `409 confirmation_requise` affiche l'ancien et le nouveau montant, et exige un
  geste explicite. Aucun montant ne change silencieusement.
- **La page de confirmation interroge la commande.** Un test prouve qu'arriver
  sur l'URL de succès **sans webhook** affiche « paiement en cours de
  confirmation », **jamais** un accès accordé. C'est la règle 5 de `CLAUDE.md`,
  vérifiée jusque dans l'interface.

---

### F9 — Page des offres

**Objectif.** Les deux modèles, et la variante « abonnement pas encore ouvert ».

**Fichiers produits**

- `src/app/[langue]/offres/page.tsx`
- `src/components/offres/` — `CarteOffre`, `ComparatifOffres`,
  `BanniereAbonnementFerme`
- Tests : `tests/composants/offres.test.tsx`

**Dépendances.** F8, F0 (tarifs M5).

**Critères d'acceptation**

```bash
npm run verify
```

- Tous les montants viennent de `GET /api/offers`. Un test d'architecture échoue
  sur tout littéral ressemblant à un prix dans ce répertoire.
- **La séparation des deux modèles est explicite** : l'abonnement dit qu'il donne
  la lecture en ligne et **pas** le téléchargement. C'est la règle métier
  centrale, et cette page est le premier endroit où un client la lit.
- La variante « pas encore ouvert » est pilotée par un réglage serveur, **jamais
  par un compteur de titres calculé côté client**.

> **Point d'arbitrage.** Le seuil commercial d'ouverture — 30 à 40 titres, §3.3 —
> **n'existe nulle part dans le code**, délibérément (S5 de
> `docs/AVANT-MISE-EN-PRODUCTION.md`). Il faut donc un interrupteur.
> Je propose `business_settings.abonnement_ouvert`, réglable depuis
> l'administration et tracé comme les autres leviers commerciaux. **Confirmez
> avant F9**, ou dites-moi si vous préférez ouvrir l'abonnement d'emblée.

---

### F10 — Pages éditoriales

**Objectif.** À propos, FAQ, CGV/CGU, confidentialité, contact.

**Fichiers produits**

- `src/app/[langue]/(editorial)/` — cinq pages
- `src/components/editorial/` — `PageEditoriale`, `FormulaireContact`, `Faq`
- `src/content/{fr,en}/` — contenus versionnés en Markdown
- Tests : `tests/composants/editorial.test.tsx`

**Dépendances.** F2, F0 (contact M10).

**Critères d'acceptation**

```bash
npm run verify
```

- **Chaque page existe dans les deux langues.** Un test parcourt le dossier de
  contenu et échoue sur toute page présente d'un seul côté — et affirme d'abord
  avoir trouvé au moins cinq pages.
- Le formulaire de contact honore son quota et affiche `retry-after`.
- **Aucune donnée d'enfant n'est demandée nulle part** — ni prénom, ni âge, ni
  date de naissance. Un test parcourt les libellés de tous les formulaires du
  dépôt et échoue sur les termes correspondants. Règle 7 de `CLAUDE.md`, tenue
  jusque dans l'interface, où elle se perd d'ordinaire.

---

### F11 — Administration : catalogue et ingestion

**Objectif.** F10 de la spécification, et le patron dont F12 héritera.

**Fichiers produits**

- `src/app/[langue]/admin/` — `layout.tsx`, `tableau-de-bord`, `contes`,
  `contes/[id]`, `ingestion`
- `src/components/admin/` — `TableauAdmin`, `FiltresPastilles`,
  `PaginationAdmin`, `DepotPdf`, `ListeManques`, `BasculeLevier`
- Tests : `tests/composants/admin-catalogue.test.tsx`,
  `tests/security/admin-interface.test.ts`

**Dépendances.** F7.

**Critères d'acceptation**

```bash
npm run verify
```

- **Un non-administrateur n'atteint aucun écran d'administration.** Le test
  **énumère** les pages découvertes sur le disque plutôt que d'en échantillonner
  trois — une page ajoutée demain est couverte sans que personne n'y pense.
  Contre-test : un administrateur n'est refusé par **aucune** d'entre elles,
  sinon deux pages cassées passeraient les tests de rejet.
- Les `manques[]` sont affichés **avant** la tentative de publication. L'éditeur
  voit ce que la base refusera, il ne le découvre pas au moment de publier.
- **Un lot dont un titre est incomplet est refusé en entier**, et l'écran renvoie
  vers les manques. Publier trente-neuf titres sur quarante serait pire qu'un
  refus : il faudrait deviner lesquels sont passés.
- `gratuit`, `inclus_abonnement`, `disponible_achat` sont **trois interrupteurs
  indépendants**. Un test vérifie qu'aucun n'en pilote un autre.
- Le dépôt de PDF affiche la progression, refuse au-delà de 100 Mo **avant
  l'envoi**, et signale `couche_texte: false` — un PDF scanné produit des pages
  muettes, et l'éditeur doit l'apprendre là, pas après la mise en ligne.

---

### F12 — Administration : utilisateurs, commandes, abonnements, codes promo

**Objectif.** Les quatre écrans sans maquette, bâtis sur le patron de F11.

**Fichiers produits**

- `src/app/[langue]/admin/` — `comptes`, `commandes`, `abonnements`, `codes-promo`
- `src/components/admin/` — `FormulaireOctroi`, `FormulairePromo`,
  `DialogueRemboursement`, `BadgeAnomalie`
- Tests : `tests/composants/admin-commerce.test.tsx`,
  `tests/security/admin-reidentification.test.ts`

**Dépendances.** F11.

**Critères d'acceptation**

```bash
npm run verify
```

Les quatre points de la mission, chacun avec son test :

1. **La liste des commandes ne rend jamais l'identité de facturation.** Le test
   parcourt le DOM rendu d'une commande dont le compte est **réellement
   anonymisé** et échoue sur toute occurrence de nom ou d'adresse. Il affirme
   d'abord que la ligne s'affiche — un tableau vide passerait. **Aucun lien ne
   mène d'une commande vers un compte anonymisé** : ce n'est pas la conservation
   qui ré-identifie, c'est la jointure, et un lien est une jointure faite à la
   main.
2. **Les abonnements affichent `statut_observe`**, et les anomalies sont **en
   tête**, avec leur ancienneté en heures. Une anomalie de deux heures est un
   webhook en retard ; de trois semaines, un défaut d'intégration. Contre-test :
   filtrer sur `anomalie` rend bien des lignes — un filtre sur le statut stocké
   n'en rendrait aucune.
3. **Le motif d'octroi est obligatoire**, le bouton reste inerte sans lui, et
   l'écran **affiche** que l'action est tracée. Contre-test : la soumission sans
   motif est refusée côté serveur aussi.
4. **Le formulaire de code promo bascule entre les deux formes.** Montant fixe →
   zone **et** devise obligatoires ; pourcentage → ni l'une ni l'autre, avec la
   mention qu'il vaut dans toutes les zones. Les deux refus serveur ont leur
   test : sans eux, on créerait des codes inutilisables.

---

### F13 — Administration : statistiques

**Objectif.** F13 de la spécification, sans jamais consolider ni ré-identifier.

**Fichiers produits**

- `src/app/[langue]/admin/statistiques/page.tsx`
- `src/components/admin/stats/` — `SelecteurPeriode`, `TableauDevise`,
  `GraphiqueBarres`, `MentionSeuil`
- Tests : `tests/composants/admin-stats.test.tsx`

**Dépendances.** F12.

**Critères d'acceptation**

```bash
npm run verify
```

- **Aucun total consolidé n'est affiché nulle part.** Un test d'architecture
  échoue sur toute addition de montants dans ce répertoire. Additionner des euros
  et des francs CFA ne produit pas un chiffre approximatif : il n'en produit
  aucun.
- **`sous_le_seuil` affiche « masqué, effectif insuffisant », jamais zéro.** Un
  zéro serait un mensonge : il y a des lecteurs, ils sont trop peu nombreux pour
  être comptés sans les nommer. Contre-test : au-dessus du seuil, le nombre
  s'affiche.
- Les bornes de période viennent de l'horloge métier (M6). Une période de plus de
  trois ans affiche le refus de l'API, sans le contourner.
- Les graphiques sont **accessibles** : chaque valeur est aussi lisible sous
  forme de tableau, avec un résumé textuel. Un graphique seul n'est pas
  consultable au lecteur d'écran.

---

### F14 — Accessibilité, performance, durcissement, bout en bout

**Objectif.** Ce qui ne peut être mesuré qu'une fois tous les écrans livrés.

**Fichiers produits**

- `tests/e2e/ui-achat.spec.ts`, `tests/e2e/ui-abonnement.spec.ts`
- `tests/e2e/accessibilite.spec.ts`
- `playwright.config.ts`, `lighthouserc.json`
- `scripts/porte-e2e.mjs` — la porte, étendue aux tests de bout en bout
- Tests : `tests/unit/porte-e2e.test.ts`

**Dépendances.** F13. Base locale démarrée, navigateurs Playwright installés
**par un script vérifié** — jamais « si disponible » (§5 sexies).

**Critères d'acceptation**

```bash
npm run verify
npm run test:e2e               # les deux parcours, par l'interface réelle
npm run test:a11y              # chaque page publique
npm run lighthouse             # catalogue et fiche livre, mobile
```

**Parcours d'achat** — inscription, catalogue, panier, paiement, téléchargement.
**Parcours d'abonnement** — essai, lecture, renouvellement, échec, grâce,
annulation, expiration, perte d'accès aux titres d'abonnement, **conservation des
achats**.

> **Le dernier point est le bug classique du domaine**, et il exige la même
> précaution que le parcours backend équivalent : le titre acheté doit être
> **hors abonnement**. S'il était couvert par les deux, l'accès qui subsiste
> après expiration pourrait venir de l'un ou de l'autre — et ne prouverait rien.

- **Aucun appel direct à l'API dans ces tests.** Seule la console `/dev` pilote
  les événements, exactement comme un prestataire réel le ferait. Un test de la
  porte échoue si un fichier `.spec.ts` appelle une route hors `/api/dev`.
- **Lighthouse mobile > 85** sur le catalogue et la fiche livre. Le seuil est un
  **échec**, pas un avertissement.
- **Zéro violation `axe` sérieuse ou critique** sur chaque page publique. Le test
  affirme d'abord que la page a rendu son contenu attendu.
- **Rendu vérifié sur connexion lente simulée** (profil 3G, Playwright). C'est la
  condition réelle d'une partie de l'audience, pas un cas limite. Deux mesures :
  le catalogue s'affiche, et le lecteur enchaîne deux pages sans attente visible
  grâce au préchargement.
- Navigation clavier complète de bout en bout : un parcours d'achat entier **sans
  souris**.

**Livrables documentaires**, dans l'esprit de l'étape 16 du backend :

- `docs/AVANT-MISE-EN-PRODUCTION.md` gagne une section **interface**, dans les
  mêmes trois catégories.
- `docs/ETAT-DES-LIEUX.md` gagne la couverture frontend, ses angles morts, et ce
  que je referais autrement.

---

## 4. Récapitulatif

| # | Étape | Dépend de | Écrans |
|---|---|---|---|
| F0 | Extensions d'API | — | aucun |
| F1 | Socle : types, jetons, langues, états | F0 | aucun |
| F2 | Enveloppe applicative | F1 | — |
| F3 | Authentification | F2 | 5 |
| F4 | Catalogue | F2, F0 | 1 (3 états) |
| F5 | Fiche livre | F4 | 1 (6 variantes) |
| F6 | Lecteur en ligne | F5 | 1 |
| F7 | Espace personnel | F5, F0 | 5 |
| F8 | Panier, paiement, confirmation | F7 | 2 |
| F9 | Page des offres | F8, F0 | 1 (2 variantes) |
| F10 | Pages éditoriales | F2, F0 | 5 |
| F11 | Admin : catalogue et ingestion | F7 | 4 |
| F12 | Admin : comptes, commandes, abonnements, promos | F11 | 4 |
| F13 | Admin : statistiques | F12 | 1 |
| F14 | Accessibilité, performance, bout en bout | F13 | — |

---

## 5. Ce que j'attends de vous pour démarrer

| # | Point | Bloque |
|---|---|---|
| **1** | **Les maquettes** — dossier absent | F1 et tout ce qui suit. **Pas F0** |
| **2** | **Correction de `CLAUDE.md`** — « ne crée pas d'interface » | Tout, dès la prochaine session |
| **3** | **`axe-core` en MPL-2.0** — accepter en dépendance de développement, ou non | F14 seulement |
| **4** | **Q2** — connexion Google : je la considère hors périmètre | F3 |
| **5** | **Q3** — `POST /api/auth/session` pour la vérification d'email | F0 et F3 |
| **6** | **Seuil d'ouverture de l'abonnement** — `business_settings.abonnement_ouvert` | F9 |
| **7** | **Validation de ce plan** | Tout |

**Les points 1, 3, 4 et 6 ne bloquent pas F0.** Sur votre seul accord de
principe, je peux enchaîner l'étape F0 — les six manques bloquants d'API — et
vous rendre compte pendant que les maquettes sont retrouvées.
