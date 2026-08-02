# Ce qui sépare « les tests passent » de « on peut vendre »

**Édition Mapoukam — backend. État au 30 juillet 2026.**

Ce document se lit seul, sans connaissance du code. Il dit ce qui reste à faire
avant d'encaisser un premier paiement réel, et ce qui se dégradera si on ne le
fait pas.

Il est volontairement complet. Un inventaire qui minimise ce qui manque rend
suspect tout le reste du travail : si l'on cache trois défauts, pourquoi croire
les mille tests ?

---

## En une phrase

Le backend est **fonctionnellement complet et éprouvé** — mille tests, aucun
ignoré, deux parcours complets d'achat et d'abonnement. Il n'est **pas
exploitable en l'état** : cinq points bloquants l'en empêchent, dont trois
tiennent à un seul manque, l'absence d'ordonnanceur de tâches.

---

## 1. BLOQUANT

> *Sans cela, la plateforme ne peut pas encaisser, ou ne respecte pas une
> obligation légale.*

### B1 — Aucun prestataire de paiement réel n'est branché

**État.** Tout le paiement passe par un simulateur (`FakePaymentProvider`). Il
émet de vrais événements signés vers le vrai gestionnaire de webhooks : la
vérification de signature, l'idempotence et l'octroi des droits sont donc
développés et éprouvés pour de bon. **Seul l'émetteur est fictif.**

**Ce qui casse sans cela.** Rien ne peut être encaissé. C'est le point d'arrêt
absolu.

**Ce que coûte le branchement.** Faible, par construction — voir la section 4 du
document de fin de chantier. La logique métier ne nomme aucun prestataire ; c'est
un adaptateur à écrire, pas une refonte.

### B2 — Purge des factures échues : jamais appelée

**État.** La fonction existe et est testée (`purge_expired_invoices`). Rien ne la
déclenche.

**Ce qui casse sans cela.** **Obligation légale.** Conserver des pièces
comptables au-delà de leur durée de conservation est une infraction — au même
titre que les détruire trop tôt. Le RGPD impose une durée, pas seulement un
minimum.

**Ce qu'il faut.** Un appel périodique. Voir B5.

### B3 — Expiration des abonnements : aucune transition automatique

**État.** L'accès est **correctement refusé** dès que la période est échue : le
moteur de droits replie les dates à chaque requête, il n'y a donc **aucune faille
d'accès**. Mais le statut stocké reste `annulé` ou `impayé` indéfiniment.

**Ce qui casse sans cela.** Les abonnements échus s'accumulent dans un état
`anomalie` que personne ne vient résoudre. Les statistiques d'abonnés se
dégradent progressivement, et le back-office affiche une liste d'anomalies qui ne
cesse de croître — jusqu'à ce qu'on cesse de la regarder.

**Ce qu'il faut.** Un appel périodique. Voir B5.

### B4 — Consultation nominative d'une facture : aucun chemin n'existe

**État.** Les vues d'administration ne rendent **que le numéro** de facture,
jamais le nom ni l'adresse. C'est délibéré : afficher l'email de facturation à
côté d'une commande reconstituerait l'identité d'un compte anonymisé, en une
ligne de SQL et en toute bonne foi.

**Ce qui casse sans cela.** Un contrôle comptable exige le détail nominatif d'une
facture. Aujourd'hui, il faudrait ouvrir la base à la main — c'est-à-dire un
accès **sans trace**, par quelqu'un dont rien ne dira qu'il a consulté.

**Ce qu'il faut.** Une route dédiée, réservée à l'administration, et
**journalisée comme une consultation** : lire une identité doit laisser une trace
au même titre que la modifier. C'est la seule façon de détecter une exfiltration
lente par un compte légitime.

### B5 — Aucun ordonnanceur de tâches périodiques

**État.** Le mode de développement est 100 % local et n'a pas d'ordonnanceur. En
introduire un aurait été un service de plus à simuler.

