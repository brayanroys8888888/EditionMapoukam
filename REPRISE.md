# Point de reprise — direction V2

> Écrit le 5 août 2026, avant une remise à zéro de la conversation.
> **Pour reprendre : dire « continue ».**

---

## 0. Les huit corrections — TOUTES FAITES, porte verte

> Écrit le 5 août 2026, complété le 6. Cette section portait un chantier
> interrompu au milieu d'une liste de huit points. **Les huit sont faits**, et
> `npm run verify` sort à **1354 / 1354**.

### Ce que l'utilisateur a signalé, et où en est chaque point

| # | Signalement | État |
| --- | --- | --- |
| 1 | « la publication ne fonctionne pas » | **FAIT** |
| 2 | « aucune possibilité d'éditer (modifier, supprimer) » | **FAIT** |
| 3 | « ni d'ajouter une autre version de langue » | **FAIT** |
| 4 | « les textes de l'écran de publication sont mal placés » | **FAIT** |
| 5 | « pas de possibilité d'ajouter un code promo » | **FAIT** |
| 6 | « change le logo de l'admin » | **FAIT** |
| 7 | « le téléchargement ne fonctionne pas » | **FAIT** |
| 8 | « trop de boutons dans la carte de bibliothèque » | **FAIT** |

### Ce qui reste, et c'est la seule chose

**Regarder les écrans à l'œil.** Rien de ce qui suit n'a été vu dans un
navigateur — les tests tiennent la logique, pas la mise en page. À ouvrir sous
`NEXT_PUBLIC_DESIGN_VERSION=v2` :

- `/fr/admin/contes/<id>` — le select **région**, le champ **illustrateur**, le
  bloc **Publication** remis d'aplomb, les cartes de **version**, le dépôt d'une
  **version linguistique**, la **zone de suppression** (visible sur un brouillon
  seulement) ;
- `/fr/admin/promos` — le formulaire de **création** en bas d'écran ;
- le **logo** du rail d'administration, sur n'importe quel écran `/admin`.

⚠️ **Le logo est un masque CSS, et un masque qui échoue ne laisse pas un trou —
il laisse le disque ocre ENTIER**, ce qui a tout l'air du dessin voulu. C'est ce
qui a trompé une fois déjà (§7). Vérifier qu'on distingue bien la forme du logo
dans le disque, pas seulement qu'il y a un disque.

### Ce qui a été livré, en détail

**Migration 0059** — `admin_lire_livre` rend enfin `region` et l'`id` de chaque
version. Les deux écritures existaient depuis la 0057 ; la lecture, non. Sans
`region`, l'écran affichait « non renseignée » sur un titre qui en a une et
l'écrasait au premier enregistrement ; sans l'`id`, aucune version ne pouvait
être désignée.

**Écran d'édition** (`src/app/[langue]/admin/contes/[id]/page.tsx`) — select
région (libellés repris de `regions.*`, jamais réécrits), champ illustrateur,
un formulaire titre + résumé **par version**, dépôt d'une version rattachée par
`livre_id`, et une zone de suppression qui ne paraît que sur un brouillon.

**Bloc Publication** — il mêlait `.formulaire` et `.boutons` dans le même
`.cadre`, chacun avec son propre rembourrage : trois gauches différentes. Une
seule grille `.publication` désormais, et chaque partie porte son intitulé — une
pastille « Brouillon » seule ne disait pas de quoi elle était le statut. Les
manques sont **nommés en clair** et retombent sur leur nom de colonne s'ils sont
inconnus, pour qu'un manque ajouté demain ne disparaisse pas en silence.

**Codes promo** — formulaire de création + `src/app/[langue]/admin/promos/actions.ts`.
La route existait depuis l'étape 12 sans écran. Devise et zone restent visibles
mais **ne sont envoyées que pour un montant fixe** : ce back-office n'a aucun
JavaScript client, et un champ masqué reste un champ rempli.

**Logo** — le losange CSS est remplacé par le vrai logo en masque, disque ocre
et encre vert nuit, comme le ton `sombre` du mot-symbole public.

**Tests ajoutés (+13)** — région et illustrateur posés puis relus ; correction
d'une version, effacement du résumé par la chaîne vide, refus d'une version d'un
autre titre, refus d'un titre vide ; suppression d'un brouillon nu, refus sur un
titre publié, refus sur un brouillon porteur d'un droit, refus sans motif ;
ingestion avec `livre_id` qui ajoute une version **sans** créer de second livre,
sans toucher slug ni auteur du parent, et qui **lève** sur un identifiant
introuvable.

> Le contre-test « identifiant introuvable » emploie un **troisième** PDF, et ce
> n'est pas un détail : rejouer le même fichier ne lèverait rien, `ingerer`
> reconnaissant son empreinte et rendant l'ingestion déjà faite sans jamais
> atteindre le rattachement. Le test serait passé en ne prouvant rien.

### Deux contes d'essai effacés le 6 août

`prince` (archivé) et `petiti-elephant` (brouillon), déposés à la main pendant
le diagnostic, faisaient compter **12** livres à `access.test.ts` et
`schema.test.ts`, qui en attendent **10**. Aucun droit ni ligne de commande ne
s'y rattachait. C'est le piège consigné au §9 — **un conte ingéré à l'essai fait
partie du jeu de démonstration aux yeux des tests**. Les effacer après essai.

### La cause du point 1, trouvée et corrigée à la racine — pour mémoire

