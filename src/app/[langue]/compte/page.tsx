import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { identifierAppelant } from '@/lib/auth/session';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Espace personnel — le sommaire.
 *
 * L'en-tête de l'application pointe ici pour tout compte connecté : sans cette
 * page, « Mon compte » aurait mené à un 404 depuis chaque écran du site.
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

const SECTIONS: { chemin: string; titre: CleTraduction; corps: CleTraduction }[] = [
  {
    chemin: 'bibliotheque',
    titre: 'compte.bibliotheque',
    corps: 'compte.achatsTitre',
  },
  {
    chemin: 'abonnement',
    titre: 'compte.abonnement',
    corps: 'offres.abonnementResume',
  },
];

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'compte.titre') };
}

export default async function PageCompte({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="font-serif text-3xl font-bold">{traduire(langue, 'compte.titre')}</h1>

      <p className="text-muted-foreground">{appelant.email}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <a key={section.chemin} href={`/${langue}/compte/${section.chemin}`} className="block">
            <Card className="h-full transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="font-serif">{traduire(langue, section.titre)}</CardTitle>
                <CardDescription>{traduire(langue, section.corps)}</CardDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </div>
    </section>
  );
}
