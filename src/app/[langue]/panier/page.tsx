import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { apercu } from '@/lib/orders/orders';
import { identifierAppelant } from '@/lib/auth/session';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { commander, retirerDuPanier } from './actions';

/**
 * Panier — §4.1 F6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TOTAL VIENT DU SERVEUR, JAMAIS D'UNE ADDITION.                       │
 * │                                                                          │
 * │ `apercu` est le module qu'emploie `PUT /api/orders`. Additionner les     │
 * │ `prix_unitaire` affichés donnerait un résultat juste la plupart du       │
 * │ temps — et faux dès qu'un code promo, une remise ou une zone             │
 * │ d'encaissement différente entre en jeu. C'est le piège le plus probable  │
 * │ de tout ce chantier, et un test d'architecture le garde.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'panier.titre') };
}

export default async function PagePanier({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  const codePromo = premier(requete['promo']) ?? null;

  let vue;
  let formater;
  try {
    vue = await apercu(appelant, { zoneAffichee: 'international', codePromo });
    if (vue) formater = formateur(await lireDevise(vue.total.devise));
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const erreur = premier(requete['erreur']);
  const aConfirmer = premier(requete['a_confirmer']);

  // Panier vide : un cul-de-sac sans issue serait un écran mort.
  if (!vue || vue.total.lignes.length === 0) {
    return (
      <section className="mx-auto flex max-w-2xl flex-col items-start gap-5 px-4 py-10">
        <h1 className="font-serif text-3xl font-bold">{traduire(langue, 'panier.titre')}</h1>
        <p className="text-muted-foreground">{traduire(langue, 'panier.vide')}</p>
        <Button asChild>
          <a href={`/${langue}/catalogue`}>{traduire(langue, 'panier.videAction')}</a>
        </Button>
      </section>
    );
  }

  const afficher = formater ?? ((montant: number) => String(montant));

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="font-serif text-3xl font-bold">{traduire(langue, 'panier.titre')}</h1>

      {erreur ? (
        <p className="rounded-md bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {/* ── Lignes commandables ──────────────────────────────────────────── */}
      <ul className="flex flex-col gap-3">
        {vue.total.lignes.map((ligne) => (
          <li
            key={`${ligne.bookId}:${ligne.langue}`}
            className="flex items-center justify-between gap-4 border-b border-border pb-3"
          >
            <span className="font-medium">{ligne.titre}</span>

            <span className="flex items-center gap-4">
              <span>{afficher(ligne.prixUnitaire)}</span>
              <form action={retirerDuPanier.bind(null, langue, ligne.bookId)}>
                <Button type="submit" variant="ghost" size="sm">
                  {traduire(langue, 'panier.retirer')}
                </Button>
              </form>
            </span>
          </li>
        ))}
      </ul>

      {/* ── Lignes refusées ──────────────────────────────────────────────── */}
      {vue.refusees.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">{traduire(langue, 'panier.refuseesTitre')}</h2>

          <ul className="flex flex-col gap-3">
            {vue.refusees.map((refus) => (
              <li key={refus.bookId} className="flex flex-col gap-1">
                <span className="font-medium">{refus.titre}</span>
                {/*
                  QUATRE MOTIFS, QUATRE MESSAGES. Un titre écarté en silence
                  est perçu comme une panne, et un message unique laisse le
                  client sans moyen de comprendre ce qu'il doit faire.
                */}
                <span className="text-sm text-muted-foreground">
                  {traduire(langue, `panier.refus_${refus.raison}` as CleTraduction)}
                </span>

                {/*
                  `deja_possede` propose d'aller LIRE le titre, jamais de le
                  retirer : on ne renvoie pas quelqu'un vers une corbeille pour
                  lui apprendre qu'il possède déjà ce qu'il voulait acheter.
                */}
                {refus.raison === 'deja_possede' ? (
                  <a
                    href={`/${langue}/compte/bibliotheque`}
                    className="text-sm underline underline-offset-2"
                  >
                    {traduire(langue, 'panier.refus_deja_possede_action')}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Separator />

      {/* ── Code promo ───────────────────────────────────────────────────── */}
      <form method="get" action={`/${langue}/panier`} className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="code-promo">{traduire(langue, 'panier.codePromo')}</Label>
          <Input id="code-promo" name="promo" defaultValue={codePromo ?? ''} />
        </div>
        <Button type="submit" variant="secondary">
          {traduire(langue, 'panier.codePromoAppliquer')}
        </Button>
      </form>

      {/*
        UN CODE ÉCARTÉ EST DIT, JAMAIS SILENCIEUX. Six motifs de refus, six
        messages : un code ignoré sans explication est perçu comme une panne, et
        le client conclut que la remise annoncée n'existe pas.
      */}
      {vue.refusPromo ? (
        <p className="text-sm text-destructive" role="alert">
          {traduire(langue, `panier.refus_promo_${vue.refusPromo}` as CleTraduction)}
        </p>
      ) : null}

      {/* ── Totaux ───────────────────────────────────────────────────────── */}
      <dl className="flex flex-col gap-2">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{traduire(langue, 'panier.sousTotal')}</dt>
          <dd>{afficher(vue.total.sousTotal)}</dd>
        </div>

        {vue.total.remise > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{traduire(langue, 'panier.remise')}</dt>
            <dd>−{afficher(vue.total.remise)}</dd>
          </div>
        ) : null}

        <div className="flex justify-between text-lg font-bold">
          <dt>{traduire(langue, 'panier.total')}</dt>
          <dd>{afficher(vue.total.total)}</dd>
        </div>
      </dl>

      {vue.zoneDivergente ? (
        <p className="rounded-md bg-accent p-4 text-sm text-accent-foreground">
          {traduire(langue, 'panier.zoneDivergente')}
        </p>
      ) : null}

      {/* ── Commander ────────────────────────────────────────────────────── */}
      <form action={commander.bind(null, langue)}>
        {codePromo ? <input type="hidden" name="code_promo" value={codePromo} /> : null}

        {/*
          `total_confirme` ne sert QU'À COMPARER, jamais à facturer : un total
          qui ne correspond pas au calcul du serveur fait échouer la commande,
          il ne la modifie pas. Il n'est transmis que lorsque le serveur a
          demandé une confirmation explicite.
        */}
        {aConfirmer ? <input type="hidden" name="total_confirme" value={aConfirmer} /> : null}

        <Button type="submit">{traduire(langue, 'panier.commander')}</Button>
      </form>
    </section>
  );
}
