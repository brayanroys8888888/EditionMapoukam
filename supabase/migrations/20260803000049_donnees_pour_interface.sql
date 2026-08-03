-- ---------------------------------------------------------------------------
-- Ce dont l'interface a besoin, calcule EN BASE
--
-- Trois manques recenses par docs/API-CONTRAT.md, tous de la meme famille :
-- l'interface devrait sinon RECALCULER une regle metier, ou DERIVER un chemin
-- de stockage depuis une convention de nommage. Les deux sont interdits.
--
--   1. `abonnement_a_partir_du` — la date d'entree dans l'abonnement (M6)
--   2. `books.couverture_jeton`  — l'identite des trois tailles (M7)
--   3. `abonnement_ouvert`       — l'interrupteur commercial (S5)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La date d'entree dans l'abonnement
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI CETTE DATE NE PEUT PAS ETRE CALCULEE PAR L'INTERFACE.           |
-- |                                                                          |
-- | Elle depend de `fenetre_nouveaute_jours`, que `PATCH /api/admin/settings` |
-- | deplace A LA SECONDE et RETROACTIVEMENT. Recopier la regle des trois     |
-- | mois dans le navigateur, c'est garantir qu'un jour le catalogue annonce  |
-- | une date que le moteur de droits contredit.                              |
-- +--------------------------------------------------------------------------+
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI UNE FONCTION PAR LOT PLUTOT QU'UNE COLONNE DE `catalog_list`.   |
-- |                                                                          |
-- | Ajouter la colonne obligerait a redeclarer `catalog_list`, fonction de    |
-- | deux cents lignes qui porte la recherche, les filtres, le tri et la       |
-- | pagination. Le cout de la redeclaration serait sans rapport avec l'ajout. |
-- |                                                                          |
-- | Le lot suit exactement le patron de `access_for_books`, deja appele UNE   |
-- | fois par page de catalogue : meme forme, meme nombre d'aller-retours.     |
-- +--------------------------------------------------------------------------+
--
-- La regle elle-meme n'est PAS reecrite ici : `fenetre_de_vente_ecoulee` reste
-- l'autorite unique, et cette fonction ne fait qu'en exposer la borne.
-- ---------------------------------------------------------------------------

create function public.abonnement_a_partir_du(
  p_books uuid[],
  p_at timestamptz default public.app_now()
)
  returns table (book_id uuid, disponible_le timestamptz)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    b.id,
    case
      -- Un titre hors abonnement n'y entrera jamais : la date n'a pas de sens.
      when not b.inclus_abonnement then null
      -- Jamais publie : sa fenetre n'a pas commence.
      when b.publie_le is null then null
      -- Fenetre deja ecoulee : il EST dans l'abonnement, il n'y « entrera » pas.
      when public.fenetre_de_vente_ecoulee(b.publie_le, p.fenetre_nouveaute_jours, p_at) then null
      else b.publie_le + make_interval(days => p.fenetre_nouveaute_jours)
    end
  from public.books b
  cross join public.business_settings p
  where b.id = any(p_books) and p.id = 1;
$fn$;

comment on function public.abonnement_a_partir_du(uuid[], timestamptz) is
  'Date d''entree dans l''abonnement, ou null si le titre y est deja, n''y entrera jamais, ou n''est pas publie. Appelle `fenetre_de_vente_ecoulee`, jamais une copie de la regle.';

revoke all on function public.abonnement_a_partir_du(uuid[], timestamptz) from public, anon;
grant execute on function public.abonnement_a_partir_du(uuid[], timestamptz) to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- 2. L'identite des couvertures, plutot qu'un chemin derive
--
-- +--------------------------------------------------------------------------+
-- | LA BASE PORTE L'IDENTITE, LE CODE PORTE LA CONVENTION.                   |
-- |                                                                          |
-- | `couverture_url` ne stockait qu'UNE des trois tailles produites —         |
-- | `covers/<jeton>/fiche.webp`. La grille du catalogue aurait donc charge du |
-- | 800 px pour l'afficher en 320, ce que §5.1 qualifie de critique pour ce   |
-- | public.                                                                   |
-- |                                                                          |
-- | Retrouver les deux autres en remplacant « fiche » par « vignette » dans   |
-- | la chaine serait une regle implicite de plus, hors de la base et hors du  |
-- | module qui l'a ecrite. La base stocke donc le JETON — l'identite du jeu   |
-- | de couvertures — et `src/lib/storage/covers.ts`, seul module autorise a   |
-- | ecrire dans ce bucket, reste seul a connaitre la convention.              |
-- +--------------------------------------------------------------------------+
-- ---------------------------------------------------------------------------

alter table public.books add column couverture_jeton text
  check (couverture_jeton is null or couverture_jeton ~ '^[0-9a-f]{32}$');

comment on column public.books.couverture_jeton is
  'Identite du jeu de couvertures (trois tailles). La convention de chemin vit dans src/lib/storage/covers.ts, jamais dans une chaine derivee par un appelant.';

-- Reprise de l'existant : le jeton est le segment central du chemin deja
-- stocke. Extraction faite ICI, une fois, plutot qu'a chaque lecture.
update public.books
   set couverture_jeton = substring(couverture_url from '^covers/([0-9a-f]{32})/')
 where couverture_url is not null
   and couverture_jeton is null;

-- ---------------------------------------------------------------------------
-- 3. L'interrupteur commercial de l'abonnement
--
-- +--------------------------------------------------------------------------+
-- | LE SEUIL DE 30 A 40 TITRES EST UNE DECISION, PAS UNE REGLE.              |
-- |                                                                          |
-- | §3.3 recommande de n'ouvrir l'abonnement qu'a partir de 30 a 40 titres :  |
-- | « un abonnement a 7,99 EUR adosse a un catalogue de quelques titres ne    |
-- | soutiendra pas la comparaison et generera surtout des resiliations ».     |
-- |                                                                          |
-- | Le code ne connait pas ce seuil et n'a pas a le connaitre. Il connait     |
-- | seulement l'INTERRUPTEUR, et rappelle le compte au moment du basculement  |
-- | — l'ecran le montre sans l'imposer. Un seuil code en dur transformerait   |
-- | une recommandation commerciale en refus technique.                        |
-- +--------------------------------------------------------------------------+
-- ---------------------------------------------------------------------------

alter table public.business_settings
  add column abonnement_ouvert boolean not null default false;

comment on column public.business_settings.abonnement_ouvert is
  'L''abonnement est-il commercialement ouvert ? Faux par defaut : §3.3 recommande d''attendre 30 a 40 titres publies. Levier commercial, trace au journal d''audit comme les autres.';

-- Titres publies au moment ou l'on consulte — ce que l'ecran d'administration
-- doit afficher a cote de l'interrupteur.
create function public.titres_publies()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select count(*)::integer from public.books where statut = 'publie';
$fn$;

comment on function public.titres_publies() is
  'Nombre de titres publies. Affiche a cote de `abonnement_ouvert` pour que la decision se prenne en connaissance du seuil de §3.3.';

revoke all on function public.titres_publies() from public, anon, authenticated;
grant execute on function public.titres_publies() to service_role;
