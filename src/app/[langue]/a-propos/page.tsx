import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { listerCatalogue } from '@/lib/catalog/repository';
import { CorpsEditorial } from '@/components/editorial';
import { AproposV2 } from '@/components/v2/apropos';
import { versionDesign } from '@/design/version';

/**
 * À PROPOS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE ÉCLIPSE `(editorial)/[page]`, DANS LES DEUX DIRECTIONS.     │
 * │                                                                          │
 * │ Next fait toujours gagner un segment statique sur un segment dynamique.  │
 * │ Sans le renvoi ci-dessous, la V1 perdrait silencieusement sa page « À    │
 * │ propos » éditoriale — remplacée par un écran conçu pour la V2. C'est la  │
 * │ même précaution que sur `/contact`, et pour la même raison.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

/** Titres montrés en preuve, en bas de page. */
const NOMBRE_COUVERTURES = 8;

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'navigation.apropos'),
    description: traduire(langue, 'v2.aproposTexte'),
  };
}

export default async function PageApropos({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  if (versionDesign() !== 'v2') {
    return <CorpsEditorial langue={langue} slug="a-propos" />;
  }

  /*
   * Le mur de couvertures vient du CATALOGUE, jamais d'une liste écrite ici.
   *
   * Une liste de titres en dur se périmerait au premier conte publié, et cette
   * page serait la dernière où quelqu'un penserait à aller la corriger.
   *
   * L'échec est silencieux : la page « à propos » doit s'afficher même quand
   * la base tousse — c'est la page qu'on ouvre justement quand on doute.
   */
  const catalogue = await listerCatalogue(
    null,
    catalogQuerySchema.parse({ langue, tri: 'nouveautes', taille: NOMBRE_COUVERTURES }),
  ).catch(() => null);

  return <AproposV2 langue={langue} couvertures={catalogue?.entrees ?? []} />;
}
