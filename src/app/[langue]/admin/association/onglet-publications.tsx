import type { CSSProperties, ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { BoutonSoumission, stylesAdmin as styles } from '@/components/admin';
import { enregistrerMot } from './actions';
import { SIGLE_TYPE, estTypePublication } from './types-publication';

/**
 * L'ONGLET DES PUBLICATIONS — la liste, le rythme, le mot du mois.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RYTHME HEBDOMADAIRE MONTRE LES CRÉNEAUX LIBRES, ET C'EST SON OBJET.  │
 * │                                                                          │
 * │ Un planning qui n'afficherait que ce qui est programmé serait une liste  │
 * │ de plus. Celui-ci sert à tenir la promesse d'un contenu par semaine :    │
 * │ c'est donc le VIDE qui est l'information, et il est dessiné en pointillé │
 * │ plutôt que laissé blanc.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface LignePublication {
  id: string;
  slug: string;
  type_publication: string;
  titre: string | null;
  etat: string;
  publie_le: string | null;
  programme_le: string | null;
  vedette: boolean;
  vues: number | string;
  nb_commentaires: number | string;
}

export interface Jeudi {
  jour: string;
  titre: string | null;
  etat: string | null;
}

const COLONNES = 'minmax(0, 1fr) 100px 64px 52px 40px 16px';
const LARGEUR_MIN = '500px';

export function OngletPublications({
  langue,
  publications,
  jeudis,
  mot,
  lienPublication,
}: {
  langue: LangueInterface;
  publications: LignePublication[];
  jeudis: Jeudi[];
  mot: { texte: string; signature: string } | null;
  lienPublication: (id: string) => string;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const date = (iso: string | null): string =>
    iso
      ? new Date(iso).toLocaleDateString(langue, {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        })
      : '—';

  return (
    <div className={styles.publicationsColonnes}>
      {/* ── La liste ──────────────────────────────────────────────────── */}
      <div className={`${styles.carte} ${styles.grilleCadre} ${styles.publicationsListe}`}>
        {publications.length === 0 ? (
          <p className={styles.grilleVide}>{t('admin.aucunContenu')}</p>
        ) : (
          <table
            className={styles.grille}
            style={
              { '--grille-colonnes': COLONNES, '--grille-min': LARGEUR_MIN } as CSSProperties
            }
          >
            <thead>
              <tr className={`${styles.grilleEntete} ${styles.grilleEnteteVentes}`}>
                <th scope="col">{t('admin.assoColPublication')}</th>
                <th scope="col">{t('admin.colStatut')}</th>
                <th scope="col">{t('admin.assoColDate')}</th>
                <th scope="col">{t('admin.assoColVues')}</th>
                <th scope="col" abbr={t('admin.assoColCommentaires')}>
                  {t('admin.assoColCom')}
                </th>
                <th scope="col" />
              </tr>
            </thead>

            <tbody>
              {publications.map((publication) => (
                <tr className={styles.grilleRangee} key={publication.id}>
                  <td>
                    <a
                      className={styles.publicationCellule}
                      href={lienPublication(publication.id)}
                    >
                      <span className={styles.pastilleType} aria-hidden="true">
                        {estTypePublication(publication.type_publication)
                          ? SIGLE_TYPE[publication.type_publication]
                          : '?'}
                      </span>
                      <span>
                        <span className={styles.publicationTitre}>
                          {publication.titre ?? publication.slug}
                        </span>
                        <span className={styles.publicationType}>
                          {t(`admin.redType_${publication.type_publication}` as CleTraduction)}
                          {publication.vedette ? ` · ${t('admin.assoColUne')}` : ''}
                        </span>
                      </span>
                    </a>
                  </td>

                  <td>
                    <span
                      className={`${styles.etat} ${styles.etatPetit} ${
                        publication.etat === 'publie'
                          ? styles.etatPublie
                          : publication.etat === 'programme'
                            ? styles.etatAccent
                            : styles.etatBrouillon
                      }`}
                    >
                      {t(`admin.assoEtat_${publication.etat}` as CleTraduction)}
                    </span>
                  </td>

                  <td className={styles.noteVentes}>
                    {date(publication.publie_le ?? publication.programme_le)}
                  </td>

                  <td className={styles.grilleNombre}>{Number(publication.vues)}</td>
                  <td className={styles.grilleNombre}>{Number(publication.nb_commentaires)}</td>
                  <td aria-hidden="true">{'›'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── La colonne de droite ──────────────────────────────────────── */}
      <div className={styles.publicationsCote}>
        <section className={`${styles.carte} ${styles.redactionCarte}`}>
          <p className={styles.redactionEntete}>
            <span className={styles.blocIntitule}>{t('admin.assoRythme')}</span>
            <span className={styles.redactionCompteur}>{t('admin.assoRythmeJeudi')}</span>
          </p>

          {jeudis.map((jeudi) => (
            <div key={jeudi.jour} className={styles.rythmeLigne}>
              <span className={styles.rythmeDate}>
                {new Date(`${jeudi.jour}T12:00:00Z`).toLocaleDateString(langue, {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })}
              </span>

              {jeudi.titre === null ? (
                <span className={styles.rythmeLibre}>{t('admin.assoRienProgramme')}</span>
              ) : (
                <span className={styles.rythmePrise}>{jeudi.titre}</span>
              )}
            </div>
          ))}
        </section>

        <section className={`${styles.carte} ${styles.redactionCarte}`}>
          <p className={styles.blocIntitule}>{t('admin.assoMotDuMois')}</p>

          <form action={enregistrerMot.bind(null, langue)} className={styles.formulaire}>
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="mot-texte">
                {t('admin.assoMotTexte')}
              </label>
              <textarea
                className={styles.saisie}
                id="mot-texte"
                name="texte"
                rows={5}
                required
                maxLength={2000}
                defaultValue={mot?.texte ?? ''}
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="mot-signature">
                {t('admin.assoMotSignature')}
              </label>
              <input
                className={styles.saisie}
                id="mot-signature"
                name="signature"
                maxLength={160}
                defaultValue={mot?.signature ?? ''}
              />
            </div>

            {/*
              L'ENREGISTREMENT ARCHIVE, IL N'ÉCRASE PAS — et l'aide le dit,
              parce que rien à l'écran ne le laisserait deviner. Un éditeur qui
              croit écraser hésite à corriger.
            */}
            <p className={styles.aide}>{t('admin.assoMotAide')}</p>

            <BoutonSoumission variante="secondaire">{t('admin.assoMotEnregistrer')}</BoutonSoumission>
          </form>
        </section>
      </div>
    </div>
  );
}
