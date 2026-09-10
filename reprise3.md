# Point de reprise 3 — la passe au pixel, de la droite vers la gauche

> Écrit le 7 septembre 2026, à la fin de la session qui a livré le chrome et
> les écrans `Nous écrire`, `À propos` et `Expertise & conseil`.
>
> **Pour reprendre : dire « continue ».** Le prochain écran est **`Boutique`**.
>
> *Mise à jour des 7 et 8 septembre 2026, seconde session : `Association` et
> `Offres` sont livrés.*

Ce fichier est la reprise *opérationnelle* : ce qui est fait, ce qui reste, où
sont les outils, quels pièges ont déjà coûté du temps, et ce qui attend une
décision du propriétaire. Le *récit* de la passe, lui, est dans
`docs/REFONTE-V3.md` § 9 — les deux se lisent ensemble et ne se répètent pas.

---

## 1. La consigne, mot pour mot

> « on va continue avec la refonte du site mais de la la plus a droite vers
> celle la plus a gauche, dans notre cas la section la plus a droite est
> "Nous ecrire". le design du site doit etre perfect pixel a celui de la
> maquette qui est dans mon projet claude design "Refonte design complète du
> site" que tu peux consulter a tout moment grace au serveur mcp claude
> design. tu dois commencer immediatement et n'oublie pas le site doit etre
> perfect pixel a la dimension pres, aucun ecart ne sera tolere ; pour plus de
> detail sur le site tu consulteras le dossier "design_handoff_edition_mapoukam"
> qui est a la racine du dossier. »

Puis : « fais le lot chrome et directement ensuite continue avec « A propos » »,
« remet le logo officiel […] les vrais textes et l'image sont dans
`New section/A propos` », et « oui vas-y avec la prochaine ».

Le projet Claude Design s'appelle **« Refonte design complète du site »**,
identifiant `b41ce6a2-73cb-4d17-bb4f-8582be43d7e0`, consultable par le serveur
MCP `claude-design`.

**Deux autorités, dans cet ordre.** Le README du dossier tranche lui-même :
*« when a doc here and the prototype disagree, the prototype wins »*. Le
prototype est `design_handoff_edition_mapoukam/Site EditionMapoukam.dc.html`
(bureau) et `… Mobile.dc.html` (390 px). Les onze fichiers `.md` du dossier
expliquent, ils n'arbitrent pas.

**Une autorité qui bat les deux :** la donnée réelle. Une maquette n'est jamais
une autorité sur un prix, une adresse, un texte de propriétaire ou une règle
métier — `docs/maquettes/` le dit déjà pour les siennes.

---

## 2. L'ordre de marche, et où il en est

L'ordre vient de `NAVIGATION`, dans `src/components/enveloppe/v2.tsx` :
Offres · Association · Expertise & conseil · À propos · Nous écrire.
De droite à gauche, donc :

| # | Écran | Route | État |
| --- | --- | --- | --- |
| 0 | **Le chrome** (en-tête, barre utilitaire, pied) | partout | ✅ livré 6–7 sept. |
| 1 | **Nous écrire** | `/[langue]/contact` | ✅ livré 6 sept. |
| 2 | **À propos** | `/[langue]/a-propos` | ✅ livré 7 sept. |
| 3 | **Expertise & conseil** | `/[langue]/expertise` | ✅ livré 7 sept. |
| 4 | **Association** | `/[langue]/association` | ✅ livré 7 sept. |
| 5 | **Offres** | `/[langue]/offres` | ✅ livré 8 sept. |
| 6 | **Boutique** | `/[langue]/catalogue` (+ `rayon.tsx`) | ⬅️ **LE PROCHAIN** |
| 7 | **Accueil** | `/[langue]` | à faire |

✅ La section « Ce que la passe n'a pas encore touché — le chrome » de
`docs/REFONTE-V3.md`, qui était périmée, porte désormais son encadré de
clôture — elle est conservée pour mémoire et ne se lit plus comme un
reste-à-faire.

---

## 3. Où trouver chaque écran dans le prototype

