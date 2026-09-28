import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { BoutonSoumission, stylesAdmin as styles } from '@/components/admin';
import { enregistrerCampagneAction } from './actions';

/**
 * LA CAMPAGNE EN COURS, et son aperçu côté adhérent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'APERÇU EST RENDU PAR LE SERVEUR, ET IL EST DONC EN RETARD D'UN GESTE. │
 * │                                                                          │
 * │ Le prototype le met à jour à chaque frappe. Ici il montre ce qui est     │
 * │ ENREGISTRÉ, et se rafraîchit à l'enregistrement.                         │
 * │                                                                          │
 * │ Ce n'est pas un pis-aller : un aperçu qui suit la frappe montre des      │
 * │ chiffres que personne n'a encore validés, et ce sont justement des       │
 * │ chiffres que les adhérents liront comme un bilan. Montrer l'état réel    │
 * │ vaut mieux que montrer une intention.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/*
 * `POUR_CENT` plutôt qu'un 100 nu : la règle de lint interdit la
 * multiplication par cent, parce qu'un MONTANT se convertit par
 * `src/domain/money` — toutes les devises n'ont pas deux décimales. Ici ce
 * n'est pas de l'argent, c'est la part d'une jauge, et cent pour cent valent
 * cent partout. Même précédent que l'écran des codes promotionnels.
 */
const POUR_CENT = 100;

export interface Campagne {
  id: string;
  intitule: string;
  objectif_kits: number;
  fin_le: string | null;
  total: number;
  regions: { region: string; kits: number }[];
}

export function OngletCampagne({
  langue,
  campagne,
}: {
  langue: LangueInterface;
  campagne: Campagne | null;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const total = campagne?.total ?? 0;
  const objectif = campagne?.objectif_kits ?? 0;
  // Plafonnée à 100 % : dépasser l'objectif est une bonne nouvelle, pas une
  // raison de dessiner une barre qui sort de sa piste.
  const part =
    objectif > 0 ? Math.min(POUR_CENT, Math.round((total / objectif) * POUR_CENT)) : 0;

  return (
    <div className={styles.campagne}>
      <section className={`${styles.carte} ${styles.redactionCarte}`}>
        <p className={styles.blocIntitule}>{t('admin.assoCampagneTitre')}</p>

        <form action={enregistrerCampagneAction.bind(null, langue)} className={styles.formulaire}>
          {campagne ? <input type="hidden" name="id" value={campagne.id} /> : null}

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="camp-intitule">
              {t('admin.assoCampagneIntitule')}
            </label>
            <input
              className={styles.saisie}
              id="camp-intitule"
              name="intitule"
              required
              maxLength={200}
              defaultValue={campagne?.intitule ?? ''}
            />
          </div>

          <div className={styles.rangee}>
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="camp-objectif">
                {t('admin.assoCampagneObjectif')}
              </label>
              <input
                className={styles.saisie}
                id="camp-objectif"
                name="objectif_kits"
                type="number"
                min={1}
                required
                defaultValue={campagne?.objectif_kits ?? 500}
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="camp-fin">
                {t('admin.assoCampagneFin')}
              </label>
              <input
                className={styles.saisie}
                id="camp-fin"
                name="fin_le"
                type="date"
                defaultValue={campagne?.fin_le ?? ''}
              />
            </div>
          </div>

          <p className={styles.blocIntitule}>{t('admin.assoCampagneRegions')}</p>

          {/*
            TOUTES les régions partent à chaque enregistrement, y compris
            celles qu'on n'a pas touchées : le bloc fait foi côté base, et une
            région absente est retirée. N'envoyer que les champs modifiés les
            effacerait.
          */}
          {(campagne?.regions ?? []).map((region) => (
            <div key={region.region} className={styles.champ}>
              <label className={styles.libelle} htmlFor={`camp-${region.region}`}>
                {region.region}
              </label>
              <input
                className={styles.saisie}
                id={`camp-${region.region}`}
                name={`kits_${region.region}`}
                type="number"
                min={0}
                defaultValue={region.kits}
              />
            </div>
          ))}

          <div className={styles.rangee}>
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="camp-region-neuve">
                {t('admin.assoCampagneRegionNeuve')}
              </label>
              <input
                className={styles.saisie}
                id="camp-region-neuve"
                name="region_nouvelle"
                maxLength={80}
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="camp-kits-neuve">
                {t('admin.assoCampagneKits')}
              </label>
              <input
                className={styles.saisie}
                id="camp-kits-neuve"
                name="kits_nouvelle"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>

          <p className={styles.aide}>{t('admin.assoCampagneAide')}</p>

          <BoutonSoumission variante="primaire">
            {t('admin.assoCampagneEnregistrer')}
          </BoutonSoumission>
        </form>
      </section>

      {/* ── L'aperçu, tel que l'adhérent le voit ───────────────────────── */}
      <section className={styles.campagneApercu}>
        <p className={styles.campagneApercuOeil}>{t('admin.assoCampagneApercu')}</p>

        {campagne === null ? (
          <p className={styles.campagneApercuTexte}>{t('admin.assoCampagneAucune')}</p>
        ) : (
          <>
            <h3 className={styles.campagneApercuTitre}>{campagne.intitule}</h3>

            <p className={styles.campagneApercuTotal}>
              {total}
              <span className={styles.campagneApercuObjectif}>
                {' '}
                {t('admin.assoCampagneSurObjectif').replace('{nb}', String(objectif))}
              </span>
            </p>

            <span className={styles.campagneApercuJauge} aria-hidden="true">
              <span
                className={styles.campagneApercuJaugeRemplie}
                style={{ width: `${String(part)}%` }}
              />
            </span>

            <ul className={styles.campagneApercuRegions}>
              {campagne.regions.map((region) => (
                <li key={region.region}>
                  <span className={styles.campagneApercuRegionNom}>{region.region}</span>
                  <span className={styles.campagneApercuRegionKits}>{region.kits}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