`manques_pour_publication` exige **`books.region`** depuis la migration 0044.
**Aucune fonction `admin_*` ne permettait de la poser.** L'éditeur déposait son
PDF, remplissait tout ce que l'écran proposait, et « Publier » restait éteint
avec un manque nommé `region` qu'aucun champ ne pouvait satisfaire.

La région **n'est pas** l'origine culturelle : celle-ci est un texte libre
(« Peul »), celle-là est l'une des cinq valeurs de `region_conte`, sur laquelle
le catalogue filtre. `region_depuis_origine` sait deviner la seconde depuis la
première, mais son commentaire est formel : « amorçage et reprise de données
UNIQUEMENT ; en exploitation, l'éditeur pose la région à la main ».

### Le socle SQL (migrations appliquées, types régénérés)

- **`0057`** — `admin_modifier_livre` accepte `p_region` et `p_illustrateur` ;
  `admin_modifier_traduction` (titre, résumé) ; `admin_supprimer_livre`
  (**brouillon uniquement** — un titre publié est référencé en cascade par
  `entitlements` et `order_items`, le supprimer effacerait des droits payés).
- **`0058`** — correctif : `admin_modifier_traduction` vérifie que la version
  appartient bien au titre indiqué.
- `src/lib/admin/service.ts` — `modifierLivre` (+ region, illustrateur),
  `modifierTraduction`, `supprimerLivre`, type `RegionConte`.
- `PATCH /api/admin/books` accepte `region` et `illustrateur`.
- `DELETE /api/admin/books/[id]` (motif obligatoire).
- `PATCH /api/admin/books/[id]/translations`.
- `POST /api/admin/books/ingest` accepte **`livre_id`** — rattache la version à
  un titre existant au lieu d'en créer un second au slug suffixé.
- `src/lib/ingestion/pipeline.ts` — `DemandeIngestion.bookId`, et
  `livreExistant()` qui LÈVE sur un identifiant introuvable plutôt que de créer
  un doublon en silence.
- **`0059`** — `admin_lire_livre` rend `region` et l'`id` de chaque version.
  Écrire un champ qu'on ne peut pas relire, c'est écraser ce champ au premier
  enregistrement ; les trois migrations 0044, 0057 et 0059 se tiennent.

### Ce qui a été corrigé pour les points 7 et 8

- **Téléchargement** : `GET /api/downloads/[bookId]` rend une **URL signée en
  JSON**, pas un fichier. La bibliothèque y pointait un `<a>` : cliquer
  affichait du JSON brut. Nouvelle action `telechargerConte` dans
  `src/app/[langue]/compte/actions.ts` — elle lit l'URL et **y redirige**.
  L'URL signée ne fait qu'un aller et n'est écrite nulle part (300 s, et
  quiconque l'obtient obtient le fichier filigrané au nom de l'acheteur).
- **Carte de bibliothèque** : les quatre liens langue × format sont remplacés
  par **deux listes déroulantes et un bouton**. Le sélecteur de langue ne
  paraît que s'il y a plus d'une langue.

### État des portes

```
npm run typecheck   → 0
npm run lint        → 0
npm run test        → 1354 / 1354   (6 août 2026)
```

Le serveur de développement tourne peut-être encore
(`NEXT_PUBLIC_DESIGN_VERSION=v2`) : **l'arrêter avant `npm run verify`**, qui
exige le port 3000 libre.

---

## 0 bis. Le dépôt d'un conte en ligne — CINQ DÉFAUTS, UN SEUL COUPABLE

> 9 et 10 août 2026, après la mise en ligne de la V2 sur Vercel.
> **Résolu.** Vérifié en mesurant les fichiers réellement servis : sept
> couvertures, zéro corrompue.

### Ce qui était signalé

1. le dépôt d'un conte ne redirige plus vers l'écran d'édition — il faut
   repasser par le tableau de bord ;
2. les couvertures des contes récemment publiés ne s'affichent pas ;
3. la lecture en ligne ne fonctionne pas sur ces mêmes contes.

> ⚠️ **Cette section a d'abord conclu « trois symptômes, une seule cause : le
> chronomètre ». C'ÉTAIT FAUX**, et l'erreur mérite d'être conservée plutôt
> qu'effacée : le plafond serverless était un défaut réel, il a été corrigé, et
> le problème est resté entier. Quatre défauts authentiques ont ainsi été
> réparés avant qu'on n'atteigne le bon — voir §0 ter.
>
> Ce qui a débloqué n'a pas été une meilleure déduction, mais **d'arrêter de
> déduire** : rendre l'erreur nommable, puis télécharger les fichiers en ligne
> et lire leurs octets.

### La cause

**Aucun `maxDuration` n'était déclaré, et aucun `vercel.json` n'existait.**
Vercel coupe donc la fonction au bout de 10 à 15 secondes, quand une ingestion
en demande une trentaine — rendre N pages en deux résolutions n'est pas une
requête, c'est un traitement.

Le brouillon étant créé à la **première** étape et tout le reste rattaché à la
**dernière**, la fonction tuée en cours de route laissait exactement l'état
observé :

| Étape | Sort |
| --- | --- |
| `creerBrouillon` | ✅ le livre existe, visible et publiable |
| rendu des pages | souvent ✅ — c'est l'étape longue, elle aboutissait |
| `publierCouverture` | fichiers déposés, mais **jamais rattachés** |
| `finaliser` (couverture + `fichier_lecture`) | ❌ **jamais atteinte** |
| réponse HTTP → redirection | ❌ jamais envoyée |

