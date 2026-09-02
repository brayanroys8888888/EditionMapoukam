-- 0061 — support des livrets pédagogiques et orientation des pages
--
-- Les contes restent le type par défaut. Les livrets pédagogiques peuvent
-- ensuite être distingués par `type_document`, puis orientés selon leur mise en
-- page (`paysage` ou `portrait`).

create type public.document_type as enum ('conte', 'livret_pedagogique');
create type public.page_orientation as enum ('paysage', 'portrait');

alter table public.books
  add column if not exists type_document public.document_type not null default 'conte',
  add column if not exists orientation public.page_orientation not null default 'portrait';

comment on column public.books.type_document is
  'Type de support dans le catalogue. Un conte est un livre narratif ; un livret pédagogique est un support d''apprentissage.';
comment on column public.books.orientation is
  'Orientation de la mise en page du support. Le format paysage est prévu pour les livrets pédagogiques, tandis que les contes restent majoritairement portrait.';
