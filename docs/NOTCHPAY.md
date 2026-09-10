# Notch Pay — le premier prestataire de paiement réel

Décision du propriétaire, **8 septembre 2026** :

> « les paiements sont gérés par l'API Notch Pay […] je rappelle qu'on ne va
> utiliser que la version paiement de test qu'offre Notch Pay. »

Documentation officielle : <https://developer.notchpay.co/>

Ce fichier dit **où coller les clés**, **ce que l'intégration fait**, et
surtout **ce qu'elle ne fait pas** — la seconde liste est la plus utile.

---

## 1. Où coller les clés — la réponse courte

Dans **`.env.local`**, à la racine du dépôt. Ce fichier n'est pas versionné
(`.gitignore`), et c'est ce qui empêche les clés d'atteindre le dépôt.

```dotenv
PAYMENT_PROVIDER=notchpay

NOTCHPAY_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
NOTCHPAY_PRIVATE_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
NOTCHPAY_HASH_KEY=hsk_test_xxxxxxxxxxxxxxxxxxxx
```

Puis **redémarrer le serveur de développement** : l'environnement est lu au
démarrage, jamais à chaud.

Tant que `PAYMENT_PROVIDER` reste à `fake`, rien ne change et les trois clés
peuvent rester vides — l'application continue de tourner sans compte nulle part.

### Où les trouver dans le tableau de bord

<https://business.notchpay.co> → **Settings → API Keys**, en mode **Test**.

| Variable | Clé du tableau de bord | Préfixe | Ce qu'elle fait |
| --- | --- | --- | --- |
| `NOTCHPAY_PUBLIC_KEY` | Public key | `pk_test_` | En-tête `Authorization`. Ouvre un paiement et le relit. |
| `NOTCHPAY_PRIVATE_KEY` | Private key | `sk_test_` | En-tête `X-Grant`. **Exigée par le remboursement, et par lui seul.** |
| `NOTCHPAY_HASH_KEY` | Hash key | `hsk_test_` | Vérifie la **signature des webhooks**, et rien d'autre. |

> **Le contresens à ne pas faire.** La clé de hachage n'est ni la publique ni la
> privée. Signer avec `sk_` produit une signature qui ne correspondra jamais, et
> le symptôme — « tous mes webhooks sont rejetés » — ne désigne pas la cause.
> `tests/unit/notchpay.test.ts` a un test dédié à ce piège.

### Le garde-fou du mode test

`NOTCHPAY_AUTORISER_PRODUCTION` vaut `false` par défaut, et l'adaptateur
**refuse de démarrer** sur une clé qui ne porte pas `test_`. La consigne « on
ne va utiliser que la version de test » est donc tenue par du code, et non par
la mémoire de celui qui remplit le fichier.

Le jour d'un encaissement réel : coller les clés `pk_live_` / `sk_live_` /
`hsk_live_` **et** poser `NOTCHPAY_AUTORISER_PRODUCTION=true`. Les deux gestes,
pas un seul.

---

## 2. L'URL de webhook à déclarer chez Notch Pay

Tableau de bord → **Settings → Webhooks** :

```
https://<votre-domaine>/api/webhooks/payments
```

En développement, `localhost` n'est pas joignable depuis Internet. Il faut un
tunnel — `cloudflared tunnel --url http://localhost:3000` ou
`ngrok http 3000` — et déclarer l'adresse publique qu'il donne.

**Sans webhook déclaré, rien ne s'octroie.** Le client paiera chez Notch Pay et
sa commande restera « en attente » chez nous : c'est le comportement voulu
(CLAUDE.md règle 5 — le webhook signé est la seule source de vérité), et non
une panne.

---

## 3. Ce que l'intégration fait

| Opération | Chemin |
| --- | --- |
| Ouvrir un paiement | `POST https://api.notchpay.co/payments` → `authorization_url` |
| Relire un paiement | `GET /payments/{reference}` |
| Rembourser | `POST /refunds` (+ `X-Grant`) |
| Recevoir l'issue | webhook signé → `/api/webhooks/payments` |

Le parcours, tel qu'un client le vit :

1. il valide ses coordonnées sur `/fr/paiement/<commande>` ;
2. l'action serveur appelle `/api/checkout`, qui demande à l'adaptateur
   d'ouvrir un paiement, et **redirige vers la page hébergée de Notch Pay** ;
3. il paie là-bas — carte, Orange Money, MTN MoMo ;
4. Notch Pay envoie `payment.complete` sur notre gestionnaire de webhooks ;
5. **c'est ce webhook, et lui seul,** qui fait passer la commande à `paye` et
   octroie les droits, de façon atomique ;
6. le navigateur revient sur `/fr/paiement/<commande>`, qui **relit la base**.
   Si le webhook n'est pas encore arrivé, l'écran dit « en cours de
   confirmation » — il ne devine jamais.

### La traduction des événements

| Notch Pay | Chez nous |
| --- | --- |
| `payment.complete` | `paiement.reussi` |
| `payment.failed` | `paiement.echoue` |
| `payment.canceled`, `payment.expired` | `paiement.abandonne` |
| tout le reste (`payment.created`, `transfer.*`, `customer.*`) | `evenement.ignore` |

