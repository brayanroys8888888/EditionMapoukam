# CLAUDE.md

Contexte permanent du projet. Lis ce fichier au début de chaque session.

## Le projet

Plateforme de contes africains illustrés pour enfants, avec deux modèles économiques
qui coexistent :

- **Abonnement** — donne accès à la **lecture en ligne** du catalogue. Ne donne
  jamais le droit de télécharger.
- **Achat à l'unité** — donne le droit de **télécharger** le fichier (PDF et EPUB)
  et de lire ce titre en ligne sans limite de durée.

Cette séparation est la règle métier centrale. Toute confusion entre les deux est
un bug critique.

Public : parents de 28 à 45 ans, dont une part importante en Afrique francophone
sur connexion lente. Langues : français et anglais.

La spécification complète est dans `docs/cahier-des-charges.md`. Elle fait foi.
En cas de contradiction entre ce fichier et la spécification, la spécification
gagne — signale-moi la contradiction plutôt que de trancher seul.

## Mode de développement : 100 % local, aucun service externe

**Aucune clé API de service externe n'est utilisée dans ce projet à ce stade.**
Aucun compte Stripe, aucun compte Resend, aucun service tiers. Tout tourne sur la
machine de développement.

Les actions qui dépendraient normalement d'un tiers sont **simulées par des
adaptateurs locaux**, derrière les mêmes interfaces que leurs futurs équivalents
réels :

| Service réel (plus tard) | Adaptateur local (maintenant) |
|---|---|
| Stripe | `FakePaymentProvider` + console de simulation |
| Resend (emails transactionnels) | `FileMailer` — écrit les emails dans `.mails/` |
| Emails d'authentification | Interface de capture d'emails de Supabase local |
| Supabase hébergé | Supabase local via Docker (`supabase start`) |

**Règle structurante :** seul l'**émetteur** est simulé, le **récepteur** est réel.
Le faux prestataire de paiement envoie de vrais webhooks signés vers le vrai
gestionnaire de webhooks. La vérification de signature, l'idempotence et l'octroi
atomique des droits sont donc développés et testés pour de bon.

Toute la logique métier ignore complètement quel adaptateur est branché. Si un
morceau de logique métier mentionne « Stripe » ou « Resend », c'est un défaut de
conception à corriger.

## Stack

| Couche | Technologie |
|---|---|
| Runtime | Node 20+, TypeScript strict |
| Framework | Next.js (App Router), routes API |
| Base de données | PostgreSQL via Supabase local (Docker) |
| Auth | Supabase Auth (local) |
| Stockage | Supabase Storage local (buckets privés) |
| Paiement | `FakePaymentProvider`, derrière l'interface `PaymentProvider` |
| Emails | `FileMailer`, derrière l'interface `Mailer` |
| Traitement PDF | poppler (`pdftoppm`, `pdftotext`) en sous-processus |
| Images | `sharp` |
| Filigrane PDF | `pdf-lib` |
| Tests | Vitest (unitaires et intégration) |

**Licences — interdiction stricte.** Ne jamais introduire `PyMuPDF` ni `ebooklib` :
elles sont sous AGPL, ce qui contaminerait une application exposée en réseau.
Toute nouvelle dépendance doit être sous licence permissive (MIT, Apache 2.0, BSD).
Les binaires GPL appelés en sous-processus (poppler) sont autorisés.

## Commandes

```bash
supabase start           # démarre la pile locale (base, auth, storage, mail)
supabase stop            # arrête la pile locale

npm run dev              # serveur de développement
npm run build            # build de production
npm run typecheck        # tsc --noEmit — doit sortir en 0
npm run lint             # eslint — doit sortir en 0
npm run test             # tous les tests — doivent tous passer
npm run db:migrate       # applique les migrations
npm run db:reset         # réinitialise la base locale et rejoue les seeds
npm run db:seed          # jeu de données de démonstration
npm run verify           # typecheck + lint + test — LA porte de validation
```

`npm run verify` est la commande qui valide une étape. Elle doit sortir en code 0.

## La console de simulation

Une interface de développement, montée sur `/dev`, permet de déclencher à la main
tout ce qui viendrait normalement d'un service externe :

- payer une commande avec succès
- faire échouer un paiement
- abandonner un paiement
- souscrire un abonnement
- simuler un renouvellement réussi
- simuler un échec de prélèvement
- simuler une annulation
- simuler l'expiration d'un abonnement
- **avancer le temps** d'un nombre de jours donné, pour tester les fins de période
  et la fenêtre de 3 mois des nouveautés sans attendre
- consulter les emails envoyés

