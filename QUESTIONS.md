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

## Points nouveaux, nés de ces arbitrages

### N1 — Le catalogue n'affiche plus le prix d'une autre zone

**Ce que j'ai fait, au-delà de ce qui était demandé.** Q8.2 portait sur le
panier. Mais `catalog_list` repliait, lui aussi, sur la zone internationale : un
visiteur de la zone Afrique voyait « 4,99 € » sur un titre sans prix local — puis
le panier refusait ce même titre. Deux réponses différentes à la même question.

J'ai retiré le repli du catalogue également (migration 0028). Le titre reste
**listé** — il peut être lisible par abonnement — mais sans montant.

**Pourquoi je vous le signale.** C'est une extension de votre décision, prise
pour éviter une incohérence visible par l'utilisateur. Si vous préférez que le
catalogue affiche un prix indicatif dans une autre devise, avec une mention
explicite, dites-le : c'est une décision d'affichage, et elle vous revient.

### N2 — `statut_effectif` ne replie PAS un `actif` dont la période est échue

Votre règle disait : `annule` + période dépassée → `expire` ; `impaye` + grâce
dépassée → `expire` ; sinon tel quel. Je l'ai appliquée à la lettre.

Reste donc un cas : un abonnement `actif` dont `fin_periode` est passée sans
qu'aucun renouvellement ni échec ne soit arrivé. Il s'affichera « actif »
indéfiniment. **L'accès, lui, est correctement refusé** — le moteur de droits
compare les dates.

Je ne l'ai pas replié parce que cela inventerait une décision que personne n'a
prise : cet abonnement attend un événement du prestataire, et son absence est
une anomalie à voir, pas à masquer. Mais si vous préférez qu'il bascule aussi,
c'est une ligne à ajouter.

### N3 — epubcheck pèse 34 Mo, pas une dizaine

Le jar seul fait 1,2 Mo, mais il ne tourne pas sans ses 38 dépendances Java
(`lib/`, 33 Mo). Le tout est sous `vendors/epubcheck/`, licence BSD à trois
clauses.

C'est plus que ce que vous aviez estimé. L'alternative serait de ne versionner
que `epubcheck.jar` et de reconstruire `lib/` ailleurs — mais on retomberait
exactement sur le problème que vous vouliez éliminer : une installation qui peut
manquer sans que rien ne le signale. J'ai donc tout versionné.

**Le test s'exécute désormais toujours, et l'EPUB produit passe la validation
W3C sans aucune erreur.** La suite ne comporte plus aucun test ignoré.

### N4 — La zone d'un abonnement vient aussi du prestataire

Q8.1 parlait de `POST /api/orders`. `POST /api/subscriptions` avait le même
défaut : le client choisissait sa zone, laquelle est ensuite **figée pour toute
la vie de l'abonnement** (D4 point 7) — donc un tarif choisi par l'abonné et
verrouillé. J'ai appliqué la même correction, et le test d'architecture couvre
les deux routes.

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

### Le fichier téléchargeable n'est pas encore filigrané

L'ingestion dépose le PDF source tel quel dans `book-downloads`, et la route de
téléchargement le sert. Le filigrane personnalisé de §9.4 est produit **à
l'achat**, ce qui est l'objet de l'étape 11 — la prochaine.

**Depuis l'étape 9, un achat livre donc un PDF non filigrané.** Rien à décider,
c'est le calendrier prévu, mais il ne faut pas diffuser de titre acheté avant
l'étape 11.
