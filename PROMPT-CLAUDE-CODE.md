# Prompt de lancement — Claude Code (backend, 100 % local)

> À coller dans Claude Code, à la racine du dépôt, une fois `CLAUDE.md`,
> `docs/cahier-des-charges.md` et `.env.local` en place.

---

```
MISSION

Développe et teste l'intégralité du backend de la plateforme décrite dans
docs/cahier-des-charges.md. Lis d'abord CLAUDE.md, puis la spécification en
entier avant d'écrire la moindre ligne de code.

CONTRAINTE MAJEURE : tout doit fonctionner en local, sans aucun service externe
et sans aucune clé API de tiers. N'installe aucun SDK de service externe. Les
paiements et les emails sont simulés par des adaptateurs locaux, comme décrit
dans CLAUDE.md.

Le principe à respecter : seul l'émetteur est simulé, le récepteur est réel. Le
faux prestataire de paiement envoie de vrais webhooks signés vers le vrai
gestionnaire de webhooks. La vérification de signature, l'idempotence et l'octroi
atomique des droits sont développés et testés pour de bon, pas contournés.

Périmètre : schéma de base de données, politiques de sécurité, authentification,
moteur de droits d'accès, API du catalogue, chaîne d'ingestion des PDF, service
de fichiers protégé, commandes, paiement simulé, abonnements, téléchargement
filigrané, progression de lecture, API d'administration, statistiques, emails
simulés, console de simulation.

Hors périmètre : toute interface utilisateur, à l'exception de la console de
simulation /dev qui peut rester rudimentaire.

MÉTHODE — à respecter strictement

1. Commence par produire docs/PLAN.md : le plan d'implémentation complet,
   découpé en étapes numérotées. Pour chaque étape : son objectif, les fichiers
   qu'elle produit, ses dépendances, et ses critères d'acceptation sous forme de
   commandes vérifiables. Soumets-moi ce plan et ATTENDS ma validation avant
   d'écrire du code.

2. Ensuite, traite les étapes une par une, dans l'ordre. Pour chaque étape :
   a. Annonce l'étape et ce que tu vas faire
   b. Implémente
   c. Écris les tests de l'étape
   d. Exécute `npm run verify` (typecheck + lint + tests)
   e. Si la commande échoue, corrige et recommence jusqu'à ce qu'elle sorte en 0
   f. Mets à jour docs/PLAN.md : coche l'étape, note ce qui a été fait et toute
      décision technique prise
   g. Fais un commit git avec un message décrivant l'étape
   h. Résume-moi le résultat, puis passe à l'étape suivante

3. Ne passe JAMAIS à l'étape suivante tant que `npm run verify` n'est pas vert.

4. Si une étape déjà validée doit être modifiée parce que c'est nécessaire pour
   avancer, tu as le droit de le faire. Dans ce cas, obligatoirement :
   - explique pourquoi la modification est nécessaire
   - applique-la
   - relance `npm run verify` en ENTIER, pas seulement les tests de l'étape
     courante — la régression sur les étapes précédentes est le risque principal
   - note la modification dans docs/PLAN.md, dans une section « Modifications
     rétroactives », avec sa raison

5. Si tu rencontres une ambiguïté dans la spécification, une règle métier absente,
   ou un choix structurant non tranché : ARRÊTE-TOI et pose-moi la question.
   N'invente pas. Une hypothèse silencieuse sur une règle de droits d'accès ou de
   facturation coûte plus cher que la question.

DÉFINITION DE « TERMINÉ » POUR UNE ÉTAPE

Une étape n'est terminée que si toutes ces conditions sont réunies :
- `npm run verify` sort en code 0
- les tests de l'étape existent et couvrent les cas nominaux ET les cas d'erreur
- pour toute nouvelle table : RLS activé, et un test prouvant qu'un utilisateur
  ne peut pas accéder aux données d'un autre
- pour toute nouvelle route API : validation Zod des entrées, et un test de rejet
  d'entrée invalide
- aucun secret en dur, aucun `any` non justifié, aucun `console.log`
- aucune mention d'un service externe dans la logique métier
- docs/PLAN.md est à jour
- un commit git a été fait

ORDRE DES ÉTAPES

Propose ton propre découpage dans docs/PLAN.md, mais respecte cet ordre de
dépendances :

  0.  Socle : TypeScript strict, ESLint, Vitest, scripts npm dont `verify`,
      Supabase local, outillage de migration, structure de dossiers, service
      `clock` injectable
  1.  Schéma de base de données complet (section 8 de la spécification),
      migrations, politiques RLS sur chaque table, jeu de données de seed
      comprenant au moins 8 contes couvrant tous les cas de figure
  2.  Authentification : inscription, connexion, vérification d'email,
      réinitialisation de mot de passe, rôles user/admin. Les emails de
      vérification arrivent dans l'interface de capture de Supabase local.
  3.  Interfaces des adaptateurs et implémentations locales :
      - interface `PaymentProvider` + `FakePaymentProvider`
      - interface `Mailer` + `FileMailer` écrivant dans `.mails/`
      - console de simulation `/dev`, inaccessible en production
      Aucune logique métier ici, uniquement les contrats et les faux adaptateurs.
  4.  Moteur de droits d'accès (table `entitlements`) — le cœur du système.
      Fonction unique et centrale qui répond à : cet utilisateur peut-il lire ce
      titre ? peut-il le télécharger ? Tests exhaustifs, voir ci-dessous.
  5.  API catalogue : liste, filtres, tri, recherche, fiche détail, extraits,
      gestion des versions linguistiques
  6.  Service de fichiers protégé : buckets privés, URLs signées à durée courte,
      vérification des droits à chaque requête
  7.  Chaîne d'ingestion des PDF (section 7.4) : analyse, rendu des pages en
      WebP deux résolutions, extraction de couverture, génération de l'EPUB à
      mise en page fixe, extraction de la couche texte, création de la fiche en
      brouillon
  8.  Panier et commandes
  9.  Tunnel de paiement branché sur `FakePaymentProvider`, gestionnaire de
      webhooks réel, signé et idempotent
  10. Cycle de vie des abonnements : essai, actif, renouvellement, échec de
      prélèvement, annulation, expiration — tous déclenchables depuis la console
      de simulation et testables en avançant l'horloge
  11. Téléchargement : génération du PDF filigrané à la demande, journalisation,
      limitation de débit
  12. Progression de lecture
  13. API d'administration : gestion du catalogue, des utilisateurs, des
      commandes, des codes promotionnels
  14. Statistiques agrégées
  15. Emails transactionnels via `FileMailer` : confirmation de commande,
      bienvenue d'abonnement, échec de prélèvement, liens de téléchargement
  16. Durcissement : revue de sécurité, limitation de débit globale, gestion des
      erreurs, tests de bout en bout des deux parcours complets (abonnement et
      achat), en pilotant la console de simulation

LA CONSOLE DE SIMULATION (étape 3)

Interface rudimentaire sur /dev permettant de déclencher à la main :
- payer une commande avec succès / la faire échouer / l'abandonner
- souscrire un abonnement, simuler un renouvellement, un échec de prélèvement,
  une annulation, une expiration
- avancer l'horloge d'un nombre de jours donné
- consulter les emails écrits dans .mails/
- réinitialiser l'état de démonstration

Chaque action émet un vrai événement signé vers le vrai gestionnaire de
webhooks. Elle ne modifie JAMAIS la base de données directement — sinon elle ne
teste rien.

Les routes /dev doivent être inaccessibles si NODE_ENV === 'production'. Écris un
test qui le prouve.

TESTS OBLIGATOIRES SUR LE MOTEUR DE DROITS (étape 4)

Ce module concentre le risque du projet. Il lui faut au minimum ces tests :
- abonné actif + titre inclus dans l'abonnement  → lecture OUI, téléchargement NON
- abonné actif + titre non inclus                → lecture NON, téléchargement NON
- abonnement expiré + titre acheté               → lecture OUI, téléchargement OUI
- abonnement expiré + titre non acheté           → lecture NON, téléchargement NON
- titre acheté, jamais abonné                    → lecture OUI, téléchargement OUI
- visiteur non connecté                          → extrait uniquement
- titre publié il y a moins de 3 mois            → hors abonnement même pour un
                                                   abonné actif (fenêtre de vente)
- titre publié il y a plus de 3 mois             → inclus dans l'abonnement
- droit octroyé manuellement par un admin        → lecture OUI

Les cas dépendant du temps sont testés en avançant l'horloge injectée.

TESTS OBLIGATOIRES SUR LES PAIEMENTS (étapes 9 et 10)

- webhook avec signature invalide → rejeté, aucun droit octroyé
- même événement reçu deux fois  → traité une seule fois, aucun doublon de droit
- paiement réussi                 → commande payée ET droits créés, dans une seule
                                    transaction atomique
- paiement échoué                 → aucun droit créé, commande en échec
- échec de prélèvement d'abonnement → statut `impaye`, accès maintenu pendant la
                                      période de grâce puis retiré
- annulation d'abonnement         → accès maintenu jusqu'à la fin de la période
                                    déjà payée, puis retiré

PRÉPARER LE BRANCHEMENT FUTUR

Sans installer aucun SDK, conçois l'interface `PaymentProvider` de sorte qu'un
adaptateur réel puisse s'y substituer sans toucher à la logique métier. Documente
dans docs/PLAN.md, en fin de parcours, la liste précise de ce qu'il restera à
faire pour brancher un prestataire réel.

FORMAT DE COMPTE RENDU

Après chaque étape, donne-moi :
- ce qui a été implémenté, en trois lignes maximum
- le résultat de `npm run verify`
- les décisions techniques prises et leur raison
- ce qui reste flou ou nécessite mon arbitrage

Sois direct. Si quelque chose ne marche pas ou si tu as un doute sur une
approche, dis-le au lieu de le contourner silencieusement.

COMMENCE MAINTENANT par lire CLAUDE.md et docs/cahier-des-charges.md, puis
produis docs/PLAN.md et attends ma validation.
```

---

## Prompt court de reprise de session

À utiliser à chaque nouvelle session Claude Code :

```
Lis CLAUDE.md et docs/PLAN.md. Dis-moi où on en est, quelle est la prochaine
étape non validée, et reprends le travail à partir de là en suivant la méthode
décrite dans PLAN.md.
```
