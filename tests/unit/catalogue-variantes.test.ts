import { describe, expect, it } from 'vitest';

import { lienVariante, metadonneesVariante } from '@/components/catalogue/variantes';

/**
 * LES VARIANTES FILTRÉES DU CATALOGUE — une adresse par combinaison, et aucune
 * indexée.
 *
 * Le premier déploiement a été mis en pause par l'hébergeur : des robots
 * s'enfermaient dans les filtres, où chaque ordre de clic sur les thèmes
 * produisait une adresse neuve. Ces tests gardent les deux barrières que le
 * code peut tenir. Voir l'encadré de `src/components/catalogue/variantes.ts`.
 */

const BASE = '/fr/catalogue';

function themesDe(url: string): string | null {
  return new URL(url, 'http://exemple.test').searchParams.get('themes');
}

describe('lienVariante — une seule adresse par combinaison de thèmes', () => {
  it('l’ordre des clics ne fabrique plus deux adresses', () => {
    const unSens = lienVariante(BASE, { themes: 'ruse' }, { themes: 'ruse,animaux' });
    const autreSens = lienVariante(BASE, { themes: 'animaux' }, { themes: 'animaux,ruse' });

    expect(unSens).toBe(autreSens);
    expect(themesDe(unSens)).toBe('animaux,ruse');
  });

  it('un thème répété ou vide disparaît', () => {
    expect(themesDe(lienVariante(BASE, {}, { themes: 'ruse,,ruse, animaux ' }))).toBe('animaux,ruse');
  });

  it('une adresse reçue dans le désordre est rendue triée, même quand le lien ne touche pas aux thèmes', () => {
    // Un vieux lien partagé ou déjà connu d'un robot : le tri suivant ne doit
    // pas le perpétuer.
    const url = lienVariante(BASE, { themes: 'ruse,animaux' }, { tri: 'prix' });
    expect(themesDe(url)).toBe('animaux,ruse');
  });

  it('retirer le dernier thème retire le paramètre, sans laisser `themes=`', () => {
    expect(lienVariante(BASE, { themes: 'ruse' }, { themes: undefined })).toBe(BASE);
    expect(lienVariante(BASE, {}, { themes: ',' })).toBe(BASE);
  });

  it('les autres paramètres sont conservés, et `undefined` retire', () => {
    const url = lienVariante(BASE, { acces: 'gratuit', page: '3' }, { tri: 'prix', page: undefined });
    const parametres = new URL(url, 'http://exemple.test').searchParams;

    expect(parametres.get('acces')).toBe('gratuit');
    expect(parametres.get('tri')).toBe('prix');
    expect(parametres.has('page')).toBe(false);
  });

  it('un paramètre interdit à l’écran ne voyage jamais — le `type` d’un rayon', () => {
    const url = lienVariante('/fr/contes', { type: 'livret_pedagogique' }, { tri: 'prix' }, ['type']);
    expect(url).toBe('/fr/contes?tri=prix');
  });

  it('sans aucun paramètre, l’écran nu', () => {
    expect(lienVariante(BASE, {}, {})).toBe(BASE);
  });
});

describe('metadonneesVariante — aucune variante indexée, et les hreflang conservés', () => {
  const SITE = 'https://site.exemple';

  it('une variante filtrée est `noindex, nofollow`', () => {
    const meta = metadonneesVariante({
      base: SITE,
      langue: 'fr',
      chemin: '/catalogue',
      requete: { themes: 'ruse' },
    });

    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('l’écran nu reste indexable — le contre-test', () => {
    const meta = metadonneesVariante({ base: SITE, langue: 'fr', chemin: '/catalogue', requete: {} });
    expect(meta.robots).toBeUndefined();
  });

  it('un paramètre vide ne fait pas une variante', () => {
    const meta = metadonneesVariante({
      base: SITE,
      langue: 'fr',
      chemin: '/catalogue',
      requete: { q: '', themes: undefined, tri: [''] },
    });
    expect(meta.robots).toBeUndefined();
  });

  it('la canonique désigne l’écran SANS paramètres, dans sa langue', () => {
    const meta = metadonneesVariante({
      base: `${SITE}/`,
      langue: 'en',
      chemin: '/contes',
      requete: { page: '2' },
    });

    expect(meta.alternates?.canonical).toBe(`${SITE}/en/contes`);
  });

  it('les hreflang sont reposés pour CE chemin — l’enveloppe les perdrait sinon', () => {
    const meta = metadonneesVariante({ base: SITE, langue: 'fr', chemin: '/livrets', requete: {} });

    expect(meta.alternates?.languages).toEqual({
      fr: `${SITE}/fr/livrets`,
      en: `${SITE}/en/livrets`,
      'x-default': `${SITE}/fr/livrets`,
    });
  });
});
