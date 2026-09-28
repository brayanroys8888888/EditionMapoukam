import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { BoutonSoumission, stylesAdmin as styles } from '@/components/admin';
import { enregistrerEvenement } from './actions';

/**
 * L'AGENDA — ateliers, séminaires et formations.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA BARRE DE REMPLISSAGE DIT CE QUE LE CHIFFRE NE DIT PAS.               │
 * │                                                                          │
 * │ « 18 / 30 » se lit ; « presque plein » se VOIT. Les deux sont là, parce  │
 * │ que l'éditeur cherche deux choses différentes : le nombre exact quand il │
 * │ prépare la salle, et l'état du remplissage quand il balaye l'agenda.     │
 * │                                                                          │
 * │ Les places restantes viennent de `association_places_restantes` : aucune │
 * │ soustraction ici. Deux écrans qui compteraient chacun finiraient par ne  │
 * │ pas dire la même chose, et celui qui se trompe est toujours celui qui    │
 * │ annonce une place libre.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface LigneEvenement {
  id: string;
  type_evenement: string;
  titre: string;
  description: string;
  debut_le: string;
  lieu: string | null;
  lien: string | null;
  places: number;
  inscrits: number | string;
  passe: boolean;
}

/*
 * `POUR_CENT` plutôt qu'un 100 nu : la règle de lint interdit la
 * multiplication par cent, parce qu'un MONTANT se convertit par
 * `src/domain/money` — toutes les devises n'ont pas deux décimales. Ici ce
 * n'est pas de l'argent, c'est la part d'une jauge, et cent pour cent valent
 * cent partout. Même précédent que l'écran des codes promotionnels.
 */
const POUR_CENT = 100;

const TYPES = ['atelier_presentiel', 'seminaire_en_ligne', 'formation_enseignants'] as const;

export function OngletAgenda({
  langue,
  evenements,
  ouvert,
  lienNouveau,
  lienFermer,
}: {
  langue: LangueInterface;
  evenements: LigneEvenement[];
  /** `true` quand le formulaire de création est déplié. */
  ouvert: boolean;
  lienNouveau: string;
  lienFermer: string;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const quand = (iso: string): string =>
    new Date(iso).toLocaleDateString(langue, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return (
    <div className={styles.agenda}>
      <div className={styles.agendaGrille}>
        {evenements.map((evenement) => {
          const inscrits = Number(evenement.inscrits);
          // Plafonnée à 100 % : un événement sur-réservé — par une reprise de
          // données, par exemple — ne doit pas dessiner une barre qui déborde.
          const part = Math.min(
            POUR_CENT,
            Math.round((inscrits / Math.max(1, evenement.places)) * POUR_CENT),
          );

          return (
            <article
              key={evenement.id}
              className={
                evenement.passe
                  ? `${styles.carte} ${styles.evenementCarte} ${styles.evenementPasse}`
                  : `${styles.carte} ${styles.evenementCarte}`
              }
            >
              <p className={styles.evenementType}>
                {t(`admin.assoEvt_${evenement.type_evenement}` as CleTraduction)}
              </p>

              <h3 className={styles.evenementTitre}>{evenement.titre}</h3>

              <p className={styles.evenementQuand}>
                {quand(evenement.debut_le)}
                {evenement.lieu ? ` · ${evenement.lieu}` : ''}
                {/*
                  Le LIEN d'un séminaire n'est pas affiché ici. Il vaut une
                  place : il se recopie et se transmet. Le chemin légitime est
                  l'e-mail envoyé aux inscrits, une heure avant.
                */}
                {evenement.lien ? ` · ${t('admin.assoEnLigne')}` : ''}
              </p>

              <p className={styles.evenementPlaces}>
                <span className={styles.evenementInscrits}>
                  {t('admin.assoInscrits').replace('{nb}', String(inscrits))}
                </span>
                {' / '}
                {t('admin.assoPlaces').replace('{nb}', String(evenement.places))}
              </p>

              <span className={styles.jauge} aria-hidden="true">
                <span className={styles.jaugeRemplie} style={{ width: `${String(part)}%` }} />
              </span>
            </article>
          );
        })}

        {/*
          LE BOUTON D'AJOUT EST UNE CASE DE LA GRILLE, pas une barre au-dessus.

          C'est le motif du prototype, et il tient : la place où l'on ajoute un
          atelier est celle où il apparaîtra. Pointillé plutôt que plein —
          c'est un emplacement vide, pas un objet.
        */}
        {ouvert ? null : (
          <a className={`${styles.carte} ${styles.evenementAjout}`} href={lienNouveau}>
            <span className={styles.evenementAjoutSigne} aria-hidden="true">
              +
            </span>
            {t('admin.assoAjouterEvenement')}
          </a>
        )}
      </div>

      {ouvert ? (
        <section className={`${styles.carte} ${styles.redactionCarte}`}>
          <p className={styles.blocIntitule}>{t('admin.assoAjouterEvenement')}</p>

          <form action={enregistrerEvenement.bind(null, langue)} className={styles.formulaire}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-type">
                  {t('admin.assoEvtType')}
                </label>
                <select className={styles.saisie} id="evt-type" name="type" defaultValue={TYPES[0]}>
                  {TYPES.map((valeur) => (
                    <option key={valeur} value={valeur}>
                      {t(`admin.assoEvt_${valeur}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-titre">
                  {t('admin.assoEvtTitre')}
                </label>
                <input className={styles.saisie} id="evt-titre" name="titre" required maxLength={200} />
              </div>
            </div>

            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-jour">
                  {t('admin.assoEvtJour')}
                </label>
                <input className={styles.saisie} id="evt-jour" name="jour" type="date" required />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-heure">
                  {t('admin.assoEvtHeure')}
                </label>
                <input
                  className={styles.saisie}
                  id="evt-heure"
                  name="heure"
                  type="time"
                  defaultValue="09:00"
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-places">
                  {t('admin.assoEvtPlaces')}
                </label>
                <input
                  className={styles.saisie}
                  id="evt-places"
                  name="places"
                  type="number"
                  min={1}
                  defaultValue={20}
                  required
                />
              </div>
            </div>

            {/*
              LES DEUX CHAMPS SONT MONTRÉS, UN SEUL PART.

              C'est le TYPE qui décide lequel : l'action ne retient le lien que
              pour un séminaire en ligne, et le lieu sinon. Les masquer l'un
              après l'autre demanderait du JavaScript pour une règle que le
              serveur applique de toute façon.
            */}
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-lieu">
                  {t('admin.assoEvtLieu')}
                </label>
                <input className={styles.saisie} id="evt-lieu" name="lieu" maxLength={200} />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="evt-lien">
                  {t('admin.assoEvtLien')}
                </label>
                <input className={styles.saisie} id="evt-lien" name="lien" type="url" maxLength={500} />
              </div>
            </div>
            <p className={styles.aide}>{t('admin.assoEvtLieuAide')}</p>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="evt-description">
                {t('admin.assoEvtDescription')}
              </label>
              <textarea
                className={styles.saisie}
                id="evt-description"
                name="description"
                rows={2}
                maxLength={2000}
              />
            </div>

            <div className={styles.tiroirActions}>
              <a className={styles.boutonDiscret} href={lienFermer}>
                {t('admin.panneauAnnuler')}
              </a>
              <BoutonSoumission variante="primaire">{t('admin.assoEvtEnregistrer')}</BoutonSoumission>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
