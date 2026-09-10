import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { listerCatalogue } from '@/lib/catalog/repository';
import { CorpsEditorial } from '@/components/editorial';
import { AproposV2 } from '@/components/v2/apropos';
import { AproposV3 } from '@/components/v2/apropos-v3';
import { estV3, structureRefondue } from '@/design/version';

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

/**
 * Titres montrés en preuve, en bas de page.
 *
 * Dix, et non huit : sous Organic la preuve est une rangée qui GLISSE, et non
 * une grille qui se replie. Une rangée n'a pas de dernière ligne bancale à
 * éviter — elle montre ce que le catalogue porte, et le prototype la remplit
 * de la même façon.
 */
const NOMBRE_COUVERTURES = 10;

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'navigation.apropos'),
    description: traduire(langue, 'v2.aproposTexte'),
  };
}

export default async function PageApropos({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  if (!structureRefondue()) {
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

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SOUS ORGANIC, L'ÉCRAN EST REDESSINÉ — PAS SEULEMENT REPEINT.         │
   * │                                                                      │
   * │ Le prototype ne montre pas la même page : le récit devient le héros  │
   * │ sur deux colonnes, la citation prend un panneau olive, et le         │
   * │ catalogue une rangée qui glisse au lieu d'une grille qui se replie.  │
   * │ Aucune règle de couleur ne fabrique une rangée horizontale.          │
   * │                                                                      │
   * │ La V2 reste donc en place, intacte, sous cette condition — le même   │
   * │ partage que sur `/contact`.                                          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const entrees = catalogue?.entrees ?? [];

  return estV3() ? (
    <AproposV3 langue={langue} couvertures={entrees} />
  ) : (
    <AproposV2 langue={langue} couvertures={entrees} />
  );
}
