'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * ACTIONS D'ÉDITION DU CATALOGUE — les seules de l'administration qui MUTENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES APPELLENT LES ROUTES. ELLES NE TOUCHENT PAS LA BASE.              │
 * │                                                                          │
 * │ L'administration passe par `service_role` : RLS est contourné par         │
 * │ construction, et le seul rempart qui subsiste est le code. Une action     │
 * │ serveur qui écrirait directement le ferait avec un acteur nul — le        │
 * │ journal d'audit cesserait de dire QUI a agi, et une modification de       │
 * │ catalogue deviendrait indiscernable d'une écriture système.               │
 * │                                                                          │
 * │ Chaque route appelée ici prend son acteur de `gardeAdmin`, jamais du      │
 * │ corps de la requête, et délègue à une fonction `admin_*` qui revérifie    │
 * │ le rôle EN BASE. Trois contrôles, dont aucun ne dépend de cet écran.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN REFUS RAMÈNE À L'ÉCRAN AVEC SON MOTIF, JAMAIS SUR UNE PAGE D'ERREUR. │
 * │                                                                          │
 * │ Un éditeur qui vient de remplir un formulaire et qui reçoit « quelque    │
 * │ chose n'a pas fonctionné » recommence à l'aveugle. Le code de refus       │
 * │ voyage dans l'URL et l'écran le traduit — `regle_metier` sur une          │
 * │ publication dit exactement ce qui manque au titre.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

async function enteteCookie(): Promise<string> {
  const magasin = await cookies();
  return magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
}

