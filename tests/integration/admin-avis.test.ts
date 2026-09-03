import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { listerAvis, modererAvis, supprimerAvis } from '@/lib/admin/service';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LA FILE DE MODÉRATION — migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI EST LA RÈGLE, PAS L'ÉCRAN.                       │
 * │                                                                          │
 * │ `admin_moderer_avis` refuse un rejet sans motif, refuse de remettre un    │
 * │ avis en attente, et efface le motif dès qu'un avis repasse en `publie`.   │
 * │ Ces trois refus vivent dans la fonction : ils tiennent donc même quand    │
 * │ personne ne passe par le formulaire, ce qui est précisément le cas d'un   │
 * │ appel fabriqué à la main.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les avis d'essai sont écrits par le rôle de service, et non par le client du
 * lecteur : c'est le droit d'ÉCRITURE d'un lecteur qui est éprouvé dans
 * `tests/security/avis.test.ts`, et le rejouer ici ne prouverait rien de plus
 * tout en rendant ces tests dépendants d'`access_for`.
 */
let editeur: TestUser;
let lecteur: TestUser;
let livreId: string;
let autreLivreId: string;

const TEXTE = 'Une lecture du soir qui tient toute la famille en haleine jusqu’à la fin.';

async function fabriquerAvis(livre: string = livreId): Promise<string> {
  const ligne = await queryOne<{ id: string }>(
    `insert into public.book_reviews (book_id, user_id, note, texte, auteur_affiche)
     values ($1, $2, 5, $3, 'Un parent') returning id`,
    [livre, lecteur.id, TEXTE],
  );
  return ligne!.id;
}

beforeAll(async () => {
  [editeur, lecteur] = await Promise.all([createTestUser({ admin: true }), createTestUser()]);

  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'petit-baobab'`,
  );
  const autre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'la-riviere-qui-parlait'`,
  );
  if (!livre || !autre) throw new Error('Jeu de démonstration absent : lancer npm run db:reset.');
  livreId = livre.id;
  autreLivreId = autre.id;
});

afterEach(async () => {
  await query('delete from public.book_reviews where user_id = $1', [lecteur.id]);
});

afterAll(async () => {
  await deleteTestUser(editeur);
  await deleteTestUser(lecteur);
  await closePool();
});

describe('la file rend ce que le public ne voit pas', () => {
  it('montre les avis EN ATTENTE, et l’adresse de leur auteur', async () => {
    const id = await fabriquerAvis();

    const resultat = await listerAvis({ statut: 'en_attente' });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const ligne = (resultat.donnees as { id: string; auteur_email: string | null }[]).find(
      (avis) => avis.id === id,
    );
    expect(ligne).toBeDefined();

    /*
     * L'adresse est la seule donnée de cet écran que le public ne voit nulle
     * part. Elle sert à reconnaître un même compte derrière deux avis — c'est
     * ce qui distingue une opinion d'une campagne.
     */
    expect(ligne?.auteur_email).toBe(lecteur.email);
  });

  it('filtre par titre', async () => {
    const ici = await fabriquerAvis(livreId);

    const resultat = await listerAvis({ book: autreLivreId });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect((resultat.donnees as { id: string }[]).map((avis) => avis.id)).not.toContain(ici);
  });

  it('rend le titre français du livre, et non son seul identifiant', async () => {
    const id = await fabriquerAvis();

    const resultat = await listerAvis({});
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const ligne = (resultat.donnees as { id: string; livre_titre: string }[]).find(
      (avis) => avis.id === id,
    );
    // Un modérateur décide en lisant un avis À CÔTÉ de son titre : « ce conte
    // est pour les tout-petits » n'a pas le même poids selon le livre visé.
    expect(ligne?.livre_titre).toBeTruthy();
    expect(ligne?.livre_titre).not.toBe(ligne?.id);
  });
});

