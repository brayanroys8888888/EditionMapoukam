# Questions et préoccupations

Points sur lesquels j'ai tranché seul faute de réponse dans la spécification, ou
que je vous signale sans avoir eu à trancher. Chaque entrée dit **ce que j'ai
fait en attendant**, pour que rien ne soit bloqué.

---

## Questions tranchées — arbitrages du 29 juillet 2026

Toutes les questions Q7.x à Q10.x ont été arbitrées et **appliquées**. Le détail
technique est dans `docs/PLAN.md`, section « Arbitrages appliqués ». Résumé :

| Question | Décision | État |
|---|---|---|
| **Principe** | Ingestion permissive, publication stricte : validation en base au passage à `publie` | Appliqué (migration 0024) |
| Q7.1 | epubcheck versionné sous `vendors/`, dépendance npm retirée, test inconditionnel | Appliqué |
| Q7.2 | « À renseigner » conservé ; la protection est à la publication | Appliqué |
| Q7.3 | Comportement correct, inchangé | — |
| Q8.1 | Le pays du moyen de paiement vient du prestataire ; `zone_encaissement` retiré des routes | Appliqué (+ test d'architecture) |
| Q8.2 | Prix exigé dans chaque zone active à la publication ; le cas résiduel donne un refus nommé | Appliqué |
| Q8.3 | `src/lib/money` → `src/domain/money` | Appliqué |
| Q9.1 | Remboursement par **ligne** de commande | Appliqué (migration 0027) |
| Q10.1 | `statut_effectif()` replie les dates ; `statut` jamais écrasé | Appliqué (migration 0025) |
| Q10.2 | `jours_essai` dans `business_settings`, **figé** sur chaque abonnement | Appliqué (migration 0026) |

---

## Points nouveaux — arbitrés à leur tour

| Point | Décision | État |
|---|---|---|
| N1 | Titre hors zone affiché, achat désactivé avec message ; anomalie journalisée | Appliqué |
| N2 | État dérivé `anomalie` avec tolérance de 48 h, compteur propre, journalisation | Appliqué (migration 0029) |
| N3 | epubcheck pèse 34 Mo (jar 1,2 Mo + 38 dépendances Java), pas une dizaine | Constaté, versionné |
| N4 | Changement de zone d'abonnement par un administrateur, tracé | **Reporté à l'étape 13** |

Le détail est en §5 ter de `docs/PLAN.md`.

---

## Reste à faire

### N4 — Changement de zone d'un abonnement (étape 13)

Le gel de la zone reste la règle par défaut, mais la mobilité d'un abonné est un
cas réel sur un produit visant la diaspora. L'étape 13 livrera une action
d'administration **tracée** — qui, quand, ancienne et nouvelle zone — et jamais
accessible à l'utilisateur.

Consigné dans la liste des fichiers produits de l'étape 13.

---

## Étape 11 — points signalés

### N5 et N6 — voir « À brancher avant la mise en production »

Ces deux points — la génération hors du fil de requête, et le déclenchement de
la purge des copies — dépendent tous deux d'un ordonnanceur que le mode local
n'a pas. Ils sont consignés en **§5 quater de `docs/PLAN.md`**, section unique,
avec deux autres du même genre.

Le principe : ces points ne bloquent aucun développement et ne cassent aucun
test — le code existe, il est éprouvé, et rien ne l'appelle. Dispersés dans les
notes de chaque étape, ils passeraient à travers **précisément parce qu'ils ne
font pas de bruit**. Toute dette de ce type s'ajoute là, et nulle part ailleurs.

### N7 — La police embarquée ne couvre pas toutes les écritures

`vendors/fonts/NotoSans-Regular.ttf` (Apache 2.0, 3 104 glyphes) couvre le
latin, le grec et le cyrillique. Une adresse en arabe, en hébreu ou en écriture
CJK produira des glyphes `.notdef` dans le pied de page — des rectangles vides.

**La génération n'échoue pas** — c'était tout l'objet de l'embarquement — et la
couche invisible des métadonnées reste exacte quelle que soit l'écriture. Seul
le pied de page visible serait imparfait. Couvrir toutes les écritures
demanderait plusieurs polices et une sélection par script, pour un cas de figure
qui ne se présentera probablement jamais sur ce catalogue.

---

## Rappel de la spécification, sans action de ma part

### Le seuil d'ouverture de l'abonnement

§3.3 recommande de **développer l'abonnement mais de ne l'ouvrir commercialement
qu'à partir de 30 à 40 titres publiés** : « un abonnement à 7,99 € adossé à un
catalogue de quelques titres ne soutiendra pas la comparaison et générera
surtout des résiliations ».

Le code ne connaît pas ce seuil et n'a pas à le connaître — c'est une décision
commerciale. Je le rappelle parce que les étapes 9 et 10 ont rendu l'abonnement
pleinement fonctionnel, et qu'il serait fâcheux de le croire prêt à ouvrir du
seul fait qu'il marche.

### Le téléchargement filigrané est livré (étape 11)

Le point signalé aux étapes 9 et 10 est levé : `GET /api/downloads/[bookId]`
sert désormais une copie filigranée, PDF **et** EPUB.

`GET /api/books/[bookId]/file`, la route de contournement livrée à l'étape 6,
**est supprimée** — le jour même où son remplaçant a été livré, et non à
l'étape 16 comme je le proposais d'abord. `tests/unit/telechargement-architecture.test.ts`
échoue désormais si une route servant un fichier de livre réapparaît hors du
module filigrané.

---

## Étape 13 — points à votre attention

### A1 — Un octroi manuel sans acteur reste possible, et c'est délibéré

Le déclencheur d'audit exige un motif **dès lors qu'un administrateur est
identifié**. Une écriture système — un seed, une migration, une fixture de test —
peut encore créer un droit `offert` sans motif ; elle est alors tracée avec un
acteur nul, ce qui la distingue d'une décision humaine au lieu de la confondre
avec elle.

**Pourquoi ne pas l'interdire tout court.** L'interdire obligerait les seeds et
une dizaine de tests existants à porter un motif fictif, ce qui remplirait le
journal de motifs qui n'en sont pas. Et surtout : le seul chemin par lequel un
humain peut octroyer un droit est `admin_octroyer_droit`, où le motif est un
paramètre obligatoire. Le geste humain est donc couvert ; ce qui reste ouvert,
c'est l'écriture technique, qui est visible.

**Si vous préférez le verrou total**, dites-le : c'est une contrainte `check` de
plus et une passe sur les fixtures.

### A2 — La suppression d'un droit `offert` n'est pas réversible

`admin_retirer_droit` efface la ligne. Le journal conserve qui, quand et quoi —
utilisateur, titre, droit de téléchargement — mais pas de quoi la reconstituer à
l'identique si la décision était une erreur. Un retrait suivi d'un nouvel octroi
produit un droit neuf, avec une nouvelle date.

C'est cohérent avec le reste du schéma, où les droits ne sont pas historisés.
Je le signale parce que le geste est irréversible et qu'il tient à un seul appel.

### A3 — Le quota d'administration vit en mémoire du processus

300 requêtes par quart d'heure et par administrateur, comptées dans un `Map`.
Même limite que la limitation de débit de la lecture, et acceptable pour la même
raison : avec deux instances, un attaquant obtiendrait deux fois le quota, ce qui
reste très en dessous de ce qu'exigerait l'aspiration de la base de clientèle.
Un stockage partagé — Redis, ou une table — le rendrait exact ; il ajouterait un
service à la pile locale, que le mode 100 % local n'a pas.

### A4 — La liste des commandes ne rend jamais l'identité de facturation

C'est le point 6 de vos consignes, et il méritait plus qu'un test : la facture
conserve légitimement `facture_nom` et `facture_email`, figés à l'émission. Ce
n'est pas la conservation qui ré-identifie, c'est la **jointure**. J'ai donc
retiré ces colonnes de toutes les vues de liste et ne rends que le **numéro** de
facture, qui satisfait l'obligation comptable sans désigner personne.

**Conséquence pratique à connaître :** consulter le détail nominatif d'une
facture — ce qu'un contrôle comptable peut exiger — n'est possible par aucune
route aujourd'hui. Si ce besoin apparaît, il devra passer par un chemin dédié,
tracé au journal d'audit comme une consultation, et non par un élargissement des
listes existantes.

### A5 — `admin/books/ingest` n'a pas de quota de débit

Livrée à l'étape 7, elle utilise `requireAdmin` directement et non la garde
commune de l'étape 13. Elle **est** protégée — le rôle est vérifié en base à
chaque requête — mais elle échappe au quota. Son coût est borné autrement : un
PDF de 100 Mo au maximum, traité en sous-processus.

L'écart est inscrit **dans le test d'architecture lui-même**, qui attend
exactement cette route et échouera si une autre s'en écarte. La faire passer par
la garde commune est une petite reprise ; je ne l'ai pas faite pour ne pas
toucher à la chaîne d'ingestion pendant une étape qui ne la concerne pas.
