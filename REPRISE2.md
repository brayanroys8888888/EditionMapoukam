# REPRISE 2 — la passe au pixel V3, côté gauche (accueil, catalogue, livrets)

> **À lire avec `CLAUDE.md` et `REPRISE.md`, pas à leur place.**
> `CLAUDE.md` porte le permanent, `REPRISE.md` le point de reprise général du
> dépôt. Ce fichier-ci porte **une seule chose** : l'état exact de la refonte V3
> au 7 septembre 2026, tel qu'il faut le reprendre.

Branche : `livret-pedagogique`. Dernier commit : `d88d95c`. **Rien de la refonte
V3 n'est committé** — tout est dans l'arbre de travail (voir §9).

---

## 0. Ce qu'il faut savoir avant tout le reste

### 0.1 Trois sessions Claude travaillent ce dépôt en même temps

Ce n'est pas une anecdote, c'est la première cause de panne de la journée. Au
7 septembre au matin, trois sessions écrivaient la même refonte sans le savoir.
Le partage de fait, tel qu'il s'est établi :

| Session | Périmètre | Fichiers |
| --- | --- | --- |
| celle-ci | accueil, catalogue/contes/livrets, base de données | `accueil.*`, `boutique.*`, `carte-conte.tsx`, `rayon.tsx`, migrations 0078-0080, `deposer-livret.mjs` |
| `editionmapoukam-5c` | `Nous écrire`, `À propos` | `contact.*`, `apropos-v3.*`, `content/apropos.ts` |
| `editionmapoukam-0c` | `Expertise & conseil`, chrome | `expertise-v3.*`, `enveloppe/v3.*`, `toast/`, `panier/` |

**Ce que la collision a coûté**, et qui est déjà écrit dans
`docs/REFONTE-V3.md` §9 (« Trois sessions dans le même dépôt ») :

- la migration 0079 a cassé **tout le catalogue** en retapant le `RETURNS TABLE`
  de `catalog_list` (`book_id` devenu `id`) — corrigée par la 0080 ;
- `npm run lint` est passé rouge deux fois sur des fichiers qui
  n'appartenaient pas à celui qui lisait le rapport ;
- `access.test.ts` a compté onze livres au lieu de dix, sans qu'un mot du
  message parle d'ingestion.

**Règle pour la suite** : avant de toucher un fichier, vérifier qu'il est dans
la colonne ci-dessus. Avant de lancer `npm run verify`, s'attendre à des échecs
qui ne viennent pas de soi — le premier réflexe est de lire le chemin du
fichier fautif, pas d'accuser sa propre dernière modification. C'est exactement
ce qui vient de se passer avec `expertise-v3.module.css:133`.

### 0.2 La maquette fait autorité, et elle est dans le dépôt

`design_handoff_edition_mapoukam/Site EditionMapoukam.dc.html` (208 Ko) et sa
variante `… Mobile.dc.html`. **Les onze fichiers markdown du même dossier sont
des résumés**, et le `README.md` du dossier tranche : *« when a doc here and the
prototype disagree, the prototype wins »*.

L'erreur centrale de la première moitié du chantier a été de travailler sur les
résumés sans jamais ouvrir le `.dc.html`. Le propriétaire l'a formulé ainsi :

> « tous ce que tu as fait n'a rien à voir avec les maquettes qui sont sur mon
> claude design, tu n'as que fait changer les couleurs de la v1 »

Il avait raison : `accueil.module.css` contenait **zéro** règle V3.

**Exigence posée le 7 septembre : « 100 %, à la dimension près, aucun écart
n'est toléré. »** Chaque valeur se transcrit depuis le `.dc.html`.

**Une exception nommée : le logo.** « n'oublie pas qu'on garde notre logo » — la
maquette pose une pastille « EM » de 44 px, on garde
`public/images/logo-mapoukam-marque.png`.

### 0.3 On mesure, on ne regarde pas

La relecture visuelle a laissé passer *tous* les défauts trouvés ensuite. La
méthode qui marche : Playwright ouvre l'application **et** la maquette à la même
largeur, puis `evaluate()` compare les styles calculés et les géométries.

```bash
node scripts/releve-v3.mjs [scene…]   # tableau d'écarts + 2 images par scène
node scripts/comparer-maquette.mjs    # accueil réel vs maquette, 1440 px
node scripts/gros-plan.mjs <nom> <cheminApp> [hauteur] [largeur] [mobile]
node scripts/captures-ecrans.mjs      # tous les écrans, trois passes
node scripts/essai-interactions.mjs   # panier, toast, tiroir, recherche
```

