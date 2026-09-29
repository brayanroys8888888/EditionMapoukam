# Chantier — l'Association DAVE, fonctionnalités complètes

**Suivi vivant.** Mis à jour à chaque étape franchie.

Référence : le document **« 11 — Association DAVE : fonctionnalités complètes »**,
remis par le propriétaire le **28 septembre 2026**. Il décrit les trois côtés —
l'adhérent, l'administrateur, et le lien entre les deux.

---

## La décision, et ce qu'elle change

Le propriétaire a demandé l'implémentation **en connaissance de cause** : ces
fonctions ne sont pas au cahier des charges, et il a dit vouloir qu'elles y
soient. C'est la réponse à la question que `CLAUDE.md` impose de poser —
« n'invente pas de règle métier absente de la spécification, pose-moi la
question ».

### Une contradiction à arbitrer

Le cahier des charges **§F4 bis** écrit de l'espace associatif :

> « Aucun téléchargement, aucun fichier : l'espace ne sert que du texte. »

Le document du 28 septembre demande des **fiches PDF téléchargeables** et des
**replays vidéo**. Les deux ne peuvent pas être vrais.

**Ce qui est fait :** le modèle porte les fichiers, et leur adresse est
protégée par un privilège absent — la lecture échoue pour `anon` comme pour
`authenticated`, et seul un chemin serveur vérifiant l'adhésion pourra rendre
une URL signée.

**Ce qui reste à décider :** mettre le cahier des charges d'accord avec la
décision. `CLAUDE.md` interdit de le modifier sans instruction explicite, et
cette instruction n'a pas été donnée. Tant qu'elle manque, une prochaine
session relira §F4 bis et rouvrira la question.

> La règle centrale du projet n'est **pas** touchée : « le téléchargement des
> livres n'est accordé que par un achat » reste vraie. Une fiche de
> l'association n'est pas un titre du catalogue, et le document le dit lui-même
> en Partie A2 : l'adhésion « n'ouvre pas le téléchargement des livres ».

---

## État d'ensemble

| Étape | Contenu | Fait |
| --- | --- | --- |
| 1 | **Socle de données** — publications, agenda, échanges | ✅ |
| 2 | **Administration** — l'éditeur et les cinq onglets | ✅ |
| 3 | Espace adhérent — `/espace`, article, commentaires | en cours |
| 4 | Automatismes serveur — publication datée, e-mails, liens signés | |

---

## Étape 1 — Le socle de données ✅

### Migration `0096` — le modèle de publication

- [x] `type_publication` : `compte_rendu`, `recit_terrain`, `fiche_pdf`,
      `replay`. **Distinct de `categorie`**, qui range par thème et reste : le
      type dit *ce que c'est* et décide du comportement au clic, la catégorie
      dit *ce dont ça parle*. L'espace adhérent a besoin des deux.
- [x] `programme_le`, `signe_par`, `publics[]`, `commentaires_ouverts`,
      `vues`, `video_url` / `video_minutes`, `fichier_pdf` / `pdf_pages`,
      `evenement_id`, `prevenir_adherents` / `email_envoye_le`
- [x] `texte_alternatif` **par langue** — il décrit une image pour qui ne la
      voit pas, donc c'est du texte de lecteur ; posé sur le contenu, il ferait
      lire une description française à un anglophone
- [x] **`statut_publication(statut, programme_le)`** — unique implémentation
      des trois états. La programmation ne touche **pas** à
      `translation_status`, qui est partagé avec les traductions de livres :
      « programmé » n'y voudrait rien dire, et un écran finirait par l'afficher
      sur un titre du catalogue
- [x] La fonction ne compare pas la date à l'heure courante : **c'est la
      bascule qui publie, pas le temps qui passe**. Sinon deux écrans lus à une
      seconde d'intervalle pourraient se contredire

> **Deux colonnes `prevenir_adherents` et `email_envoye_le`, et non une.**
> « On a demandé » et « c'est parti » sont deux faits distincts ; les confondre
> rendrait un second envoi indistinguable d'un oubli.

### Migration `0097` — le correctif qui compte

