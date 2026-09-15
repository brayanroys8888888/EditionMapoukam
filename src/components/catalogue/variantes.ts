import type { Metadata } from 'next';

import { LANGUES_INTERFACE, type LangueInterface } from '@/i18n';

/**
 * LES VARIANTES FILTRÉES D'UN ÉCRAN DE CATALOGUE — leurs liens et leur
 * référencement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE MODULE EXISTE : UN PIÈGE À ROBOTS A COUPÉ LE SITE.          │
 * │                                                                          │
 * │ Chaque pastille de filtre est un lien qui repart des paramètres déjà     │
 * │ posés, et les facettes, calculées sur le catalogue ENTIER, restent       │
 * │ toutes proposées quel que soit le filtre courant. Les thèmes se          │
 * │ cumulaient dans l'ordre des clics : `ruse,animaux` et `animaux,ruse`     │
 * │ étaient deux adresses. Un robot qui suit les liens n'arrivait jamais au  │
 * │ bout, et chaque adresse coûtait un rendu serveur. L'hébergeur a mis le   │
 * │ premier déploiement en pause, quotas de fonctions et de CPU dépassés.    │
 * │                                                                          │
 * │ Trois barrières, dont celle-ci porte les deux premières :                │
 * │   1. une adresse CANONIQUE par combinaison — thèmes triés, sans doublon ;│
 * │   2. `noindex, nofollow` sur toute variante, et une balise canonique qui │
 * │      désigne l'écran sans paramètres ;                                   │
 * │   3. `robots.txt` interdit les variantes (`src/app/robots.ts`), et les   │
 * │      liens de filtre portent `rel="nofollow"`.                           │
 * │                                                                          │
 * │ Aucune n'est une protection contre un robot qui ignore les consignes :   │
 * │ celui-là se traite au pare-feu de l'hébergeur, pas dans le code.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les deux fonctions sont PURES : l'adresse publique du site leur est passée,
 * jamais lue dans l'environnement, pour qu'elles se testent sans rien allumer.
 */

export type ModificationLien = Record<string, string | number | undefined>;

/**
 * URL d'une variante des filtres courants.
 *
 * Elle repart des paramètres BRUTS de l'URL, et non des valeurs analysées :
 * les seconds portent des défauts — `tri=nouveautes`, `page=1` — qu'il serait
 * inutile d'écrire dans chaque lien, et qui allongeraient toutes les adresses
 * partagées.
 *
 * Les thèmes sont triés et dédoublonnés. Le filtre est un recouvrement —
 * `catalog_list` teste `b.themes && p_themes` — : l'ordre ne change donc
 * aucun résultat, et une seule adresse par combinaison suffit.
 *
 * @param retirer paramètres qui ne voyagent jamais dans les liens de cet
 *   écran — `type` pour un rayon, où le support est dans le chemin.
 */
export function lienVariante(
  base: string,
  brut: Readonly<Record<string, string>>,
  modification: ModificationLien,
  retirer: readonly string[] = [],
): string {
  const suivants = new URLSearchParams(brut);
  for (const [cle, valeur] of Object.entries(modification)) {
    if (valeur === undefined) suivants.delete(cle);
    else suivants.set(cle, String(valeur));
  }
  for (const cle of retirer) suivants.delete(cle);

  const themes = suivants.get('themes');
  if (themes !== null) {
    const normalises = [
      ...new Set(
        themes
          .split(',')
          .map((theme) => theme.trim())
          .filter((theme) => theme.length > 0),
      ),
    ].sort();
    if (normalises.length > 0) suivants.set('themes', normalises.join(','));
    else suivants.delete('themes');
  }

  const chaine = suivants.toString();
  return chaine.length > 0 ? `${base}?${chaine}` : base;
}

/** Vrai dès que l'adresse porte un paramètre non vide. */
function estVariante(requete: Readonly<Record<string, string | string[] | undefined>>): boolean {
  return Object.values(requete).some((valeur) =>
    Array.isArray(valeur) ? valeur.some((v) => v !== '') : valeur !== undefined && valeur !== '',
  );
}

/**
 * Métadonnées de référencement d'un écran de catalogue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `alternates` EST REPRIS EN ENTIER, ET C'EST OBLIGATOIRE.                │
 * │                                                                          │
 * │ Next remplace l'objet `alternates` de l'enveloppe au lieu de le fusionner│
 * │ : déclarer la seule balise canonique ferait disparaître les `hreflang`   │
 * │ (§5.4). Ils sont donc reposés ici — pour CE chemin, comme le fait déjà   │
 * │ le plan du site.                                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `nofollow` et non `follow` sur une variante : les titres qu'elle liste sont
 * tous atteignables depuis l'écran sans paramètres et depuis le plan du site.
 * La suivre n'apprendrait rien à un moteur, et c'est précisément en la suivant
 * qu'un robot s'enfermait.
 */
export function metadonneesVariante({
  base,
  langue,
  chemin,
  requete,
}: {
  /** Adresse publique du site — `NEXT_PUBLIC_APP_URL`. */
  base: string;
  langue: LangueInterface;
  /** Chemin de l'écran SANS préfixe de langue — `/catalogue`. */
  chemin: string;
  requete: Readonly<Record<string, string | string[] | undefined>>;
}): Pick<Metadata, 'alternates' | 'robots'> {
  const racine = base.replace(/\/+$/, '');

  return {
    alternates: {
      canonical: `${racine}/${langue}${chemin}`,
      languages: {
        ...Object.fromEntries(LANGUES_INTERFACE.map((code) => [code, `${racine}/${code}${chemin}`])),
        'x-default': `${racine}/fr${chemin}`,
      },
    },
    ...(estVariante(requete) ? { robots: { index: false, follow: false } } : {}),
  };
}
