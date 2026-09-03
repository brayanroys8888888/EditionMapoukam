import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LES AVIS DES LECTEURS — la première table où un visiteur écrit pour d'autres.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES TESTS PASSENT PAR LE CLIENT DU LECTEUR, JAMAIS PAR LA ROUTE.        │
 * │                                                                          │
 * │ Ce qu'on éprouve ici n'est pas ce que l'application accepte de faire,     │
 * │ mais ce que la BASE accepte qu'on lui demande. Un attaquant n'utilise     │
 * │ pas le formulaire : il prend le jeton que son navigateur porte déjà et    │
 * │ écrit sa propre requête. Une vérification faite par la connexion          │
 * │ `postgres`, qui est au-dessus de RLS, ne prouverait rien du tout.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS VERROUS DE NATURES DIFFÉRENTES, ET IL LES FAUT TOUS LES TROIS.    │
 * │                                                                          │
 * │  · la POLITIQUE dit quelles LIGNES : celles dont on est l'auteur, et      │
 * │    seulement si `access_for().can_read` est vrai à l'écriture ;           │
 * │  · le PRIVILÈGE dit quelles COLONNES : `statut` n'est ni dans le          │
 * │    `grant insert` ni dans le `grant update` accordés à `authenticated` ;  │
 * │  · le DÉCLENCHEUR renvoie en modération tout texte modifié.               │
 * │                                                                          │
 * │ Chacun est éprouvé séparément ci-dessous. Retirer l'un des trois laisse   │
 * │ les deux autres passer, et c'est exactement pourquoi ils coexistent.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let alice: TestUser;
let bob: TestUser;

/** Gratuit et publié : `can_read` est vrai pour n'importe quel compte. */
let livreOffert: string;
/** Vendu à l'unité, ni gratuit ni inclus : `can_read` est faux sans achat. */
let livrePayant: string;
/** Brouillon : il n'existe pas encore aux yeux du public. */
let livreBrouillon: string;

const TEXTE = 'Un conte que ma fille redemande tous les soirs, et que je relis sans lasser.';

async function identifiant(slug: string): Promise<string> {
  const ligne = await queryOne<{ id: string }>('select id from public.books where slug = $1', [
    slug,
  ]);
  if (!ligne) throw new Error(`Jeu de démonstration absent : lancer npm run db:reset (${slug}).`);
  return ligne.id;
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
  livreOffert = await identifiant('petit-baobab');
  livrePayant = await identifiant('la-tortue-et-le-lapin');
  livreBrouillon = await identifiant('le-lievre-et-la-tortue');
});

afterEach(async () => {
  // Un avis par lecteur et par titre : sans ce nettoyage, le deuxième test qui
  // écrit sur le titre offert échouerait sur l'unicité, et le message
  // parlerait d'une contrainte plutôt que du droit qu'on voulait éprouver.
  await query('delete from public.book_reviews where user_id = any($1)', [[alice.id, bob.id]]);
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  await closePool();
});

describe('qui peut écrire un avis', () => {
  it('refuse un visiteur non connecté', async () => {
    const { error } = await anonClient()
      .from('book_reviews')
      .insert({
        book_id: livreOffert,
        user_id: alice.id,
        note: 5,
        texte: TEXTE,
        auteur_affiche: 'Anonyme',
      });

    // `anon` n'a AUCUN privilège d'insertion sur cette table : le refus tombe
    // avant même qu'une politique soit évaluée.
    expect(error).not.toBeNull();
  });

  it('refuse un lecteur qui n’a pas accès au titre', async () => {
    const { error } = await alice.client.from('book_reviews').insert({
      book_id: livrePayant,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    /*
     * `la-tortue-et-le-lapin` se vend à l'unité et n'est ni offert ni inclus
     * dans l'abonnement. Alice n'a rien acheté : `access_for().can_read` est
     * faux, et la politique d'écriture s'arrête là.
     *
     * C'est la règle telle que l'éditeur l'a demandée — « achat vérifié » —
     * écrite avec l'unique implémentation du droit d'accès plutôt qu'avec une
     * copie qui, elle, aurait exclu les abonnés et les titres offerts.
     */
    expect(error).not.toBeNull();
  });

  it('accepte un lecteur sur un titre OFFERT, sans qu’il ait rien acheté', async () => {
    const { error } = await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    expect(error).toBeNull();
  });

  it('refuse d’écrire au nom d’un autre compte', async () => {
    const { error } = await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      // Le corps prétend que l'avis est de Bob. La politique compare
      // `user_id` à `auth.uid()`, qui vient du jeton et non du corps.
      user_id: bob.id,
      note: 1,
      texte: TEXTE,
      auteur_affiche: 'Bob, soi-disant',
    });

    expect(error).not.toBeNull();
  });

  it('refuse un avis sur un titre en brouillon', async () => {
    const { error } = await alice.client.from('book_reviews').insert({
      book_id: livreBrouillon,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    // Un avis accepté sur un brouillon trahirait l'existence d'un titre en
    // préparation — l'écriture est une fuite d'information autant que la
    // lecture.
    expect(error).not.toBeNull();
  });
});

describe('la publication n’est pas à la portée du client', () => {
  it('refuse de poser `statut` à la création', async () => {
    const { error } = await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
      statut: 'publie',
    });

    // `statut` n'est pas dans le `grant insert` : PostgreSQL refuse la colonne,
    // pas la valeur. Aucune politique n'a à connaître cette règle.
    expect(error).not.toBeNull();
  });

  it('crée l’avis EN ATTENTE quand le client ne dit rien', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 4,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    const ligne = await queryOne<{ statut: string; modere_le: string | null }>(
      'select statut, modere_le from public.book_reviews where user_id = $1',
      [alice.id],
    );
    expect(ligne?.statut).toBe('en_attente');
    expect(ligne?.modere_le).toBeNull();
  });

  it('refuse de se publier soi-même après coup', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 4,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    const { error } = await alice.client
      .from('book_reviews')
      .update({ statut: 'publie' })
      .eq('user_id', alice.id);

    expect(error).not.toBeNull();

    const ligne = await queryOne<{ statut: string }>(
      'select statut from public.book_reviews where user_id = $1',
      [alice.id],
    );
    expect(ligne?.statut).toBe('en_attente');
  });

  it('renvoie en modération un avis PUBLIÉ dont le texte change', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    // Publié par la modération, comme le ferait un administrateur.
    await query(
      `update public.book_reviews
          set statut = 'publie', modere_le = public.app_now()
        where user_id = $1`,
      [alice.id],
    );

    const { error } = await alice.client
      .from('book_reviews')
      .update({ texte: 'Finalement je voulais dire tout autre chose, et bien moins aimable.' })
      .eq('user_id', alice.id);
    expect(error).toBeNull();

    /*
     * Le tour de passe-passe évident : faire approuver un texte inoffensif,
     * puis le remplacer. Le déclencheur `book_reviews_remise_en_moderation`
     * le rend inopérant, et il le rend inopérant pour TOUTE écriture — y
     * compris celle qui ne passerait pas par la route.
     */
    const ligne = await queryOne<{ statut: string; modere_le: string | null }>(
      'select statut, modere_le from public.book_reviews where user_id = $1',
      [alice.id],
    );
    expect(ligne?.statut).toBe('en_attente');
    expect(ligne?.modere_le).toBeNull();
  });
});

