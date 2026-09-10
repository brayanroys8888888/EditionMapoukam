# Refonte V3 — reprise du dossier « Refonte design complète du site »

Décision du 5 septembre 2026. Ce fichier porte **comment** le dossier de passation
Claude Design entre dans ce dépôt, et **ce qu'il ne peut pas y apporter**.

Source : projet Claude Design `b41ce6a2-73cb-4d17-bb4f-8582be43d7e0`,
dossier `design_handoff_edition_mapoukam/` — README + douze documents `01` à `11`,
deux prototypes `.dc.html`, et le système de design « Organic »
(`43e17a9c-ce03-434c-b361-bb9598bec180`) qu'ils consomment.

## 1. V3, pas une reconstruction — et pourquoi

Le dossier propose un arbre `app/` neuf avec `content/*.json`. Ce n'est pas ce
qu'on fait, pour trois raisons mesurées sur le dépôt :

- **Une seule couleur écrite en dur hors de `src/design/`**, dans
  `src/app/dev/console.tsx`. Les 35 composants et les 40 écrans ne connaissent
  aucune couleur : ils lisent `var(--fond)`, `var(--encre)`, `var(--action)`.
  Un changement de valeurs est exactement ce que `[data-design]` sait faire.
- **La carte des routes de `09` décrit l'application existante.** Seize routes
  demandées, quatorze déjà là sous `src/app/[langue]/`. Le dossier ne propose
  pas une autre application ; il propose une autre peau sur celle-ci.
- **Ce qui coûterait cher à réécrire n'est pas du design** : le câblage des
  droits (`canRead` / `canDownload` lus, jamais dérivés), les gardes
  d'administration sur douze écrans, les clés i18n, et 1557 tests sur 93
  fichiers dont l'effectif ne peut jamais baisser.

## 2. Qui fait autorité sur quoi

`CLAUDE.md` tranche déjà : les maquettes sont une **intention visuelle**, jamais
une autorité sur une donnée ou une règle. Appliqué au dossier :

| Sujet | Autorité |
| --- | --- |
| Pixel, espacement, rayon, ombre, courbe d'animation | le dossier, et le prototype quand il contredit un document |
| Couleurs, polices, jetons | `01-design-tokens.md` |
| Comportement d'interface, états, clavier | `06`, `10`, `11` |
| **Données, prix, droits, tunnel de paiement** | `docs/cahier-des-charges.md` |
| **Architecture des couches, sécurité, tests** | `CLAUDE.md` |

### Les six points où le dossier a été écarté

Il a été rédigé en supposant qu'il n'y a pas de backend — il l'écrit :
*« No real backend: auth, payment, downloads and the newsletter are all stubbed
with toasts »*. Le backend existe, terminé en seize étapes.

1. **`content/books.json` et consorts — abandonnés.** Les données viennent de
   `catalog_list`, `library_for_user`, `access_for_books`. Un catalogue en JSON
   serait une seconde source de vérité, et `access-purity` l'interdit.
2. **`signedIn` en état client, tableau `paid`, compte de démonstration
   « Sophie Ngo Bell » — abandonnés.** Les droits se vérifient côté serveur à
   chaque requête, contre `entitlements`.
3. **Panier : `localStorage` reste un miroir, pas la source.** `11` le concède
   lui-même — *« never trust a client-side price »*. Les prix viennent du
   serveur ; `prix.affichage` est **lu**, jamais reformaté depuis un nombre.
4. **`next/font/google` — abandonné.** `src/design/polices.css` embarque déjà
   les octets et argumente contre le CDN au nom du §5.1 (connexions lentes) et
   du seuil Lighthouse de F14. `tests/unit/design-tokens.test.ts` échoue sur
   `fonts.googleapis.com`. Caprasimo et Figtree entrent par
   `@fontsource*`, en dépendances de développement, octets recopiés sous
   `public/fonts/` — le chemin déjà emprunté par Fraunces, Nunito et Literata.
   Les deux sont sous **OFL-1.1**, permissive.
5. **`lang="fr"` en dur — abandonné.** Le segment `[langue]` existe, et
   `<html lang>` vient du middleware.
6. **Les écrans d'administration sont absents du dossier.** Douze écrans, plus
   les avis, les témoignages et les deux abonnements étanches. Ils prennent les
   jetons V3 et rien d'autre : le dossier n'a rien à en dire.

Le sélecteur de moyen de paiement (CB / Orange Money / MTN MoMo) n'est **pas**
une règle inventée : le cahier des charges le porte (§ zone Afrique, Lot 5).
L'écran peut l'afficher ; l'octroi du droit reste au webhook signé.

## 3. Un désaccord assumé avec `02`

`02-layout-responsive.md` dit : *« Ship both. […] do not attempt to merge them
into a single tree. »* Deux arbres de composants.

On ne le fait pas — et `09` donne lui-même l'issue : *« CSS-first, both shells
rendered »*, un seul arbre de routes, les deux chromes rendus côté serveur et
départagés par une requête média à ~860 px. Raisons : deux arbres doubleraient
la surface de `frontend-architecture` et des tests `composants`, doubleraient la
passe WCAG AA de F14, et expédieraient une seconde application sur la connexion
lente qui est la condition réelle d'une partie du public.

Ce qui est repris intégralement, en revanche, c'est le **modèle de navigation**
mobile : barre d'onglets à cinq entrées, feuille montante, barre d'achat
flottante. C'est lui qui fait l'expérience, pas la duplication de l'arbre.

## 4. Deux axes, pas un

La V3 introduit un **second attribut racine**, orthogonal au premier :

| Attribut | Valeurs | Décide |
| --- | --- | --- |
| `data-design` | `v1` · `v2` · `v3` | la direction visuelle |
| `data-theme` | `light` · `dark` | le thème clair ou sombre |

`data-theme` doit être juste **au premier rendu serveur**, sans clignotement :
il vient d'un cookie `em_theme`, jamais d'un script bloquant. Sans cookie, le
repli suit `prefers-color-scheme` par une règle CSS sur `:root:not([data-theme])`.

Les deux se posent sur `<html>` dans `src/app/layout.tsx`, et nulle part ailleurs.

## 5. Ordre de construction

Repris de `08-build-plan.md`, réécrit contre le dépôt réel.

| Lot | Contenu | Porte |
| --- | --- | --- |
| **1** | Jetons V3 + axe sombre + Caprasimo/Figtree embarquées + `data-theme` sans clignotement | `npm run verify` |
| **2** | Primitives : bouton, puce, champ, carte, badge, toast — tous états | idem |
| **3** | Chrome desktop : barre utilitaire, en-tête collant flouté, menu Boutique, pied olive | idem |
| **4** | Chrome mobile : en-tête, barre d'onglets, feuille, barre d'achat | idem |
| **5** | Catalogue : carte livre, filtres en `searchParams`, bascule grille/liste | idem |
| **6** | Fiches conte et livret, onglets, lecteur | idem |
| **7** | Panier, paiement, confirmation | idem |
| **8** | Authentification, espace personnel | idem |
| **9** | Pages éditoriales, association, expertise, offres, à propos, contact | idem |
| **10** | Administration : jetons seulement, aucune refonte structurelle | idem |
| **11** | Passe mouvement — les quinze effets de `10`, tous sous `prefers-reduced-motion` | idem |
| **12** | Passe vivante — `11` : panier optimiste, synchronisation inter-onglets, recherche vivante, reprise de lecture | idem |
| **13** | Passe accessibilité et performance, puis la liste d'acceptation de `08` | `npm run verify` + `npm run rendu` |

Chaque lot livre ses tests avec son code. L'effectif ne baisse jamais.

## 6. Ce que le lot 1 a mis au jour — la couche V2 lit la palette BRUTE

`CLAUDE.md` énonce la règle : « Aucun composant ne connaît le thème. Ils lisent
des jetons qui changent de valeur sous eux. » La couche V2 ne la respecte pas.

**224 lectures directes de `--v2-*` dans quinze modules CSS** :

| Jeton brut | Occurrences |
| --- | --- |
| `--v2-vert` | 107 |
| `--v2-fond` | 63 |
| `--v2-fond-doux` | 20 |
| `--v2-vert-clair` | 11 |
| `--v2-ocre-encre` | 10 |
| `--v2-vert-nuit` · `--v2-ocre` · `--v2-encre-douce` | 13 |

Ces jetons-là ne bougent ni sous la V3 ni sous le thème sombre — par
construction : ce sont les valeurs de la V2, pas des rôles. D'où ce que la
première capture montre, et qu'aucun test ne voyait :

- le vert de la V2 subsiste partout sous la V3 — logo, pastille FR/EN, bouton
  de connexion, pictogrammes, contour du bouton de catalogue ;
- en thème sombre, la bande de réassurance reste crème **et ses titres
  disparaissent** — encre claire sur fond clair ;
- les boutons d'icône de l'en-tête deviennent des disques blancs vides.

**Ce n'est pas une retouche, c'est une reclassification.** Les 107 emplois de
`--v2-vert` ne portent pas un seul rôle : certains sont le CHROME (en-tête,
pied, cartes sombres) et deviennent `--v3-profond` ; d'autres sont l'ACTION
(boutons, états actifs) et deviennent `--action`. Un remplacement automatique
les confondrait, et le résultat aurait l'air voulu.

C'est le vrai contenu du lot 2. Son critère de sortie est un test
d'architecture qui **interdit `--v2-*` hors de `tokens.css`** — le pendant
exact de celui qui interdit déjà les hexadécimaux.

### Les dix rôles introduits

| Rôle | V1 et V2 | V3 clair | V3 sombre |
| --- | --- | --- | --- |
| `--chrome` | `--v2-vert` | olive profond | olive de nuit |
| `--chrome-2` | `--v2-vert-nuit` | second olive | second olive de nuit |
| `--chrome-clair` | `--v2-vert-clair` | second olive | idem |
| `--chrome-encre` | `--v2-fond` | crème sur olive | idem |
| `--marque` | `--v2-vert` | terre cuite | terre cuite de nuit |
| `--marque-survol` | `--v2-vert-clair` | terre cuite éclaircie | idem |
| `--marque-encre` | `--v2-fond` | encre sombre | fond de nuit |
| `--accent-encre` | `--v2-vert` | terre cuite assombrie | terre cuite claire |
| `--action-texte` | `--v2-ocre-encre` | terre cuite assombrie | terre cuite claire |
| `--second-encre` | `--v2-vert-clair` | sauge assombrie | sauge de nuit |

**Deux pièges rencontrés, tous deux invisibles sous la V2 :**

1. **`--action` vaut l'OCRE sous la V2, pas le vert.** Router les boutons
   verts vers `--action` les aurait rendus ocres — une régression d'une
   direction livrée. D'où `--marque`, distinct de `--action` : le même vert
   sous la V2, la même terre cuite sous la V3. Et la distinction
   chrome/marque, que la V2 ne montre pas — un onglet ACTIF est du chrome,
   un bouton d'appel est de la marque — mais que la V3 rend visible.

2. **L'encre doit s'accorder avec SON fond.** `--chrome-encre` et
   `--marque-encre` valent la même crème sous la V2 : les confondre ne se
   voit pas. Sous Organic, la crème vaut 11,75:1 sur l'olive et **2,40:1 sur
   la terre cuite**. Quinze déclarations ont dû être réaccordées.

Un test fige les dix correspondances de la colonne « V1 et V2 » : c'est ce
qui rend la reclassification sûre, puisque 179 lignes de feuilles de style
d'une direction livrée ont été réécrites.

### État du lot 2 — livré le 5 septembre 2026

Porte verte : **1607 tests, 94 fichiers, +4**.

- 224 lectures de `--v2-*` reclassées en dix rôles sémantiques ;
- V2 vérifiée inchangée, à l'œil et par mesure des variables calculées ;
- le test d'architecture qui interdit la palette brute hors des jetons est
  posé, et il est vert.

### État des lots 3, 4 et 5 — livrés le 5 septembre 2026

Porte verte : **1619 tests, 95 fichiers, +12**.

**Lot 3 — chrome desktop.** Barre utilitaire de 38 px sur l'olive, portant le
commutateur de thème et la langue. En-tête de 76 px, translucide et flouté,
avec repli opaque sous `@supports not (backdrop-filter)`. Navigation poussée
à droite, écart de 26 px, soulignement terre cuite qui croît de gauche à
droite. Pied olive, quatre colonnes en `1.4fr repeat(3, 1fr)`. Pastille de
marque en pilule de 44 px.

**Lot 4 — chrome mobile.** Barre d'onglets fixe à cinq entrées, avec pastille
de panier, retour tactile `scale(.96)`, et resserrement en pilule de 520 px
au-delà de 700 px. Réserve de 96 px sous le contenu. Un seul arbre, deux
chromes départagés à 860 px — le désaccord assumé avec `02`, §3 ci-dessus.

**Lot 5 — catalogue.** Le geste de signature : la couverture se soulève de
10 px et pivote de 1,4°, le titre passe à l'accent. Rapport 2/3. Prix en
terre cuite assombrie.

#### Trois décisions prises en chemin

1. **Sous la V3, l'en-tête n'est jamais superposé.** La V2 le pose en
   `position: fixed` sur le hero ; avec une barre utilitaire au-dessus, il la
   recouvrait — le thème et la langue devenaient invisibles sur l'écran
   d'arrivée. Organic décrit un en-tête collant sous une barre qui défile.

