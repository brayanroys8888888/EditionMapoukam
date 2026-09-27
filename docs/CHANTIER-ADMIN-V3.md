# Chantier — l'administration au prototype V3

**Suivi vivant.** Mis à jour à chaque étape franchie. Pour le pourquoi des
décisions, voir `docs/REFONTE-V3.md` § « Le prototype d'administration ».

Référence : `design_handoff_admin_mapoukam/` — la maquette
`Admin EditionMapoukam v2.dc.html` et ses dix documents de spécification.

Exigence : **au pixel, à la dimension près.** Ce n'est pas une relecture, c'est
une mesure — `node scripts/releve-v3.mjs <scène>`, itérée jusqu'à écart nul.

---

## État d'ensemble

| | Écrans | Fait | Reste |
| --- | --- | --- | --- |
| Coquille partagée | 1 | 1 | 0 |
| Catalogue | 6 | 3 | 3 |
| Ventes | 4 | 2 | 2 |
| Communauté | 5 | 0 | 5 |
| **Total** | **16** | **6** | **10** |

---

## Coquille partagée

- [x] **Rail** — quatre groupes, onze entrées, 248 px, collant
- [x] **Barre supérieure** — fil d'Ariane, suivi en direct, action contextuelle
- [x] **Pied d'identité** — nom, rôle, déconnexion par Server Action
- [x] **Mesuré** — zéro écart de dimension sur les trois onglets relevés
- [x] **Relevé jouable hors ligne** — `scripts/releve-v3.mjs` pointe le
      prototype local, plus besoin d'URL servie ni de jeton

---

## Catalogue

- [x] **`dashboard` — Tableau de bord**
  - [x] carte d'alerte, bande de quatre chiffres, panneaux, ligne du calme
  - [x] mesuré — bande incluse (commande fabriquée puis retirée)
- [x] **`contes` — Contes (liste)**
- [x] **`livrets` — Livrets pédagogiques (liste)**
- [ ] **`add` — Ajouter un conte**
- [ ] **`detail` — Détail conte**
- [ ] **`livretAdd` — Ajouter un livret**
- [ ] **`livretDetail` — Détail livret**

---

## Ventes

