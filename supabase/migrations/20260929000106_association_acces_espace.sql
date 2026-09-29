-- ---------------------------------------------------------------------------
-- LA RÈGLE D'ENTRÉE DE L'ESPACE ADHÉRENT — A1 du document du 28 septembre.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TROIS ISSUES, LÀ OÙ `abonnement_ouvre_droit` N'EN CONNAÎT QUE DEUX.     │
-- │                                                                          │
-- │ Cette fonction-là répond « oui » ou « non ». L'espace, lui, a besoin de  │
-- │ distinguer trois cas : entrer, entrer AVEC UN AVERTISSEMENT, et être     │
-- │ renvoyé vers les offres. Un impayé de trois jours lit encore ; il doit   │
-- │ seulement savoir que son paiement n'a pas abouti.                        │
-- │                                                                          │
-- │ Ce n'est donc pas une seconde implémentation du droit : c'est une        │
-- │ LECTURE de `statut_effectif`, qui reste seul à décider de l'état réel.   │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LES SEPT JOURS NE SONT PAS ÉCRITS ICI.                                  │
-- │                                                                          │
-- │ Le document dit « moins de 7 jours après l'échéance ». Le dépôt a déjà   │
-- │ ce nombre : `business_settings.periode_grace_jours`, qui vaut 7, et que  │
-- │ `fin_grace_impaye` lit. Le recopier ferait DEUX tolérances — et le jour  │
-- │ où l'éditeur changerait le réglage au back-office, l'espace continuerait │
-- │ d'appliquer l'ancienne sans que rien ne le dise.                         │
-- │                                                                          │
-- │ `statut_effectif` fait déjà le calcul : un impayé au-delà de la grâce y  │
-- │ devient `expire`. Cette fonction n'a plus qu'à traduire un état en       │
-- │ verdict d'entrée.                                                        │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create type public.acces_espace as enum (
  'sans_adhesion',
  'ouvert',
  'impaye_tolere',
  'ferme'
);

comment on type public.acces_espace is
  'Le verdict d''entrée dans l''espace adhérent. `impaye_tolere` ouvre l''espace AVEC un bandeau : la lecture continue pendant la période de grâce.';

create or replace function public.association_acces_espace(
  p_user uuid,
  p_at timestamptz default public.app_now()
)
returns table (
  verdict public.acces_espace,
  fin_periode timestamptz,
  fin_grace timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with adhesion as (
    select
      s.fin_periode,
      s.impaye_depuis,
      public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at) as observe
    from public.subscriptions s
    where s.user_id = p_user
      and s.domaine = 'association'
    /*
     * La MEILLEURE adhésion, s'il y en avait plusieurs.
     *
     * Un index unique n'en laisse qu'une vivante par domaine, mais une
     * adhésion close et une neuve coexistent le temps d'un renouvellement.
     * Prendre la plus lointaine échéance donne le verdict le plus favorable,
     * et c'est le bon : fermer l'espace à qui vient de repayer serait le
     * punir d'avoir renouvelé.
     */
    order by s.fin_periode desc nulls last
    limit 1
  )
  select
    case
      when a.observe is null then 'sans_adhesion'::public.acces_espace
      when a.observe in ('actif', 'essai', 'annule') then 'ouvert'::public.acces_espace
      -- `impaye` signifie, PAR CONSTRUCTION, que la grâce court encore :
      -- au-delà, `statut_effectif` rend `expire`.
      when a.observe = 'impaye' then 'impaye_tolere'::public.acces_espace
      else 'ferme'::public.acces_espace
    end,
    a.fin_periode,
    case when a.impaye_depuis is null then null
         else public.fin_grace_impaye(a.impaye_depuis) end
  from (select * from adhesion) a
  -- `right join` sur une ligne constante : sans adhésion, la sous-requête est
  -- vide, et un `select` ordinaire ne rendrait AUCUNE ligne. L'appelant lirait
  -- alors « pas de réponse » là où la réponse est « sans adhésion ».
  right join (select 1) forcer on true;
$$;

comment on function public.association_acces_espace(uuid, timestamptz) is
  'Le verdict d''entrée dans l''espace adhérent : sans_adhesion, ouvert, impaye_tolere, ferme. Lit `statut_effectif` ; ne recalcule ni la grâce ni l''échéance.';

grant execute on function public.association_acces_espace(uuid, timestamptz) to authenticated;
