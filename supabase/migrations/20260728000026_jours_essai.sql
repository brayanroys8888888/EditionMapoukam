-- 0026 — Durée d'essai : réglable, mais FIGÉE sur chaque abonnement (Q10.2)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LE RÉGLAGE EST GLOBAL, LA VALEUR APPLIQUÉE EST CONTRACTUELLE.             │
-- │                                                                            │
-- │ Même principe que `order_items.prix_unitaire` (D4 point 6) : le prix       │
-- │ courant vit dans `book_prices`, mais celui qui a été FACTURÉ est recopié   │
-- │ sur la commande. Une évolution de la grille ne rejuge aucune vente passée. │
-- │                                                                            │
-- │ Ici de même. Sans la colonne `jours_essai`, ramener le réglage de 7 à 3    │
-- │ jours raccourcirait RÉTROACTIVEMENT les essais en cours : un abonné à qui  │
-- │ sept jours ont été promis serait prélevé au troisième. C'est un bug de     │
-- │ facturation, pas un changement de configuration.                          │
-- └────────────────────────────────────────────────────────────────────────────┘

alter table public.business_settings
  add column jours_essai integer not null default 7 check (jours_essai between 0 and 90);

comment on column public.business_settings.jours_essai is
  'Durée de l''essai gratuit accordée aux NOUVELLES souscriptions (§3.4). Les abonnements en cours conservent la valeur figée sur leur ligne.';

alter table public.subscriptions
  add column jours_essai integer not null default 0 check (jours_essai between 0 and 90);

comment on column public.subscriptions.jours_essai is
  'Durée d''essai réellement accordée à CET abonnement, figée à la souscription. Modifier business_settings.jours_essai ne la change jamais — sans quoi un abonné à qui sept jours ont été promis serait prélevé au troisième.';

-- Les abonnements existants sont laissés à zéro : aucun n'a été créé sous un
-- régime d'essai enregistré, et leur inventer une durée rétroactive serait
-- précisément l'erreur que cette migration corrige.