- [x] **La 0096 croyait protéger `fichier_pdf` et `video_url`, et ne protégeait
      rien.** Elle écrivait `revoke select (colonne) … from anon` ; PostgreSQL
      l'a accepté sans broncher et la lecture est restée ouverte, parce qu'un
      retrait de colonne n'entame pas un privilège accordé sur la **table**.
      La commande a réussi et n'a rien fait — la pire forme de protection,
      celle qui ne proteste pas.
- [x] Corrigé par le modèle déjà employé sur `association_content_translations`
      (migration 0069) : **aucun privilège de table**, une liste **explicite**
      de colonnes. Ce qui n'y figure pas échoue avec un code d'erreur, avant
      qu'une ligne soit lue.
- [x] Vérifié à la main des deux côtés : `select fichier_pdf` rendait une
      colonne avant, échoue après ; `pdf_pages` et `video_minutes` restent
      lisibles — « 12 pages », « 52 min » se lisent sans donner la ressource

### Migration `0098` — l'agenda

- [x] `association_events` : type, titre, date, lieu **ou** lien, places,
      publics. Une contrainte impose l'exclusivité lieu/lien — sans elle, un
      écran afficherait « En ligne » sous une adresse de salle
- [x] `association_event_registrations`, clé primaire `(event_id, user_id)` :
      **l'unicité est dans la clé**, aucun écran n'a à la vérifier
- [x] RLS appelant **`abonnement_ouvre_droit(…, 'association')`** — jamais une
      recopie du prédicat. Le domaine écrit en toutes lettres tient
      l'étanchéité du §3.6 : un abonné *lecture* n'entre pas ici
- [x] Le `lien` d'un séminaire n'est **pas** dans les colonnes accordées : il
      vaut une place, et il se recopie
- [x] `association_places_restantes` — comptées en base. Deux écrans qui
      compteraient chacun finiraient par ne pas dire la même chose, et celui
      qui se trompe est toujours celui qui annonce une place libre
- [x] `evenement_id` en `on delete set null` : effacer un atelier n'efface pas
      le compte rendu qui en parle — c'est même à ce moment-là qu'il devient la
      seule trace de ce qui s'est passé

### Migration `0099` — les échanges entre adhérents

- [x] `association_comments` : un commentaire **naît `en_attente`**, et son
      auteur ne pose pas son statut. Même règle que les avis de lecteurs (0072)
- [x] On **retire** son message, on ne le **corrige** pas : un message approuvé
      puis réécrit contournerait la modération
- [x] Un adhérent voit les messages publiés **et les siens**, même en attente —
      sans quoi il croirait le sien perdu et le réécrirait. Un message masqué
      lui reste visible, pour la même raison
- [x] `modere_par` n'est pas accordé : *qui* a modéré regarde l'équipe. Le
      savoir transformerait une décision de l'association en décision d'une
      personne, et c'est à elle qu'on s'adresserait ensuite
- [x] Écrire exige **trois** conditions, et chacune ferme une porte : c'est sa
      ligne, son adhésion ouvre le droit, et l'article accepte les commentaires
- [x] `association_comment_likes` — « un seul cœur par adhérent et par
      message », porté par la clé primaire
- [x] **L'anonymisation les connaît dès leur naissance.** `anonymize_user` et
      `dev_reset_demo_state` sont reprises de la base vivante et patchées d'une
      ligne. Une obligation de confidentialité reportée est une obligation
      oubliée, et celle-là ne se rattrape pas

### Migration `0100` — le correctif que le dépôt a imposé

- [x] Les trois tables référençaient `users` en `on delete cascade`, avec un
      argument défendable : un commentaire est un message privé, il s'en va
      avec son compte.
- [x] **`account-lifecycle.test.ts` l'a refusé**, et sa raison porte plus loin
      que l'argument : « une cascade oubliée emporterait l'historique au
      premier effacement de compte, **sans bruit** ». La règle ne protège pas
      contre le mauvais raisonnement — elle protège contre l'oubli, qui n'en
      fait aucun.
- [x] Passées en `restrict`. L'effacement devient un geste **écrit quelque
      part**, et ce quelque part est `association_effacer_traces`, appelée par
      `anonymize_user` et par le nettoyage des tests
- [x] Les **cœurs** et les **inscriptions** y sont ajoutés : un cœur dit qu'une
      personne a approuvé un message, une inscription qu'elle comptait venir
      quelque part un jour donné. Deux faits personnels que la 0099 laissait
      derrière elle

