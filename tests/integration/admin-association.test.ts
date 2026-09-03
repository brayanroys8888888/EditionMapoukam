import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  creerContenuAssociation,
  lireContenuAssociation,
  listerContenusAssociation,
  modifierContenuAssociation,
  poserVersionAssociation,
  publierContenuAssociation,
  supprimerContenuAssociation,
} from '@/lib/admin/service';
import { lireContenusAssociatifs } from '@/lib/association/service';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LA RÉDACTION DU CONTENU ASSOCIATIF — §3.6, §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI MANQUE POUR PUBLIER VIT EN BASE, COMME POUR UN CONTE.             │
 * │                                                                          │
 * │ `manques_pour_publication` empêche depuis longtemps de publier un titre   │
 * │ sans sa version française ; `admin_publier_contenu_association` fait la   │
 * │ même chose pour un texte de l'association, et pour la même raison : un    │
 * │ contenu publié sans corps afficherait une page blanche — derrière un      │
 * │ cadenas payant, ce qui est pire qu'une page blanche.                      │
 * │                                                                          │
 * │ Le contrôle est ÉPROUVÉ ICI parce qu'il vit dans la fonction. L'écran     │
 * │ n'en porte aucune copie, et c'est précisément ce qu'on veut vérifier :    │
 * │ le refus tient même quand personne ne passe par l'écran.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PREFIXE = 'test-assoc-admin';

let editeur: TestUser;
let intrus: TestUser;

let compteur = 0;

async function fabriquerContenu(): Promise<{ id: string; slug: string }> {
  const slug = `${PREFIXE}-${(compteur += 1)}`;

  const resultat = await creerContenuAssociation(editeur.id, {
    slug,
    categorie: 'vie-associative',
    titre: 'Brouillon de test',
    chapeau: 'Ce que l’on voit avant d’adhérer.',
  });
  expect(resultat.ok).toBe(true);

  const ligne = await queryOne<{ id: string }>(
    'select id from public.association_contents where slug = $1',
    [slug],
  );
  return { id: ligne!.id, slug };
}

/** Une version complète : un titre, et un corps qui n'est pas vide. */
async function poserVersionComplete(id: string, langue: 'fr' | 'en'): Promise<void> {
  const resultat = await poserVersionAssociation(editeur.id, id, {
    langue,
    titre: langue === 'fr' ? 'Titre publiable' : 'Publishable title',
    chapeau: 'Chapeau.',
    corps: [{ titre: 'Section', paragraphes: ['Un paragraphe.'] }],
  });
  expect(resultat.ok).toBe(true);
}

beforeAll(async () => {
  [editeur, intrus] = await Promise.all([createTestUser({ admin: true }), createTestUser()]);
});

afterAll(async () => {
  await query('delete from public.association_contents where slug like $1', [`${PREFIXE}-%`]);
  await deleteTestUser(editeur);
  await deleteTestUser(intrus);
  await closePool();
});

describe('un contenu naît en brouillon, avec sa version française', () => {
  it('n’est pas publié par sa seule création', async () => {
    const { id, slug } = await fabriquerContenu();

    const ligne = await queryOne<{ statut: string; publie_le: string | null }>(
      'select statut, publie_le from public.association_contents where id = $1',
      [id],
    );
    expect(ligne?.statut).toBe('brouillon');
    expect(ligne?.publie_le).toBeNull();

    // La version française est créée d'office : c'est celle sur laquelle
    // toutes les autres se replient, et sans elle un contenu s'afficherait
    // sous son slug.
    const versions = await query<{ langue: string }>(
      `select langue from public.association_content_translations
        where content_id = (select id from public.association_contents where slug = $1)`,
      [slug],
    );
    expect(versions.map((version) => version.langue)).toEqual(['fr']);
  });

  it('figure dans la liste d’administration, que la liste publique ignore', async () => {
    const { slug } = await fabriquerContenu();

    const resultat = await listerContenusAssociation();
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect((resultat.donnees as { slug: string }[]).map((ligne) => ligne.slug)).toContain(slug);

    const publics = await lireContenusAssociatifs(null);
    expect(publics.map((contenu) => contenu.slug)).not.toContain(slug);
  });
});

