# État des lieux de fin de chantier

**Édition Mapoukam — backend. 30 juillet 2026.**

Seize étapes livrées. `npm run verify` : **1 000 tests dans 55 fichiers, aucun
ignoré, code de sortie 0.**

Ce document dit ce qui est couvert, ce qui ne l'est pas, les écarts assumés avec
la spécification et leur raison, et ce que représenterait le branchement d'un
prestataire de paiement réel.

L'inventaire de ce qui reste à faire avant d'encaisser est dans
`docs/AVANT-MISE-EN-PRODUCTION.md`, qui se lit seul.

---

## 1. Ce qui est couvert

### La règle métier centrale

> L'abonnement donne accès à la **lecture en ligne**. Il ne donne **jamais** le
> droit de télécharger. L'achat à l'unité donne le téléchargement et la lecture
> sans limite de durée.

Cette séparation est tenue à trois niveaux : par le moteur de droits en base, par
le service de téléchargement, et par un parcours complet qui la vérifie de bout
en bout. **Le bug classique du domaine** — un abonnement expiré qui emporte les
titres achetés — a son parcours dédié : un abonné qui a aussi acheté voit son
abonnement expirer et conserve son achat, lecture **et** téléchargement.

### Par domaine

| Domaine | Ce qui est couvert |
|---|---|
| **Droits d'accès** | Une seule implémentation, en base, appelée par les politiques RLS **et** par l'application. Matrice complète : abonné, acheteur, visiteur, essai, impayé, grâce, annulation, expiration, fenêtre de vente, droits offerts, droits à durée limitée |
| **Catalogue** | Recherche plein texte, filtres, tri, pagination plafonnée, prix par zone sans repli silencieux |
| **Ingestion** | PDF → pages WebP en deux résolutions, couche texte, couverture, EPUB 3 à mise en page fixe. **Les seize titres du corpus produisent un EPUB conforme, zéro erreur, zéro avertissement** |
| **Commandes** | Panier, codes promotionnels, zones tarifaires, création atomique, aucun prix calculé côté client |
| **Paiements** | Signature vérifiée, idempotence, octroi atomique, remboursement **par ligne** de commande |
| **Abonnements** | Machine à états pure, statut observé calculé, état `anomalie` nommé, période de grâce |
| **Téléchargement** | Filigrane PDF et EPUB, échec fermé — jamais de repli sur le fichier nu, journal, purge sans danger |
| **Progression** | Par livre **et** par langue, repli borné, regroupement des écritures, horodatage serveur |
| **Administration** | Journal d'audit par déclencheurs, acteur obligatoire, rôle vérifié deux fois, pagination et quota plafonnés |
| **Statistiques** | Agrégation en SQL, jamais nominative, seuil sur le comportemental, exactitude sur le comptable |
| **Emails** | Boîte d'envoi transactionnelle, idempotence sur l'événement, aucun lien signé, bilingue |

### La discipline de test

Ce qui distingue cette suite d'un simple filet :

- **La porte refuse tout test non exécuté.** Aucun `.skip`, aucun `.todo`, aucune
  liste blanche. L'effectif est tenu **par fichier** : dix tests de sécurité
  remplacés par dix tests de formatage rend la porte rouge, alors que le total ne
  bouge pas.
- **Tout test dont l'échec protège une règle doit prouver qu'il peut échouer.**
  Cinq occurrences de « validation vide » ont été trouvées et corrigées ; la
  règle qui en découle est écrite.
- **Les tests de sécurité énumèrent, ils n'échantillonnent pas.** Les routes sont
  découvertes sur le disque : une route ajoutée demain est couverte sans que
  personne n'y pense.

---

## 2. Ce qui n'est pas couvert

### Hors périmètre, par décision

- **Aucune interface utilisateur**, hors la console de simulation `/dev`. Le
  chantier est backend.
- **Aucun SDK de service externe.** Stripe, Resend et consorts sont simulés par
  des adaptateurs locaux.