**Contrôles passés** : typecheck, 170 tests de schéma et de sécurité,
20 tests de cycle de vie du compte, 23 tests d'accès associatif et
d'énumération des écrivains de `entitlements`.

---

## Étape 2 — L'administration

### Le socle ✅

- [x] **`0101`** — la campagne et le mot du mois. Le total des kits est **sommé,
      jamais stocké** : un total rangé à côté de ses parts finit toujours par
      les contredire, et c'est le total qu'on croit. Les régions sont du
      **texte**, pas une énumération — le document demande de pouvoir en
      ajouter, et une énumération exigerait un développeur pour une décision
      qui appartient à l'association
- [x] **`0102`** — onze fonctions d'administration. Les quatre chiffres du
      prototype sont enfin les vrais : « à modérer » et « prochaine
      publication » remplacent les substituts de la `0095`
- [x] **`0103`** — le corps passe des **sections aux blocs**. Voir ci-dessous
- [x] **`0104`** — `admin_enregistrer_publication` : le contenu et sa version
      dans **une transaction**, parce que l'éditeur n'a qu'un bouton
- [x] **`0105`** — correctif : la lecture d'un contenu ne rendait pas ses
      champs neufs. Voir ci-dessous
- [x] Quatre routes d'API, chacune avec sa garde, et trois codes d'erreur
      traduits dans les deux langues
- [x] **13 tests** sur les refus et les effets de bord

### Pourquoi le modèle a changé

Le document décrit un corps de **blocs** : intertitre, paragraphe, liste,
**citation**, **photo avec légende**. La base portait des **sections**
`{titre, paragraphes[], points[]}` — qui ne savent dire ni citation ni photo,
et qui interdisent qu'un article commence par du texte.

Un éditeur par blocs ne peut pas produire ce que le modèle ne porte pas.
Convertir maintenant a coûté 22 sections devenues 50 blocs ; convertir après
l'écran aurait coûté l'écran.

Une contrainte refuse désormais un bloc de type inconnu — parce qu'un bloc
inconnu ne casse rien : il **disparaît silencieusement au rendu**, et son texte
reste en base, invisible.

> **Ce que la contrainte a attrapé.** La fixture des tests d'accès insérait
> encore des sections : les 12 tests du fichier sont passés en **ignorés**,
> exactement le symptôme que `CLAUDE.md` décrit — un `beforeAll` qui tombe ne
> fait pas échouer, il fait disparaître.

### Une perte de données évitée de justesse

`admin_lire_contenu_association` datait d'avant ces migrations : elle ne rendait
**ni le type, ni les publics, ni le lien de la vidéo, ni le fichier, ni
l'atelier, ni la programmation, ni le texte alternatif**.

L'éditeur la lit pour se remplir. Ouvrir une publication existante lui aurait
donné des valeurs **par défaut** à la place des vraies — et le premier
enregistrement les aurait écrites. Un replay perdait son lien, une fiche son
fichier, et l'écran affichait un succès.

Une fonction de lecture incomplète est dangereuse **parce qu'elle réussit** :
c'est le formulaire qu'elle remplit qui détruit.

### `daveEdit` — Rédiger une publication ✅

- [x] Le corps **bloc par bloc**, les cinq types du document. `↑` **échange**
      avec le précédent (éteint sur le premier, pas retiré : sinon les suivants
      se décaleraient d'une ligne à l'autre), `×` supprime
- [x] La liste de contrôle **en six points**, et « Programmer » bloqué tant
      qu'il en manque — le bouton dit combien. Ce qui manque est en gras ;
      ce qui est fait s'efface. On ne regarde pas ce qu'on a déjà
- [x] Le titre s'écrit **dans la police et la taille qu'il aura**
- [x] Le compteur du chapeau vire à l'accent **au-delà** de 220, jamais à son
      approche : prévenir trop tôt fait s'arrêter d'écrire avant d'y être
- [x] Le temps de lecture calculé des deux côtés par la même règle — 200 mots
      la minute, minimum une. Vérifié : 450 mots donnent 3 minutes
- [x] L'aperçu rend les mêmes blocs, **dans la page** : une fenêtre modale
      demanderait de piéger le focus et de gérer l'échappement, et l'éditeur
      veut relire, pas simuler
