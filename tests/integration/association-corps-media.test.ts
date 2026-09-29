import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';
import { PUT as redactionRoute } from '@/app/api/admin/association/redaction/route';
import { lireContenuAssociatif } from '@/lib/association/service';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LA VIDÉO ET LE SON DANS LE CORPS — migration 0108.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX RÈGLES, DEUX ÉTAGES, ET LA DIFFÉRENCE EST LE SUJET DU FICHIER.     │
 * │                                                                          │
 * │ La FORME d'un bloc vit en base : `corps_associatif_valide` refuse un     │
 * │ type inconnu ou un média sans adresse, parce qu'un bloc mal formé ne se  │
 * │ rend nulle part et que son contenu serait perdu sans bruit.              │
 * │                                                                          │
 * │ Le NOMBRE de vidéos d'un replay vit dans la route : il croise le type,   │
 * │ porté par `association_contents`, et le corps, porté par                 │
 * │ `association_content_translations`. Une contrainte `check` ne sait pas   │
 * │ lire deux tables.                                                        │
 * │                                                                          │
 * │ Les deux sont éprouvées ici, chacune à son étage. Les éprouver toutes    │
 * │ deux par l'écran ne prouverait rien : l'écran peut être contourné.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PREFIXE = 'test-media-assoc';

let editeur: TestUser;
let compteur = 0;

function slugNeuf(): string {
  compteur += 1;
  return `${PREFIXE}-${String(compteur)}`;
}

/** Le corps minimal qu'une publication doit porter pour être publiable. */
const PARAGRAPHE = {
  type: 'paragraphe',
  texte: 'Nous sommes arrivés le mardi matin, et la salle était déjà pleine de familles.',
};

/** Une charge complète pour la route, à laquelle on ne change que le nécessaire. */
function charge(partiel: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: slugNeuf(),
    langue: 'fr',
    type: 'recit_terrain',
    categorie: 'actions',
    acces: 'abonnes',
    titre: 'Atelier de Douala, trois jours durant',
    chapeau:
      'Trois jours d’atelier avec seize familles, et ce que nous y avons appris du kit pédagogique.',
    texte_alternatif: 'Des enfants autour d’une table, un livret ouvert',
    corps: [PARAGRAPHE],
    publics: ['parents'],
    ...partiel,
  };
}

