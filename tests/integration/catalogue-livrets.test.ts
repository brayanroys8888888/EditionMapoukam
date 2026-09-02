import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BarreFiltres, GrilleCatalogue } from '@/components/catalogue';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { lireFacettes, listerCatalogue } from '@/lib/catalog/repository';

import { closePool, query, queryOne } from '../helpers/db';

/**
 * LE RAYON DES LIVRETS PÉDAGOGIQUES — migrations 0061, 0062, 0063.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI N'EST PAS « LE FILTRE MARCHE ».                  │
 * │                                                                          │
 * │ C'est que le filtre est posé EN SQL, et non sur le résultat. La          │
 * │ différence ne se voit pas sur la liste des titres — elle se voit sur     │
 * │ `total`. Un tri fait en TypeScript rendrait les bons titres et un total  │
 * │ faux : une pagination qui promet des pages vides, un « 3 sur 47 » sur un │
 * │ rayon qui en compte trois, et un « aucun résultat » qui n'arrive jamais. │
 * │                                                                          │
 * │ D'où le test central : `total` du rayon = nombre de livrets publiés, pas │
 * │ le total du catalogue.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER MUTE LE CORPUS, ET LE REND INTACT.                           │
 * │                                                                          │
 * │ Les tests d'intégration partagent une base et tournent en série. Un      │
 * │ titre laissé en `livret_pedagogique` ferait tomber des fichiers qui ne   │
 * │ parlent pas de lui — et le message ne dirait pas un mot de livrets.      │
 * │ `afterAll` remet donc la valeur d'origine, relue avant toute écriture.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface LigneLivre {
  id: string;
  slug: string;
  type_document: string;
}

/** Le titre promu en livret le temps de ce fichier, et sa valeur d'origine. */
let cobaye: LigneLivre | undefined;

beforeAll(async () => {
  cobaye = await queryOne<LigneLivre>(
    `select b.id, b.slug, b.type_document::text as type_document
       from public.books b
       join public.book_translations t
         on t.book_id = b.id and t.langue = 'fr' and t.statut = 'publie'
      where b.statut = 'publie'
      order by b.slug
      limit 1`,
  );

  if (!cobaye) throw new Error('Corpus vide : ce fichier ne prouverait rien.');

  await query(
    `update public.books
        set type_document = 'livret_pedagogique'::public.document_type,
            orientation = 'paysage'::public.page_orientation
      where id = $1`,
    [cobaye.id],
  );
});

afterAll(async () => {
  if (cobaye) {
    await query(
      `update public.books
          set type_document = $2::public.document_type,
              orientation = 'portrait'::public.page_orientation
        where id = $1`,
      [cobaye.id, cobaye.type_document],
    );
  }
  await closePool();
});

describe('LE FILTRE DE TYPE DESCEND JUSQU’À `catalog_list`', () => {
  it('le rayon ne rend QUE des livrets, et son total ne compte que le rayon', async () => {
    const tout = await listerCatalogue(null, catalogQuerySchema.parse({ langue: 'fr' }));
    const rayon = await listerCatalogue(
      null,
      catalogQuerySchema.parse({ langue: 'fr', type: 'livret_pedagogique' }),
    );

    expect(rayon.entrees.length).toBeGreaterThan(0);
    for (const entree of rayon.entrees) {
      expect(entree.type_document).toBe('livret_pedagogique');
    }

    // LE point du test : le total suit le filtre. S'il valait celui du
    // catalogue, la pagination promettrait des pages qui n'existent pas.
    expect(rayon.total).toBe(rayon.entrees.length);
    expect(rayon.total).toBeLessThan(tout.total);
  });

  it('sans paramètre, le catalogue rend les DEUX types — le tri se demande', async () => {
    // Un défaut à « conte » aurait fait disparaître les livrets de la
    // recherche, du plan de site et des suggestions sans qu'un appelant change.
    const tout = await listerCatalogue(null, catalogQuerySchema.parse({ langue: 'fr' }));
    const types = new Set(tout.entrees.map((e) => e.type_document));

    expect(types.has('conte')).toBe(true);
    expect(types.has('livret_pedagogique')).toBe(true);
  });

  it('le rayon des contes exclut le livret, symétriquement', async () => {
    const contes = await listerCatalogue(
      null,
      catalogQuerySchema.parse({ langue: 'fr', type: 'conte' }),
    );

    expect(contes.entrees.length).toBeGreaterThan(0);
    expect(contes.entrees.map((e) => e.slug)).not.toContain(cobaye?.slug);
  });

  it('`?type=` inconnu ne devient pas un filtre silencieux', () => {
    // Le défaut qu'a connu `region` : un schéma Zod retire les clés inconnues,
    // si bien qu'une valeur fausse n'était pas refusée — elle était ignorée.
    const analyse = catalogQuerySchema.safeParse({ langue: 'fr', type: 'affiche' });
    expect(analyse.success).toBe(false);
  });
});