### Ce qui a été corrigé

- **`export const maxDuration = 60`** sur `api/admin/books/ingest/route.ts`,
  `admin/contes/nouveau/page.tsx` et `admin/contes/[id]/page.tsx`.

  > ⚠️ **Le déclarer sur la seule route d'API n'aurait rien corrigé.**
  > `deposerConte` appelle `ingererRoute(req)` **en direct**, en mémoire, et non
  > par un `fetch`. Le travail se fait donc dans la fonction serverless de la
  > **page** qui héberge la Server Action, et c'est son plafond que Vercel
  > applique. Un correctif posé au mauvais endroit en aurait eu toutes les
  > apparences.

  60 s et pas plus : c'est le plafond du palier **Hobby**, et une valeur qui
  dépasse le palier souscrit **fait échouer le déploiement**. Sur un palier Pro,
  elle peut monter à 300.

- **`pipeline.ts` persiste désormais chaque acquis dès qu'il existe** —
  `rattacherCouverture()` juste après la publication des images,
  `ouvrirLecture()` juste après l'enregistrement des pages, `finaliser()` réduit
  au seul téléchargeable. Un plafond ne suffit pas : un PDF assez gros le
  dépassera toujours. Ce qui rend le système robuste, c'est qu'une interruption
  y laisse un conte **utilisable** plutôt qu'une coquille.

  La règle : **on ne diffère jamais l'enregistrement d'un fait acquis derrière
  une étape qui ne le conditionne pas.** La lecture en ligne ne dépend en rien
  de l'EPUB ; elle attendait pourtant qu'il soit assemblé.

- **`nettoyerApresEchec` déréférence ce qu'il efface.** Conséquence directe du
  point précédent : un échec après l'écriture de la couverture aurait laissé la
  base pointer vers des fichiers supprimés. Or une couverture manquante ne fait
  pas un trou visible — `NoSuchKey` donne une **image cassée** là où le
  substitut se serait affiché proprement. Déjà rencontré (§7), déjà passé
  inaperçu des jours.

### Réparer les contes déjà déposés

```bash
node scripts/reparer-ingestions-interrompues.mjs --distant --sec   # énumère
node scripts/reparer-ingestions-interrompues.mjs --distant         # écrit
node scripts/produire-couvertures.mjs --distant                    # couvertures
```

Idempotent, et il **n'invente rien** : une version dont les pages manquent est
signalée pour redépôt, jamais « réparée ». Lui poser `fichier_lecture`
ouvrirait un lecteur sur un livre vide — l'acheteur croirait le produit
défectueux plutôt qu'indisponible.

### Deux défauts trouvés au passage, sans rapport avec l'ingestion

La porte les a signalés en même temps ; ni l'un ni l'autre ne venait de ce
chantier.

**1. Une couleur littérale dans `espace.module.css`.** Six déclarations
portaient `var(--v2-vert, ...)` avec un repli écrit en dur — arrivé avec le
commit `7bfe099` (« boutons verts »). Le repli **n'était même pas la teinte du
jeton** : il ne pouvait donc rien sauver, seulement afficher un vert étranger à
la charte le jour où la variable manquerait. Replis retirés.

> Et le commentaire qui expliquait la correction citait les deux valeurs, ce qui
> **faisait échouer le test à son tour**. `design-tokens.test.ts` lit le contenu
> brut, commentaires compris — exactement comme celui qui interdit la lecture
> directe de l'horloge (§9). Écrire la valeur proscrite pour dire qu'on l'a
> retirée rouvre la porte qu'on ferme.

**2. `subscriptions.test.ts` a de nouveau échoué par CALENDRIER.** Deuxième
occurrence, et la première correction n'avait traité qu'une assertion.

La fixture ouvre un essai de sept jours ancré sur `DEPART`
(29 juillet). Les tests de transition injectent une `FixedClock` et pilotent donc
le temps de bout en bout — ils vont bien. Mais le test de **route** passe par
HTTP, et la base y répond avec `app_now()`, c'est-à-dire l'heure **réelle** :
depuis le 5 août à midi, l'essai était échu et la route rendait `anomalie` là où
le test attendait `essai`.

Corrigé à la cause : `souscrireAvecEssai` accepte désormais une **ancre**, et le
test de route passe un instant relatif à maintenant. La règle qui s'en dégage :
**une fixture lue à travers une route ne peut pas être ancrée sur une date écrite
en dur.**

**3. `concurrence.test.ts` était INSTABLE, et sa signature était la pire qui
soit.** Il tenait la place du sémaphore pendant 20 ms, attendait 5 ms, puis
mesurait la file. Marges suffisantes sur une machine au repos ; insuffisantes
sous la charge des soixante-quatorze fichiers, où l'attente de 5 ms en prenait
plus de 20 — la place était donc déjà rendue, et la file mesurée à zéro.

Il échouait une fois sur quelques dizaines **et passait toujours en isolation**.
C'est la signature la plus coûteuse : on conclut au hasard, puis on cesse de lire
les échecs de la porte — ce que `porte-tests.mjs` existe précisément pour
empêcher.

Réécrit **sans aucune horloge** : la place est tenue par une promesse résolue à
la main, si bien qu'il n'y a plus de course. Vérifié par huit exécutions
concurrentes.

### Le piège des contes d'essai, troisième occurrence