2. **Le bouton d'ajout apparaît aussi au FOCUS, pas seulement au survol.** Le
   dossier ne demande que le survol ; un bouton à `opacity: 0` reste
   focusable, et l'utilisateur au clavier tabulerait sur une commande
   invisible. `10-animation-spec.md` a vu le problème et donne la règle.

3. **Le rembourrage horizontal des liens de navigation tombe.** Les 26 px
   d'Organic sont l'écart TOTAL ; ajoutés au `padding: 8px 9px` de la V2, ils
   faisaient déborder la navigation sous la loupe à 1440 px.

### Ce qui restait des lots 3 à 5 — soldé le 5 septembre 2026

Les quatre points ouverts sont clos.

**Le filet de l'en-tête**, après huit pixels de défilement, 200 ms, sans
ombre. L'attribut est posé à l'envers de ce que demande `10` : on écrit
`data-sommet` — « je suis en haut » — et non `data-scrolled`. Avec
`data-scrolled`, un navigateur sans JavaScript n'aurait JAMAIS eu de filet, et
l'en-tête translucide aurait flotté sans limite au-dessus du contenu. Ici
l'absence d'attribut est l'état sûr, et le script ne fait que le retirer là où
il gêne. Un test fige ce sens : le retourner par commodité inverserait le repli
en silence.

**Le menu « Boutique »** prend ses cotes — 290 px, `left: -18px`, rayon de
bloc, 12 px de rembourrage. Le décalage n'est pas une fantaisie : sans lui, le
menu s'aligne sur le bord du MOT, et ses entrées — qui ont, elles, leur propre
rembourrage — paraissent décalées par rapport au mot qu'elles prolongent.

**Le menu mobile devient une feuille montante** : `translateY(103%)` à 380 ms,
poignée de 44 × 4 px, voile qui referme au doigt, rangées de 16 px sur la
surface de carte. Les trois pour cent de rabiot emportent l'ombre avec la
feuille — à 100 %, elle resterait visible en bas de l'écran, barre grise
n'appartenant à rien. Le voile est rendu sous TOUTES les directions et
seulement dessiné par la V3 : c'est la feuille qui décide, jamais le composant.

**L'en-tête mobile passe à 60 px** sous 860 px, avec le rembourrage `12px 18px`
du dossier. Sur les 600 px utiles d'un téléphone ordinaire, 76 + 96 px de
chrome, c'est presque un tiers de la page consacré à ne rien montrer.

**La bascule grille/liste** existe. Elle vit dans l'URL comme le reste de cet
écran — deux liens, pas deux boutons — si bien qu'un enseignant qui envoie
« la liste des livrets pour la MS » envoie bien la liste. La grille est le
défaut et n'écrit rien dans l'adresse.

La rangée n'est pas une seconde carte : c'est la MÊME, redistribuée par
`grid-template-areas`. Une seconde aurait dupliqué la règle des trois lignes
d'accès, le bouton conditionnel et le prix formaté par le serveur. Seule
l'action change de place — sur une vignette de 96 px, un voile de survol
recouvrirait la seule chose qu'on est venu regarder.

C'est l'écran qui décide s'il y a une bascule, pas le composant : `CLAUDE.md`
interdit à un composant de connaître le thème, et la question est donc posée
une fois, dans la couche des routes, à côté de `structureRefondue()`.

## 7. Lots 6, 7 et 8 — livrés le 5 septembre 2026

### Lot 6 — fiches et lecteur

**La scène de lecture prend son olive**, et c'est la levée du report inscrit
au lot 1 : « les deux ensemble, ou aucun des deux ». `--fond-lecture` bascule
sur l'olive profond, et trois jetons naissent avec lui — `--encre-lecture`,
`--encre-lecture-douce`, `--bordure-lecture` — parce qu'une surface de fond
sur laquelle on mesure un contraste ne se retourne pas seule. Hors V3, les
trois valent exactement ce que valait la page : le lecteur ne bouge pas.

Quatre pièces ont dû recevoir leur encre explicitement — le bouton de retour,
les flèches, le numéro de miniature, la note d'aide. Toutes portent un aplat
CLAIR : sans cette ligne, elles héritaient de la crème de la scène, c'est-à-dire
crème sur crème.

**Le lecteur cesse d'emprunter la teinte d'une région.** Sa barre de
progression et ses miniatures lisaient `--region-afrique_ouest-*` — sur tous
les titres, y compris ceux qui n'en viennent pas. Sous la V2 cette teinte VAUT
le vert de marque, et personne ne pouvait le voir ; sous Organic elle devenait
la sauge là où le dossier demande la terre cuite. Elles lisent maintenant
`--marque`, et un test interdit à cette feuille de parler d'une région du monde.

**La barre d'achat flottante** du mobile est là : `bottom: 84px`, `z-index: 45`,
carte olive, prix à gauche, pilule terre cuite à droite. Elle ne décide rien —
l'action principale est calculée UNE fois et rendue à deux endroits, et le bloc
d'achat perd son bouton là où la barre paraît. Le cas qui compte est l'abonné :
il LIT sans pouvoir conserver, et deux calculs auraient fini par diverger
exactement là. Deux tests le figent, dont un contre-test qui vérifie que la
barre ne double pas l'offre d'achat secondaire.

La réserve de 80 px sous le contenu s'ajoute aux 96 px de la barre d'onglets :
les 176 px que `02` demande sur un écran de produit.

**La fiche** perd le cadre qui entourait sa couverture. L'ombre longue fait le
même travail et la fait tenir dans l'espace, au lieu de la coller dans une
boîte qui deviendrait le deuxième rectangle de l'écran.

### Lot 7 — panier, paiement, confirmation

**Un monogramme sur chaque moyen de paiement.** Il est tiré du LIBELLÉ, pas
d'une table écrite à la main : « Orange Money » donne OM, « Bank card » donne
BC. Une table aurait affiché « CB » sur le site anglais. Il ne sert pas à
identifier — le nom complet est à côté — mais à distinguer : trois rangées
identiquement composées se confondent du coin de l'œil.

**Un sceau d'issue de 86 px** ouvre l'écran de résultat. Jusqu'ici, « payé » et
« échoué » se présentaient de la même façon — un paragraphe en gras dans un
panneau — et il fallait lire la phrase pour savoir si l'on avait payé. L'échec
ne prend pas de rouge : un paiement qui n'aboutit pas n'est pas une erreur du
client, et le peindre en rouge le lui reprocherait.

Ces deux pièces valent pour TOUTES les directions, et c'est délibéré. Le
tunnel n'a pas de variante V2 : c'est le même composant sous chaque direction,
et son propre en-tête explique pourquoi — « un acheteur qui s'abonne ensuite
retrouve les mêmes cartes de moyen de paiement ». Les réserver à la V3 aurait
fait diverger l'écran du paiement, celui où l'on est le plus inquiet. Ce sont
des ajouts assumés, pas des retouches silencieuses.

**`ecran.module.css` prend les trois plans d'Organic**, et cette feuille sert
le panier, le paiement, le compte et les pages éditoriales — soit les lots 7, 8
et 9 d'un seul geste. Ce n'est pas de l'économie : un panneau de récapitulatif
et une carte de commande sont la même chose vue sur deux écrans. Le total final
quitte la crème pour l'olive : c'est la ligne qu'on cherche, et rien ne la
distinguait des autres.

### Lot 8 — authentification, espace personnel

**Les deux moitiés de l'écran de connexion se rejoignent en un seul panneau** —
`.95fr 1.05fr`, rayon 38 px, `overflow: hidden`. Le panneau sombre n'est plus
une illustration posée à côté du formulaire : c'est le même bloc, coupé en
deux.

Ce lot a mis au jour **un trou que le test des couleurs littérales ne voyait
pas**. `auth.module.css` peint son panneau avec treize `rgba()` écrites en
toutes lettres — un dégradé turquoise, une bordure verte, un motif vert. Le
test cherche un `#` : elles passaient au travers depuis le début, et elles ne
bougent sous AUCUNE direction. Sous Organic, l'écran de CONNEXION affichait un
panneau turquoise — le premier écran qu'un client voit après avoir décidé
d'acheter. Deux tests ferment la porte : les `rgba()` sont confinées à ce seul
fichier, et chaque direction doit repeindre le panneau.

**La colonne du compte cesse d'être une rangée de boutons.** Trois pilules
contourées, c'est trois appels à l'action pour aucun : sur un écran où l'on ne
fait que se repérer, le vrai bouton — « Enregistrer », « Télécharger » — s'y
noyait. Les cartes de livre, elles, gardent leur teinte de thème : les repeindre
en crème aurait « harmonisé » l'écran en lui retirant sa seule aide au repérage.

#### Trois défauts trouvés en chemin, et tous invisibles sous la V2

1. **Le prix disparaissait sous le bouton, en vue liste.** Le pied de prix et
   l'action partageaient une zone de grille et se superposaient. L'écart ne se
   voyait que sur les titres PAYANTS — un titre gratuit n'a pas de bouton pour
   le cacher — c'est-à-dire sur la moitié du corpus de démonstration.

2. **La pastille de marque du lot 3 visait une classe que personne ne rend.**
   L'en-tête ne rend pas `.logo` mais `<Marque>`, qui porte ses propres
   classes. La règle était morte, et invisible : le sceau avait déjà l'olive
   par son repli `var(--sceau-fond, var(--chrome))`, si bien que le résultat
   ressemblait exactement à ce qui était demandé. C'est le thème SOMBRE qui
   l'a révélé — l'olive de nuit sur le fond de nuit, quatre points d'écart, et
   le sceau disparaissait.

3. **Le mot-symbole s'est retrouvé en encre sombre sur l'olive.** En déplaçant
   la règle vers la bonne feuille, elle est devenue vivante — et une couleur
   juste dans l'en-tête est fausse sur le pied olive et sur le panneau de
   connexion. Le mot n'est plus peint du tout : il hérite de la surface qui le
   porte, comme le faisait la V2.

#### Ce qui n'a pas été repris, et pourquoi

- **Le jeu d'onglets de la fiche** (`extrait` / `détails` / `avis`). Il
  suppose un panneau d'extrait, que ce produit n'a pas : l'extrait est un vrai
  lecteur derrière le moteur de droits, pas un bloc de texte. Et nos sections
  sont CONDITIONNELLES — un titre sans description et sans avis afficherait une
  barre d'onglets à un seul onglet. Les sections empilées restent aussi
  atteignables par ancre et lisibles par un moteur de recherche.
- **La carte d'identité de l'espace personnel** — disque d'initiales, nom,
  adresse. C'est de l'ornement, il changerait la V2, et l'adresse est déjà
  écrite en toutes lettres dans la colonne.
- **La couverture de 54 px sur les lignes du panier.** Les lignes de commande
  ne portent pas d'URL de couverture ; l'ajouter est une question de données,
  pas de design.

Le reste du mouvement de `10` et tout le vivant de `11` restent aux lots 11
et 12, comme prévu.

## 8. Lots 9 à 13 — livrés le 6 septembre 2026

### Lot 9 — pages éditoriales

**Une colonne de lecture qui a la même largeur partout.** Les pages
« expertise » et « association » mesuraient leur colonne en `72ch` — huit
occurrences. Le `ch` est la largeur du **zéro de la police courante**, et ces
colonnes héritent de la police de TITRE : 72ch valent 1210 px en Caprasimo
contre 738 px en Figtree, et 1405 px en Fraunces contre 691 px en Nunito. Deux
paragraphes voisins n'avaient donc pas la même largeur, et l'écart changeait
avec la direction. C'est un défaut de la V2, que la police d'affichage
d'Organic a rendu criant. `--largeur-editorial` le remplace, en `rem`.

**La page de contact avait deux `<dt>` identiques.** L'adresse et le téléphone
portaient tous deux « Nos coordonnées » : une liste de définitions qu'un
lecteur d'écran ne peut pas désambiguïser — il annonce deux fois le même terme
pour deux valeurs différentes. Deux clés ont été ajoutées.

### Lot 10 — administration

Jetons seulement, comme prévu. `--focus-couleur` a été posé sur `.rail` et
`.barre` : les deux surfaces sombres de l'administration, où l'anneau de focus
héritait de `--encre` et devenait donc invisible. C'est le même défaut que
partout ailleurs, et il est traité par la même règle — voir le lot 13.

### Lot 11 — la passe mouvement

Les quinze effets de `10-animation-spec.md` sont en place, et la promesse
qu'ils portent tous — « all suppressed under reduced motion » — **se vérifie
maintenant plutôt qu'elle ne se relit** : `tests/unit/mouvement-reduit.test.ts`
exige que chaque `@keyframes` du dépôt soit nommément arrêtée par un
`animation: none` dans son propre fichier.

La règle générale de `tokens.css` — 0,01 ms sur toute animation — ne suffit
pas, et c'est le raisonnement qui a motivé le test. Elle tient pour un
mouvement CYCLIQUE : une pulsation de 0,01 ms ne bouge plus. Elle ne tient pas
pour une animation d'ENTRÉE : un toast qui monte de douze pixels en 0,01 ms
monte quand même — il apparaît décalé, puis saute à sa place dans la même
image. Le mouvement n'est pas supprimé, il est rendu instantané, ce qui est
exactement ce qu'un réglage de mouvement réduit demande d'éviter.

**Aucune exception, et c'est le point.** Une seule animation manquait à
l'appel — le point qui bat sur le tableau de bord d'administration — et son
commentaire expliquait qu'elle s'en remettait à la règle générale. Elle a reçu
sa coupure explicite plutôt qu'une entrée dans une liste blanche : une liste
d'exceptions se remplit toute seule, et il faut alors la relire pour savoir si
la promesse tient. Le seul état vérifiable d'un « pas d'exception » est zéro.