Chaque action de cette console émet un vrai événement signé vers le vrai
gestionnaire de webhooks. Elle ne modifie jamais la base de données directement.

**Garde-fou obligatoire :** toutes les routes sous `/dev` sont inaccessibles si
`NODE_ENV === 'production'`. Un test doit le prouver.

## Règles de sécurité — non négociables

1. **RLS activé sur toutes les tables**, en refus par défaut. Aucune table sans
   politique explicite. Une table sans RLS est une faille, pas un oubli.
2. **La clé `service_role` ne quitte jamais le serveur.** Jamais dans un composant
   client, jamais dans une variable `NEXT_PUBLIC_*`.
3. **Les buckets de fichiers sont privés.** Aucun fichier de livre n'est jamais
   accessible par URL publique. L'accès passe systématiquement par une route
   serveur qui vérifie les droits puis émet une URL signée.
   Les URL signées ont une durée de validité de 300 secondes maximum pour tout
   contenu payant, sans exception. Les titres marqués `gratuit = true` peuvent
   avoir une durée allongée, plafonnée à 3600 secondes, et être mis en cache
   CDN. La vérification des droits reste effectuée à chaque requête dans les
   deux cas.
4. **Les droits sont toujours vérifiés côté serveur**, à chaque requête, contre la
   table `entitlements`. Jamais de confiance accordée à un état transmis par le
   client.
5. **Les webhooks sont la seule source de vérité** sur l'état d'un paiement. Une
   redirection de navigateur ne déclenche jamais l'octroi d'un droit. Signature
   vérifiée systématiquement, traitement idempotent. Cette règle s'applique aussi
   au faux prestataire.
6. **Aucun secret en dur dans le code.** Les valeurs locales vivent dans
   `.env.local`, non versionné.
7. **Aucune donnée d'enfant collectée.** Le compte appartient au parent adulte. Pas
   de prénom, d'âge ni de date de naissance d'enfant, nulle part dans le schéma.

## Règles métier à ne pas confondre

- Un abonnement **expiré** retire l'accès en lecture aux titres couverts par
  l'abonnement, mais **ne retire jamais** l'accès aux titres achetés à l'unité.
  C'est le bug classique de ce type de plateforme — il doit avoir un test dédié.
- Le droit de téléchargement (`peut_telecharger`) n'est accordé que par un achat,
  jamais par un abonnement.
- Un titre peut être simultanément inclus dans l'abonnement et vendu à l'unité.
  Les champs `inclus_abonnement` et `disponible_achat` sont indépendants.
- Les nouveautés sont vendues seules pendant 3 mois avant d'entrer dans
  l'abonnement. Cette règle s'applique par comparaison avec `publie_le`.

## Conventions de code

- TypeScript en mode `strict`. Aucun `any` implicite ou explicite sans commentaire
  justifiant.
- Pas de `console.log` en production — utiliser le logger du projet.
- Toute route API valide ses entrées avec Zod avant tout traitement.
- Les erreurs renvoyées au client ne divulguent jamais de détail interne.
- **Le temps ne se lit jamais avec `new Date()` directement dans la logique
  métier.** Il passe par un service `clock` injectable, pour que la console de
  simulation puisse avancer le temps et que les tests soient déterministes.
- Nommage : anglais pour le code, français pour les messages destinés à
  l'utilisateur.
- Les migrations SQL sont numérotées, jamais modifiées après application — on
  ajoute une migration corrective.

## Stratégie de test

Chaque étape livre ses tests en même temps que son code. Une étape sans test n'est
pas terminée.

- **Unitaires** — logique métier pure : calcul des droits, fenêtre de 3 mois,
  transitions d'état d'abonnement.
- **Intégration** — routes API contre la base locale réelle, pas de mock de base.
- **Sécurité** — pour chaque table, un test qui vérifie qu'un utilisateur A ne peut
  pas lire ou modifier les données d'un utilisateur B.
- **Webhooks** — signature invalide rejetée, événement rejoué deux fois traité une
  seule fois.
- **Temps** — les scénarios d'abonnement (fin de période, échec, expiration) sont
  testés en avançant l'horloge injectée, jamais en attendant.

## Ce qu'il ne faut pas faire

- Ne crée pas d'interface utilisateur, sauf la console de simulation `/dev`, qui
  peut rester très rudimentaire. Ce chantier est **backend**.
- N'installe aucun SDK de service externe (Stripe, Resend, etc.) à ce stade.
- N'invente pas de règle métier absente de la spécification — pose-moi la question.
- Ne passe pas à l'étape suivante si `npm run verify` échoue.
- Ne désactive pas un test pour faire passer la suite.
- Ne modifie pas `docs/cahier-des-charges.md`.