Aucun de ces cinq scripts n'est un test : rien n'y est asserté, ils vivent sous
`scripts/` uniquement pour que `@playwright/test` se résolve. Ils écrivent dans
`.captures/`. **Ils exigent le serveur de développement en marche.**

---

## 1. Ce qui est livré

### 1.1 Accueil — `/fr`

`src/components/v2/accueil.{tsx,module.css}`. Passé de **0** règle V3 à une
implémentation Organic complète :

- héros sur `--creme`, deux cercles décoratifs, grille `1.05fr .95fr`,
  `padding: 82px 28px 92px` ;
- l'**éventail** de couvertures : `left:2% / top:10% / width:58% /
  rotate(-8deg)`, et trois animations `flotteA/B/C` — la rotation est **recopiée
  dans chaque image-clé** parce que `transform` est une seule propriété et
  qu'une seconde déclaration écraserait la première ;
- sections 2 à 7 aux cotes de la maquette ;
- composants ajoutés, tous derrière `estV3()` : `EventailHero`, `PreuvesHero`,
  `histoireBadge`, `traditionAppel`, `avisIdentite` / `avisNom` / `avisInitiale`.

### 1.2 Catalogue, contes, livrets — le corps commun

`src/components/v2/boutique.{tsx,module.css}` et `src/app/[langue]/rayon.tsx`.
Les trois rayons partagent **un seul corps** ; `/contes` et `/livrets` ne font
qu'imposer `type_document`.

Livré, dans l'ordre des demandes du propriétaire :

| Demande | Ce qui a été fait |
| --- | --- |
| bannière fidèle | crème, `1.2fr .8fr`, `padding: 44px max(28px, (100% - var(--largeur-page)) / 2) 40px` |
| pied de page fidèle | repris sur la maquette |
| cartes plus courtes | hauteur baissée deux fois, puis **-15 %** |
| bouton d'ajout en bas à droite | déplacé |
| barre de filtres identique | reconstruite en menus `<details>`, collante à `top: 76px` |
| conteneur de filtres transparent | fait (le blanc intérieur reste) |
| barre qui ne cache pas le contenu | hauteur réduite en passant aux listes |
| plus de rechargement de page | `<Link scroll={false}>`, recherche instantanée |
| plus de nombres entre parenthèses | retirés |
| recherche « pe » → « Petit Baobab » | migration 0078, recherche par préfixe |

Deux détails qui ont coûté cher et qu'il ne faut pas défaire :

- `triEtVue` est **extrait dans une variable** et rendu à l'un ou l'autre de deux
  emplacements — pas dupliqué ;
- la grille est `minmax(min(46%, 200px), 1fr)` : le `min(46%, …)` est ce qui
  empêche une seule carte de s'étirer sur toute la largeur.

### 1.3 Base de données — sept migrations

| N° | Ce qu'elle fait |
| --- | --- |
| `0078` | recherche par **préfixe** — chaque lexème reçoit `:*` via `to_tsquery`, avec repli sur `websearch_to_tsquery` |
| `0079` | ajoute `books.niveau text` et `books.objectifs text[] not null default '{}'`, et les rend depuis `catalog_list` |
| `0080` | **corrective** — rétablit le nom `book_id` que la 0079 avait retapé en `id` |
| `0081` | `admin_modifier_livre` accepte `p_niveau` et `p_objectifs` |
| `0082` | `admin_lire_livre` les REND — sans quoi la fiche les effaçait |
| `0083` | facette `niveaux` + `p_niveau` : le filtre du rayon des livrets |
| `0084` | **corrective** — la 0083 avait rejoué le renommage de la 0079 |

Le dépôt en est donc à la **0084** (`CLAUDE.md` dit encore 0077 : à corriger au
moment du commit).

Trois pièges appris là :

1. `websearch_to_tsquery` ne fait correspondre que des **lexèmes entiers**. Un
   préfixe demande `to_tsquery` et un `:*` par lexème.
2. **Une signature SQL se reprend DEPUIS LA BASE, jamais depuis un fichier.**
   Le client Supabase mappe **par position** : une colonne renommée ne lève
   aucune erreur, elle rend `undefined`, et tout le catalogue tombe.

   Le défaut a été commis **trois fois** dans la journée. La 0080 corrigeait la
   0079 ; la 0083 a repris le corps depuis le FICHIER de la 0079 — la version
   fautive — et l'a rejoué à l'identique ; la 0084 a dû corriger à nouveau.

   La règle exacte est donc : `pg_get_functiondef(p.oid)` dit ce qui TOURNE ; un
   fichier de migration ne dit que ce qui a été tenté ce jour-là, et il peut
   avoir été corrigé depuis.
3. **PostgREST garde en cache une fonction supprimée puis recréée.** Après toute
   migration qui `drop function … create function`, il faut :
   ```bash
   docker exec supabase_db_EditionMapoukam psql -U postgres -d postgres \
     -c "notify pgrst, 'reload schema';"
   ```
   Sans ça, la base est juste et l'application fausse.

### 1.4 Quatre livrets réels sont en base

Ingéré par `node scripts/deposer-livret.mjs <fichier.pdf> [titre]` — qui passe
par `POST /api/admin/books/ingest` avec `type_document=livret_pedagogique` et
`orientation=paysage`. **Jamais par un `insert` à la main** : une ligne posée
directement n'aurait ni couverture, ni pages rendues, ni EPUB.

```
je-trace-et-j-ecris-les-bases-graphiques | paysage | 4 p. | PS · MS · GS
mon-cahier-de-graphisme                  | portrait| 1 p. | MS · GS · CP
je-colorie-un-oiseau-le-perroquet        | portrait| 1 p. | MS · GS
je-colorie-un-fruit-l-orange             | portrait| 1 p. | MS · GS
```

Tous OFFERTS, tous publiés. Les PDF source sont dans
`conte d'afrique/livrets pedagogique/`.