Le prototype est une seule page qui commute des blocs `<sc-if>`. Les bornes,
relevées :

| Bloc | Lignes | Écran |
| --- | --- | --- |
| `isAccueil` | 214–382 | accueil |
| **`isCatalogue`** | **383–500** | **le prochain** — boutique (grille 448, liste 470) |
| `isFiche` | 501–641 | fiche de conte |
| `isLecteur` | 642–673 | lecteur |
| `isAssociation` | 674–784 | association ✅ |
| `isArticle` | 785–837 | article de l'association |
| `isConsulting` | 838–923 | expertise ✅ |
| `isOffres` | 924–965 | offres ✅ |
| `isApropos` | 966–1031 | à propos ✅ |
| `isContact` | 1032–1089 | nous écrire ✅ |
| `isLivrets` | 1090–1191 | livrets |
| `isFicheLivret` | 1192–1275 | fiche de livret |
| `isAuth` | 1276–1338 | connexion / inscription |
| `isPaiement` | 1339–… | paiement |

Pour afficher un écran du prototype sous Playwright : cliquer son entrée de
navigation — `page.getByText('Expertise & conseil', { exact: true }).first().click()`
— puis attendre 800 ms. C'est une application cliente, pas des URL.

### Ce que porte déjà le bloc `isAssociation` (674–784)

Cinq sections, dans cet ordre :

1. **héros** — fond `--ground-2`, filet en bas, disque `sage` à 24 % débordant
   en haut à droite (420 px, `top:-120px; right:-80px`), conteneur
   `max-width:1240px; padding:60px 28px 70px`, grille `1.05fr .95fr` ;
   sur-titre en petites capitales `--terra-d` précédé d'un point de 6 px
   `--terra` ; `h1` en `clamp(38px,4.6vw,64px)`, `line-height:1`,
   `margin:16px 0 18px` ; deux paragraphes (19 px / 1,65 puis 17 px / 1,7),
   `max-width:560px` ; deux boutons en pilule (`padding:17px 28px`), le premier
   plein terre cuite, le second en filet de 1,5 px sur l'encre.
   À droite, un **collage** `1fr 1fr` de 16 px de gouttière : le logo DAVE en
   pleine largeur (`grid-column:span 2`, `max-width:280px`, rayon 24, fond
   blanc, `padding:14px`, ombre `md`), puis deux photos carrées `washed` ;
2. **bande olive** — `background:var(--deep); color:var(--onDeep); padding:70px 0`,
   intérieur `max-width:1240px; padding:0 28px`, un bloc `data-reveal` de
   `max-width:620px` et 44 px de marge basse ;
3. section `max-width:1240px; padding:80px 28px 20px` ;
4. section `max-width:1240px; padding:56px 28px 30px` ;
5. **`#articles`** — `max-width:1240px; padding:70px 28px 96px` : un article
   principal en carte `lift`, puis des articles secondaires en ligne
   (`flex:1; gap:20px`), chacun avec son étiquette `--sage` en petites
   capitales et son titre en Caprasimo 19 px / 1,2.

Le bloc `isArticle` (785–837) est la **fiche d'article** : bandeau
`--ground-2`, un lien de retour `goAssociation` en 13,5 px `--terra-d`, corps
en `max-width:900px; padding:20px 28px 40px` avec les trois formes de bloc
(`isHeading`, `isPara`, `isBullet`), puis « autres articles » et l'encart
« Soutenir l'Association DAVE » (titre Caprasimo 20 px).

---

## 4. La recette, écran par écran — celle qui a marché cinq fois

1. **Relever** l'écran des deux côtés avec le script de mesure (§ 5), à 1440 px.
2. **Lire** le bloc `<sc-if>` correspondant : tout y est en style en ligne,
   donc tout est lisible sans outil.