#### Deux départs assumés

- **L'effet 4, le flottement du hero**, s'applique dans le dossier « to the
  fanned covers ». Il n'y a pas d'éventail de couvertures dans ce hero : rien
  à faire flotter. L'effet n'est pas écarté, il est sans objet.
- **L'effet 8, la surcouche de recherche**, n'existe pas ici. La recherche de
  ce produit est un vrai formulaire `GET` dans la page, qui fonctionne sans
  JavaScript ; une surcouche en serait une SECONDE, avec deux champs et deux
  états qui finiraient par se contredire. Le raccourci ⌘K/Ctrl+K, lui, est
  repris — il amène au champ, le sélectionne et l'affiche.

#### Deux manques trouvés sur le tiroir de panier (effet 7)

1. **`aria-modal="true"` ne piège pas le focus.** L'attribut dit aux
   technologies d'assistance d'ignorer le reste du document ; il ne dit rien
   au navigateur. La touche Tab continuait de parcourir l'ordre du document et
   emmenait, depuis le dernier bouton du tiroir, sur les liens de la page
   restée derrière le voile — des cibles invisibles, avec un anneau de focus
   caché sous un calque. Le cycle est désormais fermé à la main.

2. **La page sautait de quinze pixels à l'ouverture.** `overflow: hidden` sur
   le corps retire la barre de défilement, et la page s'élargit d'autant : tout
   le contenu centré glissait vers la droite, puis revenait à la fermeture. Le
   défaut n'existe pas sur macOS, où les barres flottent au-dessus du contenu —
   d'où la facilité avec laquelle il survit.

   La compensation a elle-même un piège, que le banc d'essai a trouvé :
   `innerWidth - clientWidth` rend la largeur ENTIÈRE de la fenêtre partout où
   le document n'est pas mis en page, `clientWidth` valant alors 0. La première
   version poussait donc la page de mille pixels. La mesure est plafonnée à une
   largeur de barre plausible ; au-delà, on ne compense rien, et le pire qui
   arrive est le saut d'origine.

   L'en-tête `position: fixed` de l'accueil ne voit pas la marge du corps et se
   compense lui-même, par `--gouttiere-modale`.

### Lot 12 — la passe vivante

**Le panier se synchronise entre onglets sans jamais diffuser son contenu.**
`11-realtime-behaviour.md` propose un magasin client miroité dans
`localStorage`, avec les deux contenus synchronisés. Ce n'est pas ce qu'on
fait, et le dossier se contredit lui-même une ligne plus bas : « never trust a
client-side price ». Le canal `em_panier` ne porte qu'un mot — « ça a bougé » —
et l'onglet qui reçoit redemande la page au serveur. Deux onglets ne peuvent
pas diverger, puisqu'aucun des deux ne compte quoi que ce soit. C'est aussi ce
qui rend le message inoffensif : un `BroadcastChannel` est lisible par tout
script de la même origine.

**Le toast porte un CODE, jamais un texte.** Le message part d'une Server
Action et traverse une redirection, donc l'adresse. Si l'adresse portait le
texte, n'importe quel lien ferait dire au site ce qu'il veut, avec sa police et
sa couleur officielles — « Votre paiement a échoué, appelez ce numéro » dans le
bandeau officiel du produit. Le paramètre est validé contre une liste fermée ;
un code inconnu n'affiche rien.

Cette liste a trouvé un paramètre mort : `?avis=enregistre` était posé par la
Server Action des avis depuis le début, et **aucun écran ne le lisait**. Le
geste le plus incertain de la fiche — un avis passe en modération, il
n'apparaît donc pas — était celui qui n'accusait aucune réception.

**Le surlignage de recherche ne marque que ce qui se voit.** La recherche est
faite par `websearch_to_tsquery('french', …)` dans `catalog_list` : Postgres y
compare des RADICAUX, si bien que « lions » trouve « Le Lion » sans qu'aucune
sous-chaîne ne corresponde. Écrire un désuffixeur français en TypeScript pour
marquer ces cas serait une SECONDE implémentation de la règle de recherche, à
côté de celle de Postgres — exactement ce que `CLAUDE.md` interdit, et pour la
raison qu'on observerait ici. Le choix est donc asymétrique : on ne marque que
les débuts de mot littéraux, une correspondance par radical ne reçoit aucune
marque. Une marque absente ne dit rien de faux ; une marque au mauvais endroit
affirmerait que le serveur a apparié ce qu'il n'a pas apparié.

Deux pièges s'y cachaient, tous deux couverts par des tests :

- **l'alignement.** Le texte est plié — sans accent, en minuscules — pour la
  comparaison, puis découpé selon des index calculés sur le pli.
  `normalize('NFD')` rallonge la chaîne d'un caractère par accent, et le
  surlignage se décale d'autant : sur « Léopard », il commence une lettre trop
  loin. Le pli se fait donc point de code par point de code, avec l'offset
  d'origine gardé à côté ;
- **l'échappement.** Le titre vient de la base, la requête vient de l'URL.
  Assemblés en HTML puis posés par `dangerouslySetInnerHTML` — le chemin
  évident — ils feraient de chaque carte du catalogue un vecteur d'injection.
  La fonction rend des nœuds React, que React échappe.

#### Un manque de produit, pas de design

**Il n'y a aucun moyen de se déconnecter dans l'interface.** La route
`POST /api/auth/logout` existe et fonctionne ; aucun écran ne l'appelle. La
ligne « Logout returns home, clears the session, and the account tab shows the
auth screen » de la liste d'acceptation de `08` ne peut donc pas être cochée,
et la synchronisation de déconnexion entre onglets que `11` demande n'a pas de
sujet. Les codes de toast `deconnexion` et `profil` sont écrits et traduits,
prêts pour le jour où ces gestes existeront. **C'est du produit à décider, pas
une retouche de direction artistique** — d'où l'inscription ici plutôt qu'une
implémentation faite au passage.

### Lot 13 — accessibilité et performance

#### Le défaut le plus coûteux du lot : `sr-only` n'existait pas

Quatre écrans posent `className="sr-only"` sur un texte destiné aux seuls
lecteurs d'écran — le `h1` de l'écran de lecture, le libellé du comparatif
d'offres, le titre d'une entrée de « à propos », l'état d'une étape du tunnel.
**Aucune feuille du produit ne définissait la classe.** La règle venait d'un
`tailwind.css` retiré depuis, et il n'en restait qu'un commentaire.

Le défaut ne casse rien : il AFFICHE. « Petit Baobab » se lisait en haut à
gauche de l'écran de lecture, collé au bord et rogné, par-dessus la scène. Une
classe absente ne lève aucune erreur — ni au build, ni au typecheck, ni à
l'exécution — et c'est pourquoi elle a survécu à la suppression de la feuille
qui la portait. Il a fallu une capture d'écran pour la voir.

La règle est écrite en retrait de scène, jamais en `display: none` ni
`visibility: hidden` : ces deux-là retirent aussi le texte de l'arbre
d'accessibilité, ce qui reviendrait à supprimer le `h1` au lieu de le masquer.
Deux tests le tiennent, dont un qui vérifie que toute classe utilitaire écrite
en clair dans du JSX existe quelque part — les modules CSS sont vérifiés par le
compilateur, les chaînes nues ne l'étaient par personne.

#### Les vignettes du lecteur portaient un motif régional

`.miniature` gardait `var(--motif-afrique_ouest)` — le kenté — sur chaque page
de chaque titre, quelle que soit son origine, livrets pédagogiques compris. Le
test écrit au lot 6 n'interdisait que le préfixe `--region-` ; `--motif-` est
passé au travers. Les deux disent la même chose, et le test couvre maintenant
les deux. Une vignette de page désigne un RANG, et son numéro le dit déjà.

#### Les images

- **Trois `alt` recopiaient le texte écrit juste à côté** — le `<h2>` de la
  section, ou le titre de la carte qui entoure l'image. Un lecteur d'écran
  entendait deux fois la même phrase, la première annoncée comme une image. Le
  défaut a l'air d'un soin : l'attribut est rempli, il n'est pas vide, un audit
  automatique le compte comme conforme. C'est ce qui le rend durable. Ces
  images sont décoratives et se déclarent vides.
- **Deux images ne disaient rien de leur chargement** — la page du lecteur et
  le logo de l'association. Toutes deux sont au-dessus de la ligne de
  flottaison et prennent `eager` ; la page du lecteur prend en plus
  `fetchPriority="high"`, pour passer devant le pré-chargement de la planche
  suivante.
- `tests/unit/images-discipline.test.ts` fige les quatre règles. Il ne réclame
  pas `lazy` partout : il réclame que chaque image écrite à la main DISE
  quelque chose. L'oubli est ce qu'on attrape ; le choix reste libre.

#### L'anneau de focus était invisible sur toute surface sombre

`--focus-couleur` valait `--encre` partout, c'est-à-dire l'encre de la PAGE.
Sur les dix conteneurs sombres du produit — pied, panneau de connexion, rail
d'administration, tiroir, barre du lecteur — l'anneau était sombre sur sombre.
C'est un défaut de la V1 et de la V2, hérité tel quel, et il condamne la
navigation au clavier là où elle sert le plus. Chaque surface sombre nommée
déclare maintenant sa propre couleur de focus, que ses enfants héritent, et un
test l'exige. Sous Organic, la valeur globale est `--accent-encre` : la terre
cuite mesure 2,84:1 sur le fond secondaire, sous le minimum de 3:1 exigé pour
un indicateur non textuel.

### La liste d'acceptation de `08-build-plan.md`

| Ligne | État |
| --- | --- |
| Chaînes françaises fidèles au prototype | ✅ sauf là où le dossier nomme une donnée que ce produit n'a pas |
| Thèmes clair et sombre corrects partout, préférence persistée | ✅ cookie `em_theme`, posé par le serveur |
| Desktop : conteneur 1240, en-tête 76 collant flouté, barre 38, pied olive | ✅ lot 3 |
| Points de rupture 1120 et 760 conformes à `02` | ✅ à un désaccord près, §3 |
| Mobile : en-tête 60, cinq onglets, feuilles, barre d'achat | ✅ lots 4 et 6 |
| Aucune cible sous 44×44 px | ✅ éprouvé par Playwright, `tests/rendu/v2.spec.ts` |
| Survol de carte livre : lift, rotation, ombre, couleur de titre, 450 ms | ✅ lot 5 |
| Révélations au défilement : une fois, 700 ms, coupées sous mouvement réduit | ✅ lot 11 |
| Panier : ajout, garde anti-doublon, retrait, total, persistance, pastille | ✅ — le total est SERVEUR, la persistance est en base |
| Filtres et tri identiques aux règles de `06` | ✅ posés en SQL par `catalog_list` |
| `3 000 FCFA` et `Gratuit` partout | ✅ formaté par le serveur, jamais recalculé |
| Auth : deux modes, bascule mot de passe, validation, retour au paiement | ✅ lot 8 |
| **Déconnexion : retour à l'accueil, session vidée, onglet Compte en écran d'auth** | ❌ **aucun écran n'appelle la route de déconnexion** — voir lot 12 |
| Lecteur : flèches clavier, barre de progression, position par livre | ✅ la position est SERVEUR (`reading_progress`), pas `localStorage` |
| ⌘K, Escape ferme, traversée clavier complète à l'anneau terre cuite | ✅ lots 11 et 13 |
| Images lavées, arrondies, réactives, avec un vrai texte de remplacement | ✅ lot 13 |
| Aucune couleur, police, rayon ou ombre hors de `01` | ✅ éprouvé par `design-tokens` |
| Thème correct au premier rendu serveur, sans clignotement | ✅ lot 1 |
| Les quinze effets présents, tous coupés sous mouvement réduit | ✅ lot 11, deux effets sans objet — voir ci-dessus |
| Panier optimiste et synchronisé sur deux onglets | ⚠️ synchronisé, **pas optimiste** — voir lot 12 |
| Position de lecture restaurée par livre, reflétée dans le profil | ✅ lot 6 |
| Chaque formulaire a un vrai état d'attente et une validation serveur | ✅ Zod sur chaque route |
| Aucun paquet client au-dessus de 120 Ko gzip | ❌ **129,2 Ko mesurés** — voir ci-dessous |

#### Le budget de 120 Ko, mesuré

Construction de production du 6 septembre 2026, `rootMainFiles` du
`build-manifest`, gzip réel :

| Morceau | Gzip |
| --- | --- |
| `25o46h8mdjlrg.js` | 69,3 Ko |
| `3cxnvk-_deao7.js` | 38,1 Ko |
| `07-hzktxqjvzd.js` | 10,8 Ko |
| `2u2p36nymgtri.js` | 6,9 Ko |
| `turbopack-*.js` | 4,1 Ko |
| **socle partagé** | **129,2 Ko** |

Le socle dépasse donc le budget **avant qu'une seule route n'ajoute son code**.

Ce qu'il contient a été vérifié plutôt que supposé : React DOM et le moteur
client de l'App Router, et rien d'autre. Aucune dépendance du produit n'y a
fui — ni client Supabase, ni Zod, ni bibliothèque d'animation. Le budget de
`08-build-plan.md` a été écrit pour un prototype statique ; 129 Ko est
approximativement le plancher de React 19 avec l'App Router, et il n'est pas
atteignable en retirant du code de ce dépôt.

