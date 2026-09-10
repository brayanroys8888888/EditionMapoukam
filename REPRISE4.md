# REPRISE 4 — refonte V3 : pages intermédiaires et éléments interactifs

**Session** `editionmapoukam-5c` — branche `livret-pedagogique` — 7 septembre 2026.
Ce fichier est le point de reprise **de cette session-là**. Il ne remplace ni
`REPRISE.md` (le point de reprise vivant du dépôt) ni `docs/REFONTE-V3.md` (la
doctrine de la refonte) : il dit **où j'en suis exactement**, ce qui est fait,
ce qui reste, et les pièges déjà payés.

---

## 0. La demande, mot pour mot

> « On va continuer avec la refonte du site mais des pages intermédiaires
> (profil, authentification) et des éléments interactifs (panier, recherche,
> menu version mobile, ajout au panier). Le design du site doit être pixel
> parfait à celui de la maquette qui est dans mon projet Claude Design
> "Refonte design complète du site" […] le site doit être pixel parfait à la
> dimension près, aucun écart ne sera toléré et toutes les interactions doivent
> être fonctionnelles et fluides sans recharger la page […] pour plus de détail
> consulter le dossier `design_handoff_edition_mapoukam` à la racine. »

Quatre exigences, à relire avant chaque décision :

1. **écrans intermédiaires** — profil (`/[langue]/compte`) et authentification ;
2. **éléments interactifs** — panier, recherche, menu mobile, ajout au panier ;
3. **cote au pixel**, mesurée, pas estimée ;
4. **aucun rechargement de page** pendant une interaction.

### Les sources

| Source | Où |
| --- | --- |
| Projet Claude Design | `b41ce6a2-73cb-4d17-bb4f-8582be43d7e0` (serveur MCP `claude-design`) |
| Système de design « Organic » | `43e17a9c-ce03-434c-b361-bb9598bec180` |
| Prototype **bureau** | `design_handoff_edition_mapoukam/Site EditionMapoukam.dc.html` — 2368 lignes |
| Prototype **mobile** | `design_handoff_edition_mapoukam/Site EditionMapoukam Mobile.dc.html` — 1027 lignes |
| Documents | `01-design-tokens.md` … `11-realtime-behaviour.md` + `README.md` |

**Les prototypes font autorité quand un document les contredit** (cf.
`docs/REFONTE-V3.md` §2). Ils ne font jamais autorité sur une donnée, un prix,
un droit ou une règle métier — `CLAUDE.md` tranche, et les six écarts assumés
sont listés dans `docs/REFONTE-V3.md` §2.

---

## 1. État à la seconde où je m'arrête

```
npx tsc --noEmit                                   → 0, propre
npx eslint src/components/{auth,panier,toast,enveloppe} \
           src/components/v2/tiroir-panier.tsx     → 0, propre
```

Ces deux commandes étaient **en vol** au moment de la coupure de la session
précédente ; elles sont revenues vertes. Le faux positif signalé par la session
`editionmapoukam-0c` (`inscription.tsx:140`, `conditionsAcceptees` non utilisé)
était un état transitoire entre deux de mes éditions — la case est rendue,
lignes 224-240 de `src/components/auth/inscription.tsx`.

`npm run verify` a été passé le 7 septembre. Bilan honnête :

- **`typecheck` → 0, propre.**
- **`lint` → échoue, mais PAS sur ce lot.** Vingt erreurs, toutes dans trois
  brouillons d'une AUTRE session : `scripts/tmp-app-assoc.mjs`,
  `scripts/tmp-assoc-variantes.mjs`, `scripts/tmp-mq-assoc.mjs` (`document`,
  `window`, `setTimeout` non définis — du code de navigateur dans des scripts
  Node). Non suivis par git, datés du jour. **Je ne les ai pas effacés.**
  `npx eslint src/components/auth src/i18n scripts/releve-v3.mjs` sort à 0.
- **`test` → 1755 réussis, 8 échoués, 0 ignoré** (lancé séparément, puisque
  `lint` arrête `verify` avant).

### Les huit échecs, un par un

**Un seul était de moi, et il est corrigé.**

