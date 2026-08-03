# Jetons de design — extraction et audit

**Extraits des treize maquettes, 2 août 2026.** Source unique de la direction
artistique. `src/design/tokens.css` sera généré depuis ce document à l'étape F1.

Les maquettes n'emploient **aucune variable CSS** : toutes les valeurs sont
écrites en dur, en ligne, et répétées d'un fichier à l'autre. C'est la situation
que la consigne 2 anticipait, et c'est ce qui rend cette extraction nécessaire.

---

## 1. Conformité à la direction artistique annoncée

| Annoncé | Trouvé | Verdict |
|---|---|---|
| Fond blanc chaud `#FFFDF9` | `#FFFDF9` | **Conforme** |
| Jaune d'action `#F2B134` | `#F2B134`, survol `#E5A526` | **Conforme** |
| Cinq couleurs d'origine | Cinq, une par région | **Conforme** |

**La direction artistique est tenue.** Les écarts ci-dessous sont mineurs et
tous signalés — aucun n'est tranché seul.

---

## 2. Neutres

| Jeton | Valeur | Usage |
|---|---|---|
| `--fond` | `#FFFDF9` | Fond général |
| `--fond-lecture` | `#FBF7F0` | **Lecteur uniquement** — voir écart É2 |
| `--fond-doux` | `#F6EFE3` | Survol de navigation, bandeaux secondaires |
| `--encre` | `#2A2018` | Texte principal, contour de focus |
| `--encre-douce` | `#6B5D4F` | Texte secondaire, libellés |
| `--bordure` | `#EDE4D6` | Séparateurs |
| `--bordure-forte` | `#E0D6C6` | Contours de contrôles |
| `--bordure-admin` | `#D9CDBA` | Boutons de la barre d'états (outil, non retenu) |
| `--souligne` | `#C9BCA9` | Soulignement de lien secondaire |

**Crème d'attention** — bandeau de réassurance et carte d'abonnement :

| Jeton | Valeur |
|---|---|
| `--creme` | `#FDF4E1` |
| `--creme-bordure` | `#F3E4C4` |
| `--creme-accent` | `#B08A2E` |

---

## 3. Action

| Jeton | Valeur | Usage |
|---|---|---|
| `--action` | `#F2B134` | Bouton primaire, pastilles numérotées, logo |
| `--action-survol` | `#E5A526` | Survol du bouton primaire |
| `--action-encre` | `#2A2018` | Texte **sur** le jaune |

> Le texte sur `#F2B134` est l'encre sombre, jamais du blanc. Le contraste
> `#2A2018` sur `#F2B134` vaut environ **9,6:1** — largement au-dessus de AA.
> Du blanc sur ce jaune tomberait à ~1,9:1, donc illisible. **Ne jamais
> inverser.**

---

## 4. Les cinq couleurs d'origine

Chaque tradition a sa couleur, déclinée en quatre valeurs. **Le texte utilise une
teinte plus sombre que la pastille** — c'est ce qui tient le contraste sur fond
clair, et c'est délibéré.

| Région | Accent (pastille) | Texte / bordure active | Fond de carte | Bordure de carte |
|---|---|---|---|---|
| **Afrique de l'Ouest** | `#1E8A5F` | `#197A53` | `#E4EFE7` | `#CFE2D6` |
| **Sahel** | `#2D5BA8` | `#2D5BA8` | `#E6E9EF` | `#D2D8E4` |
| **Afrique centrale** | `#D64545` | `#C13A3A` | `#FAE7E3` | `#F0D2CC` |
| **Afrique australe** | `#7B4B94` | `#7B4B94` | `#EFE8ED` | `#DFD2E0` |
| **Afrique de l'Est** | `#2BA8A0` | `#1B756F` | `#E6F3EE` | `#CFE7E2` |

Fonds de motif décoratif : `#D6E7DC`, `#DCE1EB`, `#F6DCD6`, `#E8DEEA`, `#D8ECE7`.

