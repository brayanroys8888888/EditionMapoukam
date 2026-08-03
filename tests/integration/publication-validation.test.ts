import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { closePool, query, queryOne } from '../helpers/db';

/**
 * Validation de la publication — principe arbitré : ingestion permissive,
 * publication stricte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VÉRIFIÉ EN BASE, ET NON DANS LE FORMULAIRE.                             │
 * │                                                                          │
 * │ Ces tests écrivent en SQL DIRECT, sans passer par aucune route : c'est   │
 * │ exactement ce que ferait un script d'import, une console d'administration │
 * │ ou un correctif appliqué à la main. Un contrôle côté interface ne les    │
 * │ arrêterait pas.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'intérêt de cette validation n'est pas d'attraper des fautes de saisie :
 * c'est de rendre INATTEIGNABLES les états qui provoquaient des bogues en aval
 * — un titre facturé dans une devise que l'acheteur n'attendait pas, une fiche
 * publiée au nom de « À renseigner ».
 */
const creees: string[] = [];

/** Crée un brouillon complet, que chaque test dégradera à sa façon. */
async function brouillon(
  champs: {
    auteur?: string | null;
    origine?: string | null;
    ageMin?: number | null;
    ageMax?: number | null;
    disponibleAchat?: boolean;
    /** `null` explicite pour éprouver le manque de région. */
    region?: string | null;
  } = {},
): Promise<string> {
  const slug = `test-publication-${randomUUID().slice(0, 8)}`;
  const ligne = await queryOne<{ id: string }>(
    `insert into public.books
       (slug, auteur, origine_culturelle, age_min, age_max, disponible_achat, region, statut)
     values ($1, $2, $3, $4, $5, $6, $7::public.region_conte, 'brouillon')
     returning id`,
    [
      slug,
      champs.auteur === undefined ? 'Tradition orale' : champs.auteur,
      // NOTE — cette valeur portait une apostrophe TYPOGRAPHIQUE quand la même
      // région s'écrivait avec une apostrophe droite dans `supabase/seed.sql`.
      // Deux chaînes pour une seule région, et rien ne le signalait : c'est le
      // défaut qui a motivé `books.region`. Le texte libre subsiste ici parce
      // qu'il est désormais SANS CONSÉQUENCE — plus personne ne le compare.
      champs.origine === undefined ? 'Afrique de l’Ouest' : champs.origine,
      champs.ageMin === undefined ? 3 : champs.ageMin,
      champs.ageMax === undefined ? 7 : champs.ageMax,
      champs.disponibleAchat ?? false,
      champs.region === undefined ? 'afrique_ouest' : champs.region,
    ],
  );
  creees.push(ligne!.id);
  return ligne!.id;
}

/** Pose un prix dans une zone. */
async function prix(bookId: string, zone: 'international' | 'afrique'): Promise<void> {
  await query(
    `insert into public.book_prices (book_id, zone, montant, devise)
     values ($1, $2::public.price_zone, $3, $4)`,
    [bookId, zone, zone === 'afrique' ? 1500 : 499, zone === 'afrique' ? 'XAF' : 'EUR'],
  );
}

/** Tente la publication. Rend le message d'erreur, ou `null` si elle a réussi. */
async function publier(bookId: string): Promise<string | null> {
  try {
    await query(
      `update public.books set statut = 'publie', publie_le = public.app_now() where id = $1`,
      [bookId],
    );
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message : String(erreur);
  }
}

afterEach(async () => {
  for (const id of creees.splice(0)) {
    await query(`delete from public.book_prices where book_id = $1`, [id]);
    await query(`delete from public.books where id = $1`, [id]);
  }
});

afterAll(async () => {
  await closePool();
});

describe('un titre complet se publie', () => {
  it('accepte un titre non vendu à l’unité', async () => {
    const id = await brouillon({ disponibleAchat: false });

    expect(await publier(id)).toBeNull();
  });

  it('accepte un titre vendu avec un prix dans chaque zone active', async () => {
    const id = await brouillon({ disponibleAchat: true });
    await prix(id, 'international');
    await prix(id, 'afrique');

    expect(await publier(id)).toBeNull();
  });
});

describe('auteur', () => {
  it('REFUSE « À renseigner », la valeur que pose l’ingestion', async () => {
    // C'est le cas qui motive toute cette validation : la chaîne d'ingestion
    // crée sciemment des fiches incomplètes, et rien n'empêchait jusqu'ici de
    // les publier telles quelles.
    const id = await brouillon({ auteur: 'À renseigner' });

    expect(await publier(id)).toMatch(/auteur/);
  });

  it('refuse la variante sans accent', async () => {
    const id = await brouillon({ auteur: 'A renseigner' });

    expect(await publier(id)).toMatch(/auteur/);
  });

  it('refuse quelle que soit la casse', async () => {
    const id = await brouillon({ auteur: 'à RENSEIGNER' });

    expect(await publier(id)).toMatch(/auteur/);
  });

  it('refuse une chaîne vide ou blanche', async () => {
    const id = await brouillon({ auteur: '   ' });

    expect(await publier(id)).toMatch(/auteur/);
  });

  it('accepte un auteur réel', async () => {
    const id = await brouillon({ auteur: 'Tradition akan' });

    expect(await publier(id)).toBeNull();
  });
});