`scripts/completer-livrets.mjs` renseigne et publie les trois derniers **par
les routes d'administration**, jamais par la base — il est idempotent, on peut
le relancer. `deposer-livret.mjs` prend son orientation dans `ORIENTATION` :
elle se DÉCLARE, elle ne se déduit pas du fichier (un livret porte souvent une
couverture debout devant des planches couchées).

**Conséquence sur les tests** : le catalogue compte désormais **quatorze**
livres. `tests/integration/access.test.ts` et `schema.test.ts` sont passés de 10
à 14, avec un encadré qui dit pourquoi. Ne pas les ramener à 10 « pour faire
passer la suite » — ce serait effacer les livrets.

### 1.5 Jetons ajoutés à `tokens.css`

| Jeton | Valeur | Raison |
| --- | --- | --- |
| `--second` / `--second-contre` | `--v3-sauge` / `--v3-profond` | douzième rôle : un aplat sauge qui ne porte **jamais** de texte (mesuré 3,73:1) |
| `--ombre-s/m/l` | trois paliers | reprend exactement les trois ombres du système |
| `--v3-tuile-1..5` | `#626e4b #9c592d #8c491a #9e5728 #56633f` | teintes de la maquette **assombries** — 5 des 7 d'origine échouaient AA |
| `--largeur-page` (V3) | `1240px` | `02-layout-responsive.md`, contre 1200 en V1/V2 |
| `--interligne-corps` (V3) | `1.6` | la racine du prototype l'écrit en clair |
| `--traque-titre` | `normal`, `-0.015em` en V3 | `_ds/…/styles.css` la pose sur `h1..h6` ; Caprasimo en a besoin, Fraunces non |
| `--cible-min` (V3, `pointer: fine`) | `36px` | voir ci-dessous |

**Le `36px` mérite qu'on le lise avant d'y toucher.** Le propriétaire a signalé
que « les boutons sont énormes, et c'est pareil sur tout le site » : c'était
`--cible-min: 44px` appliqué à la souris comme au doigt. La règle abaisse un
**plancher**, sous `@media (pointer: fine)` seulement ; le tactile garde ses
44 px. 44 px est la cible AAA (SC 2.5.5) ; l'AA (SC 2.5.8) demande 24 px, et
l'objectif du cahier des charges est AA. Le raisonnement complet est écrit **au
point de déclaration**, dans `tokens.css` — pas seulement ici — pour qu'un
lecteur qui tombe sur la règle ne la prenne pas pour quelqu'un qui relâche
discrètement une exigence d'accessibilité.

---

## 2. Ce qui reste à faire — par ordre

