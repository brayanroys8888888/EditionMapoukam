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

Reste une survivance : `GET /api/books/[bookId]/file`, livrée à l'étape 6, sert
toujours le fichier générique non filigrané. Les deux routes coexistent, et la
seconde devrait disparaître au profit de la première — à traiter à l'étape 16,
avec la revue de sécurité.