Un brouillon `zako`, déposé à la main pendant le diagnostic, a fait échouer le
test de rattachement d'une manière parfaitement opaque : `ingerer` teste
l'**empreinte** du fichier avant tout, si bien qu'un PDF déjà ingéré est rendu
tel quel **sans que `bookId` soit même regardé**. L'échec se présentait comme
une comparaison d'identifiants.

Le test assert désormais `dejaIngere === false` **en premier**, avec un message
qui nomme la vraie cause. Un test qui échoue pour la mauvaise raison coûte plus
qu'un test absent.

---

## 0 ter. Les quatre défauts suivants, et le vrai coupable — 10 août 2026

> Suite directe du §0 bis, qui s'était trompé de cause. Chacun des défauts
> ci-dessous était **réel** et méritait sa correction ; aucun n'était celui qui
> bloquait l'éditeur, sauf le dernier.

### 1. `sharp` NE LIT PAS le PDF — le repli était cassé par construction

Le repli serverless (« pdf-lib + sharp », commit `0f7f46f`) appelait
`sharp(cheminPdf, { page })`. Or libvips ne lit le PDF que compilé avec poppler
ou pdfium, ce que **les binaires npm ne sont pas** :

```
sharp.format.pdf.input → { file: false, buffer: false, stream: false }
sharp("conte.pdf")     → « Input file contains unsupported image format »
```

`pdf-lib` sait lire la **structure** d'un PDF — compter ses pages, lire ses
métadonnées — mais **ne dessine rien**. La moitié analyse fonctionnait donc, la
moitié rendu levait à chaque conte.

**Pourquoi personne ne l'a vu :** poppler est installé sur les postes de
développement, donc la branche de repli n'était **jamais prise**. Un repli
qu'aucun environnement n'emprunte est un repli que personne n'éprouve. D'où
`tests/integration/ingestion-sans-poppler.test.ts`, qui neutralise poppler et
fait tourner la chaîne entière.

### 2. Un binaire NATIF ne se trace pas — le moteur ne se chargeait pas

Premier remplacement : `pdf.js` + `@napi-rs/canvas`. Fonctionnait en local,
échouait en ligne. `requireNative()` choisit son binaire **à l'exécution** :

```js
if (process.platform === 'linux') { … }
execSync('ldd --version')        // glibc ou musl ?
require('@napi-rs/canvas-linux-x64-gnu')
```

Aucune analyse statique ne suit cela. `outputFileTracingIncludes` n'y a rien
changé — **mesuré deux fois en production**.

### 3. La bascule en WebAssembly — la cause supprimée, pas ajustée

`@hyzyla/pdfium` (**MIT**, PDFium sous BSD) : un seul fichier `.wasm`, le même
sur toute plateforme, à un chemin fixe. Plus rien à embarquer correctement, donc
plus rien à embarquer de travers — et l'embarquement devient **vérifiable** :

```
route ingest / contes/nouveau / contes/[id] → pdfium.wasm dans le manifeste ✅
```

> `mupdf` rasterise très bien et a été **écarté** : AGPL-3.0, c'est-à-dire ce
> qui vaut à PyMuPDF et ebooklib leur interdiction dans ce projet.

`pdfjs-dist` et `@napi-rs/canvas` sont **retirés**. Le rendu est aussi plus
rapide : 950 ms contre 2,4 s.

### 4. Une page blanche est un échec de rendu — et il ne lève pas

Un moteur qui échoue **mal** produit une image parfaitement valide — bonnes
dimensions, bon format, bon poids — et entièrement blanche. Elle était déposée,
rattachée, publiée. Le pipeline refuse désormais un document dont **toutes** les
pages sont unies ; le refus ne porte jamais sur une page isolée, une page de
garde étant légitime.

### 5. LE COUPABLE — un `Buffer` nu décodé comme du texte

Diagnostic **mesuré** sur les fichiers réellement servis, et non déduit. Sur les
dix couvertures du catalogue : huit valides, **deux répondant `200 image/webp`
en étant illisibles** — les deux plus récentes, déposées par le web.

```
saine     : 52 49 46 46  66 67 00 00        RIFF fg..
corrompue : 52 49 46 46  ef bf bd ef bf bd  RIFF ......
```

`EF BF BD` est l'encodage UTF-8 de **U+FFFD**. Chaque octet ne formant pas de
l'UTF-8 valide avait été remplacé : le binaire avait traversé un **décodage
texte**. Une vignette de 26 Ko en pesait 68.

Les dépôts passaient un `Buffer` **nu** à `fetch`, que Next instrumente pour son
cache. Ils passent désormais un **`Blob`** (`src/lib/storage/blob.ts`), traité
comme une pièce opaque.

**Trois raisons pour lesquelles rien ne l'avait vu :**

1. **le dépôt RÉUSSIT** — aucune exception, rien dans les journaux ; c'est à la
   lecture, bien plus tard, qu'une image refuse de s'ouvrir ;
2. **en local il n'existe pas** — le client Supabase parle à Docker sans passer
   par le `fetch` de Next ;
3. **le fichier ressemble à un WebP** — bons en-têtes, bon type MIME, servi en
   `200`. Il est seulement plus gros.

`tests/integration/stockage-binaire.test.ts` relit ce qu'il dépose et compare
les empreintes. Il éprouve aussi des octets **aléatoires** : « RIFF » est de
l'ASCII pur qui survit à un décodage texte — c'est bien pourquoi les fichiers
corrompus avaient l'air valides — alors que du bruit ne pardonne rien.

### Le dépôt nomme désormais l'étape qui échoue