### 2.1 ~~L'écran des livrets~~ — LIVRÉ le 7 septembre 2026

Tout ce qui restait au §2.1 est écrit et **mesuré** : carte couchée en `16/11`
avec ses deux pastilles et sa rangée de pied, grille `minmax(330px, 1fr)`,
panneau du kit offert en `1.25fr .75fr`, troisième carte de compte. Le détail,
les six défauts trouvés au relevé et les quatre écarts qui subsistent sont dans
`docs/REFONTE-V3.md`, « Écran 4 — le rayon des livrets ».

Fichiers ajoutés : `src/components/v2/livret-mis-en-avant.tsx` et
`livret.module.css`. Scènes de relevé ajoutées : `catalogue` et `livrets`.

⚠ Deux pièges rencontrés là et qui resserviront :

- `aspect-ratio` est **annulé par un `height: 100%` sur l'enfant** (résolution
  circulaire) ;
- `inset` et `gap` sont des **raccourcis** : `inset: auto` écrase un
  `bottom`/`left` écrit dans une règle moins spécifique, et `gap: 40px` écarte
  aussi les RANGÉES d'une grille — 44 px de décalage sur tout un écran.

### 2.2 ~~L'administration doit pouvoir écrire `niveau` et `objectifs`~~ — FAIT

Migration **0081**, `db:types` régénéré, `service.ts` et la route `PATCH
/api/admin/books` complétés. Éprouvée de bout en bout : les quatre livrets ont
reçu leur niveau et leurs objectifs PAR CETTE ROUTE.

Une convention à connaître : sur `niveau`, colonne nullable, `null` veut dire
« ne touche pas » comme partout ailleurs dans cette fonction — c'est donc la
**chaîne vide** qui efface. Sans ça, un champ nullable ne pourrait jamais être
vidé. `objectifs` n'a pas le problème : le tableau vide suffit.

Ce qui reste : l'écran `/admin/contes/[id]` n'a pas encore les deux champs
dans son formulaire. La route les accepte, la base les écrit ; il manque la
saisie.

### 2.3 `npm run verify` en entier, port 3000 libre

Jamais passé en entier depuis la refonte. **Arrêter le serveur de développement
d'abord** : `tests/unit/middleware.test.ts` simule une panne réseau, et un
serveur qui répond la lui refuse.

### 2.4 Écrire les lots 9 à 13 et cette passe dans `docs/REFONTE-V3.md`

Le document est **partagé par les trois sessions** — les sections « Écran 1 »,
« Écran 2 », « Écran 3 » sont d'autres mains. Ajouter à la suite, ne pas
réécrire les leurs.

### 2.5 Cocher la liste d'acceptation de `08-build-plan.md`

Section §8 du même document, déjà commencée.

---

## 3. Questions ouvertes — à poser au propriétaire

Aucune n'est bloquante, toutes changent le rendu :

1. le **tri** doit-il rester un `<select>` ? (la maquette en fait autre chose)
2. les **pastilles d'âge** : les garder ?
3. « La rivière qui parlait » affiche **« Gratuit » ET** un ajout au panier à
   4,99 € — les deux à la fois, est-ce voulu ? (`gratuit=t`,
   `disponible_achat=t` : la base autorise la combinaison, cf. `CLAUDE.md`)
