import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import {
  BlocPanneau,
  BoutonSoumission,
  Panneau,
  stylesAdmin as styles,
} from '@/components/admin';
import { resilier } from './actions';

/**
 * LE PANNEAU D'UN ABONNEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX ACTIONS SUR LES QUATRE DU PROTOTYPE. DÉCISION DU 27 SEPTEMBRE 2026.│
 * │                                                                          │
 * │ RETENUES : résilier à la fin de la période payée, et revenir sur cette   │
 * │ résiliation avant le terme. Toutes deux passent par le PRESTATAIRE, et   │
 * │ le statut ne change qu'à l'arrivée de l'événement signé — règle 5 de     │
 * │ CLAUDE.md, qui vaut pour l'administration comme pour le client.          │
 * │                                                                          │
 * │ ÉCARTÉES :                                                               │
 * │                                                                          │
 * │  · « Offrir un mois » allongerait la période chez NOUS pendant que le    │
 * │    prestataire continue de prélever selon son calendrier. On se          │
 * │    désynchronise, et personne ne le voit avant la prochaine échéance ;   │
 * │  · « Résilier au prorata » contredit l'arbitrage de la route de          │
 * │    remboursement : rembourser partiellement supposerait de décider       │
 * │    quels titres restent accessibles ;                                    │
 * │  · « Relancer » suppose un système de relance qui n'existe pas — c'est   │
 * │    d'ailleurs pourquoi le bandeau des impayés ne promet plus de relance  │
 * │    automatique.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

type Observe = 'essai' | 'actif' | 'annule' | 'impaye' | 'expire' | 'anomalie';

interface Evenement {
  type: string;
  montant: number | null;
  devise: string | null;
  survenu_le: string;
}

export interface DetailAbonnement {
  id: string;
  nom: string | null;
  email: string | null;
  domaine: 'lecture' | 'association';
  offre: 'mensuel' | 'annuel';
  statut_observe: Observe;
  fin_periode: string | null;
  fin_acces: string | null;
  impaye_depuis: string | null;
  cree_le: string;
  devise: string;
  montant: number;
  acheteur_anonymise: boolean;
  historique: Evenement[];
}

/**
 * Le libellé d'un événement, et s'il s'agit d'un prélèvement.
 *
 * Seuls les ENCAISSEMENTS portent une étiquette « Payé » ou « Échoué ». Une
 * résiliation demandée n'est ni l'un ni l'autre, et l'étiqueter « Payé »
 * parce qu'elle figure dans l'historique des prélèvements mentirait.
 */
function lireEvenement(type: string): { cle: CleTraduction; issue: 'paye' | 'echoue' | null } {
  if (type === 'abonnement.souscrit') return { cle: 'admin.aboEvenementSouscrit', issue: 'paye' };
  if (type === 'abonnement.renouvele') return { cle: 'admin.aboEvenementRenouvele', issue: 'paye' };
  if (type === 'abonnement.prelevement_echoue') {
    return { cle: 'admin.aboEvenementEchoue', issue: 'echoue' };
  }
  if (type === 'abonnement.annule') return { cle: 'admin.aboEvenementAnnule', issue: null };
  if (type === 'abonnement.expire') return { cle: 'admin.aboEvenementExpire', issue: null };
  return { cle: 'admin.aboEvenementAutre', issue: null };
}