Toute panne rendait `erreur_interne`, donc « Réessayez plus tard ». Diagnostiquer
exigeait les journaux du serveur, que l'éditeur n'a pas. Cinq codes distincts
remontent maintenant — `moteur_de_rendu_absent`, `pdf_illisible`,
`rendu_impossible`, `stockage_indisponible`, `traitement_trop_long` — sans qu'un
seul chemin de fichier ni une trace de pile ne franchisse la frontière.

**C'est ce qui a débloqué l'enquête.** « Où ça a cassé » n'est pas un détail
interne : c'est ce qui distingue un PDF protégé d'une panne de déploiement.

### Combien de pages la chaîne tient-elle ? — mesuré le 10 août

Le code plafonne à **300 pages** (`LIMITES.pagesMax`). La contrainte réelle n'est
pas là : c'est le **temps de fonction**.

Mesuré sur un conte du corpus, rendu WASM + encodage des deux résolutions,
**sans** les téléversements :

```
790 ms par page   →  ~75 pages en 60 s   (palier Hobby)
                  →  ~379 pages en 300 s (palier Pro)
```

Bout en bout, téléversements compris, compter plutôt **1,5 à 2 s par page** : la
chaîne complète sur 14 pages prend 22 s en local, et les dépôts vont plus vite
vers Docker que vers un Supabase hébergé.

| Pages | Hobby (60 s) | Pro (300 s) |
| --- | --- | --- |
| ~30 | ✅ | ✅ |
| ~50 | limite | ✅ |
| **100** | ❌ **échoue** | ✅ |
| 300 | ❌ | limite |

**Un dépassement n'abîme rien mais perd tout le travail :** `enregistrerPages`
n'intervient qu'une fois TOUTES les pages rendues, si bien qu'une coupure en
cours de rendu laisse un titre sans page. L'éditeur voit alors
`traitement_trop_long`, qui nomme exactement ce cas.

**Pour dépasser 75 pages :** passer `maxDuration` de 60 à **300** dans les trois
fichiers (route d'ingestion + les deux écrans), ce qu'un palier Pro autorise. Une
valeur au-dessus du palier souscrit **fait échouer le déploiement**.

### CE QU'IL FAUT EN RETENIR

> **Devant une image qui ne s'affiche pas alors que le dépôt a réussi :
> télécharger le fichier et lire ses octets AVANT tout autre diagnostic.**

Quatre corrections justes ont précédé la bonne. Toutes portaient sur des défauts
réels, aucune n'a résolu le problème — parce qu'elles répondaient à des
hypothèses, pas à une mesure. Une seule commande sur le fichier servi aurait
tranché dès le premier jour.

**Corollaire :** un défaut qui ne se reproduit qu'en ligne vient presque toujours
de la **plateforme** — durée, taille de corps, traçage de fichiers, traitement du
binaire — et non du code métier. Les quatre premiers défauts de cette liste sont
tous de cette famille.

---

## 1. Où en est le chantier

La **direction V2** est un *thème commutable*, pas une seconde application.
Les URL, le backend, les droits et les 1271 tests sont partagés ; seuls la
palette, la typographie et la mise en page de quelques écrans changent.

```
NEXT_PUBLIC_DESIGN_VERSION=v2     # à ajouter dans .env.local
```

Le mécanisme tient en trois pièces :

| Pièce | Rôle |
| --- | --- |
| `src/design/tokens.css` | Les valeurs `--v2-*` **et** le bloc `[data-design='v2']` qui réaffecte les noms sémantiques |
| `src/design/version.ts` | Lit la variable, replie sur `v1` |
| `src/app/layout.tsx` | Pose `data-design` sur `<html>` — **tout le commutateur est là** |

Conséquence à ne pas perdre de vue : **aucun composant ne connaît le thème**.
Ils lisent des jetons qui changent de valeur sous eux.

### État des portes

| Commande | Résultat |
| --- | --- |
| `npm run verify` | **1354 / 1354** (6 août 2026) |
| `npm run rendu` | **42 / 42** (Playwright, 12 ignorés — propres à un autre appareil) |

`npm run rendu` exige un serveur en marche ; `npm run verify` exige au contraire
que **rien n'écoute sur le port 3000** (`tests/unit/middleware.test.ts` simule
une panne réseau).

---

## 2. Ce qui est fait

### Socle
- Palette V2 mesurée : vert `#1f4d2e`, crème `#fbf7ef`, ocre `#d97a34`, encre `#24201b`.
  **L'ocre est une SURFACE** — 2,90:1 sur la crème, donc jamais du texte ;
  `--v2-ocre-encre` (5,10:1) existe pour ça. 14 tests recalculent tout.
- Les cinq couleurs de tradition **sortent de l'affichage** : ce sont les
  couvertures qui apportent la couleur. Les noms survivent et pointent vers le vert.
- Logo officiel en **masque CSS** (le fichier fourni est blanc sur transparent,
  donc invisible sur fond clair), favicon composé sur disque vert.
- Bulles ovales animées en arrière-plan, figées sous `prefers-reduced-motion`.

### Écrans publics
Accueil (hero en image + en-tête transparent), boutique (filtres en colonne),
fiche enrichie (âge, pages, formats, langues **avant** le bouton), blog (5 articles
en fichiers), à propos, contact, tiroir de panier, squelettes de chargement.

### Administration
Rail vert nuit, tableau de bord, contes, commandes. **Nunito seul** — la charte
interdit Fraunces au back-office.

