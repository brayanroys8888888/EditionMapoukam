# Point de reprise — session des 27, 28 et 29 septembre 2026

Ce fichier existe pour qu'une session neuve reprenne **sans relire le
transcript**. Il dit où on s'est arrêté, ce qui est fini, ce qui est en cours,
et surtout **les erreurs à ne plus commettre** — elles ont toutes coûté du temps
au moins une fois.

À lire avec `CLAUDE.md` (permanent), `REPRISE.md` (état du chantier) et les deux
checklists : `docs/CHANTIER-ADMIN-V3.md` et `docs/CHANTIER-ASSOCIATION.md`.

---

## 1. Où on s'est arrêté, exactement

**Dernier commit : `b02398b`** — les cinq onglets de l'écran d'administration de
l'Association DAVE.

**Travail NON COMMITÉ sur le disque**, qui fonctionne et dont le typecheck et le
lint passent, mais qui **n'a pas encore franchi la porte complète** :

| Fichier | Ce que c'est |
| --- | --- |
| `supabase/migrations/20260929000106_association_acces_espace.sql` | la règle d'entrée de l'espace (4 verdicts) — **appliquée** |
| `supabase/migrations/20260929000107_association_espace.sql` | les données de l'espace, en un aller-retour — **appliquée** |
| `src/app/[langue]/espace/page.tsx` | la page, qui traduit le verdict en destination |
| `src/components/v2/espace-adherent.{tsx,module.css}` | le rendu de l'espace |
| `tests/integration/espace-adherent-acces.test.ts` | **9 tests**, verts |
| `src/app/[langue]/offres/page.tsx` + `offres-v3.{tsx,module.css}` | le motif du renvoi (`espace` / `renouveler`) |
| `docs/cahier-des-charges.md` | **la règle « aucun fichier » retirée** — voir §5 |

**Ajouté le 29 septembre** (quatre demandes du propriétaire, §1 bis) :

| Fichier | Ce que c'est |
| --- | --- |
| `supabase/migrations/20260929000108_association_corps_media.sql` | `video` et `audio` dans le corps — **appliquée** |
| `src/app/[langue]/admin/association/types-publication.ts` | les quatre types, écrits **une** fois |
| `tests/integration/association-corps-media.test.ts` | **7 tests**, verts |

> ⚠️ **Les migrations 0106 et 0107 sont DÉJÀ APPLIQUÉES en base locale.** Ne pas
> les rejouer. `npm run db:migrate` est idempotent, mais ne jamais les
> *modifier* : ajouter une migration corrective.

## 1 bis. Les quatre demandes du 29 septembre — faites

1. **« Nouvelle publication » ouvrait l'ancien formulaire**, replié au bas de
   l'écran, pendant que `daveEdit` existait à côté. Le bouton est désormais un
   **lien** vers `/admin/association/rediger`, et un **volet** à sa droite (un
   `<details>`, sans JavaScript) pose le type d'avance : `rediger?type=replay`.
   L'ancien formulaire est supprimé, avec ses sept clés de traduction ;
   `categorie` et `acces`, qui ne vivaient que là, deviennent deux sélecteurs
   de l'éditeur.

2. **Le corps accepte la vidéo et le son** — migration `0108`, sept types de
   blocs. Un replay, lui, n'en prend **aucune** dans son corps : il porte déjà
   sa vidéo dans `video_url`, avec la durée qu'affiche sa carte. Le refus vaut
   **dès le brouillon**, contrairement aux trois voisins.

3. **L'adhérent entre dans son espace après l'achat.** La confirmation de
   souscription et les deux appels de `/association` menaient à la page
   publique — celle qui propose justement d'adhérer. Ils mènent à `/espace` dès
   que le verdict l'ouvre, et le verdict est LU (`association_acces_espace`),
   jamais déduit.