**C'est une décision d'architecture, pas une optimisation à faire** : la tenir
demanderait de changer de cadre, ou de servir les écrans publics sans
hydratation. La ligne est laissée en échec plutôt que redéfinie — un budget
qu'on réécrit pour qu'il passe ne mesure plus rien. Ce qui reste à la portée
du produit, et qui est fait, c'est de ne rien ajouter à ce socle : les cartes
de conte n'embarquent aucun JavaScript hors leur bouton d'ajout, et les écrans
restent rendus par le serveur.

### État du lot 1 — livré le 5 septembre 2026

Porte verte : **1603 tests, 94 fichiers, +46**.

- jetons `--v3-*` et `--v3-nuit-*`, les deux thèmes écrits en clair dans
  `tokens.css` pour que le test de contraste puisse lire les deux ;
- Caprasimo et Figtree embarquées (41 Ko à deux, contre 160 Ko pour
  Fraunces + Nunito), OFL-1.1, licences jointes ;
- `data-theme` posé par le serveur depuis le cookie `em_theme`, sans
  clignotement, avec repli `prefers-color-scheme` quand aucun choix n'existe ;
- `structureRefondue()` remplace douze `versionDesign() === 'v2'` — sans quoi
  la V3 retombait sur le squelette V1 ;
- `NEXT_PUBLIC_DESIGN_VERSION` accepte `v3` dans les DEUX endroits qui la
  connaissent, et un test garde leur alignement.

---

## 9. La passe au pixel, écran par écran — de la droite vers la gauche

Décision du propriétaire, 6 septembre 2026 : reprendre les écrans **dans
l'ordre de la navigation, en partant de la droite**, et mesurer chacun contre
le prototype plutôt que le regarder.

L'ordre est donc : `Nous écrire` → `À propos` → `Expertise & conseil` →
`Association` → `Offres` → `Boutique` → l'accueil.

### Pourquoi la mesure, et pas la relecture

Les lots 1 à 13 ont repeint le site et redessiné ce que la peinture ne pouvait
pas atteindre. Ils ne l'ont pas **mesuré**. La différence est visible dès qu'on
superpose : la page de contact était juste de couleur, de police et d'esprit,
et fausse de vingt à quarante pixels partout — sans qu'un seul élément ait
l'air de travers.

La passe emploie donc un relevé automatique : les mêmes éléments sont
interrogés des deux côtés (position, taille, police, interligne, rayon,
rembourrage) et l'écart est imprimé. C'est ce relevé qui a trouvé les trois
défauts **globaux** ci-dessous ; aucun des trois ne se serait vu à l'œil.

### Les trois défauts globaux que la première passe a mis au jour

| Défaut | Ce qu'il valait | Ce qu'il vaut | Où |
| --- | --- | --- | --- |
| Le conteneur | `--largeur-page: 1200px` | **1240 px** sous la V3 | `tokens.css` |
| L'interligne du corps | `--interligne-corps: 1.5` | **1,6** sous la V3 | `tokens.css` |
| La barre utilitaire | 42 px de haut | **38 px** | `v3.module.css` |

- **1240, et non 1200.** `02-layout-responsive.md` ouvre sa description du
  gabarit desktop par « Container: max-width: 1240px […] padding: 0 28px ». Le
  lot 3 avait posé les 28 px sur l'en-tête et laissé le jeton à 1200 : le
  chrome commençait 17 px trop à droite, et toutes les sections avec lui. Le
  lecteur garde ses 1120 px, qu'il écrit lui-même.

  Corollaire, dans `boutique.module.css` : la bannière fusionne en UNE boîte ce
  que la maquette imbrique en deux, et son rembourrage doit donc additionner
  les marges des deux niveaux — `max(28px, (100% - 1240px) / 2 + 28px)`. Sans
  les « + 28px », le contenu mesurait 1240 quand la maquette en rend 1184.

- **1,6, et non 1,5.** La racine du prototype porte en clair
  `font-size:16px;line-height:1.6`. Le système « Organic » écrit 15 px / 1,55
  dans sa feuille, et ses documents le répètent — mais le README tranche :
  *« when a doc here and the prototype disagree, the prototype wins »*.
  L'interligne du corps est hérité par tout ce qui ne se déclare pas :
  étiquettes, sur-titres, et surtout la hauteur des champs de saisie. Un
  `textarea` de cinq lignes mesure 156 px à 1,6 et 148 à 1,5.

- **38, et non 42.** `.langue` portait `min-height: 42px` — la cible tactile de
  l'en-tête de la V2, où le sélecteur vivait avant de déménager dans la barre
  utilitaire. Une hauteur MINIMALE se laisse pousser par le premier enfant plus
  grand : la barre mesurait 42 px, et **toutes les pages du site** descendaient
  de quatre pixels.

  La variante compacte se distingue par un **attribut** (`data-abrege`) et non
  par une seconde classe : une classe déclarée uniquement sous `:global(...)`
  n'est pas exportée par le module CSS, `styles.x` vaut `undefined`, et le
  style ne s'applique jamais. C'est le piège que
  `tests/unit/classes-css.test.ts` défend — il l'a d'ailleurs attrapé.

### Écran 1 — `Nous écrire`, livré le 6 septembre 2026

Prototype, lignes 1032 à 1088. La V2 rendait ses coordonnées dans une liste de
définitions et son formulaire dans la carte d'achat de la boutique : aucune
règle de couleur ne fabrique un pictogramme ni une pastille de sujet, il
fallait le balisage. D'où `src/components/v2/contact.{tsx,module.css}`, servi
derrière `estV3()`, la V2 laissée intacte.

Après relevé, **toutes** les mesures coïncident : bandeau de 820 px centré,
grille `.9fr 1.1fr` à 56 px de gouttière, cartes à 24 px de rayon, panneau à
34 px, champs à 18 px, bouton de 55 px de haut.

Quatre écarts subsistent, tous voulus, tous écrits à leur ligne :

| Écart | Raison |
| --- | --- |
| Le sur-titre est `#8c491a`, non la teinte calculée par le prototype | C'est la valeur que `01-design-tokens.md` nomme « contrast-safe ». La teinte du prototype vaut 4,19:1 sur le fond de bande, sous le seuil AA pour 11,5 px |
| Le bouton d'envoi porte l'encre, non le blanc | Écart n° 1 de `tokens.css`, déjà mesuré : 3,61:1 |
| `outline: none` n'est pas repris sur les champs | C'est l'anneau de focus du clavier ; §5.3, WCAG 2.1 AA |
| La carte d'adresse fait deux lignes | L'adresse réelle porte son lieu-dit ; la maquette montre une forme raccourcie. Une maquette n'est jamais une autorité sur une donnée — et le prototype MOBILE écrit, lui, l'adresse complète |

Le formulaire n'a **pas** gagné le bandeau « Message envoyé » du prototype : le
dossier écrit lui-même *« No real backend […] stubbed with toasts »*, et aucune
route ne reçoit un message de contact. Il ouvre le logiciel de courrier du
visiteur, comme la V2. Les quatre sujets sont un groupe de boutons radio —
aucun JavaScript, et le sujet part avec le message.

`tests/composants/contact-v3.test.tsx`, onze tests.

### Écran 2 — `À propos`, livré le 7 septembre 2026

Prototype, lignes 966 à 1030. `src/components/v2/apropos-v3.{tsx,module.css}`,
derrière `estV3()`, la V2 laissée en place.

Le dessin change de nature, pas seulement de couleur : le récit MONTE dans le
héros, sur deux colonnes avec l'illustration à droite et un disque terre cuite
qui déborde du coin ; la citation prend un panneau olive de 36 px de rayon ; le
catalogue devient une rangée qui GLISSE au lieu d'une grille qui se replie. La
V2 ouvrait sur un bandeau olive, puis annonçait « Notre histoire » avant de la
raconter — deux portes devant une seule pièce.

Après relevé, toutes les cotes coïncident. Quatre pièges valaient le détour, et
aucun ne se voyait à l'œil :

| Piège | Effet mesuré |
| --- | --- |
| Les attributs `width`/`height` d'une balise battent `aspect-ratio` | la couverture faisait 170 × 403 au lieu du rapport 268/403 |
| Une image reste EN LIGNE par défaut | sept pixels de jambages sous chaque couverture — `_ds` pose `img{display:block}`, pas ce dépôt |
| `scroll-snap-type` aligne sur le bord de la BOÎTE | la rangée s'ouvrait à `scrollLeft: 4` et mangeait son rembourrage |
| Deux titres voisins, deux interlignes | le prototype pose `1.05` sur l'un et RIEN sur l'autre, qui hérite donc du `1.12` d'Organic |

Un cinquième, dans l'outil plutôt que dans le code : les sections `data-reveal`
mettent 700 ms à se poser, et un relevé pris trop tôt mesure une page en
mouvement. Les écarts « inexplicables » de dix-huit pixels ont disparu en
portant l'attente à 3,5 s.

### Les textes de la page sont ceux du propriétaire — 7 septembre 2026

Source : `New section/A propos/Apropos_texte.txt` et `image.jpg`.

Ce que le dépôt portait avant venait du prototype, et décrivait une maison qui
ne publie que des contes. Elle en publie — et elle édite aussi des ressources
pédagogiques, porte une association et fait du conseil. C'est le même défaut
que les textes de l'association avant leur remplacement : vraisemblable, bien
écrit, et faux.

| Ce qui change | Avant | Après |
| --- | --- | --- |
| Le récit | trois paragraphes inventés | **deux réels** — accueil et mission. `aproposH3` n'a plus de clé : il n'existait pas |
| Les quatre cartes | « principes » imaginés par le prototype | les quatre **univers** : contes, ressources pédagogiques, Association DAVE, consulting |
| Le panneau | une citation inventée, **signée de la fondatrice** | la **devise de la maison**, celle qui est imprimée sur l'illustration — attribuée à personne |
| L'illustration | un visuel de remplacement | `apropos-univers.jpg`, fourni |

**La signature retirée est le point important.** Prêter une phrase inventée à
une personne réelle n'est pas la même faute que d'inventer un texte : le texte
se corrige, la citation engage quelqu'un. Une devise de maison ne se signe pas.

Deux adaptations que l'image a imposées, toutes deux écrites à leur ligne :

- **son rapport naturel, et non le 4/5 du prototype.** C'est un panorama en
  1080 × 602 qui met en scène les quatre univers, chacun nommé dessus.
  Recadrée en portrait, elle en perdrait deux sur quatre — c'est-à-dire son
  sujet. La boîte, elle, ne bouge pas : 32 px de rayon, l'ombre de panneau, la
  colonne de droite ;
- **elle n'est pas lavée.** `.washed` s'applique aux PHOTOGRAPHIES, pour
  qu'elles cessent de se battre avec la palette. Celle-ci porte du texte —
  le nom de la maison, sa devise, les quatre univers. Éclaircie de 10 % et
  désaturée, ces mots pâlissent jusqu'à l'illisible. Même règle que pour les
  couvertures de livres : ce qui porte une information reste franc.

Et son texte de remplacement vit dans **`src/content/apropos.ts`**, pas dans le
dictionnaire d'interface : `images-discipline` interdit `alt={traduire(…)}`
parce que trois images du produit y recopiaient le titre écrit à trois lignes
de là. Le test nomme lui-même l'exception légitime — « une donnée éditoriale
nommée pour cet usage » — et c'est ce fichier.

### Le logo officiel, et pourquoi il avait disparu

Une version intermédiaire l'avait remplacé par le monogramme « EM » du
prototype. L'argument était juste : le fichier fourni est un **lockup** —
l'emblème ET les deux mots « Editions Mapoukam », l'un sous l'autre — et réduit
au disque de 44 px il rendait des mots hauts de quatre pixels.

La conclusion ne l'était pas. Ce qu'il fallait retirer, ce sont les MOTS.
`public/images/logo-mapoukam-marque.png` est le fichier officiel découpé sur
les lignes vides qu'il porte lui-même entre l'emblème et le mot — les rangées
243 à 259 sur 447, trouvées en lisant le canal alpha. Aucun trait n'est
redessiné ; c'est le même logo, sans sa moitié illisible. Le nom reste écrit à
côté, en texte, comme il l'a toujours été.

### Deux sessions dans le même dépôt

Le 6 septembre au soir, une seconde session travaillait la même passe sur les
écrans d'authentification, de compte, de panier et de recherche. La collision
s'est vue avant d'être coûteuse — un test d'architecture a signalé des classes
qui n'étaient pas les siennes — et le partage a été écrit : chaque session
possède ses écrans, personne ne touche `src/design/tokens.css` ni
`src/components/enveloppe/*` sans le dire.

Ce qui l'a rendu détectable plutôt que silencieux : `classes-css.test.ts`, qui
attrape une classe déclarée uniquement sous `:global(...)`. Il l'a fait trois
fois en deux heures, sur trois auteurs différents.

### Écran 3 — `Expertise & conseil`, livré le 7 septembre 2026

Prototype, lignes 838 à 922. `src/components/v2/expertise-v3.{tsx,module.css}`,
derrière `estV3()`.

**C'est la seule page du site qui ouvre sur l'olive.** Partout ailleurs Organic
ouvre sur une bande de crème ; ici le héros est sombre, et ce n'est pas une
variation : la page s'adresse à des directions d'école, pas à des parents. Le
contraste de traitement le dit avant la première ligne.

La V2 ouvrait sur un bandeau, puis consacrait une section entière à la
certification INSEI, en prose pleine largeur. Le prototype en fait un
**panneau**, à droite du titre : la promesse et sa preuve se lisent d'un seul
regard, ce qui est exactement ce qu'on demande à une page qui vend une
expertise.

