import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { metadonneesVariante } from '@/components/catalogue/variantes';
import { getServerEnv } from '@/lib/config/env';
import { Rayon, aplatirRequete, type ClesRayon } from '../rayon';

/**
 * CONTES — le rayon des histoires, séparé de celui des livrets.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CET ÉCRAN EXISTE, ALORS QUE `/catalogue` MONTRAIT DÉJÀ TOUT.   │
 * │                                                                          │
 * │ Un conte et un livret pédagogique ne se cherchent pas de la même façon : │
 * │ l'un se lit le soir, l'autre s'imprime pour une classe. Les mêler par    │
 * │ défaut obligeait le lecteur à poser un filtre avant de commencer.        │
 * │                                                                          │
 * │ `/catalogue` demeure — il porte la recherche sur TOUT le fonds, et reste │
 * │ la cible de la loupe, du plan de site et des liens déjà partagés. Rien   │
 * │ de ce qui existait ne se casse ; deux portes s'ajoutent devant.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Tout le corps de l'écran vit dans `../rayon` : `/livrets` est le même écran
 * avec un autre support, et il n'en existe qu'une implémentation.
 */

const CLES: ClesRayon = {
  titre: 'contes.titre',
  intro: 'contes.intro',
  compteTous: 'contes.compteTous',
  compteUn: 'contes.compteUn',
  videTitre: 'contes.videTitre',
  compteCarte: 'contes.compteCarte',
};

interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, CLES.titre),
    description: traduire(langue, CLES.intro),
    ...metadonneesVariante({
      base: getServerEnv().NEXT_PUBLIC_APP_URL,
      langue,
      chemin: '/contes',
      requete: await searchParams,
    }),
  };
}

export default async function PageContes({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);

  return (
    <Rayon
      langue={langue}
      requete={aplatirRequete(await searchParams)}
      type="conte"
      base={`/${langue}/contes`}
      cles={CLES}
    />
  );
}