**Ce qui casse sans cela.** **B2 et B3 en dépendent tous les deux**, ainsi que D1
et D2 ci-dessous. C'est le manque unique derrière quatre entrées de cet
inventaire.

**Deux voies possibles, à arbitrer :**

1. une tâche planifiée d'hébergeur appelant une route d'administration protégée ;
2. un déclenchement manuel depuis le back-office.

La seconde est déjà livrée pour la purge des copies : **un déclenchement à la
main vaut mieux qu'un appel qui n'existe pas.** Elle ne dispense pas de la
première.

---

## 2. DÉGRADANT

> *La plateforme fonctionne, mais se détériore avec le temps ou l'échelle.*

### D1 — Purge des copies filigranées : déclenchable, jamais déclenchée

**État.** Livrée et testée. Un bouton existe dans l'administration. Rien ne
l'appelle automatiquement.

**Ce qui se dégrade.** Le stockage croît sans fin. À 2 000 acheteurs × 40 titres
× 2 langues × 2 formats, **320 000 fichiers** — le premier poste de coût de la
plateforme, et il ne redescend jamais.

**Sans danger.** L'identifiant d'une copie est déterministe : une copie purgée se
reconstruit à l'identique à la demande suivante.

### D2 — Génération du filigrane dans le fil de la requête

**État.** Un sémaphore à trois places et un délai de 60 secondes évitent
l'effondrement mémoire. Ils font **attendre** au lieu de **tomber**.

**Ce qui se dégrade.** Un acheteur sur connexion lente attend la génération
*puis* le téléchargement. Ce n'est pas une panne, c'est une lenteur — mais le
public visé est en partie sur connexion lente, ce qui la rend coûteuse.

**Ce qu'il faut.** Un ouvrier séparé et une file persistante.

### D3 — Quota d'administration en mémoire de processus

**État.** 300 requêtes par quart d'heure et par administrateur, comptées dans la
mémoire du serveur.

**Ce qui se dégrade.** Correct avec une seule instance. **Faux dès la
deuxième** : chacune accorde son propre quota. Avec quatre instances, un compte
compromis dispose de quatre fois la limite.

**Ce qu'il faut.** Un stockage partagé — Redis, ou une table. Cela ajoute un
service à la pile.

### D4 — Aucun total de chiffre d'affaires consolidé

**État.** Les montants sont rendus **par devise**, jamais additionnés. C'est
délibéré : 499 centimes d'euro et 3 000 francs CFA ne font pas 3 499 de quoi que
ce soit.

**Ce qui se dégrade.** Un dirigeant qui demande « le » chiffre d'affaires n'obtient
pas de réponse. Ce n'est pas un oubli, c'est un refus — mais il devra être levé
le jour où la plateforme vendra réellement dans les deux zones.

**Ce qu'il faut.** Une table de **taux historisés**, et un taux figé à la date de
la commande, stocké sur celle-ci — comme les prix le sont déjà. Convertir à
l'exécution rendrait le chiffre du mois dernier différent à chaque consultation.

### D5 — La police embarquée ne couvre pas toutes les écritures

**État.** Latin, grec, cyrillique. Une adresse en arabe, en hébreu ou en écriture
CJK produirait des rectangles vides dans le pied de page du filigrane.

**Ce qui se dégrade.** La génération **n'échoue pas**, et la couche invisible des
métadonnées reste exacte. Seul le pied de page visible serait imparfait, pour un
cas de figure improbable sur ce catalogue.

---

## 3. À SURVEILLER

> *Hypothèse externe ou limite connue, à revalider.*

### S1 — La durée de vie des liens signés dépend du fournisseur de stockage

Nous **fixons** la valeur — 300 secondes pour le contenu payant, 3 600 pour le
gratuit — mais c'est Supabase Storage qui l'**honore**. Tout le raisonnement de
sécurité sur la durée de vie des liens repose donc sur un comportement que nous
ne mettons pas en œuvre.