4. **Les puces « Publics concernés » rendaient mal**, et la raison vaut d'être
   retenue : elles portaient `.segOpt`, qui n'a ni fond ni trait — c'est
   `.seg`, le CONTENEUR, qui les dessine, et il n'y en a pas là puisqu'on en
   choisit plusieurs. Chaque bouton retombait sur le dessin du **navigateur**.
   Elles ont maintenant `.redactionPuce` / `.redactionPuceChoisie`.

## 1 ter. Les trois demandes suivantes du 29 septembre — faites

1. **Le formulaire « Écrire une version » du bas est retiré.** Il était seul à
   savoir écrire la version ANGLAISE : l'éditeur porte donc maintenant la
   **langue du texte** (`?v=en`, champ caché, deux liens FR/EN en tête).
   Au passage, un défaut fermé : l'écran lisait la version `fr` en dur et
   l'action enregistrait sous la langue de l'INTERFACE — `/en/…/rediger`
   chargeait le français et l'écrivait par-dessus l'anglais.

2. **On peut choisir un fichier sur l'appareil** — migration `0109`, route
   `POST /api/admin/association/fichiers`, contrôle posé sur la couverture, la
   fiche PDF, la vidéo du replay et chaque média du corps. **Le RÔLE décide du
   bucket, pas le format** : `couverture` → public, tout le reste → privé et
   servi par URL signée de 300 s. Les adresses collées à la main continuent de
   marcher.

3. **On peut publier tout de suite.** Trois diffusions — maintenant, programmer,
   brouillon —, le créneau ne s'affiche que sous « programmer », et **un
   brouillon a enfin le droit d'être incomplet**. Le bouton « Brouillon »
   d'avant envoyait la même chose que son voisin ; il a disparu.

> **Un défaut rencontré au passage, hors demande** : `offres-v3.tsx` déclarait
> une région vivante sur un message présent au premier rendu. Le test
> d'architecture le refusait — la porte était donc rouge avant même ces quatre
> chantiers. Corrigé.

---

### La toute prochaine tâche

**Écrire le test qui couvre la traduction verdict → redirection.** Les 9 tests
existants couvrent la fonction SQL ; ils ne couvrent pas la page. Les cinq
situations sont vérifiées **à la main** (Playwright), pas par la porte.

C'est exactement le maillon manquant qui a produit deux défauts cette session
(la facture jamais émise, la lecture incomplète qui écrasait) :
**un chaînon ne se teste pas en testant ses deux bouts.**

Résultat de l'essai manuel, à reproduire en test :

| Situation | Destination | Bandeau d'impayé |
| --- | --- | --- |
| pas connecté | `/fr/connexion?suite=/fr/espace` | — |
| sans adhésion | `/fr/offres?motif=espace` | — |
| adhésion active | `/fr/espace` | non |
| fin programmée (`annule`) | `/fr/espace` | non |
| impayé, grâce en cours | `/fr/espace` | **oui, avec date** |
| impayé au-delà de la grâce | `/fr/offres?motif=renouveler` | — |

---

## 2. Ce qui est TERMINÉ et commité

### Avant l'Association (chantier admin V3)

