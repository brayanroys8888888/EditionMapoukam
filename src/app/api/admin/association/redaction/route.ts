import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerPublicationAssociation } from '@/lib/admin/service';
import { fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * ÉCRIRE UNE PUBLICATION ASSOCIATIVE — l'écran de rédaction, en un appel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL APPEL, PARCE QUE L'ÉDITEUR N'A QU'UN BOUTON.                    │
 * │                                                                          │
 * │ `admin_enregistrer_publication` écrit le contenu ET sa version dans la   │
 * │ même transaction. Deux routes successives laisseraient, sur une coupure, │
 * │ un contenu dont le type a changé et dont le texte est resté l'ancien.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const blocSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('intertitre'), texte: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal('paragraphe'), texte: z.string().trim().min(1).max(4000) }),
  z.object({ type: z.literal('citation'), texte: z.string().trim().min(1).max(1000) }),
  z.object({
    type: z.literal('liste'),
    elements: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  }),
  z.object({
    type: z.literal('photo'),
    url: z.string().trim().min(1).max(500),
    legende: z.string().trim().max(300).optional(),
  }),
  /*
   * VIDÉO ET AUDIO — migration 0108, la même forme que la photo.
   *
   * Un média posé DANS le texte, entre deux paragraphes. À ne pas confondre
   * avec `video_url` plus bas, qui porte LA vidéo d'un replay : celle-là est
   * le contenu, celles-ci l'illustrent.
   */
  z.object({
    type: z.literal('video'),
    url: z.string().trim().min(1).max(500),
    legende: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal('audio'),
    url: z.string().trim().min(1).max(500),
    legende: z.string().trim().max(300).optional(),
  }),
]);

/**
 * COMBIEN DE VIDÉOS LE CORPS D'UN TYPE DONNÉ ACCEPTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN REPLAY PORTE UNE VIDÉO, ET IL LA PORTE DÉJÀ.                         │
 * │                                                                          │
 * │ C'est `video_url`, avec sa durée : celle que l'espace adhérent liste     │
 * │ sous « Replays » et dont la carte annonce les minutes. Le corps d'un     │
 * │ replay n'en reçoit donc aucune autre — la seconde ne serait annoncée     │
 * │ nulle part, et la durée affichée ne parlerait plus que de la première.   │
 * │                                                                          │
 * │ Les autres types n'ont pas de plafond : un récit de terrain peut porter  │
 * │ deux témoignages filmés sans cesser d'être un récit.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const VIDEOS_MAX: Record<string, number> = { replay: 0 };

const redactionSchema = z.object({
  id: z.uuid().nullish(),

  /*
   * LE SLUG NE SE MODIFIE PAS — cahier des charges §F10 bis, règle 1.
   *
   * Il est l'adresse publique du contenu, et les anciennes adresses du blog y
   * renvoient. Il n'est donc accepté qu'à la CRÉATION ; la fonction l'ignore
   * sur une mise à jour, et l'écran ne l'affiche pas.
   */
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(120),

  langue: z.enum(['fr', 'en']).default('fr'),
  type: z.enum(['compte_rendu', 'recit_terrain', 'fiche_pdf', 'replay']),
  categorie: z.enum([
    'vie-associative',
    'actions',
    'accompagnement',
    'pedagogie',
    'culture',
    'besoins-specifiques',
  ]),
  acces: z.enum(['libre', 'abonnes']),

  titre: z.string().trim().min(6).max(300),
  // 40 à 220 caractères — la borne du document, appliquée ici plutôt que
  // seulement comptée à l'écran : un chapeau trop court tient mal sur une
  // carte, un trop long y est tronqué sans qu'on sache où.
  chapeau: z.string().trim().min(40).max(220),
  texte_alternatif: z.string().trim().min(6).max(300),

  corps: z.array(blocSchema).max(200).default([]),

  publics: z
    .array(z.enum(['parents', 'enseignants', 'pro_handicap', 'donateurs', 'partenaires']))
    .min(1)
    .max(5),

  signe_par: z.string().trim().max(160).nullish(),
  image_url: z.string().trim().max(500).nullish(),
  video_url: z.string().trim().max(500).nullish(),
  video_minutes: z.int().min(1).max(600).nullish(),
  fichier_pdf: z.string().trim().max(500).nullish(),
  pdf_pages: z.int().min(1).max(2000).nullish(),
  evenement_id: z.uuid().nullish(),

  vedette: z.boolean().default(false),
  commentaires_ouverts: z.boolean().default(true),
  prevenir_adherents: z.boolean().default(false),

  programme_le: z.iso.datetime({ offset: true }).nullish(),
  publier: z.boolean().default(false),
});