3. **Écrire** un composant `…-v3.{tsx,module.css}` dans `src/components/v2/`,
   servi derrière `estV3()` depuis la `page.tsx`, **la V2 laissée intacte** :

   ```tsx
   if (estV3()) {
     return <AssociationV3 langue={langue} … />;
   }
   ```

   C'est le partage utilisé sur `/contact`, `/a-propos` et `/expertise` : il
   permet de comparer les deux en basculant la variable d'environnement, et il
   ne casse aucun test existant.
4. **Re-relever**, corriger, recommencer jusqu'à ce que la liste d'écarts soit
   vide, ou n'affiche que des écarts **voulus** et écrits à leur ligne.
5. **Tester** — un fichier `tests/composants/<écran>-v3.test.tsx`. Ces tests ne
   mesurent pas des pixels (jsdom ne calcule pas de mise en page) ; ils
   défendent ce qu'un remaniement casserait sans bruit : les données affichées
   telles qu'elles sont écrites, l'unicité d'une pastille, les ancres qui
   tombent quelque part, `alt=""` sur ce qui a une légende visible.
6. **Documenter** dans `docs/REFONTE-V3.md` § 9 : un tableau des défauts
   corrigés, un tableau des écarts assumés avec leur raison.
7. **Capturer** `.captures/mq-<écran>.png` et `.captures/app-<écran>.png`,
   puis vérifier l'écran en thème sombre et à 430 px.

### La gouttière, formule unique

Toutes les sections de la V3 utilisent la même, qui reproduit le
`max-width:1240px; margin:0 auto; padding:0 28px` du prototype **sans boîte
supplémentaire** :

```css
padding: 60px max(28px, (100% - var(--largeur-page)) / 2 + 28px) 96px;
```

Sans les `+ 28px`, le contenu mesure 1240 là où la maquette rend 1184.

Le panneau final d'Expertise est la seule exception connue : il fait **1240**
et n'a pas de marge intérieure — d'où `… / 2` sans les 28 px.

---

## 5. Les outils de mesure

Tous sous `scripts/`, **hors du produit et hors de la porte** (ils y vivent
pour que `@playwright/test` se résolve). Aucun n'est encore versionné.

| Script | Ce qu'il fait |
| --- | --- |
| `scripts/releve-v3.mjs` | le relevé complet : deux images par scène dans `.captures/`, plus un tableau d'écarts quand la scène déclare des sondes. `node scripts/releve-v3.mjs [scène…]` |
| `scripts/gros-plan.mjs` | la même bande de page des deux côtés, à ×2. `node scripts/gros-plan.mjs <nom> <cheminApp> [hauteur] [largeur] [mobile]` |
| `scripts/comparer-maquette.mjs` | capture l'accueil réel et la maquette à la même largeur |
| `scripts/captures-ecrans.mjs` | photographie **tous** les écrans en trois passes (anonyme, parent, admin). Ne s'arrête pas sur une page en erreur |

### Le relevé ad hoc, celui qui a servi le plus

Un script jetable dans le répertoire de travail temporaire, sur ce patron
(c'est celui d'Expertise) :

