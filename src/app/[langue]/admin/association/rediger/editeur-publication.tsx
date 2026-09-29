'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { LANGUES_INTERFACE, traduire, type CleTraduction, type LangueInterface } from '@/i18n';
/*
 * IMPORTS DIRECTS, ET NON PAR LE TONNEAU `@/components/admin`.
 *
 * Ce fichier est un composant CLIENT. Le tonneau exporte aussi `GabaritAdmin`,
 * qui tire `session.ts`, qui tire le client de service Supabase — donc la clé
 * `service_role` dans le paquet du navigateur. Next refuse, et il a raison :
 * l'erreur de compilation est la seule chose qui sépare un barillet pratique
 * d'une clé de service publiée.
 *
 * Viser les deux pièces dont cet écran a besoin coûte deux lignes et ferme
 * la question.
 */
import { BoutonSoumission } from '@/components/admin/BoutonSoumission';
import styles from '@/components/admin/admin.module.css';
import { ChampFichier } from './champ-fichier';

/**
 * L'ÉDITEUR D'UNE PUBLICATION ASSOCIATIVE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SEUL ÉCRAN CLIENT DU BACK-OFFICE, ET POURQUOI IL L'EST.              │
 * │                                                                          │
 * │ Tout le reste de l'administration est rendu par le serveur, sans un      │
 * │ octet de JavaScript : des liens pour l'état, des `<form>` pour les       │
 * │ gestes. Cet écran ne peut pas l'être. Ajouter un bloc, le déplacer, le   │
 * │ supprimer, compter les mots et valider six points À LA FRAPPE sont des   │
 * │ changements d'état qui n'ont pas d'adresse : les faire passer par le     │
 * │ serveur demanderait un aller-retour par touche.                          │
 * │                                                                          │
 * │ Ce qui ne change pas : le serveur reste le seul à ÉCRIRE. L'état du      │
 * │ navigateur part en un seul champ caché, et c'est la route qui valide,    │
 * │ puis la base qui tranche. La liste de contrôle ci-dessous n'AUTORISE     │
 * │ rien — elle explique d'avance ce que le serveur refuserait.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type Bloc =
  | { type: 'intertitre'; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'liste'; elements: string[] }
  | { type: 'citation'; texte: string }
  | { type: 'photo'; url: string; legende?: string }
  | { type: 'video'; url: string; legende?: string }
  | { type: 'audio'; url: string; legende?: string };

const TYPES = ['compte_rendu', 'recit_terrain', 'fiche_pdf', 'replay'] as const;
const PUBLICS = ['parents', 'enseignants', 'pro_handicap', 'donateurs', 'partenaires'] as const;
const BLOCS = [
  'intertitre',
  'paragraphe',
  'liste',
  'citation',
  'photo',
  'video',
  'audio',
] as const;

/** Les trois blocs qui portent une adresse et une légende, et rien d'autre. */
const MEDIAS = ['photo', 'video', 'audio'] as const;

/*
 * `acces` EST UNE ÉTIQUETTE, PAS UN DROIT : c'est
 * `access_for_association` qui la confronte à l'abonnement du lecteur, et le
 * privilège absent sur la colonne `corps` qui empêche de la contourner. Deux
 * valeurs, et la base porte la même énumération.
 */
const ACCES = ['libre', 'abonnes'] as const;

/** Les trois sorties possibles de l'enregistrement. */
const DIFFUSIONS = ['maintenant', 'programme', 'brouillon'] as const;
type Diffusion = (typeof DIFFUSIONS)[number];

function estMedia(type: Bloc['type']): type is (typeof MEDIAS)[number] {
  return (MEDIAS as readonly string[]).includes(type);
}

/**
 * COMBIEN DE VIDÉOS LE CORPS ACCEPTE, SELON LE TYPE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN REPLAY PORTE UNE VIDÉO, ET IL LA PORTE DÉJÀ.                         │
 * │                                                                          │
 * │ C'est celle de l'encadré « La vidéo » — `video_url`, avec sa durée —,    │
 * │ celle que l'espace adhérent liste sous « Replays » et dont la carte      │
 * │ annonce les minutes. Le corps d'un replay n'en reçoit donc aucune        │
 * │ autre : la seconde ne serait annoncée nulle part, et la durée affichée   │
 * │ ne parlerait plus que de la première.                                    │
 * │                                                                          │
 * │ Les autres types n'ont pas de plafond : un récit de terrain peut porter  │
 * │ deux témoignages filmés sans cesser d'être un récit.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE PLAFOND N'AUTORISE RIEN — IL ANNONCE CE QUE LE SERVEUR REFUSERAIT.   │
 * │                                                                          │
 * │ La règle vit dans `/api/admin/association/redaction`, avec les autres    │
 * │ exigences de type. Elle est reprise ici au même titre que la liste de    │
 * │ contrôle « Prête à publier ? » : pour que l'éditeur le sache avant       │
 * │ d'écrire, et non après avoir tout enregistré.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const VIDEOS_MAX: Partial<Record<(typeof TYPES)[number], number>> = { replay: 0 };

export interface PublicationEditable {
  id: string | null;
  slug: string;
  type: (typeof TYPES)[number];
  categorie: string;
  acces: 'libre' | 'abonnes';
  titre: string;
  chapeau: string;
  texteAlternatif: string;
  imageUrl: string;
  corps: Bloc[];
  publics: string[];
  signePar: string;
  videoUrl: string;
  videoMinutes: string;
  fichierPdf: string;
  pdfPages: string;
  evenementId: string;
  vedette: boolean;
  commentairesOuverts: boolean;
  prevenirAdherents: boolean;
  programmeLe: string;
  publie: boolean;
  /**
   * Chemin de stockage → adresse d'aperçu, pour les médias DÉJÀ enregistrés.
   *
   * Calculée par la page serveur, qui seule peut signer. Sans elle, rouvrir
   * une publication montrerait ses propres fichiers comme cassés.
   */
  apercus: Record<string, string>;
}