async function appeler(corps: Record<string, unknown>): Promise<Response> {
  return redactionRoute(
    new Request('http://localhost:3000/api/admin/association/redaction', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${editeur.accessToken}`,
      },
      body: JSON.stringify(corps),
    }),
  );
}

beforeAll(async () => {
  editeur = await createTestUser({ admin: true });
});

beforeEach(() => {
  // Les routes d'administration sont contingentées : sans cette remise à zéro,
  // le dixième appel du fichier serait refusé pour une raison sans rapport.
  reinitialiserQuotaAdmin();
});

afterAll(async () => {
  /*
   * ⚠️ Un contenu laissé en base compterait dans le jeu de démonstration, et
   * ferait tomber des fichiers qui ne parlent pas de lui. Les traductions
   * partent avec, par la cascade de `content_id`.
   */
  await query('delete from public.association_contents where slug like $1', [`${PREFIXE}-%`]);
  await deleteTestUser(editeur);
  await closePool();
});

describe('la forme des blocs, vérifiée EN BASE', () => {
  it('accepte une vidéo et un son, et les REND à la lecture', async () => {
    const slug = slugNeuf();

    const reponse = await appeler(
      charge({
        slug,
        corps: [
          PARAGRAPHE,
          { type: 'video', url: 'https://exemple.test/atelier.mp4', legende: 'Trois minutes' },
          { type: 'audio', url: 'https://exemple.test/awa.mp3' },
        ],
        publier: true,
      }),
    );
    expect(reponse.status).toBe(200);

    /*
     * Relu par le CHEMIN PUBLIC, celui d'un lecteur : `association_contenu`
     * puis `enBlocs`. Relire la table directement prouverait que la base a
     * accepté l'écriture, pas que l'article peut être rendu — et c'est le
     * second qui manquait, le jour où un type n'était connu que d'un côté.
     */
    const contenu = await lireContenuAssociatif(editeur.id, slug);

    expect(contenu?.blocs).toEqual([
      PARAGRAPHE,
      { type: 'video', url: 'https://exemple.test/atelier.mp4', legende: 'Trois minutes' },
      { type: 'audio', url: 'https://exemple.test/awa.mp3' },
    ]);
  });

  it('REFUSE un média sans adresse — la contrainte, pas l’écran', async () => {
    /*
     * Écriture directe, volontairement : la route et l'écran refusent déjà
     * une adresse vide, et c'est la CONTRAINTE qu'on éprouve ici. Elle est le
     * seul refus qui tienne devant une reprise de données ou une main sur
     * psql, et un bloc sans adresse laisserait un cadre vide que le lecteur
     * prendrait pour un chargement qui n'est jamais arrivé.
     */
    const contenu = await queryOne<{ id: string }>(
      `insert into public.association_contents (slug, categorie, acces)
       values ($1, 'actions', 'abonnes') returning id`,
      [slugNeuf()],
    );

    await expect(
      query(
        `insert into public.association_content_translations (content_id, langue, titre, chapeau, corps)
         values ($1, 'fr', 'Titre', 'Chapeau', $2::jsonb)`,
        [contenu?.id, JSON.stringify([{ type: 'video', url: '   ' }])],
      ),
    ).rejects.toThrow(/association_corps_en_blocs/);
  });

  it('REFUSE toujours un type de bloc inconnu — la 0108 élargit, elle n’ouvre pas', async () => {
    const contenu = await queryOne<{ id: string }>(
      `insert into public.association_contents (slug, categorie, acces)
       values ($1, 'actions', 'abonnes') returning id`,
      [slugNeuf()],
    );

    await expect(
      query(
        `insert into public.association_content_translations (content_id, langue, titre, chapeau, corps)
         values ($1, 'fr', 'Titre', 'Chapeau', $2::jsonb)`,
        [contenu?.id, JSON.stringify([{ type: 'carrousel', url: 'https://exemple.test/x' }])],
      ),
    ).rejects.toThrow(/association_corps_en_blocs/);
  });
});

describe('un média déposé est SIGNÉ au moment de servir', () => {
  it('rend une URL signée pour un chemin de stockage, et laisse une adresse collée intacte', async () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ LA SIGNATURE SUIT LE DROIT, ELLE NE L'OUVRE PAS.                 │
     * │                                                                  │
     * │ `association_contenu` rend `corps` à `null` quand `can_read` est  │
     * │ faux : aucune signature n'est donc émise pour qui n'a pas le     │
     * │ droit de lire. Ce test vérifie l'autre sens — que celui qui a le │
     * │ droit reçoit bien une adresse SERVABLE, et non le chemin brut     │
     * │ d'un bucket privé, qui afficherait un lecteur mort.               │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const slug = slugNeuf();

    const reponse = await appeler(
      charge({
        slug,
        acces: 'libre',
        corps: [
          PARAGRAPHE,
          // Un chemin de stockage, tel que la route de dépôt le rend.
          { type: 'video', url: 'association-fichiers/inexistant.mp4' },
          { type: 'audio', url: 'https://exemple.test/colle-a-la-main.mp3' },
        ],
        publier: true,
      }),
    );
    expect(reponse.status).toBe(200);

    const contenu = await lireContenuAssociatif(editeur.id, slug);
    const urls = (contenu?.blocs ?? []).map((bloc) =>
      'url' in bloc ? bloc.url : '',
    );

    // L'adresse collée à la main repart telle quelle : les contenus déjà en
    // base en portent, et les couper viderait l'écran.
    expect(urls).toContain('https://exemple.test/colle-a-la-main.mp3');

    /*
     * Le chemin de stockage, lui, ne ressort JAMAIS tel quel. L'objet n'existe
     * pas ici — la signature échoue donc, et le bloc est ÉCARTÉ plutôt que
     * rendu avec son chemin brut : un `<video src="association-fichiers/…">`
     * afficherait un lecteur mort, et le chemin serait dans la source de la
     * page.
     */
    expect(urls).not.toContain('association-fichiers/inexistant.mp4');
  });
});

describe('un replay ne porte qu’une vidéo, et il la porte déjà', () => {
  it('REFUSE une vidéo dans le corps d’un replay', async () => {
    const reponse = await appeler(
      charge({
        type: 'replay',
        video_url: 'https://exemple.test/seance.mp4',
        video_minutes: 42,
        corps: [PARAGRAPHE, { type: 'video', url: 'https://exemple.test/bonus.mp4' }],
      }),
    );

    expect(reponse.status).toBe(422);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('replay_une_seule_video');
  });

  it('refuse AUSSI dans un brouillon — le refus ne dit pas « il manque », il dit « il y en a trop »', async () => {
    /*
     * Les trois refus voisins ne portent que sur la publication : un brouillon
     * a le droit d'être incomplet. Celui-ci s'applique dès le brouillon, sans
     * quoi l'éditeur écrirait tout son article avant de découvrir, le jour de
     * la publication, que sa vidéo est de trop.
     */
    const reponse = await appeler(
      charge({
        type: 'replay',
        corps: [PARAGRAPHE, { type: 'video', url: 'https://exemple.test/bonus.mp4' }],
        publier: false,
      }),
    );

    expect(reponse.status).toBe(422);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('replay_une_seule_video');
  });

  it('LAISSE PASSER un son dans le corps d’un replay — la règle porte sur la vidéo seule', async () => {
    const reponse = await appeler(
      charge({
        type: 'replay',
        video_url: 'https://exemple.test/seance.mp4',
        corps: [PARAGRAPHE, { type: 'audio', url: 'https://exemple.test/questions.mp3' }],
        publier: true,
      }),
    );

    expect(reponse.status).toBe(200);
  });

  it('LAISSE PASSER deux vidéos sur un récit de terrain', async () => {
    // Le plafond est propre au replay : un récit peut porter deux témoignages
    // filmés sans cesser d'être un récit.
    const reponse = await appeler(
      charge({
        corps: [
          PARAGRAPHE,
          { type: 'video', url: 'https://exemple.test/awa.mp4' },
          { type: 'video', url: 'https://exemple.test/boubacar.mp4' },
        ],
        publier: true,
      }),
    );

    expect(reponse.status).toBe(200);
  });
});
