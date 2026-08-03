# Contrat d'API — inventaire et audit avant interface

**Édition Mapoukam. Étape 0 du chantier frontend. 2 août 2026.**

Ce document recense **toutes** les routes exposées par le backend livré, avec
leurs entrées, leurs sorties et leurs codes d'erreur, puis répond à une seule
question :

> **L'API rend-elle tout ce dont les écrans ont besoin pour s'afficher sans rien
> recalculer ?**

La réponse est **non sur douze points**, dont six empêchent purement et
simplement l'écran concerné d'exister. Ils sont listés en section 4, chacun avec
l'extension d'API correspondante. C'est le moment de les traiter : passé cette
étape, la tentation sera de les combler côté client, ce que `CLAUDE.md`
interdit — et ce que les trois divergences SQL/TypeScript déjà rattrapées dans ce
projet rendent coûteux (`docs/PLAN.md` §5 quinquies).

---

## 0. Réserve à lever avant toute implémentation

> **`docs/maquettes/` n'existe pas dans le dépôt.**

La mission le désigne comme la référence visuelle validée. Le dossier est absent,
et aucun fichier du dépôt ne contient de maquette sous quelque forme que ce soit
(recherche sur l'arborescence complète, hors `node_modules` et `.git`).

**Ce que j'ai fait en attendant** — et qui ne dépend pas des maquettes : l'audit
ci-dessous est intégralement dérivé du **code réellement livré** et de
`docs/cahier-des-charges.md` §4 (F1 à F13), qui énumère les écrans et leur
contenu. Les manques que je signale sont des manques **par rapport à la
spécification**, pas par rapport à une maquette que je n'ai pas vue.

**Ce que les maquettes changeront** : la densité, la grammaire visuelle, le
découpage en composants, et probablement quelques champs supplémentaires. Elles
ne changeront pas les douze manques ci-dessous, qui portent sur des données
absentes de l'API, pas sur leur présentation.

**Il me les faut avant l'étape 1.** Voir aussi la question Q1 en section 6.

---

## 1. Conventions transverses

### 1.1 Authentification

Deux porteurs de jeton, l'en-tête primant sur le cookie
(`src/lib/auth/session.ts`) :

| Porteur | Usage |
|---|---|
| `Authorization: Bearer <access_token>` | Appel programmatique explicite |
| Cookie `contes_access_token` | Navigation ordinaire du navigateur |

Les deux cookies (`contes_access_token`, `contes_refresh_token`) sont
`HttpOnly; SameSite=Lax; Path=/`, et `Secure` seulement en production. **Le
JavaScript de page ne peut donc pas les lire** — c'est délibéré : une faille XSS
ne doit pas devenir un vol de session.

**Conséquence pour l'interface :** tout appel authentifié part du **serveur**
(Server Component, Route Handler, Server Action) ou depuis le navigateur en
`credentials: 'include'` sans jamais toucher au jeton. Aucun jeton ne transite
par un état React.

Le jeton n'est jamais décodé localement : il est soumis à Supabase Auth à chaque
requête, puis le profil métier (`role`, `statut`) est relu **en base**. Un rôle
transmis par le client n'a aucun effet.

### 1.2 Forme des erreurs

Toutes les erreurs partagent une enveloppe unique (`src/lib/http/responses.ts`) :

```json
{ "erreur": { "code": "requete_invalide", "message": "La requête est invalide.",
              "champs": { "page": ["Numéro de page invalide."] } } }
```

`code` s'adresse au programme, `message` à l'utilisateur, en français. `champs`
n'est présent que sur les erreurs de validation.

> **L'interface ne doit jamais analyser `message` pour décider d'un
> comportement.** La séparation existe pour ça. Elle branche sur `code`, et
> affiche `message` — ou sa traduction, voir §1.6.

Codes communs :

| Code HTTP | `code` | Sens |
|---|---|---|
| 400 | `requete_invalide` | Échec Zod, avec `champs` |
| 400 | `corps_illisible` | JSON malformé |
| 401 | `non_authentifie` | Aucun jeton, ou jeton invalide/révoqué |
| 401 | `identifiants_invalides` | Email **ou** mot de passe faux — indistinguables à dessein |
| 403 | `email_non_verifie` | Compte créé, adresse non confirmée |
| 403 | `compte_suspendu` | |
| 403 | `interdit` | Authentifié mais sans le droit |
| 404 | `introuvable` | **Y compris la ressource d'autrui** — voir §1.3 |
| 429 | `trop_de_requetes` | En-tête `retry-after` en secondes |
| 500 | `erreur_interne` | Le détail part au journal, jamais au client |

### 1.3 La ressource d'autrui répond 404, jamais 403

Un 403 confirmerait l'existence de la ressource. Les commandes, les paniers et
les droits filtrent donc sur `user_id` **dans la requête elle-même** : la ligne
d'autrui n'est jamais chargée, même pour être écartée ensuite.

**Conséquence pour l'interface :** un 404 sur `/api/orders/[id]` ne signifie pas
« cette commande n'existe pas », mais « vous n'avez pas cette commande ». Le
message affiché doit couvrir les deux.

### 1.4 Argent

- Les montants sont des **entiers, dans la plus petite unité de la devise**.
- **Le franc CFA n'a pas de sous-unité** : `500` vaut 500 FCFA, quand `500` vaut
  5,00 €. Le nombre de décimales vit dans la table `currencies`.
- Le catalogue rend déjà le montant **formaté** dans `prix.affichage`.

> **L'interface affiche `prix.affichage`. Elle ne reformate jamais un montant
> elle-même.** Recopier la règle des décimales côté client la ferait diverger, et
> la divergence porterait sur un prix — donc sur ce que le client paie.

**Aucun total consolidé n'existe et n'existera** : additionner des euros et des
francs CFA sans taux ne produit pas un chiffre approximatif, il n'en produit
aucun (`docs/AVANT-MISE-EN-PRODUCTION.md` D4). Les écrans de statistiques
ventilent par devise, sans exception.

### 1.5 Temps

Toutes les dates sont des chaînes ISO 8601 avec fuseau. Le backend les produit
depuis une **horloge injectable** que la console `/dev` peut déplacer.

> **L'interface ne compare jamais une date de l'API à `new Date()` du
> navigateur.** Sous horloge simulée, l'horloge du navigateur n'est pas celle du
> serveur, et un abonnement « qui expire dans 3 jours » s'afficherait comme
> expiré depuis six mois. Toute date de référence vient de l'API — voir le manque
> **M6** et l'extension `GET /api/time`.

Convention d'intervalle : **`[début, fin[`**, semi-ouverte, partout
(`docs/PLAN.md` §5 septies).

### 1.6 Langues

Deux niveaux à ne pas confondre (§5.5 de la spécification) :

| Niveau | Porté par |
|---|---|
| **Interface** (menus, boutons, erreurs) | Fichiers de traduction du frontend |
| **Contenu des livres** | Paramètre `langue` des routes, `book_translations` |

Les deux se règlent séparément : un parent peut lire l'interface en français et
ouvrir un conte en anglais. `users.langue_preferee` (`fr` | `en`) porte la
préférence d'interface et sert aussi aux emails.

Les `message` d'erreur de l'API **sont en français uniquement**. En anglais,
l'interface doit traduire depuis `code`. C'est précisément pourquoi `code`
existe.

### 1.7 Pagination

| Surface | Défaut | Plafond | Où le plafond est appliqué |
|---|---|---|---|
| Catalogue public | 20 | 50 | Schéma Zod |
| Listes d'administration | 25 | 100 | **En base** (`taille_page_admin()`) |

Le catalogue rend `{ page, taille, total, pages }`. **Les listes
d'administration ne rendent pas de total au niveau de la réponse** : il figure
dans la colonne `total_lignes` de chaque ligne. Voir le manque **M11**.

### 1.8 Limitation de débit

| Surface | Quota | Clé |
|---|---|---|
| Connexion | voir `LOGIN_RATE_LIMIT` | IP + email |
| Pages de livre, visiteur non connecté | `ANON_PAGE_RATE_LIMIT` (60/h) | IP |
| Progression de lecture | 120 / min | utilisateur |
| Téléchargement | 30 / h | utilisateur |
| **Toute route d'administration** | 300 / 15 min | administrateur |

Un 429 porte toujours `retry-after`. L'interface doit l'honorer plutôt que de
réessayer en boucle — sur la console d'administration en particulier, où le quota
est atteignable par une pagination automatique un peu vive.

---

## 2. Inventaire — 55 opérations sur 42 fichiers de route

Légende de la colonne **Accès** : `public` = ouverte au visiteur ; `session` =
compte connecté et actif ; `admin` = rôle `admin` relu en base à chaque requête ;
`dev` = fermée si `NODE_ENV === 'production'` ; `signature` = authentifiée par
signature HMAC, jamais par session.

### 2.1 Catalogue et contenu

| Opération | Accès | Entrée | Sortie |
|---|---|---|---|
| `GET /api/catalog` | public | `langue`, `q`, `age_min`, `age_max`, `themes` (liste séparée par virgules, max 10), `origine`, `acces` (`abonnement`\|`achat`\|`gratuit`), `zone`, `tri` (`nouveautes`\|`popularite`\|`alphabetique`\|`prix`\|`pertinence`), `page`, `taille` | `{ entrees: EntreeCatalogue[], page, taille, total, pages }` |
| `GET /api/catalog/{slug}` | public | `langue`, `zone` | `FicheLivre` |
| `GET /api/catalog/{slug}/excerpt` | public | `langue`, `page` | `{ page: {numero,largeur,hauteur,texte,au_titre_de_l_extrait}, lecture: SommaireLecture\|null, motif }` |
| `GET /api/books/{id}/pages/{page}` | public | `langue`, `resolution` (`haute`\|`allegee`) | `{ page: {...}, url, expire_le, motif }` |

**`EntreeCatalogue`** — `id`, `slug`, `titre`, `resume`, `auteur`,
`illustrateur`, `age_min`, `age_max`, `origine_culturelle`, `themes[]`,
`couverture_url`, `nb_pages`, `langues[]`, `publie_le`, `inclus_abonnement`,
`disponible_achat`, `gratuit`, `prix`, `achat_hors_zone`, `acces`.

**`FicheLivre`** = `EntreeCatalogue` + `pages_extrait`, `suggestions[]`.

**`prix`** : `{ montant, devise, zone, affichage }` ou `null`.
**`achat_hors_zone`** : `{ code: 'hors_zone', message }` ou `null` — le titre
reste affiché, **seul l'achat est désactivé** (arbitrage N1). Aucun prix d'une
autre zone n'est jamais montré, même à titre indicatif.

**`acces`** : `{ canRead, canDownload, reason }`.

> **`reason` pilote l'affichage. `canDownload` pilote le bouton de
> téléchargement. Jamais l'inverse.** Un conte à la fois gratuit et acheté rend
> `reason: 'purchase'` — un acheteur ne doit pas lire « gratuit », il a payé. Un
> abonné actif rend `reason: 'subscription'` **et** `canDownload: false`.
> Déduire le droit de télécharger depuis `reason` est le bug central de ce
> domaine (`docs/PLAN.md` D5).

Force des motifs, du plus fort au plus faible :
`purchase > granted > subscription > free > preview > none`.
`none` = titre inexploitable (brouillon, archivé) : pas même l'extrait.

**Codes d'erreur spécifiques :**
- `403 hors_extrait` — page au-delà de l'extrait consultable. Ce n'est **pas** un
  refus d'accès mais une invitation à acheter ou s'abonner : l'écran doit le
  traiter comme tel.
- `404` — brouillon, archivé, slug inconnu : les trois se ressemblent
  volontairement, sans quoi le catalogue à venir serait devinable un slug à la
  fois.
- `429 trop_de_requetes` — visiteur non connecté au-delà du quota.

**Sur `GET /api/books/{id}/pages/{page}` :** l'`url` signée expire à
`expire_le` — **300 s** pour tout contenu payant, jusqu'à **3 600 s** si le titre
est `gratuit`. L'en-tête `cache-control` vaut `private, no-store` pour le contenu
payant et `public, max-age=<ttl>` pour le gratuit.

### 2.2 Authentification et compte

| Opération | Accès | Entrée | Sortie |
|---|---|---|---|
| `POST /api/auth/register` | public | `email`, `password`, `nom_complet?`, `langue_preferee?` | `201 { message }` |
| `POST /api/auth/login` | public | `email`, `password` | `200 { access_token, refresh_token, expires_in, utilisateur }` + cookies |
| `POST /api/auth/logout` | public | — | `204` + cookies effacés |
| `GET /api/auth/me` | session | — | `{ utilisateur: {id,email,role,langue_preferee} }` |
| `POST /api/auth/password/reset` | public | `email` | `204`, **toujours** |
| `POST /api/auth/password/update` | session | `password` | `204` |
| `GET /api/account/anonymize` | session | — | `{ notice }` — ce qui est effacé, ce qui est conservé |
| `POST /api/account/anonymize` | session | `confirmation: true` | `204` |

**Trois réponses volontairement indifférenciées**, à respecter dans l'interface :

1. **L'inscription répond pareil que l'adresse soit connue ou non.** Afficher
   « cette adresse est déjà prise » livrerait la base de clientèle une adresse à
   la fois. L'écran affiche donc toujours « vérifiez votre boîte mail ».
2. **La demande de réinitialisation répond toujours 204.** Même raison.
3. **`identifiants_invalides` ne distingue pas email inconnu et mot de passe
   faux.** Le seul cas nommé est `email_non_verifie`, parce que l'utilisateur
   sait déjà qu'il a créé un compte.

**`POST /api/auth/logout` répond 204 même sans jeton.** Refuser à quelqu'un de
partir n'aurait aucun sens et laisserait le navigateur avec ses cookies. La
révocation est **globale** : toutes les sessions du compte tombent.

**L'anonymisation n'est pas une suppression.** Les données de compte
disparaissent, les pièces comptables sont conservées puis purgées à échéance
légale. `GET` avant `POST` est obligatoire dans le parcours : l'utilisateur doit
avoir pu lire la notice avant de confirmer.

### 2.3 Panier, commandes, paiement

| Opération | Accès | Entrée | Sortie |
|---|---|---|---|
| `GET /api/cart` | session | `zone` | `{ lignes[], refusees[], zone }` — **sans total** |
| `POST /api/cart` | session | `book_id`, `langue?` | `{ ajoute: true }` |
| `DELETE /api/cart` | session | — | `{ vide: true }` |
| `DELETE /api/cart/items/{bookId}` | session | — | `{ retire: true }` |
| `PUT /api/orders` | session | `zone_affichee?`, `code_promo?` | Aperçu chiffré, **sans rien enregistrer** |
| `POST /api/orders` | session | `zone_affichee?`, `code_promo?`, `total_confirme?` | `201 { commande_id, statut: 'en_attente', ...aperçu }` |
| `GET /api/orders` | session | — | `{ commandes[] }`, 100 dernières |
| `GET /api/orders/{id}` | session | — | Détail d'une commande |
| `POST /api/checkout` | session | `commande_id` | `{ session_id, url, expire_le, statut_commande }` |

> **`GET /api/cart` ne rend délibérément aucun total.** Le total dépend de la
> zone d'**encaissement**, que seule la création de commande connaît — elle vient
> du pays du moyen de paiement, jamais de l'adresse IP ni d'un choix du client.
> Annoncer un total depuis la zone d'affichage promettrait un montant qu'on ne
> facturera peut-être pas.
>
> **L'écran du panier obtient donc son total par `PUT /api/orders`**, qui calcule
> sans rien enregistrer. C'est le point le plus facile à manquer de tout ce
> contrat : une interface qui additionne `prix_unitaire` elle-même produirait un
> total juste la plupart du temps, et faux exactement quand la zone diverge.

**Aucun prix n'est jamais accepté du client.** `total_confirme` sert
**uniquement à comparer** : s'il diffère du calcul serveur, la commande échoue
avec `409 confirmation_requise` et le nouveau montant accompagne le refus. Il ne
modifie jamais rien.

**Motifs de refus d'une ligne** (`refusees[].raison`) — chacun appelle une action
différente de l'utilisateur, donc un message différent :

| Raison | Ce que l'utilisateur doit faire |
|---|---|
| `non_publie` | Retirer la ligne |
| `non_disponible_achat` | Retirer la ligne — ce titre n'est pas vendu à l'unité |
| `deja_possede` | **Aller le lire**, il est déjà dans sa bibliothèque |
| `sans_prix_dans_la_zone` | Rien — cas résiduel, à signaler sans culpabiliser |

**Motifs de refus d'un code promo** (`refus_promo`) : `inconnu`, `inactif`,
`expire`, `epuise`, `devise_incompatible`, `zone_incompatible`. Un code écarté
est **toujours** signalé, jamais silencieux : sans cela l'utilisateur croit à une
panne.

**Erreurs :** `409 deja_possede`, `409 non_disponible_achat` (ajout au panier) ;
`409 panier_vide` ; `409 confirmation_requise` ; `409 commande_non_payable`
(commande déjà réglée — protège du double paiement sur rechargement de page).

> **`POST /api/checkout` n'octroie rien et ne peut rien octroyer.** Elle ouvre
> une session et rend une URL. Le droit naît du **webhook signé**, jamais du
> retour de navigateur. La réponse porte `statut_commande: 'en_attente'` pour que
> personne ne croie l'inverse. La page de confirmation doit **interroger la
> commande**, pas se fier à l'URL de succès.

### 2.4 Abonnement

| Opération | Accès | Entrée | Sortie |
|---|---|---|---|
| `GET /api/subscriptions` | session | — | `{ abonnement: {...}\|null, donne_telechargement: false }` |
| `POST /api/subscriptions` | session | `offre` (`mensuel`\|`annuel`) | `{ url, expire_le, jours_essai, statut: 'en_attente_paiement' }` |
| `DELETE /api/subscriptions` | session | — | `{ demande: true, acces_maintenu_jusqu_au, statut: 'annulation_demandee' }` |

L'objet `abonnement` porte **deux statuts, à ne jamais confondre** :

| Champ | Sens |
|---|---|
| `statut` | Le statut **observé**, dates repliées. **C'est celui qu'on affiche.** Valeurs : `essai`, `actif`, `annule`, `impaye`, `expire`, `anomalie` |
| `statut_rapporte` | Ce que le prestataire a rapporté en dernier. Conservé pour l'analyse, **jamais affiché à l'abonné** |

`anomalie` = période échue sans événement, presque toujours un webhook perdu. Il
n'est **ni actif ni expiré** : il a sa propre ligne partout.

`donne_telechargement: false` est rendu en dur par l'API. Ce n'est pas un
remplissage : c'est la confusion la plus coûteuse du projet, écrite dans la
réponse pour qu'aucune interface ne suppose le contraire.

**Aucune de ces routes ne change un statut.** Souscrire ouvre une session,
annuler transmet la demande. C'est l'événement signé qui suit qui fait évoluer
l'état. `acces_maintenu_jusqu_au` existe pour lever le contresens le plus
fréquent : **annuler ne coupe pas l'accès immédiatement.**

### 2.5 Lecture et téléchargement

| Opération | Accès | Entrée | Sortie |
|---|---|---|---|
| `GET /api/reading/{bookId}` | session | `langue` | `{ page, langue, reprise_depuis, ramenee_a_la_fin }` |
| `PUT /api/reading/{bookId}` | session | `langue`, `page` | `{ page, enregistree }` |
| `GET /api/downloads/{bookId}` | session | `langue`, `format` (`pdf`\|`epub`) | `{ url, expire_le, format, langue, reference }` |

**La progression survit à la perte d'accès** : lire sa propre progression n'exige
aucun droit sur le titre, seulement d'être connecté. Un réabonnement doit
reprendre là où l'enfant s'était arrêté. **Écrire**, en revanche, exige un droit
de lecture effectif — sinon la table deviendrait un moyen de sonder l'existence
d'identifiants de livres.

> **`enregistree: false` signale un REGROUPEMENT, pas un échec.** Le client ne
> doit **pas** réessayer : il défferait le regroupement, qui est précisément ce
> qui empêche la progression de s'empiler devant la lecture des pages sur
> connexion lente.

`reprise_depuis` est renseigné quand la reprise vient d'une **autre version
linguistique** ; `ramenee_a_la_fin` quand la page a dû être bornée, les deux
versions n'ayant pas la même pagination. L'interface doit le dire, plutôt que de
laisser l'utilisateur s'étonner d'arriver au milieu du livre.

**Téléchargement — codes d'erreur, chacun avec un message distinct :**

| Code | `code` | Ce que l'écran doit dire |
|---|---|---|
| 403 | `telechargement_non_inclus` | « L'abonnement donne la lecture en ligne. Pour conserver ce titre, achetez-le à l'unité. » |
| 404 | `introuvable` | Traduction en brouillon : jamais téléchargeable, même par un acheteur |
| 503 | `copie_indisponible` | La génération a échoué. **Réessayer, jamais proposer de repli** |
| 429 | `trop_de_requetes` | 30 par heure |

> **Échec fermé, sans exception.** Un repli sur le fichier nu serait invisible —
> l'acheteur reçoit son livre, tout semble marcher — et les fichiers partiraient
> sans protection pendant des semaines.

`reference` (12 caractères) est la référence de service après-vente. Elle figure
**aussi dans le fichier**. L'écran doit la montrer et permettre de la copier.

**La génération prend du temps.** Aucun mécanisme d'attente n'existe côté API :
la requête bloque jusqu'à la copie, derrière un sémaphore à trois places et un
délai de 60 s (`docs/AVANT-MISE-EN-PRODUCTION.md` D2). L'interface doit donc
indiquer une préparation en cours et ne pas paraître figée. Voir le manque
**M12**.

### 2.6 Administration

Toutes passent par `gardeAdmin` : **rôle relu en base + quota + pagination
plafonnée**, indissociables.

| Opération | Entrée | Sortie |
|---|---|---|
| `GET /api/admin/dashboard` | — | `{ abonnements, anomalies[], brouillons_non_publiables[], copies_purgeables }` |
| `GET /api/admin/books` | `statut?`, `page`, `taille` | `{ livres[], page }` |
| `PATCH /api/admin/books` | `id`, + champs optionnels | Livre modifié |
| `PUT /api/admin/books/publication` | `book_ids[]` (1..100), `statut` | `{ titres[] }` |
| `PUT /api/admin/books/{id}/prices` | `zone`, `montant`, `devise` | Prix enregistré |
| `POST /api/admin/books/ingest` | `multipart` : `fichier`, `langue?`, `titre?`, `auteur?` | `201 { livre_id, traduction_id, slug, titre, nb_pages, couche_texte, deja_ingere, statut }` |
| `GET /api/admin/users` | `recherche?`, `statut?`, `page`, `taille` | `{ comptes[], page }` |
| `PUT /api/admin/users/{id}/suspend` | `suspendu`, `motif?` | `{ suspendu }` |
| `POST /api/admin/users/{id}/entitlements` | `book_id`, **`motif`**, `peut_telecharger?`, `expire_le?` | `201` |
| `DELETE /api/admin/users/{id}/entitlements` | `entitlement_id`, `motif?` (query) | `204` |
| `GET /api/admin/orders` | `statut?`, `user_id?`, `page`, `taille` | `{ commandes[], page }` |
| `POST /api/admin/orders/{id}/refund` | — | `{ order_id, statut: 'rembourse' }` |
| `GET /api/admin/subscriptions` | `statut?` (dont `anomalie`), `page`, `taille` | `{ abonnements[], page }` |
| `PUT /api/admin/subscriptions/{id}/zone` | `zone`, `motif?` | Abonnement modifié |
| `GET /api/admin/promos` | `page`, `taille` | `{ codes[], page }` |
| `POST /api/admin/promos` | `code`, `type`, `valeur`, `devise?`, `zone?`, `expire_le?`, `usage_max?`, `actif?` | `201` |
| `PATCH /api/admin/settings` | 5 paramètres métier, tous optionnels | Réglages |
| `GET /api/admin/audit` | `action?`, `cible_id?`, `page`, `taille` | `{ entrees[], page }` |
| `GET /api/admin/stats` | `agregat`, `debut?`, `fin?`, `page`, `taille` | `{ agregat, donnees[] }` |
| `POST /api/admin/maintenance/purge-copies` | — | Rapport de purge |

**Colonnes rendues par les listes** (elles conditionnent les tableaux, y compris
les quatre écrans sans maquette) :

- **Livres** : `id`, `slug`, `auteur`, `statut`, `gratuit`, `inclus_abonnement`,
  `disponible_achat`, `publie_le`, `prix` (jsonb), **`manques[]`**,
  **`publiable`**, `total_lignes`.
- **Comptes** : `id`, `email`, `nom_complet`, `role`, `statut`, `cree_le`,
  `anonymise`, `nb_commandes`, `nb_droits`, `total_lignes`.
- **Commandes** : `id`, `user_id`, `email`, `montant_total`, `devise`, `zone`,
  `statut`, `remise`, `cree_le`, `paye_le`, **`numero_facture`**,
  `acheteur_anonymise`, `nb_lignes`, `total_lignes`.
- **Abonnements** : `id`, `user_id`, `email`, `offre`, `statut`,
  **`statut_observe`**, `debut_periode`, `fin_periode`, `zone`, `devise`,
  `montant`, `total_lignes`.
- **Codes promo** : `id`, `code`, `type`, `valeur`, `devise`, `zone`,
  `expire_le`, `actif`, `usage_max`, `usage_count`, `total_lignes`.
- **Audit** : `id`, `acteur_id`, `acteur_email`, `action`, `cible_type`,
  `cible_id`, `ancienne_valeur` (jsonb), `nouvelle_valeur` (jsonb), `motif`,
  `cree_le`, `total_lignes`.

**Quatre contraintes d'interface qui viennent du backend, pas d'un choix de
maquette :**

1. **La liste des commandes ne rend que `numero_facture`**, jamais `facture_nom`
   ni `facture_email`. Ce n'est pas la conservation qui ré-identifie, c'est la
   **jointure**. L'écran ne doit donc offrir aucun moyen de la reconstituer —
   pas même un lien « voir le client » depuis une commande d'un compte anonymisé
   (`acheteur_anonymise` le signale).
2. **La liste des abonnements affiche `statut_observe`**, jamais `statut`.
   Filtrer sur `statut = 'anomalie'` ne rendrait rien : cette valeur n'est jamais
   écrite en base. Les anomalies vont **en tête**, pas derrière un filtre — les
   ranger au milieu reviendrait à les taire une seconde fois.
3. **Le motif d'octroi manuel est obligatoire**, exigé à trois niveaux (Zod,
   fonction SQL, déclencheur d'audit). L'écran doit le rendre obligatoire **et**
   rappeler que l'action est tracée : c'est le bouton qui donne du contenu
   gratuitement, sans commande ni facture.
4. **Un code promo à montant fixe exige une zone ET une devise ; un code en
   pourcentage n'en porte aucune.** Les deux contraintes sont symétriques et
   toutes deux refusées côté serveur. Le formulaire doit basculer entre les deux
   formes, sinon on créera des codes inutilisables — « 5 € de réduction » sur un
   panier en FCFA retirerait cinq francs.

**Agrégats de `GET /api/admin/stats`** — tous ventilés, aucun consolidé :

| `agregat` | Colonnes |
|---|---|
| `chiffre_affaires` | `flux`, `devise`, `zone`, `montant`, `nb_transactions` |
| `abonnes` | `statut_observe`, `offre`, `zone`, `devise`, `nombre` |
| `mouvements` | `mouvement`, `offre`, `nombre` |
| `titres_achetes` | `book_id`, `slug`, `langue`, `devise`, `nb_achats`, `montant`, `total_lignes` |
| `titres_lus` | `book_id`, `slug`, `langue`, `nb_lecteurs`, `total_lignes` |
| `langues` | `langue`, `achats`, `telechargements`, `lecteurs`, **`sous_le_seuil`** |
| `telechargements_par_zone` | `zone`, `telechargements`, `lecteurs`, **`sous_le_seuil`** |

> **`sous_le_seuil` doit être affiché, pas masqué.** Sous cinq lecteurs
> distincts, les données comportementales sont masquées — « ce titre a
> 1 lecteur », croisé avec la liste des acheteurs, nomme quelqu'un. L'écran doit
> dire « masqué, effectif insuffisant » et non afficher un zéro, qui serait un
> mensonge.
>
> Le seuil porte sur le **comportemental**. Les données **comptables** restent
> exactes : un chiffre d'affaires arrondi pour cause de seuil serait un faux
> chiffre comptable.

Période plafonnée à **trois ans**, en base. Au-delà : `400 periode_invalide`.

`422 action_impossible` = refus par une règle métier.
`422 publication_refusee` = au moins un titre incomplet — **le lot entier est
refusé**, jamais publié à moitié. L'écran doit renvoyer vers `manques[]`.

### 2.7 Console de simulation `/dev`

Fermée si `NODE_ENV === 'production'`, route par route, vérifié par test.

| Opération | Rôle |
|---|---|
| `GET /api/dev/state` | Commandes, abonnements, webhooks récents |
| `POST /api/dev/events` | **Émet un vrai événement signé** vers le vrai gestionnaire |
| `GET/POST/DELETE /api/dev/clock` | Lit, avance, réinitialise l'horloge |
| `GET /api/dev/emails` | Emails écrits par `FileMailer` dans `.mails/` |
| `POST /api/dev/reset` | Remet l'état de démonstration à zéro |

Types d'événements : `paiement.reussi`, `paiement.echoue`, `paiement.abandonne`,
`remboursement.effectue`, `abonnement.souscrit`, `abonnement.renouvele`,
`abonnement.prelevement_echoue`, `abonnement.annule`, `abonnement.expire`.

**C'est le pilote des tests de bout en bout de l'étape 13.**

### 2.8 Webhook

`POST /api/webhooks/payments` — **authentifié par signature, jamais par
session.** Seule source de vérité sur l'état d'un paiement. Aucun écran ne
l'appelle. Cité ici pour l'inventaire.

---

## 3. Génération des types

Les types **ne sont pas écrits à la main**. Deux sources, toutes deux dérivées du
backend :

1. **`npm run db:types`** — `supabase gen types typescript --local` →
   `src/lib/supabase/database.types.ts`. Déjà en place, déjà utilisé par
   `src/lib/admin/service.ts`.
2. **Les types de domaine existants**, importés directement par le frontend :
   `AccessDecision`, `MotifAcces`, `EntreeCatalogue`, `FicheLivre`,
   `PrixAffiche`, `AchatHorsZone`, `PageCatalogue`, `SuggestionLivre`,
   `RefusLigne`, `RefusPromo`, `SommaireLecture`.

**Ce qui manque, et que l'étape 0 doit produire :** un module
`src/domain/api/contract.ts` qui **dérive** de ces types les enveloppes de
réponse de chaque route, plus un test d'architecture qui échoue si une route
renvoie une forme non déclarée. Sans lui, le frontend re-décrirait à la main ce
que le backend sait déjà — troisième source de vérité, donc troisième divergence.

---

## 4. Les manques — réponse à la question posée

**Six bloquants, quatre dégradants, deux à documenter.** Aucun n'est comblable
côté client sans enfreindre `CLAUDE.md`.

### BLOQUANT — l'écran ne peut pas exister

#### M1 — Aucune route de rafraîchissement de session

`POST /api/auth/login` rend un `refresh_token` et pose le cookie
`contes_refresh_token`, valable 30 jours. **Aucune route ne l'échange contre un
nouvel `access_token`.** Le jeton d'accès Supabase expire en une heure ; le
cookie étant `HttpOnly`, le navigateur ne peut pas s'en servir lui-même.

**Ce qui casse.** Toute session de plus d'une heure retombe en 401 — y compris en
pleine lecture, y compris entre le panier et le paiement. C'est le manque le plus
structurant de la liste : il touche tous les écrans authentifiés.

**Extension.** `POST /api/auth/refresh` — lit le cookie de rafraîchissement,
appelle `supabase.auth.refreshSession()`, repose les deux cookies, rend
`{ expires_in }`. Appelée par le middleware Next.js sur 401, une fois, avant de
rejouer la requête.

#### M2 — Aucune route de bibliothèque

§4.2 F7 demande « Mes achats » et « En cours de lecture ». La table
`entitlements` n'est lue par **aucune** route utilisateur, et `GET /api/orders`
ne rend que des `livre_id` — sans titre, sans slug, sans couverture.

**Ce qui casse.** L'écran central de l'espace personnel. Le reconstituer côté
client demanderait un appel par titre à `/api/catalog/{slug}` — sans même
connaître les slugs.

**Extension.** `GET /api/library` →
`{ achats: EntreeBibliotheque[], en_cours: EntreeBibliotheque[] }`, où chaque
entrée porte `book_id`, `slug`, `titre`, `couverture`, `langues[]`, `acces`, et
pour « en cours » : `page`, `nb_pages`, `langue`, `derniere_lecture_le`. Un seul
appel, résolution des droits **en lot** comme le fait déjà le catalogue.

#### M3 — Aucune route de favoris

**La table `favorites` existe**, avec RLS propriétaire et
`grant select, insert, delete to authenticated`. Aucune route ne l'expose. §4.2
F7 demande la section « Favoris ».

**Extension.** `GET /api/favorites`, `POST /api/favorites` (`book_id`),
`DELETE /api/favorites/{bookId}`. Le catalogue et la fiche gagnent un booléen
`favori` — sinon l'état du cœur exigerait un second appel par titre.

#### M4 — Aucune route sur les factures de l'utilisateur

§4.2 F9 : « Historique des commandes et accès aux factures ». La table `invoices`
a une politique de lecture propriétaire, **et aucune route ne la sert**.
`GET /api/orders` ne rend même pas `numero_facture`.

**Ce qui casse.** L'obligation commerciale de §11.3. Un client ne peut pas
récupérer sa facture.

**Extension.** `numero_facture` ajouté à `GET /api/orders` et
`GET /api/orders/{id}` ; `GET /api/orders/{id}/invoice` rendant le détail
nominatif **au propriétaire de la facture uniquement**.

> **À ne pas confondre avec B4** de `docs/AVANT-MISE-EN-PRODUCTION.md`, qui
> concerne la consultation **administrative** d'une facture nominative — celle-là
> doit être **journalisée comme une consultation** et reste hors périmètre
> frontend sans arbitrage.

#### M5 — Les tarifs d'abonnement ne sont exposés par aucune route publique

`PRICE_SUBSCRIPTION_MONTHLY`, `PRICE_SUBSCRIPTION_YEARLY` et `jours_essai` sont
serveur uniquement. `POST /api/subscriptions` rend `jours_essai`, mais seulement
**après** avoir ouvert une souscription — trop tard pour une page d'offres.

**Ce qui casse.** L'étape 8 entière.

**Ce qu'il ne faut surtout pas faire :** coder les prix en dur dans l'interface.
Ce serait une seconde source de prix — exactement ce que la décision D4 a
supprimé pour les livres, et pour la même raison : deux sources divergent, et la
divergence porte sur ce que le client paie.

**Extension.** `GET /api/offers` → `{ offres: [{ code, montant, devise,
affichage, periode }], jours_essai, zone }`, la zone venant du paramètre
d'affichage comme pour le catalogue.

#### M6 — La fenêtre de nouveauté n'est pas observable

Le catalogue rend `publie_le` et `inclus_abonnement`, mais **pas**
`fenetre_nouveaute_jours` ni la date d'entrée dans l'abonnement. `access_for_books`
ne rend que `can_read`, `can_download`, `reason`.

**Ce qui casse.** Tout affichage du type « bientôt dans l'abonnement » ou « vendu
seul jusqu'au 12 octobre ». Le calculer côté client signifierait recopier la
règle des trois mois dans le navigateur — **la règle métier la plus mouvante du
projet**, puisque `PATCH /api/admin/settings` la déplace à la seconde et
rétroactivement.

**Extension.** Ajouter `abonnement_a_partir_du: string | null` aux entrées de
catalogue et à la fiche, calculé **en SQL** par la même fonction que le moteur de
droits (`fenetre_de_vente_ecoulee`). `null` si le titre n'est pas
`inclus_abonnement` ou si la fenêtre est déjà écoulée.

**Corollaire, à traiter dans la même extension :** ajouter `GET /api/time` rendant
l'instant de l'horloge métier, pour que l'interface n'ait jamais à comparer une
date de l'API à celle du navigateur (§1.5).

### DÉGRADANT — l'écran existe, mais mal

#### M7 — Les couvertures sont rendues en une seule taille, sous forme de chemin

`books.couverture_url` vaut `covers/<jeton>/fiche.webp` : un **chemin relatif au
bucket**, pas une URL. Trois tailles sont pourtant produites et déposées —
`vignette` (320 px), `fiche` (800 px), `mise-en-avant` (1600 px) — et **une
seule est stockée**.

**Ce qui se dégrade.** La grille du catalogue chargerait du 800 px pour
l'afficher en 320, et la mise en avant d'accueil étirerait du 800 px en 1600.
§5.1 qualifie l'optimisation des images de **critique** pour ce public. C'est
exactement le cas visé.

Reconstituer les autres tailles par substitution de chaîne recopierait une
convention de stockage dans le client — elle changerait un jour, sans que rien ne
le signale.

**Extension.** Rendre `couverture: { vignette, fiche, mise_en_avant } | null` en
**URL absolues**, construites côté serveur. `couverture_url` reste, déprécié.

#### M8 — Aucune route de facettes

Le catalogue accepte `themes`, `origine`, `age_min`/`age_max`, mais rien
n'énumère les valeurs **réellement présentes**. La grammaire de filtres en
pastilles serait donc codée en dur, et se désynchroniserait du catalogue au
premier titre ingéré.

**Extension.** `GET /api/catalog/facets?langue=` →
`{ themes: [{valeur, nombre}], origines: [...], tranches_age: [...], langues: [...] }`,
en une passe SQL sur les titres publiés.

#### M9 — `GET /api/orders` ne rend pas les titres commandés

Chaque ligne porte `livre_id`, `langue`, `prix_unitaire`. Ni titre, ni slug, ni
couverture. L'historique des commandes afficherait des UUID.

**Extension.** Joindre `slug` et `titre` (dans la langue de la ligne) aux
`order_items` des deux routes de commande. Aucun coût de sécurité : l'utilisateur
possède déjà ces titres.

#### M10 — Aucune route de contact

§4.1 F4 demande un formulaire de contact. Rien côté API. L'infrastructure
existe pourtant : `Mailer`, `email_outbox`, et un envoi post-commit éprouvé.

**Extension.** `POST /api/contact` — `sujet`, `message`, `email` (pré-rempli si
connecté), avec quota par IP. Passe par la boîte d'envoi, jamais en direct.

### À DOCUMENTER — l'API suffit, mais l'usage est contre-intuitif

#### M11 — Les listes d'administration ne rendent pas de total au niveau réponse

`total_lignes` figure dans **chaque ligne**. Une page vide — filtre sans
résultat — n'a donc **aucun total**, et la pagination ne peut plus afficher
« page 3 sur 12 ».

**Extension mineure.** Les routes remontent `{ …, total, pages }` en lisant
`donnees[0].total_lignes ?? 0`. Trois lignes par route, aucun changement SQL.

#### M12 — Aucun mécanisme d'attente sur le téléchargement

La requête bloque jusqu'à la copie filigranée, derrière un sémaphore à trois
places et un délai de 60 s. Sur connexion lente, l'utilisateur voit un bouton
figé.

**Ce que le frontend peut faire seul, et doit faire :** état « préparation de
votre exemplaire », interdiction du double-clic, et message explicite au-delà de
quelques secondes. **Sans jamais proposer de repli** en cas de 503.

**Ce qu'il ne peut pas faire :** rendre la génération asynchrone. C'est D2 de
`docs/AVANT-MISE-EN-PRODUCTION.md`, et cela dépend de l'ordonnanceur B5. **Hors
périmètre frontend.**

### Récapitulatif

| # | Manque | Catégorie | Extension |
|---|---|---|---|
| M1 | Rafraîchissement de session | **Bloquant** | `POST /api/auth/refresh` |
| M2 | Bibliothèque | **Bloquant** | `GET /api/library` |
| M3 | Favoris | **Bloquant** | `GET/POST/DELETE /api/favorites` |
| M4 | Factures utilisateur | **Bloquant** (légal) | `GET /api/orders/{id}/invoice` |
| M5 | Tarifs d'abonnement | **Bloquant** | `GET /api/offers` |
| M6 | Fenêtre de nouveauté | **Bloquant** | `abonnement_a_partir_du` + `GET /api/time` |
| M7 | Couvertures multi-tailles | Dégradant | `couverture: {…}` en URL absolues |
| M8 | Facettes de filtres | Dégradant | `GET /api/catalog/facets` |
| M9 | Titres dans l'historique | Dégradant | Jointure sur `order_items` |
| M10 | Formulaire de contact | Dégradant | `POST /api/contact` |
| M11 | Total des listes admin | À documenter | Enveloppe `{ total, pages }` |
| M12 | Attente du téléchargement | À documenter | Traité côté interface |

**Les six bloquants sont traités à l'étape 0 du plan frontend**, avant toute
page. M7 à M11 à l'étape 0 également — ils sont peu coûteux et touchent des
routes que les étapes suivantes consommeront immédiatement. M10 à l'étape 9, avec
les pages éditoriales.

---

## 5. Ce que l'API garantit déjà, et qu'il ne faut pas refaire

Écrit noir sur blanc pour qu'aucune étape ne soit tentée de le recalculer :

| Garantie | Où elle vit | Ce que l'interface fait |
|---|---|---|
| Droit de lire / télécharger | `access_for_books`, en SQL | Lit `canRead` / `canDownload` |
| Force du motif affiché | `reason` | Affiche, ne déduit pas |
| Formatage d'un montant | `prix.affichage` | Affiche tel quel |
| Total d'un panier | `PUT /api/orders` | Appelle, n'additionne pas |
| Zone d'encaissement | Pays du moyen de paiement | N'envoie jamais de zone d'encaissement |
| Validité d'un code promo | `src/domain/orders/promo.ts` | Envoie le code, affiche `refus_promo` |
| Statut réel d'un abonnement | `statut_effectif()` | Affiche `statut`, pas `statut_rapporte` |
| Publiabilité d'un titre | `manques_pour_publication()` | Affiche `manques[]` |
| Seuil d'anonymat statistique | `seuil_agregation()` | Affiche `sous_le_seuil` |
| Fenêtre de nouveauté | `business_settings` | **Attendra M6** |

---

## 6. Questions ouvertes — arbitrage requis

**Q1 — Les maquettes.** `docs/maquettes/` est absent. Je peux avancer sur
l'étape 0 sans elles : elle ne produit aucun écran. **Il me les faut avant
l'étape 1.** À défaut, dites-le et je proposerai une grammaire visuelle à
valider, ce qui coûtera un aller-retour de plus.

**Q2 — Connexion Google.** §4.2 F5 la dit « optionnelle mais recommandée ».
Aucune route ne l'implémente, et l'activer suppose un compte Google — donc un
service externe, que le mode 100 % local exclut. **Je la considère hors
périmètre** sauf indication contraire ; le point est signalé, pas tranché
seul.

**Q3 — Vérification d'email et réinitialisation.** Les liens Supabase
redirigent vers `/auth/confirmation` et `/auth/nouveau-mot-de-passe` avec les
jetons dans le **fragment** d'URL. Rien ne transforme cette session Supabase en
cookies `contes_*`. Je propose `POST /api/auth/session` (échange d'un
`access_token` + `refresh_token` contre nos cookies), à l'étape 2. Confirmez, ou
dites-moi si vous préférez que ces deux pages appellent directement Supabase.

**Q4 — Suggestions de la fiche.** `suggestions[]` rend 4 titres par thèmes
partagés, sans décision d'accès ni prix. Suffisant pour une vignette et un lien.
Je n'enrichis pas sauf demande.