### Enveloppe
`src/design/enveloppe.ts` décide : `transparente` (accueil), `nue`
(authentification + administration), `complete` (le reste).

---

## 3. Ce qui reste

1. ~~**Administration**~~ — **fait le 5 août 2026**. Utilisateurs, abonnements
   et promos (trois écrans de liste), puis **l'ajout et l'édition d'un conte**
   — le seul écran qui MUTE.

   Points tenus par ces écrans, à ne pas défaire :
   - les abonnements affichent **`statut_observe`**, calculé en base par
     `statut_effectif` contre `app_now()`, jamais `statut` ni une comparaison
     de dates faite ici — c'est le bug classique de ce type de plateforme ;
   - les montants sont formatés **devise par devise** (le franc CFA n'a pas de
     sous-unité), comme sur l'écran des commandes ;
   - l'édition passe par **trois formulaires**, parce que trois fonctions SQL :
     champs métier, prix (une zone à la fois), publication. Un formulaire
     unique aurait dû inventer une transaction que la base n'offre pas ;
   - **ni titre ni résumé ne s'éditent** : ils vivent dans `book_translations`
     et viennent du fichier déposé. Aucune fonction `admin_*` ne les modifie,
     et en inventer une ouvrirait une seconde voie d'écriture sur des données
     que la chaîne d'ingestion tient pour siennes.
2. ~~**Panier et validation de commande**~~ — **fait le 5 août 2026**, voir §9.
3. ~~**Responsive mobile**~~ — **fait le 5 août 2026** :
   - menu plein écran (`src/components/v2/menu-mobile.tsx`) et pied en
     accordéon : déjà faits ;
   - **feuille modale de filtres** : faite, en `:target` — voir §7 ;
   - **tri glissant** : fait, le rang de tri prenait trois lignes sur 412 px et
     reprenait la place que la feuille venait de rendre.
4. **Vérifier le rendu à l'œil** — commencé : la **boutique** a été regardée en
   1440 px et en Pixel 7, et les **trois nouveaux écrans d'administration** en
   1440 px, connecté. Restent l'accueil, la fiche, le blog, à propos, contact,
   le panier, et les trois écrans d'administration plus anciens.

   S'y ajoute, depuis le 6 août, **tout ce qu'a livré le §0** : l'écran
   d'édition d'un conte, le formulaire de promo, et le logo du rail. Voir la
   liste au §0, avec l'avertissement sur le masque CSS.

---

## 4. Décisions prises, à ne pas rejouer

| Question | Réponse retenue |
| --- | --- |
| Palette | Le vert du site actuel, enrichi |
| Cohabitation V1/V2 | Thème commutable, mêmes routes |
| Blog | Fichiers versionnés (`src/content/blog.ts`), pas de table |
| Tunnel d'achat | Modèle numérique conservé — ni quantité ni adresse |
| Hero | `photo_2026-08-04_17-47-32.jpg` (village au crépuscule) |
| Tablette Playwright | Chromium, pas WebKit — 100 Mo de plus pour rien |

---

## 5. Pièges rencontrés, et ce qu'ils ont appris

- **`<details>` ne peut pas être ouvert conditionnellement sans JavaScript.**
  `open` est du balisage, et le serveur ne connaît pas la largeur de l'écran.
  D'où : accordéon **fermé** au pied (ce qu'on veut), hauteur **bornée** pour
  les filtres (qui doivent rester ouverts sur ordinateur).
- **Un `<form>` dans un `<a>` est invalide** — les navigateurs sortent le
  formulaire du lien. D'où la carte à lien étiré par pseudo-élément, et le
  bouton d'ajout au-dessus par `z-index`.
- **Les couvertures des suggestions rendaient un chemin brut**, pas une URL :
  404 silencieux. Corrigé et verrouillé par un test.
- **Aucune police n'était chargée** au départ, puis le middleware redirigeait
  `/fonts/*.woff2`. Deux fois le même symptôme — une page en Georgia, qui
  ressemble à un mauvais dessin et non à une panne.
- **Le serveur de développement arrêté brutalement** laisse le port occupé et
  ses processus de rendu morts : tout répond `500`. Purger le port avant de
  relancer. Un `.next/dev/types` à moitié écrit fait aussi échouer `typecheck`.
- **Docker arrêté** ⇒ « Quelque chose n'a pas fonctionné » sur tous les écrans
  qui lisent la base. C'est la première chose à vérifier.

---

## 6. Identifiants d'administration (base LOCALE)

```
admin@editionmapoukam.test
Adm-JL8HLFGBbdoS-7
```

Régénérables : `npm run admin:creer [adresse] [mot de passe]`.
Le script refuse de tourner en production **et** si la base n'est pas locale.

---

## 7. Ce qui a été appris le 5 août

### La feuille de filtres tient sur `:target`, pas sur `<details>`

Le §5 disait vrai — aucune media query n'ouvre un `<details>` fermé, et le
serveur ne connaît pas la largeur de l'écran. Mais `:target` **est** du CSS,
donc soumis aux media queries : sous 860 px il ouvre la feuille, au-dessus
aucune de ses règles ne s'applique et la colonne reste une colonne.

Trois points à ne pas défaire :

- **L'ancre est un `<span display:none>` posé À CÔTÉ de la feuille**, jamais la
  feuille elle-même. Un navigateur ne défile pas vers ce qu'il ne dessine pas :
  sans cela, chaque clic de filtre sur ORDINATEUR faisait sauter la page
  jusqu'à la colonne de gauche. Le sélecteur est `.ancre:target ~ .feuille`.