describe('LES DEUX VALEURS TRAVERSENT LA CHAÎNE JUSQU’À L’ENTRÉE', () => {
  it('`type_document` et `orientation` arrivent au catalogue, jamais nuls', async () => {
    // La colonne est NOT NULL depuis la 0061 : une entrée sans valeur
    // signifierait que `donneesDAffichage` ne l'a pas lue, et le repli sur
    // « conte » masquerait un livret dans la grille.
    const page = await listerCatalogue(null, catalogQuerySchema.parse({ langue: 'fr' }));

    for (const entree of page.entrees) {
      expect(['conte', 'livret_pedagogique']).toContain(entree.type_document);
      expect(['paysage', 'portrait']).toContain(entree.orientation);
    }

    const promu = page.entrees.find((e) => e.slug === cobaye?.slug);
    expect(promu?.type_document).toBe('livret_pedagogique');
    expect(promu?.orientation).toBe('paysage');
  });
});

describe('LA FACETTE DES TYPES VIENT DE LA BASE, PAS D’UNE LISTE ÉCRITE EN DUR', () => {
  it('elle porte les deux types et leur effectif réel', async () => {
    const facettes = await lireFacettes('fr');

    const parValeur = new Map(facettes.types.map((f) => [f.valeur, f.nombre]));
    expect(parValeur.get('livret_pedagogique')).toBeGreaterThanOrEqual(1);
    expect(parValeur.get('conte')).toBeGreaterThanOrEqual(1);

    // La somme des types EST le catalogue publié : la colonne étant NOT NULL,
    // aucun titre ne peut échapper au comptage.
    const somme = facettes.types.reduce((total, f) => total + f.nombre, 0);
    expect(somme).toBe(facettes.total);
  });

  it('la pastille de type apparaît quand deux types coexistent', async () => {
    const facettes = await lireFacettes('fr');

    const html = renderToStaticMarkup(
      createElement(BarreFiltres, {
        langue: 'fr',
        facettes,
        filtres: { tri: 'nouveautes', page: 1 },
        lien: (m: Record<string, string | number | undefined>) =>
          `/fr/catalogue?${new URLSearchParams(
            Object.entries(m).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
          ).toString()}`,
      }),
    );

    expect(html).toContain('type=livret_pedagogique');
    expect(html).toContain('Livrets pédagogiques');
  });

  it('elle NE l’affiche PAS sur un écran dont le type est le sujet', async () => {
    // `/livrets` : une pastille « Contes » y offrirait une porte qui fait
    // sortir du rayon qu'on vient d'ouvrir.
    const facettes = await lireFacettes('fr');

    const html = renderToStaticMarkup(
      createElement(BarreFiltres, {
        langue: 'fr',
        facettes,
        filtres: { tri: 'nouveautes', page: 1, type: 'livret_pedagogique' },
        lien: () => '/fr/livrets',
        typeModifiable: false,
      }),
    );

    expect(html).not.toContain('Livrets pédagogiques');
  });
});

describe('LE RAYON REND UN HTML COMPLET SANS JAVASCRIPT', () => {
  it('le livret figure dans le HTML initial de la grille', async () => {
    const rayon = await listerCatalogue(
      null,
      catalogQuerySchema.parse({ langue: 'fr', type: 'livret_pedagogique' }),
    );

    const html = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'fr', entrees: rayon.entrees }),
    );

    expect(html).toContain(cobaye?.slug ?? '');
  });

  it('la carte d’un livret porte sa marque de support, celle d’un conte non', async () => {
    // Dans le catalogue MÊLÉ, un livret d'activités serait autrement
    // indiscernable d'un récit — même vignette, même titre, même ligne d'accès.
    const tout = await listerCatalogue(null, catalogQuerySchema.parse({ langue: 'fr' }));

    const livret = tout.entrees.filter((e) => e.type_document === 'livret_pedagogique');
    const contes = tout.entrees.filter((e) => e.type_document === 'conte');
    expect(livret.length).toBeGreaterThan(0);
    expect(contes.length).toBeGreaterThan(0);

    const htmlLivret = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'fr', entrees: livret }),
    );
    const htmlContes = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'fr', entrees: contes }),
    );

    expect(htmlLivret).toContain('Livret pédagogique');
    // Aucune marque sur un conte : l'étiquette signale l'écart, pas la norme.
    expect(htmlContes).not.toContain('Livret pédagogique');
  });
});