describe('publier, refuser', () => {
  it('publie, et le rend visible du public', async () => {
    const id = await fabriquerAvis();

    const decision = await modererAvis(editeur.id, id, 'publie');
    expect(decision.ok).toBe(true);

    const ligne = await queryOne<{
      statut: string;
      modere_le: string | null;
      modere_par: string | null;
    }>('select statut, modere_le, modere_par from public.book_reviews where id = $1', [id]);

    expect(ligne?.statut).toBe('publie');
    expect(ligne?.modere_le).not.toBeNull();
    // L'acteur est POSÉ EN BASE par `admin_poser_acteur`, pas transmis par le
    // corps de la requête : c'est ce qui rend le journal digne de foi.
    expect(ligne?.modere_par).toBe(editeur.id);
  });

  it('refuse un rejet SANS motif', async () => {
    const id = await fabriquerAvis();

    const refus = await modererAvis(editeur.id, id, 'rejete');

    // Un refus muet est incompréhensible pour qui l'a reçu, et il revient tel
    // quel. La fonction l'exige donc, plutôt que le formulaire.
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');

    const ligne = await queryOne<{ statut: string }>(
      'select statut from public.book_reviews where id = $1',
      [id],
    );
    expect(ligne?.statut).toBe('en_attente');
  });

  it('refuse avec son motif, que son auteur pourra lire', async () => {
    const id = await fabriquerAvis();

    const decision = await modererAvis(
      editeur.id,
      id,
      'rejete',
      'Ce texte donne l’adresse d’une autre boutique.',
    );
    expect(decision.ok).toBe(true);

    const ligne = await queryOne<{ statut: string; motif_rejet: string | null }>(
      'select statut, motif_rejet from public.book_reviews where id = $1',
      [id],
    );
    expect(ligne?.statut).toBe('rejete');
    expect(ligne?.motif_rejet).toBe('Ce texte donne l’adresse d’une autre boutique.');
  });

  it('efface le motif quand l’avis finit par être publié', async () => {
    const id = await fabriquerAvis();
    await modererAvis(editeur.id, id, 'rejete', 'Trop court pour être utile.');

    expect((await modererAvis(editeur.id, id, 'publie')).ok).toBe(true);

    const ligne = await queryOne<{ motif_rejet: string | null }>(
      'select motif_rejet from public.book_reviews where id = $1',
      [id],
    );
    // Un ancien refus ne reste pas collé à un texte finalement accepté : la
    // contrainte `book_reviews_motif_reserve_au_rejet` le refuserait, et la
    // fonction n'attend pas qu'elle proteste.
    expect(ligne?.motif_rejet).toBeNull();
  });

  it('refuse de remettre un avis EN ATTENTE', async () => {
    const id = await fabriquerAvis();
    await modererAvis(editeur.id, id, 'publie');

    const refus = await modererAvis(editeur.id, id, 'en_attente');

    /*
     * Modérer un avis, c'est le publier ou le refuser. « Le reposer sur la
     * pile » laisserait un avis déjà lu revenir indéfiniment dans la file,
     * sans que rien dise pourquoi. La route ne propose donc que deux
     * décisions — et la base refuse la troisième même sans la route.
     */
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');
  });

  it('rend introuvable un avis qui n’existe pas', async () => {
    const refus = await modererAvis(
      editeur.id,
      '00000000-0000-4000-8000-000000000000',
      'publie',
    );
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('introuvable');
  });
});

describe('supprimer', () => {
  it('efface l’avis, et rend à son auteur le droit d’en écrire un autre', async () => {
    const id = await fabriquerAvis();

    expect((await supprimerAvis(editeur.id, id)).ok).toBe(true);

    const restant = await queryOne<{ nombre: string }>(
      'select count(*)::text as nombre from public.book_reviews where id = $1',
      [id],
    );
    expect(restant?.nombre).toBe('0');

    // L'unicité `(book_id, user_id)` interdisait un second avis tant que le
    // premier existait. C'est la différence de fond entre effacer et refuser.
    const nouveau = await fabriquerAvis();
    expect(nouveau).toBeTruthy();
  });

  it('n’échoue pas sur un avis déjà supprimé', async () => {
    const id = await fabriquerAvis();
    await supprimerAvis(editeur.id, id);

    // Deux clics sur le même bouton, ou deux onglets ouverts : le second geste
    // ne doit pas afficher une erreur pour un résultat déjà obtenu.
    expect((await supprimerAvis(editeur.id, id)).ok).toBe(true);
  });
});

describe('le rôle est revérifié EN BASE', () => {
  it('refuse un non-administrateur, même appelé par le rôle de service', async () => {
    const id = await fabriquerAvis();

    /*
     * `src/lib/admin/service.ts` passe par `service_role`, donc RLS est
     * contourné par construction. Le seul rempart est `admin_poser_acteur`,
     * qui relit le rôle dans `public.users`. Un identifiant de lecteur glissé
     * à la place de celui de l'éditeur doit être refusé ici, et non plus haut.
     */
    const refus = await modererAvis(lecteur.id, id, 'publie');

    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('refuse');

    const ligne = await queryOne<{ statut: string }>(
      'select statut from public.book_reviews where id = $1',
      [id],
    );
    expect(ligne?.statut).toBe('en_attente');
  });
});