- **Les pastilles de la feuille reconduisent `#filtres`** (`lienFeuille`), ce
  qui permet d'en cocher plusieurs de suite. Sans cela « Voir N contes »
  n'aurait aucun sens, puisque chaque pastille est un lien donc un
  rechargement.
- **`min-height: 0` sur le panneau de filtres.** Un enfant de boîte flexible
  vaut `min-height: auto` : il refuse de descendre sous la hauteur de son
  contenu et fait déborder la feuille au lieu de défiler dedans. Playwright a
  mesuré 995 px de filtres dans une feuille de 839.

### Le middleware avait remangé un dossier de `public/`

Exactement le défaut de `/fonts` décrit au §5, rejoué sur `/images` : le logo
est posé en **masque CSS** depuis `/images/logo-mapoukam.png`, redirigé en
`/fr/images/...` puis 404. Et un masque qui échoue ne laisse pas un trou — il
laisse **le disque vert entier**, c'est-à-dire une pastille qui a tout l'air
d'être le dessin voulu. Personne ne l'avait vu.

Corrigé, et surtout **verrouillé** : `tests/unit/middleware.test.ts` lit
maintenant `public/` sur le disque et exige que chaque entrée traverse le
middleware sans redirection. La liste n'est plus récitée, elle est vérifiée.

### Aucun test ne gardait les ÉCRANS d'administration

Les routes d'API en avaient (`tests/security/admin.test.ts`), les fonctions SQL
aussi. Les pages, non : un écran qui oublie `exigerAdministrateur` ne lève
aucune erreur — il s'affiche, et son auteur le voit marcher parfaitement,
puisqu'il est administrateur. Les données restent protégées, mais l'écran
révèle la structure de l'administration, ce que le 404 refuse justement de dire.

`tests/unit/admin-architecture.test.ts` lit maintenant le dossier des écrans et
exige la garde sur chaque `page.tsx` — un écran ajouté demain y tombe sans
qu'on ait à l'inscrire quelque part.

### Les couvertures manquent en local — et ce n'est PAS un défaut de code

Les huit titres portent un `couverture_jeton`, mais le bucket `covers` ne
contient rien : `NoSuchKey` sur `covers/<jeton>/vignette.webp`. D'où une image
cassée là où `SubstitutCouverture` était prévu.