> **Le Sahel et l'Afrique australe n'ont qu'une teinte** (accent = texte), les
> trois autres en ont deux. Ce n'est pas nécessairement une erreur — `#2D5BA8` et
> `#7B4B94` sont déjà assez sombres — mais la structure des jetons doit rester
> uniforme : cinq régions × quatre rôles, quitte à ce que deux valeurs soient
> égales. Sinon un composant devra traiter deux cas.

### Le vrai problème, et il est côté API — avec sa preuve

**La couleur est indexée sur `origine_culturelle`, qui est une colonne de texte
libre.** Rien en base ne restreint ses valeurs, et l'interface doit y associer
une couleur.

**Ce n'est pas une inquiétude théorique : la divergence est déjà dans le dépôt.**

| Fichier | Chaîne | Apostrophe |
|---|---|---|
| `supabase/seed.sql:45` | `Afrique de l'Ouest` | `U+0027`, droite |
| `tests/integration/publication-validation.test.ts:45` | `Afrique de l’Ouest` | `U+2019`, typographique |

Vérifié à l'octet : `342 200 231` dans le second, rien d'équivalent dans le
premier. **Deux chaînes distinctes pour la même région**, aujourd'hui, sans que
rien ne le signale — parce qu'aucune contrainte ne les compare.

Sur ce socle, un conte saisi avec l'une des deux formes reçoit sa couleur et
l'autre non. Un éditeur qui écrirait « Afrique de l'ouest » ou « Afrique Ouest »
obtiendrait un conte **sans couleur**, ou pire, une couleur de repli qui ment sur
son origine.

**Ma proposition, à traiter en F0 :** un type énuméré `origine_culturelle` en
base, avec ces cinq valeurs, la migration qui aligne le corpus, et le
rapprochement des deux orthographes existantes. La couleur devient alors une
propriété d'une valeur close, et un titre sans origine valide ne peut plus être
publié — la validation de publication s'en charge déjà pour les autres champs.

**Confirmez avant que je l'écrive** : c'est une contrainte de plus sur le
catalogue éditorial, et elle interdit d'ajouter une sixième région sans
migration. C'est le prix d'une couleur qui ne ment pas.

---

## 5. Typographie

| Famille | Rôle | Où |
|---|---|---|
| **Fraunces** | Titres, prix, logo | Partout **sauf l'administration** |
| **Nunito** | Interface, corps, contrôles | Partout |
| **Literata** | Texte de lecture | Fiche livre, Lecteur, Offres, Pages de contenu |

Fraunces est appelé avec `font-variation-settings: 'SOFT' 100, 'WONK' 1` —
la variante douce et légèrement fantasque. **À reproduire exactement** : sans
ces réglages, la police perd le caractère qui motive son choix.

Échelle relevée : 12, 13, 14, 15, 16, 17, 18, 19, 22, 24, 30 px, plus des titres
fluides `clamp(26–28px, 3.2–4.4vw, 34–54px)`.

Graisses : 400, 600, 700. Interlignes : 1.06 (titre géant), 1.2 (titre de carte),
1.45–1.55 (corps).

---

## 6. Formes et mouvement

| Jeton | Valeur |
|---|---|
| `--rayon-controle` | `8px` — boutons d'en-tête, champs |
| `--rayon-bouton` | `10px` — boutons d'action |
| `--rayon-carte` | `16px` — cartes de conte et de région |
| `--rayon-panneau` | `18–20px` — cartes d'offre, bandeau d'accueil |
| `--rayon-image` | `9–11px` |
| `--largeur-page` | `1200px` |
| `--focus` | `3px solid #2A2018`, `outline-offset: 3px` |

Transitions : `.15s` pour les couleurs, `.18s` pour les transformations de carte
(`translateY(-4px)` au survol).

**Toutes les maquettes coupent les animations sous `prefers-reduced-motion`.**
À conserver — c'est un critère AA.

---

## 7. Écarts relevés — à trancher, pas tranchés

### É1 — Deux verts de survol de lien

`Accueil.dc.html` : `a:hover { color: #1E8A5F }`.
**Les onze autres** : `a:hover { color: #197A53 }`.

