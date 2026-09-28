import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import {
  BlocPanneau,
  BoutonSoumission,
  Panneau,
  stylesAdmin as styles,
} from '@/components/admin';
import { enregistrerOffre, supprimerOffre } from './actions';

/**
 * LE PANNEAU D'UNE OFFRE — création et modification.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS CHAMPS DU PROTOTYPE NE SONT PAS ICI, ET CHACUN A SA RAISON.       │
 * │                                                                          │
 * │  · « Ce que l'offre ouvre » / « n'ouvre pas » — une LISTE éditable par    │
 * │    formule. La page publique des Offres ne lit pas la base pour ces       │
 * │    lignes : elles sont figées en internationalisation, une fois par       │
 * │    NATURE de carte (abonnement, adhésion, achat à l'unité), et non par    │
 * │    formule. Un éditeur les remplirait ici sans que le site change —       │
 * │    c'est-à-dire un écran qui promet ce qu'il ne tient pas. Les rendre     │
 * │    éditables demande de refondre la page publique : décision du           │
 * │    propriétaire, pas effet de bord d'un habillage.                       │
 * │                                                                          │
 * │  · « Appliquer le nouveau prix aux abonnés actuels » — aucun des deux     │
 * │    prestataires ne sait faire de prélèvement récurrent : le faux ne       │
 * │    prélève rien, et Notch Pay n'a pas de récurrence (`docs/NOTCHPAY.md`). │
 * │    L'interrupteur ne pourrait donc rien appliquer. Même famille que       │
 * │    « Offrir un mois », écarté sur le tiroir des abonnements.              │
 * │                                                                          │
 * │  · « Aperçu sur le site », mis à jour à chaque frappe — il montrerait une │
 * │    carte que le site ne rend PAS ainsi, tant que le point précédent n'est │
 * │    pas tranché. Un aperçu faux est pire qu'un aperçu absent.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PÉRIODICITÉ ET LE DOMAINE NE SE MODIFIENT PAS.                       │
 * │                                                                          │
 * │ Le prototype met un segmenté Mensuel / Annuel dans les deux cas. La base │
 * │ refuse le changement après création (migration 0068), et le refus est    │
 * │ juste : un abonné a souscrit à une périodicité, la lui changer sous les   │
 * │ pieds déplacerait son échéance. Le choix n'apparaît donc QU'À la          │
 * │ création, là où il décide encore de quelque chose.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const ZONES = ['afrique', 'international'] as const;
const DEVISES = ['XAF', 'XOF', 'EUR'] as const;
const PERIODES = ['mensuel', 'annuel'] as const;
const DOMAINES = ['lecture', 'association'] as const;

export interface PrixZone {
  montant: number;
  devise: string;
}

export interface OffreEditable {
  id: string;
  code: string;
  domaine: 'lecture' | 'association';
  periode: 'mensuel' | 'annuel';
  libelle_fr: string;
  libelle_en: string;
  descriptif_fr: string | null;
  descriptif_en: string | null;
  actif: boolean;
  ordre: number;
  prix: Record<string, PrixZone>;
  abonnements: number;
}

export function PanneauOffre({
  langue,
  offre,
  fermeture,
}: {
  langue: LangueInterface;
  /** `null` : c'est une création. */
  offre: OffreEditable | null;
  fermeture: string;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const creation = offre === null;

  return (
    <Panneau
      langue={langue}
      oeil={t(creation ? 'admin.offreNouvelle' : 'admin.offreModifier')}
      titre={creation ? t('admin.offreSansNom') : offre.libelle_fr}
      fermeture={fermeture}
      pied={
        /*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ LE FORMULAIRE EST DÉCLARÉ ICI, LES CHAMPS S'Y RATTACHENT PAR     │
         * │ `form=`.                                                         │
         * │                                                                  │
         * │ `BoutonSoumission` lit `useFormStatus`, qui n'existe que sous un  │
         * │ `<form>` ; et le pied du tiroir est rendu hors du corps.          │
         * │ L'attribut `form` rattache chaque champ au formulaire par son     │
         * │ identifiant — c'est du HTML, pas un contournement, et il évite    │
         * │ d'imbriquer deux formulaires ou de dupliquer le bouton.           │
         * └──────────────────────────────────────────────────────────────────┘
         */
        <form
          id="offre-formulaire"
          action={enregistrerOffre.bind(null, langue)}
          className={styles.tiroirActions}
        >
          {creation ? null : <input type="hidden" name="id" value={offre.id} />}

          <a className={styles.boutonDiscret} href={fermeture}>
            {t('admin.panneauAnnuler')}
          </a>
          <BoutonSoumission variante="primaire">{t('admin.offreEnregistrer')}</BoutonSoumission>
        </form>
      }
    >
      <BlocPanneau titre={t('admin.offreIdentite')}>
        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor="offre-libelle-fr">
            {t('admin.offreLibelleFr')}
          </label>
          <input
            className={styles.saisie}
            id="offre-libelle-fr"
            name="libelle_fr"
            form="offre-formulaire"
            type="text"
            required
            maxLength={120}
            defaultValue={offre?.libelle_fr ?? ''}
          />
        </p>

        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor="offre-libelle-en">
            {t('admin.offreLibelleEn')}
          </label>
          <input
            className={styles.saisie}
            id="offre-libelle-en"
            name="libelle_en"
            form="offre-formulaire"
            type="text"
            required
            maxLength={120}
            defaultValue={offre?.libelle_en ?? ''}
          />
        </p>

        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor="offre-descriptif-fr">
            {t('admin.offreDescriptifFr')}
          </label>
          <textarea
            className={styles.saisie}
            id="offre-descriptif-fr"
            name="descriptif_fr"
            form="offre-formulaire"
            rows={2}
            maxLength={400}
            defaultValue={offre?.descriptif_fr ?? ''}
          />
        </p>

        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor="offre-descriptif-en">
            {t('admin.offreDescriptifEn')}
          </label>
          <textarea
            className={styles.saisie}
            id="offre-descriptif-en"
            name="descriptif_en"
            form="offre-formulaire"
            rows={2}
            maxLength={400}
            defaultValue={offre?.descriptif_en ?? ''}
          />
        </p>
      </BlocPanneau>

      <BlocPanneau titre={t('admin.offreNature')}>
        {creation ? (
          <>
            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="offre-code">
                {t('admin.offreCode')}
              </label>
              <input
                className={styles.saisie}
                id="offre-code"
                name="code"
                form="offre-formulaire"
                type="text"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                aria-describedby="offre-code-aide"
              />
            </p>
            <p className={styles.aide} id="offre-code-aide">
              {t('admin.offreCodeAide')}
            </p>

            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="offre-domaine">
                {t('admin.offreDomaine')}
              </label>
              <select
                className={styles.saisie}
                id="offre-domaine"
                name="domaine"
                form="offre-formulaire"
                defaultValue="lecture"
              >
                {DOMAINES.map((domaine) => (
                  <option key={domaine} value={domaine}>
                    {t(`admin.offreDomaine_${domaine}` as CleTraduction)}
                  </option>
                ))}
              </select>
            </p>

            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="offre-periode">
                {t('admin.offrePeriode')}
              </label>
              <select
                className={styles.saisie}
                id="offre-periode"
                name="periode"
                form="offre-formulaire"
                defaultValue="mensuel"
              >
                {PERIODES.map((periode) => (
                  <option key={periode} value={periode}>
                    {t(`admin.offrePeriode_${periode}` as CleTraduction)}
                  </option>
                ))}
              </select>
            </p>
          </>
        ) : (
          <p className={styles.tiroirMeta}>
            {t(`admin.offreDomaine_${offre.domaine}` as CleTraduction)}
            {' · '}
            {t(`admin.offrePeriode_${offre.periode}` as CleTraduction)}
            {' · '}
            {offre.code}
          </p>
        )}
        <p className={styles.aide}>{t('admin.offreNatureFigee')}</p>
      </BlocPanneau>

      {/*
        LE PRIX PART DANS LA PLUS PETITE UNITÉ DE SA DEVISE.

        799 pour 7,99 €, 2500 pour 2 500 FCFA. Le franc CFA n'a pas de
        sous-unité : une multiplication par cent choisie selon la devise serait
        une règle de conversion écrite dans un écran. L'aide dit l'unité.
      */}
      <BlocPanneau titre={t('admin.offrePrixParZone')}>
        {ZONES.map((zone) => {
          const existant = offre?.prix[zone];
          return (
            <div key={zone} className={styles.tiroirGrille}>
              <p className={styles.champ}>
                <label className={styles.libelle} htmlFor={`offre-montant-${zone}`}>
                  {t(`admin.conteZone_${zone}` as CleTraduction)}
                </label>
                <input
                  className={styles.saisie}
                  id={`offre-montant-${zone}`}
                  name={`montant_${zone}`}
                  form="offre-formulaire"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  defaultValue={existant ? String(existant.montant) : ''}
                />
              </p>

              <p className={styles.champ}>
                <label className={styles.libelle} htmlFor={`offre-devise-${zone}`}>
                  {t('admin.colDevise')}
                </label>
                <select
                  className={styles.saisie}
                  id={`offre-devise-${zone}`}
                  name={`devise_${zone}`}
                  form="offre-formulaire"
                  defaultValue={existant?.devise ?? (zone === 'afrique' ? 'XAF' : 'EUR')}
                >
                  {DEVISES.map((devise) => (
                    <option key={devise} value={devise}>
                      {devise}
                    </option>
                  ))}
                </select>
              </p>
            </div>
          );
        })}
        <p className={styles.aide}>{t('admin.offrePrixAide')}</p>
      </BlocPanneau>

      <BlocPanneau titre={t('admin.offreMiseEnVente')}>
        {creation ? (
          /*
           * Une offre NAÎT HORS VENTE, et la route ne l'accepte même pas
           * autrement. Un interrupteur ici laisserait croire le contraire.
           */
          <p className={styles.aide}>{t('admin.offreNaitHorsVente')}</p>
        ) : (
          <>
            <div className={styles.interrupteur}>
              <input
                className={styles.interrupteurCase}
                id="offre-actif"
                name="actif"
                form="offre-formulaire"
                type="checkbox"
                value="oui"
                defaultChecked={offre.actif}
              />
              <span>
                <label className={styles.interrupteurNom} htmlFor="offre-actif">
                  {t('admin.offreVisible')}
                </label>
                <span className={styles.interrupteurNote}>{t('admin.offreVisibleNote')}</span>
              </span>
            </div>

            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor="offre-ordre">
                {t('admin.offreOrdre')}
              </label>
              <input
                className={styles.saisie}
                id="offre-ordre"
                name="ordre"
                form="offre-formulaire"
                type="number"
                min={0}
                max={999}
                step={1}
                defaultValue={String(offre.ordre)}
              />
            </p>
          </>
        )}
      </BlocPanneau>

      {/*
        LA SUPPRESSION RESTE OFFERTE, ET LE PROTOTYPE NE LA PORTE PAS.

        Son tiroir n'a que « Annuler » et « Enregistrer ». Sans ce bloc, une
        offre saisie par erreur ne pourrait plus jamais quitter l'ecran :
        aucun autre geste ne l'efface, et la desactiver la laisse dans la
        liste. Le bouton disparait des qu'un abonnement s'y rattache — la base
        refuserait de toute facon (migration 0068 : une offre souscrite se
        desactive, elle ne s'efface pas), et proposer un geste voue a l'echec
        fait perdre un aller-retour.

        Ce formulaire est le FRERE de celui du pied, jamais son enfant : deux
        formulaires imbriques sont du HTML invalide, et le navigateur en
        deposerait un sans rien dire.
      */}
      {creation || offre.abonnements > 0 ? null : (
        <BlocPanneau titre={t('admin.offreSupprimer')}>
          <form action={supprimerOffre.bind(null, langue)} className={styles.formulaireNu}>
            <input type="hidden" name="id" value={offre.id} />
            <BoutonSoumission variante="danger">{t('admin.offreSupprimer')}</BoutonSoumission>
          </form>
          <p className={styles.aide}>{t('admin.offreSuppressionAide')}</p>
        </BlocPanneau>
      )}
    </Panneau>
  );
}