describe('la publication exige une version française COMPLÈTE', () => {
  it('refuse un contenu dont le corps français est vide', async () => {
    const { id } = await fabriquerContenu();

    // Le titre existe — il a été posé à la création. C'est le CORPS qui manque,
    // et un titre seul suffirait à faire croire le contenu prêt.
    const refus = await publierContenuAssociation(editeur.id, id, true);

    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');
  });

  it('refuse un contenu qui n’a qu’une version anglaise', async () => {
    const { id } = await fabriquerContenu();
    await poserVersionComplete(id, 'en');

    const refus = await publierContenuAssociation(editeur.id, id, true);

    // Le repli se fait sur le FRANÇAIS, jamais sur l'anglais ni sur le slug :
    // une version anglaise seule laisserait un lecteur français devant un
    // texte qu'il n'a pas demandé.
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');
  });

  it('accepte dès que le français est complet, et le contenu entre dans l’espace', async () => {
    const { id, slug } = await fabriquerContenu();
    await poserVersionComplete(id, 'fr');

    expect((await publierContenuAssociation(editeur.id, id, true)).ok).toBe(true);

    const publics = await lireContenusAssociatifs(null);
    const contenu = publics.find((ligne) => ligne.slug === slug);
    expect(contenu).toBeDefined();
    // Créé sans le dire, un contenu est RÉSERVÉ : le défaut protège, et
    // l'ouverture est un geste.
    expect(contenu?.acces).toBe('abonnes');
    expect(contenu?.peutLire).toBe(false);
  });

  it('retire le contenu de l’espace dès qu’il est dépublié', async () => {
    const { id, slug } = await fabriquerContenu();
    await poserVersionComplete(id, 'fr');
    await publierContenuAssociation(editeur.id, id, true);

    expect((await publierContenuAssociation(editeur.id, id, false)).ok).toBe(true);

    const publics = await lireContenusAssociatifs(null);
    expect(publics.map((contenu) => contenu.slug)).not.toContain(slug);

    // La date de publication, elle, est CONSERVÉE : dépublier n'est pas
    // annuler, et le contenu retrouvera sa place dans l'ordre chronologique
    // s'il est republié.
    const ligne = await queryOne<{ publie_le: string | null }>(
      'select publie_le from public.association_contents where id = $1',
      [id],
    );
    expect(ligne?.publie_le).not.toBeNull();
  });
});

describe('le slug n’est pas modifiable', () => {
  it('ne figure pas parmi les paramètres de la fonction de modification', async () => {
    /*
     * Le slug est l'adresse publique du contenu, et les anciennes adresses du
     * blog y renvoient en 308. Le renommer casserait des liens déjà partagés,
     * et rien dans l'écran ne le dirait. L'interdit le plus sûr est l'absence
     * du paramètre.
     */
    const parametres = await queryOne<{ arguments: string }>(
      `select pg_get_function_arguments(p.oid) as arguments
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'admin_modifier_contenu_association'`,
    );

    expect(parametres?.arguments).toBeTruthy();
    expect(parametres?.arguments).not.toContain('p_slug');
    expect(parametres?.arguments).not.toContain('p_statut');
  });

  it('laisse en revanche changer le rangement', async () => {
    const { id } = await fabriquerContenu();

    const resultat = await modifierContenuAssociation(editeur.id, id, {
      categorie: 'pedagogie',
      acces: 'libre',
      ordre: 5,
    });
    expect(resultat.ok).toBe(true);

    const ligne = await queryOne<{ categorie: string; acces: string; ordre: number }>(
      'select categorie, acces, ordre from public.association_contents where id = $1',
      [id],
    );
    expect(ligne?.categorie).toBe('pedagogie');
    expect(ligne?.acces).toBe('libre');
    expect(ligne?.ordre).toBe(5);
  });
});

describe('le corps ne se relit que par le chemin d’administration', () => {
  it('rend toutes les versions, corps compris, sans verdict d’accès', async () => {
    const { id } = await fabriquerContenu();
    await poserVersionComplete(id, 'fr');
    await poserVersionComplete(id, 'en');

    const resultat = await lireContenuAssociation(id);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const detail = resultat.donnees as {
      statut: string;
      versions: { langue: string; corps: unknown[] }[];
    };
    // Le contenu est un BROUILLON, réservé, et le corps sort quand même : un
    // rédacteur relit ce qu'il écrit. C'est pour cela que la garde
    // d'administration est obligatoire sur chaque route qui appelle ceci.
    expect(detail.statut).toBe('brouillon');
    expect(detail.versions.map((version) => version.langue)).toEqual(['en', 'fr']);
    expect(detail.versions.every((version) => version.corps.length > 0)).toBe(true);
  });
});

describe('la fonction SQL revérifie le rôle, même bien appelée', () => {
  it('refuse une publication demandée par un compte ordinaire', async () => {
    const { id } = await fabriquerContenu();
    await poserVersionComplete(id, 'fr');

    const refus = await publierContenuAssociation(intrus.id, id, true);

    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('refuse');

    const ligne = await queryOne<{ statut: string }>(
      'select statut from public.association_contents where id = $1',
      [id],
    );
    expect(ligne?.statut).toBe('brouillon');
  });

  it('refuse de même une suppression', async () => {
    const { id } = await fabriquerContenu();

    const refus = await supprimerContenuAssociation(intrus.id, id);
    expect(refus.ok).toBe(false);

    expect(
      await queryOne('select 1 from public.association_contents where id = $1', [id]),
    ).toBeDefined();
  });
});