`evenement.ignore` est **authentifié, journalisé et acquitté par un 200**. Le
refuser rendrait un 400, et Notch Pay réémettrait sans fin un événement qui ne
deviendra jamais applicable.

### L'idempotence

Notch Pay ne numérote pas ses événements. La clé d'idempotence est donc
`<type>:<id de transaction>` — stable d'une réémission à l'autre, et distincte
d'un type à l'autre. Sur l'identifiant de transaction seul,
`payment.complete` passerait pour un rejeu de `payment.created`, et la commande
ne serait **jamais** honorée.

---

## 4. Ce que l'intégration NE fait PAS — à arbitrer

### 4.1 Les abonnements. **Décision attendue du propriétaire.**

L'API de Notch Pay porte des paiements, des virements, des clients et des
remboursements. **Aucun prélèvement récurrent.**

`souscrireAbonnement` échoue donc franchement sous `PAYMENT_PROVIDER=notchpay` :
le bouton « S'abonner » de `/fr/offres` mène à une erreur. C'est délibéré.
Ouvrir un tunnel qui encaisse une fois donnerait un abonnement qui ne se
renouvelle pas et dont personne n'aurait décidé — c'est-à-dire une règle métier
inventée dans un adaptateur, ce que `CLAUDE.md` interdit.

Trois issues possibles, et le choix appartient à l'éditeur :

1. **abonnement à renouvellement manuel** — un paiement par période, un rappel
   par email avant l'échéance. C'est ce que font la plupart des marchands
   d'Afrique centrale, faute de mandat de prélèvement ;
2. **re-prélèvement programmé** — une tâche qui rappelle l'API à chaque
   échéance. Demande de conserver un moyen de paiement chez le prestataire, ce
   que Notch Pay ne documente pas ;
3. **deux prestataires** — Notch Pay pour l'achat à l'unité, un autre pour
   l'abonnement.

En attendant, **les achats à l'unité fonctionnent entièrement**, et
l'abonnement reste servi par le faux prestataire tant que
`PAYMENT_PROVIDER=fake`.

### 4.2 La zone d'encaissement

§3.3 : la zone vient du **pays du moyen de paiement**, jamais de l'adresse IP.
Notch Pay ne le révèle qu'**après** le règlement.
`paysDuMoyenDePaiement` rend donc `null`, et l'appelant retombe sur la zone
**internationale** — la plus chère. C'est ce que l'interface prescrit : « une
donnée manquante ne doit jamais valoir remise. »

Conséquence pratique : un client camerounais se voit proposer le tarif
international. À reprendre le jour où l'on saura lire le pays avant le paiement
— `locked_country` à l'ouverture est la piste.

### 4.3 L'unité des montants

Notch Pay attend un montant « in the smallest currency unit ». Le franc CFA
n'ayant pas de sous-unité, `1697` vaut 1 697 FCFA — ce que le projet stocke
déjà. **Vérifier une première transaction en euro** avant d'ouvrir la zone
internationale : c'est le seul point de l'intégration qu'aucun test ne peut
prouver depuis ici.

---

## 5. Éprouver l'intégration

Le mode test de Notch Pay fournit des **numéros de téléphone** qui forcent
l'issue. Le préfixe dépend de l'opérateur et du pays ; ce sont les six derniers
chiffres qui décident :

| Numéro se terminant par | Issue simulée |
| --- | --- |
| `000000` | paiement réussi |
| `000001` | fonds insuffisants |
| `000002` | échec général |
| `000003` | expiration |
| `000004` | annulation par l'utilisateur |

Les webhooks partent normalement en mode test — c'est ce qui permet d'éprouver
l'octroi des droits pour de bon.

---

## 6. Ce qui n'a pas bougé, et c'était le pari

Aucun fichier de logique métier ne nomme Notch Pay. Le gestionnaire de
webhooks, l'octroi atomique, l'idempotence, la route de checkout et les écrans
sont ceux qui existaient déjà. Deux lignes seulement ont été rendues
génériques :

- le gestionnaire de webhooks demande son **en-tête de signature** au
  prestataire, au lieu de lire une constante ;
- l'écran de règlement demande au prestataire s'il est **simulé**, ce qui fait
  disparaître le bandeau « paiement simulé » et la carte des issues à éprouver.

C'est ce que l'interface `PaymentProvider` promettait depuis l'étape 3. Le
vérifier valait mieux que l'espérer.

## 7. Fichiers

| Fichier | Ce qu'il porte |
| --- | --- |
| `src/adapters/payment/notchpay/notchpay-payment-provider.ts` | **le seul fichier du dépôt qui connaisse Notch Pay** |
| `src/adapters/registry.ts` | la sélection, et la lecture des clés |
| `src/lib/config/env.ts` | le schéma des quatre variables |
| `tests/unit/notchpay.test.ts` | 22 tests, sans réseau |
| `.env.example` | le gabarit à recopier |