- [x] Éprouvé dans le navigateur : la liste passe de 5 manquants à 0, le
      bouton suit, et `↑` inverse bien deux blocs
- [x] **13 tests de composant**

> **Le seul écran client du back-office, et c'est assumé.** Tout le reste est
> rendu par le serveur sans un octet de JavaScript. Ajouter un bloc, compter
> les mots et valider six points **à la frappe** sont des changements d'état
> sans adresse. Le serveur reste le seul à ÉCRIRE : l'état part en un champ
> caché, la route valide, la base tranche. La liste de contrôle n'autorise
> rien — elle explique d'avance ce que le serveur refuserait.

> **Un piège trouvé en chemin.** Le composant importait depuis le tonneau
> `@/components/admin`, qui exporte aussi le gabarit serveur — lequel tire
> `session.ts` et le client de service dans le paquet du navigateur. Next a
> refusé, et il a bien fait : l'erreur de compilation est la seule chose qui
> sépare un barillet pratique d'une **clé `service_role` publiée**.

### Un manque nommé, pas caché

- **« Prévenir les adhérents » enregistre une intention, pas un envoi.** La
  case pose `prevenir_adherents` ; l'e-mail viendra avec les automatismes.
  Promettre un envoi qui ne part pas serait pire que ne rien promettre

> Le **dépôt de fichier** figurait ici comme second manque. Il est branché
> depuis le 29 septembre — migration `0109`, voir plus bas.

### `dave` — les cinq onglets ✅

- [x] **Publications** — pastille de type (CR, RT, PDF, ▶), état, date, vues,
      commentaires ; **rythme hebdomadaire** et **mot du mois** en colonne
- [x] **Agenda** — une carte par événement avec sa jauge, le formulaire de
      création, et la case d'ajout **dans la grille** : la place où l'on ajoute
      un atelier est celle où il apparaîtra
- [x] **Commentaires** — la file, les plus anciens d'abord : une file traitée
      par les plus récents laisserait les premiers messages attendre
      indéfiniment
- [x] **Adhérents** — inchangé
- [x] **Campagne** — le formulaire et l'aperçu côté adhérent
- [x] **La bande affiche enfin les quatre chiffres du prototype** : « à
      modérer » et « prochaine publication » étaient des substituts depuis la
      `0095`, faute de commentaires et de programmation. Les deux existent
- [x] **10 tests de composant**

> **Les compteurs d'onglets ne comptent que là où le nombre appelle un geste.**
> Publications, commentaires et adhérents en portent un ; l'agenda et la
> campagne n'en portent aucun. Un zéro sur l'agenda ne dirait pas « rien à
> faire », il dirait « aucun atelier » — autre information, qui se lit déjà
> dans l'onglet.

> **Trois choix de rendu, et leur raison.** Le vide du rythme est **dessiné**
> en pointillé, pas laissé blanc : un blanc se lirait comme une ligne en
> attente de chargement. « Approuver » est primaire et « Masquer » discret : un
> refus qui se clique aussi facilement qu'une approbation se clique par erreur.
> Et l'aperçu de campagne montre ce qui est **enregistré**, non ce qu'on tape —
> le prototype fait l'inverse, mais ce sont des chiffres que les adhérents
> liront comme un bilan.

> **Le lien d'un séminaire n'est jamais affiché**, même à l'équipe : il vaut une
> place, il se recopie. Un test l'interdit explicitement.

### Le corps accepte la vidéo et le son — migration `0108` (29 septembre)

Demande du propriétaire. Le corps portait cinq types de blocs ; il en porte
sept. Un média **dans le texte**, entre deux paragraphes : le témoignage filmé
d'une mère au milieu d'un récit, les trois minutes d'un atelier au milieu d'un
compte rendu. Sans lui, l'éditeur n'avait que deux issues — couper le média, ou
le mettre en tête et faire passer l'article pour un replay.

- [x] `video` et `audio`, même forme que `photo` : une adresse, une légende
- [x] La contrainte de base, le schéma Zod, le lecteur du service et les **deux**
      rendus d'article (V3 et V2) suivent ensemble
- [x] `preload="none"` partout — §5.1 : un média qui se charge de lui-même
      dépense un forfait que personne n'a engagé