- **`cefedfb`** — les factures sont enfin émises (`fulfill_order` appelait
  `emettre_facture`… en fait non, personne ne l'appelait : migration `0094`),
  la résiliation passe par le prestataire, le tiret est autorisé dans les codes
  promo, et `subscriptions.id_prestataire` — **toujours nul** — est réparé
- **`b4ecd94`** — l'écran Offres d'abonnement, **écart de dimension nul**
- **`674a096`** — l'écran Association DAVE (admin) + **l'article adhérent**
  `/association/<slug>` en V3, tous deux à **écart de dimension nul**

### Le produit associatif (décision du propriétaire, 28 septembre)

Le propriétaire a demandé d'implémenter le document
**« 11 — Association DAVE : fonctionnalités complètes »** (sur son Bureau),
*bien qu'absent du cahier des charges*. Il fait désormais référence.

- **`e6c4c19`** — le socle : migrations `0096` → `0105`, et l'éditeur `daveEdit`
- **`b02398b`** — les cinq onglets de `dave`

**Étapes 1 et 2 du `docs/CHANTIER-ASSOCIATION.md` : terminées.**

### Dernière porte verte

`2164 / 2164`, aucun ignoré, `146 fichiers`, **code de sortie 0** — le
29 septembre, port 3000 libéré et jeu de démonstration purgé. Toute régression
se mesure à partir de là.

`tests/effectif-attendu.json` est à jour : aucun fichier n'a baissé, et les deux
fichiers neufs y sont inscrits — `association-corps-media` (7) et
`espace-adherent-acces` (9), ce dernier n'ayant jamais franchi la porte avant
aujourd'hui.

> **Deux pannes d'environnement ont produit cinq faux échecs ce jour-là**, et
> aucune ne venait du code : le **jeu de démonstration** laissé en base (4
> échecs dans `stats` et `subscriptions`, qui comptent les abonnements
> globalement), et le **serveur de développement** sur le port 3000, qui fait
> expirer `middleware.test.ts` au bout de 30 s. Les écarter coûte deux
> commandes ; les déboguer coûte une heure.

---

## 3. Ce qui RESTE à faire

### Étape 3 — l'espace adhérent (en cours, voir §1)

- [x] la règle d'entrée + ses 9 tests
- [x] les données de l'espace, la page, le rendu
- [x] le motif du renvoi sur la page des offres
- [ ] **le test de la traduction verdict → redirection** ← la prochaine chose
- [ ] **l'article avec ses commentaires** (A4) : zone de saisie, mention
      « visible uniquement par les adhérents, modéré », liste des messages
      publiés, bouton cœur, « À lire ensuite »
- [ ] le retour « ← Espace adhérent » quand on vient de l'espace (contre
      « ← Tous les contenus » depuis la page publique)

### Étape 4 — les automatismes

- [ ] **publication à la date programmée** (une tâche serveur ; `programme_le`
      et `statut_publication` existent déjà)
