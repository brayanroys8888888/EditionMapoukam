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