/** Un bloc neuf, vide, du type demandé. */
function blocVide(type: (typeof BLOCS)[number]): Bloc {
  if (type === 'liste') return { type: 'liste', elements: [] };
  if (estMedia(type)) return { type, url: '' };
  return { type, texte: '' };
}

/** Le texte porté par un bloc, quel que soit son type. Sert au décompte. */
function texteDuBloc(bloc: Bloc): string {
  if (bloc.type === 'liste') return bloc.elements.join(' ');
  // Trois égalités plutôt qu'un prédicat : c'est la comparaison littérale du
  // discriminant qui restreint `bloc`, et donc qui donne accès à `legende`.
  if (bloc.type === 'photo' || bloc.type === 'video' || bloc.type === 'audio') {
    return bloc.legende ?? '';
  }
  return bloc.texte;
}

export function EditeurPublication({
  langue,
  langueVersion,
  liensVersion,
  publication,
  categories,
  evenements,
  jeudis,
  action,
}: {
  /** Celle des LIBELLÉS de l'écran. */
  langue: LangueInterface;
  /**
   * Celle du TEXTE qu'on écrit, qui n'a rien à voir avec la précédente.
   *
   * Les deux étaient confondues, et le défaut était invisible : l'écran
   * chargeait la version française et l'enregistrait sous la langue de
   * l'interface.
   */
  langueVersion: LangueInterface;
  /**
   * UNE TABLE D'ADRESSES, ET SURTOUT PAS UNE FONCTION.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UNE FONCTION NE TRAVERSE PAS LA FRONTIÈRE SERVEUR → CLIENT.            │
   * │                                                                        │
   * │ Les propriétés d'un composant client sont SÉRIALISÉES par le serveur.  │
   * │ Une fonction ordinaire ne l'est pas : Next refuse, et le refus ne se    │
   * │ voit ni au typecheck, ni au lint, ni dans les tests de composant —      │
   * │ lesquels rendent le composant SANS frontière, donc lui passent la       │
   * │ fonction sans broncher. L'écran répond 200, puis la limite d'erreur     │
   * │ prend la main.                                                          │
   * │                                                                        │
   * │ Seules les Server Actions font exception, parce qu'elles portent une    │
   * │ marque qui leur tient lieu d'adresse. Une flèche écrite sur place n'en  │
   * │ a pas.                                                                  │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  liensVersion: Record<LangueInterface, string>;
  publication: PublicationEditable;
  /*
   * LES CATÉGORIES VIENNENT DU SERVEUR, ET NE SONT PAS IMPORTÉES ICI.
   *
   * `CATEGORIES_ASSOCIATION` est exportée par `@/lib/association/service`, qui
   * tire le client de service Supabase : l'importer depuis ce composant CLIENT
   * ferait descendre la clé de service dans le paquet du navigateur. Le même
   * piège que le tonneau `@/components/admin`, et la même parade — la page
   * serveur lit la liste et la passe.
   */
  categories: readonly string[];
  evenements: { id: string; titre: string }[];
  /** Les quatre prochains jeudis, et ce qui y est déjà programmé. */
  jeudis: { jour: string; occupe: boolean }[];
  /*
   * La signature de React pour `action` : une Server Action rend une
   * promesse, et la déclarer `=> void` la ferait passer pour un appel dont
   * personne n'attend la fin — ce que `no-misused-promises` refuse, à juste
   * titre : un échec d'enregistrement serait alors perdu.
   */
  action: (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const [type, setType] = useState(publication.type);
  const [titre, setTitre] = useState(publication.titre);
  const [chapeau, setChapeau] = useState(publication.chapeau);
  const [alt, setAlt] = useState(publication.texteAlternatif);
  const [image, setImage] = useState(publication.imageUrl);
  const [blocs, setBlocs] = useState<Bloc[]>(publication.corps);
  const [publics, setPublics] = useState<string[]>(publication.publics);
  const [video, setVideo] = useState(publication.videoUrl);
  const [pdf, setPdf] = useState(publication.fichierPdf);
  const [apercu, setApercu] = useState(false);

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CE QUI PART EN BASE ET CE QUI S'AFFICHE NE SONT PAS LA MÊME CHAÎNE.  │
   * │                                                                      │
   * │ Un champ de média porte un CHEMIN DE STOCKAGE —                      │
   * │ `association-fichiers/…` —, qui n'est servable par personne : un      │
   * │ navigateur le prend pour une adresse relative et va chercher là où il │
   * │ n'y a rien. L'éditeur verrait une image cassée et croirait son dépôt  │
   * │ raté, alors qu'il a réussi.                                          │
   * │                                                                      │
   * │ Cette table associe donc chaque chemin à une adresse d'aperçu. Elle   │
   * │ ne sort JAMAIS de l'écran : le formulaire envoie le chemin, et lui    │
   * │ seul. Écrire l'aperçu en base y poserait une URL signée, périmée cinq │
   * │ minutes plus tard.                                                    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const [apercus, setApercus] = useState<Record<string, string>>(publication.apercus);

  /** L'adresse à afficher pour une valeur de champ. */
  const servable = (valeur: string): string => apercus[valeur] ?? valeur;

  /** Retient l'aperçu d'un dépôt, puis rend la main à l'appelant. */
  const retenir = (chemin: string, adresse: string | null): void => {
    if (adresse !== null) setApercus((anciens) => ({ ...anciens, [chemin]: adresse }));
  };

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ TROIS DIFFUSIONS, ET LA PREMIÈRE N'EXISTAIT PAS.                     │
   * │                                                                      │
   * │ L'écran ne savait que PROGRAMMER : le champ caché `publier` valait    │
   * │ l'état courant de la publication, si bien qu'un texte neuf ne pouvait │
   * │ jamais paraître tout de suite. Il fallait lui choisir un jeudi, et    │
   * │ attendre. La base, elle, sait publier à l'instant depuis toujours.    │
   * │                                                                      │
   * │ Le bouton « Brouillon » d'à côté, lui, envoyait EXACTEMENT la même    │
   * │ chose que le bouton principal : deux gestes, un seul effet. Il        │
   * │ disparaît — c'est ce choix-ci qui distingue les trois.                │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const [diffusion, setDiffusion] = useState<Diffusion>(
    publication.publie ? 'maintenant' : publication.programmeLe === '' ? 'brouillon' : 'programme',
  );

  /*
   * LE DÉCOMPTE SUIT LA MÊME RÈGLE QUE LA BASE : 200 mots la minute, minimum
   * une. Il est ici pour être VU pendant qu'on écrit ; c'est la base qui
   * enregistre la valeur, et elle la recalcule. Les deux peuvent diverger
   * d'une frappe, jamais d'une règle.
   */
  const { mots, minutes } = useMemo(() => {
    const total = blocs
      .map((bloc) => texteDuBloc(bloc).trim())
      .filter((texte) => texte !== '')
      .reduce((somme, texte) => somme + texte.split(/\s+/).length, 0);
    return { mots: total, minutes: Math.max(1, Math.ceil(total / 200)) };
  }, [blocs]);

  /*
   * LES SIX POINTS DU DOCUMENT, dans son ordre. Chacun dit ce qui manque —
   * « Titre » tout court laisserait chercher ce qui ne va pas avec lui.
   */
  const controles: { cle: CleTraduction; ok: boolean }[] = [
    { cle: 'admin.redTitreOk', ok: titre.trim().length > 5 },
    { cle: 'admin.redChapeauOk', ok: chapeau.trim().length >= 40 && chapeau.trim().length <= 220 },
    { cle: 'admin.redAltOk', ok: alt.trim().length > 5 },
    {
      cle: 'admin.redParagrapheOk',
      ok: blocs.some((bloc) => bloc.type === 'paragraphe' && bloc.texte.trim().length > 20),
    },
    {
      cle: 'admin.redTypeOk',
      ok:
        type === 'replay'
          ? video.trim() !== ''
          : type === 'fiche_pdf'
            ? pdf.trim() !== ''
            : true,
    },
    { cle: 'admin.redPublicOk', ok: publics.length > 0 },
  ];
  const manquants = controles.filter((controle) => !controle.ok).length;

  /*
   * Le plafond se lit CONTRE LE TYPE COURANT, celui de l'état — et non celui
   * de la publication chargée. Passer un récit de terrain à deux vidéos en
   * « replay » doit éteindre le bouton sur-le-champ, sans attendre un
   * enregistrement qui serait refusé.
   */
  const plafondVideos = VIDEOS_MAX[type];
  const videos = blocs.filter((bloc) => bloc.type === 'video').length;
  const videosPleines = plafondVideos !== undefined && videos >= plafondVideos;

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ATTEINT N'EST PAS DÉPASSÉ, ET LA NUANCE VAUT UN BOUTON.              │
   * │                                                                      │
   * │ Le plafond ATTEINT éteint le bouton d'ajout, et c'est tout. Le       │
   * │ plafond DÉPASSÉ, lui, se produit sans qu'on ait rien ajouté : on     │
   * │ écrit un récit de terrain avec sa vidéo, puis on bascule le type en  │
   * │ « Replay ». Le bloc est déjà là, l'ajout était permis quand il a été │
   * │ fait, et le serveur refusera l'enregistrement.                       │
   * │                                                                      │
   * │ Sans ce second calcul, la liste de contrôle annoncerait « prête » et │
   * │ le bouton dirait « Programmer » — puis l'enregistrement reviendrait  │
   * │ avec un refus qu'on venait de dire franchi. C'est précisément le     │
   * │ défaut que l'encadré de tête de ce fichier interdit.                 │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const videosEnTrop = plafondVideos !== undefined && videos > plafondVideos;

  const changer = (rang: number, bloc: Bloc): void => {
    setBlocs((anciens) => anciens.map((ancien, i) => (i === rang ? bloc : ancien)));
  };

  /*
   * ↑ ÉCHANGE avec le bloc précédent, il ne « remonte » pas d'un cran dans
   * une liste réordonnée. Sur le premier, il n'y a rien à échanger : le
   * bouton est alors éteint plutôt qu'absent, pour que les autres ne se
   * décalent pas d'une ligne à l'autre.
   */
  const remonter = (rang: number): void => {
    if (rang === 0) return;
    setBlocs((anciens) => {
      const suite = [...anciens];
      const precedent = suite[rang - 1];
      const courant = suite[rang];
      if (!precedent || !courant) return anciens;
      suite[rang - 1] = courant;
      suite[rang] = precedent;
      return suite;
    });
  };

  return (
    <form action={action} className={styles.redaction}>
      {publication.id ? <input type="hidden" name="id" value={publication.id} /> : null}
      {/*
        LE SLUG NE SE MODIFIE PAS — cahier des charges §F10 bis, règle 1. Il
        est l'adresse publique du contenu, et la route l'ignore sur une mise à
        jour. Sur une création, il est vide : l'action le tire du titre.

        `categorie` et `acces`, eux, sont choisis plus bas, dans « Le
        classement » : ils vivaient dans l'ancien formulaire de création, qui
        a disparu, et sans eux toute publication neuve naîtrait « Nos actions,
        réservée » sans que personne l'ait demandé.
      */}
      <input type="hidden" name="slug" value={publication.slug} />
      <input type="hidden" name="langue_version" value={langueVersion} />
      {/*
        LE CORPS PART EN UN SEUL CHAMP, sérialisé.

        C'est ce qui permet à un écran client de rendre la main à un
        enregistrement SERVEUR sans route intermédiaire : la Server Action
        reçoit un `FormData` ordinaire, et la route revalide tout.
      */}
      <input type="hidden" name="corps" value={JSON.stringify(blocs)} />
      <input type="hidden" name="publics" value={publics.join(',')} />
      <input type="hidden" name="minutes" value={String(minutes)} />

      <div className={styles.redactionColonnes}>
        <div className={styles.redactionPrincipale}>
          {/* ── A. Le titre et le type ────────────────────────────────── */}
          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            {/*
              LA LANGUE DU TEXTE, et non celle de l'écran.

              Des LIENS, et non des boutons : changer de version recharge la
              page depuis la base. Un bouton donnerait à croire que les deux
              versions se remplissent dans le même formulaire, et la seconde
              partirait avec le texte de la première.

              Absent tant que rien n'est enregistré : il n'y a pas de seconde
              version d'un texte qui n'existe pas encore.
            */}
            {publication.id === null ? null : (
              <div className={styles.seg} role="group" aria-label={t('admin.redLangueVersion')}>
                {LANGUES_INTERFACE.map((code) => (
                  <a
                    key={code}
                    className={
                      code === langueVersion ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt
                    }
                    aria-current={code === langueVersion ? 'page' : undefined}
                    href={liensVersion[code]}
                  >
                    {t(`langue.${code}` as CleTraduction)}
                  </a>
                ))}
              </div>
            )}

            <input
              className={styles.redactionTitre}
              name="titre"
              value={titre}
              onChange={(evenement) => {
                setTitre(evenement.target.value);
              }}
              placeholder={t('admin.redTitrePlaceholder')}
              aria-label={t('admin.redTitreChamp')}
            />

            <div className={styles.seg} role="group" aria-label={t('admin.redType')}>
              {TYPES.map((valeur) => (
                <button
                  key={valeur}
                  type="button"
                  className={
                    type === valeur ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt
                  }
                  aria-pressed={type === valeur}
                  onClick={() => {
                    setType(valeur);
                  }}
                >
                  {t(`admin.redType_${valeur}` as CleTraduction)}
                </button>
              ))}
            </div>
            <input type="hidden" name="type" value={type} />
          </section>

          {/* ── B. La couverture ──────────────────────────────────────── */}
          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            <p className={styles.blocIntitule}>{t('admin.redCouverture')}</p>
            <p className={styles.aide}>{t('admin.redCouvertureAide')}</p>

            {image.trim() === '' ? null : (
              /*
                `lazy` : c'est un APERÇU dans un formulaire, pas le contenu de
                la page. Il peut arriver après le reste sans gêner personne.
              */
              <img
                className={styles.redactionCouverture}
                src={servable(image)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}

            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="red-image">
                {t('admin.redImageUrl')}
              </label>
              <input
                className={styles.saisie}
                id="red-image"
                name="image_url"
                value={image}
                onChange={(evenement) => {
                  setImage(evenement.target.value);
                }}
              />
              <ChampFichier
                langue={langue}
                role="couverture"
                onDepose={(chemin, adresse) => {
                  retenir(chemin, adresse);
                  setImage(chemin);
                }}
              />
            </p>

            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="red-alt">
                {t('admin.redAlt')}
              </label>
              <input
                className={styles.saisie}
                id="red-alt"
                name="texte_alternatif"
                value={alt}
                onChange={(evenement) => {
                  setAlt(evenement.target.value);
                }}
                placeholder={t('admin.redAltPlaceholder')}
              />
            </p>
          </section>

          {/* ── C. Le chapeau ─────────────────────────────────────────── */}
          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            <p className={styles.redactionEntete}>
              <span className={styles.blocIntitule}>{t('admin.redChapeau')}</span>
              {/*
                Le compteur vire à l'accent AU-DELÀ de 220, pas à l'approche :
                prévenir trop tôt ferait s'arrêter d'écrire avant la limite.
              */}
              <span
                className={
                  chapeau.trim().length > 220
                    ? `${styles.redactionCompteur} ${styles.redactionCompteurTrop}`
                    : styles.redactionCompteur
                }
              >
                {chapeau.trim().length} / 220
              </span>
            </p>
            <textarea
              className={styles.saisie}
              name="chapeau"
              rows={3}
              value={chapeau}
              onChange={(evenement) => {
                setChapeau(evenement.target.value);
              }}
              aria-label={t('admin.redChapeau')}
            />
          </section>

          {/* ── D. Le corps, bloc par bloc ────────────────────────────── */}
          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            <p className={styles.redactionEntete}>
              <span className={styles.blocIntitule}>{t('admin.redCorps')}</span>
              <span className={styles.redactionCompteur}>
                {t('admin.redMots').replace('{mots}', String(mots))}
                {' · '}
                {t('admin.redMinutes').replace('{minutes}', String(minutes))}
              </span>
            </p>

            {blocs.length === 0 ? <p className={styles.aide}>{t('admin.redCorpsVide')}</p> : null}

            {blocs.map((bloc, rang) => (
              <div key={`${bloc.type}-${String(rang)}`} className={styles.redactionBloc}>
                <span className={styles.redactionBlocType}>
                  {t(`admin.redBloc_${bloc.type}` as CleTraduction)}
                </span>

                <div className={styles.redactionBlocChamp}>
                  {bloc.type === 'intertitre' ? (
                    <input
                      className={`${styles.saisie} ${styles.redactionIntertitre}`}
                      value={bloc.texte}
                      onChange={(evenement) => {
                        changer(rang, { type: 'intertitre', texte: evenement.target.value });
                      }}
                      aria-label={t('admin.redBloc_intertitre')}
                    />
                  ) : null}

                  {bloc.type === 'paragraphe' ? (
                    <textarea
                      className={styles.saisie}
                      rows={4}
                      value={bloc.texte}
                      onChange={(evenement) => {
                        changer(rang, { type: 'paragraphe', texte: evenement.target.value });
                      }}
                      aria-label={t('admin.redBloc_paragraphe')}
                    />
                  ) : null}

                  {bloc.type === 'citation' ? (
                    <textarea
                      className={`${styles.saisie} ${styles.redactionCitation}`}
                      rows={3}
                      value={bloc.texte}
                      onChange={(evenement) => {
                        changer(rang, { type: 'citation', texte: evenement.target.value });
                      }}
                      placeholder={t('admin.redCitationPlaceholder')}
                      aria-label={t('admin.redBloc_citation')}
                    />
                  ) : null}

                  {bloc.type === 'liste' ? (
                    <textarea
                      className={styles.saisie}
                      rows={3}
                      value={bloc.elements.join('\n')}
                      onChange={(evenement) => {
                        // Une ligne, un élément. Les lignes vides ne font pas
                        // une puce vide : elles disparaissent.
                        changer(rang, {
                          type: 'liste',
                          elements: evenement.target.value
                            .split('\n')
                            .map((ligne) => ligne.trim())
                            .filter((ligne) => ligne !== ''),
                        });
                      }}
                      placeholder={t('admin.redListePlaceholder')}
                      aria-label={t('admin.redBloc_liste')}
                    />
                  ) : null}

                  {/*
                    LES TROIS MÉDIAS PARTAGENT LEUR SAISIE, et c'est voulu :
                    une adresse, une légende. Trois branches identiques
                    finiraient par diverger sur la quatrième correction.

                    Le type est repris depuis `bloc.type` dans les deux
                    rappels : l'écrire en dur transformerait une vidéo en
                    photo à la première frappe.
                  */}
                  {bloc.type === 'photo' || bloc.type === 'video' || bloc.type === 'audio' ? (
                    <>
                      {/*
                        L'APERÇU DU MÉDIA, DANS LE FORMULAIRE ET NON SEULEMENT
                        DANS LE PANNEAU D'APERÇU.

                        La couverture en avait un depuis toujours ; les blocs
                        du corps n'en avaient aucun. On y déposait un fichier,
                        le champ se remplissait d'un chemin de stockage, et
                        rien ne montrait ce qui venait d'arriver — ce qui se
                        lit comme un dépôt raté.

                        `preload="none"` : l'éditeur relit son article, il ne
                        vient pas regarder ses vidéos. Rien ne descend tant
                        qu'il n'a pas appuyé.
                      */}
                      {bloc.url.trim() === '' ? null : (
                        <span className={styles.redactionBlocApercu}>
                          {bloc.type === 'photo' ? (
                            <img src={servable(bloc.url)} alt="" loading="lazy" decoding="async" />
                          ) : null}
                          {bloc.type === 'video' ? (
                            <video src={servable(bloc.url)} controls preload="none" playsInline />
                          ) : null}
                          {bloc.type === 'audio' ? (
                            <audio src={servable(bloc.url)} controls preload="none" />
                          ) : null}
                        </span>
                      )}

                      <input
                        className={styles.saisie}
                        value={bloc.url}
                        onChange={(evenement) => {
                          changer(rang, {
                            type: bloc.type,
                            url: evenement.target.value,
                            ...(bloc.legende === undefined ? {} : { legende: bloc.legende }),
                          });
                        }}
                        placeholder={t(`admin.redAdresse_${bloc.type}` as CleTraduction)}
                        aria-label={t(`admin.redBloc_${bloc.type}` as CleTraduction)}
                      />
                      <ChampFichier
                        langue={langue}
                        role={bloc.type}
                        onDepose={(chemin, adresse) => {
                          retenir(chemin, adresse);
                          changer(rang, {
                            type: bloc.type,
                            url: chemin,
                            ...(bloc.legende === undefined ? {} : { legende: bloc.legende }),
                          });
                        }}
                      />
                      <input
                        className={styles.saisie}
                        value={bloc.legende ?? ''}
                        onChange={(evenement) => {
                          changer(rang, {
                            type: bloc.type,
                            url: bloc.url,
                            legende: evenement.target.value,
                          });
                        }}
                        placeholder={t('admin.redLegendePlaceholder')}
                        aria-label={t('admin.redLegende')}
                      />
                    </>
                  ) : null}
                </div>

                <div className={styles.redactionBlocGestes}>
                  <button
                    type="button"
                    className={styles.redactionGeste}
                    onClick={() => {
                      remonter(rang);
                    }}
                    disabled={rang === 0}
                    aria-label={t('admin.redRemonter')}
                  >
                    {'↑'}
                  </button>
                  <button
                    type="button"
                    className={styles.redactionGeste}
                    onClick={() => {
                      setBlocs((anciens) => anciens.filter((_, i) => i !== rang));
                    }}
                    aria-label={t('admin.redSupprimerBloc')}
                  >
                    {'×'}
                  </button>
                </div>
              </div>
            ))}

            <div className={styles.redactionAjouts}>
              <span className={styles.aide}>{t('admin.redAjouter')}</span>
              {BLOCS.map((valeur) => (
                <button
                  key={valeur}
                  type="button"
                  className={styles.boutonSecondaire}
                  /*
                    Éteint plutôt qu'absent : un bouton qui disparaît laisse
                    croire que le type de bloc n'existe pas, et la phrase
                    au-dessous explique alors un manque qu'on ne voit pas.
                  */
                  disabled={valeur === 'video' && videosPleines}
                  onClick={() => {
                    setBlocs((anciens) => [...anciens, blocVide(valeur)]);
                  }}
                >
                  {t(`admin.redBloc_${valeur}` as CleTraduction)}
                </button>
              ))}
            </div>

            {videosPleines ? (
              <p className={videosEnTrop ? styles.alerte : styles.aide} role={videosEnTrop ? 'alert' : undefined}>
                {t(videosEnTrop ? 'admin.redVideoEnTrop' : 'admin.redUneSeuleVideo')}
              </p>
            ) : null}
          </section>

          {/* ── E. Ce que le type exige en plus ───────────────────────── */}
          {type === 'replay' || type === 'fiche_pdf' || type === 'compte_rendu' ? (
            <section className={`${styles.carte} ${styles.redactionCarte}`}>
              <p className={styles.blocIntitule}>{t(`admin.redEncadre_${type}` as CleTraduction)}</p>

              {type === 'replay' ? (
                <>
                  <p className={styles.champ}>
                    <label className={styles.libelle} htmlFor="red-video">
                      {t('admin.redVideoUrl')}
                    </label>
                    <input
                      className={styles.saisie}
                      id="red-video"
                      name="video_url"
                      value={video}
                      onChange={(evenement) => {
                        setVideo(evenement.target.value);
                      }}
                    />
                    <ChampFichier
                      langue={langue}
                      role="video"
                      onDepose={(chemin, adresse) => {
                        retenir(chemin, adresse);
                        setVideo(chemin);
                      }}
                    />
                  </p>
                  <p className={styles.champ}>
                    <label className={styles.libelle} htmlFor="red-video-minutes">
                      {t('admin.redVideoMinutes')}
                    </label>
                    <input
                      className={styles.saisie}
                      id="red-video-minutes"
                      name="video_minutes"
                      type="number"
                      min={1}
                      defaultValue={publication.videoMinutes}
                    />
                  </p>
                </>
              ) : null}

              {type === 'fiche_pdf' ? (
                <>
                  <p className={styles.champ}>
                    <label className={styles.libelle} htmlFor="red-pdf">
                      {t('admin.redFichierPdf')}
                    </label>
                    <input
                      className={styles.saisie}
                      id="red-pdf"
                      name="fichier_pdf"
                      value={pdf}
                      onChange={(evenement) => {
                        setPdf(evenement.target.value);
                      }}
                    />
                    <ChampFichier
                      langue={langue}
                      role="document"
                      onDepose={(chemin, adresse) => {
                        retenir(chemin, adresse);
                        setPdf(chemin);
                      }}
                    />
                  </p>
                  <p className={styles.champ}>
                    <label className={styles.libelle} htmlFor="red-pdf-pages">
                      {t('admin.redPdfPages')}
                    </label>
                    <input
                      className={styles.saisie}
                      id="red-pdf-pages"
                      name="pdf_pages"
                      type="number"
                      min={1}
                      defaultValue={publication.pdfPages}
                    />
                  </p>
                </>
              ) : null}

              {type === 'compte_rendu' || type === 'replay' ? (
                <p className={styles.champ}>
                  <label className={styles.libelle} htmlFor="red-evenement">
                    {t('admin.redAtelier')}
                  </label>
                  <select
                    className={styles.saisie}
                    id="red-evenement"
                    name="evenement_id"
                    defaultValue={publication.evenementId}
                  >
                    <option value="">{t('admin.redAtelierAucun')}</option>
                    {evenements.map((evenement) => (
                      <option key={evenement.id} value={evenement.id}>
                        {evenement.titre}
                      </option>
                    ))}
                  </select>
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ── F. Le classement ──────────────────────────────────────── */}
          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            <p className={styles.blocIntitule}>{t('admin.redPublics')}</p>
            <p className={styles.aide}>{t('admin.redPublicsAide')}</p>

            <div className={styles.redactionPuces}>
              {PUBLICS.map((valeur) => {
                const choisi = publics.includes(valeur);
                return (
                  <button
                    key={valeur}
                    type="button"
                    className={
                      choisi
                        ? `${styles.redactionPuce} ${styles.redactionPuceChoisie}`
                        : styles.redactionPuce
                    }
                    aria-pressed={choisi}
                    onClick={() => {
                      setPublics((anciens) =>
                        choisi ? anciens.filter((a) => a !== valeur) : [...anciens, valeur],
                      );
                    }}
                  >
                    {t(`admin.redPublic_${valeur}` as CleTraduction)}
                  </button>
                );
              })}
            </div>

            <div className={styles.rangee}>
              <p className={styles.champ}>
                <label className={styles.libelle} htmlFor="red-categorie">
                  {t('admin.contenuCategorie')}
                </label>
                <select
                  className={styles.saisie}
                  id="red-categorie"
                  name="categorie"
                  defaultValue={publication.categorie}
                >
                  {categories.map((categorie) => (
                    <option key={categorie} value={categorie}>
                      {t(`v2.cat_${categorie}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </p>

              <p className={styles.champ}>
                <label className={styles.libelle} htmlFor="red-acces">
                  {t('admin.contenuAcces')}
                </label>
                <select
                  className={styles.saisie}
                  id="red-acces"
                  name="acces"
                  defaultValue={publication.acces}
                  aria-describedby="red-acces-aide"
                >
                  {ACCES.map((acces) => (
                    <option key={acces} value={acces}>
                      {t(`admin.contenuAcces_${acces}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </p>
            </div>

            <p className={styles.aide} id="red-acces-aide">
              {t('admin.contenuAccesAide')}
            </p>

            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="red-signe">
                {t('admin.redSignePar')}
              </label>
              <input
                className={styles.saisie}
                id="red-signe"
                name="signe_par"
                defaultValue={publication.signePar}
              />
            </p>
          </section>
        </div>

        {/* ── La colonne de droite ─────────────────────────────────────── */}
        <aside className={styles.redactionCote}>
          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            <p className={styles.redactionEntete}>
              <span className={styles.blocIntitule}>{t('admin.redPrete')}</span>
              <span className={styles.redactionCompteur}>
                {controles.length - manquants} / {controles.length}
              </span>
            </p>

            <ul className={styles.redactionControles}>
              {controles.map((controle) => (
                <li
                  key={controle.cle}
                  className={
                    controle.ok
                      ? styles.redactionControle
                      : `${styles.redactionControle} ${styles.redactionControleManquant}`
                  }
                >
                  <span className={styles.redactionPastille} aria-hidden="true">
                    {controle.ok ? '✓' : ''}
                  </span>
                  {t(controle.cle)}
                </li>
              ))}
            </ul>
          </section>

          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            <p className={styles.blocIntitule}>{t('admin.redDiffusion')}</p>

            {/*
              DES BOUTONS RADIO, et non trois boutons de soumission.

              Le choix se lit AVANT d'appuyer : « Publier maintenant » coché,
              on sait que le texte paraîtra en sortant de l'écran. Trois
              boutons côte à côte laisseraient découvrir l'effet après coup,
              et c'est exactement ce que faisait l'ancien « Brouillon » —
              lequel envoyait la même chose que son voisin.
            */}
            <div className={styles.redactionDiffusion}>
              {DIFFUSIONS.map((valeur) => (
                <label className={styles.redactionChoix} key={valeur} htmlFor={`red-diff-${valeur}`}>
                  <input
                    className={styles.redactionChoixCase}
                    id={`red-diff-${valeur}`}
                    type="radio"
                    name="diffusion"
                    value={valeur}
                    checked={diffusion === valeur}
                    onChange={() => {
                      setDiffusion(valeur);
                    }}
                  />
                  <span>
                    <span className={styles.redactionChoixNom}>
                      {t(`admin.redDiffusion_${valeur}` as CleTraduction)}
                    </span>
                    <span className={styles.interrupteurNote}>
                      {t(`admin.redDiffusionNote_${valeur}` as CleTraduction)}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {/*
              Le créneau ne s'affiche QUE s'il sert. Laissé visible sous
              « Publier maintenant », il ferait choisir une date sans effet —
              et croire que le texte paraîtra ce jour-là.
            */}
            {diffusion === 'programme' ? (
              <>
                <p className={styles.champ}>
                  <label className={styles.libelle} htmlFor="red-date">
                    {t('admin.redDate')}
                  </label>
                  <select
                    className={styles.saisie}
                    id="red-date"
                    name="programme_jour"
                    defaultValue={publication.programmeLe.slice(0, 10)}
                  >
                    <option value="">{t('admin.redDateAucune')}</option>
                    {jeudis.map((jeudi) => (
                      <option key={jeudi.jour} value={jeudi.jour}>
                        {jeudi.jour}
                        {jeudi.occupe ? ` — ${t('admin.redJeudiOccupe')}` : ''}
                      </option>
                    ))}
                  </select>
                </p>

                <p className={styles.champ}>
                  <label className={styles.libelle} htmlFor="red-heure">
                    {t('admin.redHeure')}
                  </label>
                  <input
                    className={styles.saisie}
                    id="red-heure"
                    name="programme_heure"
                    type="time"
                    defaultValue={publication.programmeLe.slice(11, 16) || '08:00'}
                  />
                </p>
              </>
            ) : null}

            <div className={styles.interrupteur}>
              <input
                className={styles.interrupteurCase}
                id="red-vedette"
                name="vedette"
                type="checkbox"
                value="oui"
                defaultChecked={publication.vedette}
              />
              <span>
                <label className={styles.interrupteurNom} htmlFor="red-vedette">
                  {t('admin.redVedette')}
                </label>
                <span className={styles.interrupteurNote}>{t('admin.redVedetteNote')}</span>
              </span>
            </div>

            <div className={styles.interrupteur}>
              <input
                className={styles.interrupteurCase}
                id="red-commentaires"
                name="commentaires_ouverts"
                type="checkbox"
                value="oui"
                defaultChecked={publication.commentairesOuverts}
              />
              <span>
                <label className={styles.interrupteurNom} htmlFor="red-commentaires">
                  {t('admin.redCommentaires')}
                </label>
                <span className={styles.interrupteurNote}>{t('admin.redCommentairesNote')}</span>
              </span>
            </div>

            <div className={styles.interrupteur}>
              <input
                className={styles.interrupteurCase}
                id="red-prevenir"
                name="prevenir_adherents"
                type="checkbox"
                value="oui"
                defaultChecked={publication.prevenirAdherents}
              />
              <span>
                <label className={styles.interrupteurNom} htmlFor="red-prevenir">
                  {t('admin.redPrevenir')}
                </label>
                {/*
                  L'ENVOI N'EXISTE PAS ENCORE, et la note le dit.

                  Cocher cette case pose une INTENTION en base
                  (`prevenir_adherents`) ; l'envoi lui-même viendra avec les
                  automatismes. Promettre un e-mail qui ne part pas serait
                  pire que de ne rien promettre : l'éditeur croirait ses
                  adhérents prévenus.
                */}
                <span className={styles.interrupteurNote}>{t('admin.redPrevenirNote')}</span>
              </span>
            </div>
          </section>

          <section className={`${styles.carte} ${styles.redactionCarte}`}>
            {/*
              `videosEnTrop` bloque au MÊME titre qu'un point manquant, sans
              entrer dans le décompte : la liste porte les six points du
              document, et en ajouter un septième ferait varier son
              dénominateur d'un type à l'autre — « 6 / 7 » sur un replay et
              « 6 / 6 » ailleurs, pour la même publication.
            */}
            {/*
              ┌────────────────────────────────────────────────────────────┐
              │ UN BROUILLON A LE DROIT D'ÊTRE INCOMPLET.                  │
              │                                                            │
              │ La liste de contrôle bloquait l'enregistrement quoi qu'il   │
              │ arrive : on ne pouvait pas mettre un texte de côté avant    │
              │ d'avoir trouvé son texte alternatif. C'est la règle du      │
              │ serveur qui est reprise ici, et elle ne porte QUE sur la    │
              │ publication et la programmation — pas sur le brouillon.     │
              │                                                            │
              │ `videosEnTrop`, lui, bloque dans les trois cas : ce n'est   │
              │ pas un manque, c'est un refus de la route, y compris sur un │
              │ brouillon.                                                  │
              └────────────────────────────────────────────────────────────┘
            */}
            <BoutonSoumission
              variante="primaire"
              disabled={videosEnTrop || (manquants > 0 && diffusion !== 'brouillon')}
            >
              {videosEnTrop
                ? t('admin.redRetirerVideo')
                : manquants > 0 && diffusion !== 'brouillon'
                  ? t('admin.redManquants').replace('{nb}', String(manquants))
                  : t(`admin.redBouton_${diffusion}` as CleTraduction)}
            </BoutonSoumission>

            <div className={styles.redactionAjouts}>
              <button
                type="button"
                className={styles.boutonSecondaire}
                onClick={() => {
                  setApercu((ouvert) => !ouvert);
                }}
                aria-expanded={apercu}
              >
                {t('admin.redApercu')}
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/*
        L'APERÇU REND LES MÊMES BLOCS, avec la mise en forme de l'article.

        Il est volontairement rendu ICI, dans la page, plutôt que dans une
        fenêtre modale : une modale demanderait de piéger le focus et de gérer
        la touche d'échappement, et l'éditeur veut surtout relire — pas
        simuler une page.
      */}
      {apercu ? (
        <section className={`${styles.carte} ${styles.redactionApercu}`}>
          <p className={styles.blocIntitule}>{t('admin.redApercuTitre')}</p>
          <h2 className={styles.redactionApercuH1}>{titre || t('admin.redTitrePlaceholder')}</h2>
          <p className={styles.redactionApercuChapeau}>{chapeau}</p>
          {blocs.map((bloc, rang) => {
            const cle = `apercu-${bloc.type}-${String(rang)}`;
            if (bloc.type === 'intertitre') {
              return (
                <h3 key={cle} className={styles.redactionApercuH2}>
                  {bloc.texte}
                </h3>
              );
            }
            if (bloc.type === 'liste') {
              return (
                <ul key={cle}>
                  {bloc.elements.map((element) => (
                    <li key={element}>{element}</li>
                  ))}
                </ul>
              );
            }
            if (bloc.type === 'photo' || bloc.type === 'video' || bloc.type === 'audio') {
              if (bloc.url.trim() === '') return null;
              return (
                <figure key={cle}>
                  {bloc.type === 'photo' ? (
                    <img
                      className={styles.redactionCouverture}
                      src={servable(bloc.url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  {/*
                    `preload="none"` dans un APERÇU plus encore qu'ailleurs :
                    l'éditeur ouvre et referme ce panneau à chaque relecture,
                    et rien ne doit descendre tant qu'il n'a pas appuyé.
                  */}
                  {bloc.type === 'video' ? (
                    <video
                      className={styles.redactionCouverture}
                      src={servable(bloc.url)}
                      controls
                      preload="none"
                      playsInline
                    />
                  ) : null}
                  {bloc.type === 'audio' ? (
                    <audio src={servable(bloc.url)} controls preload="none" />
                  ) : null}
                  {bloc.legende ? <figcaption className={styles.aide}>{bloc.legende}</figcaption> : null}
                </figure>
              );
            }
            if (bloc.type === 'citation') {
              return (
                <blockquote key={cle} className={styles.redactionApercuCitation}>
                  {bloc.texte}
                </blockquote>
              );
            }
            return <p key={cle}>{bloc.texte}</p>;
          })}
        </section>
      ) : null}
    </form>
  );
}