Ce que la mesure a corrigé, une fois le dessin posé :

| Défaut | Effet |
| --- | --- |
| Un interligne écrit sur le tarif (`1.15`) | le prototype le laisse à celui du corps ; les trois cartes perdaient 23 px |
| `line-height: normal` sur les deux boutons d'appel | chez le prototype le premier est un `<button>` — donc `normal` — et le second un `<a>`, qui hérite de 1,6. Sept pixels d'écart entre deux boutons empilés |
| Le panneau final calé sur 1184 px | il est le seul bloc de la page à faire **1240** : le prototype le pose lui-même à cette largeur et ne lui donne pas de marge intérieure. Il déborde de 28 px sur ses voisines, et c'est ce qui le fait lire comme une bande plutôt qu'une carte de plus |

**Un jeton a dû être créé.** Le sur-titre du héros est le premier accent du
site posé SUR l'olive, et aucun jeton n'y répondait : `--action-texte` est
assombri pour le fond clair, et `--action` — la terre cuite du jour — ne vaut
que 3,34:1 sur l'olive du jour, sous le seuil d'un texte de 11,5 px.
`--accent-sur-chrome` porte donc la terre cuite de NUIT dans les deux thèmes :
5,85:1 sur l'olive du jour, 7,81:1 sur celui de la nuit. Deux paires de
contraste l'accompagnent dans `design-tokens.test.ts`.

Deux écarts au prototype, tous deux au bénéfice du produit :

- **les trois engagements restent.** `src/content/consulting.ts` les porte — sur
  mesure, tarifs annoncés d'avance, méthodes validées à l'international. Le
  prototype ne les a pas ; ce sont les trois objections qu'un directeur d'école
  oppose à un cabinet, et les retirer pour tenir une hauteur reviendrait à
  laisser une intention visuelle décider d'un argument de vente. Ils prennent la
  coche du dossier, dans le panneau ;
- **la vidéo reste.** Le prototype n'en a pas ; la fondatrice s'y présente, les
  cahiers déjà parus devant elle. Sur une page qui vend un accompagnement, un
  visage vaut trois paragraphes. `preload="none"`, comme partout.

Et un point où suivre le dossier à la lettre aurait été une faute : le prototype
met la même phrase dans l'`alt` ET dans le `figcaption` de chaque réalisation.
Un lecteur d'écran l'entend alors deux fois de suite, la première annoncée comme
une image — ce que `images-discipline` interdit. Les `alt` restent vides ; la
légende est visible.

`tests/composants/expertise-v3.test.tsx`, dix-sept tests.

### Trois sessions dans le même dépôt, et ce que ça a coûté

Le 7 septembre au matin, une TROISIÈME session travaillait la même refonte —
les livrets, le catalogue et la base — sans le savoir. Le compte : deux
sessions annoncées, une découverte par ses dégâts.

Ce qu'elle a cassé, et comment ça s'est vu :

| Symptôme | Cause | Ce qui l'a révélé |
| --- | --- | --- |
| `/fr/catalogue` et `/api/catalog` en 500 | la migration 0079 retypait le `RETURNS TABLE` de `catalog_list` — `book_id` devenait `id` — et le client mappe par position | un relevé sur une page voisine |
| `npm run lint` rouge deux fois, sur deux fichiers | des globaux Node non déclarés, puis un état React inutilisé | la porte |
| Onze livres au lieu de dix | un livret publié à dessein, pour construire `/fr/livrets` sur des données réelles | `access.test.ts`, qui ne dit pas un mot d'ingestion |

Trois leçons, toutes valables hors de ce cas :

1. **Un test d'architecture est ce qui rend une collision visible.**
   `classes-css.test.ts` a signalé trois fois des classes qui n'appartenaient
   pas à celui qui lisait le rapport. C'est comme ça que la première collision
   a été trouvée, avant qu'un fichier soit perdu.
2. **Une signature de fonction SQL se REPREND, elle ne se retape pas.** La
   correction (migration 0080) régénère le `RETURNS TABLE` depuis le texte de
   0078 avec les seules colonnes nouvelles insérées — la dérive ne peut plus se
   reproduire.
3. **PostgREST garde en cache une fonction supprimée puis recréée.** Sans
   `notify pgrst, 'reload schema'`, la base est juste et l'application fausse.

### Ce que la passe n'avait pas encore touché — le chrome ✅ SOLDÉ

> **Cette liste est close depuis le 7 septembre 2026.** Le lot chrome a été
> fait dans la foulée et les cinq points ci-dessous sont tous traités —
> pastille terre cuite, promesse, pastille de thème étiquetée, signature
> « CONTES D'AFRIQUE », bouton rond de compte, bloc de lettre d'information
> (ce dernier posé par une autre session). Elle est conservée pour mémoire ;
> lue comme un reste-à-faire, elle induit en erreur.

Le relevé les avait nommés ; ils appartiennent à l'en-tête et au pied, et non à
un écran :

- la barre utilitaire n'a ni la pastille terre cuite ni la promesse du
  prototype (« Livraison numérique immédiate · PDF et EPUB à garder pour
  toujours ») ;
- le commutateur de thème est une icône seule, quand le prototype en fait une
  pastille étiquetée « Nuit » / « Jour » ;
- la marque est un logo, quand le prototype pose une pastille « EM » de 44 px,
  le nom, et la signature « CONTES D'AFRIQUE » ;
- l'en-tête n'a pas le bouton rond de compte ;
- le pied n'a pas le bloc d'inscription à la lettre d'information.

### Écran 4 — le rayon des livrets, livré le 7 septembre 2026

Prototype, lignes 1090 à 1190. Trois blocs y sont propres à cet écran et
n'existaient nulle part dans le dépôt : les **trois** cartes de compte, le
panneau du kit offert, et la carte de livret **couchée**.

#### La carte de livret est une autre carte, et la maquette le dit

Le prototype dessine deux cartes qui ne se ressemblent pas :

| | Conte | Livret |
| --- | --- | --- |
| panneau | aucun — la couverture EST la carte | fond, filet, rayon 28, ombre |
| couverture | `268 / 403`, debout | `16 / 11`, couchée |
| bouton d'ajout | 46 px, posé sur l'image | 40 px, dans la rangée de pied |
| grille | `minmax(226px, 1fr)` | `minmax(330px, 1fr)`, écart 26 |

Ce n'est pas un habillage : un livret pédagogique est un A4 à l'italienne, un
conte est un album debout. Les recadrer au même gabarit tronque l'un des deux.

La bascule se lit sur `type_document`, et sur rien d'autre — usage **légitime**
de l'étiquette de rangement : elle décide d'une mise en page, jamais d'un
droit. `access_for_books` ne la lit pas et ne doit pas la lire.

Corollaire assumé : sur `/catalogue`, où les deux supports se mêlent, la grille
porte les deux formes en même temps. C'est là qu'un lecteur a le plus besoin de
distinguer d'un coup d'œil ce qu'il regarde.

#### Ce que le relevé a trouvé, et que l'œil n'aurait pas vu

Six défauts, dont **quatre étaient globaux** — ils touchaient tous les écrans de
la direction, et aucun ne se signalait :

| Défaut | Ce qu'il valait | Ce qu'il vaut | Portée |
| --- | --- | --- | --- |
| la traque des titres | `normal` | **`-0.015em`** (`--traque-titre`) | tout le site |
| la marge basse du sur-titre | 8 px | **0** | toutes les cartes |
| la gouttière du corps | 20 px | **28 px** | catalogue, contes, livrets |
| le blanc sous la bannière | `clamp(32px, 4vw, 52px)` | **44 px** | idem |
| le `gap` de la bannière | `40px` (les deux axes) | **`column-gap` seul** | idem |
| la pastille de niveau | dans le coin haut gauche | à sa place | rayon des livrets |

Trois méritent leur phrase :

- **`-0.015em`.** `_ds/…/styles.css` la pose sur `h1..h6` et le prototype ne la
  redéclare jamais. Fraunces n'en a pas besoin, Caprasimo si : c'est une grasse
  d'affiche, et non resserrée elle paraît espacée aux grandes tailles. La
  valeur est donc une propriété de la DIRECTION, et elle vit dans un jeton —
  écrite au cas par cas, elle aurait manqué partout où personne n'y aurait
  pensé, et un titre non resserré au milieu de titres resserrés ne se voit pas
  isolément : il se voit comme un défaut d'alignement du bloc entier.

- **Le `gap` de la bannière.** Le fil d'Ariane est devenu une PREMIÈRE RANGÉE de
  la grille — le prototype le met hors grille sur le rayon des livrets et dans
  la colonne de gauche sur le catalogue, deux écritures pour un même rendu,
  puisqu'il est aligné à gauche. Mais `gap` est un raccourci : les 40 px prévus
  entre les deux COLONNES s'appliquaient aussi entre les deux RANGÉES. Le titre
  descendait de 44 px, et tout l'écran avec lui. `column-gap` et `row-gap`
  séparés.

- **`inset` est un raccourci, lui aussi.** La pastille de niveau est posée en
  absolu par une règle plus spécifique que celle qui écrit ses coins :
  `inset: auto` y écrasait `bottom: 14px; left: 14px`, et la pastille retombait
  dans le coin haut gauche du cadre. Les quatre côtés s'écrivent maintenant
  dans une seule déclaration.

#### Deux pièges du relevé lui-même

Le relevé mesure ce qu'on lui montre, y compris ce qui n'est pas encore posé :

1. **Il faut DÉFILER avant de mesurer.** Les cartes entrent par `Revele`, qui
   les tient à `translateY(18px)` tant que l'observateur ne les a pas vues.
   Photographiées en pleine page elles sont justes ; sondées sans défilement,
   elles rapportaient dix-huit pixels d'écart — parfaitement réels, et
   parfaitement invisibles à l'écran.
2. **Deux boîtes qui n'ont pas la même définition ne se comparent pas.** La
   sonde de bannière opposait le `div` borné du prototype à la colonne de texte
   de l'application : 1240 contre 655, cinq écarts, et rien à en tirer. Les
   boîtes extérieures, elles, sont bien la même chose — le bandeau crème d'un
   bord à l'autre.

#### L'intro du rayon a pris les mots du prototype

Elle disait « Des supports d'activités à imprimer ou à projeter, tirés des
contes du catalogue » — deux lignes là où le prototype en a trois, et une
bannière plus courte de 28 px qui décalait tout le reste de l'écran. Le texte
du prototype est exact pour ce que le rayon contient, et il est repris tel quel
dans les deux langues.

C'est le seul endroit de cet écran où une COPIE a été changée. Les prix, eux,
restent ceux de la base : `docs/maquettes/` le dit, une maquette n'est jamais
une autorité sur une donnée.

#### État après relevé

Sur le rayon des livrets, **tout le haut de l'écran coïncide** — bandeau,
titre, intro, les trois cartes de compte, le résumé du panneau, ses objectifs.
Sur le catalogue, la bannière coïncide entièrement elle aussi : c'est la garde
qui prouve que la variante des livrets ne s'est payée nulle part.

Quatre écarts restent, tous nommés :

- **le blanc sur la sauge**, deux fois (pastille du panneau, sur-titre des
  cartes) — départ assumé, mesuré à 3,73:1 contre les 4,5:1 d'AA ;
- **l'encre sur la terre cuite** — le prototype écrit du blanc, la direction a
  choisi l'encre sombre pour la même raison, et le choix vaut pour tout le site ;
- **la teinte des valeurs de compte** — `#8c491a` chez nous, ce que le prototype
  DÉCLARE lui-même en `--terra-d`, contre `rgb(158, 89, 44)` qu'il REND. La
  différence vient de sa feuille de système, pas de la nôtre. Point ouvert ;
- **la hauteur entre le panneau et la grille** — 67 px de plus chez nous. La
  barre de filtres de l'application porte le tri, la vue et l'accès, que la
  barre du prototype n'a pas, et le compte y vit dans sa propre rangée comme
  sur le catalogue. C'est la barre que le propriétaire a validée le 7 septembre
  après deux réductions ; on ne la redéfait pas pour gagner des pixels.

La rangée de pied d'une carte mesure 42,6 px au lieu de 57 : le seul livret
publié est OFFERT, donc `disponible_achat = false`, donc pas de bouton d'ajout.
C'est la règle du dépôt — on ne propose pas d'acheter ce qu'on donne — et le
prototype dessine le bouton partout parce que ses données sont fictives.

### `Association`, livré le 7 septembre 2026 — quatrième écran de la passe droite → gauche

Prototype, lignes 674 à 784. `src/components/v2/association-v3.{tsx,module.css}`,
derrière `estV3()` dans `src/app/[langue]/association/page.tsx` — qui n'avait
aucune branche V3 jusqu'ici. La V2 reste en place, intacte.

**Le bandeau disparaît, et le héros prend sa place.** La V2 ouvrait sur le
bandeau partagé de la boutique, puis alignait le logo, la devise, trois
sections de prose, la vidéo, un mur d'adhésion et enfin les contenus. Sept
blocs empilés, tous du même poids. Le prototype hiérarchise : ce qu'est
l'association (héros), ce qu'elle fait (une bande olive pleine largeur), ce
qu'on obtient en adhérant, ce qu'on peut faire sans adhérer, puis ses récits.
La prose ne change pas — c'est son **ordre** et son poids qui changent.