describe('un lecteur A ne touche pas l’avis d’un lecteur B', () => {
  it('ne voit pas l’avis EN ATTENTE d’un autre', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    const { data } = await bob.client
      .from('book_reviews')
      .select('id, texte')
      .eq('book_id', livreOffert);

    // Bob lit la table sans erreur — les avis publiés sont publics — mais
    // celui d'Alice n'y est pas : il n'est pas publié, et Bob n'en est pas
    // l'auteur.
    expect(data ?? []).toEqual([]);
  });

  it('ne modifie pas l’avis d’un autre', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    await bob.client
      .from('book_reviews')
      .update({ texte: 'Un texte que Bob voudrait mettre dans la bouche d’Alice.' })
      .eq('user_id', alice.id);

    /*
     * PostgREST ne signale pas d'erreur : la politique de mise à jour rend la
     * ligne INVISIBLE à Bob, donc zéro ligne correspond, donc rien n'échoue.
     * C'est le texte en base qui fait foi, et c'est lui qu'on vérifie.
     */
    const ligne = await queryOne<{ texte: string }>(
      'select texte from public.book_reviews where user_id = $1',
      [alice.id],
    );
    expect(ligne?.texte).toBe(TEXTE);
  });

  it('ne supprime pas l’avis d’un autre', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });

    await bob.client.from('book_reviews').delete().eq('user_id', alice.id);

    const restant = await queryOne<{ nombre: string }>(
      'select count(*)::text as nombre from public.book_reviews where user_id = $1',
      [alice.id],
    );
    expect(restant?.nombre).toBe('1');
  });

  it('retire en revanche le sien, même publié', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 5,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });
    await query(
      `update public.book_reviews
          set statut = 'publie', modere_le = public.app_now()
        where user_id = $1`,
      [alice.id],
    );

    const { error } = await alice.client.from('book_reviews').delete().eq('user_id', alice.id);
    expect(error).toBeNull();

    const restant = await queryOne<{ nombre: string }>(
      'select count(*)::text as nombre from public.book_reviews where user_id = $1',
      [alice.id],
    );
    expect(restant?.nombre).toBe('0');
  });
});

describe('ce que le public voit, et ce qu’il ne voit pas', () => {
  it('ne rend pas `user_id` à un visiteur non connecté', async () => {
    const { error } = await anonClient().from('book_reviews').select('user_id').limit(1);

    /*
     * `anon` n'a pas le privilège SELECT sur `user_id`. Sans ce refus, deux
     * avis laissés sur deux titres différents suffiraient à recoller entre
     * elles les lectures d'une même personne à travers tout le catalogue.
     */
    expect(error).not.toBeNull();
  });

  it('ne rend jamais `modere_par` ni `motif_rejet` à un visiteur', async () => {
    const parModerateur = await anonClient().from('book_reviews').select('modere_par').limit(1);
    expect(parModerateur.error).not.toBeNull();

    const motif = await anonClient().from('book_reviews').select('motif_rejet').limit(1);
    expect(motif.error).not.toBeNull();
  });

  it('rend le motif de refus à son SEUL auteur', async () => {
    await alice.client.from('book_reviews').insert({
      book_id: livreOffert,
      user_id: alice.id,
      note: 2,
      texte: TEXTE,
      auteur_affiche: 'Alice',
    });
    await query(
      `update public.book_reviews
          set statut = 'rejete', modere_le = public.app_now(),
              motif_rejet = 'Ce texte cite une autre plateforme.'
        where user_id = $1`,
      [alice.id],
    );

    // Un refus muet est incompréhensible pour qui l'a reçu : l'auteur lit son
    // avis refusé et son motif, et peut donc corriger.
    const sien = await alice.client
      .from('book_reviews')
      .select('statut, motif_rejet')
      .eq('user_id', alice.id)
      .single();
    expect(sien.data?.statut).toBe('rejete');
    expect(sien.data?.motif_rejet).toBe('Ce texte cite une autre plateforme.');

    const autre = await bob.client
      .from('book_reviews')
      .select('statut, motif_rejet')
      .eq('book_id', livreOffert);
    expect(autre.data ?? []).toEqual([]);
  });
});
