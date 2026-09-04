-- Jeu de démonstration
--
-- Rejoué par `npm run db:reset` et par `npm run db:seed`. Écrit pour être
-- idempotent : chaque insertion gère son conflit.
--
-- Les titres sont ceux du dossier « conte d'afrique ». Le jeu est construit
-- pour couvrir TOUS les cas du moteur de droits (étape 4) : ce n'est pas une
-- vitrine, c'est un plan de test.

-- ---------------------------------------------------------------------------
-- Artefact d'activation de l'horloge simulée (docs/PLAN.md §2.5 a)
--
-- C'EST LE SEUL ENDROIT DU DÉPÔT QUI INSÈRE CETTE LIGNE. Aucune migration ne
-- doit le faire : une base de production n'exécute pas les seeds, la table y
-- reste donc vide et `app_now()` y vaut toujours `now()`, même si le code
-- applicatif tentait de positionner `app.now`.
-- ---------------------------------------------------------------------------

insert into public.dev_clock_activation (id, note)
values (1, 'Développement local. La présence de cette ligne autorise app_now() à honorer le paramètre de session app.now.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Catalogue
--
-- | slug                        | cas couvert                                        |
-- |-----------------------------|----------------------------------------------------|
-- | le-lion-et-la-souris        | abonnement, publié il y a 8 mois → hors fenêtre     |
-- | l-oiseau-de-feu             | abonnement, publié il y a 1 mois → DANS la fenêtre  |
-- | la-tortue-et-le-lapin       | vente unitaire seule, prix dans les deux zones      |
-- | anansi-l-araignee-maligne   | abonnement ET vente unitaire, titre premium         |
-- | petit-baobab                | gratuit, non vendu                                  |
-- | la-riviere-qui-parlait      | gratuit ET vendu, DANS la fenêtre → gratuit prime   |
-- | le-lievre-et-la-tortue      | brouillon → invisible                               |
-- | la-hyene-qui-voulait-changer| archivé → invisible                                 |
-- | kouassi-et-le-tam-tam       | deux versions linguistiques publiées                |
-- | la-girafe-et-l-oiseau-malin | version anglaise en brouillon → invisible           |
-- ---------------------------------------------------------------------------

insert into public.books (
  slug, auteur, illustrateur, age_min, age_max, origine_culturelle, themes,
  inclus_abonnement, disponible_achat, gratuit, nb_pages_extrait, statut, publie_le
) values
  ('le-lion-et-la-souris', 'Tradition orale', 'Atelier Mapoukam', 3, 7,
   'Afrique de l''Ouest', array['animaux', 'entraide', 'sagesse'],
   true, true, false, null, 'publie', public.app_now() - interval '8 months'),

  ('l-oiseau-de-feu', 'Tradition orale', 'Atelier Mapoukam', 5, 10,
   'Cameroun', array['merveilleux', 'courage'],
   true, true, false, null, 'publie', public.app_now() - interval '1 month'),

  ('la-tortue-et-le-lapin', 'Tradition orale', 'Atelier Mapoukam', 3, 8,
   'Afrique centrale', array['animaux', 'persévérance'],
   false, true, false, null, 'publie', public.app_now() - interval '12 months'),

  ('anansi-l-araignee-maligne', 'Tradition akan', 'Atelier Mapoukam', 6, 12,
   'Ghana', array['ruse', 'animaux', 'patrimoine akan'],
   true, true, false, 2, 'publie', public.app_now() - interval '6 months'),

  ('petit-baobab', 'Tradition orale', 'Atelier Mapoukam', 3, 6,
   'Sahel', array['nature', 'patience'],
   true, false, true, null, 'publie', public.app_now() - interval '4 months'),

  ('la-riviere-qui-parlait', 'Tradition orale', 'Atelier Mapoukam', 4, 9,
   'Bassin du Congo', array['nature', 'écoute'],
   true, true, true, null, 'publie', public.app_now() - interval '2 months'),

  ('le-lievre-et-la-tortue', 'Tradition orale', 'Atelier Mapoukam', 3, 7,
   'Afrique de l''Ouest', array['animaux', 'humilité'],
   true, true, false, null, 'brouillon', null),

  ('la-hyene-qui-voulait-changer', 'Tradition orale', 'Atelier Mapoukam', 6, 11,
   'Corne de l''Afrique', array['transformation', 'animaux'],
   false, false, false, null, 'archive', public.app_now() - interval '24 months'),

  ('kouassi-et-le-tam-tam', 'Tradition baoulé', 'Atelier Mapoukam', 5, 10,
   'Côte d''Ivoire', array['musique', 'transmission'],
   true, true, false, null, 'publie', public.app_now() - interval '7 months'),

  ('la-girafe-et-l-oiseau-malin', 'Tradition orale', 'Atelier Mapoukam', 4, 8,
   'Afrique de l''Est', array['animaux', 'amitié'],
   true, true, false, null, 'publie', public.app_now() - interval '5 months')
on conflict (slug) do update set
  auteur = excluded.auteur,
  illustrateur = excluded.illustrateur,
  age_min = excluded.age_min,
  age_max = excluded.age_max,
  origine_culturelle = excluded.origine_culturelle,
  themes = excluded.themes,
  inclus_abonnement = excluded.inclus_abonnement,
  disponible_achat = excluded.disponible_achat,
  gratuit = excluded.gratuit,
  nb_pages_extrait = excluded.nb_pages_extrait,
  statut = excluded.statut,
  publie_le = excluded.publie_le,
  maj_le = public.app_now();

-- ---------------------------------------------------------------------------
-- Versions linguistiques
-- ---------------------------------------------------------------------------

insert into public.book_translations (book_id, langue, titre, resume, nb_pages, statut)
select b.id, t.langue, t.titre, t.resume, t.nb_pages, t.statut::public.translation_status
from public.books b
join (values
  ('le-lion-et-la-souris', 'fr', 'Le lion et la souris',
   'Un lion puissant épargne une souris minuscule. Le jour où il tombe dans un piège, il découvre qui peut le sauver.', 16, 'publie'),

  ('l-oiseau-de-feu', 'fr', 'L''oiseau de feu',
   'Un enfant suit la trace d''un oiseau de flammes jusqu''au cœur de la forêt, et rapporte au village bien plus qu''une plume.', 20, 'publie'),

  ('la-tortue-et-le-lapin', 'fr', 'La tortue et le lapin',
   'La course la plus célèbre de la savane, racontée du point de vue de celle qui n''a jamais douté.', 14, 'publie'),

  ('anansi-l-araignee-maligne', 'fr', 'Anansi l''araignée maligne',
   'Anansi veut posséder toutes les histoires du monde. Le dieu du ciel lui fixe trois épreuves impossibles.', 24, 'publie'),

  ('petit-baobab', 'fr', 'Petit Baobab',
   'Un baobab minuscule s''impatiente de grandir, jusqu''à comprendre ce que mille ans veulent dire.', 12, 'publie'),

  ('la-riviere-qui-parlait', 'fr', 'La rivière qui parlait',
   'Une rivière murmure le nom de ceux qui savent l''écouter. Une fillette est la première à s''arrêter.', 18, 'publie'),

  ('le-lievre-et-la-tortue', 'fr', 'Le lièvre et la tortue',
   'Version en cours de relecture éditoriale.', 15, 'brouillon'),

  ('la-hyene-qui-voulait-changer', 'fr', 'La hyène qui voulait changer',
   'Une hyène lassée de sa réputation entreprend de la défaire.', 18, 'publie'),

  ('kouassi-et-le-tam-tam', 'fr', 'Kouassi et le tam-tam',
   'Kouassi hérite du tam-tam de son grand-père et doit apprendre à en jouer avant la fête du village.', 20, 'publie'),

  -- PAGINATION VOLONTAIREMENT DIFFÉRENTE de la version française (20 pages).
  -- Deux versions linguistiques sont deux PDF distincts, produits par deux
  -- passages séparés de la chaîne d'ingestion : un texte traduit se recompose,
  -- et rien ne garantit le même nombre de pages. C'est le cas que la reprise
  -- de lecture doit gérer — « page 19 » en français n'existe pas ici.
  ('kouassi-et-le-tam-tam', 'en', 'Kouassi and the Talking Drum',
   'Kouassi inherits his grandfather''s drum and must learn to play it before the village festival.', 16, 'publie'),

  ('la-girafe-et-l-oiseau-malin', 'fr', 'La girafe et l''oiseau malin',
   'Une girafe trop grande pour voir ses propres pieds se lie d''amitié avec un oiseau qui voit tout.', 16, 'publie'),

  ('la-girafe-et-l-oiseau-malin', 'en', 'The Giraffe and the Clever Bird',
   'Traduction en cours de relecture — ne doit pas apparaître au catalogue.', 16, 'brouillon')
) as t (slug, langue, titre, resume, nb_pages, statut)
  on t.slug = b.slug
on conflict (book_id, langue) do update set
  titre = excluded.titre,
  resume = excluded.resume,
  nb_pages = excluded.nb_pages,
  statut = excluded.statut,
  maj_le = public.app_now();

-- ---------------------------------------------------------------------------
-- Grille tarifaire (§3.3)
--
-- Montants dans la plus petite unité de la devise : 499 = 4,99 € ;
-- 1500 = 1 500 FCFA (le franc CFA n'a pas de sous-unité).
--
-- `la-tortue-et-le-lapin` n'a VOLONTAIREMENT pas de prix pour la zone
-- afrique : c'est le cas de repli sur la zone internationale (D4 point 8).
-- ---------------------------------------------------------------------------

insert into public.book_prices (book_id, zone, montant, devise)
select b.id, p.zone::public.price_zone, p.montant, p.devise
from public.books b
join (values
  ('le-lion-et-la-souris',        'international', 499,  'EUR'),
  ('le-lion-et-la-souris',        'afrique',       1500, 'XAF'),
  ('l-oiseau-de-feu',             'international', 499,  'EUR'),
  ('l-oiseau-de-feu',             'afrique',       1500, 'XAF'),
  -- Prix dans les DEUX zones actives : depuis la migration 0024, un titre
  -- publié et vendu à l'unité ne peut plus en manquer une. Ce jeu de données
  -- doit rester conforme à la règle qu'il sert à éprouver.
  ('la-tortue-et-le-lapin',       'international', 499,  'EUR'),
  ('la-tortue-et-le-lapin',       'afrique',       1500, 'XAF'),
  -- titre premium (§3.3) : long et fortement illustré
  ('anansi-l-araignee-maligne',   'international', 699,  'EUR'),
  ('anansi-l-araignee-maligne',   'afrique',       1500, 'XAF'),
  ('la-riviere-qui-parlait',      'international', 499,  'EUR'),
  ('la-riviere-qui-parlait',      'afrique',       1500, 'XAF'),
  ('kouassi-et-le-tam-tam',       'international', 499,  'EUR'),
  ('kouassi-et-le-tam-tam',       'afrique',       1500, 'XAF'),
  ('la-girafe-et-l-oiseau-malin', 'international', 499,  'EUR'),
  ('la-girafe-et-l-oiseau-malin', 'afrique',       1500, 'XAF'),
  ('le-lievre-et-la-tortue',      'international', 499,  'EUR')
) as p (slug, zone, montant, devise)
  on p.slug = b.slug
on conflict (book_id, zone) do update set
  montant = excluded.montant,
  devise = excluded.devise,
  maj_le = public.app_now();

-- ---------------------------------------------------------------------------
-- Codes promotionnels de démonstration (§3.4)
-- ---------------------------------------------------------------------------

-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ UN CODE À MONTANT FIXE PORTE SA ZONE, UN CODE EN POURCENTAGE N'EN A PAS.  │
-- │                                                                            │
-- │ « 2 € de remise » n'a aucun sens sur un panier en francs CFA : appliqué     │
-- │ tel quel, il retirerait deux francs. Un pourcentage, lui, vaut partout.     │
-- │ Deux contraintes symétriques l'imposent (migration 0036) ; le jeu de        │
-- │ données porte donc un exemplaire de chaque forme.                          │
-- └────────────────────────────────────────────────────────────────────────────┘

insert into public.promo_codes (code, type, valeur, devise, zone, expire_le, actif, usage_max)
values
  ('BIENVENUE', 'pourcentage', 20, null, null, public.app_now() + interval '6 months', true, 100),
  ('CONTE2EUR', 'montant', 200, 'EUR', 'international',
                public.app_now() + interval '3 months', true, 50),
  -- Le pendant africain du précédent : même intention commerciale, libellée
  -- dans la devise et la grille où elle a un sens.
  -- 500 et non 50000 : le franc CFA n'a PAS de sous-unité (migration 0005).
  -- Recopier la logique de l'euro donnerait ici cinq cents francs de remise
  -- multipliés par cent.
  ('CONTE500F', 'montant', 500, 'XOF', 'afrique',
                public.app_now() + interval '3 months', true, 50),
  ('EXPIRE',    'pourcentage', 50, null, null, public.app_now() - interval '1 day', true, null)
on conflict (code) do update set
  type = excluded.type,
  valeur = excluded.valeur,
  devise = excluded.devise,
  zone = excluded.zone,
  expire_le = excluded.expire_le,
  actif = excluded.actif,
  usage_max = excluded.usage_max;

-- ---------------------------------------------------------------------------
-- Pages de lecture
--
-- La chaîne d'ingestion (étape 7) produira les vraies. Celles-ci existent pour
-- que l'extrait, le lecteur et le service de fichiers soient éprouvables dès
-- maintenant : sans elles, chaque test de lecture buterait sur une absence de
-- contenu plutôt que sur la règle qu'il vise.
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ TOUTE VERSION PUBLIÉE A EXACTEMENT `nb_pages` PAGES. SANS EXCEPTION.      │
-- │                                                                            │
-- │ Une version antérieure posait six pages pour trois titres, et rien pour    │
-- │ les autres — alors que `nb_pages` annonçait 12, 16 ou 18. Le jeu de        │
-- │ données se contredisait donc lui-même, et ce n'était pas sans conséquence :│
-- │ deux modules bornent la lecture, l'un sur `nb_pages`, l'autre sur le       │
-- │ nombre de lignes réellement présentes ici. Tant que les deux divergeaient  │
-- │ dans le jeu de démonstration, aucun test ne pouvait voir qu'ils            │
-- │ divergeaient aussi dans le code.                                           │
-- │                                                                            │
-- │ Une fixture plus faible que ce qu'elle représente ne fait pas échouer les  │
-- │ tests : elle les fait passer sans les exercer. C'est le pire des deux.     │
-- │                                                                            │
-- │ En production, les deux valeurs sont écrites par le même passage de la     │
-- │ chaîne d'ingestion et ne peuvent pas diverger. Le jeu de données doit      │
-- │ respecter cette propriété, sans quoi il ne représente rien de réel.        │
-- │                                                                            │
-- │ Une version en BROUILLON n'a en revanche aucune page : c'est l'état d'un   │
-- │ titre dont le rendu n'a pas encore tourné, et il mérite d'être représenté. │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Au passage, `kouassi-et-le-tam-tam` fait 20 pages en français et 16 en
-- anglais. Ce n'est pas une coquette : deux versions linguistiques sont deux
-- PDF distincts, produits par deux passages séparés de la chaîne d'ingestion,
-- et un texte traduit se recompose. Rien ne garantit le même nombre de pages.
--
-- C'est la matière du cas que la reprise de lecture doit gérer : un lecteur
-- arrivé page 19 en français, qui bascule en anglais, ne peut pas y être
-- renvoyé à une page qui n'existe pas.
-- ---------------------------------------------------------------------------

insert into public.book_pages (translation_id, numero, chemin_haute, chemin_allegee, largeur, hauteur, texte)
select t.id, p.numero,
       'book-pages/' || b.slug || '/' || t.langue || '/haute/' || lpad(p.numero::text, 3, '0') || '.webp',
       'book-pages/' || b.slug || '/' || t.langue || '/allegee/' || lpad(p.numero::text, 3, '0') || '.webp',
       1600, 2000,
       'Page ' || p.numero::text || ' de « ' || t.titre || ' ».'
from public.books b
join public.book_translations t on t.book_id = b.id and t.statut = 'publie'
-- `t.nb_pages`, jamais une constante : c'est la seule façon que le jeu de
-- données reste cohérent avec lui-même quand une version change de longueur.
cross join lateral generate_series(1, t.nb_pages) as p(numero)
on conflict (translation_id, numero) do nothing;

-- ---------------------------------------------------------------------------
-- Fichiers téléchargeables et couvertures
--
-- Chemins de stockage seulement : les objets eux-mêmes seront produits par la
-- chaîne d'ingestion (étape 7). Ils existent ici pour que le service de
-- fichiers protégé soit éprouvable — un test doit buter sur un refus de droit,
-- jamais sur un chemin manquant.
-- ---------------------------------------------------------------------------

update public.book_translations t
set fichier_telechargement = 'book-downloads/' || b.slug || '/' || t.langue || '/' || b.slug || '.pdf',
    fichier_lecture = 'book-pages/' || b.slug || '/' || t.langue,
    maj_le = public.app_now()
from public.books b
where b.id = t.book_id
  and t.statut = 'publie'
  and b.slug in ('petit-baobab', 'le-lion-et-la-souris', 'la-riviere-qui-parlait');

-- Jeton aléatoire, jamais le slug : la couverture d'un titre en brouillon ne
-- doit pas être accessible à qui devine l'URL, sinon les prochaines parutions
-- fuiteraient avant leur annonce.
--
-- LE JETON ET L'URL SONT POSÉS ENSEMBLE, depuis la même valeur. Le jeu de
-- données ne renseignait que `couverture_url`, la colonne dépréciée, en
-- laissant `couverture_jeton` vide — or c'est ce dernier que lit
-- `urlsCouverture`, seule autorité sur la construction des URL publiques.
-- La fixture annonçait donc des couvertures qu'aucun écran ne pouvait servir,
-- et un test du catalogue passait en n'observant rien.
update public.books b
set couverture_jeton = j.jeton,
    couverture_url = 'covers/' || j.jeton || '/fiche.webp',
    maj_le = public.app_now()
from (
  select id, replace(gen_random_uuid()::text, '-', '') as jeton
  from public.books
  where statut = 'publie'
) j
where b.id = j.id;

-- ---------------------------------------------------------------------------
-- Region d'affichage, derivee de l'origine editoriale
--
-- Le mappage vit dans `region_depuis_origine` (migration 0046), et NULLE PART
-- ailleurs. Le recopier ici en ferait une seconde implementation — la classe
-- de defaut que `books.region` corrige precisement.
--
-- La publication exige desormais une region : un titre du jeu de demonstration
-- qui n'en recevrait pas serait refuse par `manques_pour_publication`, et
-- l'echec se verrait immediatement.
-- ---------------------------------------------------------------------------

update public.books
   set region = public.region_depuis_origine(origine_culturelle)
 where region is null;

-- ---------------------------------------------------------------------------
-- Offres d'adhésion à l'association (§3.6)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI ICI, ET PAS DANS LA MIGRATION 0068.                             │
-- │                                                                            │
-- │ La migration sème les deux offres de LECTURE, dont la grille figurait au    │
-- │ cahier des charges §3.3 : ce sont des données arrêtées. Le prix de          │
-- │ l'adhésion, lui, n'est pas encore fixé — c'est une décision commerciale du  │
-- │ propriétaire, et l'écran d'administration existe précisément pour qu'il la  │
-- │ prenne sans migration.                                                     │
-- │                                                                            │
-- │ Les montants ci-dessous sont donc FICTIFS, comme ceux des maquettes. Ils    │
-- │ existent pour que le tunnel associatif soit éprouvable de bout en bout —    │
-- │ une base de production ne rejoue pas les seeds et n'en verra jamais rien.   │
-- └────────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

insert into public.subscription_plans
  (code, domaine, periode, libelle_fr, libelle_en, descriptif_fr, descriptif_en, actif, ordre)
values
  ('association-mensuel', 'association', 'mensuel',
   'Adhésion mensuelle', 'Monthly membership',
   'Accès aux contenus réservés de l''association. Sans engagement.',
   'Access to the association''s members-only contents. Cancel anytime.',
   true, 10),
  ('association-annuel', 'association', 'annuel',
   'Adhésion annuelle', 'Yearly membership',
   'Accès aux contenus réservés de l''association, deux mois offerts.',
   'Access to the association''s members-only contents, two months free.',
   true, 20)
on conflict (code) do update set
  libelle_fr = excluded.libelle_fr,
  libelle_en = excluded.libelle_en,
  descriptif_fr = excluded.descriptif_fr,
  descriptif_en = excluded.descriptif_en,
  actif = excluded.actif,
  ordre = excluded.ordre;

-- Montants dans la plus petite unité de leur devise : 400 = 4,00 € ;
-- 1500 = 1 500 FCFA (le franc CFA n'a pas de sous-unité).
insert into public.plan_prices (plan_id, zone, montant, devise)
select p.id, z.zone, z.montant, z.devise
from public.subscription_plans p
join (values
  ('association-mensuel', 'international'::public.price_zone, 400::bigint,   'EUR'),
  ('association-mensuel', 'afrique'::public.price_zone,       1500::bigint,  'XAF'),
  ('association-annuel',  'international'::public.price_zone, 4000::bigint,  'EUR'),
  ('association-annuel',  'afrique'::public.price_zone,       15000::bigint, 'XAF')
) as z(code, zone, montant, devise) on z.code = p.code
on conflict (plan_id, zone) do update set
  montant = excluded.montant,
  devise = excluded.devise;

-- ---------------------------------------------------------------------------
-- Contenus de l'espace associatif (§3.6, §4.1 F4 bis)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ HUIT TEXTES, DE DEUX PROVENANCES — ET LA DIFFÉRENCE COMPTE.               │
-- │                                                                            │
-- │ Les TROIS PREMIERS ont été écrits par l'Association DAVE et fournis le      │
-- │ 4 septembre 2026 : ils disent ce qu'elle fait, pourquoi, et comment y       │
-- │ prendre part. Ils ne se réécrivent pas — ils engagent une structure réelle  │
-- │ auprès de familles réelles. Leurs illustrations sont les photos fournies    │
-- │ avec eux, versionnées dans `public/images/association/`.                    │
-- │                                                                            │
-- │ LES CINQ AUTRES SONT LES ARTICLES DE L'ANCIEN BLOG, REPRIS EN ACCÈS LIBRE. │
-- │                                                                            │
-- │ Décision du propriétaire, 3 septembre 2026 : le blog devient l'espace de    │
-- │ l'association, ses articles en forment la part ouverte, et les contenus     │
-- │ nouveaux sont réservés aux adhérents. Ils gardent donc leurs slugs — les    │
-- │ redirections 308 de `next.config.ts` renvoient `/blog/<slug>` vers          │
-- │ `/association/<slug>`, et un lien partagé il y a un mois doit encore        │
-- │ arriver sur le texte qu'il annonçait.                                       │
-- │                                                                            │
-- │ Aucun d'eux n'est `abonnes` : un contenu déjà lu librement qui se           │
-- │ refermerait derrière un paiement serait un reniement, pas une évolution.    │
-- │ Le jeu de test des contenus RÉSERVÉS est fabriqué par les tests eux-mêmes,  │
-- │ qui le défont ensuite.                                                      │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Les dates sont écrites en absolu et non relativement à `app_now()` : ce sont
-- des dates ÉDITORIALES, celles auxquelles ces textes ont paru. Les faire
-- glisser avec l'horloge simulée les rendrait futures dès qu'un test avance le
-- temps de six mois.
-- ---------------------------------------------------------------------------

-- La vedette est libérée AVANT l'insertion, dans son propre ordre.
--
-- `association_contents_une_seule_vedette` est un index unique partiel : au plus
-- une ligne peut porter `vedette` parmi les publiées. Un index unique ordinaire
-- se vérifie LIGNE PAR LIGNE, et non en fin d'instruction — poser la nouvelle
-- vedette dans le même `insert … on conflict` que le retrait de l'ancienne
-- échouerait donc selon l'ordre où PostgreSQL traite les lignes, c'est-à-dire
-- par intermittence. Le retrait d'abord, la pose ensuite : deux instructions.
update public.association_contents set vedette = false where vedette;

insert into public.association_contents
  (slug, categorie, acces, statut, publie_le, minutes, vedette, ordre, image_url)
values
  -- Les trois textes de l'Association DAVE, et leurs photos.
  ('sur-le-terrain-avec-l-association-dave', 'actions', 'libre', 'publie',
   timestamptz '2026-09-01 09:00:00+00', 3, true, 0,
   '/images/association/kit-pedagogique.jpg'),
  ('education-pour-tous-responsabilite-collective', 'besoins-specifiques', 'libre', 'publie',
   timestamptz '2026-08-25 09:00:00+00', 3, false, 0,
   '/images/association/classes-inclusives.jpg'),
  ('trois-facons-de-soutenir-l-association-dave', 'vie-associative', 'libre', 'publie',
   timestamptz '2026-08-18 09:00:00+00', 3, false, 0,
   '/images/association/formation-des-parents.jpg'),

  -- Les cinq articles repris du blog. Leurs slugs sont ceux des redirections.
  ('lire-a-voix-haute', 'accompagnement', 'libre', 'publie',
   timestamptz '2026-07-28 09:00:00+00', 6, false, 0, null),
  ('choisir-selon-l-age', 'pedagogie', 'libre', 'publie',
   timestamptz '2026-07-21 09:00:00+00', 5, false, 0, null),
  ('anansi-et-les-histoires-du-monde', 'culture', 'libre', 'publie',
   timestamptz '2026-07-14 09:00:00+00', 7, false, 0, null),
  ('contes-en-classe', 'pedagogie', 'libre', 'publie',
   timestamptz '2026-07-07 09:00:00+00', 8, false, 0, null),
  ('accompagner-enfants-besoins-specifiques', 'besoins-specifiques', 'libre', 'publie',
   timestamptz '2026-06-30 09:00:00+00', 9, false, 0, null)
on conflict (slug) do update set
  categorie = excluded.categorie,
  acces = excluded.acces,
  statut = excluded.statut,
  publie_le = excluded.publie_le,
  minutes = excluded.minutes,
  vedette = excluded.vedette,
  ordre = excluded.ordre,
  image_url = excluded.image_url,
  maj_le = public.app_now();

-- ---------------------------------------------------------------------------
-- Les textes, en français
--
-- Une seule langue, et c'est représentatif : la version française fait foi, et
-- l'anglaise se replie sur elle tant qu'elle n'existe pas. Un jeu de données où
-- tout serait traduit n'éprouverait jamais ce repli.
-- ---------------------------------------------------------------------------

insert into public.association_content_translations (content_id, langue, titre, chapeau, corps)
select c.id, 'fr', v.titre, v.chapeau, v.corps
from public.association_contents c
join (values
  ('sur-le-terrain-avec-l-association-dave',
   'Sur le terrain avec l’Association DAVE : quand un simple kit pédagogique change un regard',
   'L’éducation n’est pas qu’une question de grands discours ou de manuels théoriques. C’est avant tout une rencontre humaine, un sourire et un déclic.',
   $json$[
     {
       "titre": "La puissance d’un outil adapté",
       "paragraphes": [
         "Sur le terrain, avec les équipes de l’Association DAVE, nous mesurons chaque jour la puissance d’un outil adapté. Qu’il s’agisse d’un support visuel, d’un jeu de cartes inclusif ou d’un livret d’activités, voir le visage d’un enfant s’illuminer lorsqu’il comprend, réussit et prend confiance en lui est notre plus belle récompense."
       ]
     },
     {
       "titre": "Pourquoi chaque action compte",
       "points": [
         "Briser l’isolement : offrir à un enfant en situation de handicap ou de difficulté d’apprentissage les moyens de participer comme les autres.",
         "Soutenir les familles : apporter aux parents des solutions concrètes et rassurantes pour accompagner le quotidien à la maison.",
         "Semer l’espoir : prouver que chaque communauté, même rurale ou défavorisée, mérite un accès égal à l’excellence éducative."
       ]
     },
     {
       "titre": "Ce qu’il y a derrière chaque kit",
       "paragraphes": [
         "Derrière chaque kit distribué, il y a la conviction profonde qu’aucun enfant ne doit être laissé sur le bord de la route.",
         "Merci à tous ceux qui, à nos côtés, rendent cette magie possible."
       ]
     }
   ]$json$::jsonb),

  ('education-pour-tous-responsabilite-collective',
   'Pourquoi l’éducation pour tous n’est pas un rêve lointain, mais une responsabilité collective',
   'Parler d’« éducation pour tous », c’est bien plus qu’un slogan : c’est un combat de chaque instant.',
   $json$[
     {
       "titre": "Des barrières invisibles, mais bien réelles",
       "paragraphes": [
         "Trop souvent, les enfants ayant des besoins spécifiques ou vivant dans des zones reculées se heurtent à des barrières invisibles mais bien réelles : manque de supports adaptés, manque de formation, manque de moyens.",
         "À l’Association DAVE, nous refusons la fatalité. Nous croyons fermement que l’inclusion et l’accessibilité pédagogique ne sont pas des options, mais les piliers fondamentaux d’une société juste et prospère."
       ]
     },
     {
       "titre": "Nos axes de combat pour bâtir l’avenir",
       "points": [
         "L’inclusion sans compromis : concevoir des ressources qui s’adaptent à l’enfant, et non l’inverse.",
         "Le partage des savoirs : former, sensibiliser et outiller les enseignants et les parents pour qu’ils deviennent des acteurs du changement.",
         "La valorisation du patrimoine : ancrer l’apprentissage dans nos réalités culturelles pour donner du sens à ce que l’enfant apprend."
       ]
     },
     {
       "titre": "Une brique après l’autre",
       "paragraphes": [
         "Bâtir l’éducation de demain, c’est poser une brique après l’autre, ensemble. Et ce chantier commence dès aujourd’hui, grâce à votre engagement."
       ]
     }
   ]$json$::jsonb),

  ('trois-facons-de-soutenir-l-association-dave',
   'Bâtir l’éducation de demain : 3 façons simples de soutenir les actions de l’Association DAVE dès aujourd’hui',
   'On nous demande souvent : « Comment puis-je vous aider concrètement ? » La bonne nouvelle, c’est que chaque geste, même le plus simple, a un impact immense sur le terrain.',
   $json$[
     {
       "titre": "Des projets ambitieux, et des forces vives",
       "paragraphes": [
         "L’Association DAVE porte des projets ambitieux pour rendre l’éducation accessible à tous les enfants. Et pour y arriver, nous avons besoin de forces vives à nos côtés."
       ]
     },
     {
       "titre": "Trois façons d’agir dès maintenant",
       "points": [
         "Partager et faire connaître : parler de nos actions autour de vous, partager nos publications sur les réseaux sociaux ou en parler à un proche, c’est déjà offrir de la visibilité à notre cause.",
         "Participer à nos événements et ateliers : rejoindre nos séminaires, nos formations ou nos ateliers, en présentiel ou en ligne, pour enrichir vos pratiques et soutenir nos projets.",
         "Soutenir nos campagnes de terrain : contribuer à la production et à la distribution de nos kits pédagogiques pour équiper les enfants dans les zones prioritaires."
       ]
     },
     {
       "titre": "Rejoindre le mouvement",
       "paragraphes": [
         "« Seul on va plus vite, ensemble on va plus loin. » Rejoignez le mouvement et devenez, vous aussi, un acteur de la révolution éducative !"
       ]
     }
   ]$json$::jsonb),

  ('lire-a-voix-haute',
   'Lire à voix haute, même quand on n’est pas conteur',
   'On croit qu’il faut savoir raconter. Il faut surtout accepter de lire mal, et de recommencer le lendemain.',
   $json$[
     {
       "titre": "Le trac des parents",
       "paragraphes": [
         "Beaucoup de parents renoncent à la lecture du soir parce qu’ils se trouvent mauvais. Ils lisent trop vite, butent sur les noms, ne savent pas faire les voix. Ils comparent leur lecture à celle d’un comédien, et concluent qu’ils desservent l’histoire.",
         "Un enfant n’entend rien de tout cela. Ce qu’il entend, c’est une voix qu’il connaît, à une heure qu’il attend, dans un livre qu’il a choisi. La qualité de la diction arrive très loin derrière ces trois choses."
       ]
     },
     {
       "titre": "Trois appuis qui changent tout",
       "points": [
         "Ralentir davantage que ce qui paraît naturel — un enfant fabrique les images pendant les silences, pas pendant les phrases.",
         "S’arrêter sur une illustration et demander ce qui va arriver, plutôt que de vérifier ce qui a été compris.",
         "Accepter de relire le même conte vingt soirs de suite : la répétition n’est pas de l’ennui, c’est la façon dont l’histoire s’installe."
       ]
     },
     {
       "titre": "Et quand on n’a pas le temps",
       "paragraphes": [
         "Une page suffit. Un conte peut se lire en cinq soirs, et l’attente entre deux soirs fait partie du plaisir — c’est même ainsi que ces histoires circulaient à l’origine, une veillée après l’autre."
       ]
     }
   ]$json$::jsonb),

  ('choisir-selon-l-age',
   'Choisir un conte selon l’âge, sans se tromper',
   'Deux âges figurent sur chaque conte, et ils ne disent pas la même chose : l’un pour écouter, l’autre pour lire seul.',
   $json$[
     {
       "titre": "Écouter et lire ne s’acquièrent pas ensemble",
       "paragraphes": [
         "Un enfant comprend, à l’oreille, des histoires bien plus complexes que celles qu’il peut déchiffrer. L’écart est de deux à trois ans, et il est normal : décoder des lettres occupe toute l’attention, il n’en reste plus pour l’intrigue.",
         "C’est pourquoi chaque conte porte deux mentions — « à écouter dès 5 ans », « à lire seul dès 7 ans ». Prendre la seconde pour la première, c’est priver un enfant de trois ans d’histoires qu’il aurait adorées."
       ]
     },
     {
       "titre": "Ce qui compte plus que l’âge",
       "points": [
         "La longueur : un conte de quarante pages en une fois décourage, le même en quatre soirs enchante.",
         "La densité des illustrations : elles sont des points de repos, pas de la décoration.",
         "Le sujet : la ruse, l’amitié et la peur ne se rencontrent pas au même moment selon les enfants."
       ]
     }
   ]$json$::jsonb),

  ('anansi-et-les-histoires-du-monde',
   'Anansi, l’araignée qui possédait toutes les histoires',
   'Un même personnage, trois continents : comment les contes akan ont voyagé jusqu’aux Caraïbes.',
   $json$[
     {
       "titre": "Les anansesem",
       "paragraphes": [
         "Chez les Akan, au Ghana et dans l’est de la Côte d’Ivoire, les contes portent un nom qui dit déjà tout : les anansesem, « les histoires d’Anansi ». Ils se racontent le soir, après le travail, quand les enfants ont fini de manger.",
         "Anansi n’est pas un héros fort. Elle est petite, souvent gourmande, parfois prise à son propre piège. Les enfants apprennent avec elle que l’intelligence vaut mieux que la force — et qu’elle a ses limites."
       ]
     },
     {
       "titre": "Un voyage qu’on n’a pas choisi",
       "paragraphes": [
         "Déportés aux Caraïbes, les Akan ont emmené leurs histoires : c’était ce qu’on ne pouvait pas leur prendre. Anansi y est devenue Anancy en Jamaïque, Ti Malice à Haïti.",
         "Raconter Anansi à un enfant aujourd’hui, ce n’est donc pas seulement lui raconter une ruse d’araignée. C’est lui montrer qu’une histoire peut survivre à tout, et continuer de faire rire trois siècles plus tard."
       ]
     }
   ]$json$::jsonb),

  ('contes-en-classe',
   'Utiliser un conte africain en classe : ce qui marche',
   'Retours d’enseignants de maternelle et de cycle 2, et les écueils qu’ils signalent tous.',
   $json$[
     {
       "titre": "Commencer par l’histoire, jamais par le pays",
       "paragraphes": [
         "L’erreur la plus fréquente est d’ouvrir sur une carte. L’enfant reçoit alors le conte comme une leçon de géographie, et l’écoute comme telle. Les enseignants qui lisent d’abord l’histoire, et ne situent qu’après, décrivent une attention tout autre."
       ]
     },
     {
       "titre": "Ce que les enfants retiennent",
       "points": [
         "Les personnages avant les lieux — Anansi bien avant le Ghana.",
         "Les répétitions et les formules, qu’ils reprennent en chœur dès la deuxième lecture.",
         "Les motifs des illustrations, qu’ils reconnaissent d’un livre à l’autre."
       ]
     },
     {
       "titre": "Prolonger sans alourdir",
       "paragraphes": [
         "Une question ouverte suffit : « Anansi a trompé le python pour l’attraper. Est-ce que c’était juste ? » Il n’y a pas de bonne réponse, et c’est précisément ce qui fait parler une classe entière."
       ]
     }
   ]$json$::jsonb),

  ('accompagner-enfants-besoins-specifiques',
   'Accompagner un enfant à besoins spécifiques dans la lecture',
   'Troubles de l’attention, difficultés de déchiffrage : des aménagements simples, et ce qu’ils changent.',
   $json$[
     {
       "titre": "Ce qui bloque, souvent",
       "paragraphes": [
         "Un enfant qui refuse de lire ne refuse presque jamais l’histoire. Il refuse l’effort de déchiffrage, la page trop dense, la honte de buter devant quelqu’un. Distinguer les deux change entièrement la réponse."
       ]
     },
     {
       "titre": "Des aménagements qui coûtent peu",
       "points": [
         "Lire à deux voix, en alternant les paragraphes : l’enfant garde le fil sans porter tout l’effort.",
         "Agrandir le texte et augmenter l’interligne — sur un fichier, c’est immédiat.",
         "Autoriser l’écoute seule certains soirs, sans en faire un échec.",
         "Choisir des contes courts, à illustrations nombreuses, quitte à revenir plus tard aux longs."
       ]
     },
     {
       "titre": "Se faire aider",
       "paragraphes": [
         "Les associations de parents et les professionnels de l’enfance connaissent des dispositifs que les familles découvrent souvent trop tard. Écrire, poser la question, demander qui contacter : c’est le pas qui débloque le reste."
       ]
     }
   ]$json$::jsonb)
) as v(slug, titre, chapeau, corps) on v.slug = c.slug
on conflict (content_id, langue) do update set
  titre = excluded.titre,
  chapeau = excluded.chapeau,
  corps = excluded.corps,
  maj_le = public.app_now();
