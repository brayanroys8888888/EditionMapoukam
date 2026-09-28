'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
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
  | { type: 'photo'; url: string; legende?: string };

const TYPES = ['compte_rendu', 'recit_terrain', 'fiche_pdf', 'replay'] as const;
const PUBLICS = ['parents', 'enseignants', 'pro_handicap', 'donateurs', 'partenaires'] as const;
const BLOCS = ['intertitre', 'paragraphe', 'liste', 'citation', 'photo'] as const;

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
}

/** Un bloc neuf, vide, du type demandé. */
function blocVide(type: (typeof BLOCS)[number]): Bloc {
  if (type === 'liste') return { type: 'liste', elements: [] };
  if (type === 'photo') return { type: 'photo', url: '' };
  return { type, texte: '' };
}

/** Le texte porté par un bloc, quel que soit son type. Sert au décompte. */
function texteDuBloc(bloc: Bloc): string {
  if (bloc.type === 'liste') return bloc.elements.join(' ');
  if (bloc.type === 'photo') return bloc.legende ?? '';
  return bloc.texte;
}

export function EditeurPublication({
  langue,
  publication,
  evenements,
  jeudis,
  action,
}: {
  langue: LangueInterface;
  publication: PublicationEditable;
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
      <input type="hidden" name="slug" value={publication.slug} />
      <input type="hidden" name="categorie" value={publication.categorie} />
      <input type="hidden" name="acces" value={publication.acces} />
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
                src={image}
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

                  {bloc.type === 'photo' ? (
                    <>
                      <input
                        className={styles.saisie}
                        value={bloc.url}
                        onChange={(evenement) => {
                          changer(rang, {
                            type: 'photo',
                            url: evenement.target.value,
                            ...(bloc.legende === undefined ? {} : { legende: bloc.legende }),
                          });
                        }}
                        placeholder={t('admin.redPhotoPlaceholder')}
                        aria-label={t('admin.redBloc_photo')}
                      />
                      <input
                        className={styles.saisie}
                        value={bloc.legende ?? ''}
                        onChange={(evenement) => {
                          changer(rang, {
                            type: 'photo',
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
                  onClick={() => {
                    setBlocs((anciens) => [...anciens, blocVide(valeur)]);
                  }}
                >
                  {t(`admin.redBloc_${valeur}` as CleTraduction)}
                </button>
              ))}
            </div>
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
                  </p>
                  <p className={styles.aide}>{t('admin.redFichierPdfAide')}</p>
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
                      choisi ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt
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
            <BoutonSoumission variante="primaire" disabled={manquants > 0}>
              {manquants > 0
                ? t('admin.redManquants').replace('{nb}', String(manquants))
                : publication.publie
                  ? t('admin.redMettreAJour')
                  : t('admin.redProgrammer')}
            </BoutonSoumission>
            <input type="hidden" name="publier" value={publication.publie ? 'oui' : 'non'} />

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
              {/*
                « Brouillon » est une SOUMISSION, pas un bouton de confort :
                il enregistre par le même chemin, sans programmation. Son
                `formAction` n'existe pas — c'est le champ caché qui distingue
                les deux gestes, et le serveur qui décide.
              */}
              <BoutonSoumission variante="secondaire">{t('admin.redBrouillon')}</BoutonSoumission>
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
            if (bloc.type === 'photo') {
              return bloc.url.trim() === '' ? null : (
                <figure key={cle}>
                  <img
                    className={styles.redactionCouverture}
                    src={bloc.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
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