La page alterne trois fonds, et c'est ce qui la découpe : crème de bande au
héros, olive plein pour l'action de terrain, crème de page pour tout le reste.
Aucune de ces trois sections n'a de titre de rubrique — c'est le **fond** qui
dit qu'on a changé de sujet, et c'est pourquoi la bande sombre ne peut pas
devenir une carte de plus.

#### Ce que la mesure a corrigé, une fois le dessin posé

Aucun des trois ne se voyait à l'œil, et les deux premiers décalaient tout ce
qui suivait :

| Défaut | Effet |
| --- | --- |
| `margin-bottom: 0` sur la **dernière** note de la carte « Ce qu'il faut savoir » | le prototype la garde. La carte perdait 14 px, la section les perdait avec elle, et les trois blocs suivants remontaient d'autant |
| La traque des titres (`-0.015em`) écrite sur les titres rendus en `<p>` | le prototype ne pose de traque que sur `h1`…`h6` — c'est la police qui la porte, pas la fonction. Trois blocs la prenaient à tort |
| `minmax(420px, 1fr)` dans la grille des contenus supplémentaires | un `minmax` dont le minimum dépasse la place disponible ne se replie pas, il **déborde** : à 430 px de fenêtre, toute la page prenait dix pixels de défilement horizontal. `minmax(min(420px, 100%), 1fr)` |

Après correction, les **soixante sondes** du relevé tombent à zéro écart —
position, boîte, corps, interligne, rembourrage, rayon, opacité — à quatre
exceptions près, toutes structurelles et voulues : les quatre conteneurs de
section mesurent 1440 avec un rembourrage de 128 px là où la maquette mesure
1240 avec 28 px et 100 px de marge. C'est la formule de gouttière commune à
toute la passe : la boîte va d'un bord à l'autre, et son rembourrage absorbe à
la fois le centrage du conteneur de 1240 et ses 28 px propres. Le contenu tombe
au même pixel des deux côtés.

#### Quatre écarts au prototype, tous au bénéfice du produit

- **La pastille « Réservé aux adhérents » n'existe pas dans la maquette.** Elle
  n'a ni base ni droits, donc elle ne pouvait pas la connaître. Une partie des
  contenus est réservée : sans elle, un visiteur clique et se heurte à un mur
  qu'aucun signe n'annonçait. Elle suit `peutLire` — le verdict rendu par
  `access_for_association`, qui appelle `abonnement_ouvre_droit(user,
  'association')` — et **rien d'autre**. Rendue en tracé plutôt qu'en émoji : un
  cadenas en caractère s'annonce « cadenas fermé » juste avant le texte qui dit
  déjà la même chose, et son dessin change d'une machine à l'autre.
- **La maquette dessine trois contenus ; la base en a huit.** Un en grand, deux
  à côté, et la colonne de droite tient exactement la hauteur de la carte —
  420 px. Rendre les sept autres dans cette colonne l'étirait à mille trois
  cents pixels, et la carte de gauche avec elle : un visuel de la hauteur de
  trois écrans, pour un récit. Les deux premiers gardent donc la place que la
  maquette leur donne ; les suivants prennent la **même** carte-ligne, en deux
  colonnes égales, juste en dessous. Rien n'est masqué, et le haut du bloc reste
  celui qui a été dessiné.
- **La vidéo de présentation quitte l'écran.** Le prototype n'en a pas, et elle
  vivait au milieu de la prose, où elle coupait le fil. Son **affiche** est déjà
  le visuel « Ensemble, nous apprenons mieux » ; le collage du héros porte
  maintenant deux photographies de terrain, ce qui dit la même chose sans
  demander qu'on appuie sur lecture. Le fichier reste en place et
  `VIDEO_PRESENTATION` avec lui : la V2 le sert toujours.
- **La rangée « soutenir autrement » reçoit un titre caché.** Le prototype ne
  lui en donne aucun — trois cartes qui flottent. Sans étiquette, la section
  n'apparaît pas dans la liste des repères d'un lecteur d'écran. Le titre est
  celui de la troisième section du contenu, « Nous soutenir autrement ».

#### Les images : ce qui est lavé, et ce qui ne l'est pas

Le collage du héros porte le logo de l'association et **deux** photographies —
`kit-pedagogique.jpg` et `classes-inclusives.jpg`, jusqu'ici inutilisées dans le
dépôt. Le traitement lavé du dossier (`saturate(.6) contrast(.85)
brightness(1.1) opacity(.94)`) s'applique aux deux photographies et aux
vignettes des contenus, **jamais au logo** : il porte le nom de l'association et
sa devise en pixels, et désaturé de 40 % ces mots pâlissent jusqu'à
l'illisible. C'est la règle déjà écrite pour l'illustration d'« à propos » et
pour les couvertures — ce qui porte une information reste franc.

`formation-des-parents.jpg` reste inemployée, et pour une raison voisine :
c'est un montage de quatre vignettes légendées, à peu près illisible dans un
carré de 260 px.

#### Le contenu : ce qui a été ajouté, et ce qui a été dupliqué à dessein

`src/content/association.ts` gagne trois types — `AxeAssociation`,
`SoutienAssociation`, `PhotoAssociation` — et neuf champs : `chapeauSecond`,
`actionRecits`, `collage`, `axesOeil`, `axes`, `notesTitre`, `soutiens`,
`citation`, `citationRelance`. Tout vient des textes fournis par l'association
(`New section/Association Dave/contenu.txt`) ; rien n'est reformulé.

Trois blocs sont **lus depuis `sections`**, sans copie : le titre de la bande
olive (`sections[0].titre`), le titre et les deux paragraphes d'« Adhérer »
(`sections[1]`), et les trois mises en garde de la carte « Ce qu'il faut
savoir » (`sections[1].points`).

Les `axes` et les `soutiens`, eux, **redisent** `sections[0].points` et
`sections[2].points`, et c'est assumé : les deux formes ne se déduisent pas
l'une de l'autre — la puce de la V2 est une phrase, la carte de la V3 est un
titre **plus** un corps qui porte une clause de plus. Une fonction qui
fabriquerait l'une depuis l'autre découperait sur un deux-points et mettrait
une majuscule en minuscule ; elle marcherait sur ces six phrases et abîmerait la
septième, celle qui commencerait par un nom propre. La duplication vit à trente
lignes de son double, dans le même fichier, et disparaît le jour où la V2 de cet
écran est retirée.

Une clé d'interface ajoutée : `v2.assoContenusOeil` — « Nos contenus » / « Our
content ». Le titre et le texte du bloc, eux, restent ceux du produit
(`assoContenusTitre`, `assoContenusTexte`) plutôt que ceux du prototype : le
second dit qu'« une partie est en accès libre, le reste est réservé aux
adhérents », ce que la maquette ne pouvait pas savoir et ce qu'un visiteur a
besoin de lire avant de cliquer.

#### Une adaptation propre au téléphone

Le disque sauge du héros descend de 420 à 260 px sous 760 px de fenêtre, et se
retire dans le coin. À 430 px, un cercle de 420 posé à −80 du bord droit couvre
le titre **et** les deux paragraphes : ce n'est plus un accent de coin, c'est un
second fond. Le prototype mobile ne tranche pas — il remplace ces pages par un
gabarit générique sans décor — donc c'est l'intention du disque qui décide, et
son intention est d'habiller un angle.

#### Vérifications

`tests/composants/association-v3.test.tsx`, quinze tests. Thème sombre vérifié à
1440 px, téléphone à 430 px — zéro débordement horizontal.

Le relevé n'est pas resté dans un script jetable : la scène `association` — ses
soixante sondes et ses trois précautions — est entrée dans
`scripts/releve-v3.mjs`, l'outil partagé de la passe.

```bash
node scripts/releve-v3.mjs association
```

Captures : `.captures/maquette-association.png`, `app-association.png`,
`app-association-nuit.png`, `app-association-430.png`.

#### Trois livrets de plus, et ce qu'ils ont révélé — 7 septembre 2026