**Nos tests vérifient la valeur demandée, pas la valeur honorée.** Un changement
de fournisseur, ou une évolution de son implémentation, rouvre la question sans
qu'aucun test du dépôt ne le signale.

### S2 — Le service des pages contourne les politiques de sécurité de la base

Le service de lecture utilise une clé privilégiée qui contourne les politiques
RLS, et applique le contrôle des droits **dans le code**. C'est un écart assumé
avec la règle de sécurité n°1 du projet, consigné depuis l'étape 4.

Trois dispositifs le compensent : un test d'architecture qui vérifie qu'**un seul
module** lit cette table, un autre qui vérifie que la lecture vient **après** le
contrôle des droits, et un troisième qui interdit à tout autre module de la
nommer.

**Une option plus forte a été chiffrée** — voir la section 3 du document de fin de
chantier. Elle n'est pas implémentée sans accord.

### S3 — Le seuil d'agrégation statistique est fixé à cinq lecteurs

Sous cinq lecteurs distincts, les statistiques de lecture masquent leurs
comptes : « ce titre a 1 lecteur », croisé avec la liste des acheteurs, nomme
quelqu'un.

**À revalider si le catalogue ou l'audience changent d'échelle.** Sur un
catalogue de quarante titres et quelques milliers de lecteurs, cinq est
raisonnable ; sur un catalogue de mille titres à longue traîne, il masquerait
l'essentiel des données utiles.

### S4 — L'audit EPUB ne tourne pas à chaque commit

Les seize titres du corpus produisent un EPUB **conforme EPUB 3, zéro erreur,
zéro avertissement** — validé par epubcheck sur l'octet réellement servi.

Mais l'audit complet prend une dizaine de minutes et vit **hors** de la porte de
validation ; la suite ordinaire n'en valide qu'un titre. **`npm run audit:epub`
doit être lancé avant chaque livraison**, sur une base stable.

### S5 — Le seuil commercial d'ouverture de l'abonnement

La spécification recommande de n'ouvrir l'abonnement qu'**à partir de 30 à 40
titres publiés** : « un abonnement à 7,99 € adossé à un catalogue de quelques
titres ne soutiendra pas la comparaison et générera surtout des résiliations ».

Le code ne connaît pas ce seuil et n'a pas à le connaître — c'est une décision
commerciale. Il est rappelé ici parce que l'abonnement est **pleinement
fonctionnel**, et qu'il serait fâcheux de le croire prêt à ouvrir du seul fait
qu'il marche.

---

## 4. Récapitulatif

| # | Point | Catégorie | Dépend de |
|---|---|---|---|
| B1 | Prestataire de paiement réel | **Bloquant** | — |
| B2 | Purge des factures échues | **Bloquant** (légal) | B5 |
| B3 | Expiration des abonnements | **Bloquant** | B5 |
| B4 | Consultation nominative de facture, tracée | **Bloquant** (légal) | — |
| B5 | Ordonnanceur de tâches | **Bloquant** | — |
| D1 | Purge des copies filigranées | Dégradant | B5 |
| D2 | Filigrane hors du fil de requête | Dégradant | B5 |
| D3 | Quota d'administration partagé | Dégradant | — |
| D4 | Taux de change historisés | Dégradant | — |
| D5 | Couverture d'écritures de la police | Dégradant | — |
| S1 | Durée des liens signés (fournisseur) | À surveiller | — |
| S2 | Contournement RLS du service de pages | À surveiller | — |
| S3 | Seuil d'agrégation à cinq | À surveiller | — |
| S4 | Audit EPUB hors de la porte | À surveiller | — |
| S5 | Seuil commercial de l'abonnement | À surveiller | — |

**Cinq bloquants, dont trois se résolvent avec B5.** Traiter l'ordonnanceur et
brancher un prestataire de paiement ramène la liste à deux points : B4, et le
choix commercial S5.