export async function PUT(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, redactionSchema);
  if (!corps.ok) return corps.response;

  const d = corps.data;

  /*
   * LES EXIGENCES PROPRES AU TYPE SONT VÉRIFIÉES ICI.
   *
   * Elles ne vivent pas en base parce qu'elles ne protègent aucune donnée :
   * un replay sans lien n'est pas incohérent, il est INCOMPLET. C'est la même
   * nature que la liste de contrôle « Prête à publier ? » de l'écran, et
   * c'est pourquoi le refus ne s'applique qu'à la PUBLICATION — un brouillon
   * à qui il manque son lien reste un brouillon parfaitement valable.
   */
  if (d.publier || d.programme_le) {
    if (d.type === 'replay' && !d.video_url) {
      return fail(422, {
        code: 'publication_incomplete',
        message: 'Un replay ne se publie pas sans le lien de sa vidéo.',
      });
    }
    if (d.type === 'fiche_pdf' && !d.fichier_pdf) {
      return fail(422, {
        code: 'publication_incomplete',
        message: 'Une fiche ne se publie pas sans son fichier.',
      });
    }
    if (d.corps.filter((bloc) => bloc.type === 'paragraphe').length === 0) {
      return fail(422, {
        code: 'publication_incomplete',
        message: 'Un article se publie avec au moins un paragraphe.',
      });
    }
  }

  /*
   * CELLE-CI S'APPLIQUE AUSSI AU BROUILLON, et c'est la différence.
   *
   * Les trois refus ci-dessus disent « il manque quelque chose » : un
   * brouillon a le droit d'être incomplet. Celui-ci dit « il y en a de trop ».
   * Laisser passer trois vidéos dans un brouillon de replay ferait découvrir
   * le refus le jour de la publication, une fois l'article écrit.
   */
  const plafond = VIDEOS_MAX[d.type];
  if (plafond !== undefined && d.corps.filter((bloc) => bloc.type === 'video').length > plafond) {
    return fail(422, {
      code: 'replay_une_seule_video',
      message: 'Un replay ne porte qu’une vidéo : celle de son encadré.',
    });
  }

  const resultat = await enregistrerPublicationAssociation(garde.acteur.id, {
    id: d.id ?? null,
    slug: d.slug,
    langue: d.langue,
    type: d.type,
    categorie: d.categorie,
    acces: d.acces,
    titre: d.titre,
    chapeau: d.chapeau,
    texteAlternatif: d.texte_alternatif,
    corps: d.corps,
    publics: d.publics,
    signePar: d.signe_par ?? null,
    imageUrl: d.image_url ?? null,
    videoUrl: d.video_url ?? null,
    videoMinutes: d.video_minutes ?? null,
    fichierPdf: d.fichier_pdf ?? null,
    pdfPages: d.pdf_pages ?? null,
    evenementId: d.evenement_id ?? null,
    vedette: d.vedette,
    commentairesOuverts: d.commentaires_ouverts,
    prevenirAdherents: d.prevenir_adherents,
    programmeLe: d.programme_le ?? null,
    publier: d.publier,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ publication: resultat.donnees });
}