- [x] **Un replay ne porte qu'une vidéo, et il la porte déjà** : celle de
      `video_url`, avec sa durée, celle que l'espace liste sous « Replays ».
      Son corps n'en reçoit aucune autre
- [x] 7 tests d'intégration, 6 de composant

> **Ce refus-là s'applique DÈS LE BROUILLON**, contrairement à ses trois
> voisins. Ils disent « il manque quelque chose », et un brouillon a le droit
> d'être incomplet ; celui-ci dit « il y en a de trop ». Le découvrir à la
> publication ferait écrire tout l'article pour rien.

> **Pourquoi la limite n'est pas en base.** Elle croise deux tables — le type
> vit sur `association_contents`, le corps sur
> `association_content_translations` — ce qu'une contrainte `check` ne sait pas
> dire. Et elle ne protège aucune donnée : une seconde vidéo n'est pas
> incohérente, elle est de trop. Elle vit donc dans la route, avec ses sœurs.

### Le dépôt de fichiers, et deux bucket (29 septembre)

Demande du propriétaire : « choisir un fichier dans l'appareil ». Migration
`0109`, route `POST /api/admin/association/fichiers`, contrôle `ChampFichier`
posé sur la couverture, la fiche PDF, la vidéo du replay et chaque média du
corps.

- [x] **C'est le RÔLE qui décide du bucket, pas le format.** La `couverture` va
      dans `association-images`, **public** ; `photo`, `video`, `audio` et
      `document` dans `association-fichiers`, **privé**
- [x] Le privé est servi par **URL signée de 300 s**, produite par le service au
      moment de lire — donc jamais pour qui n'a pas le droit de lire
- [x] Quatre contrôles au dépôt : rôle, taille, type déclaré, **octets de tête**
- [x] Le **nom d'origine est jeté**, remplacé par un jeton aléatoire
- [x] Les **adresses collées à la main continuent de marcher**
- [x] **Le dépôt se VOIT** : confirmation « ✓ *nom* déposé », et aperçu du média
      dans le bloc — sans quoi le seul retour était un champ qui se remplissait
      d'un chemin de stockage, et l'éditeur croyait son fichier perdu
- [x] **Les médias sont bornés en HAUTEUR**, pas seulement en largeur : une
      photo de téléphone en 3:4 remplissait 1 125 px dans une colonne de 844 —
      plus d'un écran pour une illustration. Et la V2 n'avait aucune règle du
      tout : une photo s'y affichait à sa taille naturelle, débordant la page
      et ajoutant un défilement horizontal
- [x] 14 tests d'intégration, 9 de composant

> **Pourquoi la couverture est publique.** C'est le même arbitrage que `covers`
> à la migration `0020` : elle s'affiche sur les cartes de `/association`, y
> compris celles des contenus RÉSERVÉS, où elle est justement ce qui donne
> envie d'adhérer. La signer la retirerait du CDN et ferait payer une URL neuve
> à chaque visite, à un public dont §5.1 rappelle qu'une part importante est sur
> réseau mobile lent.

> **Pourquoi le reste ne l'est pas.** Ces fichiers vivent dans le corps, que la
> base ne rend que si `can_read` est vrai. Les mettre en accès libre ferait
> tenir le mur sur le texte seul, et laisserait passer tout ce qui n'en est pas.
> C'est l'arbitrage n° 15 du cahier des charges, du 28 septembre.

> **Un type dont on ne sait pas reconnaître la signature est REFUSÉ.** Le
> réflexe inverse — « je ne sais pas vérifier, donc je laisse passer » —
> transforme chaque format ajouté en trou, sans que personne le remarque : le
> dépôt marche, et c'est tout ce qu'on regarde.

### Publier tout de suite, et pouvoir enfin garder un brouillon (29 septembre)

- [x] Trois diffusions : **publier maintenant**, programmer, garder en brouillon
- [x] Le créneau ne s'affiche que sous « programmer » — visible ailleurs, il
      ferait choisir une date sans effet
- [x] **Un brouillon a le droit d'être incomplet** : la liste de contrôle ne
      bloque plus que ce qui PARAÎT

