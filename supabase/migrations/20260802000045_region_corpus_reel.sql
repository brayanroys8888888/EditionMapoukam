-- ---------------------------------------------------------------------------
-- Alignement du corpus reel sur `books.region`
--
-- +--------------------------------------------------------------------------+
-- | LA MIGRATION 0044 A RANGE CINQ TITRES SUR NEUF. C'EST INSTRUCTIF.        |
-- |                                                                          |
-- | Son mappage reposait sur les libelles de la maquette — « Afrique de      |
-- | l'Ouest », « Sahel », « Afrique centrale ». Le corpus reel, lui, ecrit   |
-- | « Ghana », « Cote d'Ivoire », « Cameroun », « Bassin du Congo »,         |
-- | « Corne de l'Afrique » : des PAYS et des AIRES CULTURELLES, ce que la    |
-- | specification demande en §4.1 F3 — « pays / peuple / tradition ».        |
-- |                                                                          |
-- | C'est la meilleure confirmation possible de l'arbitrage a deux champs.   |
-- | Aucune enumeration a cinq valeurs n'aurait pu porter « Bassin du Congo » |
-- | sans appauvrir la fiche ; aucune couleur n'aurait pu se choisir sur un   |
-- | texte libre sans mentir un jour.                                         |
-- +--------------------------------------------------------------------------+
--
-- Le mappage ci-dessous est NOMME, titre par titre, et non heuristique. Sur
-- neuf lignes, une regle approximative coute plus a relire qu'une liste.
-- ---------------------------------------------------------------------------

update public.books set region = 'afrique_ouest'::public.region_conte
 where region is null and origine_culturelle in ('Ghana', 'Côte d''Ivoire');

update public.books set region = 'afrique_centrale'::public.region_conte
 where region is null and origine_culturelle in ('Cameroun', 'Bassin du Congo');

update public.books set region = 'afrique_est'::public.region_conte
 where region is null and origine_culturelle in ('Corne de l''Afrique');

-- ---------------------------------------------------------------------------
-- Garde-fou : aucun titre PUBLIE ne doit sortir de cette migration sans region
--
-- +--------------------------------------------------------------------------+
-- | UNE MIGRATION QUI ECHOUE VAUT MIEUX QU'UN CATALOGUE SANS COULEUR.        |
-- |                                                                          |
-- | Sans ce controle, un titre publie oublie ici deviendrait invisible : il  |
-- | s'afficherait sans couleur, et `manques_pour_publication` ne le          |
-- | signalerait qu'a la prochaine tentative de republication — c'est-a-dire  |
-- | peut-etre jamais.                                                        |
-- +--------------------------------------------------------------------------+
-- ---------------------------------------------------------------------------

do $$
declare
  v_orphelins text;
begin
  select string_agg(slug || ' (' || coalesce(origine_culturelle, 'sans origine') || ')', ', ')
    into v_orphelins
  from public.books
  where statut = 'publie' and region is null;

  if v_orphelins is not null then
    raise exception
      'Titres publies sans region : %. Completez le mappage de cette migration.', v_orphelins;
  end if;
end;
$$;

comment on column public.books.origine_culturelle is
  'Pays, peuple ou tradition du conte (§4.1 F3). TEXTE LIBRE, et delibrement : « Bassin du Congo » ou « conte akan — Ghana » n''entrent dans aucune enumeration. N''est compare pour egalite par personne — c''est `region` qui l''est.';
