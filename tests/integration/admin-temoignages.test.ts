import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  enregistrerTemoignage,
  lireTemoignage,
  listerTemoignages,
  publierTemoignage,
  supprimerTemoignage,
} from '@/lib/admin/service';
import { lireTemoignages } from '@/lib/site/temoignages';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LES TÉMOIGNAGES DU SITE — migration 0073.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TÉMOIGNAGE N'EST PAS UN AVIS.                                        │
 * │                                                                          │
 * │ L'avis parle d'UN TITRE, il est écrit par un lecteur depuis son compte,   │
 * │ et il passe par une file de modération parce qu'il vient de quelqu'un     │
 * │ d'autre. Le témoignage parle du SITE, il est saisi par l'éditeur, et on   │
 * │ ne modère pas son propre texte. Le seul contrôle est celui de la          │
 * │ publication : sans texte français, l'accueil afficherait une signature    │
 * │ sous un guillemet vide.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES TESTS N'EFFACENT QUE LES LEURS.                                     │
 * │                                                                          │
 * │ Les trois témoignages de l'accueil sont du CONTENU, repris mot pour mot   │
 * │ de `src/i18n/fr.json` par la migration 0073 — pas un jeu de              │
 * │ démonstration. Un `delete` sans clause viderait la page d'accueil de la   │
 * │ base locale, et rien ne le dirait avant de l'ouvrir.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PREFIXE = 'Témoin de test';

let editeur: TestUser;
let intrus: TestUser;
let compteur = 0;

/** Un témoignage vierge : ni texte, ni traduction. Il n'est pas publiable. */
async function fabriquerTemoignage(
  versions: { langue: string; texte: string; role?: string | null }[] = [],
): Promise<string> {
  const auteur = `${PREFIXE} ${(compteur += 1)}`;

  const resultat = await enregistrerTemoignage(editeur.id, { auteur, ordre: 900, versions });
  expect(resultat.ok).toBe(true);

  const ligne = await queryOne<{ id: string }>(
    'select id from public.testimonials where auteur = $1',
    [auteur],
  );
  return ligne!.id;
}

beforeAll(async () => {
  [editeur, intrus] = await Promise.all([createTestUser({ admin: true }), createTestUser()]);
});

afterAll(async () => {
  await query('delete from public.testimonials where auteur like $1', [`${PREFIXE} %`]);
  await deleteTestUser(editeur);
  await deleteTestUser(intrus);
  await closePool();
});

describe('un témoignage naît en brouillon', () => {
  it('n’est pas publié par sa seule création', async () => {
    const id = await fabriquerTemoignage([{ langue: 'fr', texte: 'Un vrai bonheur du soir.' }]);

    const ligne = await queryOne<{ statut: string }>(
      'select statut from public.testimonials where id = $1',
      [id],
    );
    expect(ligne?.statut).toBe('brouillon');
  });

  it('figure dans la liste d’administration, que l’accueil ignore', async () => {
    const id = await fabriquerTemoignage([{ langue: 'fr', texte: 'Un vrai bonheur du soir.' }]);

    const liste = await listerTemoignages();
    expect(liste.ok).toBe(true);
    if (!liste.ok) return;
    expect((liste.donnees as { id: string }[]).map((ligne) => ligne.id)).toContain(id);

    const vitrine = await lireTemoignages('fr', 50);
    expect(vitrine.map((temoignage) => temoignage.id)).not.toContain(id);
  });
});