> **Deux défauts fermés au passage.** L'écran ne savait que programmer : le
> champ caché `publier` valait l'état courant, si bien qu'un texte neuf ne
> pouvait jamais paraître tout de suite. Et le bouton « Brouillon » d'à côté
> envoyait EXACTEMENT la même chose que son voisin — deux gestes, un seul
> effet. Il a disparu.

### Le formulaire « Écrire une version » est retiré (29 septembre)

Demande du propriétaire. Il était le dernier morceau de l'ancien écran, et il
était **seul** à savoir écrire la version ANGLAISE : le retirer sans plus aurait
rendu l'anglais inéditable.

- [x] L'éditeur porte désormais la **langue du texte**, dans l'adresse (`?v=en`)
      et en champ caché
- [x] Deux **liens** FR / EN en tête de l'écran, absents tant que rien n'est
      enregistré

> **Le défaut que cela ferme.** L'écran lisait la version `fr` EN DUR, et
> l'action enregistrait sous la langue de l'INTERFACE. Ouvrir
> `/en/admin/association/rediger` chargeait donc le texte français et
> l'écrivait par-dessus l'anglais. Personne ne l'avait vu parce que la version
> anglaise se posait ailleurs — par le formulaire qui vient de disparaître.

### La création passe enfin par l'écran de rédaction (29 septembre)

« Nouvelle publication » ouvrait un formulaire replié au **bas** de l'écran
précédent, pendant que `daveEdit` existait à côté. Deux chemins de création
divergent, et c'est toujours celui qu'on n'a pas regardé qui écrit en base.

- [x] Le bouton est un **lien** vers `/admin/association/rediger`, d'un clic
- [x] Un **volet de choix** à sa droite — un `<details>`, donc sans JavaScript —
      pose le type avant d'arriver : `rediger?type=replay`
- [x] L'ancien formulaire est **supprimé**, et ses sept clés de traduction avec
- [x] `categorie` et `acces` passent de champs cachés à deux **sélecteurs** :
      ils ne vivaient que dans le formulaire disparu, et sans eux toute
      publication neuve serait née « Nos actions, réservée »
- [x] `TYPES_PUBLICATION` et `SIGLE_TYPE` vivent dans **un seul** module —
      trois écrans les recopiaient

> **Les puces « Publics concernés » rendaient mal, et voici pourquoi.** Elles
> portaient `.segOpt`, qui n'a ni fond ni trait : c'est `.seg`, le CONTENEUR,
> qui les dessine — et il n'y en a pas ici, puisqu'on en choisit plusieurs.
> Chaque bouton retombait donc sur le dessin du **navigateur**, gris système sur
> une carte sombre. Rien ne le signalait : un bouton sans style reste un bouton,
> et il marche.

## Étape 3 — L'espace adhérent

- [x] Route `/espace` et sa **règle d'entrée** (A1) — migrations `0106` et
      `0107`, quatre verdicts, la période de grâce lue en base et jamais
      recopiée
- [x] Mot du mois, rubriques, À la une, derniers contenus
- [x] Agenda (état seulement), campagne, fiches, replays
- [x] **L'entrée dans l'espace après l'achat** : la confirmation de
      souscription et les deux appels de `/association` mènent à `/espace` dès
      que le verdict l'ouvre. Ils menaient à la page publique — celle qui
      propose justement d'adhérer —, et l'adhérent devait deviner l'adresse
- [ ] Le test de la traduction **verdict → redirection** (les cinq situations
      sont vérifiées à la main, pas par la porte)
- [ ] Article : commentaires, cœurs, « À lire ensuite »
- [ ] Le bouton « S'inscrire » de l'agenda
- [ ] Mobile : une colonne, zones tactiles de 44 px

## Étape 4 — Les automatismes

- [ ] Publication à la date programmée
- [ ] Les sept e-mails de la Partie A6
- [ ] Liens signés de courte durée pour les fiches et les vidéos
- [ ] Export CSV des adhérents, listes d'inscrits

---

## Ce qui reste à trancher

| Question | État |
| --- | --- |
| Mettre §F4 bis du cahier des charges d'accord avec la décision | **en attente** |
| Profil d'adhérent (Parent, Enseignante…) : champ déclaratif ou déduit ? | en attente |
| « Offrir un mois » et « résilier au prorata » (Partie C) — écartés le 27 septembre | à reconfirmer |
