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
| Ventes | 4 | 4 | 0 |
| Communauté | 5 | 1 | 4 |
| **Total** | **16** | **9** | **7** |

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
  - [x] **deux actions sur quatre** — décision du propriétaire du 27 sept.
        « Résilier à la fin de la période » et « Annuler la résiliation »
        passent par le prestataire, puis par l'événement signé. Nouvel
        événement `abonnement.repris` dans la machine à états.
  - — **écartées, et pourquoi** (décision prise, pas un reste à faire) : « Offrir un mois » allongerait la période
        chez nous pendant que le prestataire prélève selon son calendrier —
        on se désynchronise sans que rien ne le signale. « Résilier au
        prorata » contredit l'arbitrage de la route de remboursement.
        « Relancer » suppose un système de relance qui n'existe pas.

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
- [x] **`offres` — Offres d'abonnement**
  - [x] grille de cartes en `auto-fit minmax(min(100%, 330px), 1fr)` à la place
        du tableau : quatre formules ne se balayent pas, elles se comparent —
        relevé `admin-offres`, **écart de dimension nul**
  - [x] tiroir d'édition et de création, prix par zone, mise en vente
  - [x] **« La plus choisie » est COMPTÉE, jamais décrétée** — dérivée du
        nombre d'abonnements, une au plus par domaine, et retirée à égalité
        comme à zéro abonné. Extraite dans `plus-choisie.ts` pour être
        éprouvée : 7 tests, un par mensonge interdit
  - [x] la suppression reste offerte, éteinte dès qu'un abonnement s'y rattache
        — le prototype ne la porte pas, et sans elle une offre saisie par
        erreur ne quitterait plus jamais l'écran
  - — **trois champs du prototype écartés**, chacun pour une raison nommée :
    - « Ce que l'offre ouvre / n'ouvre pas », liste éditable par formule. **La
      page publique ne lit pas la base pour ces puces** : elles sont figées en
      internationalisation, une fois par NATURE de carte (abonnement, adhésion,
      achat à l'unité), pas par formule. Un éditeur les remplirait sans que le
      site change. Les rendre éditables demande de refondre la page publique —
      **décision attendue du propriétaire**
    - « Appliquer le nouveau prix aux abonnés actuels » — aucun des deux
      prestataires ne fait de prélèvement récurrent, l'interrupteur
      n'appliquerait rien. Même famille que « Offrir un mois »
    - « Aperçu sur le site » à chaque frappe — il montrerait une carte que le
      site ne rend pas ainsi tant que le premier point n'est pas tranché ; un
      aperçu faux est pire qu'un aperçu absent
  - — **périodicité et domaine figés après création** : la base le refuse
        (migration `0068`), et le refus est juste — un abonné a souscrit à une
        périodicité. Le prototype met le segmenté dans les deux cas ; ici il
        n'apparaît qu'à la création
- [x] **`promos` — Codes promo**
  - [x] migration `0093` — `promo_codes.debut_le`, `statut_promo` (unique
        implémentation), liste filtrable, compteurs par statut
  - [x] **règle métier nouvelle** : un code peut être PROGRAMMÉ. C'est le
        miroir exact d'`expire_le`, et le prototype l'exige — son statut
        « Programmé » n'a pas de sens sans date de début. Fenêtre
        `[début, fin[`, comme partout ailleurs dans le schéma.
  - [x] barre d'outils sur UNE rangée, tableau à sept colonnes, pastille de
        code à chasse fixe, jauge d'utilisations — relevé `admin-promos`,
        **écart nul**
  - [x] tiroir de création, avec la date de début et la portée dite en clair
  - [ ] **portée, limite par client, « première commande » — en attente d'une
        décision du propriétaire.** Ces trois-là changent ce qu'un code
        COUVRE, donc le calcul de la remise, donc ce qui est facturé. Le
        cahier des charges ne les porte pas.
  - [ ] codes à TIRET (`DAVE-ATELIER` au prototype) : la route impose lettres
        et chiffres, règle délibérée — « un code se dicte au téléphone ».

> **Deux défauts silencieux trouvés en construisant cet écran.**
>
> 1. **`pattern="[A-Za-z0-9-]+"` empêchait tout envoi du formulaire.** Les
>    navigateurs compilent l'attribut avec l'indicateur `v`, où un tiret nu en
>    fin de classe est ambigu : le motif est refusé, `checkValidity` LÈVE, et
>    le formulaire ne part jamais — sans message, sans erreur visible, sans
>    rien dans le journal du serveur. Introduit par moi en voulant autoriser
>    les codes à tiret du prototype. `tests/unit/motifs-html.test.ts` compile
>    désormais chaque `pattern` comme le navigateur le fait.
>
>    Leçon plus large : mon motif était plus PERMISSIF que la route. Un client
>    plus permissif que le serveur est un piège — le formulaire accepte, la
>    route refuse, et l'éditeur reçoit une erreur pour une saisie que l'écran
>    lui a laissé faire.
>
> 2. **`create or replace` avec un paramètre de plus crée une SURCHARGE.** Les
>    deux fonctions ont coexisté, et un appel à quatre arguments est devenu
>    ambigu — « function is not unique », sur un chemin qui marchait la veille.
>    C'est le piège que la migration 0088 avait déjà consigné pour
>    `create_order` ; il s'est reproduit, et le test l'a attrapé.
>
> **Trois refus de code promotionnel n'avaient aucune traduction** —
> `inactif`, `devise_incompatible`, `zone_incompatible`. Les écrans du panier
> composent la clé à la volée et `traduire` replie sur la clé BRUTE : un client
> qui saisissait un code désactivé lisait « panier.refus_promo_inactif » sur la
> page de son panier. Défaut préexistant, comblé, et
> `tests/unit/refus-promo-traduits.test.ts` lit désormais les raisons dans le
> TYPE pour qu'une huitième ne puisse pas passer sans sa phrase.

---

## Communauté

- [ ] **`utilisateurs` — Utilisateurs**
- [ ] **`avis` — Avis des lecteurs**
- [ ] **`temoignages` — Témoignages du site**
- [x] **`dave` — Association DAVE** — relevé `admin-association`, **écart de
      dimension nul**
  - [x] en-tête à emblème (logo 56 px, rayon 16, marge 5) — nouveau paramètre
        `embleme` du gabarit, et un groupe de titre qui n'a rien changé aux
        onze autres écrans (`titre ✓` vérifié sur promos et offres)
  - [x] gouttière de colonne à **24 px** : une valeur que notre échelle n'a
        pas, et que le prototype n'emploie que sur cet écran
  - [x] bande de quatre chiffres — migration `0095`,
        `admin_stats_association`, comptés **en base contre `app_now()`** :
        une fenêtre de trente jours comparée en TypeScript répondrait selon
        l'horloge du serveur de rendu. 6 tests, dont les **deux bords** de la
        fenêtre séparément
  - [x] liste des publications à la grille du prototype
        (`minmax(0,1fr) 100px 64px 52px 40px 16px`, `min-width: 500px`)
  - [x] onglet Adhérents, servi par `admin_lister_abonnements` filtré sur le
        domaine — aucune migration de plus
  - [x] la rédaction ne s'ouvre plus que sur la publication cliquée : l'écran
        dépliait jusque-là les huit contenus et leurs huit formulaires
  - — **trois onglets sur cinq écartés** : Agenda, Commentaires, Campagne.
      Aucun n'a de données ni de spécification — le cahier des charges §F4 bis
      décrit un espace qui **« ne sert que du texte »**, sans agenda
      d'ateliers, sans fil de commentaires et sans campagne chiffrée par
      région. Les dessiner vides aurait annoncé trois fonctions absentes
  - — **deux chiffres de la bande remplacés** : « À modérer » et « Prochaine
      publication » supposent une modération et une programmation qui
      n'existent pas (§F10 bis ne connaît que `brouillon` et `publie`). À leur
      place, les **brouillons** et la **dernière parution** — même question,
      chiffres réels
  - — **colonnes VUES et COMMENTAIRES remplacées** par les langues et la mise
      à la une : aucune mesure d'audience n'est posée, et il n'y a pas de
      commentaires. Les largeurs, elles, ne bougent pas
  - — **pastille de type à une seule teinte** : le prototype en a quatre, une
      par FORMAT (compte rendu, récit, fiche PDF, replay). Nous n'avons pas de
      formats mais six catégories thématiques ; six teintes inventées seraient
      de la décoration qui ressemble à de l'information. Le « Fiche PDF » du
      prototype est d'ailleurs **interdit par la spécification** : « aucun
      téléchargement, aucun fichier »
  - — **la liste prend toute la largeur** : le prototype lui laisse 821 px et
      garde 300 px pour « Rythme hebdomadaire » et « Mot du mois », deux
      cartes sans données. Laisser le vide aurait dessiné leur absence
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
| Code promotionnel programmable | Oui — miroir d'`expire_le`, exigé par le statut « Programmé » | 27 sept. |
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

- ✅ **`npm run diff:sql` ne voyait pas toutes les redéclarations.** Il cherchait
  la fin d'un corps de fonction au premier `$$;`. Une fonction reprise depuis la
  base — `pg_get_functiondef` — est délimitée par `$function$`, et n'en contient
  aucun : la déclaration était **sautée sans un mot**. Cinq migrations du dépôt
  sont dans ce cas, dont la `0094`.

  C'est le défaut que l'en-tête du script décrit, retourné contre l'outil
  lui-même : il rapportait « 2 déclarations » de `fulfill_order` au lieu de
  trois, et l'absence d'alerte se lisait comme une absence d'écart. Corrigé —
  l'étiquette entre dollars se lit désormais au lieu d'être supposée.

  **Pas de test ajouté sur le script, et c'est délibéré** : `allowJs` est à
  `false`, l'importer depuis un test TypeScript ne compilerait pas, et l'invariant
  qu'il sert à révéler est déjà tenu par le comportement — une redéclaration qui
  perdrait l'e-mail ferait tomber `emails.test.ts`, une qui perdrait la facture
  ferait tomber `facture-a-l-octroi.test.ts`. Le script aide la relecture ; il
  n'est pas le filet.

- ✅ **Trois codes d'erreur du nouveau geste n'avaient pas de traduction** —
  `resiliation_impossible`, `rien_a_reprendre`, `abonnement_sans_prestataire`.
  L'éditeur aurait lu « Une erreur est survenue » au lieu de la raison du refus.
  Même famille que les trois refus de promotion trouvés plus tôt, et attrapée par
  le même test, qui énumère les codes dans les sources au lieu de les
  échantillonner.

- ✅ **Le nettoyage des tests ne savait pas qu'une commande porte une facture.**
  `invoices.order_id` est en `on delete restrict` — délibéré : une pièce
  comptable interdit d'effacer son origine. Depuis la `0094`, toute commande
  payée en porte une, et huit fixtures écrites avant échouaient. La règle est
  passée à UN endroit — `supprimerCommandes`, dans `tests/helpers/db.ts` —
  plutôt que recopiée huit fois. La clé n'a **pas** été passée en `cascade` :
  ce serait donner à toute suppression de commande le pouvoir d'effacer une
  facture.

- ✅ **Les factures sont enfin émises** — migration `0094`. `emettre_facture`
  existait depuis l'étape des factures et **personne ne l'appelait** : quatre
  commandes payées, zéro facture. Rien ne le signalait — la route de lecture
  répond 404 pour une facture absente exactement comme pour une commande
  impayée, et la liste d'administration rend simplement un numéro nul. Les
  tests de la fonction passaient tous : ils l'appelaient eux-mêmes. C'est le
  CHAÎNON qui manquait, et un chaînon ne se teste pas en testant ses deux bouts.

  Elle est appelée là où l'e-mail est programmé, dans la même transaction, et
  elle est devenue idempotente : un rejeu ne consomme pas un numéro d'une
  séquence comptable sans trou. Un index unique partiel monte la garde.

  **La migration ne rattrape pas le passé** : antidater une facture lui
  donnerait une date d'émission fausse et des numéros pris dans la séquence de
  l'année courante. Les commandes déjà payées restent sans facture ; leur
  régularisation sera une décision comptable, pas une migration.

- ✅ **`subscriptions.id_prestataire` était toujours NUL.** `subscriptionId`
  existe dans l'événement depuis l'origine et n'était transmis à personne.
  Conséquence invisible : `DELETE /api/subscriptions` n'appelle le prestataire
  QUE si l'identifiant existe — un client qui résiliait obtenait un 200, et le
  prestataire n'était jamais prévenu. Il aurait continué de prélever. Corrigé
  dans le gestionnaire de webhooks, et le script de peuplement le rapporte
  désormais comme le ferait un vrai prestataire.

- ✅ **Les codes promotionnels acceptent le tiret** — décision du 27 sept.
  `DAVE-ATELIER` se dicte et se relit mieux que `DAVEATELIER`, et l'argument de
  la règle d'origine plaidait contre elle. Ni en tête, ni en queue, ni doublé,
  des deux côtés — route et champ.


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