1. `tests/unit/design-tokens.test.ts` — « aucune couleur littérale hors du
   fichier de jetons ». **C'ÉTAIT MOI.** Le test lit le TEXTE BRUT des
   fichiers, commentaires compris, et cherche `#[0-9a-fA-F]{3,8}`. Mes
   encadrés citaient des hexadécimaux pour justifier une teinte
   (« `--ground-2` vaut #efe3cd »). Réécrits sans croisillon. **Le test
   repasse : 79/79.**

   *La leçon, pour la prochaine fois :* dans ce dépôt, **on ne cite pas un
   hexadécimal dans un commentaire**, même pour expliquer d'où vient un
   jeton. C'est contre-intuitif — le commentaire n'est pas du style — mais le
   test ne sait pas distinguer, et c'est précisément ce qui le rend
   incontournable.

2. `tests/unit/middleware.test.ts` — « un échec réseau NE BLOQUE PAS la
   navigation ». C'est le test du **port 3000** (`CLAUDE.md`). Une session
   voisine avait relancé un serveur pendant l'exécution — vérifié : le PID
   57940 n'était pas le mien, et il répond bien 200 après compilation à
   froid. **Ce n'est pas un zombie : je ne l'ai pas tué.**

3-8. `access.test.ts`, `catalog.test.ts` (×3), `ingestion.test.ts`,
   `schema.test.ts` — tous le **même** défaut : le jeu de démonstration compte
   **14 livres au lieu de 11**. C'est le piège écrit dans `CLAUDE.md` (« un
   conte ingéré à l'essai reste dans la base »). Les quatre intrus sont des
   **livrets pédagogiques absents de `supabase/seed.sql`** :

   ```
   je-colorie-un-fruit-l-orange
   je-colorie-un-oiseau-le-perroquet
   je-trace-et-j-ecris-les-bases-graphiques
   mon-cahier-de-graphisme
   ```

   Ils appartiennent vraisemblablement à la session qui tient les écrans
   livrets/catalogue. `npm run db:reset` les effacerait — **et effacerait avec
   eux son travail en cours**. Je ne l'ai pas lancé : trois sessions partagent
   cette base. **À arbitrer avec elle.**

**Conclusion : aucun des sept échecs restants n'est causé par ce lot.**

---

## 2. Ce qui est FAIT et mesuré

### 2.1 Le chrome (en-tête + pied) — parité atteinte

Toutes les cotes géométriques du prototype sont atteintes. Résidus = écarts
documentés, aucun écart involontaire.

- `src/design/tokens.css` — `font-synthesis-weight: none` dans
  `:root[data-design='v3']`. **Le correctif d'un seul point** pour 209 règles
  qui demandent `var(--graisse-forte)` sur Caprasimo, police à graisse unique
  400 : le navigateur fabriquait un gras synthétique. Vérifié : `w400 === w700
  === 194.125 px`, identique au prototype.
- `src/components/enveloppe/v3.module.css` — `.barreUtilitaire { line-height:
  var(--interligne-corps) }` (valait 1.2, coûtait 2,5 px à **toutes** les pages).
- `src/components/enveloppe/v2.tsx` — le **bouton rond de compte** est toujours
  rendu sous V3 (son absence expliquait un décalage de 50 px dans la barre
  d'actions) ; la pastille « Se connecter » n'apparaît que déconnecté ; le
  formulaire d'infolettre est dans `.piedIdentite`.
- `src/components/enveloppe/v2.module.css` — liens de navigation remis à
  `min-height: 0 ; padding: 0` sous V3 (le filet de survol était 8 px trop bas,
  il se pose à `bottom: -6px` de la boîte) ; `.montant { display: none }` ;
  chevron 12 px de `.rayonsResume::before` ; bloc infolettre complet.
- `src/design/enveloppe.ts` — les routes d'authentification reçoivent
  l'enveloppe **`complete`** sous V3 (le prototype dessine l'auth avec le chrome
  entier), `nue` ailleurs.

### 2.2 Le tiroir du panier — parité atteinte

`src/components/v2/tiroir-panier.tsx` (677 l.) +
`src/components/v2/tiroir-panier.module.css` (~300 l. de bloc V3 ajouté).

Cotes reprises du prototype (lignes 160-215 du prototype bureau) : panneau
420 px / 92 vw, entête 24/26 px, titre 21 px, bouton fermer 38 px en `order: 2`,
corps 20/26, vignette 62×93, `.ligneTitre` 15,5 px, `.ligneMeta` 12,5 px,
`.lignePrix` 14,5 px en `--action-texte`, cercle d'état vide 74 px, pied 22/26,
bouton payer 16 px.

**Deux pièges déjà payés, ne pas les repayer :**

- Le tiroir se rendait **haut de 76 px, à l'intérieur de l'en-tête**. Cause :
  l'en-tête porte `backdrop-filter`, ce qui en fait un **bloc conteneur** pour
  tout descendant `position: fixed`. Correction : `createPortal(<>…</>,
  document.body)`. *Le même piège attend le menu mobile et la superposition de
  recherche* — ils devront être portalisés pareillement.
- Le fond du tiroir était transparent : j'utilisais `var(--carte)`, jeton qui
  n'existe pas. Le vrai nom est **`var(--surface)`**.

### 2.3 L'ajout au panier — optimiste, sans seconde source de vérité

| Fichier | Rôle |
| --- | --- |
| `src/components/panier/magasin.ts` (138 l.) | micro-magasin `useSyncExternalStore` |
| `src/components/panier/ajout.tsx` (195 l.) | `<FormulaireAjout>` |
| `src/components/panier/synchronisation.tsx` (77 l.) | |
| `src/components/toast/index.tsx` | messages, dont `panierAjoutTitre` |

API du magasin :

```ts
bougerCompteurPanier(pas: number): void        // un DELTA entier, jamais le panier
reinitialiserCompteurPanier(): void
useNombrePanier(nombreServeur: number): number // getServerSnapshot => 0
demanderOuvertureTiroir(): void
useDemandesOuvertureTiroir(): number
```

**Le principe à ne pas casser :** le client ne détient qu'un **entier de
décalage**, jamais le contenu du panier. Le serveur reste l'autorité ;
`router.refresh()` réconcilie. C'est ce qui permet l'optimisme sans violer
« le frontend ne recalcule jamais une règle métier ».

`onSubmit` : `preventDefault()` → `bougerCompteurPanier(+1)` →
`poserToast('panierAjoutTitre', { titre })` → au succès `router.refresh()` +
`annoncerChangementPanier()` ; à l'échec `bougerCompteurPanier(-1)` et
branchement (`'ajoute' | 'deja' | 'connexion' | 'refus'`).

Le cas **« déjà au panier → ouvrir le tiroir »** (règle du document `06`) est
tenu **sans état client** : `ajouterAuPanier` (`src/lib/orders/cart.ts`)
présélectionne `cart_items` avant l'`upsert` — PostgREST ne sait pas dire
insertion contre mise à jour — et renvoie `{ ok: true; deja: boolean }`, que
`src/app/api/cart/route.ts` repasse tel quel.

Le toast garde sa propriété de sécurité (liste fermée de messages) tout en
acceptant un titre : **deux listes**, `MESSAGES` (rendable) et `DEPUIS_URL`
(acceptable depuis la barre d'adresse, **exclut** les gabarits à substitution
`reprise` et `panierAjoutTitre`).

**⚠️ Reste à vérifier de bout en bout** avec `node scripts/essai-interactions.mjs` :
c'était bloqué par le 500 du catalogue, désormais corrigé (§5.2).

### 2.4 L'authentification — code écrit, PUIS relevé et corrigé

Ce paragraphe décrivait le code avant toute mesure. La mesure a eu lieu : voir
**§3.1**, qui dit ce qu'elle a démenti. Les trois arbitrages ci-dessous, eux,
tiennent toujours.

| Fichier | État |
| --- | --- |
| `src/components/auth/panneau.tsx` (136 l., **nouveau**) | `PanneauPromesse` + `BasculeAuth` |
| `src/components/auth/mot-de-passe.tsx` (116 l., **nouveau**) | `ChampMotDePasse` avec l'œil |
| `src/components/auth/index.tsx` (453 l.) | branches V3 |
| `src/components/auth/inscription.tsx` (262 l.) | branches V3, ordre nom→email→mdp |
| `src/components/auth/auth.module.css` (975 l.) | bloc V3 appendé, ~310 l. |

Trois arbitrages écrits **dans le code**, en encadrés, à ne pas défaire :

- **Le titre du panneau est un `<p>`, pas un `<h2>`.** Le prototype écrit un
  `<h2>` et le pose **avant** le `<h1>` du formulaire : la liste des titres d'un
  lecteur d'écran commencerait par une promesse commerciale. Le dessin ne change
  pas d'un pixel — `.promesseTitre` porte la police, la taille, l'interligne.
- **La bascule est deux `<a>`, pas deux boutons qui échangent un état.** Les
  deux modes sont deux **routes** (`/connexion`, `/inscription`) : un lien
  partagé arrive au bon endroit, le retour navigateur marche, et l'écran
  fonctionne sans JavaScript. `aria-current="page"` porte l'état
  (`aria-selected` mentirait hors d'un vrai `role="tablist"`).
- **L'œil n'est rendu qu'après montage.** Basculer `password` ↔ `text` est un
  geste de navigateur : sans script le bouton ne ferait rien, et un bouton
  inerte est pire que son absence. Le champ, lui, est complet dès le rendu
  serveur.

**Rappel de la règle des modules CSS** (garde `tests/unit/classes-css.test.ts`) :
un module CSS **n'exporte que ce qu'il déclare localement**. Une classe écrite
uniquement sous `:global(:root[data-design='v3'])` donne `styles.x === undefined`
et rend la chaîne littérale `"undefined"` dans le DOM. **Chaque** classe V3 doit
donc porter une déclaration locale de base avant sa règle globale. Attention au
choix de cette base : pour l'infolettre j'ai pris `margin: 0` et **non**
`display: none`, parce que les règles V3 ne redéclarent pas toutes `display` et
que le `none` aurait survécu jusqu'en V3.

---

## 3. L'authentification (faite), puis ce qui RESTE

§3.1 à §3.1ter racontent la passe du 7 septembre, qui est **terminée**. Le
reste de la section — profil, recherche, menu mobile — est à faire, dans cet
ordre.

### 3.1 L'authentification — FAIT, relevée et corrigée (7 septembre 2026)

Les **cinq** écrans d'authentification sont relevés, pas seulement la
connexion : le propriétaire a demandé en cours de passe de « charger les
autres aussi, même s'ils n'ont qu'une seule page ».

```bash
node scripts/releve-v3.mjs auth auth-inscription auth-mobile
node scripts/releve-v3.mjs auth-oubli auth-nouveau-mdp auth-confirmation
```

**Résultat — bureau, connexion : 21 sondes sur 23 exactes.** Les deux résidus
sont des écarts ASSUMÉS, laissés visibles et expliqués à la sonde (voir §3.1bis).

**Le relevé n'existait pas encore.** La scène `auth` capturait deux images et
ne déclarait AUCUNE sonde ; `auth-mobile` cliquait un libellé qui ne
correspondait à rien, sous un `if (count())` qui avalait l'échec — elle
photographiait la page d'ACCUEIL en la présentant comme l'authentification. Le
travail a donc commencé par écrire les sondes et réparer la navigation.

#### Ce que la mesure a démenti — et qui est corrigé

| Cote | Posée au lot 8 | Mesurée au prototype |
| --- | --- | --- |
| Largeur du cadre | 1100 px | **1184 px** (1240 − 2 × 28) |
| Ombre du cadre | `--ombre-flottante` (V2) | **`--ombre-l`** = le `--shadow-lg` du dossier |
| Fond du cadre | `--surface` | **transparent** — les colonnes le couvrent |
| Onglet actif | `--surface` + ombre | **`--chrome` / `--chrome-encre`**, sans ombre |
| Hauteur d'onglet | `min-height: 44px` | **`padding: 11px 16px`**, soit 38 px |
| Sceau de la marque | 32 px | **44 px**, écart 12, marge basse 38 |
| Étiquette de champ | 15 px, gras, encre pleine | **12,5 px, normale, encre douce** |
| Fond de champ | `--fond` (#f5ead8) | **`--fond-doux`** (#efe3cd = `--ground-2`) |
| Rayon de champ | plein | **18 px**, rembourrage 15/18 |
| Interligne du bouton | 1,6 hérité | **`normal`** — 7,4 px de haut en trop sur TOUT l'écran |
| Coche des preuves | `--accent-sur-chrome` | **`--action`** (#c67139) |
| Œil du mot de passe | `bottom: 8px` | **9,4 px** = (56,8 − 38) / 2 |

**L'onglet actif mérite d'être relu** : le bloc précédent citait
`05-components.md` (« Active = --card + shadow ») et en avait tiré une
pastille crème. Le prototype de bureau écrit `var(--deep)` / `var(--onDeep)`
à sa ligne 2198, et il fait foi (`docs/REFONTE-V3.md` §2). Le prototype
**mobile**, lui, écrit bien `--card` + `--shadow-sm` à sa ligne 962 : les deux
sont mesurés, les deux sont voulus, et la règle de bureau est REPRISE dans le
bloc mobile — jamais étendue.

#### Le défaut que le relevé des autres écrans a trouvé

`FormulaireOubli` et `FormulaireCode` rendaient encore l'**aside décoratif de
la V1** sous Organic : le panneau de promesse n'avait été branché que sur la
connexion et l'inscription. Trois écrans sur cinq — et ce sont les trois qu'on
n'ouvre qu'en panne. Corrigé : les cinq passent par `PanneauPromesse`.

Note laissée en l'état : ces deux `aside` de repli portent leur texte **en dur
en français** dans le JSX, hors de `src/i18n`. Ils ne sont plus rendus sous V3,
mais la V1 et la V2 les affichent toujours — un lecteur anglais y lit du
français.

#### L'auth mobile est un AUTRE dessin, pas l'écran de bureau rétréci

Le prototype mobile (lignes 470 à 521) redessine l'écran : la carte à deux
colonnes disparaît au profit d'une **carte sombre** de promesse posée sur le
formulaire, le logo et les trois preuves s'en vont, un **sur-titre** en petites
capitales les remplace (`auth.promesseSurTitre`, nouvelle clé), et les champs
passent sur `--surface` et non sur le fond doux. Tout cela est implémenté sous
`@media (max-width: 760px)`.

### 3.1bis Les écarts qui RESTENT, et pourquoi ils restent

Aucun n'est un oubli. Les trois premiers sont laissés **visibles** dans le
relevé : une décision se relit.

1. **La teinte du lien d'oubli** — le prototype rend rgb(158, 89, 44), nous
   #8c491a. Ce n'est pas nous qui dérivons : `01-design-tokens.md` fixe
   `--terra-d: #8c491a`, puis décrit sous « Accent override (**prototype-only
   feature**) » un accent réglable dont le prototype DÉRIVE sa teinte par
   `color-mix(in srgb, <accent> 74%, #2b1608)`. Le dossier conclut :
   « otherwise hard-code the terracotta pair above ».

2. **L'encre du bouton d'envoi** — le prototype écrit `#fff` sur la terre
   cuite : 3,4:1, sous les 4,5:1 de WCAG 1.4.3 pour un texte de 16,5 px non
   gras. `--action-encre` passe à 6,2:1, et c'est le choix de tout le site.

3. **La hauteur d'onglet, 38 px au lieu de 44** — 44 px est WCAG 2.5.5, un
   critère **AAA** ; l'objectif du cahier des charges §5.3 est AA, et la
   version 2.1 ne fixe aucun minimum de cible à ce niveau. Cote choisie, non
   subie.

4. **L'inscription est plus haute que le prototype de 215,7 px** — trois
   contenus que le prototype n'a pas : l'aide du champ « Nom complet », la
   jauge `ForceMotDePasse`, et la mention `auth.aucuneDonneeEnfant`. Du
   contenu produit, pas un écart de dessin.

5. **Le champ de mot de passe mobile** — le prototype déplace la bordure sur
   une enveloppe `flex` et rétrécit le champ à 302 px ; nous gardons le champ
   entier et lui réservons la place par le rembourrage. Le texte s'arrête au
   même pixel, la boîte diffère. Aligner les deux demanderait de faire
   dépendre le BALISAGE de la largeur.

6. **Le décalage vertical de 38 px sur mobile** — mesuré : les deux en-têtes
   font 69 px, mais le nôtre commence à y = 38 et celui du prototype à y = 0.
   La différence est la **barre utilitaire**, que le prototype mobile ne
   dessine pas. C'est une décision de CHROME, qui vaut pour toutes les pages
   du site : elle n'a pas été prise ici. **À arbitrer — voir §7.**

7. **Le texte de promesse tient sur trois lignes au lieu de deux** — le
   prototype mobile emploie une phrase plus COURTE que sa version de bureau
   (« … et la page où l'enfant s'est arrêté » contre « … et votre progression
   de lecture — sur téléphone comme en classe »). Nous n'avons qu'une clé.
   Écrire une seconde version est une décision éditoriale. **À arbitrer.**

### 3.1ter L'outil de relevé a été rendu honnête

Trois écarts que le navigateur INVENTE noyaient les vrais — chaque sonde en
rapportait quatre à six qui ne se voient sur aucun écran. Ils sont normalisés
dans `comparer()` : la notation `color(srgb …)` contre `rgb(…)` (même couleur,
le prototype passe par `color-mix`), la PILE de repli d'une police (seule la
première famille se voit), et `borderColor` quand `borderWidth` vaut 0.

`stroke` a été AJOUTÉ aux propriétés relevées : l'encre d'un tracé SVG ne passe
pas par `color`, et la coche des preuves divergeait sans que rien ne le dise.

**Aucune cote n'est normalisée.** Les rares `ignore` sont écrits sonde par
sonde, avec leur raison.

### 3.2 L'écran de profil — le plus gros morceau restant

**Route existante :** `src/app/[langue]/compte/page.tsx` (78 l.), composant
`src/components/espace/index.tsx` (84 l.), styles
`src/components/espace/espace.module.css` (6 occurrences de `v3` seulement —
tout reste à faire).

**Référence : prototype bureau, lignes 1480 à 1655.** Cotes relevées :

*Carte d'en-tête* — `max-width: 1240px`, `padding: 44px 28px 96px` sur le
`<main>` ; la carte : `display:flex; gap:22px`, fond `--card`, bord 1 px
`--line`, **rayon 34 px**, `padding: 30px 34px`, `box-shadow: var(--shadow-sm)`.
Avatar : **78×78**, rayon plein, fond `--deep`, encre `--onDeep`, Caprasimo
26 px, initiales. `<h1>` `clamp(26px, 2.8vw, 36px)` / interligne 1,08 /
`margin: 0 0 6px`. Sous-ligne 14,5 px `--muted` : `email · membre depuis …`.
**Trois tuiles** de statistiques : fond `--ground-2`, rayon 20, `padding:
14px 20px`, `min-width: 104px`, nombre Caprasimo 24 px en `--terra-d`, libellé
12 px `--muted` à `margin-top: 2px`.

*Grille* — `grid-template-columns: 250px 1fr; gap: 30px; margin-top: 30px;
align-items: start`.

*Colonne de gauche* — `<nav>` `flex-direction: column; gap: 8px; position:
sticky; top: 100px`. Quatre entrées (Ma bibliothèque / Mes informations / Mes
commandes / Abonnement), puis **« Se déconnecter »** en fantôme : `gap: 12px`,
`margin-top: 14px`, `padding: 13px 16px`, 14,5 px, `--muted`, survol
`--terra-d`, icône porte 17 px (`M14 5.5H6.5A1.5 1.5 0 0 0 5 7v10a1.5 1.5 0 0 0
1.5 1.5H14` + `M17 8.5 20.5 12 17 15.5M20.5 12H10`).

*Panneau de droite, par onglet* — bibliothèque : lignes en
`grid-template-columns: 72px 1fr auto`, `gap: 20px`, carte rayon 24,
`padding: 16px 22px`, couverture 72 px en `aspect-ratio: 2/3`, sur-titre 10,5 px
`letter-spacing: .14em` majuscules `--sage`, titre 19 px, progression 13,5 px,
bouton « Reprendre la lecture » terre cuite + bouton rond 44 px de
téléchargement. Informations : carte rayon 30, `padding: 32px`,
`max-width: 620px`, champs fond `--ground-2` rayon 18 `padding: 15px 18px`
15,5 px. Commandes : `grid-template-columns: auto 1fr auto auto`, rayon 24,
`padding: 20px 24px`. Abonnements : `repeat(auto-fit, minmax(280px, 1fr))`,
`gap: 20px`.

*Mobile* — onglets en pastilles, avatar **62 px**.

**⚠️ Deux points bloquants à traiter, pas à improviser :**

1. **Aucun écran n'appelle `POST /api/auth/logout`.** La déconnexion n'existe
   pas dans l'interface (notée ❌ dans la liste de recette du lot 13). Le
   prototype la place ici : c'est l'occasion de la câbler — mais c'est un ajout
   fonctionnel, pas du dessin, et il mérite d'être annoncé.
2. **Le prototype invente des champs que ce produit n'a pas** : téléphone,
   « recevoir les nouveautés par email », « membre depuis mars 2026 ». Rien ne
   les stocke. Ne pas inventer la règle : soit on les omet, soit on demande.
   `CLAUDE.md` — « n'invente pas de règle métier absente de la spécification ».

### 3.3 Les accessoires interactifs — FAITS (7 septembre 2026)

> « On fait les accessoires interactifs : la barre de recherche interactive
> dans l'ensemble du site, et le panier interactif, ensuite l'ajout au panier
> interactif comme dans la maquette. »

Les trois sont faits, dans cet ordre, et chacun est MESURÉ.

#### La recherche — nouvelle, et globale

`src/components/v2/recherche-globale.tsx` + `.module.css`, montée sur la loupe
de l'en-tête, donc disponible depuis **toutes** les pages.

**Relevé : 13 sondes sur 14 exactes** (`node scripts/releve-v3.mjs recherche`).

Quatre décisions, écrites dans le code :

- **La loupe reste une ANCRE vers `/catalogue`.** Le clic n'est intercepté que
  si le script s'exécute, et un clic modifié (⌘, Ctrl, Maj, molette) ne l'est
  jamais. Sans JavaScript on arrive donc sur l'écran de recherche du catalogue,
  qui porte un vrai formulaire `GET` — vérifié par l'essai, étape 8.
- **Le panneau est PORTALISÉ.** Même piège que le tiroir : l'en-tête porte
  `backdrop-filter`, ce qui en fait un bloc conteneur pour tout `position:
  fixed` descendant. Mesuré après correction : le panneau s'ancre bien à
  `y = 0` sur toute la largeur de la fenêtre.
- **Aucune seconde recherche** : c'est `/api/catalog`, le même point d'entrée,
  le même schéma Zod, la même fonction SQL. Débounce 180 ms.
- **Les suggestions viennent des VRAIES facettes** (`/api/catalog/facets`), pas
  des six libellés figés du prototype. Recopier « ruse » ou « nature » aurait
  posé des pastilles en français sur le site anglais, et des suggestions qui ne
  ramènent rien le jour où l'éditeur renomme un thème.

`node scripts/essai-recherche.mjs` — nouveau — prouve le reste dans un vrai
navigateur : ouverture, focus au champ, six pastilles, résultats pendant la
frappe, message d'absence, Échap qui ferme ET rend le focus à la loupe,
raccourci ⌘K / Ctrl+K, **zéro navigation**, et le repli sans JavaScript.

#### Le panier — déjà à parité, désormais mesuré

**Relevé : 12 sondes sur 14 exactes.** Les deux résidus sont les écarts assumés
déjà connus (la teinte `--terra-d`, l'encre du bouton). Quatre autres écarts
apparents ont été identifiés comme des artefacts de sonde et annotés : `gap`
(`0` chez nous contre `normal`, qui VALENT tous deux zéro — et le `0` est
délibéré, commenté dans la feuille), les largeurs de boîte de contenu contre
boîte de bloc, et la police d'une croix qui est un glyphe chez nous, un SVG
chez lui.

#### L'ajout au panier — un VRAI défaut trouvé et corrigé

C'était le point resté « à vérifier de bout en bout ». Il ne marchait pas.

**Le bouton « ajouter au panier » était incliquable à la souris sur tout le
catalogue.** Invisible au repos, systématique à l'usage : le défaut ne se
déclenchait qu'AU SURVOL — c'est-à-dire toujours, puisqu'on survole avant de
cliquer. Le clic partait sur la fiche du conte.

La chaîne, mesurée et non supposée :

1. `.carte:hover .cadreCouverture` pose un `transform` (le soulèvement) ;
2. un élément transformé **crée un contexte d'empilement** ;
3. le `z-index: 1` de `.formAjout`, qui vit dans ce cadre, s'y trouve alors
   **enfermé** au lieu d'être comparé aux frères de la carte ;
4. le `::after` du lien étiré — posé plus loin dans l'arbre, donc peint plus
   tard — repasse au-dessus du cadre entier, bouton compris.

Preuve : `elementFromPoint` au centre du bouton rend le `BUTTON` sans survol, et
le lien du titre avec.

**La correction tient en deux temps**, parce qu'un seul ne suffit pas :
`z-index: 1` sur le cadre le remet devant le `::after` ; mais cela mettrait
aussi la couverture devant le lien étiré, et cliquer une couverture
n'ouvrirait plus le conte — d'où `pointer-events: none` sur le cadre, que le
formulaire seul reprend. Les trois comportements sont préservés et vérifiés :
la couverture se soulève, la couverture ouvre le conte, le bouton ajoute.

⚠️ Cette correction touche `src/components/v2/v2.module.css`, **territoire de
la session `premium-ui-refactor`** (§6). Elle est étroite — deux règles — mais
elle doit leur être signalée.

#### Deux défauts d'ESSAI, qui faisaient accuser le produit à tort

`scripts/essai-interactions.mjs` mentait dans les deux sens :

- **sa connexion échouait en silence.** Sous Organic, l'authentification reçoit
  le chrome entier, pied compris : il y a donc DEUX `input[name="email"]` dans
  le document, et `fill('input[name="email"]')` ne veut plus rien dire. L'essai
  continuait en VISITEUR, `POST /api/cart` rendait 401, le composant
  redirigeait vers la connexion — et l'essai concluait « l'ajout recharge la
  page ». Tous les symptômes d'un défaut de produit, pour un défaut d'essai. La
  même correction a été portée à `connecter()` dans `releve-v3.mjs`, qui en
  souffrait aussi.
- **`click({ force: true })` frappait à travers.** `force` saute les contrôles
  d'atteignabilité mais frappe quand même le point : l'élément qui RECOUVRE
  reçoit le clic. C'est ce qui masquait le défaut ci-dessus. L'essai clique
  désormais sans `force` — il échouerait de nouveau si l'empilement se
  reperdait.

L'essai compte aussi les ADRESSES visitées, et non plus seulement les
navigations : `router.refresh()` émet bien `framenavigated`, mais vers la
**même** adresse. Un compteur seul disait « une navigation » et laissait croire
à un rechargement.

Résultat final :

```
pastille juste après le clic : 1
toast juste après le clic    : « Anansi l'araignée maligne » ajouté au panier
pastille après la réponse    : 1
adresses visitées            : ["http://localhost:3000/fr/catalogue"]
AUCUN changement d'adresse   : true
tiroir ouvert au doublon     : true
```

#### Ce qui reste sur ces trois pièces

- **La recherche mobile n'est pas mesurée.** Le bloc `@media (max-width: 760px)`
  est écrit d'après le prototype mobile (lignes 60 à 77) — champ en pastille,
  suggestions défilantes, croix de 44 px — mais aucune scène `recherche-mobile`
  n'existe encore dans `releve-v3.mjs`. À écrire sur le modèle d'`auth-mobile`.
- **Un écart assumé subsiste sur la méta d'un résultat** : le prototype rend
  ses cartes de résultat en **Arial**, parce que sa carte est un `<button>` sans
  `font: inherit`. Le titre s'en tire — il redéclare Caprasimo — mais la ligne
  de méta sort en police système au milieu d'une page qui n'est qu'en Figtree
  et Caprasimo. C'est un oubli du prototype, pas une intention : nous héritons
  de Figtree, et l'écart est laissé VISIBLE dans le relevé.

### 3.4 Le menu mobile

**Prototype mobile lignes 78 à 96.** Feuille par le bas :
`position: fixed; left:0; right:0; bottom:0; z-index: 70`, fond `--card`,
**rayon `32px 32px 0 0`**, `box-shadow: 0 -14px 40px rgba(30,25,15,.28)`,
`padding: 14px 20px 30px`, `max-height: 82vh; overflow: auto`. Transition
`transform .38s cubic-bezier(.2,.7,.3,1)`, fermé à `translateY(103%)`.
Poignée : `44×4`, rayon 99, fond `--line`, `margin: 0 auto 18px`.
Voile : `inset: 0; z-index: 60`, `rgba(24,20,12,.45)`, `backdrop-filter: blur(3px)`.

Rangées : `gap: 6px`, chacune `display:flex; align-items:center; gap:14px;
border-radius:18px; padding:14px 12px; font-size:16px`, cercle d'icône **38×38**
fond `--ground-2`, encre `--terra-d`. **Six entrées** (prototype ligne 838 et
suivantes) : Association DAVE, Expertise & conseil, Nos offres, À propos, Nous
écrire, Mon compte.

Pied : `margin-top:18px; padding-top:18px; border-top:1px solid var(--line);
gap:10px` — pastille de thème `flex: 1`, fond `--ground-2`, rayon plein,
`padding: 14px`, Caprasimo 14,5 px ; puis le groupe **FR/EN** : fond
`--ground-2`, rayon plein, `padding: 4px`, chaque bouton `min-height: 44px;
padding: 0 18px`, l'actif en `--terra` sur blanc.

**À supprimer de l'existant** (`src/components/v2/menu-mobile.tsx`, 305 l.) sous
V3 : l'en-tête de marque, la croix de fermeture, et les 8 liens en texte.
**À faire :** portaliser vers `document.body`, pour la même raison que le tiroir
(§2.2).

### 3.5 Vérifications finales

```bash
node scripts/essai-interactions.mjs      # l'ajout au panier de bout en bout
node scripts/releve-v3.mjs profil        # puis profil-mobile, panier, recherche, menu-mobile
# serveur de développement ARRÊTÉ :
npm run verify
```

Et consigner les décisions de la session dans `docs/REFONTE-V3.md`.

---

## 4. L'outillage que j'ai construit (à réutiliser, pas à refaire)

### `scripts/releve-v3.mjs` — mesurer, ne pas relire

Ouvre le prototype (`.dc.html`) **et** l'application, capture les deux, puis
**diffe les styles calculés** de paires de sondes nommées. C'est ce qui
transforme « pixel parfait » en une liste de nombres.

Scènes : `chrome`, `auth`, `profil`, `panier`, `recherche`, `menu-mobile`,
`auth-mobile`, `profil-mobile`.

Chaque sonde relève : `x`, `y`, `w`, `h`, `fontFamily`, `fontSize`,
`fontWeight`, `lineHeight`, `letterSpacing`, `color`, `backgroundColor`,
`borderRadius`, `padding`, `gap`, `borderWidth`, `borderColor`, `boxShadow`,
`textTransform`.

### `scripts/gros-plan.mjs`

```bash
node scripts/gros-plan.mjs <nom> <cheminAppSansSlashInitial> [hauteur] [largeur] [mobile]
```

Captures à `deviceScaleFactor: 2`.

### `scripts/essai-interactions.mjs`

Se connecte, vide le panier, clique « ajouter », **imprime le badge et le toast
immédiatement après le clic**, compte les événements `framenavigated` (c'est la
preuve du « sans rechargement »), puis reclique le même titre pour vérifier que
le tiroir s'ouvre.

**Pièges Playwright déjà payés :** `waitUntil: 'networkidle'` expire sur ce
site — utiliser `'load'` plus des `waitForTimeout` explicites.

---

## 5. Pièges d'environnement — les écarter AVANT de déboguer

### 5.1 Le serveur de développement meurt d'épuisement mémoire

Symptôme : **500 généralisé** sur du code sain, souvent avec
`Jest worker encountered N child process exceptions`. Machine de 14 Go, Docker
~1,4 Go, serveur ~1,7-2 Go. **Deux fois le processus a survécu en zombie en
gardant le port 3000** — il faut alors tuer le PID à la main.

```
netstat -ano | findstr :3000     # trouver le PID
taskkill /PID <pid> /F
NEXT_PUBLIC_DESIGN_VERSION=v3 npm run dev
```

### 5.2 Le 500 du catalogue — résolu, mais savoir d'où il venait

`invalid input syntax for type uuid: "undefined"`. **Ce n'était pas mon code** :
la migration `0079` d'une session voisine avait retypé le `RETURNS TABLE` de
`catalog_list` (renommage `book_id` → `id`, déplacement de `type_document`), si
bien que `lignes.map(l => l.book_id)` dans `listerCatalogue` produisait
`undefined`. Corrigé par la migration **`0080`** (signature régénérée depuis le
texte de la `0078`) + `npm run db:types` + `notify pgrst, 'reload schema'`.

**La leçon :** après toute migration, `npm run db:types` n'est pas optionnel.

### 5.3 Heredocs et gabarits

- Un `bash <<'FIN'` échoue en « unexpected EOF » sur ce texte français dans cet
  environnement — **c'est arrivé en écrivant ce fichier même** → écrire le
  contenu avec l'outil d'écriture, ou le poser dans le bloc-notes de session
  puis concaténer avec `fs.appendFileSync` en Node.
- Les apostrophes inverses dans une chaîne de remplacement Node cassent le
  gabarit → utiliser l'outil d'édition plutôt que `node -e`.

---

### 5.4 ⚠️ `git checkout` SUR UN FICHIER PARTAGÉ — l'incident du 7 septembre

**J'ai détruit du travail non commité, dont celui de deux sessions voisines.**
Tout a été récupéré, mais la manœuvre mérite d'être racontée : elle se
represente à chaque session.

**Ce qui s'est passé.** J'ai réécrit `src/i18n/fr.json` avec
`json.dumps(indent=2)` sans `newline=''`. Sur Windows, Python traduit alors
`\n` en `\r\n` : chaque ligne du fichier a changé, et le diff a sauté de six
clés ajoutées à **2326 lignes**. Voyant un diff illisible, j'ai fait
`git checkout -- src/i18n/*.json` pour repartir propre.

C'était l'erreur. Ces fichiers portaient **64 clés ajoutées, 3 sections
entières et une vingtaine de valeurs modifiées, aucune commitée** — du travail
de ce lot ET des sessions voisines (contact, à-propos, livrets, catalogue).
`git checkout` les a toutes effacées d'un coup, et git n'en gardait rien
puisque rien n'était commité.

**Comment c'est revenu.** Les dictionnaires sont importés par le code, donc
webpack les embarque dans `.next` sous la forme
`module.exports = JSON.parse('{"marque":…}')` — un littéral JS, à dés-échapper
avant de parser (les apostrophes françaises y sont en `\'`, ce qui n'est pas du
JSON valide). Le script de récupération est dans le bloc-notes de session ; le
principe suffit à le réécrire.

**Deux leçons, dans cet ordre :**

1. **Écrire du JSON en Python sur Windows demande `newline=''`.** Sans lui,
   toute réécriture reformate le fichier entier. Le round-trip
   `json.dumps(ensure_ascii=False, indent=2) + '\n'` est fidèle À L'OCTET sur
   ces deux fichiers — vérifié. C'est la traduction des fins de ligne, et elle
   seule, qui produisait le faux diff.

2. **Ne jamais `git checkout` un fichier que trois sessions modifient.** Un gros
   diff sur un fichier partagé n'est pas une raison de le réinitialiser : c'est
   une raison de regarder CE QUI a changé. Ici, un `git diff | head -20` aurait
   montré en trois secondes que seules les fins de ligne bougeaient.

**Vérification finale :** aucune clé restaurée n'est absente du fichier
actuel, et les clés `offres.*` qu'une session voisine a ajoutées à 23:12 sur
mon fichier restauré coexistent avec les miennes. `tests/unit/i18n.test.ts`
passe (14/14), `npx tsc --noEmit` sort propre.

## 6. Trois sessions Claude travaillent sur ce dépôt en même temps

C'est le point le plus important à faire remonter au propriétaire.

| Session | Territoire revendiqué |
| --- | --- |
| `editionmapoukam-5c` (**moi**) | auth, panier, tiroir, toast, profil, recherche, menu mobile, chrome |
| `editionmapoukam-0c` | contact, à-propos, expertise, marque, `tests/unit/classes-css.test.ts` |
| `premium-ui-refactor-front-back` | migrations 0078-0080, base locale, `src/domain/catalog/types.ts`, `src/lib/catalog/repository.ts`, écrans rayon/livrets/catalogue, `src/components/catalogue/*`, `src/components/v2/{boutique,carte-conte,accueil,v2}.*` |

**Les territoires de la troisième et le mien se recouvrent directement.** J'ai
envoyé ma liste de revendications aux deux autres via `SendMessage` et leur ai
demandé de remonter la duplication à leurs propriétaires respectifs. Deux
collisions déjà constatées et réparées : le 500 du catalogue (§5.2), et mon
monogramme « EM » remplacé par le logo officiel recadré
(`public/images/logo-mapoukam-marque.png`) sur instruction du propriétaire à la
session `0c` — j'ai retiré mon CSS de monogramme, la clé i18n
`marque.monogramme` et mon commentaire devenu faux.

**Mécanisme de coordination :** `ListAgents` puis `SendMessage`.

---

## 7. Les questions que je dois au propriétaire

Aucune ne peut être tranchée seule, et chacune est un engagement, pas un pixel.
Les quatre premières viennent de la passe précédente ; les trois dernières sont
sorties du relevé de l'authentification.

1. **La monnaie affichée.** Tout le site affiche des **euros**
   (`zone_affichee: 'international'`). Le prototype **et** le README du dossier
   de passation écrivent des **FCFA** partout (« 10 000 FCFA / an »). C'est une
   décision de tarification et de données — `CLAUDE.md` : une maquette n'est
   jamais une autorité sur une donnée.
2. **`.env.local` porte encore `NEXT_PUBLIC_DESIGN_VERSION=v2`.** Le serveur
   doit être lancé avec `v3` dans l'environnement pour voir la refonte. Le
   fichier appartient au propriétaire, je ne le modifie pas.
3. **La case « J'accepte les conditions générales » n'est tenue que côté
   client.** Rien n'enregistre le consentement, et rien dans la spécification
   n'énonce que l'inscription l'exige. Le bouton reste inerte tant qu'elle n'est
   pas cochée — c'est une aide de saisie, pas une garde. Inventer la règle
   serveur reviendrait à inventer un engagement juridique dans une passe de
   design.
4. **« Rester connecté » n'a délibérément pas été reproduit.**
   `connexionSchema` ne porte que `email` et `password`, et la durée de session
   ne se règle pas écran par écran.

### Les trois qui sortent du relevé

5. **La barre utilitaire doit-elle disparaître sur téléphone ?** C'est la
   cause MESURÉE du décalage vertical de 38 px de toute l'auth mobile : les
   deux en-têtes font 69 px, mais le nôtre commence à y = 38 parce que la barre
   utilitaire le précède, et le prototype mobile ne la dessine pas. La retirer
   sous 760 px alignerait l'auth — **et déplacerait toutes les autres pages du
   site**. Je ne l'ai pas fait : c'est une décision de chrome, pas d'écran.

6. **Faut-il une phrase de promesse plus courte sur téléphone ?** Le prototype
   mobile emploie une version RACCOURCIE de la promesse ; notre clé unique tient
   sur trois lignes là où la sienne en tient deux, d'où 22 px de carte en plus.
   Ajouter `auth.promesseTexteCourt` est une décision éditoriale, pas un pixel.

7. **15,5 px dans les champs sur téléphone — confirmez-vous ?** Le prototype
   l'écrit, et je l'ai appliqué au nom de la cote au pixel. Mais sous 16 px,
   **Safari iOS zoome automatiquement au focus** : la page grandit et le
   formulaire se décale sous le doigt, sur un public §5.1 majoritairement
   mobile. `base.module.css` tenait 16 px pour cette raison exacte. Revenir en
   arrière ne coûte qu'une déclaration, signalée dans `auth.module.css`.

### Deux constats qui ne sont pas des questions, mais qui vous appartiennent

- **`base.module.css` ne porte AUCUNE règle V3.** Sous Organic, tous les
  boutons du site gardent le dessin de la V2 — rayon 11 px, bordure de 2 px,
  Figtree en gras — alors que la direction pose `--rayon-bouton: 999px` et
  écrit ses appels en Caprasimo. Je ne l'ai rattrapé que pour le bouton
  d'envoi des formulaires d'authentification, délibérément étroitement : le
  reste touche tout le site et la territoire d'une autre session.
- **Trois brouillons d'une session voisine ferment la porte de validation**
  (voir §1). `npm run verify` ne peut pas sortir en 0 tant que
  `scripts/tmp-*assoc*.mjs` sont là.

## 8. Inventaire des fichiers de ce lot

**Nouveaux :**

```
src/components/auth/panneau.tsx
src/components/auth/mot-de-passe.tsx
src/components/panier/{magasin.ts,ajout.tsx,synchronisation.tsx}
src/components/toast/{index.tsx,toast.module.css}
src/components/catalogue/meta.ts
scripts/{releve-v3.mjs,gros-plan.mjs,essai-interactions.mjs}
```

**Modifiés (cœur du lot) :**

```
src/design/tokens.css                      font-synthesis-weight
src/design/enveloppe.ts                    auth => enveloppe complete sous V3
src/components/enveloppe/{v2.tsx,v2.module.css,v3.module.css}
src/components/auth/{index.tsx,inscription.tsx,auth.module.css}
src/components/v2/{tiroir-panier.tsx,tiroir-panier.module.css,carte-conte.tsx}
src/lib/orders/cart.ts                     ajouterAuPanier renvoie { ok, deja }
src/app/api/cart/route.ts                  repasse « deja »
src/app/api/orders/route.ts                vignettesDesLivres
src/domain/api/contract.ts                 ApercuCommande.lignes enrichi
src/i18n/{fr.json,en.json}
```

`src/components/catalogue/meta.ts` mérite un mot : il porte **l'unique**
implémentation de `trancheAge(langue, livre)` et `metaLivre(langue, livre)` sur
`DescriptionLivre { age_min, age_max, nb_pages }`, et remplace deux copies
presque identiques. C'est la règle « une seule implémentation » de `CLAUDE.md`
appliquée à un détail d'affichage.

Note de schéma : **`nb_pages` n'est pas une colonne de `books`** — il vit sur
`book_translations`. `vignettesDesLivres` interroge donc `book_translations`
avec `books(slug, couverture_jeton, age_min, age_max)`, clé
« identifiant du livre, deux-points, langue ».

---


### Ce que la passe du 7 septembre a ajouté

**Nouveaux :** rien — aucun fichier créé, hors la clé i18n.

**Modifiés :**

```
src/components/auth/auth.module.css   ~430 l. de V3 ajoutees : les cotes que
                                      le releve a dementies, puis le bloc
                                      mobile complet sous @media 760px
src/components/auth/index.tsx         PanneauPromesse branche sur
                                      FormulaireOubli et FormulaireCode —
                                      trois ecrans sur cinq montraient encore
                                      l'aside decoratif de la V1
src/components/auth/panneau.tsx       le sur-titre mobile
src/i18n/{fr,en}.json                 auth.promesseSurTitre
scripts/releve-v3.mjs                 les sondes de `auth` (23) et
                                      `auth-inscription` (19), la navigation
                                      reparee d'`auth-mobile` et ses sondes,
                                      les trois scenes `auth-oubli`,
                                      `auth-nouveau-mdp`, `auth-confirmation`,
                                      la normalisation de `comparer()` et
                                      `stroke` dans les proprietes relevees
```

**Deux pieges de cette passe, a ne pas repayer :**

- **Une regle `.formulaire label` frappe AUSSI la case des conditions**, qui
  est un `<label>` : elle l'emportait sur `.caseConditions` d'un selecteur de
  type, et la ligne de consentement de l'inscription tombait a 12,5 px — le
  seul texte qu'on demande de LIRE avant de cocher devenait le plus petit.
  D'ou le `:not(.caseConditions)`, qu'il faut **repeter dans le bloc mobile**,
  sans quoi la regle de bureau, plus specifique, y gagne.
- **Une regle generale `padding` efface un `padding-right` pose plus haut.**
  `.formulaire input { padding: 15px 18px }` a supprime les 54 px reserves a
  l'oeil : le mot de passe repassait sous le bouton. La reprise est ecrite
  APRES la regle qui l'efface.

## 9. La toute prochaine commande

L'authentification est finie. Le morceau suivant est le **profil** (§3.2).

```bash
# 1. la pile locale, puis le serveur en V3 — .env.local porte encore v2
npx supabase start
NEXT_PUBLIC_DESIGN_VERSION=v3 npm run dev

# 2. le relevé du profil, à écrire : la scène existe, ses SONDES non
node scripts/releve-v3.mjs profil
node scripts/releve-v3.mjs profil-mobile
```

⚠️ **Comme pour l'auth, les scènes `profil`, `recherche` et `menu-mobile` ne
déclarent aucune sonde** : elles ne font que photographier. Les écrire est la
première moitié du travail, et le prototype MOBILE démarre connecté — pour
atteindre un écran déconnecté il faut passer par menu → « Mon compte » →
onglet « Informations » → « Se déconnecter » (c'est ce que fait déjà la scène
`auth-mobile`, à recopier).

Deux points de §3.2 restent des **questions**, pas du dessin : la déconnexion
n'est câblée nulle part dans l'interface, et le prototype invente des champs
que ce produit ne stocke pas (téléphone, « membre depuis mars 2026 »).
