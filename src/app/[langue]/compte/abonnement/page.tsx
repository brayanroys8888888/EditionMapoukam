import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { identifierAppelant } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * Mon abonnement — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `statutEffectif`, JAMAIS `statut`.                                      │
 * │                                                                          │
 * │ Le second est ce que le prestataire a rapporté ; le premier replie les   │
 * │ dates et décrit la réalité. Une période échue sans événement — presque   │
 * │ toujours un webhook perdu — reste « actif » au sens rapporté, et ne      │
 * │ l'est plus au sens observé. Afficher le premier ferait promettre un      │
 * │ accès que le moteur de droits refuse déjà.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ APRÈS UNE ANNULATION, L'ÉCRAN DIT JUSQU'À QUAND.                        │
 * │                                                                          │
 * │ C'est le contresens le plus fréquent du domaine : on croit perdre son    │
 * │ accès au moment du clic, alors que la période déjà réglée court          │
 * │ toujours. Le dire évite une réclamation et un remboursement demandé      │
 * │ pour rien.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'abonnement.titre') };
}

export default async function PageAbonnement({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let courant;
  try {
    courant = await abonnementCourant(appelant.id);
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  if (!courant) {
    return (
      <section className="mx-auto flex max-w-2xl flex-col items-start gap-5 px-4 py-10">
        <h1 className="font-serif text-3xl font-bold">{traduire(langue, 'abonnement.titre')}</h1>
        <p className="text-muted-foreground">{traduire(langue, 'abonnement.aucun')}</p>
        <Button asChild>
          <a href={`/${langue}/offres`}>{traduire(langue, 'abonnement.aucunAction')}</a>
        </Button>
      </section>
    );
  }

  const statut = courant.statutEffectif;
  const annule = courant.statut === 'annule';
  const finPeriode = courant.finPeriode.toLocaleDateString(langue);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="font-serif text-3xl font-bold">{traduire(langue, 'abonnement.titre')}</h1>

      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{traduire(langue, 'abonnement.statut')}</dt>
          <dd>
            <Badge variant={statut === 'actif' || statut === 'essai' ? 'default' : 'secondary'}>
              {traduire(langue, `abonnement.statut_${statut}` as CleTraduction)}
            </Badge>
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{traduire(langue, 'abonnement.offre')}</dt>
          <dd>{traduire(langue, `abonnement.offre_${courant.offre}` as CleTraduction)}</dd>
        </div>
      </dl>

      {/*
        `anomalie` est NOMMÉE, jamais présentée comme une « erreur ».
        L'utilisateur n'y peut rien : c'est presque toujours un webhook perdu,
        et lui dire qu'il n'aura pas à repayer est ce qui évite qu'il
        s'abonne une seconde fois.
      */}
      {statut === 'anomalie' ? (
        <p className="rounded-md border border-border bg-accent p-4 text-sm text-accent-foreground">
          {traduire(langue, 'abonnement.anomalieCorps')}
        </p>
      ) : (
        <p className="text-sm">
          {traduire(
            langue,
            annule ? 'abonnement.finPeriodeApresAnnulation' : 'abonnement.finPeriode',
          ).replace('{date}', finPeriode)}
        </p>
      )}

      <Separator />

      {/*
        LE RAPPEL QUI ÉVITE LA RÉCLAMATION. Il paraît ici, sur l'écran de
        l'abonnement, et non seulement sur la page des offres : c'est au moment
        d'annuler qu'on se demande ce qu'on va perdre.
      */}
      <p className="text-sm text-muted-foreground">
        {traduire(langue, 'abonnement.rappelTelechargement')}
      </p>

      <div>
        <Button asChild variant="secondary">
          <a href={`/${langue}/compte/bibliotheque`}>{traduire(langue, 'compte.bibliotheque')}</a>
        </Button>
      </div>
    </section>
  );
}