```js
const REL = `(el)=>{if(!el)return null;const r=el.getBoundingClientRect();const s=getComputedStyle(el);
  return {x:Math.round(r.x*10)/10, y:Math.round((r.y+scrollY)*10)/10,
  w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10,
  fs:s.fontSize, lh:s.lineHeight, ls:s.letterSpacing,
  ff:s.fontFamily.split(',')[0].replace(/["']/g,''),
  color:s.color, bg:s.backgroundColor, br:s.borderRadius,
  pad:s.padding, mar:s.margin, gap:s.gap, cols:s.gridTemplateColumns, op:s.opacity};}`;
```

On interroge **les mêmes éléments des deux côtés** — dans la maquette par
`children[n]`, dans l'application par `[class*=…]` — et on imprime la
différence clé par clé. Un écart supérieur à 0,5 px est signalé.

**Trois précautions, toutes payées cash :**

- viewport **1440 × 1000**, `deviceScaleFactor: 1` ;
- **dérouler toute la page** avant de mesurer (les images `loading="lazy"` ne
  réservent leur place qu'une fois demandées), puis remonter en haut ;
- **attendre 3,5 s** après le déroulement. Les sections `data-reveal` mettent
  700 ms à se poser, et un relevé pris trop tôt mesure une page en mouvement :
  c'est l'origine des écarts « inexplicables » de 18 px.

Le prototype se charge en `file://` avec `waitUntil: 'load'` ; l'application en
`domcontentloaded`.

---

## 6. Ce qui a été livré dans cette session

### Le chrome (partagé par tous les écrans)

| Fichier | Ce qui a changé |
| --- | --- |
| `src/components/enveloppe/v3.module.css` | barre utilitaire `height: 38px` (c'était un `min-height`, poussé à 42 par la pastille de langue) ; commutateur de thème en pastille étiquetée (`gap:7px; padding:5px 12px; min-width:68px`, icône 14 px) ; `.point`, le point terre cuite de 6 px |
| `src/components/enveloppe/v2.module.css` / `v2.tsx` | en-tête `gap: 34px` ; `.actions{gap:8px}` ; `.carreAction` transparent + filet de 1 px ; `.lienTexte` olive, Caprasimo 14 px, `line-height: normal` ; `.langues[data-abrege]` (un **attribut**, pas une classe) ; `.marquePied` passée en `className` |
| `src/components/v2/marque.{tsx,module.css}` | le **logo officiel** rétabli : le sceau masque `/images/logo-mapoukam-marque.png` ; nouvelle propriété `signature` (« CONTES D'AFRIQUE ») rendue dans l'en-tête V3 seulement |
| `src/i18n/{fr,en}.json` | `marque.signature`, `theme.nuit`, `theme.jour`, `navigation.promesse` (la phrase complète du prototype) |

**Le logo, et pourquoi il avait disparu.** Une version intermédiaire l'avait
remplacé par le monogramme « EM » du prototype, parce que le fichier fourni est
un *lockup* — l'emblème **et** les deux mots, l'un sous l'autre — qui rendait
des mots hauts de quatre pixels dans un disque de 44. Ce qu'il fallait retirer,
ce sont les **mots** : `public/images/logo-mapoukam-marque.png` est le fichier
officiel découpé sur les lignes vides qu'il porte lui-même (rangées 243 à 259
sur 447, trouvées en lisant le canal alpha). Aucun trait n'est redessiné.

### Les écrans

| Écran | Fichiers | Tests |
| --- | --- | --- |
| Nous écrire | `src/components/v2/contact.{tsx,module.css}` | `tests/composants/contact-v3.test.tsx` — 11 |
| À propos | `src/components/v2/apropos-v3.{tsx,module.css}`, `src/content/apropos.ts` | `tests/composants/apropos-v3.test.tsx` — 11 |
| Expertise | `src/components/v2/expertise-v3.{tsx,module.css}` | `tests/composants/expertise-v3.test.tsx` — 17 |
| Association | `src/components/v2/association-v3.{tsx,module.css}`, `src/content/association.ts` | `tests/composants/association-v3.test.tsx` — 15 |
| Offres | `src/components/v2/offres-v3.{tsx,module.css}`, `src/content/editorial.ts` | `tests/composants/offres-v3.test.tsx` — 15 |
| Chrome | (ci-dessus) | `tests/composants/chrome-v3.test.tsx` — 24, `marque.test.tsx` — 6 |

`src/content/consulting.ts` a été étendu au passage : `accroche`, `argument`,
`actionAccompagnement`, `actionTarifs`, `actionDevis`, `prestationsOeil`,
`realisationsAccroche`, et `vedette?: string` sur `PrestationConsulting` —
posé sur la **seule** offre n° 2 (« Le plus demandé » / « Most requested »).

`src/content/association.ts` l'a été de même : trois types — `AxeAssociation`,
`SoutienAssociation`, `PhotoAssociation` — et neuf champs (`chapeauSecond`,
`actionRecits`, `collage`, `axesOeil`, `axes`, `notesTitre`, `soutiens`,
`citation`, `citationRelance`). Une clé d'interface ajoutée :
`v2.assoContenusOeil`. Deux photographies qui dormaient dans
`public/images/association/` entrent enfin dans une page — `kit-pedagogique` et
`classes-inclusives`, dans le collage du héros. Le détail est dans
`docs/REFONTE-V3.md` § 9.

### Les trois défauts **globaux** que la mesure a trouvés

Aucun des trois ne se voyait à l'œil, et chacun décalait **toutes** les pages :

| Jeton | Avant | Après | Où |
| --- | --- | --- | --- |
| `--largeur-page` | 1200px | **1240px** | `src/design/tokens.css:966` (bloc v3) |
| `--interligne-corps` | 1.5 | **1.6** | `src/design/tokens.css:1104` (bloc v3) |
| hauteur de la barre utilitaire | 42px (`min-height`) | **38px** (`height`) | `src/components/enveloppe/v3.module.css` |

- **1240, et non 1200** — `02-layout-responsive.md` ouvre par « Container:
  max-width: 1240px […] padding: 0 28px ». Le lecteur garde ses 1120 px, qu'il
  écrit lui-même.
- **1,6, et non 1,5** — la racine du prototype porte en clair
  `font-size:16px;line-height:1.6`. Le système « Organic » écrit 15 px / 1,55
  dans sa feuille ; le prototype gagne. L'interligne du corps est hérité par
  tout ce qui ne se déclare pas, jusqu'à la hauteur des champs de saisie (un
  `textarea` de cinq lignes mesure 156 px à 1,6 et 148 à 1,5).
- **38, et non 42** — une hauteur **minimale** se laisse pousser par le premier
  enfant plus grand, et toutes les pages du site descendaient de quatre pixels.

Un jeton **créé** : `--accent-sur-chrome` — `src/design/tokens.css:739`
(`var(--action)` par défaut) et `:1027` (`var(--v3-nuit-terre)` sous v3). C'est
le premier accent posé **sur l'olive** ; `--action` n'y vaut que 3,34:1, contre
5,85:1 le jour et 7,81:1 la nuit pour la terre cuite de nuit. Deux paires de
contraste l'accompagnent dans `design-tokens.test.ts`.

Un quatrième constat, systémique et non corrigé : `v2.module.css` déclare
encore ses propres règles `.marque` / `.entetePose .marque`, qui visent une
classe locale vestigiale et **n'atteignent rien**. Huit subsistent.

### Le contenu réel de « À propos »

Source : `New section/A propos/Apropos_texte.txt` et `image.jpg`
(→ `public/images/apropos-univers.jpg`, 1080 × 602).

Ce que le dépôt portait avant venait du prototype et **était inventé** — et le
panneau portait une citation inventée, **signée de la fondatrice**. Elle est
remplacée par la devise de la maison, attribuée à personne. *Inventer un texte
se corrige ; la citation engage quelqu'un.* La clé `aproposH3` a été
**supprimée** : elle ne correspondait à rien de réel. Les quatre cartes portent
désormais les quatre **univers** — contes, ressources pédagogiques, Association
DAVE, consulting — et non les « principes » du prototype.

Deux adaptations imposées par l'image, écrites à leur ligne : elle garde son
**rapport naturel** (recadrée en portrait, elle perdrait deux univers sur
quatre, c'est-à-dire son sujet) et elle **n'est pas lavée** — `.washed`
s'applique aux photographies, et celle-ci porte du texte qui pâlirait jusqu'à
l'illisible.

---

## 7. Les pièges déjà payés — ne pas les repayer

### CSS et navigateur

| Piège | Ce qu'il coûte |
| --- | --- |
| Les attributs `width`/`height` d'une balise **battent** `aspect-ratio` | la couverture faisait 170 × 403 au lieu de 268/403. Ajouter `height: auto` |
| Une `<img>` est **en ligne** par défaut | 7 px de jambages sous chaque image. `_ds` pose `img{display:block}`, **pas ce dépôt** |
| `scroll-snap-type` aligne sur le bord de la **boîte** | la rangée s'ouvre à `scrollLeft: 4` et mange son rembourrage |
| Deux titres voisins, deux interlignes | le prototype pose `1.05` sur l'un et **rien** sur l'autre, qui hérite du `1.12` d'Organic |
| Un `line-height` écrit là où le prototype n'en écrit pas | les trois cartes de tarif perdaient 23 px |
| `<button>` contre `<a>` | le premier est en `line-height: normal`, le second hérite de 1,6. Sept pixels entre deux boutons empilés |
| Un masque CSS qui échoue | il ne laisse pas un trou, **il laisse le disque entier** — et ça a tout l'air du dessin voulu. C'est le logo, et ça a déjà trompé |

### Les tests d'architecture qui échouent sur du code qui marche

| Test | Ce qu'il attrape |
| --- | --- |
| `design-tokens` | tout littéral `#…` / `rgba(…)` — **y compris dans un commentaire**. Écrire les commentaires sans valeur littérale |
| `classes-css` | une classe déclarée **uniquement** sous `:global(…)` n'est pas exportée par le module → `class="undefined"`. Passer par un **attribut** (`data-abrege`) ou par une classe locale |
| `images-discipline` | `alt={traduire(…)}`. L'unique exception que le test nomme lui-même : « une donnée éditoriale nommée pour cet usage » → `src/content/apropos.ts`, comme `logoAlt` dans `src/content/association.ts` |
| `mouvement-reduit` | une animation sans son filet |
| `frontend-architecture` | un droit **déduit** au lieu d'être lu |
| `i18n` | une clé anglaise sans française (le type l'attrape déjà), une traduction vide |

Deux détails plus fins :

- une règle `:global(v3) .piedIdentite .marque` visait le `.marque` **local et
  mort** de `v2.module.css`, jamais le composant : la marge du pied valait 8 px
  au lieu de 18. Corrigé en passant `styles.marquePied` en `className` ;
- un `alt` contenant « sous le baobab » aurait déclenché le test du « nom de
  maquette orphelin ». Reformulé.

Et un test qui passait au vert **pour la mauvaise raison** : compter les
`listitem` par rôle en donnait douze au lieu de trois, chaque carte portant
elle-même une liste de bénéfices. Filtrer les enfants **directs** (`LI`).

### L'environnement, avant le code — deux pannes payées le 7 septembre

| Symptôme | Cause | Le geste |
| --- | --- | --- |
| **Toutes** les pages en 500, y compris celles qui ne lisent pas la base | **Docker Desktop arrêté.** `/expertise` et `/contact` ne requêtent rien, mais l'enveloppe partagée, elle, identifie l'appelant — donc tout tombe | `docker ps` : une liste VIDE, c'est ça. Lancer Docker Desktop, les conteneurs Supabase remontent seuls |
| Le serveur répond 200 mais sert la **V2** | Le serveur de dev a été tué pour manque de mémoire ; un autre, lancé sans `NEXT_PUBLIC_DESIGN_VERSION=v3`, a repris le port 3000 | `curl … | grep association-v3` plutôt que le code HTTP. Un 200 ne dit pas QUELLE direction est servie |

Corollaire : `docker ps` peut **rester bloqué** au lieu de rendre une erreur
quand le démon est absent. Le lancer avec un `timeout` évite d'attendre deux
minutes pour apprendre qu'il n'y a rien à voir.

### La porte, et ce qui la rend rouge sans que le code soit en cause

- **`tests/unit/middleware.test.ts`** — le diagnostic de `CLAUDE.md` (« rien ne
  doit écouter sur le port 3000 ») est incomplet : vérifié en jouant la porte
  complète serveur arrêté, ce qu'il lui faut réellement est que **l'endpoint
  d'auth Supabase soit injoignable**. Il ne peut donc pas être vert dans la
  même exécution que le projet `integration`. Arrêter le serveur de dev avant
  `npm run verify`, le relancer après.
- **`tests/effectif-attendu.json` ne connaît toujours pas les fichiers de cette
  session** — `contact-v3`, `apropos-v3`, `marque`, `expertise-v3`,
  `association-v3`, `classes-css` — et il porte encore **22** pour `chrome-v3`,
  qui en a **24**. Le fichier se met à jour **automatiquement quand tout est
  vert** ; il ne l'a pas été depuis. Total inscrit : **1713**, sur 102 entrées.
  Ce n'est pas une baisse — donc pas à corriger à la main : c'est une porte qui
  n'a pas pu se fermer.
- ~~`npm run lint` est ROUGE sur `src/components/auth/inscription.tsx:140`~~ —
  **réglé.** C'était un état transitoire entre deux éditions de la session
  `editionmapoukam-5c` ; la case est rendue (voir `REPRISE4.md` § 1).
- ⚠️ **`npm run lint` est ROUGE au 8 septembre**, sur
  `scripts/essai-recherche.mjs` (deux `document` non préfixés) — un script
  d'atelier de la session `editionmapoukam-5c`. Signalé, pas corrigé : c'est la
  règle du partage. Deux lignes suffisent (`globalThis.document`).
- ⚠️ **Les scripts d'atelier de `scripts/` sont LINTÉS.** Ils ne sont pas
  versionnés, mais `npm run lint` les lit : un script jetable qui écrit
  `document` au lieu de `globalThis.document` rend la porte rouge sans que rien
  du produit soit en cause. Les cinq scripts jetables de cette session ont été
  supprimés, et la scène `association` est entrée dans `scripts/releve-v3.mjs`.
- État vérifié en fin de session : `npx tsc --noEmit` **propre** ; projets
  `unit` + `composants` **849/851**. Les deux échecs ne sont pas du code de
  cette session : `middleware.test.ts` (il lui faut l'auth Supabase
  injoignable) et `admin-architecture.test.ts`, qui passe seul et échoue en
  suite — une page d'administration en cours d'écriture par une autre session.
  `association-v3` 15/15, `offres-v3` 15/15.

---

## 8. Trois sessions écrivent le même dépôt

| Session | Ce qu'elle possède |
| --- | --- |
| celle-ci | le chrome, `contact`, `a-propos`, `expertise`, et la suite de la passe droite → gauche |
| `editionmapoukam-5c` | authentification, compte, panier, recherche — et le bloc « Recevoir les nouveautés » du pied |
| `premium-ui-refactor-front-back` | livrets, catalogue, migrations 0078/0079/0080, la base locale |

Le partage négocié : **chaque session possède ses écrans ; personne ne touche
`src/design/tokens.css` ni `src/components/enveloppe/*` sans le dire.**

Ce que la troisième a cassé, et comment ça s'est vu :

- `/fr/catalogue` et `/api/catalog` en **500** — la migration 0079 avait retapé
  le `RETURNS TABLE` de `catalog_list` (`book_id` devenu `id`) et le client
  mappe **par position**. Diagnostiqué depuis un extrait de journal, corrigé
  par eux en **0080** ;
- **onze livres au lieu de dix** — un livret publié à dessein.
  `access.test.ts` et `schema.test.ts` échouent sans dire un mot d'ingestion ;
- **PostgREST garde en cache une fonction supprimée puis recréée.** Sans
  `notify pgrst, 'reload schema'`, la base est juste et l'application fausse.

**Au 7 septembre au soir, elles écrivent encore.** Deux tests d'architecture
tombaient en fin de session sur des fichiers qui ne sont pas les miens, et les
deux ont l'air de mesures prises en plein vol : `frontend-architecture` sur
`src/components/v2/recherche-globale.tsx` (« un écran qui fabrique son propre
indicateur de chargement »), et `classes-css`, rouge une fois puis vert la
suivante sans qu'aucun fichier de cette session ait bougé entre les deux.
Signalé, pas corrigé : c'est la règle du partage.
- ⚠️ **`src/i18n/{fr,en}.json` est le fichier le plus disputé du dépôt.** Une
  clé ajoutée le 7 septembre (`v2.assoContenusOeil`) avait DISPARU trois heures
  plus tard, les deux fichiers étant revenus à leur état de `HEAD` : une autre
  session les avait réécrits en entier. Les tests étaient passés au vert avant
  la perte, et rien ne l'a signalé — c'est un repli sur le français, pas une
  erreur. Vérifier ses propres clés (`grep`) avant de déclarer un écran fini.

Trois leçons :

1. **un test d'architecture est ce qui rend une collision visible** —
   `classes-css.test.ts` a signalé trois fois, en deux heures, des classes qui
   n'appartenaient pas à celui qui lisait le rapport ;
2. **une signature de fonction SQL se reprend, elle ne se retape pas** ;
3. **PostgREST doit être prévenu** après un `drop`/`create`.

---

## 9. Trois décisions qui attendent le propriétaire

Elles ne bloquent rien, mais elles ne se tranchent pas seul :

1. **L'orthographe de la marque.** Les textes fournis écrivent « **Éditions
   Mapoukam** » (pluriel, accent) ; le dépôt écrit partout
   « **EditionMapoukam** » — nom de dossier, de compte, de domaine d'essai.
   `src/content/apropos.ts` porte aujourd'hui « Éditions Mapoukam » dans les
   deux `alt`, parce que c'est la forme du propriétaire. Il faut savoir
   laquelle est la forme publique.
2. **« Trois façons de lire » pendant que l'abonnement est fermé.** C'est le
   titre du prototype, adopté le 8 septembre pour l'écran des offres — celui du
   dépôt disait « Deux façons de faire » et contredisait un écran qui en montre
   désormais trois. Mais `business_settings.abonnement_ouvert` vaut faux :
   deux formules seulement se souscrivent aujourd'hui. La carte du milieu le dit
   en toutes lettres et le chapeau énumère bien les trois ; si le titre doit
   changer le temps du lancement, c'est une décision d'éditeur.
3. **`.env.local` porte encore `NEXT_PUBLIC_DESIGN_VERSION=v2`** (ligne 27).
   Toute la passe se regarde donc en lançant explicitement la V3. Basculer le
   fichier est une décision de mise en service, pas une correction.

---

## 10. Pour reprendre, concrètement

```bash
docker ps                                     # DOIT rendre sept conteneurs
npm run supabase:start                        # si la liste est vide
NEXT_PUBLIC_DESIGN_VERSION=v3 npm run dev     # puis /fr/catalogue
```

Puis, dans l'ordre :

1. lire le bloc `isCatalogue` du prototype, **lignes 383 à 500** — il porte
   DEUX vues, la grille (448) et la liste (470) ;
2. relever `/fr/catalogue` contre lui, à 1440 px, avec les trois précautions du
   § 5, puis ajouter une scène `catalogue` à `scripts/releve-v3.mjs` ;
3. écrire `src/components/v2/boutique-v3.{tsx,module.css}` — ou étendre
   `boutique.module.css`, qui porte déjà beaucoup de la V3 — branché derrière
   `estV3()` ;
4. **attention, cet écran n'est pas à moi seul.** La session
   `premium-ui-refactor-front-back` possède les livrets, le catalogue et la
   base : `src/components/v2/carte-conte.tsx`, la carte de livret couchée et
   la grille sont son travail (voir `docs/REFONTE-V3.md`, « Écran 4 — le rayon
   des livrets »). Se mettre d'accord avant d'y toucher ;
5. **ne pas toucher aux données.** Les cartes lisent `canRead`, `canDownload`,
   `prix.affichage` et `reason` ; jamais une valeur dérivée. La bascule
   conte/livret se lit sur `type_document`, qui décide d'une mise en page et
   **jamais** d'un droit ;
6. écrire `tests/composants/boutique-v3.test.tsx` ;
7. documenter dans `docs/REFONTE-V3.md` § 9 ;
8. capturer `.captures/maquette-catalogue.png` et `app-catalogue.png`, puis
   vérifier en thème sombre et à 430 px.

Rien n'est poussé. Branche : `livret-pedagogique`. Dernier commit : `d88d95c`.
