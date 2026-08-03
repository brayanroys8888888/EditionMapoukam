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

| Fichier | Écran | États intégrés | Étape |
|---|---|---|---|
| `Accueil.dc.html` | Page d'accueil | `showPrices`, `showReassurance`, `revealOnScroll` | F2, F4 |
| `Catalogue.dc.html` | Catalogue | **`complet` / `lancement` / `vide`** | F4 |
| `Fiche livre.dc.html` | Fiche d'un conte | — | F5 |
| `Lecteur.dc.html` | Lecteur en ligne | `lecture` + autres | F6 |
| `Espace personnel.dc.html` | Bibliothèque, abonnement, compte | plusieurs | F7 |
| `Tunnel achat.dc.html` | Panier → paiement → confirmation | plusieurs | F8 |
| `Offres.dc.html` | Page des offres | `<details>` pour la FAQ | F9 |
| `Pages de contenu.dc.html` | Pages éditoriales | accordéons, **feuille d'impression** | F10 |
| `Admin contes.dc.html` | Administration — liste des contes | — | F11 |
| `Admin ajout conte.dc.html` | Administration — ingestion | — | F11 |
| `Admin statistiques.dc.html` | Administration — statistiques | — | F13 |
| `Comptes.dc.html` | Connexion / inscription | plusieurs | F3 |

**Les trois états du catalogue sont dans la maquette**, pilotés par
`data-mode="complet|lancement|vide"`. C'est exactement ce que la mission
demandait ; il n'y a rien à inventer.

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