describe('origine culturelle', () => {
  it('est exigée — c’est l’élément différenciant du positionnement', async () => {
    // §4.1 F3 : « Origine culturelle du conte (pays / peuple / tradition) —
    // élément différenciant du positionnement ».
    const id = await brouillon({ origine: null });

    expect(await publier(id)).toMatch(/origine_culturelle/);
  });

  it('refuse une chaîne blanche', async () => {
    const id = await brouillon({ origine: '  ' });

    expect(await publier(id)).toMatch(/origine_culturelle/);
  });

  it('reste du TEXTE LIBRE — le corpus écrit « Bassin du Congo », pas une région', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CE TEST DÉFEND LE CHOIX DES DEUX CHAMPS.                           │
    // │                                                                    │
    // │ La tentation, en fermant `region`, serait de fermer aussi celle-ci. │
    // │ Le corpus réel écrit « Ghana », « Côte d'Ivoire », « Bassin du      │
    // │ Congo », « Corne de l'Afrique » : aucune énumération à cinq valeurs │
    // │ ne les porte, et c'est la finesse éditoriale du positionnement.     │
    // └────────────────────────────────────────────────────────────────────┘
    const id = await brouillon({ origine: 'Conte akan — Ghana' });

    expect(await publier(id)).toBeNull();
  });
});

describe('région', () => {
  it('est exigée — sans elle le titre s’afficherait sans couleur', async () => {
    // Le pendant FERMÉ de l'origine culturelle. Elle ne sert qu'à choisir une
    // couleur, et c'est pourquoi elle peut être close quand l'autre ne le
    // peut pas.
    const id = await brouillon({ region: null });

    expect(await publier(id)).toMatch(/region/);
  });

  it('accepte les cinq valeurs, et rien d’autre', async () => {
    // Garde d'effectif : une énumération vide ferait passer la boucle sans
    // rien éprouver.
    const regions = ['afrique_ouest', 'sahel', 'afrique_centrale', 'afrique_australe', 'afrique_est'];
    expect(regions.length).toBe(5);

    for (const region of regions) {
      const id = await brouillon({ region });
      expect(await publier(id), `région refusée : ${region}`).toBeNull();
    }
  });

  it('rejette une valeur hors énumération — la base refuse, pas le code', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRE-TEST QUI PROUVE QUE LA FERMETURE EST RÉELLE.             │
    // │                                                                    │
    // │ Sans lui, une colonne `text` sans contrainte passerait les deux     │
    // │ tests ci-dessus à l'identique — et l'apostrophe reviendrait par la  │
    // │ fenêtre.                                                            │
    // └────────────────────────────────────────────────────────────────────┘
    await expect(brouillon({ region: 'afrique_du_nord' })).rejects.toThrow();
  });
});

describe('tranche d’âge', () => {
  it('est exigée — le catalogue filtre dessus', async () => {
    const id = await brouillon({ ageMin: null, ageMax: null });

    expect(await publier(id)).toMatch(/age/);
  });

  it('exige les DEUX bornes', async () => {
    // Une borne seule rendrait le filtre du catalogue silencieusement partiel.
    const id = await brouillon({ ageMin: 3, ageMax: null });

    expect(await publier(id)).toMatch(/age/);
  });
});

describe('prix dans chaque zone active', () => {
  it('REFUSE un titre vendu sans prix du tout', async () => {
    const id = await brouillon({ disponibleAchat: true });

    const erreur = await publier(id);
    expect(erreur).toMatch(/prix_international/);
    expect(erreur).toMatch(/prix_afrique/);
  });

  it('REFUSE un titre vendu à qui il manque UNE zone', async () => {
    // C'est le cas qui produisait le bogue de l'étape 8 : un panier dont la
    // devise basculait sans explication. Il est désormais inatteignable.
    const id = await brouillon({ disponibleAchat: true });
    await prix(id, 'international');

    const erreur = await publier(id);
    expect(erreur).toMatch(/prix_afrique/);
    expect(erreur).not.toMatch(/prix_international/);
  });

  it('NOMME la zone manquante', async () => {
    // Dire « prix manquant » sans préciser laquelle obligerait l'éditeur à
    // chercher.
    const id = await brouillon({ disponibleAchat: true });
    await prix(id, 'afrique');

    expect(await publier(id)).toMatch(/prix_international/);
  });

  it('n’exige AUCUN prix d’un titre non vendu à l’unité', async () => {
    // `inclus_abonnement` et `disponible_achat` sont indépendants (§3.2) : un
    // titre lisible par abonnement seul n'a pas de prix unitaire.
    const id = await brouillon({ disponibleAchat: false });

    expect(await publier(id)).toBeNull();
  });

  it('ignore une zone désactivée', async () => {
    // Ouvrir une zone est une décision commerciale ; la préparer sans l'imposer
    // aux titres déjà publiés doit rester possible.
    await query(`update public.active_price_zones set active = false where zone = 'afrique'`);
    try {
      const id = await brouillon({ disponibleAchat: true });
      await prix(id, 'international');

      expect(await publier(id)).toBeNull();
    } finally {
      await query(`update public.active_price_zones set active = true where zone = 'afrique'`);
    }
  });
});