### Non traité, et à traiter

Voir `docs/AVANT-MISE-EN-PRODUCTION.md`. En résumé : cinq bloquants, dont trois
se résolvent en branchant un ordonnanceur.

### Angles morts connus

- **Une étape n'a pas pu être rejouée.** L'étape 5, dans l'environnement
  d'aujourd'hui, échoue sur une incompatibilité de version d'une dépendance — non
  sur son propre code. Le contrôle statique la couvre ; c'est une preuve plus
  faible qu'une exécution, et elle est notée comme telle.
- **Quatre étapes ont été validées sans validateur EPUB.** Découvert en rejouant
  l'historique, corrigé depuis, et le format est désormais prouvé conforme sur
  les seize titres.
- **La charge n'a pas été éprouvée.** Aucun test de montée en charge, aucune
  mesure sous concurrence réelle. Les sémaphores et les quotas sont dimensionnés
  par raisonnement, pas par mesure.
- **La restauration n'a pas été éprouvée.** Les migrations sont jouées à
  l'endroit, jamais à l'envers.

---

## 3. Écarts assumés avec la spécification

| Écart | Raison |
|---|---|
| `entitlements.type` n'a plus la valeur `abonnement` | L'accès par abonnement est **recalculé**, jamais matérialisé. Matérialiser un droit d'abonnement obligerait à le synchroniser à chaque changement d'état — et une synchronisation ratée laisse un accès ouvert après expiration |
| `books.prix` supprimé au profit de `book_prices` | Deux sources de prix divergent. Une seule table, une ligne par zone |
| Colonnes ajoutées : `gratuit`, `nb_pages_extrait`, `book_translations.statut`, `orders.zone`, `entitlements.source_id`, `subscriptions.zone` et `jours_essai` | Figer les conditions tarifaires à l'achat, régler l'extrait par titre, et rendre l'octroi traçable et idempotent |
| La progression est stockée **par langue**, non par livre | L'intention de la spécification — « basculer de version ne perd pas la page » — est tenue par un repli borné. Le stockage par livre seul aurait promis une reprise qui, un jour, pointerait au-delà de la fin du livre : deux versions linguistiques sont deux PDF distincts |
| `reading_progress.maj_le` utilise l'heure **réelle**, seule colonne du schéma dans ce cas | Elle arbitre une concurrence entre appareils, elle ne date pas un fait métier. Avec l'horloge simulée, un déplacement du temps ferait perdre une écriture postérieure au profit d'une antérieure |
| Le service des pages contourne les politiques RLS | Écart avec la règle de sécurité n°1, compensé par trois tests d'architecture. **Chiffré ci-dessous** |
| Un code promotionnel à montant fixe porte une **zone** en plus de sa devise | « 5 € de réduction » n'a aucun sens sur un panier en francs CFA. La devise seule ne suffit pas : la zone `afrique` couvre XAF et XOF |
| Aucun total de chiffre d'affaires consolidé | Additionner des devises sans taux ne produit pas un chiffre approximatif : il n'en produit aucun |

### Chiffrage — un rôle PostgreSQL dédié au service des pages

**Le problème.** Le service de lecture utilise une clé privilégiée qui contourne
les politiques RLS, et applique le contrôle des droits dans le code. Si ce code
était contourné, plus rien ne protégerait la table des pages.

**L'option.** Un rôle PostgreSQL dédié, soumis au RLS, avec une politique
appelant le moteur de droits. Le contrôle passerait alors **de l'application à la
base** : même une erreur de code ne pourrait plus servir une page à qui n'y a pas
droit.

**Coût estimé — 3 à 5 jours :**