`node scripts/produire-couvertures.mjs` refuse, et il a raison : les pages source font
1 px de large — ce sont les substituts du jeu de démonstration, pas des pages
de conte (c'est le refus introduit par le commit `054a230`). Les vraies
couvertures viennent de `scripts/remplacer-contenu.mjs`, qui les dépose depuis
de vrais PNG. **À décider :** rejouer ce script, ou retirer le jeton des livres
sans fichier pour que le substitut s'affiche.

---

## 9. Les deux tunnels, et le tableau de bord comptable — 5 août 2026

### Les écrans livrés

| Écran | Route |
| --- | --- |
| Récapitulatif avant commande | `/[langue]/panier/confirmation` |
| Moyen de paiement et coordonnées | `/[langue]/paiement/[commande]?moyen=` |
| Souscription d'abonnement | `/[langue]/abonnement/souscrire?offre=&moyen=&fait=` |
| Dépôt d'un conte | `/[langue]/admin/contes/nouveau` |
| Édition d'un conte | `/[langue]/admin/contes/[id]` |
| Tableau de bord comptable | `/[langue]/admin?periode=30\|90\|365\|tout` |

Le raccourci **Administration** paraît dans l'en-tête V2 et dans le menu plein
écran dès que le compte connecté porte le rôle `admin`.

### Trois décisions, et leur raison

- **Aucun booléen « a acheté » / « est abonné » n'a été ajouté.** La demande
  était compréhensible et le mécanisme existait déjà : `FakePaymentProvider`
  émet un vrai webhook signé, qui écrit dans `entitlements`. Deux colonnes
  auraient créé une seconde source de vérité, et le site aurait montré un
  accès que le moteur de droits refuse ensuite — précisément le bug que
  CLAUDE.md règles 4 et 5 existent pour empêcher.

- **Aucun numéro de carte n'est demandé, et la règle n'a pas bougé.** Sa
  portée s'est précisée. Orange Money et MTN MoMo demandent un **numéro de
  téléphone**, ce que leur API exige réellement : ce champ survivra tel quel à
  l'intégration. La carte, elle, mène à une page « prestataire » — c'est aussi
  ce que fera Stripe, dont les champs sont hébergés chez lui pour que le
  numéro ne touche jamais notre serveur.

- **Rien de ce qui est saisi n'est conservé.** Nom, adresse et numéro sont
  validés côté serveur puis oubliés : aucune table ne les porte, et ils ne
  voyagent pas non plus dans l'événement de webhook — un numéro personnel
  écrit dans `webhook_events.payload` y resterait pour toujours.

### Les pièces

| Pièce | Rôle |
| --- | --- |
| `src/domain/payments/moyens.ts` | Les trois moyens, leurs pays, `exigeTelephone` |
| `src/lib/tunnel/coordonnees.ts` | Validation serveur, rend les champs en défaut |
| `src/components/tunnel/` | Fil d'étapes, bandeau de simulation, cartes, champs |
| `src/lib/subscriptions/souscription.ts` | Montant, devise, zone, essai — **une seule fois** |
| `/api/abonnement-simule` | Jumelle de `/api/paiement-simule`, pour l'abonnement |

Cinq migrations : `0054` (`admin_lire_livre`), `0055`
(`stats_chiffre_affaires_resume`), `0056` (correctif de nommage sur 0054),
`0057` (région, édition d'une version, suppression d'un brouillon), `0058`
(correctif d'appartenance sur 0057). **Toutes appliquées en local**, types
régénérés.

### Ce qui a été appris

- **`/offres` bouclait sur lui-même.** Le bouton « S'abonner » menait à
  `/compte/abonnement`, qui répondait « vous n'avez pas d'abonnement » et
  renvoyait à `/offres`. `POST /api/subscriptions` existait depuis l'étape 10
  et **aucun écran ne l'appelait**.

- **Un test d'architecture a attrapé un nom, pas un défaut — et il avait
  raison.** `admin_lire_livre` rendait `a_fichier_telechargement`, un booléen
  dérivé. Le test réserve ce NOM au service de téléchargement. La tentation
  était d'ajouter une exception ; le correctif (`lisible`, `telechargeable`)
  était meilleur, parce qu'un drapeau qui emprunte le nom d'une colonne finit
  par être pris pour elle.

- **Un test peut échouer par calendrier.** `subscriptions.test.ts` comparait la
  fin de période d'une fixture (29 juillet + 7 jours) à `Date.now()`. Il a
  cessé de passer le 5 août à midi UTC, sans qu'une ligne ait bougé. Corrigé :
  il compare désormais à `DEPART`.

- **Un test d'intégration qui MUTE le jeu de démonstration doit le rendre
  intact.** Un prix laissé à 2 500 XAF sur `le-lion-et-la-souris` a fait tomber
  quatre tests d'autres fichiers — catalogue, commandes, conformité du seed —
  dont aucun ne parlait d'administration.

- **Le faux prestataire émet un VRAI `fetch` vers le port 3000.** Un test qui
  passe par lui exige donc un serveur en marche, ce que `verify` interdit. La
  suite d'abonnement déroute `fetch` vers le gestionnaire de webhooks importé :
  le récepteur reste réel, seul le transport est court-circuité.

- **Le test qui interdit `new Date()` lit aussi les commentaires.** Écrire
  l'appel interdit pour dire qu'on ne l'emploie pas fait échouer la porte.
  C'est une grossièreté, mais du bon côté : un test qui pardonne les
  commentaires pardonne le code mis en commentaire.

### Le dépôt d'un conte échouait — DEUX plafonds, dont un invisible

Signalé par l'utilisateur juste après la livraison. Aucun test ne pouvait le
voir, et les deux causes se cachaient l'une derrière l'autre.

**1. Next borne le corps d'une Server Action à 1 Mo.** Les contes du corpus
pèsent 1,1 Mo : le dépôt échouait pour **chaque fichier réel**. Le serveur
journalisait `Body exceeded 1 MB limit` ; l'éditeur voyait l'écran d'erreur
générique, sur un formulaire qui lui annonce cent mégaoctets. Corrigé par
`experimental.serverActions.bodySizeLimit` dans `next.config.ts`, aligné sur
`TAILLE_MAX_OCTETS` — et `tests/unit/plafond-depot.test.ts` échoue si les deux
divergent, **ou si les deux descendent sous 10 Mo** (aligner deux plafonds trop
bas passerait l'égalité sans rien réparer).

Ce réglage est **global à toutes les Server Actions** : un corps de cent
mégaoctets sera mis en mémoire avant tout contrôle de rôle. Acceptable en
local, à réexaminer avant une mise en ligne.

**2. Un champ facultatif laissé vide n'est pas absent.** Une fois le premier
plafond levé, le dépôt revenait en `erreur=requete_invalide`. `titre` et
`auteur` sont facultatifs et l'écran invite à les laisser vides — mais un
`<input>` vide figure dans le corps multipart avec la valeur `''`, que
`z.string().min(1)` rejetait. Le `?? undefined` de la route ne rattrapait que
`null`, c'est-à-dire le champ jamais envoyé. Corrigé par `renseigne()` dans la
route ; deux tests l'encadrent, dont un contre-test sur un titre trop long.

**Pourquoi aucun test ne l'avait vu :** ceux de l'ingestion construisent leur
`FormData` à la main et n'y posent que `fichier` et `langue`. **Seul un vrai
navigateur envoie des champs vides et bute sur le plafond des Server Actions.**
La vérification s'est donc faite sous Playwright — piloter une Server Action en
`curl` ne marche pas, elle exige l'en-tête `Next-Action` et un identifiant
d'action recompilé à chaque démarrage.

**Attention en testant à la main :** un conte ingéré à l'essai reste dans la
base et fait partie du jeu de démonstration **aux yeux des tests** —
`schema.test.ts` et `access.test.ts` en ont échoué. Les effacer après essai.

### Compte de démonstration créé pour la simulation

```
parent.demo@editionmapoukam.test / Demo-Parent-2026-x9
```

Il porte un achat payé (`La tortue et le lapin`, 4,99 €) et un abonnement
annuel, ce qui garnit le tableau de bord. `npm run db:reset` l'efface.

---

## 8. Pour relancer

```bash
npm run supabase:start                       # Docker doit tourner
NEXT_PUBLIC_DESIGN_VERSION=v2 npm run dev
```

Rien n'est poussé. Le dernier commit est `c223698`.