export function PanneauAbonnement({
  langue,
  abonnement,
  fermeture,
  formater,
  libelleStatut,
  teinteStatut,
  filtres,
}: {
  langue: LangueInterface;
  abonnement: DetailAbonnement;
  fermeture: string;
  /** Le formateur de la devise de CET abonnement, résolu par la page. */
  formater: (montant: number) => string;
  /** Libellé et teinte de l'étiquette : EXACTEMENT ceux de la ligne cliquée. */
  libelleStatut: string;
  teinteStatut: string | undefined;
  /** Les filtres courants, reportés pour que l'éditeur ne perde pas sa place. */
  filtres: { statut?: string; domaine?: string; q?: string };
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const anonyme = t('admin.nonPublie');
  const date = (iso: string | null): string =>
    iso
      ? new Date(iso).toLocaleDateString(langue, { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';

  /*
   * QUEL GESTE EST OFFERT, ET SUR QUEL ÉTAT.
   *
   * Un abonnement en cours se résilie ; un abonnement résilié se reprend —
   * tant que sa période court encore. Un impayé, un essai échu, un abonnement
   * terminé : rien à faire ici, et le pied ne porte que « Fermer ».
   */
  const geste: {
    valeur: string;
    libelle: CleTraduction;
    variante: 'primaire' | 'secondaire';
  } | null =
    abonnement.statut_observe === 'actif' || abonnement.statut_observe === 'essai'
      ? { valeur: 'resilier', libelle: 'admin.aboResilier', variante: 'secondaire' }
      : abonnement.statut_observe === 'annule'
        ? { valeur: 'reprendre', libelle: 'admin.aboReprendre', variante: 'primaire' }
        : null;

  const formule = t(
    abonnement.domaine === 'association'
      ? 'admin.aboFormuleAssociation'
      : 'admin.aboFormuleLecture',
  );

  /*
   * QUELLE DATE, ET SOUS QUEL NOM.
   *
   * Un abonnement actif a une prochaine échéance ; une fin programmée, une
   * date où il prend fin ; un abonnement terminé, une date où il l'a été.
   * C'est la même colonne en base, mais trois questions différentes, et la
   * dernière — pour un impayé échu — ne se lit pas sur `fin_periode` : la
   * base rend `fin_acces`, la fin de la grâce.
   */
  const echeance: { cle: CleTraduction; valeur: string | null } =
    abonnement.statut_observe === 'annule'
      ? { cle: 'admin.aboPrendFinLe', valeur: abonnement.fin_periode }
      : abonnement.statut_observe === 'expire'
        ? { cle: 'admin.aboTermineLeLong', valeur: abonnement.fin_acces }
        : { cle: 'admin.aboProchaineEcheance', valeur: abonnement.fin_periode };

  return (
    <Panneau
      langue={langue}
      oeil={formule}
      titre={abonnement.acheteur_anonymise ? anonyme : (abonnement.nom ?? anonyme)}
      fermeture={fermeture}
      pied={
        /*
         * Le formulaire est DANS le pied : `BoutonSoumission` lit
         * `useFormStatus`, qui n'existe que sous un `<form>`. Une demande part
         * vers le prestataire, elle peut prendre une seconde, et l'éditeur
         * doit voir qu'elle est en cours plutôt que de presser deux fois.
         */
        geste ? (
          <form action={resilier.bind(null, langue)} className={styles.tiroirActions}>
            <input type="hidden" name="abonnement" value={abonnement.id} />
            <input type="hidden" name="geste" value={geste.valeur} />
            {filtres.statut ? <input type="hidden" name="statut" value={filtres.statut} /> : null}
            {filtres.domaine ? (
              <input type="hidden" name="domaine" value={filtres.domaine} />
            ) : null}
            {filtres.q ? <input type="hidden" name="q" value={filtres.q} /> : null}

            <a className={styles.boutonDiscret} href={fermeture}>
              {t('admin.panneauFermer')}
            </a>
            <BoutonSoumission variante={geste.variante}>{t(geste.libelle)}</BoutonSoumission>
          </form>
        ) : (
          <a className={styles.boutonDiscret} href={fermeture}>
            {t('admin.panneauFermer')}
          </a>
        )
      }
    >
      {/* ── 1. L'état, et qui ───────────────────────────────────────────── */}
      <div className={styles.tiroirEtat}>
        <span className={`${styles.etat} ${teinteStatut ?? ''}`}>{libelleStatut}</span>
        {abonnement.acheteur_anonymise ? null : (
          <p className={styles.tiroirMeta}>{abonnement.email ?? ''}</p>
        )}
      </div>

      {/* ── 2. Les quatre faits ─────────────────────────────────────────── */}
      <div className={styles.tiroirGrille}>
        <div className={styles.tiroirFait}>
          <p className={styles.tiroirBlocTitre}>{t('admin.colFormule')}</p>
          <p className={styles.tiroirFaitValeur}>{formule}</p>
          <p className={styles.tiroirMeta}>
            {formater(abonnement.montant)}{' '}
            {t(abonnement.offre === 'annuel' ? 'admin.aboParAnLong' : 'admin.aboParMoisLong')}
          </p>
        </div>

        {/*
          Le moyen de paiement d'un abonnement n'est pas conservé : le
          prestataire ne le rapporte pas dans l'événement de souscription. Un
          tiret dit « inconnu » ; inventer « Carte » dirait autre chose.
        */}
        <div className={styles.tiroirFait}>
          <p className={styles.tiroirBlocTitre}>{t('admin.aboMoyen')}</p>
          <p className={styles.tiroirFaitValeur}>{t('admin.moyenInconnu')}</p>
        </div>

        <div className={styles.tiroirFait}>
          <p className={styles.tiroirBlocTitre}>{t('admin.aboDepuisLong')}</p>
          <p className={styles.tiroirFaitValeur}>{date(abonnement.cree_le)}</p>
        </div>

        <div className={styles.tiroirFait}>
          <p className={styles.tiroirBlocTitre}>{t(echeance.cle)}</p>
          <p className={styles.tiroirFaitValeur}>{date(echeance.valeur)}</p>
        </div>
      </div>

      {/* ── 3. L'impayé, dit pour ce qu'il est ──────────────────────────── */}
      {abonnement.statut_observe === 'impaye' ? (
        <div className={styles.avertissement}>
          <p className={styles.tiroirNom}>{t('admin.aboImpayeTitre')}</p>
          <p className={styles.tiroirMeta}>
            {t('admin.aboImpayeTexte')} {date(abonnement.fin_acces)}.
          </p>
        </div>
      ) : null}

      {/* ── 4. L'historique, tel que le prestataire l'a rapporté ────────── */}
      <BlocPanneau titre={t('admin.aboHistorique')}>
        {abonnement.historique.length === 0 ? (
          <p className={styles.tiroirMeta}>{t('admin.aboHistoriqueVide')}</p>
        ) : (
          abonnement.historique.map((evenement, rang) => {
            const lu = lireEvenement(evenement.type);
            return (
              <div key={`${evenement.survenu_le}-${String(rang)}`} className={styles.tiroirLigne}>
                <div>
                  <p className={styles.tiroirLigneNom}>{t(lu.cle)}</p>
                  <p className={styles.tiroirLigneType}>{date(evenement.survenu_le)}</p>
                </div>
                <div className={styles.tiroirEtat}>
                  {/*
                    Le montant n'apparaît QUE s'il a été rapporté. Un événement
                    sans montant n'en reçoit pas un d'office — celui de la
                    formule, par exemple — parce qu'on afficherait alors une
                    somme que personne n'a confirmé avoir encaissée.
                  */}
                  {evenement.montant !== null ? (
                    <p className={styles.tiroirLignePrix}>{formater(evenement.montant)}</p>
                  ) : null}
                  {lu.issue ? (
                    <span
                      className={`${styles.etat} ${
                        lu.issue === 'paye' ? styles.etatPublie : styles.etatAccent
                      }`}
                    >
                      {t(lu.issue === 'paye' ? 'admin.aboPaye' : 'admin.aboEchoue')}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </BlocPanneau>
    </Panneau>
  );
}