Demande du propriétaire : « charge aussi les autres livrets même s'ils n'ont
qu'une seule page ». Le dossier `conte d'afrique/livrets pedagogique/` en
portait trois de plus — une couverture de cahier de graphisme et deux feuilles
de coloriage, le perroquet et l'orange. Tous les trois font UNE page, et tous
les trois sont en A4 **debout**, quand le premier livret est couché.

Déposés par `scripts/deposer-livret.mjs` (qui prend désormais son orientation
en variable d'environnement, jamais du fichier), complétés et publiés par
`scripts/completer-livrets.mjs` — lequel passe par les **routes**
d'administration et non par la base : un script d'atelier qui contourne ses
propres garde-fous ne prouve rien de ce qu'il installe. Les niveaux et les
objectifs y sont écrits par la migration 0081, ce qui l'éprouve de bout en bout.

Ils ont fait apparaître **quatre défauts** que le catalogue d'alors ne pouvait
pas montrer :

| Défaut | Pourquoi il était invisible |
| --- | --- |
| « 1 **pages** » | aucun titre ne faisait moins de quatorze pages |
| « Gratuit · 1 **fiches** » | même cause, sur la pastille du panneau |
| une planche debout **recadrée** dans un cadre 16/11 | tous les livrets étaient couchés |
| des cartes voisines de **hauteurs différentes** | il n'y avait jamais deux cartes de livret côte à côte |

- **Le pluriel** se corrige par une SECONDE CLÉ, jamais par une règle : le
  singulier ne se fabrique pas en retirant un « s », et une troisième langue
  pourrait avoir un duel. Une clé par forme laisse chaque traduction répondre
  pour elle-même.

- **`contain` plutôt que `cover`** quand `orientation = 'portrait'`. Le
  prototype pose `cover` parce que ses fiches sont couchées ; il pose `contain`
  sur la fiche d'un livret (ligne 1202), là où la planche doit se lire en
  entier. C'est la même règle appliquée à ce qu'on a réellement — et
  l'orientation est LUE sur l'entrée, jamais déduite du fichier.

- **La chaîne de hauteur était rompue.** La carte porte `height: 100%` et sa
  rangée de pied `margin-top: auto` ; entre les deux, le `<li>` de la grille et
  le `<div>` de `Revele` sont en hauteur automatique. Un pourcentage contre un
  parent automatique ne résout rien et retombe silencieusement sur `auto` :
  mesuré, 404 px et 427 px côte à côte dans une rangée de 427. C'est le même
  piège que `height: 100%` contre `aspect-ratio`, et il se répare de la même
  façon — rendre la chaîne continue, plutôt que contourner le maillon manquant.

Le panneau de mise en avant a changé de critère au passage. « Le premier
offert » suffisait tant qu'il n'y en avait qu'un ; à quatre, il désignait la
dernière feuille déposée — une page de coloriage — pendant que le cahier de
quatre planches attendait dans la grille. Il prend maintenant **le plus fourni
des offerts**, au nombre de pages : c'est ce qu'on a de plus proche de « le
plus fourni », et c'est une valeur LUE. Inventer une colonne « mettre en
avant » aurait posé une règle éditoriale que personne n'a demandée.

Le jeu de démonstration compte donc **quatorze** titres — dix contes, quatre
livrets. `access.test.ts` et `schema.test.ts` sont passés de 11 à 14, avec la
raison écrite à côté du nombre.

### `Offres`, livré le 8 septembre 2026 — cinquième écran de la passe droite → gauche

Prototype, lignes 924 à 964. `src/components/v2/offres-v3.{tsx,module.css}`,
derrière `estV3()` dans `src/app/[langue]/offres/page.tsx`. La V2 reste en
place, intacte.

**Deux cartes plus un bandeau deviennent trois cartes.** La V2 alignait
l'abonnement et l'achat côte à côte, puis un tableau comparatif de cinq
lignes, puis un bandeau d'adhésion en bas de page. Le prototype met les
**trois** formules sur une seule rangée, au même gabarit, et ne grossit pas
celle du milieu : il la fait **sombre**. Les trois gardent le même rayon, le
même rembourrage, la même colonne — et c'est cet alignement qui rend les trois
prix comparables, ce qui est tout l'objet de la page.

Le tableau comparatif disparaît, et son information ne se perd pas : chaque
carte porte désormais **sa** limite, à la ligne, sous un filet. On lit ce
qu'une formule n'ouvre pas au moment où on lit son prix, et non trois écrans
plus bas.

#### Ce que la mesure a corrigé

| Défaut | Effet |
| --- | --- |
| `styles.question` n'existait pas dans la feuille | la classe était posée sur chaque question et rendait `class="undefined"`. C'est le défaut que `classes-css.test.ts` attrape ; ici c'est la **sonde** qui l'a trouvé la première, en ne trouvant rien à mesurer |
| `line-height: 1.15` sur le titre des questions | le prototype n'en pose pas, et son titre hérite du 1,12 d'Organic. Sept dixièmes de pixel, et tout le bloc descendait d'autant |
| La périodicité rapetissée à 17 px | le prototype écrit « 4 500 FCFA / mois » d'un seul tenant, au même corps. Un montant sans sa période n'est pas un prix qu'on peut comparer |
| `minmax(300px, 1fr)` et `minmax(280px, 1fr)` | mêmes minimums que le prototype, mais bornés par `min(…, 100%)` : un `minmax` dont le minimum dépasse la place disponible ne se replie pas, il déborde |

Après correction, les vingt-deux sondes tombent à zéro écart de forme. Ce qui
reste tient en trois familles, toutes attendues : la **gouttière** (les
conteneurs mesurent 1440 avec 128 px de rembourrage là où la maquette mesure
1240 avec 28 px et 100 px de marge — le contenu, lui, tombe au même pixel), le
`fontWeight` synthétique coupé par `tokens.css`, et les jetons d'encre du dépôt
là où la maquette écrit du blanc. Et une quatrième, propre à cet écran : les
**longueurs de texte**, puisque ni les prix ni les questions ne sont ceux de la
maquette.

#### Les prix sont ceux du serveur, et rien d'autre

Le prototype écrit « 2 000 FCFA », « 4 500 FCFA / mois » et « 10 000 FCFA /
an ». Ces trois nombres sont **inventés** — le dossier de maquettes le dit de
lui-même. Les vrais viennent de `subscription_plans` et `plan_prices` depuis la
migration `0068`, par `lireOffres`, et l'écran affiche `affichage` sans jamais
le recomposer : le franc CFA n'a pas de sous-unité, et une division par cent
écrite dans un composant multiplierait l'erreur par cent sur chaque ligne.

Deux phrases sont **lues** plutôt qu'écrites : « l'abonnement ne donne pas le
téléchargement » et « l'achat donne le fichier ». `donne_telechargement` est
rendu explicitement par l'API — toujours `false` d'un côté, `true` de l'autre —
et le test renverse les deux valeurs pour vérifier que l'écran suit vraiment.
Elles pourraient être en dur ; elles ne le sont pas, pour que la page ne
dépende pas de la mémoire de qui l'édite.

#### Quatre écarts au prototype

- **Le sur-titre de la carte sombre dit « Lecture en ligne »**, là où le
  prototype écrit « Le plus choisi ». Personne n'a encore choisi :
  `business_settings.abonnement_ouvert` vaut **faux** aujourd'hui, la formule
  n'est pas souscriptible, et une part de marché affirmée sur une formule
  fermée est une phrase fausse. Le sur-titre dit donc ce que la formule OUVRE.
- **Les questions ne sont pas celles du prototype.** Le dépôt en porte six,
  écrites par l'éditeur, dans `src/content/editorial.ts` — c'est la page
  `questions-frequentes`, celle vers laquelle mène déjà le pied. Celles du
  prototype annoncent des moyens de paiement qu'aucun prestataire réel ne sert
  encore : le projet tourne derrière `FakePaymentProvider`. Un lien mène à la
  page complète, que le prototype n'a pas.
- **La carte de lancement centre son contenu.** Le prototype n'a pas
  d'interrupteur commercial et ne dessine donc pas ce cas. Fermée, la carte
  porte quatre lignes là où ses voisines en portent quinze, et la grille les
  étire toutes trois à la même hauteur : alignée en haut, elle laissait quatre
  cents pixels de vide sous son texte — une carte qui a l'air d'avoir échoué à
  charger, sur le seul emplacement de la page qui attire l'œil.
- **La carte sombre a un filet, et le prototype n'en a pas.** Il n'a pas de
  thème sombre non plus. La nuit, l'olive de cette carte et le fond de la page
  ne sont séparés que par six unités de luminance : sans arête, la carte ne se
  lit plus comme une carte mais comme un **trou** entre ses deux voisines, qui
  ont leur filet. Une encre de chrome à 16 % dessine cette arête la nuit et
  disparaît le jour, où le contraste entre l'olive et la crème s'en charge.

#### Deux textes du dépôt ont été remplacés, et l'un était devenu FAUX

**Le titre et le chapeau de la page** prennent ceux du prototype — « Trois
façons de lire, sans piège », et le chapeau qui énumère les trois. Ceux du
dépôt disaient « **Deux** façons de faire » : écrits quand la page portait deux
cartes, ils contredisaient l'écran dès qu'il en porta trois.

⚠️ **Un point qui appartient au propriétaire :** « Trois façons de lire » se lit
pendant que l'abonnement est fermé, donc pendant qu'il n'y en a que deux à
souscrire. La carte du milieu le dit en toutes lettres, et le chapeau énumère
bien les trois. C'est la formule du prototype ; si elle doit changer le temps
du lancement, c'est une décision d'éditeur.

**Et une réponse de la FAQ décrivait une règle retirée.** Elle disait : « les
nouveautés sont d'abord vendues seules pendant quelques mois, puis rejoignent
l'abonnement. La date d'entrée est indiquée sur la fiche du conte. » Cette
règle a été supprimée le 2 septembre 2026 — la migration `0064` a effacé
`fenetre_nouveaute_jours`, `abonnement_a_partir_du` et
`fenetre_de_vente_ecoulee`, et le cahier des charges §3.2 porte la décision. La
réponse promettait donc une date d'entrée qui n'existe plus sur aucune fiche,
sur la page la plus lue avant un paiement.

Elle est remplacée, dans les deux langues, par ce qui est vrai : aucun délai,
et une inclusion qui se décide titre par titre. Un test tient la correction —
il échoue si la règle revient dans le texte.

#### Vérifications

`tests/composants/offres-v3.test.tsx`, quinze tests. Les deux états de
`abonnement_ouvert` ont été vus en vrai : le réglage a été ouvert le temps du
relevé, puis **remis à faux**, qui est sa valeur de démonstration. Thème sombre
vérifié à 1440 px, téléphone à 430 px — zéro débordement horizontal.

La scène `offres` est entrée dans `scripts/releve-v3.mjs` :

```bash
node scripts/releve-v3.mjs offres
```

Captures : `.captures/maquette-offres.png`, `app-offres.png` (abonnement
ouvert), `app-offres-lancement.png` (fermé, l'état réel),
`app-offres-nuit.png`, `app-offres-430.png`.

#### Deux corrections demandées par le propriétaire — 7 septembre 2026

> « normalement les champs devraient être dans le `admin/livrets/[id]` ? Tu as
> fait une erreur pour les filtres dans les livrets, elles ne doivent pas être
> pareil que celle des contes. »

**1. La fiche d'édition a deux adresses.** Elle reste UN écran — champs, prix,
manques, publication et versions linguistiques sont identiques pour les deux
supports, et en écrire deux aurait fait deux formulaires à tenir d'accord.
Ce qui manquait n'était pas l'écran, c'était l'adresse : un livret s'éditait
sous `/admin/contes/<id>`, ce qui se lit comme une erreur de rangement.

Le corps est donc parti dans `src/app/[langue]/admin/fiche-livre.tsx`, et les
deux `page.tsx` ne portent plus que la **garde, en toutes lettres**. Ce n'est
pas un style : `admin-architecture` lit les `page.tsx` du dossier et exige d'y
voir `exigerAdministrateur`. Une page qui se serait contentée de réexporter
l'autre serait passée sans qu'un lecteur puisse voir qu'elle est protégée —
et le test a refusé exactement cela, dès la première tentative.

Le `rayon` (`/contes` ou `/livrets`) est maintenant **lié** à chaque action de
la fiche, comme il l'était déjà pour la suppression. Il choisit une destination
de redirection ; posé en champ caché, il serait modifiable depuis le navigateur.
Chaque enregistrement revient donc à l'adresse d'où l'on vient — atterrir sur
l'autre ferait croire que le support a changé.

Les deux champs manquants — `niveau` et `objectifs` — s'affichent **pour les
seuls livrets**. Les objectifs se saisissent une phrase par ligne, et non sur
une ligne à virgules comme les thèmes : une phrase contient des virgules, et
« Développer la motricité fine, puis le tracé » aurait donné deux objectifs dont
aucun ne veut rien dire. L'ordre est conservé jusqu'en base — ce sont des
étapes ; la base retire les lignes vides mais ne trie pas.

Migration **0082** au passage : `admin_lire_livre` ne rendait pas les deux
colonnes. Écrivables sans être relisibles, elles auraient été **effacées au
premier enregistrement**, en silence — c'est la leçon de la 0062 sur
`type_document`, répétée en pratique avant d'être relue.

**2. Le rayon des livrets ne se filtre pas comme le catalogue.** Le prototype
est explicite : le catalogue offre thèmes, âge, accès et tri ; le rayon des
livrets offre **une recherche, des pastilles de NIVEAU, et le compte**. Rien
d'autre.

C'est le raisonnement de la 0071 pris dans l'autre sens. La région est sortie du
catalogue parce qu'une facette qui ne s'applique qu'à une partie du fonds fait
disparaître le reste dès qu'on clique dessus. Le niveau en est le symétrique
exact : il ne veut rien dire sur un conte, et il est LA question qu'on se pose
devant un livret — « est-ce pour ma classe ? ».

Migration **0083** : `catalog_facets` rend une facette `niveaux`, et
`catalog_list` accepte `p_niveau`. La facette compte des **jetons**, pas des
chaînes : `books.niveau` est composé — « PS · MS · GS » désigne trois classes —
et une facette bâtie sur la colonne telle quelle aurait rendu deux pastilles qui
se recouvrent, sans moyen de demander « tout ce qui convient à des MS ».
`niveaux_du_livre` éclate le composé, en **une** implémentation appelée par la
facette et par le filtre.

Le filtre est UN niveau à la fois, là où les thèmes se cumulent : on enseigne
dans une classe, et « MS » rend déjà « PS · MS · GS » comme « MS · GS ».

#### La leçon de la signature, apprise une troisième fois

La 0083 a **rejoué le défaut de la 0079** : `book_id` redevenu `id`, tout le
catalogue en « erreur interne », et aucune erreur levée — le client mappe par
position. Cause : son corps a été repris depuis le **fichier** de la 0079,
c'est-à-dire depuis la version fautive, alors que la 0080 la corrigeait.

La leçon n'était donc pas « reprendre le texte » — elle était **reprendre le
texte de la BASE**. `pg_get_functiondef(p.oid)` dit ce qui tourne ; un fichier
de migration ne dit que ce qui a été tenté ce jour-là, et entre les deux il peut
y avoir une corrective. La 0084 régénère la fonction depuis le texte de la 0080,
avec le seul paramètre ajouté en fin de liste et la seule clause insérée à côté
des autres.

Les deux versions différaient sur bien plus que le nom : `p_at` contre
`p_maintenant`, une taille de page par défaut de 20 contre 24, et pas de colonne
`type_document` — que l'application lit ailleurs.

### Écran 5 — la fiche d'un titre, commencée le 8 septembre 2026

Le prototype dessine **deux** fiches — celle d'un conte (lignes 500 à 600) et
celle d'un livret (1192 à 1275) — et elles ne se ressemblent pas : la première
met la couverture debout, penchée de deux degrés sur un halo sauge, et range
son contenu sous trois onglets ; la seconde couche la planche, y ajoute une
bande de vignettes, et déplie tout à plat.

#### Le relevé a montré une fiche de la V2 repeinte

Comme l'accueil avant elle. Le défaut le plus lourd était **structurel** :

| | Prototype | Ce qu'on avait |
| --- | --- | --- |
| le titre | dans la colonne de droite, à `x = 665,7` | en bandeau pleine largeur, à `x = 128` |
| le sur-titre | capitales sauge, un point de 6 px | une PASTILLE — fond, filet, rembourrage |
| la couverture | 502 px, rayon 20, penchée de −2° sur un halo sauge | 378 px, rayon 18, droite, sans halo |
| l'accroche | Figtree 19 px | Literata 17 px, interligne de lecture |
| la carte d'achat | rayon 30, rembourrage 28, filet d'1 px | rayon de panneau, 26, filet d'1,5 px |

Cinq cent trente-sept pixels d'écart sur le titre : ce n'est pas un réglage,
c'est une autre page. Et ce que ça change à la lecture n'est pas décoratif —
avec le titre en bandeau, le regard entre par une ligne de texte et redescend
chercher l'image, sur un produit dont l'argument de vente EST l'image.

#### Ce qui a été fait

Le balisage du titre est écrit **une fois** et rendu à l'une des deux places —
bannière sous la V2, colonne de droite sous Organic. Le recopier aurait donné
deux titres à garder d'accord, dont un seul est visible à la fois : une
divergence qu'aucun test de rendu ne verrait.

Le halo est un **pseudo-élément**, pas une boîte de plus : c'est une décoration
pure, et un lecteur d'écran n'a rien à y entendre. Il est posé sur le CADRE et
non sur l'image, qui est tournée — c'est le décalage entre les deux qui donne
l'objet posé de travers plutôt qu'une image inclinée.

Le sur-titre ne porte que l'**origine**, là où le prototype écrit « thème ·
origine » : le thème est déjà un lien dans le fil d'Ariane deux lignes plus
haut, et le répéter en ferait le seul mot de l'écran écrit trois fois.

#### Ce qui reste, et qui n'est pas mesuré

**Le serveur et Docker se sont arrêtés en cours de passe** — la machine a
redémarré. Les valeurs ci-dessus viennent du dernier relevé complet ; les
corrections qui ont suivi compilent, passent la porte et les 851 tests, mais
n'ont pas encore été **mesurées**. C'est la seule chose que ce dossier tient
pour acquise, et il ne devrait pas : à reprendre au premier relevé possible.

Restent à écrire :

- les **trois onglets** du conte — Extrait, Détails, Avis des lecteurs — avec
  la lettrine terra de 64 px sur le premier paragraphe ;
- les **trois lignes de preuve** à coches sauge sous les boutons d'achat ;
- toute la **fiche du livret** : planche couchée en `contain`, bande de
  vignettes cliquables, et les trois panneaux du bas (objectifs, guide
  d'utilisation, ce que contient le kit).

#### Soldé le 8 septembre 2026 — les deux fiches, mesurées à zéro écart

Le relevé n'était plus une supposition : `npm run dev` et Docker en marche,
`node scripts/releve-v3.mjs fiche fiche-livret` rend **50 sondes, aucun écart**.

##### Ce que la mesure a trouvé, et que la relecture n'avait pas vu

Six défauts, tous invisibles à l'œil parce qu'aucun ne casse quoi que ce soit :

| Défaut | Mesure | Cause |
| --- | --- | --- |
| le bandeau crème s'arrêtait sous le fil d'Ariane | 700 px de la fiche sur le mauvais fond | le prototype peint **une** section, du fil au bas des colonnes |
| la couverture plafonnée à 360 px | 477,7 attendus | `max-width` de la V2 jamais levée sous Organic |
| la colonne visuelle 90 px trop bas | 293 au lieu de 203 | `position: relative` sans reprendre le `top: 90px` du `sticky` |
| les colonnes 133 px trop bas | 336 au lieu de 203 | trois rembourrages cumulés (20 + 12 + 44) contre 34 |
| le fil d'Ariane dessiné en sur-titre | 7 propriétés | il portait `.oeil`, pas `.filAriane` |
| les boutons d'achat gardaient leur dessin de V2 | filet, encre, ombre | `:global(.boutonOcre)` ne peut **pas** viser une classe d'un autre module |

Le dernier mérite qu'on s'y arrête : les noms de classes d'un module CSS sont
hachés, et différemment dans chaque module. Une règle écrite dans
`boutique.module.css` pour `.boutonOcre` — qui vit dans `accueil.module.css` —
se compile, se charge, et ne s'applique à rien. Les deux boutons sont donc
désormais visés par `data-achat="principal" | "second"`, un attribut que rien ne
renomme, et qui dit en plus ce que la classe ne disait pas : lequel agit.

##### Deux finesses de rendu, mesurées valeur par valeur

- **Un nœud de texte nu perd le montant de ligne de son conteneur dès qu'une
  icône partage sa rangée.** Le bouton au cabas tombait à 56 px quand son
  voisin faisait 58. D'où `line-height: 22px`, écrit sur le seul bouton qui
  porte un tracé — l'écrire partout aurait poussé l'autre à 60.
- **Le prototype tient sa hauteur de 58 px d'un artefact** : ses nœuds de blanc
  entre l'icône et le libellé deviennent des éléments anonymes. C'est la seule
  propriété que le relevé fait diverger **exprès**, et c'est pour faire
  converger la cote qu'elle décide.

##### Le relevé sait désormais mesurer un écart, pas seulement une ordonnée

Deux bases ne portent pas les mêmes textes. Le résumé du jeu de démonstration
tient sur deux lignes là où celui du prototype en tient une : trente pixels, et
**neuf sondes** rapportaient le même faux écart sur une mise en page juste.

Deux options ont été ajoutées à `scripts/releve-v3.mjs` :

| Option | Ce qu'elle compare | Quand |
| --- | --- | --- |
| `relatifA: 'x'` | la distance au **bas** de la sonde `x` | entre deux frères — une marge |
| `dansA: 'x'` | la distance au **haut** de la sonde `x` | d'un enfant à son parent — un rembourrage |

Une tolérance de 0,2 px les accompagne : un écart relatif est la différence de
deux cotes déjà arrondies au dixième, et un dixième de bruit n'est pas un
défaut. Un demi-pixel en reste un.

##### Ce qui a été construit

| Fichier | Ce qu'il porte |
| --- | --- |
| `src/components/v2/fiche.tsx` | les deux mises en page, une seule lecture des droits |
| `src/components/v2/fiche-onglets.tsx` | les trois onglets du conte, motif ARIA complet |
| `src/components/v2/fiche-planches.tsx` | la bande d'aperçu d'un livret |
| `src/lib/content/planches.ts` | les planches, **par `servirPage`** — aucun second chemin de lecture |
| `src/components/v2/boutique.module.css` | ~700 lignes : bandeau, onglets, panneaux, livret |
| `src/design/tokens.css` | `--ombre-couverture-fiche`, la quatrième ombre |

Trois décisions à ne pas rejouer :

| Question | Réponse | Pourquoi |
| --- | --- | --- |
| L'auteur sous le titre ? | **Non — dans « Détails »** | Il repoussait l'accroche de 54 px, et avec elle toute la colonne. Le prototype ne met qu'une ligne sous le titre. Il n'est pas supprimé : il est rangé là où l'on va chercher ce genre de fait |
| Les onglets sur un livret ? | **Non** | On choisit un conte sur une histoire, un livret sur une **liste**. Cacher les objectifs derrière un onglet, c'est cacher l'argument |
| Les avis sur un livret ? | **Oui**, bien que le prototype ne les dessine pas | `book_reviews` ne lit pas `type_document`. Les retirer d'un support serait inventer une règle que la base ne porte pas |

##### Les écarts DÉCLARÉS, et pourquoi ils ne sont pas des défauts

Trois familles, écrites sonde par sonde dans le script :

1. **la gouttière** — le prototype borne son contenu par un bloc de 1240 px à
   rembourrage, nous le posons sur le bandeau. Même contenu à `x = 128`, autre
   boîte mesurée ;
2. **`fontWeight: 400 → 700`** — `tokens.css` coupe la synthèse en un point ;
   Caprasimo n'existe qu'au poids 400 ;
3. **le contenu** — un résumé plus long fait deux lignes. Ce n'est pas une cote
   de dessin.

S'y ajoutent trois écarts de **palette**, tous du même genre et tous mesurés :
le sur-titre sauge vaut 2,94:1 sur la crème quand le §5.3 en demande 4,5 —
`--second-encre` monte à 5,02:1 ; le blanc sur la terre cuite vaut 3,61:1,
l'encre 4,60 ; le prix prend la terre cuite **assombrie** du dépôt. La coche des
preuves, elle, garde le sauge du prototype : ce n'est pas du texte, et le seuil
d'un élément graphique est de 3:1 — le sauge y monte à 3,41.

##### Trois questions de DONNÉES, qui vous appartiennent

Elles ne bloquent rien, et aucune n'a été tranchée seul :

1. **`l-oiseau-de-feu` porte une description hors sujet** — un texte sur
   « ComeUp (ex-5euros.com) », vraisemblablement un essai de saisie resté en
   base. Il s'affiche tel quel dans l'onglet « Extrait ».
2. **Les quatre livrets sont gratuits et non achetables**, et leurs planches
   sont des WebP de **1 pixel** (44 octets). La fiche est juste, l'aperçu est
   blanc. Les sondes du prix et du bouton de panier attendent un livret payant.
3. **Les deux panneaux « Guide d'utilisation » et « Ce que contient le kit »
   n'ont pas de champ.** Le prototype les remplit avec du texte de
   démonstration ; le dépôt n'a que `objectifs`. Les inventer aurait engagé
   l'éditeur sur le contenu d'un kit — c'est une décision de schéma (deux
   colonnes, deux champs d'administration, une migration), pas de mise en page.

##### État de la porte

`npm run verify` **ne peut pas passer en entier** : une session parallèle écrit
le lecteur (`src/components/lecteur/scene-v3.tsx`, `plein-ecran.ts`), et son
travail en cours porte deux erreurs de typage, deux de lint et un `#fff`
littéral que `design-tokens` refuse. Rien de cela n'est dans le périmètre des
fiches.

