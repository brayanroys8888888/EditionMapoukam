# Ajout du support des livrets pédagogiques

## Contexte

Le site propose désormais d’insérer deux familles de supports dans le catalogue :

- les contes classiques, déjà modélisés par la table `books` ;
- les livrets pédagogiques, avec une mise en page adaptée selon l’orientation du document.

Le besoin métier est de gérer à la fois :

- un type de document (`conte` / `livret_pedagogique`),
- une orientation de page (`paysage` / `portrait`).

Cela permet de couvrir le cas d’un livret pédagogique en orientation paysage, tout en restant prêt pour les versions portrait.

## Modèle ajouté

### Champs ajoutés sur `public.books`

- `type_document` : enum `document_type`
  - valeurs : `conte`, `livret_pedagogique`
- `orientation` : enum `page_orientation`
  - valeurs : `paysage`, `portrait`

### Raison de conception

- `type_document` permet de distinguer le type de support sans mélanger le catalogue des contes et des livrets pédagogiques.
- `orientation` permet d’encoder le format visuel du livret, avec un support explicite pour paysage et portrait.
- Le modèle reste extensible sans introduire de logique métier côté application : on lit juste les valeurs, on ne les re-dérive pas.

## Fichiers concernés

- `supabase/migrations/...` : ajout des enums et des colonnes
- `src/lib/supabase/database.types.ts` : mise à jour du typage généré
- `tests/integration/schema.test.ts` : validation du contrat de schéma

## Validation

Le test d’intégration ciblé vérifie :

- la présence des colonnes `type_document` et `orientation` sur `public.books` ;
- les valeurs autorisées des enums `document_type` et `page_orientation`.

La validation statique passe avec `npm run typecheck` et `npm run lint`.
Une exécution avec la base accessible a confirmé que 19 tests sur 21 passent.
Le test du livret échoue parce que la migration `0061` n’est pas encore
appliquée : les colonnes attendues sont absentes de `public.books`.

Le second échec, indépendant du livret, concerne le jeu de démonstration :
`la-riviere-qui-parlait` est exactement à 3 mois alors que le test attend une
ancienneté strictement inférieure à 3 mois.

La réinitialisation suivante n’a pas pu être exécutée : Docker Desktop ne
répond pas (`dockerDesktopLinuxEngine` introuvable), puis les tests ont échoué
avec `ECONNREFUSED 127.0.0.1:54322`. Dès que Docker est disponible, utiliser
`npx supabase db reset --local`, puis relancer le test ciblé.

## Remarque

Le document de référence du livret n’est pas présent dans le workspace sous
forme de fichier dédié ou de PDF. Le schéma a donc été construit à partir du
besoin fonctionnel exprimé : un livret pédagogique en orientation paysage, avec
une variante portrait prévue pour l’avenir.

---

## ⚠️ Point 2 — LE LIVRET PÉDAGOGIQUE EST ABSENT DE LA SPÉCIFICATION

**Signalé, pas tranché.** `CLAUDE.md` est explicite sur les deux règles qui se
croisent ici :

> « La spécification complète est dans `docs/cahier-des-charges.md`. Elle fait
> foi. En cas de contradiction entre ce fichier et la spécification, la
> spécification gagne — **signale-moi la contradiction plutôt que de trancher
> seul**. »

> « Ne modifie pas `docs/cahier-des-charges.md`. »
> « N'invente pas de règle métier absente de la spécification — pose-moi la
> question. »

### Le constat, vérifiable en une commande

```
grep -in "livret\|pédagogique" docs/cahier-des-charges.md   # aucun résultat
```

Le mot n'y figure pas une fois. La spécification décrit un catalogue de
**contes**, deux modèles économiques (abonnement en lecture, achat à l'unité en
téléchargement), treize écrans et un objectif WCAG 2.1 AA. Le livret
pédagogique n'y a ni définition, ni prix, ni règle d'accès propre.

### Ce qui a été fait, et pourquoi c'est défendable sans elle

Le chantier n'a **inventé aucune règle métier**. `type_document` et
`orientation` sont deux attributs d'affichage et de rangement posés sur
`books` ; tout le reste — droits, prix, fenêtre de trois mois, ingestion,
lecture en ligne, téléchargement, versions linguistiques — est celui des
contes, sans un `if` de plus nulle part. C'est précisément le sens du choix
d'une **colonne plutôt que d'une seconde table** : un livret est un titre du
catalogue qui se trouve porter une autre étiquette.

Autrement dit, l'ajout est **neutre au regard de la spécification** : il ne la
contredit sur aucun point, il l'étend sur un point qu'elle ne couvre pas.

### Les trois questions qui, elles, demandent un arbitrage

Elles restent **ouvertes**, et aucune n'a été tranchée dans le code :

1. **Un livret entre-t-il dans l'abonnement ?** Aujourd'hui il suit la règle des
   contes : `inclus_abonnement` et `disponible_achat` sont indépendants et
   restent faux au dépôt, l'éditeur décide titre par titre. Si un livret doit
   être *toujours* gratuit, ou *jamais* dans l'abonnement, c'est une règle
   métier — elle appartient à la spécification, pas à une migration.

2. **La fenêtre de vente de trois mois s'applique-t-elle à un livret ?**
   Aujourd'hui oui, comme à tout titre, parce qu'elle se calcule sur
   `publie_le` sans regarder le type. C'est peut-être exactement ce qu'on veut
   d'un support d'activités — ou pas du tout.

3. **Le catalogue doit-il mêler les deux, ou les séparer par défaut ?**
   Aujourd'hui `/catalogue` montre les deux et `/livrets` est une vue filtrée.
   Le défaut inverse — le catalogue ne montrant que les contes — ferait
   disparaître les livrets de la recherche, du plan de site et des suggestions.
   Le choix actuel est le moins destructeur, ce n'est pas une décision
   éditoriale pour autant.

**À faire :** faire trancher ces trois points, puis les inscrire dans
`docs/cahier-des-charges.md` — un fichier que ce chantier n'a pas touché.
