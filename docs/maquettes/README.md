# Maquettes — provenance et mode d'emploi

**Source : projet Claude Design « Plateforme de contes africains illustrés ».**
`https://claude.ai/design/p/63c13153-9914-433a-8bbc-78a63cb89adb`

Treize écrans, plus `support.js` (runtime de l'outil de maquettage) et 24
illustrations de démonstration.

---

## Pourquoi ce dossier ne contient pas les fichiers HTML

**Parce que je ne peux pas garantir une copie verbatim.**

Le seul canal disponible fait transiter chaque fichier par mon contexte, où il
arrive avec ses entités HTML échappées (`&amp;` `&lt;` `&gt;`), que je devrais
décoder puis réécrire à la main. Sur 460 Ko de HTML à styles en ligne, c'est
exactement la **réécriture de mémoire** que `docs/PLAN.md` §5 decies interdit —
la règle posée après qu'une fonction SQL recopiée de mémoire eut perdu un garde
qu'aucun test ne couvrait.

La règle exige une extraction par script, avec un diff de contrôle. **Ce
transport n'en a pas.** Une entité mal décodée corromprait silencieusement la
référence visuelle, et rien ne le signalerait.

### Ce qui est fait à la place

| Quoi | Où |
|---|---|
| Les jetons de design, extraits et vérifiés | `JETONS.md` — **source unique**, c'est ce qui compte |
| L'inventaire des treize écrans et de leurs états | ci-dessous |
| Le HTML lui-même | reste **autoritatif dans Claude Design**, lu en entier à l'étape qui le consomme |

Lire une maquette au moment de bâtir l'écran correspondant coûte le même nombre
de jetons qu'aujourd'hui, mais dans une session qui a le contexte de cet
écran-là. Et la maquette lue est **la version courante**, pas une copie qui aura
divergé.

> **Si vous préférez malgré tout une copie dans le dépôt**, dites-le : c'est
> possible, mais alors je veux le dire clairement — ce sera une copie que je ne
> peux pas certifier identique à l'original.

---

## Les treize écrans

> **Plusieurs écrans portent des variantes. Aucune ne doit être manquée : ce
> sont des cas métier, pas des habillages.** Le relevé ci-dessous est exhaustif,
> établi en lisant les commutateurs de chaque fichier — jamais de mémoire.

| Fichier | Écran | Variantes | Étape |
|---|---|---|---|
| `Comptes.dc.html` | Authentification | **4 écrans** : `inscription`, `connexion`, `oubli`, `verification` | F3 |
| `Catalogue.dc.html` | Catalogue | **3 modes** : `complet`, `lancement`, `vide` — plus une variante **par carte**, voir ci-dessous | F4 |
| `Fiche livre.dc.html` | Fiche d'un conte | **3 blocs d'action** : `visiteur`, `abonne`, `achete` | F5 |
| `Lecteur.dc.html` | Lecteur en ligne | **4 modes** : `lecture`, `reprise`, `fin`, `mobile` | F6 |
| `Espace personnel.dc.html` | Espace personnel | **2 axes INDÉPENDANTS** : bibliothèque (`remplie`, `vide`) × abonnement (`actif`, `essai`, `expire`, `annule`) = **8 combinaisons** | F7 |
| `Tunnel achat.dc.html` | Tunnel d'achat | **4 écrans** (`panier`, `paiement`, `confirmation`, `vide`) × **2 formats** (`desktop`, `mobile`) | F8 |
| `Offres.dc.html` | Page des offres | **2 modes** : `ouvert`, `lancement` — « abonnement pas encore ouvert » | F9 |
| `Pages de contenu.dc.html` | Pages éditoriales | **5 pages** : `apropos`, `faq`, `cgv`, `confidentialite`, `contact` — plus une **feuille d'impression** | F10 |
| `Accueil.dc.html` | Page d'accueil | 3 interrupteurs : `showPrices`, `showReassurance`, `revealOnScroll` | F2, F4 |
| `Admin contes.dc.html` | Admin — liste des contes | Aucune. **C'est le patron des quatre écrans sans maquette** | F11 |
| `Admin ajout conte.dc.html` | Admin — ingestion | Aucune | F11 |
| `Admin statistiques.dc.html` | Admin — statistiques | Aucune | F13 |

### La variante du catalogue qui n'est pas un mode

Les trois modes de page — `complet`, `lancement`, `vide` — sont les trois états
que la mission demandait. **Mais la distinction abonné/acheteur y vit ailleurs :
sur chaque carte.**

Chaque `<article>` porte `data-acces="abonnement|achat|gratuit"`, et sa dernière
ligne change en conséquence :

| `data-acces` | Ce qu'affiche la carte |
|---|---|
| `achat` | Le prix — « 3,90 € » |
| `abonnement` | **« Avec l'abonnement »**, sans montant |

C'est une propriété **du titre**, pas une propriété de l'utilisateur. À
l'implémentation, elle se lit sur `inclus_abonnement`, `disponible_achat` et
`prix` — et l'état de l'utilisateur, lui, vient de `acces.reason`. Les deux se
combinent : un abonné devant un titre `achat` voit un prix, un visiteur devant
un titre `abonnement` voit « Avec l'abonnement ».

**Les confondre donnerait un catalogue qui ment dans les deux sens** : un prix
affiché à qui n'a rien à payer, ou « inclus » promis à qui devra acheter.

### Ce que l'espace personnel impose

Huit combinaisons, et elles ne sont pas décoratives : un abonnement `expire` avec
une bibliothèque `remplie` est **le cas métier central du projet** — l'abonnement
tombe, les achats restent. C'est le bug classique du domaine, et la maquette en
fait un état à part entière.

### Le patron de l'administration

La barre latérale de `Admin contes.dc.html` énumère six entrées avec leur
effectif : Contes, Commandes, Abonnements, Utilisateurs, Codes promo,
Statistiques. **Quatre d'entre elles n'ont pas de maquette**, et se construisent
depuis ce patron et depuis l'API, comme convenu — même densité, mêmes pastilles
de filtre, même tableau, même pagination.

**Les quatre écrans d'administration sans maquette** — comptes, commandes,
abonnements, codes promo — sont bâtis depuis le patron de `Admin contes.dc.html`
et depuis l'API, comme convenu. Ils ne sont pas redemandés.

---

## Comment lire une maquette

Format propriétaire de l'outil, à connaître avant d'ouvrir :

| Élément | Sens |
|---|---|
| `<x-dc>` | Racine du composant |
| `<helmet>` | Ce qui va dans le `<head>` — titre, polices, styles globaux |
| `<sc-if value="{{ prop }}">` | Bloc conditionnel piloté par une propriété d'éditeur |
| `style-hover="…"` | Styles de survol — **attribut non standard**, à traduire en CSS |
| `data-mode="…"` | Variante d'état, commutée par la barre grise « Maquette · états » |
| `data-reveal` | Apparition au défilement, désactivée sous `prefers-reduced-motion` |
| `<script type="text/x-dc">` | Logique de l'éditeur — **jamais** à reprendre |

**La barre grise « Maquette · états » en haut de page appartient à l'outil.**
Elle ne fait pas partie de l'interface et ne doit pas être reconstruite.

---

## Écart connu — les prix affichés sont faux

| | Maquette | Autorité |
|---|---|---|
| Abonnement mensuel | **6,90 €** | **7,99 €** — `PRICE_SUBSCRIPTION_MONTHLY`, et §3.3 de la spécification |
| Conte à l'unité | **3,90 €** | **4,99 €** — `PRICE_UNIT_DEFAULT` |

Ces montants ont été **inventés par l'outil de maquettage**. La spécification et
`src/lib/config/env.ts` font foi ; rien n'est à changer côté code.

> **Pourquoi c'est écrit ici et pas seulement dans `JETONS.md`.** Les maquettes
> continueront d'afficher 6,90 € tant qu'elles ne seront pas régénérées.
> Quelqu'un comparera un jour l'interface à la maquette et conclura que c'est
> **l'interface** qui est fausse — puis « corrigera » un prix dans un composant.
> Ce serait une seconde source de prix, exactement ce que la décision D4 a
> supprimé pour les livres.
>
> Les montants viennent tous de `GET /api/offers` et de `prix.affichage`. Un test
> d'architecture de l'étape F9 échoue sur tout littéral ressemblant à un prix
> dans les composants d'offre.

Si la grille tarifaire évolue réellement, elle évoluera dans `business_settings`
ou dans l'environnement — jamais dans un composant, et jamais parce qu'une
maquette le disait.

---

## Ce que ces maquettes ne portent pas

Rappelé pour que personne ne le cherche : **ni état applicatif, ni gestion
d'erreur, ni internationalisation, ni aucune connaissance de l'API.** Les prix,
les compteurs (« 60 contes », « 24 contes »), les titres et les couvertures sont
des remplissages. Les valeurs réelles viennent de l'API, sans exception.

`support.js` (69 Ko) est le runtime de l'outil de maquettage. Il n'a aucune
valeur pour l'implémentation.
