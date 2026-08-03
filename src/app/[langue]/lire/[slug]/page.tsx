import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { langueValide, traduire } from '@/i18n';
import { ficheQuerySchema } from '@/domain/catalog/schemas';
import { lireFiche } from '@/lib/catalog/repository';
import { identifierAppelant } from '@/lib/auth/session';
import { Lecteur } from '@/components/lecteur';

/**
 * Lecture d'un conte — §4.1 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CETTE PAGE ÉTABLIT, ET QUE LE LECTEUR NE POURRAIT PAS DEVINER.   │
 * │                                                                          │
 * │ `acces.canRead` est lu ICI, côté serveur, au chargement. Il distingue    │
 * │ ensuite, dans le lecteur, une session morte d'un refus d'achat : la      │
 * │ route des pages étant publique, un jeton expiré y vaut « visiteur », et  │
 * │ un `403` seul ne dit pas laquelle des deux situations s'est produite.    │
 * │                                                                          │
 * │ Sans cette valeur, un enfant dont la session meurt en pleine lecture     │
 * │ d'un conte acheté par ses parents lirait « achetez ce titre ».           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La page est indexable mais SANS CONTENU DE CONTE : les images passent par
 * une route serveur qui vérifie les droits et émet une URL signée de 300 s
 * (CLAUDE.md règle 3). Rien du conte n'entre dans ce HTML.
 */
interface Parametres {
  params: Promise<{ langue: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SLUG_VALIDE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'lecteur.titre'),
    // La lecture est personnelle : rien à indexer, et surtout rien à mettre en
    // cache dans un moteur.
    robots: { index: false, follow: false },
  };
}

export default async function PageLecture({ params, searchParams }: Parametres) {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);
  const requete = await searchParams;

  if (!SLUG_VALIDE.test(slug)) notFound();

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  const fiche = await lireFiche(
    appelant?.id ?? null,
    slug,
    ficheQuerySchema.parse({ langue }),
  ).catch(() => null);

  if (!fiche) notFound();

  // Le nombre de pages consultables : l'intégralité pour qui a le droit, la
  // borne de l'extrait sinon. Les deux valeurs viennent de l'API — l'écran ne
  // compte rien et ne déduit rien.
  const total = fiche.acces.canRead ? (fiche.nb_pages ?? fiche.pages_extrait) : fiche.pages_extrait;

  const demandee = Number(
    Array.isArray(requete['page']) ? requete['page'][0] : requete['page'],
  );
  const pageInitiale =
    Number.isFinite(demandee) && demandee >= 1 && demandee <= total ? Math.floor(demandee) : 1;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="sr-only">{fiche.titre}</h1>

      <Lecteur
        langue={langue}
        livreId={fiche.id}
        slug={fiche.slug}
        langueContenu={langue}
        total={total}
        pageInitiale={pageInitiale}
        possedeAuChargement={fiche.acces.canRead}
      />

      <a href={`/${langue}/contes/${fiche.slug}`} className="mx-auto text-sm underline">
        {traduire(langue, 'lecteur.retourFiche')}
      </a>
    </section>
  );
}