describe('la publication exige un texte français', () => {
  it('refuse un témoignage sans aucune version', async () => {
    const id = await fabriquerTemoignage();

    const refus = await publierTemoignage(editeur.id, id, true);

    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');
  });

  it('refuse un témoignage qui n’a que sa version anglaise', async () => {
    const id = await fabriquerTemoignage([{ langue: 'en', texte: 'A joy every evening.' }]);

    // Le repli se fait sur le FRANÇAIS, jamais l'inverse : une version anglaise
    // seule laisserait un visiteur français devant une citation qu'il n'a pas
    // demandée.
    const refus = await publierTemoignage(editeur.id, id, true);

    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');
  });

  it('accepte dès que le français existe, et le témoignage entre à l’accueil', async () => {
    const id = await fabriquerTemoignage([
      { langue: 'fr', texte: 'Mes enfants réclament un conte chaque soir.', role: 'Maman' },
    ]);

    expect((await publierTemoignage(editeur.id, id, true)).ok).toBe(true);

    const vitrine = await lireTemoignages('fr', 50);
    const temoignage = vitrine.find((ligne) => ligne.id === id);
    expect(temoignage).toBeDefined();
    expect(temoignage?.texte).toBe('Mes enfants réclament un conte chaque soir.');
    expect(temoignage?.role).toBe('Maman');
  });

  it('replie l’accueil anglais sur le français quand la traduction manque', async () => {
    const id = await fabriquerTemoignage([
      { langue: 'fr', texte: 'Mes enfants réclament un conte chaque soir.' },
    ]);
    await publierTemoignage(editeur.id, id, true);

    const vitrine = await lireTemoignages('en', 50);
    const temoignage = vitrine.find((ligne) => ligne.id === id);

    // Le repli est fait EN SQL, par la fonction `temoignages` : un témoignage
    // traduit à moitié s'affiche dans la langue qui existe plutôt que de
    // disparaître de la page anglaise.
    expect(temoignage?.texte).toBe('Mes enfants réclament un conte chaque soir.');
  });

  it('retire le témoignage de l’accueil dès qu’il est dépublié', async () => {
    const id = await fabriquerTemoignage([{ langue: 'fr', texte: 'Un vrai bonheur du soir.' }]);
    await publierTemoignage(editeur.id, id, true);

    expect((await publierTemoignage(editeur.id, id, false)).ok).toBe(true);

    const vitrine = await lireTemoignages('fr', 50);
    expect(vitrine.map((ligne) => ligne.id)).not.toContain(id);
  });
});

