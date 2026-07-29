# Questions et préoccupations

Points sur lesquels j'ai tranché seul faute de réponse dans la spécification, ou
que je vous signale sans avoir eu à trancher. Chaque entrée dit **ce que j'ai
fait en attendant**, pour que rien ne soit bloqué.

Ordre : les plus engageants d'abord.

---

## Étape 8 — Panier et commandes

### Q8.1 — La zone d'encaissement est transmise par le client (à corriger avec un vrai prestataire)

**Le problème.** §3.3 dit que la zone est déterminée par le **pays de paiement**
« et non par l'adresse IP, plus facilement contournable ». Or il n'y a pas
encore de prestataire de paiement : rien, côté serveur, ne connaît le pays réel
du moyen de paiement.

**Ce que j'ai fait.** `POST /api/orders` accepte un champ `zone_encaissement`.
En développement, c'est la console de simulation qui joue ce rôle — l'équivalent
du pays que Stripe ou un agrégateur Mobile Money renverrait.

**Pourquoi cela me préoccupe.** En l'état, un utilisateur pourrait réclamer la
zone Afrique depuis l'Europe et payer 1 500 FCFA au lieu de 4,99 €. Ce n'est pas
une faille aujourd'hui — aucun paiement réel n'a lieu — mais **ce champ doit
disparaître des entrées de la route** au moment de brancher un prestataire, au
profit du pays que celui-ci renvoie. C'est le genre de paramètre provisoire
qu'on oublie de retirer.

**Ce dont j'ai besoin de vous.** Rien maintenant. À l'étape 9, confirmez-moi que
`FakePaymentProvider` doit porter un « pays du moyen de paiement » simulé — je
ferai alors venir la zone de là, et la route cessera de l'accepter.

### Q8.2 — Un panier à cheval sur deux zones bascule entièrement en international

**Le problème.** D4 point 8 dit de retomber sur la zone internationale quand un
conte n'a pas de prix dans la zone résolue. Appliqué **ligne par ligne**, cela
produit un panier où un titre est facturé en FCFA et le suivant en euros. Or
`orders` ne porte qu'une devise, et additionner deux devises sans taux de change
n'a aucun sens.

**Ce que j'ai fait.** Le repli est décidé pour la **commande entière** : si un
seul titre du panier n'a pas de prix dans la zone demandée, toute la commande
bascule en international.

**Pourquoi cela me préoccupe.** C'est défendable, mais c'est **défavorable à
l'acheteur africain** : un panier de trois titres à 1 500 FCFA passe à trois
titres en euros parce qu'un quatrième n'a pas de prix local. Le jeu de
démonstration contient déjà ce cas (`la-tortue-et-le-lapin` n'a qu'un prix
international).

**Ce dont j'ai besoin de vous.** Un arbitrage, quand vous voudrez :

1. *(en place)* toute la commande bascule en international ;
2. les titres sans prix local sont **refusés** et nommés, le reste est facturé
   en FCFA — l'acheteur choisit de les retirer ;
3. le client doit **garantir un prix dans les deux zones** pour tout titre
   vendu, et la chaîne d'ingestion refuse de publier sans cela.

L'option 3 est la plus saine commercialement, mais elle vous impose une saisie
de plus par titre.

### Q8.3 — `src/domain` importe `src/lib/money`

**Le problème.** Le calcul du total a besoin de `sumAmounts` et
`applyPercentage`, qui vivent dans `src/lib/money` — seule autorité du dépôt sur
le nombre de décimales d'une devise. Les appeler depuis `src/domain` inverse le
sens habituel des couches.

**Ce que j'ai fait.** J'ai importé, et documenté pourquoi dans le fichier :
`money` est un calcul **pur**, sans entrée-sortie ni horloge, et le recopier
dans `domain` ferait exactement ce que la règle « aucune division par 100 codée
en dur » cherche à empêcher.

**Ce dont j'ai besoin de vous.** Rien d'urgent. Si la propreté des couches vous
tient à cœur, `src/lib/money` mériterait de devenir `src/domain/money` — c'est
un déplacement mécanique, mais qui touche du code déjà livré et testé, et je ne
l'ai pas fait de ma seule initiative.

---

## Étape 7 — Chaîne d'ingestion

### Q7.1 — La validation EPUB par epubcheck ne s'exécute pas sur ce poste

**Le problème.** `epubchecker` est en dépendance de développement, mais le
paquet npm **ne contient pas** le validateur : son script d'installation
télécharge une archive Java depuis GitHub. Ce poste n'a pas accès au réseau, le
téléchargement échoue **sans faire échouer `npm install`**, et le dossier
`vendors/` reste absent.

**Ce que j'ai fait.** Le test est conditionné à la présence réelle du fichier.
C'est le seul test ignoré de la suite, et il est nommé pour qu'on le voie. La
conformité structurelle, elle, s'exécute toujours : signature OCF lue sur les
octets bruts, déclaration de mise en page fixe, cohérence du manifeste et du
dos, validité des images embarquées, échappement XML.

**Ce dont j'ai besoin de vous.** Lancer `npm rebuild epubchecker` puis
`npm run verify` depuis un poste connecté, **avant de remettre le premier titre
à un distributeur**. Si le validateur relève quelque chose, je le corrigerai.

### Q7.2 — L'auteur d'un titre ingéré vaut « À renseigner »

**Le problème.** `books.auteur` est `not null`. Ni le PDF ni l'appelant ne
fournissent toujours un auteur.

**Ce que j'ai fait.** À défaut, la fiche porte « À renseigner ». Inventer un nom
aurait été pire, et la fiche est un **brouillon** destiné à être complété au
back-office (§7.4.3 étape 6).

**Ce dont j'ai besoin de vous.** Rien, sauf si vous voulez que l'ingestion
**refuse** un PDF sans auteur plutôt que de créer un brouillon incomplet. Les
seize contes du corpus portent tous « Collection Contes d'Afrique » dans leurs
métadonnées, donc le cas ne se présente pas aujourd'hui.

### Q7.3 — Les contes du corpus ne sont pas vendables en l'état

**Constat, pas question.** La chaîne crée les titres en `brouillon` avec
`inclus_abonnement`, `disponible_achat` et `gratuit` à **faux** : elle ne décide
jamais du modèle économique d'un titre (§3.2). Un titre ingéré n'est donc ni
lisible ni vendable tant que vous ne l'avez pas complété et publié.

C'est voulu, mais cela signifie qu'**ingérer les seize contes ne suffira pas à
remplir le catalogue** : il faudra une passe de saisie au back-office, livrée à
l'étape 13.

---

## Rappel de la spécification, sans action de ma part

### Le seuil d'ouverture de l'abonnement

§3.3 recommande de **développer l'abonnement mais de ne l'ouvrir commercialement
qu'à partir de 30 à 40 titres publiés** : « un abonnement à 7,99 € adossé à un
catalogue de quelques titres ne soutiendra pas la comparaison et générera
surtout des résiliations ».

Le code ne connaît pas ce seuil et n'a pas à le connaître — c'est une décision
commerciale, pas technique. Je le rappelle ici parce que les étapes 9 et 10 vont
rendre l'abonnement pleinement fonctionnel, et qu'il serait fâcheux de le croire
prêt à ouvrir du seul fait qu'il marche.