4. les **étoiles** des témoignages : il n'existe aucune colonne de note.
5. le bloc **lettre d'information** du pied : à créer ?
6. la **signature** sous le logo (« CONTES D'AFRIQUE » dans la maquette).

---

## 4. Les tests d'architecture qui mordent sur ce chantier

En plus de ceux listés dans `CLAUDE.md` :

| Test | Ce qu'il attrape | Comment il m'a mordu |
| --- | --- | --- |
| `design-tokens` | une couleur littérale hors de sa feuille — **il lit aussi les commentaires** | **quatre fois** : `var(--motif-afrique_ouest)`, `rgba(198,113,57,.22)`, `#fff` / `#56633f`, et enfin `rgba(242,234,217,.4)` cité dans une explication d'`expertise-v3.module.css` |
| `classes-css` (**nouveau**) | `class="undefined"` | **cinq fois** — une classe déclarée uniquement sous `:global(…)` n'est pas exportée par le module CSS |

`tests/unit/classes-css.test.ts` porte **sa propre garde de balayage vide**
(`expect(examinees).toBeGreaterThan(300)`) : une première version passait en
n'examinant rien, parce que `\b` dans un littéral de gabarit est un caractère
d'effacement arrière, pas une frontière de mot. Ne pas retirer cette garde.

### La règle des commentaires, dite une bonne fois

Le test des couleurs lit les commentaires **exprès** : une valeur citée dans un
commentaire est une valeur que quelqu'un finira par coller dans une déclaration.
Pour documenter une teinte de la maquette, **la nommer sans l'écrire** — « l'encre
du chrome à 40 % », jamais la notation.

---

## 5. Pièges CSS payés comptant

- `margin: 0 auto` sur un enfant flex **annule `align-items: stretch`** — une
  section mesurait 499 px sur un écran de 1440 avec `max-width: none`.
- `height: 100%` **défait `aspect-ratio`** (voir §2.1).
- Un élément à `opacity: 0` **reste cliquable** et ne peint rien : le style
  calculé disait « visible, terre cuite », `elementsFromPoint` le mettait au
  premier plan, et rien ne s'affichait.
- Une règle `.cadreCouverture > *` en absolu avale tout, **y compris le voile** —
  d'où le `:not(.voile)`.
- Un **masque CSS qui échoue ne laisse pas un trou : il laisse le disque
  entier**, ce qui a tout l'air du dessin voulu. C'est le logo, et ça a déjà
  trompé.

---

## 6. Les départs assumés par rapport à la maquette

Ils sont volontaires et doivent le rester ; chacun est écrit à son point de
déclaration :

| Ce que la maquette pose | Ce qui est rendu | Pourquoi |
| --- | --- | --- |
| 7 teintes de tuiles | 5, assombries | 5 des 7 échouaient le 4,5:1 |
| pastille sauge avec texte | aplat sans texte | mesurée 3,73:1 |
| disque d'initiale | teinte abaissée | idem |
| pastille « EM » | le vrai logo | demande explicite du propriétaire |

Dans les trois cas de contraste, la **teinte est conservée** et seule la clarté
descend jusqu'au premier point conforme.

---

## 7. Environnement — trois pannes qui ressemblent à des bugs

1. **Serveur zombie.** Un `next dev` tué brutalement survit à la mort de sa
   tâche, garde le port 3000 et **répond 500 sur toutes les routes**, code sain.
   Tuer toute la chaîne de processus. (Mesuré : mémoire libre 1295 Mo → 3364 Mo
   après nettoyage.)
2. **Tuerie pour mémoire — cinq fois dans la journée.** La machine a 14,2 Go ; le
   serveur de développement en prend 1,7 à 2, Docker 1,4, et l'ingestion d'un PDF
   environ 3 sans les rendre. Relancer le serveur fait partie du débogage normal.
3. **Docker arrêté** → « Quelque chose n'a pas fonctionné » sur *tous* les écrans
   qui lisent la base. `docker ps` d'abord.

Et la contradiction du port 3000, qu'il faut avoir en tête en permanence :
`npm run verify` exige que **rien** n'écoute sur 3000 ; `npm run rendu` et les
cinq scripts d'atelier exigent au contraire un serveur en marche.

---

## 8. Contrôles rapides

```bash
# la base répond, et le livret est bien là
docker exec supabase_db_EditionMapoukam psql -U postgres -d postgres -At \
  -c "select slug, type_document, statut, niveau from public.books order by 2, 1;"

# les écrans de la refonte répondent 200
for p in /fr /fr/catalogue /fr/contes /fr/livrets /fr/a-propos; do \
  curl -s -o /dev/null -w "$p %{http_code}\n" "http://localhost:3000$p"; done

# un seul fichier de test
npx vitest run tests/unit/design-tokens.test.ts --project unit
```

---

## 9. Rien n'est committé

L'arbre de travail porte, en plus des fichiers modifiés, **une quarantaine de
fichiers non suivis** qui appartiennent aux trois sessions. Avant de committer :

- se limiter aux fichiers de sa propre colonne (§0.1) ;
- mettre `CLAUDE.md` à jour sur le numéro de migration (0077 → 0080) ;
- ne **pas** ajouter `.captures/`, `New section/`, ni les PDF sources.

`tests/effectif-attendu.json` se met à jour tout seul quand tout est vert ; toute
**baisse** d'effectif se corrige à la main, dans le même commit.

---

*Écrit le 7 septembre 2026, à la fin de la session qui a repris l'accueil, le
catalogue et les livrets.*
