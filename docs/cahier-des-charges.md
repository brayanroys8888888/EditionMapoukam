# Cahier des charges — Plateforme e-commerce de contes africains

**Projet :** Site e-commerce et bibliothèque numérique de livres de contes pour enfants
**Positionnement :** Contes africains destinés au marché international
**Version du document :** 1.0
**Date :** Juillet 2026

---

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Cibles utilisateurs](#2-cibles-utilisateurs)
3. [Modèle économique](#3-modèle-économique)
4. [Périmètre fonctionnel](#4-périmètre-fonctionnel)
5. [Exigences non fonctionnelles](#5-exigences-non-fonctionnelles)
6. [Architecture technique](#6-architecture-technique)
7. [Stack technologique](#7-stack-technologique)
   - [7.4 Chaîne d'ingestion du contenu](#74-chaîne-dingestion-du-contenu)
8. [Modèle de données](#8-modèle-de-données)
9. [Flux détaillés](#9-flux-détaillés)
10. [Protection du contenu](#10-protection-du-contenu)
11. [Conformité légale](#11-conformité-légale)
12. [Phasage et lots de livraison](#12-phasage-et-lots-de-livraison)
13. [Estimation de charge](#13-estimation-de-charge)
14. [Prérequis et livrables attendus du client](#14-prérequis-et-livrables-attendus-du-client)
15. [Risques et points d'attention](#15-risques-et-points-dattention)
16. [Décisions arrêtées et points ouverts](#16-décisions-arrêtées-et-points-ouverts)

---

## 1. Contexte et objectifs

### 1.1 Contexte

Le projet consiste à créer une plateforme web permettant la diffusion et la commercialisation de livres de contes pour enfants, avec une orientation éditoriale centrée sur le **patrimoine narratif africain**, à destination d'un **public international**.

### 1.2 Objectifs du projet

| # | Objectif | Indicateur de réussite |
|---|---|---|
| O1 | Valoriser et diffuser le patrimoine des contes africains | Nombre de titres publiés |
| O2 | Générer un revenu récurrent via l'abonnement | Nombre d'abonnés actifs / taux de rétention |
| O3 | Générer un revenu à l'acte via la vente unitaire | Nombre de commandes / panier moyen |
| O4 | Toucher une audience internationale | Répartition géographique du trafic |
| O5 | Offrir une expérience de lecture adaptée aux enfants | Temps de lecture moyen par session |

### 1.3 Périmètre

**Inclus dans le projet :**
- Site web responsive (desktop, tablette, mobile)
- Catalogue multilingue de livres numériques
- Système d'abonnement avec lecture en ligne
- Système de vente à l'unité avec téléchargement
- Espace utilisateur
- Back-office d'administration

**Exclu du projet (V1) :**
- Applications mobiles natives iOS / Android
- Production du contenu éditorial (textes, illustrations, traductions)
- Livres audio et narration
- Impression et vente de livres physiques

---

## 2. Cibles utilisateurs

### 2.1 Personas

**P1 — Le parent acheteur (cible principale, payeur)**
Adulte de 28 à 45 ans, cherche du contenu de qualité et culturellement riche pour ses enfants. C'est lui qui crée le compte, paie et choisit les livres. Sensible à la sécurité et à l'absence de publicité.

**P2 — L'enfant lecteur (utilisateur final, non payeur)**
Enfant de 3 à 12 ans. Consomme le contenu, ne gère ni compte ni paiement. Nécessite une interface simple, visuelle, avec peu de texte d'interface.

**P3 — La diaspora africaine (cible différenciante)**
Familles installées hors d'Afrique souhaitant transmettre un héritage culturel à leurs enfants. Cible à fort potentiel pour le positionnement « contes africains à l'international ».

**P4 — L'enseignant / éducateur (cible secondaire)**
Utilise la plateforme en classe ou en bibliothèque. Besoins spécifiques : accès multi-élèves, filtrage par âge et niveau de lecture.

**P5 — L'administrateur (interne)**
Gère le catalogue, les langues, les prix, les utilisateurs et consulte les statistiques de vente.

### 2.2 Matrice des droits

| Fonctionnalité | Visiteur | Compte gratuit | Abonné | Acheteur | Admin |
|---|---|---|---|---|---|
| Parcourir le catalogue | Oui | Oui | Oui | Oui | Oui |
| Lire un extrait | Oui | Oui | Oui | Oui | Oui |
| Lire un livre en ligne (intégral) | Non | Non | Oui | Oui (ses achats) | Oui |
| Télécharger un fichier | Non | Non | Non | Oui (ses achats) | Oui |
| Gérer sa bibliothèque | Non | Oui | Oui | Oui | Oui |
| Gérer le catalogue | Non | Non | Non | Non | Oui |

---

## 3. Modèle économique

### 3.1 Les deux flux de revenus

**Flux A — Abonnement (revenu récurrent)**
L'utilisateur paie un abonnement mensuel ou annuel qui lui donne accès à la **lecture en ligne illimitée** du catalogue. Aucun téléchargement de fichier n'est possible via ce flux.

**Flux B — Achat à l'unité (revenu ponctuel)**
L'utilisateur achète un livre spécifique. L'achat lui donne un **droit de téléchargement permanent** du fichier (PDF et/ou EPUB), ainsi qu'un accès en lecture en ligne à ce titre, sans limite de durée.

### 3.2 Règle de répartition entre les deux flux

Trois principes, à appliquer systématiquement :

1. **Le téléchargement n'est jamais inclus dans l'abonnement.** L'abonnement donne accès à la lecture en ligne, rien d'autre. C'est la séparation nette qui empêche les deux flux de se cannibaliser.
2. **Tous les titres rejoignent l'abonnement à terme.** Réserver une partie du catalogue à la vente exclusive viderait l'offre d'abonnement de sa substance, d'autant plus qu'elle démarre avec un fonds réduit.
3. **Les nouveautés sont vendues à l'unité pendant 3 mois**, puis basculent automatiquement dans l'abonnement (modèle de « fenêtre » classique en édition et dans l'audiovisuel).

Cette règle donne une raison d'acheter (disposer du titre immédiatement et le conserver) et une raison de rester abonné (le fonds s'enrichit chaque mois). Elle est directement supportée par les champs `inclus_abonnement`, `disponible_achat` et `publie_le` du modèle de données (section 8).

### 3.3 Grille tarifaire

Le positionnement éditorial attire mécaniquement deux publics au pouvoir d'achat très différent. Une grille unique exclurait l'un ou sous-facturerait l'autre : deux zones de prix sont donc prévues, déterminées par le **pays de paiement** (et non par l'adresse IP, plus facilement contournable).

**Zone internationale — Europe, Amérique du Nord, reste du monde**

| Offre | Périodicité | Contenu | Prix |
|---|---|---|---|
| Découverte | — | 1 extrait par livre + 1 conte gratuit complet | Gratuit |
| Achat unitaire — standard | Ponctuel | Téléchargement + lecture illimitée du titre | 4,99 € |
| Achat unitaire — titre premium | Ponctuel | Idem, titres longs ou fortement illustrés | 6,99 € |
| Abonnement mensuel | Mensuel | Lecture en ligne illimitée | 7,99 € |
| Abonnement annuel | Annuel | Lecture en ligne illimitée (≈ 2 mois offerts) | 69 € |

**Zone Afrique — paiement par Mobile Money**

| Offre | Périodicité | Prix | Équivalent |
|---|---|---|---|
| Achat unitaire | Ponctuel | 1 500 FCFA | ≈ 2,30 € |
| Abonnement mensuel | Mensuel | 2 500 FCFA | ≈ 3,80 € |
| Abonnement annuel | Annuel | 22 000 FCFA | ≈ 33 € |

> **Condition d'ouverture de l'abonnement.** Les plateformes établies du secteur proposent plusieurs dizaines de milliers de titres pour un tarif mensuel comparable. Un abonnement à 7,99 € adossé à un catalogue de quelques titres ne soutiendra pas la comparaison et générera surtout des résiliations. Il est donc recommandé de **développer l'abonnement dans le périmètre initial mais de ne l'ouvrir commercialement qu'à partir d'un seuil de 30 à 40 titres publiés**. La vente à l'unité, elle, est exploitable dès le premier titre.

### 3.4 Périodes d'essai et promotions

- Essai gratuit de l'abonnement de 7 jours, avec moyen de paiement requis et renouvellement automatique à l'issue
- Codes promotionnels (montant fixe ou pourcentage, avec date d'expiration)
- Ces mécanismes sont gérés nativement par le prestataire de paiement

---

## 4. Périmètre fonctionnel

### 4.1 Front-office — Espace public

#### F1. Page d'accueil
- Bannière de présentation du positionnement éditorial
- Mise en avant de titres (nouveautés, coups de cœur, sélection par âge)
- Présentation des deux offres (abonnement / achat)
- Sélecteur de langue

#### F2. Catalogue
- Liste paginée des livres avec vignettes de couverture
- **Filtres :** tranche d'âge, langue, thème/région d'origine du conte, type d'accès (abonnement / achat), niveau de lecture
- **Tri :** nouveautés, popularité, alphabétique, prix
- Recherche par mot-clé (titre, auteur, thème)

#### F3. Fiche livre
- Couverture, titre, auteur, illustrateur
- Résumé, tranche d'âge, nombre de pages, langues disponibles
- Origine culturelle du conte (pays / peuple / tradition) — élément différenciant du positionnement
- Bouton « Lire un extrait » (aperçu limité, ex. 3 à 5 pages)
- Boutons d'action selon le statut de l'utilisateur : « Lire en ligne » (abonné), « Acheter » (visiteur/gratuit), « Télécharger » (acheteur)
- Suggestions de titres similaires

#### F4. Pages éditoriales
- À propos / la démarche du projet
- Foire aux questions
- Conditions générales de vente et d'utilisation
- Politique de confidentialité
- Formulaire de contact

### 4.2 Front-office — Espace utilisateur

#### F5. Authentification
- Inscription par email et mot de passe
- Connexion sociale (Google) — optionnelle mais recommandée pour réduire les frictions
- Vérification de l'adresse email
- Réinitialisation de mot de passe
- Déconnexion

#### F6. Tableau de bord utilisateur
- Statut de l'abonnement (actif, en essai, expiré, annulé)
- Date du prochain prélèvement
- Accès à la gestion de l'abonnement (changement d'offre, annulation)

#### F7. Ma bibliothèque
- Section « Mes achats » : livres achetés, avec bouton de téléchargement (PDF / EPUB)
- Section « En cours de lecture » : reprise à la dernière page lue
- Section « Favoris » : titres mis de côté

#### F8. Lecteur en ligne
- Affichage page par page, adapté au format album illustré
- Navigation : page précédente / suivante, accès direct à une page, sommaire
- Mode plein écran
- Sauvegarde automatique de la progression de lecture
- Zoom sur les illustrations
- Adaptation mobile (navigation par balayage)
- **Aucun bouton de téléchargement ou d'impression dans ce mode**

#### F9. Tunnel d'achat
- Panier (permettant l'achat de plusieurs titres en une transaction)
- Page de paiement hébergée par le prestataire de paiement
- Page de confirmation de commande
- Envoi automatique d'un email de confirmation avec accès aux téléchargements
- Historique des commandes et accès aux factures

### 4.3 Back-office — Administration

#### F10. Gestion du catalogue
- Création, modification, suppression et archivage d'un livre
- Champs : titre, auteur, illustrateur, résumé, tranche d'âge, thème, origine culturelle, mots-clés
- Téléversement des fichiers : couverture, fichier de lecture, fichier téléchargeable (PDF / EPUB)
- Gestion des versions linguistiques d'un même livre
- Paramétrage par livre : inclus dans l'abonnement (oui/non), disponible à l'achat (oui/non), prix, date de publication
- Statut : brouillon / publié / archivé

#### F11. Gestion des utilisateurs
- Liste et recherche des comptes
- Consultation du statut d'abonnement et de l'historique d'achats
- Suspension d'un compte
- Attribution manuelle d'un accès (geste commercial, compte de démonstration)

#### F12. Gestion commerciale
- Liste des commandes avec statut et montant
- Liste des abonnements actifs, en essai, annulés
- Création et gestion de codes promotionnels
- Traitement des remboursements

#### F13. Tableau de bord statistique
- Chiffre d'affaires par période (abonnement vs vente unitaire)
- Nombre d'abonnés actifs, nouvelles inscriptions, résiliations
- Titres les plus lus et les plus achetés
- Répartition géographique et linguistique de l'audience

---

## 5. Exigences non fonctionnelles

### 5.1 Performance

| Exigence | Cible |
|---|---|
| Chargement initial d'une page | < 2,5 s sur connexion mobile 4G |
| Affichage d'une page de livre dans le lecteur | < 1 s |
| Score Lighthouse (performance) | > 85 |
| Disponibilité du service | > 99 % |

Le public étant international et une partie de l'audience potentiellement située en Afrique où les connexions peuvent être plus lentes, l'optimisation des images est **critique** : formats modernes (WebP/AVIF), chargement progressif, dimensionnement adaptatif.

### 5.2 Sécurité

- Chiffrement HTTPS sur l'intégralité du site
- Mots de passe hachés (jamais stockés en clair)
- Aucune donnée bancaire stockée sur la plateforme (délégation totale au prestataire de paiement)
- Protection contre les injections SQL, XSS et CSRF
- Limitation du nombre de tentatives de connexion
- Vérification systématique des droits d'accès côté serveur (jamais uniquement côté navigateur)

### 5.3 Accessibilité et ergonomie

- Conformité RGAA / WCAG 2.1 niveau AA visée
- Contrastes suffisants, tailles de police adaptées à la lecture enfantine
- Navigation possible au clavier
- Interface enfant : icônes explicites, peu de texte, zones cliquables larges

### 5.4 Référencement (SEO)

- Rendu côté serveur des pages publiques (catalogue et fiches livre indexables)
- URLs lisibles et structurées par langue
- Balises `hreflang` pour les versions linguistiques
- Données structurées Schema.org (type `Book`, `Product`)
- Sitemap XML généré automatiquement

### 5.5 Multilinguisme

Deux niveaux distincts à ne pas confondre :

1. **Interface du site** (menus, boutons, emails) : gérée par une bibliothèque d'internationalisation, avec fichiers de traduction.
2. **Contenu des livres** : chaque livre peut exister en plusieurs versions linguistiques, chacune ayant ses propres fichiers. Un livre est donc une entité « parente » avec N déclinaisons linguistiques.

**Langues retenues pour la V1 : français et anglais.** L'architecture doit permettre d'ajouter une langue supplémentaire sans redéveloppement, par simple ajout d'un fichier de traduction pour l'interface et d'une déclinaison linguistique pour chaque livre.

### 5.6 Compatibilité

- Navigateurs : Chrome, Safari, Firefox, Edge (deux dernières versions majeures)
- Résolutions : à partir de 320 px de large
- Approche « mobile-first » : le trafic sur ce type de service est majoritairement mobile

---

## 6. Architecture technique

### 6.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                        UTILISATEUR                          │
│              (navigateur desktop / mobile)                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│                      CDN / EDGE                             │
│         Cache des pages, images, fichiers statiques         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  APPLICATION WEB (Next.js)                  │
│  ┌─────────────────┐         ┌───────────────────────────┐  │
│  │  Pages publiques│         │  API / logique métier     │  │
│  │  (rendu serveur)│         │  (routes protégées)       │  │
│  └─────────────────┘         └───────────────────────────┘  │
└──────┬──────────────────┬───────────────────┬───────────────┘
       │                  │                   │
┌──────▼──────┐  ┌────────▼────────┐  ┌───────▼──────────────┐
│  BASE DE    │  │   STOCKAGE      │  │   SERVICES TIERS     │
│  DONNÉES    │  │   FICHIERS      │  │                      │
│             │  │                 │  │  • Paiement (Stripe) │
│ PostgreSQL  │  │ • Couvertures   │  │  • Mobile Money      │
│             │  │ • Fichiers      │  │  • Emails            │
│ • Users     │  │   lecture       │  │  • Analytics         │
│ • Livres    │  │ • Fichiers      │  │  • Suivi d'erreurs   │
│ • Commandes │  │   téléchargeables│ │                      │
│ • Abonnts   │  │  (accès privé)  │  │                      │
└─────────────┘  └─────────────────┘  └──────────────────────┘
```

### 6.2 Principe de sécurité central

Le point le plus important de l'architecture : **les fichiers de livres ne sont jamais accessibles publiquement**. Le bucket de stockage est privé. Chaque accès à un fichier passe par une route API qui :

1. Identifie l'utilisateur connecté
2. Vérifie son droit d'accès en base de données (abonnement actif OU achat de ce titre)
3. Génère une URL signée à durée de vie très courte (quelques minutes)
4. Redirige l'utilisateur vers cette URL

Sans ce mécanisme, un utilisateur pourrait partager une URL de fichier et contourner intégralement le modèle économique.

### 6.3 Séparation des fichiers par usage

Chaque livre dispose de **deux jeux de fichiers distincts** :

| Usage | Format | Caractéristiques |
|---|---|---|
| Lecture en ligne (abonnement) | Images de pages ou EPUB découpé | Servi page par page, jamais en bloc, non téléchargeable |
| Téléchargement (achat) | PDF et/ou EPUB complet | Généré à la demande avec filigrane personnalisé |

---

## 7. Stack technologique

### 7.1 Tableau récapitulatif

| Couche | Technologie retenue | Alternative | Justification |
|---|---|---|---|
| Framework web | Next.js (React) | Nuxt (Vue) | Rendu serveur natif (SEO), écosystème mature, API intégrée |
| Langage | TypeScript | JavaScript | Réduit les erreurs sur un projet à forte logique métier |
| Style | Tailwind CSS | CSS Modules | Rapidité de développement en solo |
| Base de données | PostgreSQL | MySQL | Relationnel, robuste, standard |
| Backend / BaaS | Supabase | Firebase, backend custom | Regroupe base de données, authentification et stockage : gain de temps majeur en solo |
| Authentification | Supabase Auth | Auth.js (NextAuth) | Intégré, gère email + OAuth |
| Stockage fichiers | Supabase Storage ou Cloudflare R2 | AWS S3 | R2 : pas de frais de sortie, avantageux pour de la diffusion de fichiers |
| CDN | Cloudflare | Vercel Edge | Couverture mondiale, essentiel pour l'audience internationale |
| Paiement international | Stripe | Paddle, Lemon Squeezy | Référence pour abonnements + paiements uniques |
| Paiement Afrique | CinetPay / Flutterwave / PayDunya | — | Mobile Money (Orange, MTN, Wave), non couvert par Stripe |
| Lecteur EPUB | epub.js | — | Bibliothèque de référence pour l'affichage EPUB navigateur |
| Lecteur PDF | PDF.js | — | Solution Mozilla, éprouvée |
| Manipulation PDF | pdf-lib | PDFKit | Génération de filigranes à la volée côté serveur |
| Internationalisation | next-intl | i18next | Intégration native avec le routage Next.js |
| CMS (optionnel) | Sanity.io | Strapi | Permet au client de gérer le catalogue sans développeur |
| Emails | Resend | Postmark, SendGrid | Emails transactionnels, bonne délivrabilité |
| Analytics | Plausible ou Umami | Google Analytics | Respectueux de la vie privée, pertinent pour un public mineur |
| Suivi d'erreurs | Sentry | — | Détection des bugs en production |
| Hébergement | Vercel | Netlify, Railway | Déploiement natif Next.js, tier gratuit généreux |
| Gestion de versions | Git + GitHub | GitLab | Standard, intégration continue |

### 7.2 Justification des choix structurants

**Pourquoi Next.js plutôt qu'une solution e-commerce prête à l'emploi ?**
Les plateformes type Shopify sont conçues pour vendre des produits, pas pour héberger une bibliothèque de lecture en ligne protégée avec gestion d'abonnement et de droits d'accès granulaires. Le besoin ici est hybride, ce qui justifie un développement sur mesure.

**Pourquoi Supabase ?**
Sur un projet mené en solo, il remplace trois briques (base de données, authentification, stockage) par un seul service, avec une console d'administration intégrée. Cela peut représenter plusieurs semaines de développement économisées.

**Pourquoi deux prestataires de paiement ?**
Stripe couvre excellemment l'Europe, l'Amérique du Nord et une partie de l'Asie, mais ne prend pas en charge le Mobile Money, qui est le moyen de paiement dominant dans une large partie de l'Afrique. Étant donné le positionnement éditorial, une part de l'audience sera vraisemblablement africaine. Prévoir cette double intégration dès la conception évite une refonte ultérieure du module de paiement.

### 7.3 Choix du prestataire de paiement

> **Point bloquant à trancher avant la mise en production.** Le choix du prestataire dépend directement du pays d'immatriculation de la structure qui portera l'activité — question aujourd'hui non résolue (voir section 16, question 6). Ce n'est pas une formalité administrative : c'est une dépendance dure du calendrier de lancement.

#### 7.3.1 La contrainte de départ

Stripe n'ouvre de comptes marchands que dans un nombre limité de pays (46 à ce jour). Sur le continent africain, la couverture se limite à quelques marchés desservis via Paystack — Ghana, Kenya, Nigeria, Afrique du Sud, Côte d'Ivoire. Le Cameroun bénéficie de l'automatisation fiscale de Stripe mais **pas du support des paiements**.

Conséquence directe : **si la société est immatriculée au Cameroun, Stripe est inaccessible**, et avec lui la solution d'abonnement récurrent la plus répandue du marché.

#### 7.3.2 Les trois voies possibles

| Voie | Principe | Avantages | Inconvénients |
|---|---|---|---|
| **A. Merchant of Record** (Paddle, Lemon Squeezy, Dodo Payments) | Le prestataire vend en son nom propre et reverse les revenus | Pas de dépendance au pays d'immatriculation ; **prend en charge la TVA internationale** ; gère abonnements et paiements uniques | Commission plus élevée que Stripe ; moins de contrôle sur l'expérience de paiement ; éligibilité du pays du vendeur à vérifier |
| **B. Société dans un pays supporté** (LLC américaine, société européenne) | Immatriculation à l'étranger pour accéder à Stripe | Accès à l'écosystème Stripe complet ; commissions faibles | Coût de constitution et de maintenance ; obligations comptables et fiscales réelles ; complexité administrative pour un porteur isolé |
| **C. Agrégateurs africains seuls** (Flutterwave, CinetPay, PayDunya) | Paiements locaux et Mobile Money uniquement | Immédiatement accessible ; couvre parfaitement le Mobile Money | Couverture internationale faible ou coûteuse — **contredit le positionnement international du projet** |

#### 7.3.3 Recommandation

**Voie A (Merchant of Record) combinée à un agrégateur africain pour le Mobile Money.**

Ce couple présente trois avantages décisifs pour une structure isolée :

- il lève la dépendance au pays d'immatriculation, donc débloque le calendrier sans attendre une décision juridique ;
- il transfère la gestion de la TVA sur les services numériques au prestataire, ce qui neutralise le risque R6 (section 15) — un poste de complexité considérable pour un vendeur international ;
- il couvre les deux zones tarifaires définies en section 3.3 avec les moyens de paiement adaptés à chacune.

**Vérifications à mener avant engagement :**
- éligibilité du pays du vendeur auprès du prestataire retenu ;
- support natif des abonnements récurrents (tous les MoR ne l'offrent pas au même niveau) ;
- taux de commission effectif, tous frais compris (change, retrait) ;
- modalités et délais de reversement des fonds.

#### 7.3.4 Implication sur la conception

Quel que soit le prestataire retenu, le module de paiement doit être développé derrière une **couche d'abstraction interne** : la logique métier (création de commande, octroi des droits d'accès, gestion du cycle de vie de l'abonnement) ne doit jamais dépendre directement de l'API d'un prestataire. Cela permet de changer de fournisseur, ou d'en ajouter un second, sans réécrire le tunnel d'achat.

### 7.4 Chaîne d'ingestion du contenu

Ce point conditionne la faisabilité opérationnelle du catalogue : sans lui, chaque nouveau titre serait un chantier manuel de plusieurs heures. La chaîne décrite ici permet au client de déposer un simple PDF dans le back-office et d'obtenir automatiquement toutes les ressources nécessaires à l'exploitation.

#### 7.4.1 Ce qu'un PDF suffit à produire

Un fichier PDF fourni par le client permet, sans autre livrable, de générer :

- les images de page (WebP) pour la lecture en ligne ;
- l'image de couverture aux différentes résolutions du catalogue ;
- le fichier PDF téléchargeable, filigrané à la commande ;
- un **EPUB à mise en page fixe**, format standard accepté par les principaux distributeurs de livres numériques.

**Le PDF est donc le seul livrable de contenu exigé du client.** Les autres formats sources (InDesign, Word, EPUB existant, Canva) sont bienvenus mais non requis.

#### 7.4.2 Les trois voies de production du fichier téléchargeable

| Voie | Condition d'application | Rendu de l'EPUB |
|---|---|---|
| **A. Sources fournies** | Le client livre un fichier de mise en page (InDesign, Word, Canva) ou un EPUB existant | EPUB redistribuable de qualité éditoriale, avec texte agrandissable et compatible avec la synthèse vocale |
| **B. EPUB à mise en page fixe** | Le client livre uniquement un PDF | La mise en page du PDF est préservée à l'identique, chaque page devenant une image dans l'EPUB. Format standard, distribuable |
| **C. Reconstruction redistribuable** | Le client livre un PDF avec couche texte et sollicite explicitement un EPUB reflowable | Extraction de texte + reconstruction. La mise en page originale est perdue et une relecture manuelle est nécessaire. **Non inclus dans le forfait titre — devis séparé** |

La voie B est le mode par défaut. Elle est entièrement automatisée et absorbe le format de sortie EPUB retenu (section 16.1) sans exiger davantage du client.

**Limite connue de la voie B :** un EPUB à mise en page fixe ne permet ni synthèse vocale ni agrandissement libre du texte. Correctif technique appliqué systématiquement lorsque le PDF source contient une couche texte : le texte de chaque page est extrait et inséré dans un bloc masqué visuellement mais accessible aux lecteurs d'écran et à la recherche.

#### 7.4.3 Étapes de la chaîne

Chaque titre déposé passe automatiquement par les étapes suivantes :

1. **Analyse** — détection de la présence d'une couche texte, du nombre de pages, des dimensions.
2. **Rendu des pages** — export de chaque page en image WebP (deux résolutions : haute pour tablette/desktop, allégée pour connexions lentes).
3. **Génération de la couverture** — extraction et redimensionnement dans les formats du catalogue (vignette, fiche, mise en avant).
4. **Génération de l'EPUB à mise en page fixe** — assemblage automatique à partir des gabarits (voie B).
5. **Extraction de texte** — récupération de la couche texte page par page, quand elle existe, pour la recherche interne et l'accessibilité.
6. **Publication en brouillon** — le titre apparaît dans le back-office pour saisie des métadonnées et validation avant mise en ligne.

La génération du PDF téléchargeable filigrané, elle, ne se fait pas à l'ingestion mais à l'achat (voir section 9.4).

#### 7.4.4 Conditions à respecter côté PDF

La chaîne ne peut pas améliorer ce que le PDF source ne contient pas. Deux exigences à imposer au client :

- **Résolution suffisante** — les images intérieures doivent être en 300 dpi minimum. Un PDF basse résolution produira des images de lecture floues.
- **Couche texte présente** — le PDF doit être généré numériquement, pas scanné. Si un titre provient d'un scan, un traitement OCR (Tesseract) doit être appliqué en amont ; ce traitement fait l'objet d'un devis séparé.

Ces exigences sont formalisées dans le **référentiel de production** remis au client (annexe à produire).

#### 7.4.5 Outils retenus

| Fonction | Outil | Licence |
|---|---|---|
| Rendu des pages en images | poppler (`pdftoppm`, `pdftocairo`) | GPL — appel en ligne de commande, sans incidence sur le code applicatif |
| Manipulation de PDF en processus | `pypdfium2` | Apache/BSD — permissive |
| Extraction de texte page par page | `pdftotext -bbox` (poppler) | GPL — appel en ligne de commande |
| Conversion et compression WebP | `sharp` (Node) | Apache 2.0 |
| OCR si PDF scanné | Tesseract | Apache 2.0 |
| Filigrane sur PDF à l'achat | `pdf-lib` | MIT |

> **Point d'attention licence.** Les bibliothèques `PyMuPDF` et `ebooklib`, très utilisées pour ce type de traitement en Python, sont sous licence **AGPL**. Cette licence se déclenche sur l'exposition en réseau — donc sur toute application web — et impose l'ouverture du code source. Elles sont écartées au profit des outils listés ci-dessus, tous sous licences permissives compatibles avec un projet propriétaire.

#### 7.4.6 Charge et volume

La chaîne d'ingestion représente un lot de développement additionnel à intégrer au lot 2 (voir section 12) :

- Charge estimée : **6 à 10 jours-homme** supplémentaires.
- Volume de stockage : environ **20 Mo par titre** (images de lecture en deux résolutions + EPUB + PDF source). Un catalogue de 40 titres pèse moins d'un gigaoctet, sans incidence significative sur les coûts d'hébergement.

Cet investissement est absorbé une seule fois : une fois la chaîne en place, l'ajout d'un titre supplémentaire au catalogue devient une opération de quelques minutes, entièrement pilotée depuis le back-office par le client.

---

## 8. Modèle de données

### 8.1 Entités principales

**`users`** — Comptes utilisateurs
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| email | texte | Adresse email (unique) |
| nom_complet | texte | Nom affiché |
| langue_preferee | texte | Code langue (fr, en...) |
| role | énumération | `user` / `admin` |
| cree_le | horodatage | Date de création |

**`books`** — Livre (entité parente, indépendante de la langue)
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| slug | texte | Identifiant URL |
| auteur | texte | Auteur / collecteur du conte |
| illustrateur | texte | Illustrateur |
| age_min / age_max | entier | Tranche d'âge |
| origine_culturelle | texte | Pays / peuple / tradition d'origine |
| themes | tableau | Mots-clés thématiques |
| couverture_url | texte | Image de couverture |
| inclus_abonnement | booléen | Accessible via abonnement |
| disponible_achat | booléen | Vendu à l'unité |
| prix | décimal | Prix de vente unitaire |
| statut | énumération | `brouillon` / `publie` / `archive` |
| publie_le | date | Date de publication |

**`book_translations`** — Version linguistique d'un livre
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| book_id | UUID | Référence au livre parent |
| langue | texte | Code langue |
| titre | texte | Titre traduit |
| resume | texte | Résumé traduit |
| fichier_lecture | texte | Chemin du fichier de lecture en ligne |
| fichier_telechargement | texte | Chemin du fichier téléchargeable |
| nb_pages | entier | Nombre de pages |

**`subscriptions`** — Abonnements
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| user_id | UUID | Référence utilisateur |
| id_prestataire | texte | Identifiant côté prestataire de paiement |
| offre | texte | `mensuel` / `annuel` |
| statut | énumération | `essai` / `actif` / `annule` / `impaye` / `expire` |
| debut_periode | horodatage | Début de la période en cours |
| fin_periode | horodatage | Fin de la période en cours |

**`orders`** — Commandes (achats unitaires)
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| user_id | UUID | Référence utilisateur |
| montant_total | décimal | Montant payé |
| devise | texte | Devise |
| statut | énumération | `en_attente` / `paye` / `rembourse` / `echoue` |
| prestataire | texte | `stripe` / `mobile_money` |
| reference_paiement | texte | Référence de transaction |
| cree_le | horodatage | Date de commande |

**`order_items`** — Lignes de commande
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| order_id | UUID | Référence commande |
| book_id | UUID | Référence livre |
| langue | texte | Version linguistique achetée |
| prix_unitaire | décimal | Prix au moment de l'achat |

**`entitlements`** — Droits d'accès (table centrale)
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| user_id | UUID | Référence utilisateur |
| book_id | UUID | Référence livre |
| type | énumération | `achat` / `abonnement` / `offert` |
| peut_telecharger | booléen | Droit de téléchargement |
| accorde_le | horodatage | Date d'octroi |
| expire_le | horodatage | Nul si permanent |

> Cette table est la **clé de voûte du système**. Toute demande d'accès à un contenu la consulte. Elle permet de découpler les droits de leur origine (achat, abonnement, geste commercial) et de gérer proprement le cas d'un abonnement expiré : les achats unitaires restent accessibles, la lecture par abonnement ne l'est plus.

**`reading_progress`** — Progression de lecture
| Champ | Type | Description |
|---|---|---|
| user_id | UUID | Référence utilisateur |
| book_id | UUID | Référence livre |
| derniere_page | entier | Page atteinte |
| maj_le | horodatage | Dernière mise à jour |

**`download_logs`** — Journal des téléchargements
| Champ | Type | Description |
|---|---|---|
| id | UUID | Identifiant unique |
| user_id | UUID | Référence utilisateur |
| book_id | UUID | Référence livre |
| adresse_ip | texte | Adresse IP |
| telecharge_le | horodatage | Date du téléchargement |

> Utile pour détecter les partages abusifs (un même achat téléchargé depuis 40 adresses IP différentes) et pour le service après-vente.

### 8.2 Relations

```
users ──┬──< subscriptions
        ├──< orders ──< order_items >── books
        ├──< entitlements >── books
        ├──< reading_progress >── books
        └──< download_logs >── books

books ──< book_translations
```

---

## 9. Flux détaillés

### 9.1 Flux d'abonnement

```
1. L'utilisateur choisit une offre (mensuelle ou annuelle)
2. Redirection vers la page de paiement du prestataire
3. Paiement effectué
4. Le prestataire notifie la plateforme (webhook)
5. Création/mise à jour de l'enregistrement d'abonnement (statut = actif)
6. Envoi de l'email de bienvenue
7. L'utilisateur accède à la lecture en ligne du catalogue inclus
```

**Points de vigilance :**
- La notification par webhook est la **seule source de vérité** du statut de paiement. Ne jamais activer un abonnement sur la seule base d'une redirection navigateur, qui peut être falsifiée.
- Gérer les renouvellements automatiques, les échecs de prélèvement (statut `impaye`, période de grâce), et les annulations (accès maintenu jusqu'à la fin de la période payée).

### 9.2 Flux d'achat unitaire

```
1. L'utilisateur ajoute un ou plusieurs livres au panier
2. Validation du panier → création d'une commande (statut = en_attente)
3. Redirection vers la page de paiement
4. Paiement effectué
5. Notification webhook → commande passée au statut « payé »
6. Création automatique des droits d'accès (entitlements) avec droit de téléchargement
7. Email de confirmation contenant le lien vers la bibliothèque
8. Les fichiers deviennent téléchargeables depuis l'espace utilisateur
```

### 9.3 Flux de lecture en ligne

```
1. L'utilisateur ouvre un livre
2. Le serveur vérifie ses droits :
   - Abonnement actif ET livre inclus dans l'abonnement ?  → autorisé
   - Droit d'accès existant pour ce livre (achat) ?         → autorisé
   - Sinon                                                  → extrait uniquement
3. Chargement du lecteur, page par page
4. Chaque page est servie via une URL signée à durée très courte
5. La progression est enregistrée à chaque changement de page
```

### 9.4 Flux de téléchargement

```
1. L'utilisateur clique sur « Télécharger »
2. Le serveur vérifie l'existence d'un droit d'accès avec peut_telecharger = vrai
3. Si le fichier filigrané n'existe pas encore, il est généré :
   - Ajout d'un filigrane discret (email de l'acheteur + référence de commande)
   - Stockage du fichier personnalisé
4. Génération d'une URL signée valable quelques minutes
5. Enregistrement dans le journal des téléchargements
6. Téléchargement du fichier
```

---

## 10. Protection du contenu

Aucune protection n'est absolue sur du contenu numérique. L'objectif est de rendre la copie suffisamment contraignante pour que l'achat reste le chemin le plus simple, sans dégrader l'expérience des utilisateurs légitimes.

### 10.1 Mesures côté lecture en ligne

| Mesure | Effet |
|---|---|
| Stockage privé + URLs signées courtes | Empêche le partage direct de liens de fichiers |
| Chargement page par page | Empêche la récupération du livre complet en une requête |
| Rendu par image ou canvas | Empêche la sélection et la copie du texte |
| Désactivation du clic droit et du glisser-déposer | Freine la récupération naïve des images |
| Vérification des droits à chaque requête | Empêche le contournement côté navigateur |

### 10.2 Mesures côté téléchargement

| Mesure | Effet |
|---|---|
| Filigrane personnalisé (« DRM social ») | Dissuade le partage : le fichier est traçable jusqu'à l'acheteur |
| Journalisation des téléchargements | Permet de détecter les comportements anormaux |
| Limitation du nombre de téléchargements par période | Freine l'aspiration automatisée |

> **Recommandation :** privilégier le filigrane personnalisé à un DRM technique fort (type Adobe DRM). Ce dernier est coûteux, dégrade fortement l'expérience utilisateur et reste contournable. Le filigrane est peu coûteux, invisible pour l'utilisateur honnête, et efficace comme dissuasion.

---

## 11. Conformité légale

### 11.1 Droits sur le contenu

Point à clarifier impérativement avec le client avant la mise en ligne :

- Les contes issus de la **tradition orale** sont généralement libres de droits sur le fond, mais **toute version écrite, traduction ou adaptation particulière est protégée** par le droit d'auteur de son rédacteur.
- Les **illustrations** sont systématiquement protégées.
- Le client doit fournir, pour chaque titre, la preuve qu'il détient les droits de diffusion numérique et de vente.

### 11.2 Protection des données personnelles

| Réglementation | Zone | Implication |
|---|---|---|
| RGPD | Union européenne | Consentement explicite, droit d'accès et de suppression, registre des traitements |
| COPPA | États-Unis | Restrictions fortes sur la collecte de données de mineurs de moins de 13 ans |
| Loi camerounaise sur les données personnelles | Cameroun | À vérifier selon le lieu d'établissement |

**Principe directeur à appliquer :** le compte appartient au **parent adulte**. La plateforme ne collecte aucune donnée directement auprès de l'enfant (pas d'inscription enfant, pas de date de naissance de l'enfant, pas de commentaires publics). Cela simplifie considérablement la conformité.

### 11.3 Obligations commerciales

- Conditions générales de vente et d'utilisation
- Mentions légales
- Politique de confidentialité et gestion des cookies
- Droit de rétractation : pour un contenu numérique fourni immédiatement, la renonciation expresse au droit de rétractation doit être recueillie à l'achat (obligatoire dans l'Union européenne)
- Émission de factures conformes
- Gestion de la TVA sur les services numériques : les règles varient selon le pays de l'acheteur. Certains prestataires (Paddle, Lemon Squeezy) prennent en charge cette complexité en agissant comme revendeur officiel — une option à considérer sérieusement pour un vendeur international isolé.

---

## 12. Phasage et lots de livraison

### Lot 0 — Cadrage et conception
- Validation du cahier des charges
- Maquettes des écrans principaux
- Identité visuelle et charte graphique
- Mise en place de l'environnement technique

### Lot 1 — Socle technique
- Initialisation du projet et de l'infrastructure
- Base de données et modèle de données
- Authentification (inscription, connexion, réinitialisation)
- Structure du site et navigation
- Système d'internationalisation de l'interface

### Lot 2 — Catalogue
- Back-office de gestion des livres
- **Chaîne d'ingestion automatisée du contenu (section 7.4) :** dépôt d'un PDF, rendu des pages en WebP, génération de la couverture aux différentes résolutions, génération de l'EPUB à mise en page fixe, extraction de la couche texte
- Pages catalogue, filtres et recherche
- Fiches livre et extraits

### Lot 3 — Vente à l'unité
- Panier et tunnel d'achat
- Intégration du prestataire de paiement international
- Gestion des commandes et des droits d'accès
- Génération de fichiers filigranés et téléchargement sécurisé
- Emails transactionnels

### Lot 4 — Abonnement et lecture en ligne
- Offres et souscription d'abonnement
- Gestion du cycle de vie de l'abonnement (renouvellement, échec, annulation)
- Lecteur en ligne sécurisé
- Sauvegarde de la progression de lecture
- Espace « Ma bibliothèque »

### Lot 5 — Paiement Mobile Money
- Intégration d'un agrégateur africain
- Unification des flux de commande

### Lot 6 — Finalisation
- Tableau de bord statistique
- Optimisation des performances et du référencement
- Pages légales
- Tests de bout en bout
- Recette et mise en production

---

## 13. Estimation de charge

Estimation pour **un développeur seul**, en jours-homme. À ajuster selon le niveau d'expérience et le degré de finition attendu.

| Lot | Charge estimée |
|---|---|
| Lot 0 — Cadrage et conception | 5 à 8 j |
| Lot 1 — Socle technique | 8 à 12 j |
| Lot 2 — Catalogue *(incluant la chaîne d'ingestion, section 7.4)* | 16 à 25 j |
| Lot 3 — Vente à l'unité | 10 à 15 j |
| Lot 4 — Abonnement et lecture en ligne | 15 à 20 j |
| Lot 5 — Paiement Mobile Money | 5 à 8 j |
| Lot 6 — Finalisation | 8 à 12 j |
| **Total** | **67 à 100 jours-homme** |

Soit environ **3,5 à 5 mois** à temps plein, ou **7 à 10 mois** à mi-temps.

**Non inclus dans cette estimation :** la production du contenu (numérisation, illustration, traduction, mise en page des livres), qui constitue un chantier distinct et généralement plus long que le développement lui-même.

### Coûts d'exploitation indicatifs (mensuels, au démarrage)

| Poste | Ordre de grandeur |
|---|---|
| Hébergement application | Gratuit à faible jusqu'à une audience significative |
| Base de données et stockage | Gratuit à faible au démarrage |
| Nom de domaine | Coût annuel réduit |
| Emails transactionnels | Gratuit sous un certain volume |
| Prestataires de paiement | Commission sur transaction uniquement |
| Suivi d'erreurs et analytics | Tiers gratuits disponibles |

Les coûts d'infrastructure augmentent avec le trafic et le volume de stockage, principalement sur la diffusion des fichiers.

---

## 14. Prérequis et livrables attendus du client

Éléments à obtenir avant ou pendant le développement :

**Contenu**
- [ ] **Un fichier PDF par titre** — généré numériquement (non scanné), avec images intérieures en 300 dpi minimum. Voir section 7.4.4
- [ ] Pour chaque titre : titre, résumé, auteur, illustrateur, tranche d'âge, origine culturelle du conte
- [ ] Les versions traduites (français et anglais), ou la validation du budget de traduction
- [ ] La justification des droits de diffusion et de vente pour chaque titre
- [ ] *Optionnel :* les fichiers sources (InDesign, Word, EPUB existant) — permettent la voie A de la chaîne d'ingestion (EPUB redistribuable de meilleure qualité). En leur absence, la chaîne d'ingestion produit automatiquement un EPUB à mise en page fixe à partir du PDF (voie B)

**Commercial**
- [x] La grille tarifaire définitive — arrêtée, section 3.3 (à valider par le client)
- [x] La liste des langues à couvrir en V1 — français et anglais
- [x] La règle de répartition entre abonnement et vente unitaire — arrêtée, section 3.2

**Administratif et technique**
- [ ] Structure juridique permettant l'ouverture d'un compte marchand — **bloquant, voir section 7.3**
- [ ] Choix du prestataire de paiement, une fois la structure juridique connue
- [ ] Nom de domaine
- [ ] Éléments d'identité visuelle (logo, couleurs) ou validation d'une création
- [ ] Textes des pages légales (ou validation d'une rédaction)

---

## 15. Risques et points d'attention

| # | Risque | Probabilité | Impact | Mesure de réduction |
|---|---|---|---|---|
| R1 | Catalogue insuffisant au lancement, rendant l'abonnement peu attractif | Élevée | Élevé | Lancer d'abord la vente à l'unité ; n'ouvrir l'abonnement qu'à partir d'un seuil de titres |
| R2 | Droits sur les textes ou illustrations non sécurisés | **Élevée** | Très élevé | Exiger les justificatifs titre par titre avant toute mise en ligne. À ce jour non documenté (section 16.2) |
| R3 | Cannibalisation entre abonnement et vente unitaire | Élevée | Moyen | Traité : le téléchargement est exclu de l'abonnement et les nouveautés font l'objet d'une fenêtre de vente exclusive (section 3.2) |
| R4 | Coût des traductions sous-estimé | Élevée | Élevé | Traité : périmètre limité à deux langues en V1. Chiffrer la traduction avant engagement |
| R5 | Partage massif des fichiers téléchargés | Moyenne | Moyen | Filigrane personnalisé + journalisation |
| R6 | Complexité de la TVA internationale | Moyenne | Moyen | Traité : le recours à un prestataire agissant comme revendeur officiel transfère cette charge (section 7.3.3) |
| R7 | Coût d'acquisition client supérieur au revenu par client | Élevée | Élevé | Miser sur une niche identifiée (diaspora, écoles) plutôt que sur la publicité de masse |
| R8 | Développement en solo : délai qui s'étire | Élevée | Moyen | Découpage strict en lots livrables ; ne pas développer le lot 5 avant validation commerciale |
| R9 | **Impossibilité d'encaisser faute de structure juridique déterminée** | **Élevée** | **Très élevé** | Bloque la mise en production quel que soit l'avancement technique. Trancher le point 6 (section 16.2) dès le lot 0 ; la voie « revendeur officiel » lève partiellement la contrainte |
| R10 | Fichiers sources indisponibles, rendant la production de l'EPUB coûteuse | ~~Moyenne~~ Faible | Faible | Traité : la voie B de la chaîne d'ingestion (section 7.4.2) génère automatiquement un EPUB à mise en page fixe à partir du seul PDF, sans coût manuel |

---

## 16. Décisions arrêtées et points ouverts

### 16.1 Décisions arrêtées

| # | Question | Décision |
|---|---|---|
| 1 | Formats du contenu existant | Les titres existent au format PDF |
| 2 | Langues de la V1 | Français et anglais |
| 3 | Grille tarifaire | Arrêtée, deux zones — voir section 3.3 |
| 4 | Répartition abonnement / vente | Stratégie de fenêtre — voir section 3.2 |
| 7 | Formats téléchargeables | PDF **et** EPUB |
| 8 | Offre écoles et bibliothèques | Hors périmètre V1 ; à envisager ultérieurement (annexe A4) |
| 9 | Application mobile | Non prévue ; le site est conçu en approche « mobile-first » |

### 16.2 Points ouverts — à trancher avant le démarrage

| # | Point | Criticité | Conséquence si non résolu |
|---|---|---|---|
| 1 | **Nombre exact de titres prêts** | Élevée | Détermine si l'abonnement peut être ouvert au lancement ou différé (seuil de 30-40 titres, section 3.3) |
| 5 | **Preuve des droits de diffusion et de vente, titre par titre** | **Critique** | Risque R2. Une réponse approximative n'est pas exploitable : il faut, pour chaque titre, l'identité du rédacteur du texte, celle de l'illustrateur, et le contrat qui en découle. Un litige postérieur au lancement peut entraîner la fermeture de la plateforme |
| 6 | **Structure juridique et pays d'immatriculation** | **Critique** | Bloque le choix du prestataire de paiement (section 7.3), donc la mise en production. Aucune vente n'est possible tant que ce point n'est pas tranché |
| 10 | **Budget alloué** (développement et contenu) | Élevée | Sans enveloppe définie, le projet ne peut être engagé au-delà du premier lot |

### 16.3 Points techniques à clarifier

**Qualité des PDF sources.** La chaîne d'ingestion (section 7.4) produit automatiquement toutes les ressources nécessaires à partir d'un PDF seul, mais elle ne peut pas améliorer ce que le fichier source ne contient pas. Deux exigences doivent être vérifiées sur les PDF fournis par le client :

- **Images intérieures en 300 dpi minimum.** Un PDF basse résolution produira des images de lecture floues sur tablette.
- **Couche texte présente.** Le PDF doit être généré numériquement, pas scanné. À défaut, un traitement OCR est nécessaire — non inclus dans le forfait titre.

Un audit de la qualité des PDF existants doit être fait lors du lot 0.

**Mode de production du contenu.** L'origine exacte des textes et des illustrations doit être documentée. Si tout ou partie du contenu a été produit par génération automatique, trois implications sont à anticiper : le statut juridique de l'œuvre (dans plusieurs juridictions, une création purement générée n'est pas protégeable par le droit d'auteur, et ne peut donc être vendue comme exclusivité), la question de l'authenticité culturelle sur un catalogue présenté comme patrimonial, et l'argumentaire commercial lui-même. Ce point doit être clarifié avant la production du contenu marketing.

---

## Annexe — Recommandations d'évolution

*Cette annexe ne fait pas partie du périmètre contractuel. Elle rassemble des propositions d'ajustement à discuter, fondées sur l'analyse du marché.*

### A1. Séquencer le lancement des deux modèles

Le modèle par abonnement n'a de valeur perçue qu'à partir d'un catalogue conséquent — les plateformes établies du secteur en proposent plusieurs dizaines de milliers de titres. La vente à l'unité, elle, fonctionne dès le premier livre publié.

**Proposition :** ouvrir la plateforme avec la vente à l'unité seule, et n'activer l'abonnement (déjà développé) qu'une fois un seuil de titres atteint. Le développement reste identique, seul l'ordre d'activation commerciale change.

### A2. Restreindre le nombre de langues en V1

Chaque langue supplémentaire multiplie le coût de traduction et le travail d'adaptation culturelle — un conte ne se traduit pas mot à mot, il se réécrit. Deux langues bien traitées valent mieux que six approximatives.

**Proposition :** français et anglais en V1, l'architecture permettant d'en ajouter sans redéveloppement.

### A3. Assumer pleinement le positionnement de niche

Face à des acteurs internationaux disposant de catalogues massifs, la seule stratégie viable pour un nouvel entrant est la spécialisation. Le positionnement « contes africains » est un atout réel : c'est un contenu que les grandes plateformes ne couvrent pas ou peu.

**Proposition :** cibler explicitement la diaspora africaine et les familles biculturelles, ainsi que les établissements scolaires en recherche de contenus sur la diversité culturelle. Ces segments sont accessibles sans budget publicitaire massif, via les communautés, les associations et le référencement naturel.

### A4. Considérer une offre éducation

Les écoles et bibliothèques représentent un panier moyen bien supérieur, un taux de résiliation plus faible, et un cycle de vente sans coût publicitaire. C'est un axe de rentabilité souvent plus rapide que le grand public sur ce type de plateforme.

### A5. Envisager le livre audio à terme

La narration orale est consubstantielle au conte africain. Une version audio des contes constituerait une différenciation forte, cohérente avec le fond éditorial, et répondrait à un usage réel (écoute au coucher, en voiture). À envisager en phase 2, le coût de production étant significatif.