describe('portée de la contrainte', () => {
  it('ne mord QU’AU passage à publié', async () => {
    // Un titre déjà publié dont on modifie un champ sans rapport n'est pas
    // revalidé : la contrainte porte sur la TRANSITION. Sans cela, retirer un
    // prix échouerait avec un message parlant de publication, ce qui égarerait
    // plus qu'il n'aiderait.
    const id = await brouillon({ disponibleAchat: true });
    await prix(id, 'international');
    await prix(id, 'afrique');
    await publier(id);

    await query(`delete from public.book_prices where book_id = $1 and zone = 'afrique'`, [id]);
    const modification = await query(
      `update public.books set themes = array['test'] where id = $1 returning id`,
      [id],
    );

    expect(modification).toHaveLength(1);
  });

  it('laisse un brouillon incomplet exister — l’ingestion en dépend', async () => {
    // L'ingestion est PERMISSIVE : elle crée des fiches à compléter. Les
    // refuser à l'écriture obligerait l'éditeur à tout saisir avant même de
    // voir le rendu.
    const id = await brouillon({ auteur: 'À renseigner', origine: null, ageMin: null });

    const existe = await queryOne<{ statut: string }>(
      `select statut from public.books where id = $1`,
      [id],
    );
    expect(existe?.statut).toBe('brouillon');
  });

  it('laisse archiver un titre publié', async () => {
    const id = await brouillon({ disponibleAchat: false });
    await publier(id);

    const archive = await query(
      `update public.books set statut = 'archive' where id = $1 returning id`,
      [id],
    );
    expect(archive).toHaveLength(1);
  });
});

describe('la liste des manques est exposée au back-office', () => {
  it('rend un tableau vide pour un titre publiable', async () => {
    const id = await brouillon({ disponibleAchat: false });

    const manques = await queryOne<{ m: string[] }>(
      `select public.manques_pour_publication($1) as m`,
      [id],
    );
    expect(manques?.m).toEqual([]);
  });

  it('énumère tous les manques d’un coup, pas le premier seulement', async () => {
    // L'éditeur doit pouvoir tout corriger en une passe, au lieu de découvrir
    // les manques un par un à chaque tentative.
    const id = await brouillon({
      auteur: 'À renseigner',
      origine: null,
      ageMin: null,
      ageMax: null,
      disponibleAchat: true,
    });

    const manques = await queryOne<{ m: string[] }>(
      `select public.manques_pour_publication($1) as m`,
      [id],
    );

    expect(manques?.m).toEqual([
      'age',
      'auteur',
      'origine_culturelle',
      'prix_afrique',
      'prix_international',
    ]);
  });

  it('dit exactement la même chose que le déclencheur', async () => {
    // Deux implémentations de la même règle finiraient par diverger, et
    // l'éditeur verrait une liste de manques différente du motif de refus.
    const id = await brouillon({ disponibleAchat: true });
    await prix(id, 'international');

    const manques = await queryOne<{ m: string[] }>(
      `select public.manques_pour_publication($1) as m`,
      [id],
    );
    const refus = await publier(id);

    expect(manques?.m).toEqual(['prix_afrique']);
    expect(refus).toContain('prix_afrique');
  });
});

describe('le jeu de démonstration respecte la règle', () => {
  it('ne contient aucun titre publié qui serait aujourd’hui irrecevable', async () => {
    // Un jeu de données qui violerait la règle qu'il sert à éprouver donnerait
    // une base de tests fausse — et masquerait le défaut le jour où il compte.
    const fautifs = await query<{ slug: string; manques: string[] }>(
      `select b.slug, public.manques_pour_publication(b.id) as manques
         from public.books b
        where b.statut = 'publie'
          and array_length(public.manques_pour_publication(b.id), 1) > 0`,
    );

    expect(fautifs.map((f) => `${f.slug} : ${f.manques.join(', ')}`)).toEqual([]);
  });
});