Mesuré sur ce périmètre : `tsc` sans erreur, `eslint` sans erreur, `composants`
292/292, `unit` 542/544 — les deux chutes étant le `#fff` du lecteur.

⚠️ `tests/unit/middleware.test.ts` n'a pas été joué : il exige que **rien
n'écoute sur le port 3000**, et le serveur de développement tournait pour le
relevé.

### Écrans 6 et 7 — le règlement et le lecteur, livrés le 8 septembre 2026

Demande du propriétaire : « continue la refonte avec l'écran de paiement et
celui de lecture ; je voudrais que tu ajoutes un visionnage plein écran, rien
autour, juste avec des boutons pour avancer ou reculer — un peu comme le mode
de visionnage plein écran de PDF de Microsoft Edge ».

#### Le règlement — prototype, lignes 1339 à 1478

`src/components/v2/paiement-v3.{tsx,module.css}`, derrière `estV3()`. La V2
reste intacte, comme sur les cinq écrans précédents.

Le relevé montrait, là encore, une page de la V2 repeinte : colonne étroite
centrée, fil d'étapes, bandeau, total, moyens en pile. Le prototype tient en
**deux colonnes** — le choix et les champs à gauche, un récapitulatif COLLANT à
droite — et c'est cette colonne de droite qui fait la différence : on relit ce
qu'on paie au moment où l'on tape, sans remonter.

| | Prototype | Ce qu'on avait |
| --- | --- | --- |
| la mise en page | deux colonnes, `1.15fr / .85fr`, gouttière de 34 | une colonne étroite |
| le récapitulatif | carte collante à 100 px, couvertures, prix par ligne | un identifiant et un total |
| le titre | « Régler votre commande », 48 px | « Paiement », 30 px |
| les moyens | pilules de 22 px de rayon, filet de 2, pastille pleine | cartes-liens, filet d'1,5 |
| le bouton | dans la colonne de droite, pleine largeur | sous le formulaire |

**Le bouton de paiement est HORS du formulaire, et il le soumet quand même.**
L'attribut `form` d'HTML relie les deux colonnes sans une ligne de JavaScript :
l'écran garde la mise en page du prototype ET continue de régler sans script,
ce qui compte sur les connexions du §5.1.

##### Trois écarts au prototype, tous assumés

1. **Aucun champ de numéro de carte.** Le dossier en dessine quatre. Un
   prestataire réel impose des champs hébergés chez lui, précisément pour que
   le numéro ne touche pas le serveur du marchand : les dessiner apprendrait
   aux clients à taper leur carte sur ce domaine, puis il faudrait le défaire.
2. **Aucun champ de code promotionnel.** Il existe, et il vit une étape plus
   tôt, sur `/panier`. Ici la commande est ÉCRITE, son total est arrêté, et un
   webhook peut arriver dessus. Un champ qui ne pourrait rien changer est pire
   qu'un champ absent.
3. **Aucun « sous-total ».** L'obtenir demanderait d'additionner les lignes ou
   d'ajouter la remise au total — deux additions, dans un écran, sur des
   montants. Le total vient de la commande, la remise aussi, et la soustraction
   a déjà eu lieu en base.

Un quatrième, plus discret : les trois monogrammes prennent **un seul aplat**.
Le prototype peint chacun de la couleur de son opérateur, en blanc dessus ;
deux des trois échouent au seuil AA du §5.3, le jaune MTN très largement.

`lireCommandeDe` rend désormais les **lignes** de la commande — titre,
couverture, pagination, prix. Trois lectures, jamais une par ligne, et aucune
n'ouvre un droit : l'utilisateur a lui-même passé cette commande.

#### Le lecteur — prototype, lignes 642 à 672, plus le plein écran

`src/components/lecteur/scene-v3.{tsx,module.css}`. La logique — droits,
signatures, préchargement, reprise — n'a **pas** été recopiée : elle reste dans
`index.tsx`, qui rend l'une des deux scènes. Recopier aurait recopié l'encadré
qui distingue une session morte d'un refus d'achat, c'est-à-dire la règle la
plus délicate de l'écran.

Trois pièces communes en sont sorties : `etat.ts` (le type partagé),
`comportements.ts` (effacement et balayage), `plein-ecran.ts`.

**Le plein écran est le VRAI plein écran du navigateur**, pas un
`position: fixed`. Une surcouche couvre la page ; elle laisse la barre
d'adresse, les onglets et la barre des tâches. « Rien autour » veut dire rien
autour. Il a un prix, assumé : le navigateur exige un geste, on ne peut donc
pas ouvrir le lecteur en plein écran — et c'est très bien.

L'état vient de `document.fullscreenElement`, relu à chaque
`fullscreenchange`. Un état tenu par notre seul bouton se désynchroniserait dès
le premier Échap : la scène se croirait en plein écran alors qu'elle est
redevenue une page, avec ses commandes flottantes posées au milieu du site.

**L'effacement de l'interface a DÉMÉNAGÉ.** La V2 efface ses boutons au bout de
quatre secondes, en page. Le prototype ne le fait pas : ses commandes vivent
hors de l'image, et les effacer n'aurait rien libéré — l'image n'aurait pas
grandi d'un pixel. Le comportement vit désormais là où il gagne quelque chose :
en plein écran, exactement comme un lecteur de PDF.

Deux écarts : le bouton de plein écran **n'existe pas** si le navigateur ne
l'accorde pas (sur iPhone, Safari ne l'accorde qu'aux vidéos), et la mention
« les premières pages sont lisibles sans compte » ne paraît **que** sur un
extrait — sous cette phrase, un client qui a payé lirait qu'il lui reste à
payer.

#### Ce que les tests d'architecture ont attrapé, et c'est instructif

Trois fois, sur du code qui compilait et qui marchait :

- `classes-css.test.ts` — `styles.simulation` n'existait pas dans la feuille :
  la carte rendait `class="undefined"` ;
- `design-tokens.test.ts` — deux couleurs littérales, **toutes deux dans des
  COMMENTAIRES** qui citaient le prototype. Le test lit les commentaires, et il
  a raison : une valeur recopiée dans un commentaire finit recopiée dans une
  règle.

#### Ce qui reste

Le relevé automatique n'a **pas** pu être joué sur ces deux écrans : les pages
de démonstration ont été remplacées par des fichiers de 44 octets par la suite
d'intégration, et le lecteur affiche donc un plateau vide. Les mesures ci-dessus
viennent du prototype et des captures ; à confirmer au premier relevé possible.
