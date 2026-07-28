-- 0013 — Factures immuables (§11.3)
--
-- Une facture n'est pas une vue sur des données vivantes : c'est une pièce
-- comptable figée à son émission. Elle porte SA PROPRE COPIE de l'identité et
-- de l'adresse de facturation. C'est précisément ce qui rend l'anonymisation du
-- compte possible sans abîmer la comptabilité.
--
-- Immuabilité imposée par un déclencheur, et non par convention : une
-- convention ne survit pas à la première correction faite « juste cette
-- fois-ci ». Une facture erronée se corrige par un avoir, jamais par
-- modification.

-- ---------------------------------------------------------------------------
-- Numérotation séquentielle sans trou
--
-- Une séquence PostgreSQL laisse des trous en cas d'annulation de transaction,
-- ce qu'une numérotation comptable n'admet pas. Un compteur verrouillé par
-- année garantit la continuité.
-- ---------------------------------------------------------------------------

create table public.invoice_counters (
  annee integer primary key,
  dernier_numero bigint not null default 0
);

comment on table public.invoice_counters is
  'Compteur de numérotation par année. Verrouillé pendant l''émission pour garantir une suite sans trou, ce qu''une séquence ne permet pas.';

create function public.prochain_numero_facture(p_annee integer)
  returns text
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_numero bigint;
begin
  insert into public.invoice_counters (annee, dernier_numero)
  values (p_annee, 1)
  on conflict (annee) do update set dernier_numero = public.invoice_counters.dernier_numero + 1
  returning dernier_numero into v_numero;

  return 'F-' || p_annee::text || '-' || lpad(v_numero::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Factures
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  emise_le timestamptz not null default public.app_now(),

  -- Rattachement au compte, sans dépendance à ses données vivantes.
  -- `restrict` : une facture existante interdit la suppression du compte.
  user_id uuid not null references public.users (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id) on delete restrict,

  -- Identité FIGÉE à l'émission. Ces colonnes ne sont jamais relues depuis
  -- `users` : c'est ce qui permet d'anonymiser le compte sans toucher à la
  -- pièce comptable.
  facture_nom text not null,
  facture_email text not null,
  facture_adresse jsonb not null default '{}',
  facture_pays text,

  -- Lignes figées, copiées à l'émission.
  lignes jsonb not null,

  montant_ht bigint not null check (montant_ht >= 0),
  montant_tva bigint not null default 0 check (montant_tva >= 0),
  montant_ttc bigint not null check (montant_ttc >= 0),
  taux_tva numeric(5, 2) not null default 0 check (taux_tva >= 0 and taux_tva <= 100),
  devise text not null references public.currencies (code),
  zone public.price_zone not null,

  -- Échéance de conservation. Conserver indéfiniment est aussi une infraction.
  conservation_jusqu_au timestamptz not null,

  constraint invoices_total_coherent check (montant_ttc = montant_ht + montant_tva),
  constraint invoices_a_une_origine check (order_id is not null or subscription_id is not null)
);

comment on table public.invoices is
  'Pièces comptables immuables (§11.3). Portent leur propre copie de l''identité de facturation : aucune donnée vivante de `users` n''est nécessaire pour les relire.';
comment on column public.invoices.facture_email is
  'Email de facturation figé à l''émission. N''est jamais resynchronisé depuis users, et survit donc à l''anonymisation du compte.';
comment on column public.invoices.conservation_jusqu_au is
  'Date au-delà de laquelle la facture doit être purgée. Calculée à l''émission depuis INVOICE_RETENTION_YEARS, le pays d''immatriculation n''étant pas encore arrêté (§16.2 point 6).';
comment on column public.invoices.taux_tva is
  'Taux appliqué. Vaut 0 tant que le prestataire agit comme revendeur officiel et prend la TVA à sa charge (§7.3.3, §11.3).';

create index invoices_user_idx on public.invoices (user_id, emise_le desc);
create index invoices_conservation_idx on public.invoices (conservation_jusqu_au);

-- ---------------------------------------------------------------------------
-- Immuabilité
-- ---------------------------------------------------------------------------