L'accueil est l'exception. **Je retiens `#197A53`** sauf avis contraire — c'est
la valeur majoritaire, et la plus sombre, donc la plus contrastée.

### É2 — Le lecteur a son propre fond

`#FBF7F0` au lieu de `#FFFDF9`. Plus chaud, moins lumineux.

Je le lis comme **intentionnel** : une surface de lecture prolongée pour un
enfant n'est pas une surface de navigation. Je le garde comme jeton nommé
`--fond-lecture` plutôt que de l'aligner. **Confirmez** — si c'est un accident de
maquettage, il faut le supprimer, pas le canoniser.

### É3 — L'administration abandonne Fraunces

`Admin contes.dc.html` ne charge que Nunito, et son `outline-offset` vaut `2px`
au lieu de `3px`.

Cohérent avec un back-office dense, mais **le focus doit rester à `3px`** :
c'est un critère d'accessibilité, pas un choix esthétique. Je réaligne
l'`outline-offset` et je conserve l'absence de serif.

### É4 — `prefers-reduced-motion` inégal

Certaines maquettes coupent `transition` **et** `animation`, d'autres seulement
`transition`. Je retiens la forme la plus complète partout.

### É5 — Les prix des maquettes contredisent le backend

| | Maquette | Backend (`env.ts`) | Spécification §3.3 |
|---|---|---|---|
| Abonnement mensuel | **6,90 €** | `799` → 7,99 € | 7,99 € |
| Conte à l'unité | **3,90 €** | `499` → 4,99 € | — |

**Sans conséquence technique** : l'extension M5 fait venir tous les prix de
`GET /api/offers`, et aucun montant ne sera écrit dans un composant. Un test
d'architecture le garantira.

**Mais la question commerciale reste ouverte :** la grille a-t-elle changé, ou
les maquettes portent-elles des valeurs de démonstration ? Si elle a changé, ce
sont `PRICE_SUBSCRIPTION_MONTHLY` et `PRICE_UNIT_DEFAULT` qu'il faut corriger, et
`docs/cahier-des-charges.md` que je ne peux pas modifier.

---

## 8. Deux points hors jetons, à votre attention

### P1 — Les polices sont chargées depuis Google Fonts, et ce n'est pas tenable

Les treize maquettes appellent `fonts.googleapis.com` et `fonts.gstatic.com`.

**Deux raisons de ne pas le reprendre**, et la seconde suffirait :

1. **C'est un service externe**, que le mode de développement exclut.
2. **C'est un défaut de performance pour l'audience visée.** Deux
   préconnexions plus une feuille de style bloquante plus trois familles
   variables, sur la connexion lente que §5.1 décrit comme la condition réelle
   d'une partie du public. C'est exactement ce que Lighthouse mobile sanctionne,
   et le seuil de 85 est un critère d'acceptation de F14.

**Ce que je propose** — le dispositif déjà éprouvé du projet : embarquer les
trois familles sous `vendors/fonts/`, comme `NotoSans-Regular.ttf` l'est pour le
filigrane. Fraunces, Nunito et Literata sont toutes trois sous **SIL Open Font
License 1.1**, permissive et compatible avec la règle de licence. Sous-ensembles
latins, `woff2`, `font-display: swap`, préchargées.

Bénéfice secondaire, celui de §5 sexies : une police embarquée rend le rendu
**reproductible**. La version servie par le CDN changera ; celle du dépôt, non.

### P2 — Une marque qui n'est nulle part dans la spécification

Les maquettes portent **« Sous le Baobab »** et `bonjour@souslebaobab.com`. Le
dépôt s'appelle `EditionMapoukam`, et `docs/cahier-des-charges.md` ne nomme
aucune marque.

Je ne tranche pas : un nom commercial est une décision qui vous appartient. Mais
il doit être fixé **avant F2**, où il entre dans l'en-tête, le pied de page, le
titre de chaque page, les emails et les métadonnées de référencement. Le changer
ensuite touche partout.

En attendant, il vivra dans une **clé de traduction unique**, jamais écrit en dur
dans un composant.