| Poste | Estimation |
|---|---|
| Migration : rôle, privilèges, politique RLS sur `book_pages` | 0,5 j |
| Fabrique d'un client Supabase utilisant ce rôle, et propagation de l'identité de l'appelant jusqu'à la politique | 1 j |
| Reprise du service de pages et de la chaîne d'ingestion (qui écrit avec un autre rôle) | 1 j |
| Tests : isolation entre deux utilisateurs **au niveau base**, non plus au niveau code | 0,5 j |
| Reprise des trois tests d'architecture, devenus partiellement redondants | 0,5 j |
| Marge — la propagation d'identité hors du contexte PostgREST est le point incertain | 1 à 1,5 j |

**Risque principal.** Faire porter l'identité de l'appelant jusqu'à une politique
RLS depuis un client serveur n'est pas un chemin balisé chez Supabase. Si cette
propagation s'avère fragile, l'option coûterait davantage sans rien garantir de
plus que les tests d'architecture actuels.

**Recommandation.** À faire **si** le service de pages doit un jour être appelé
par autre chose que le module unique qui l'appelle aujourd'hui. En l'état, les
trois tests d'architecture tiennent la garantie à un coût nul. **Ne pas
l'engager sans arbitrage.**

---

## 4. Brancher un prestataire de paiement réel

**C'est le point où la conception du projet doit se payer.** Toute la logique
métier ignore quel adaptateur est branché ; aucun module ne nomme Stripe ni aucun
autre prestataire.

### Ce qui ne bouge pas

- Le gestionnaire de webhooks. Il vérifie une signature, journalise, applique.
  **Il est déjà réel.**
- L'octroi des droits, l'idempotence, le remboursement par ligne.
- Les emails, les factures, les statistiques.
- Tous les tests de règle métier.

### Ce qu'il faut écrire

| Poste | Estimation |
|---|---|
| Adaptateur `StripePaymentProvider` implémentant l'interface existante | 2 j |
| Vérification de signature au format du prestataire — la nôtre est en HMAC-SHA256, la leur diffère dans les détails | 0,5 j |
| Correspondance entre leurs types d'événements et les nôtres | 1 j |
| Création des sessions de paiement et redirection | 1,5 j |
| Zone d'encaissement depuis le pays réel du moyen de paiement (aujourd'hui fourni par la console) | 0,5 j |
| Tests d'intégration contre l'environnement de test du prestataire | 2 j |
| **Total** | **7 à 8 jours** |

### Les pièges connus

- **Les webhooks arrivent dans le désordre.** Un `renouvelé` peut précéder un
  `souscrit`. La machine à états les absorbe déjà.
- **Le prestataire réémet jusqu'au 200.** L'idempotence est éprouvée : un
  événement rejoué deux fois est traité une seule.
- **Les montants sont en plus petite unité, et le franc CFA n'en a pas.** Le
  projet le sait déjà — 500 XOF valent 500, pas 50 000.
- **Le mobile money d'Afrique de l'Ouest n'a pas les mêmes états qu'une carte.**
  L'énumération des statuts devra probablement s'élargir, et c'est la seule
  reprise qui touchera au cœur.

---

## 5. Ce que je referais autrement

Trois choses, dites franchement parce qu'elles éclairent la lecture du dépôt :

1. **La porte de validation aurait dû être écrite à l'étape 0.**
   `--passWithNoTests` était présent depuis le premier jour, et quatre étapes ont
   été validées avec un test absent. Le coût de la découverte tardive a été une
   reprise complète de l'historique.

2. **La règle d'extraction verbatim des fonctions SQL aurait dû être posée à la
   première redéclaration**, pas à la troisième. Une réécriture de mémoire a
   perdu un garde qu'aucun test ne couvrait.

3. **Les fixtures auraient dû être aussi fortes que ce qu'elles représentent dès
   le départ.** Un `%PDF-1.4\n%%EOF` en guise de PDF, et un jeu de données qui se
   contredisait lui-même, ont masqué une divergence réelle du code pendant
   plusieurs étapes.

Ces trois leçons sont écrites dans `docs/PLAN.md` comme règles permanentes, avec
le raisonnement qui les fonde — non comme des notes, pour qu'elles survivent à
qui les a écrites.