create function public.refuser_modification_facture()
  returns trigger
  language plpgsql
as $$
begin
  raise exception
    'Une facture est immuable. Corriger une facture erronée passe par un avoir, jamais par une modification (facture %).',
    old.numero
    using errcode = 'restrict_violation';
end;
$$;

-- Seul UPDATE est bloqué. DELETE reste possible : c'est par lui que passe la
-- purge à échéance de conservation, elle-même une obligation.
create trigger invoices_immuables
  before update on public.invoices
  for each row
  execute function public.refuser_modification_facture();

-- ---------------------------------------------------------------------------
-- Émission
-- ---------------------------------------------------------------------------

create function public.emettre_facture(
  p_order_id uuid,
  p_retention_years integer default 10,
  p_nom text default null,
  p_adresse jsonb default '{}',
  p_pays text default null
)
  returns public.invoices
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_commande public.orders;
  v_utilisateur public.users;
  v_lignes jsonb;
  v_facture public.invoices;
  v_maintenant timestamptz := public.app_now();
begin
  select * into v_commande from public.orders where id = p_order_id;
  if not found then
    raise exception 'Commande % introuvable.', p_order_id using errcode = 'no_data_found';
  end if;
  if v_commande.statut <> 'paye' then
    raise exception 'Une facture ne s''émet que sur une commande payée (commande % au statut %).',
      p_order_id, v_commande.statut using errcode = 'restrict_violation';
  end if;

  select * into v_utilisateur from public.users where id = v_commande.user_id;

  -- Copie figée des lignes : titre au moment de l'achat compris, pour que la
  -- facture reste lisible même si le catalogue évolue.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'book_id', oi.book_id,
      'titre', coalesce(bt.titre, b.slug),
      'langue', oi.langue,
      'prix_unitaire', oi.prix_unitaire,
      'devise', oi.devise
    ) order by bt.titre),
    '[]'::jsonb
  )
  into v_lignes
  from public.order_items oi
  join public.books b on b.id = oi.book_id
  left join public.book_translations bt on bt.book_id = oi.book_id and bt.langue = oi.langue
  where oi.order_id = p_order_id;

  insert into public.invoices (
    numero, emise_le, user_id, order_id,
    facture_nom, facture_email, facture_adresse, facture_pays,
    lignes, montant_ht, montant_tva, montant_ttc, taux_tva, devise, zone,
    conservation_jusqu_au
  ) values (
    public.prochain_numero_facture(extract(year from v_maintenant)::integer),
    v_maintenant,
    v_commande.user_id,
    p_order_id,
    coalesce(p_nom, v_utilisateur.nom_complet, 'Client'),
    v_utilisateur.email,
    p_adresse,
    p_pays,
    v_lignes,
    v_commande.montant_total,
    0,
    v_commande.montant_total,
    0,
    v_commande.devise,
    v_commande.zone,
    v_maintenant + make_interval(years => p_retention_years)
  )
  returning * into v_facture;

  return v_facture;
end;
$$;

comment on function public.emettre_facture(uuid, integer, text, jsonb, text) is
  'Émet la facture d''une commande payée. L''identité de facturation est copiée à cet instant et ne sera plus jamais relue depuis users.';

-- L'émission est un acte du serveur, jamais du client : c'est le gestionnaire
-- de webhooks qui l'appellera, après confirmation du paiement (étape 9).
revoke all on function public.emettre_facture(uuid, integer, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.emettre_facture(uuid, integer, text, jsonb, text) to service_role;
revoke all on function public.prochain_numero_facture(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------------

alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;

create policy invoice_counters_aucun_acces_client on public.invoice_counters
  for all to anon, authenticated
  using (false)
  with check (false);

-- §4.2 F9 — « Historique des commandes et accès aux factures ». Lecture seule :
-- aucun privilège d'écriture n'est accordé, l'immuabilité ne doit pas reposer
-- sur le seul déclencheur.
grant select on public.invoices to authenticated;

create policy invoices_lecture_proprietaire on public.invoices
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