- [ ] **les sept e-mails** de la Partie A6 du document
- [ ] **les liens signés** pour les fiches PDF et les vidéos, et le **dépôt**
      des fichiers dans un bucket privé (aujourd'hui l'éditeur ne prend qu'une
      adresse, et l'aide du champ le dit)
- [ ] le bouton **« S'inscrire »** de l'agenda (il attend l'e-mail de
      confirmation et le `.ics` — aujourd'hui l'écran n'affiche que l'état)
- [ ] l'export CSV des adhérents, la liste des inscrits d'un événement

### Le chantier admin V3 (indépendant)

`docs/CHANTIER-ADMIN-V3.md` : **9 écrans sur 16**. Restent 4 écrans de
Catalogue (ajout/détail conte et livret) et 3 de Communauté (Utilisateurs,
Avis, Témoignages).

### Décisions en attente du propriétaire

| Question | État |
| --- | --- |
| Puces « Ce que l'offre ouvre » par formule | **en attente** — implique de refondre la page publique des Offres pour qu'elle boucle sur les formules |
| Table de lecture par adhérent (« Nouveau » = récent **et non lu**) | en attente — aujourd'hui l'étiquette dit « Récent », ce qui est vrai |
| Profil d'adhérent (Parent, Enseignante…) : déclaratif ou déduit ? | en attente — l'onglet Adhérents affiche la FORMULE à la place |
| Les 3 actions du tiroir Commandes | recommandé : faire **« renvoyer l'e-mail »** seul, écarter les deux autres |
| Portée des codes promo | recommandé : **limite par client** seule (90 % déjà en base), écarter « première commande » et la portée par titre |

---

## 4. LES ERREURS À NE PLUS COMMETTRE

Chacune a coûté du temps **dans cette session**. Elles sont classées par ce
qu'elles ont en commun : **du code qui marche et qui ne proteste pas**.

### 4.1 Lire un faux vert

```bash
npm run verify | tail -12        # ❌ $? est celui de `tail`
npm run verify > log; echo $?    # ❌ $? est celui de `echo`
npm run verify > log 2>&1        # ✅ le code de sortie est le sien
```

**Arrivé deux fois.** La seconde, j'ai annoncé « vert » sur une porte qui
sortait en 1 avec 23 échecs. Lancer `verify` **seule**, et lire le code que la
notification rapporte.

### 4.2 `revoke select (colonne)` ne retire RIEN

PostgreSQL accepte `revoke select (col) on t from anon` **sans broncher** quand
`anon` tient un `SELECT` au niveau de la **table**. La commande réussit et ne
fait rien.

Le seul modèle qui tienne, et qui est celui du dépôt :

```sql
revoke select on public.ma_table from anon, authenticated;
grant select (col_a, col_b, ...) on public.ma_table to anon, authenticated;
```

**Toujours vérifier à la main** : `set role anon; select colonne_interdite …`
doit **échouer**.

### 4.3 Aucune cascade vers `users`

`account-lifecycle.test.ts` l'interdit : « une cascade oubliée emporterait
l'historique au premier effacement de compte, **sans bruit** ». Utiliser
`on delete restrict`, et écrire l'effacement **quelque part** — ici
`association_effacer_traces`, appelée par `anonymize_user` **et** par
`deleteTestUser`.

### 4.4 Une fonction de LECTURE incomplète détruit

`admin_lire_contenu_association` ne rendait pas les champs ajoutés par les
migrations suivantes. L'éditeur la lit pour se remplir : il chargeait des
**valeurs par défaut**, et le premier enregistrement les écrivait. Un replay
perdait son lien, et l'écran affichait un succès.

**Après toute migration qui ajoute une colonne, vérifier qui LIT cette table.**

### 4.5 Les tests d'architecture lisent les COMMENTAIRES

- `design-tokens.test.ts` a refusé `#fff` écrit dans un commentaire qui
  expliquait *pourquoi je n'employais pas de blanc* ;
- `frontend-architecture.test.ts` a refusé, **deux fois le 29 septembre**, un
  commentaire qui NOMMAIT ce qu'il justifiait de ne pas employer : le nom du
  client de service dans l'éditeur, puis le nom du rôle de région vivante dans
  `offres-v3`. Écrire « le client de service Supabase » et « aucune région
  vivante ici » suffit, et se lit aussi bien ;
- `bornes-temporelles.test.ts` scanne `pg_get_functiondef` : ne jamais écrire
  `>= p_at` ni `< p_at`, même en commentaire. La convention est `> p_at` pour
  la validité, `<= p_at` pour l'échéance.

### 4.6 Un nouveau `code:` d'erreur a besoin de sa traduction

`i18n.test.ts` **énumère** les codes dans les sources. Tout
`fail(422, { code: 'x', message })` exige `erreurs.x` dans `fr.json` **et**
`en.json`. Arrivé deux fois (`resiliation_impossible` & co., puis
`evenement_refuse`).

### 4.7 Toute `<img>` écrite à la main déclare `loading` et `decoding`

`images-discipline.test.ts` : « poser `loading` explicitement, même à `eager` :
l'oubli n'est pas un choix ». Arrivé deux fois.

### 4.8 Une classe CSS employée sans être déclarée rend `class="undefined"`

`classes-css.test.ts`. Mes `styles.citation` et `styles.figure` existaient dans
le TSX, pas dans le module : la citation et la photo s'affichaient sans aucune
mise en forme, **sans erreur**.

### 4.6 bis Une FONCTION ne traverse pas la frontière serveur → client

Les propriétés d'un composant client sont SÉRIALISÉES par le serveur. Une
fonction ordinaire ne l'est pas : Next refuse à l'exécution.

Le défaut passe **tous** les filets habituels. `tsc` est content, le type
déclare bien une fonction. ESLint aussi. Et les tests de composant le sont
encore plus : ils rendent le composant SANS frontière, donc lui passent la
fonction sans broncher. L'écran répond **200**, puis la limite d'erreur prend
la main dans le navigateur, avec un identifiant de trace et rien d'autre.

Arrivé le 29 septembre sur l'éditeur de publication : une fonction
`lienVersion` qui fabriquait deux adresses. Deux chaînes l'ont remplacée.

Les Server Actions font exception, et c'est la seule : elles portent une marque
qui leur tient lieu d'adresse. Une flèche écrite sur place n'en a pas.

`frontend-architecture.test.ts` l'interdit désormais, et le contre-test a été
fait : le test attrape bien le défaut d'origine.

### 4.7 bis `errors.validation` rend **400**, pas 422

`422` est réservé aux refus MÉTIER posés à la main (`publication_incomplete`,
`replay_une_seule_video`). Une entrée qui ne passe pas les contrôles d'une route
sort en `400 requete_invalide`. Trois tests écrits sur la mauvaise hypothèse le
29 septembre.

### 4.8 bis Une classe de segment HORS de son conteneur ne se dessine pas

`.segOpt` n'a ni fond, ni trait, ni rayon : c'est `.seg` qui les porte. Employée
seule — pour des puces dont on choisit PLUSIEURS —, elle laisse le bouton
retomber sur le dessin du navigateur : gris système, trait système, et sur un
poste en thème sombre un gris presque noir sur une carte sombre.

Rien ne le signale. Un bouton sans style reste un bouton, et il marche.

### 4.9 Un composant CLIENT n'importe pas le tonneau `@/components/admin`

Il exporte aussi `GabaritAdmin`, qui tire `session.ts`, qui tire le client de
service — donc `service_role` dans le paquet du navigateur. Next refuse de
compiler, et **c'est la seule chose** qui sépare un barillet commode d'une clé
publiée. Importer directement :

```ts
import { BoutonSoumission } from '@/components/admin/BoutonSoumission';
import styles from '@/components/admin/admin.module.css';
```

### 4.10 Un `beforeAll` qui tombe ne fait pas échouer : il fait DISPARAÎTRE

Une fixture refusée par une contrainte a fait passer 12 tests en **ignorés**.
`scripts/porte-tests.mjs` le rattrape, mais il faut savoir le lire : chercher
`skipped` autant que `FAIL`.

### 4.11 `* 100` est interdit par le lint

La règle protège les **montants** (`src/domain/money` — toutes les devises n'ont
pas deux décimales). Pour une **jauge**, suivre le précédent de l'écran des
promos : une constante `POUR_CENT = 100` avec le commentaire qui dit que ce
n'est pas de l'argent.

### 4.12 Ne pas recopier une valeur que le projet a déjà

Le document disait « 7 jours » ; `business_settings.periode_grace_jours` **vaut
déjà 7**. La recopier aurait fait **deux tolérances**, et changer le réglage au
back-office n'aurait plus rien changé à l'espace. Les tests eux-mêmes **lisent**
le réglage plutôt que d'écrire `7`.

### 4.13 Pièges d'outillage (Windows / Git Bash)

- **Les heredocs perdent un niveau d'échappement sur les antislashs.** C'est
  ainsi qu'un octet `\b` (retour arrière, 0x08) s'est retrouvé dans un fichier
  JavaScript, rendant une regex inopérante. Pour un fichier long ou contenant
  des antislashs : **utiliser l'outil Write**, pas `cat <<'EOF'`.
- **`io.open(f,'w').write(io.open(f).read()...)` VIDE le fichier** : l'ouverture
  en écriture tronque **avant** que l'argument soit évalué. J'ai vidé
  `docs/CHANTIER-ASSOCIATION.md` comme ça (restauré par `git checkout`).
  Toujours : lire → transformer → **une seule** écriture à la fin.
- **Trois fichiers du dépôt sont en CRLF** : `src/app/api/webhooks/payments/route.ts`,
  `src/adapters/payment/notchpay/notchpay-payment-provider.ts`, et
  `src/app/[langue]/association/[slug]/page.tsx`. Les éditer au niveau de
  l'**octet**, en convertissant les chaînes recherchées. Vérifier ensuite
  `git diff --numstat` : une explosion de lignes trahit une conversion.
- **`cat -A | sed 's/\$$//'` masque les `^M`** — ne pas s'en servir pour
  détecter les fins de ligne. Compter les octets.
- Un **serveur `next dev` fantôme** occupe parfois le port 3000 et rend des 500
  sur du code sain. `netstat -ano | grep :3000` avant de déboguer.
- Le **pilote pg rend une colonne `date` en `Date` à MINUIT LOCAL** :
  `getUTCDay()` lit alors la veille. Demander le jour de la semaine **à la
  base** (`extract(isodow …)`).
- `pg_get_functiondef` **ne rend pas** de point-virgule final.
- `create or replace` avec une **arité différente** crée une surcharge, pas un
  remplacement. Et changer le **type de retour** exige un `drop` préalable.

### 4.13 bis Une valeur par défaut qui vaut « l'état courant » n'est pas un choix

Le champ caché `publier` valait `publication.publie`. Conséquence : un texte
neuf ne pouvait JAMAIS paraître tout de suite, puisqu'il n'était pas encore
publié. Le bouton « Brouillon » d'à côté envoyait exactement la même chose que
le bouton principal — deux gestes, un seul effet, et rien pour le signaler.

Quand deux commandes existent, vérifier qu'elles envoient des choses
DIFFÉRENTES. Ici il suffisait de lire le formulaire.

### 4.13 ter Ce qui part en base n'est pas ce qui s'affiche

Un champ de média porte un CHEMIN DE STOCKAGE, `association-fichiers/…`. Un
navigateur le prend pour une adresse relative et va chercher là où il n'y a
rien : l'éditeur voit son propre fichier cassé et croit son dépôt raté, alors
qu'il a réussi.

La route rend donc DEUX valeurs — `chemin`, qui part en base, et `apercu`, qui
ne sert qu'à l'écran. Les confondre dans l'autre sens serait pire : écrire
l'aperçu en base y poserait une URL signée, périmée cinq minutes plus tard.

### 4.13 quater Un dépôt muet passe pour un dépôt raté

Signalé par le propriétaire : « j'ai chargé un fichier depuis mon PC mais il ne
s'affiche pas ». Le fichier était **bien monté** — 854 Ko dans
`association-fichiers` — et aucune publication ne le référençait : il n'avait
jamais été enregistré, parce que rien ne disait qu'il était arrivé.

La couverture avait un aperçu ; les blocs du corps n'en avaient aucun. Le seul
retour visible était un champ qui se remplissait d'un chemin de stockage,
c'est-à-dire de ce qui ressemble le plus à rien.

Deux ajouts : la confirmation « ✓ *nom du fichier* déposé », et l'aperçu du
média dans le bloc. **Le nom d'origine est jeté par le serveur, et c'est voulu ;
il reste parfaitement bon pour DIRE, à l'écran, ce qui vient de partir.**

### 4.13 quinquies En `dev`, la PREMIÈRE requête vers une route neuve compile

Trente secondes possibles. Un Playwright qui attend six secondes conclut que le
dépôt n'est pas parti — alors que la requête est en vol. Deux fois de suite le
29 septembre, avec à chaque fois vingt minutes cherchées dans le mauvais code.

Le signe qui distingue les deux : `page.on('request')` voit le POST, mais
`page.on('response')` ne voit rien. Requête partie, réponse en attente.

### 4.13 sexies `width: 100%` ne borne pas une image, il l'ÉTIRE

Une colonne de 844 px rend une photo de téléphone (3:4) sur **1 125 px de
haut** : plus d'un écran, pour une illustration au milieu d'un paragraphe. Il
faut les deux bornes — `max-width` ET `max-height` —, avec `width: auto` pour
que l'image garde ses proportions et `margin: 0 auto` pour qu'elle se centre.

Et `object-fit: cover` n'est PAS la réponse : il recadre. Sur une couverture
c'est voulu, le format est décidé par le dessin ; sur une photo de terrain,
cela coupe la tête des gens.

Pire en V2 : `.corps` n'avait **aucune** règle pour `img`, `video`, `audio`.
Sans largeur déclarée, une image s'affiche à sa taille naturelle — quatre mille
pixels débordaient la page et y ajoutaient un défilement horizontal. Personne
ne l'avait vu parce que les huit contenus d'origine portaient des photos
choisies à la main. Le dépôt de fichiers a changé cela : ce qui arrive
maintenant est ce qui sort de l'appareil.

### 4.14 Deux sondes qui crient = UNE cause

Sur la carte d'offre comme sur l'article, deux sondes de relevé montraient le
même décalage : il manquait **une seule** marge. Sonder les étages
intermédiaires trouve la cause ; ajuster la sonde qui crie la déplace.

### 4.15 Ne jamais relancer la porte après un arrêt pour mémoire

Le harnais l'arrête quand la mémoire système est critique. **Le signaler et
attendre qu'on la redemande** — ce n'est pas un échec de la commande.

---

## 5. Décision documentaire prise le 28 septembre

Sur instruction explicite du propriétaire, **`docs/cahier-des-charges.md` a été
modifié** (ce qui est normalement interdit) :

- **§4.1 F4 bis** : la règle « *Aucun téléchargement, aucun fichier : l'espace
  ne sert que du texte* » est **retirée**. Une sous-section la cite, date la
  décision et explique pourquoi elle existait et pourquoi elle tombe.
- **Arbitrage n° 15** ajouté au tableau des décisions.
- **Arbitrage n° 13 précisé** : « aucun des deux n'ouvre de téléchargement »
  devient « …le téléchargement **d'un livre du catalogue** », avec un renvoi
  vers le 15 — sans quoi les deux se contredisaient à la lettre.

**Ce qui reste non négociable, et qui est écrit dans le document** : le
téléchargement d'un livre du catalogue n'est accordé que par un **achat** ; les
fichiers de l'espace passent par des **liens signés de courte durée** et leur
adresse en base n'est **pas lisible** ; l'étanchéité des deux abonnements tient.

---

## 6. Méthode et outils

### La mesure au pixel

`node scripts/releve-v3.mjs <scène>` compare l'application au prototype local.
Scènes de la session : `admin-offres`, `admin-association`,
`association-article`. **Le serveur doit tourner.**

**Politique chromatique arrêtée** : les dimensions sont exactes, les couleurs
sont les nôtres, et chaque divergence est documentée — teinte de carte
(`#F9F4ED`), trois jetons de chrome sombre, encre foncée sur terracotta,
étiquettes d'état bordées pour le contraste, filet à 14 % contre 16 %.

### La porte

```bash
# le port 3000 doit être LIBRE (middleware.test.ts simule une panne réseau)
npm run verify > /c/Users/UTILIS~1/AppData/Local/Temp/verify.log 2>&1
```

Durée ~10 min. Docker doit tourner.

### Compte d'administration local

`admin@editionmapoukam.test` / `Adm-Mapoukam-2026` — déjà dans
`scripts/releve-v3.mjs` ligne 47.

### Jeu de démonstration

`node scripts/demo-ventes.mjs` sème commandes et abonnements par le vrai
chemin ; `--vider` purge. **Purger avant la porte** : quatre tests comptent les
abonnements globalement. De même, ne laisser **aucun conte d'essai** en base —
`access.test.ts` et `schema.test.ts` attendent 10 livres.

---

## 7. Deux règles de conduite qui ont servi

**Ne pas annoncer vert sans avoir lu le code de sortie.** Je l'ai fait une fois,
et je l'ai corrigé devant le propriétaire.

**Quand une règle du dépôt contredit un raisonnement, la règle gagne.** J'avais
un argument défendable pour les cascades vers `users` ; le test l'a refusé, et
sa raison portait plus loin que mon argument — elle protège contre l'**oubli**,
qui ne raisonne pas.