async function appeler(
  chemin: string,
  methode: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  charge: unknown,
): Promise<{ statut: number; corps: Record<string, unknown> | null }> {
  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: methode,
    headers: {
      'content-type': 'application/json',
      cookie: await enteteCookie(),
    },
    body: JSON.stringify(charge),
    cache: 'no-store',
  });

  return {
    statut: reponse.status,
    corps: (await reponse.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

function codeErreur(corps: Record<string, unknown> | null): string {
  const erreur = corps?.['erreur'];
  if (erreur && typeof erreur === 'object' && 'code' in erreur) {
    const code = (erreur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'erreur_interne';
}

/** Nombre lu d'un formulaire, ou `undefined` si le champ est laissé vide. */
function nombre(donnees: FormData, nom: string): number | undefined {
  const valeur = donnees.get(nom);
  if (typeof valeur !== 'string' || valeur.trim() === '') return undefined;
  const converti = Number(valeur);
  return Number.isFinite(converti) ? converti : undefined;
}

/** Texte lu d'un formulaire, ou `undefined` si le champ est laissé vide. */
function texte(donnees: FormData, nom: string): string | undefined {
  const valeur = donnees.get(nom);
  if (typeof valeur !== 'string' || valeur.trim() === '') return undefined;
  return valeur.trim();
}

/**
 * Texte lu d'un formulaire, la chaîne VIDE conservée.
 *
 * `texte()` replie le vide sur `undefined`, ce qui vaut « ne touche pas à ce
 * champ » — le bon comportement pour les champs métier. Le résumé d'une version
 * demande l'inverse : le vide y veut dire « efface-le », et le replier rendrait
 * un résumé impossible à retirer une fois écrit.
 */
function texteOuVide(donnees: FormData, nom: string): string {
  const valeur = donnees.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/**
 * Une case à cocher NON cochée n'est pas envoyée par le navigateur.
 *
 * C'est le piège classique des formulaires à interrupteurs : sans champ témoin,
 * décocher « disponible à l'achat » n'enverrait rien, et le serveur laisserait
 * la valeur inchangée. L'écran pose donc un `<input type="hidden">` de même nom
 * juste AVANT chaque case ; le navigateur envoie les deux quand elle est
 * cochée, et le dernier gagne.
 */
function interrupteur(donnees: FormData, nom: string): boolean {
  const valeurs = donnees.getAll(nom);
  return valeurs[valeurs.length - 1] === 'oui';
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dépose un PDF et ouvre le brouillon qu'il produit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FICHIER EST RETRANSMIS TEL QUEL, SANS TOUCHER LE DISQUE.             │
 * │                                                                          │
 * │ `FormData` est repassé directement à `fetch`, qui refait le corps         │
 * │ multipart et pose lui-même sa frontière — d'où l'absence de              │
 * │ `content-type` ici : l'écrire à la main donnerait une frontière fausse    │
 * │ et un corps illisible.                                                    │
 * │                                                                          │
 * │ Le nom du fichier fourni par le client ne touche jamais le système de     │
 * │ fichiers : c'est la route d'ingestion qui écrit dans un dossier           │
 * │ temporaire, sous un nom fixe.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function deposerConte(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const base = `/${langue}/admin/contes`;

  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}/api/admin/books/ingest`, {
    method: 'POST',
    headers: { cookie: await enteteCookie() },
    body: donnees,
    cache: 'no-store',
  });

  const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;

  if (reponse.status !== 201) {
    redirect(`${base}/nouveau?erreur=${codeErreur(corps)}`);
  }

  const identifiant = corps?.['livre_id'];
  if (typeof identifiant !== 'string') redirect(`${base}/nouveau?erreur=erreur_interne`);

  revalidatePath(base);

  // Droit sur l'écran d'édition du brouillon : l'ingestion produit un titre
  // auquel il manque toujours quelque chose — auteur, origine, âge, prix — et
  // le déposer sans mener à ces champs laisserait un brouillon inerte.
  redirect(`${base}/${identifiant}?depose=1`);
}

/** Modifie les champs métier d'un titre. */
export async function modifierConte(
  langueBrute: string,
  livreId: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/contes/${livreId}`;

  const reponse = await appeler('/api/admin/books', 'PATCH', {
    id: livreId,
    // Les champs vides sont ABSENTS et non nuls : `admin_modifier_livre`
    // interprète un nul comme « ne touche pas à ce champ », et envoyer `null`
    // pour un champ laissé vide effacerait une valeur qu'on ne voulait pas
    // toucher.
    ...(texte(donnees, 'auteur') !== undefined ? { auteur: texte(donnees, 'auteur') } : {}),
    ...(texte(donnees, 'illustrateur') !== undefined
      ? { illustrateur: texte(donnees, 'illustrateur') }
      : {}),
    ...(texte(donnees, 'origine_culturelle') !== undefined
      ? { origine_culturelle: texte(donnees, 'origine_culturelle') }
      : {}),
    /*
     * LA RÉGION, ET POURQUOI ELLE N'EST PAS DÉDUITE DE L'ORIGINE.
     *
     * Elle est exigée à la publication depuis la migration 0044, et rien ne
     * permettait de la poser avant la 0057 : un conte déposé restait
     * impubliable, avec un manque nommé `region` qu'aucun champ ne satisfaisait.
     *
     * `region_depuis_origine` sait la deviner d'après l'origine culturelle,
     * mais son commentaire est formel — « amorçage et reprise de données
     * UNIQUEMENT ». Une déduction se tromperait sans le dire, sur le champ même
     * qui décide du filtre du catalogue.
     */
    ...(texte(donnees, 'region') !== undefined ? { region: texte(donnees, 'region') } : {}),
    ...(nombre(donnees, 'age_min') !== undefined ? { age_min: nombre(donnees, 'age_min') } : {}),
    ...(nombre(donnees, 'age_max') !== undefined ? { age_max: nombre(donnees, 'age_max') } : {}),
    ...(nombre(donnees, 'nb_pages_extrait') !== undefined
      ? { nb_pages_extrait: nombre(donnees, 'nb_pages_extrait') }
      : {}),
    // Les trois leviers d'accès sont TOUJOURS envoyés : ce sont des booléens,
    // et « absent » y voudrait dire « inchangé », ce qui rendrait impossible de
    // décocher quoi que ce soit.
    gratuit: interrupteur(donnees, 'gratuit'),
    inclus_abonnement: interrupteur(donnees, 'inclus_abonnement'),
    disponible_achat: interrupteur(donnees, 'disponible_achat'),
  });

  if (reponse.statut !== 200) redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}`);

  revalidatePath(ecran);
  revalidatePath(`/${langue}/admin/contes`);
  redirect(`${ecran}?enregistre=champs`);
}

/**
 * Fixe le prix d'un titre dans une zone.
 *
 * Une zone à la fois, comme la route : chaque grille a sa devise, et un
 * formulaire qui poserait les deux d'un coup aurait fait écrire deux montants
 * dont un seul aurait été relu avant d'être validé.
 */
export async function definirPrixConte(
  langueBrute: string,
  livreId: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/contes/${livreId}`;

  const reponse = await appeler(`/api/admin/books/${livreId}/prices`, 'PUT', {
    zone: donnees.get('zone'),
    montant: nombre(donnees, 'montant'),
    devise: donnees.get('devise'),
  });

  if (reponse.statut !== 200) redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}`);

  revalidatePath(ecran);
  redirect(`${ecran}?enregistre=prix`);
}

/**
 * Publie, remet en brouillon ou archive.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE REFUS DE PUBLICATION EST UNE INFORMATION, PAS UNE PANNE.             │
 * │                                                                          │
 * │ Le déclencheur de la base refuse un titre incomplet. L'écran d'édition   │
 * │ affiche déjà ce qui manque — la MÊME liste, calculée par la MÊME         │
 * │ fonction — si bien qu'un refus renvoie sur un écran qui l'explique       │
 * │ champ par champ.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function changerPublicationConte(
  langueBrute: string,
  livreId: string,
  statut: 'brouillon' | 'publie' | 'archive',
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/contes/${livreId}`;

  const reponse = await appeler('/api/admin/books/publication', 'PUT', {
    book_ids: [livreId],
    statut,
  });

  if (reponse.statut !== 200) redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}`);

  revalidatePath(ecran);
  revalidatePath(`/${langue}/admin/contes`);
  redirect(`${ecran}?enregistre=publication`);
}

/**
 * Corrige le titre et le résumé d'UNE version linguistique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FORMULAIRE PAR VERSION, ET NON UN SEUL POUR TOUTES.                  │
 * │                                                                          │
 * │ `admin_modifier_traduction` écrit une ligne à la fois. Un formulaire      │
 * │ unique aurait donc dû boucler côté serveur, décider quoi faire quand la   │
 * │ troisième version échoue après que les deux premières sont écrites, et    │
 * │ inventer une transaction que la base n'offre pas — exactement la raison   │
 * │ pour laquelle les champs métier, les prix et la publication sont déjà     │
 * │ trois formulaires distincts.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function modifierVersionConte(
  langueBrute: string,
  livreId: string,
  traductionId: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/contes/${livreId}`;

  const reponse = await appeler(`/api/admin/books/${livreId}/translations`, 'PATCH', {
    translation_id: traductionId,
    // Le titre n'est envoyé que RENSEIGNÉ : la base refuse un titre vide, et
    // l'omettre revient à ne pas y toucher. Le champ est `required` dans
    // l'écran, si bien qu'un navigateur ordinaire ne l'envoie jamais vide.
    ...(texte(donnees, 'titre') !== undefined ? { titre: texte(donnees, 'titre') } : {}),
    /*
     * Le résumé est TOUJOURS envoyé, chaîne vide comprise.
     *
     * C'est la seule manière de l'EFFACER : la route accepte la chaîne vide, et
     * `admin_modifier_traduction` la traduit en nul. L'omettre, comme on omet
     * un champ métier laissé vide, rendrait un résumé impossible à retirer une
     * fois écrit.
     */
    resume: texteOuVide(donnees, 'resume'),
  });

  if (reponse.statut !== 200) redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}`);

  revalidatePath(ecran);
  revalidatePath(`/${langue}/admin/contes`);
  redirect(`${ecran}?enregistre=version`);
}

/**
 * Ajoute une version linguistique à un titre EXISTANT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `livre_id` EST TOUTE LA DIFFÉRENCE AVEC UN DÉPÔT ORDINAIRE.             │
 * │                                                                          │
 * │ §5.5 : un livre est une entité parente, avec N déclinaisons              │
 * │ linguistiques, et un droit d'accès porte sur le LIVRE. Sans ce champ, la │
 * │ chaîne d'ingestion créait un SECOND titre au slug suffixé — donc un      │
 * │ second prix, une seconde publication, et un acheteur du français sans    │
 * │ aucun droit sur l'anglais qu'il croyait avoir acheté.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le fichier est repassé tel quel à `fetch`, sans `content-type` posé à la
 * main : c'est lui qui refait le corps multipart et sa frontière.
 */
export async function ajouterVersionConte(
  langueBrute: string,
  livreId: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/contes/${livreId}`;

  // Posé ici et non dans un champ caché de l'écran : le rattachement ne se
  // discute pas, et un champ caché est un champ qu'un client peut changer.
  donnees.set('livre_id', livreId);

  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}/api/admin/books/ingest`, {
    method: 'POST',
    headers: { cookie: await enteteCookie() },
    body: donnees,
    cache: 'no-store',
  });

  const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;

  if (reponse.status !== 201) redirect(`${ecran}?erreur=${codeErreur(corps)}`);

  revalidatePath(ecran);
  revalidatePath(`/${langue}/admin/contes`);
  redirect(`${ecran}?enregistre=version_ajoutee`);
}

/**
 * Supprime un BROUILLON, et lui seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN CACHE LE BOUTON. LA BASE, ELLE, REFUSE.                         │
 * │                                                                          │
 * │ Le bouton n'apparaît que sur un brouillon, mais ce n'est qu'une           │
 * │ politesse : `admin_supprimer_livre` revérifie le statut ET l'absence de   │
 * │ droits rattachés. Un titre publié ou archivé est référencé en cascade     │
 * │ par `entitlements` et `order_items` — le supprimer effacerait en silence  │
 * │ des droits payés et des pièces comptables.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le motif est obligatoire, et ce n'est pas une politesse non plus : c'est la
 * contrepartie d'un geste irréversible, pour que le journal d'audit puisse dire
 * six mois plus tard pourquoi un titre a disparu.
 */
export async function supprimerConte(
  langueBrute: string,
  livreId: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/contes/${livreId}`;
  const liste = `/${langue}/admin/contes`;

  const reponse = await appeler(`/api/admin/books/${livreId}`, 'DELETE', {
    motif: texte(donnees, 'motif'),
  });

  if (reponse.statut !== 200) redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}`);

  revalidatePath(liste);
  // Retour à la LISTE, et non sur l'écran d'un titre qui n'existe plus : le
  // relire répondrait « introuvable », c'est-à-dire un 404 après une opération
  // réussie.
  redirect(`${liste}?supprime=1`);
}