describe('les versions arrivent en bloc, et le texte vide supprime', () => {
  it('laisse intacte une langue ABSENTE du tableau', async () => {
    const id = await fabriquerTemoignage([
      { langue: 'fr', texte: 'Un vrai bonheur du soir.' },
      { langue: 'en', texte: 'A joy every evening.' },
    ]);

    // Seul le français est envoyé : l'anglais n'est pas mentionné, donc pas
    // touché. C'est ce qui permet à un écran de ne poser qu'une langue.
    await enregistrerTemoignage(editeur.id, {
      id,
      auteur: `${PREFIXE} ${compteur}`,
      versions: [{ langue: 'fr', texte: 'Un bonheur, tous les soirs.' }],
    });

    const detail = await lireTemoignage(id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const versions = (detail.donnees as { versions: { langue: string; texte: string }[] })
      .versions;

    expect(versions.map((version) => version.langue).sort()).toEqual(['en', 'fr']);
    expect(versions.find((version) => version.langue === 'en')?.texte).toBe(
      'A joy every evening.',
    );
  });

  it('SUPPRIME une langue dont le texte est vide', async () => {
    const id = await fabriquerTemoignage([
      { langue: 'fr', texte: 'Un vrai bonheur du soir.' },
      { langue: 'en', texte: 'A joy every evening.' },
    ]);

    await enregistrerTemoignage(editeur.id, {
      id,
      auteur: `${PREFIXE} ${compteur}`,
      versions: [
        { langue: 'fr', texte: 'Un vrai bonheur du soir.' },
        { langue: 'en', texte: '' },
      ],
    });

    /*
     * C'est le geste par lequel l'éditeur retire une traduction : vider la
     * zone, enregistrer. Un second bouton « supprimer la version anglaise »
     * dirait la même chose deux fois — et l'écran prévient, mot pour mot,
     * dans l'aide du champ.
     */
    const detail = await lireTemoignage(id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const versions = (detail.donnees as { versions: { langue: string }[] }).versions;
    expect(versions.map((version) => version.langue)).toEqual(['fr']);
  });

  it('dépublie de fait en retirant le français d’un témoignage publié', async () => {
    const id = await fabriquerTemoignage([{ langue: 'fr', texte: 'Un vrai bonheur du soir.' }]);
    await publierTemoignage(editeur.id, id, true);

    await enregistrerTemoignage(editeur.id, {
      id,
      auteur: `${PREFIXE} ${compteur}`,
      versions: [{ langue: 'fr', texte: '' }],
    });

    /*
     * Le statut reste `publie` — retirer un texte n'est pas dépublier, et la
     * fonction ne fait pas ce qu'on ne lui a pas demandé. Mais la vitrine ne
     * rend que les témoignages qui ONT un texte : la page d'accueil n'affiche
     * donc jamais de guillemet vide, quel que soit l'ordre des gestes.
     */
    const vitrine = await lireTemoignages('fr', 50);
    expect(vitrine.map((ligne) => ligne.id)).not.toContain(id);
  });
});

describe('le détail rend ce que la liste ne rend pas', () => {
  it('porte les DEUX langues et leurs rôles, là où la liste n’a que le français', async () => {
    const id = await fabriquerTemoignage([
      { langue: 'fr', texte: 'Un vrai bonheur du soir.', role: 'Maman de deux enfants' },
      { langue: 'en', texte: 'A joy every evening.', role: 'Mother of two' },
    ]);

    const liste = await listerTemoignages();
    expect(liste.ok).toBe(true);
    if (!liste.ok) return;
    const ligne = (liste.donnees as { id: string; texte_fr: string; langues: string[] }[]).find(
      (entree) => entree.id === id,
    );
    expect(ligne?.texte_fr).toBe('Un vrai bonheur du soir.');
    expect(ligne?.langues).toEqual(['en', 'fr']);

    /*
     * La liste ne rend PAS le texte anglais ni les rôles. C'est pour cela que
     * l'écran d'édition lit chaque témoignage en détail : un formulaire bâti
     * sur la ligne de liste enverrait un anglais vide, et le texte vide
     * supprime la version.
     */
    const detail = await lireTemoignage(id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const versions = (
      detail.donnees as { versions: { langue: string; texte: string; role: string | null }[] }
    ).versions;
    expect(versions.find((version) => version.langue === 'en')?.texte).toBe(
      'A joy every evening.',
    );
    expect(versions.find((version) => version.langue === 'fr')?.role).toBe(
      'Maman de deux enfants',
    );
  });

  it('rend `null` pour un témoignage qui n’existe pas', async () => {
    const detail = await lireTemoignage('00000000-0000-4000-8000-000000000000');
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.donnees).toBeNull();
  });
});

describe('supprimer, et le rôle revérifié en base', () => {
  it('emporte les versions linguistiques avec le témoignage', async () => {
    const id = await fabriquerTemoignage([
      { langue: 'fr', texte: 'Un vrai bonheur du soir.' },
      { langue: 'en', texte: 'A joy every evening.' },
    ]);

    expect((await supprimerTemoignage(editeur.id, id)).ok).toBe(true);

    const versions = await queryOne<{ nombre: string }>(
      'select count(*)::text as nombre from public.testimonial_translations where testimonial_id = $1',
      [id],
    );
    // `on delete cascade` : une version orpheline n'aurait aucun sens, et
    // resterait invisible de tous les écrans.
    expect(versions?.nombre).toBe('0');
  });

  it('refuse un non-administrateur, même appelé par le rôle de service', async () => {
    const id = await fabriquerTemoignage([{ langue: 'fr', texte: 'Un vrai bonheur du soir.' }]);

    const refus = await publierTemoignage(intrus.id, id, true);

    // `service_role` contourne RLS par construction : le seul rempart est
    // `admin_poser_acteur`, qui relit le rôle dans `public.users`.
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('refuse');
  });
});