- [x] **`commandes` — Commandes**
  - [x] migration `0089` — `orders.numero`, `orders.moyen_paiement`,
        `admin_lister_commandes` étendue (recherche + filtre devise),
        `admin_stats_commandes` pour la bande
  - [x] migration appliquée, registre réconcilié, types régénérés
  - [x] **jeu de démonstration : commandes et abonnements** — `scripts/demo-ventes.mjs`
  - [x] migration `0090` — compteurs par statut pour les segments
  - [x] bande de quatre chiffres
  - [x] barre d'outils — recherche, segmenté statut (avec compteurs),
        segmenté devise
  - [x] tableau en grille, 7 colonnes, `min-width: 820px`
  - [x] export CSV — `/api/admin/orders/export`, sur la liste filtrée
  - [x] scène de relevé `admin-commandes` — **zéro écart de dimension**
  - [x] migration `0091` — détail d'une commande, et motif de remboursement
  - [x] **panneau latéral** — piloté par l'URL, frise de suivi à trois états,
        confirmation de remboursement avec motif, mesuré à **écart nul**
  - [ ] adaptateur de paiement : normaliser le canal du prestataire
        (la colonne PAIEMENT affiche un tiret tant que rien ne l'écrit)
  - [ ] actions absentes du serveur : « Renvoyer l'e-mail », « Interroger le
        prestataire », « Envoyer un nouveau lien ». Le prototype les montre ;
        rien ne les implémente. Non simulées — un bouton qui ne fait rien est
        pire qu'un bouton absent.

> **Une collision de classes CSS, et le test qui la rattrapera.** Le tableau de
> bord possédait déjà `.panneau`, `.panneauEntete`, `.panneauTitre` et
> `.panneauCorps`. Le tiroir latéral a repris les quatre noms : un module CSS
> n'y voit pas de conflit, il émet les deux règles sous le même nom généré et
> **les propriétés fusionnent**. Le tiroir héritait d'un rembourrage ; surtout,
> les panneaux du tableau de bord recevaient son `position: fixed`.
>
> Ni le build, ni `tsc`, ni le test des classes `undefined` ne le voyaient —
> les deux noms existent. Seule la mesure l'a montré, et seulement sur le
> tiroir : le tableau de bord serait resté cassé jusqu'à ce qu'on l'ouvre.
>
> Classes renommées en `tiroir*`, et `tests/unit/classes-css-doublons.test.ts`
> refuse désormais qu'une classe redéclarée reprenne `position` ou `display` —
> les deux propriétés qui arrachent un élément au flux d'un autre. Le test a
> été éprouvé en rejouant la collision avant d'être gardé.

> **Trois cotes que la mesure a révélées, et qui valent pour tout le groupe.**
>
> 1. **Le chiffre KPI vaut 28 px sur 1,05 aux Ventes**, contre 30 px sur 1 au
>    tableau de bord. L'écart fait exactement 0,6 px — 30 moins 28 × 1,05 — et
>    toute la page glissait d'autant sous le bandeau, chaque sonde en dessous
>    rapportant un écart que rien n'expliquait.
> 2. **Le texte atténué vaut 58 % aux Ventes**, 55 % au Catalogue. Trois
>    centièmes d'opacité, invisibles à l'œil, mesurables au relevé.
> 3. **La note sous un tableau fait 13 px sur 720 px**, et notre `.note`
>    portait 14 px sur `--largeur-texte` avec 18 px de marge haute — sur les
>    SIX écrans qui l'emploient. Corrigé globalement : la mesure du prototype
>    donne la même cote sur les quatre écrans sondés.

> **Le blocage est levé.** `scripts/demo-ventes.mjs` peuple le jeu par le VRAI
> chemin — connexion, panier, `POST /api/orders`, puis événement signé vers le
> gestionnaire de webhooks. Rien n'est écrit en base par le script.
>
> Il a fallu lever trois obstacles, et chacun était une garde légitime :
>
> 1. **Le pays du moyen de paiement était figé à « FR »** dans le faux
>    prestataire, et ne se déplaçait que depuis un test en processus. Toute
>    commande locale sortait en euros, et la grille afrique — celle qui sert
>    la moitié du public du site — était invisible à qui ouvrait la boutique
>    à la main. D'où la route `POST /api/dev/pays`, sur le modèle de
>    l'horloge, couverte par `dev-guard.test.ts`.
> 2. **Un titre ne se rachète pas** : un achat accorde un droit permanent, et
>    l'API refuse en 409. Le script cloisonne donc le catalogue par acheteur.
> 3. **Zone affichée et zone d'encaissement divergentes** font refuser la
>    commande en `confirmation_requise` — refus juste, puisque le montant
>    change de grille entre ce que le client a vu et ce qu'on lui débite. Le
>    script pose donc `x-vercel-ip-country` et joue un vrai visiteur
>    camerounais, plutôt que de contourner la garde.
>
> **Résultat** : 7 commandes couvrant les quatre statuts et LES DEUX DEVISES,
> 3 abonnements sur les deux domaines dont un impayé, 6 droits accordés.
- [x] **`abonnements` — Abonnements**
  - [x] migration `0092` — liste étendue (nom, domaine, fin d'accès),
        compteurs par statut ET par formule, bande de chiffres, détail
  - [x] `fin_grace_impaye` EXTRAITE de `statut_effectif`, qui l'appelle —
        « Terminé le » et la bascule en échu viennent du même calcul
  - [x] bande de chiffres, bandeau des impayés, barre d'outils, tableau,
        ligne de santé — relevé `admin-abonnements`, **écart nul**
  - [x] tiroir en lecture seule, historique tiré de `payment_events` —
        relevé `admin-abonnement-panneau`, **écart nul**
  - [ ] **actions du tiroir — en attente d'une décision du propriétaire** :
        « Offrir un mois » (accès gratuit), « Résilier » à la fin de la
        période ou IMMÉDIATEMENT AVEC REMBOURSEMENT AU PRORATA, « Relancer »,
        « Annuler la résiliation ». Aucune n'existe côté serveur, et le
        prorata contredit l'arbitrage de la route de remboursement.

> **Ce que le prototype affirmait et qui était faux ici.** Le bandeau des
> impayés dit « Une relance part automatiquement à J+1 et J+4 ». Aucune relance
> n'existe dans ce dépôt : la phrase n'est pas reprise, sans quoi l'éditeur
> attendrait un règlement que personne n'a demandé. La durée de grâce, elle,
> est LUE dans les réglages au lieu d'être écrite « 7 jours ».
>
> **Deux défauts de Commandes, trouvés en mesurant Abonnements.** La colonne
> des montants reprenait la cote des prix du catalogue — 12,5 px normal au lieu
> de 14 px gras — et la seconde ligne des cellules était décollée de 5 px au
> lieu de 0, ce qui grandissait chaque rangée de deux pixels. Aucune sonde de
> Commandes ne visait ces endroits : l'écart nul annoncé ne l'était que sur ce
> qu'on mesurait. Corrigé, et trois sondes permanentes ajoutées.
>
> **Deux teintes absentes de notre palette** : le pêche `accent-100` des cartes
> d'avertissement et le brun `accent-800` de leurs chiffres. Elles sont dérivées
> de `--action` par `color-mix` — proches, pas identiques. Même famille que les
> cartes, déjà tranchée le 27 septembre.
- [ ] **`offres` — Offres d'abonnement**
- [ ] **`promos` — Codes promo**

---

## Communauté

- [ ] **`utilisateurs` — Utilisateurs**
- [ ] **`avis` — Avis des lecteurs**
- [ ] **`temoignages` — Témoignages du site**
- [ ] **`dave` — Association DAVE** (5 onglets)
- [ ] **`daveEdit` — Rédiger une publication**

---

## Décisions déjà prises

| Question | Décision | Quand |
| --- | --- | --- |
| Structure du tableau de bord | Adoptée, pas seulement repeinte | plan initial |
| Pied du rail | Carte d'identité et vraie déconnexion | plan initial |
| Pastilles de comptage au rail | Non | plan initial |
| Garde `estV3()` | Aucune — toutes les directions | plan initial |
| Fond des cartes | Le nôtre (clair), pas celui du prototype | 27 sept. |
| Trois jetons de chrome sombre | Inchangés — ils sont globaux | 27 sept. |
| Encre sur terracotta | Sombre — le blanc y donne 3,2:1 | 27 sept. |
| Libellés des statuts d'abonnement | Ceux du prototype à l'admin, ceux du lecteur côté lecteur | 27 sept. |
| Étiquette de statut | Garde sa bordure — WCAG 2.1 AA | 27 sept. |
| Moyen de paiement | Colonne ajoutée, remplie par le webhook | 27 sept. |
| Numéro de commande | Séquence lisible, « EM-1048 » | 27 sept. |

---

## ⚠️ L'ordre de travail, et pourquoi il compte

```bash
node scripts/demo-ventes.mjs      # peupler
#   construire, mesurer, itérer
node scripts/demo-ventes.mjs --vider
npm run verify                    # la porte, sur base propre
node scripts/demo-ventes.mjs      # repeupler pour la suite
```

**Quatre tests comptent les abonnements GLOBALEMENT** — « ne compte pas une
anomalie parmi les actifs », « n'est comptée ni en actif ni en expiré » — et
supposaient une base qui n'en portait aucun. Trois abonnements de démonstration
les font tomber, sans qu'aucun message ne parle de démonstration. C'est
exactement le piège que `CLAUDE.md` documente déjà pour les contes d'essai.

La suite finit d'ailleurs par tout effacer elle-même, en appelant
`dev_reset_demo_state` — mais trop tard pour les tests joués avant elle, et
l'ordre n'est pas garanti. Le peuplement ne survit donc jamais à un `verify` :
il faut le rejouer après.

---

## Trouvé en chemin, hors chantier

- **Aucune facture n'est jamais émise.** `emettre_facture` existe en base
  depuis l'origine et **personne ne l'appelle** — aucun appel dans `src/`. La
  route `/api/orders/[id]/invoice` ne fait que LIRE la table. Constaté sur le
  jeu de démonstration : quatre commandes payées, zéro facture. Conséquence
  visible ici : `admin_lister_commandes` rend `numero_facture` toujours nul.
  Non corrigé — c'est un défaut de la chaîne de paiement, pas de l'écran.

---

## Ce qui reste à trancher

- **Les montants du prototype sont en euros**, ceux du dossier public en FCFA,
  et les deux sont faux — `docs/maquettes/` le dit déjà. Le prix vient du
  serveur ; `prix.affichage` est lu, jamais reformaté.
- **Le prototype compte 18 titres et 4 livrets**, le jeu de démonstration en a
  moins. Les hauteurs de tableau et les positions sous la première rangée
  divergent, et c'est attendu. On mesure la boîte, la typographie, les
  rembourrages, les rayons et les couleurs.
