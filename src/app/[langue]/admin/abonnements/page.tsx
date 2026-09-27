import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import {
  compterAbonnementsParDomaine,
  compterAbonnementsParStatut,
  lireAbonnement,
  listerAbonnements,
  statsAbonnements,
} from '@/lib/admin/service';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { PanneauAbonnement, type DetailAbonnement } from './panneau-abonnement';

/**
 * LES ABONNEMENTS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST `statut_observe` QUI EST AFFICHÉ, JAMAIS `statut`.                │
 * │                                                                          │
 * │ `statut` est ce que le prestataire a rapporté la dernière fois. Il ne    │
 * │ vieillit pas tout seul : un abonnement annulé dont la période payée est  │
 * │ échue reste `annule` en base, alors qu'il n'ouvre plus rien.             │
 * │                                                                          │
 * │ `statut_observe` est calculé par `statut_effectif` EN BASE, en repliant  │
 * │ les dates contre `app_now()` — la même horloge injectable que le reste   │
 * │ du projet. Il porte en plus `anomalie` : période payée échue sans        │
 * │ qu'aucun événement ne soit arrivé, c'est-à-dire presque toujours un      │
 * │ webhook perdu.                                                           │
 * │                                                                          │
 * │ Recalculer ici « expiré si `fin_periode` est passée » serait la seconde  │
 * │ définition de l'état d'un abonnement, et la seule que personne ne        │
 * │ testerait. C'est ce que CLAUDE.md interdit à l'interface, et c'est le    │
 * │ bug classique de ce type de plateforme.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES LIBELLÉS SONT CEUX DU PROTOTYPE, PLUS CEUX DU LECTEUR.              │
 * │                                                                          │
 * │ Décision du propriétaire du 27 septembre 2026. Cet écran reprenait les   │
 * │ mots du lecteur, pour qu'au téléphone l'éditeur lise ce que le client    │
 * │ lit. Mais « Annulé » laissait croire que l'accès était coupé, alors qu'il│
 * │ court jusqu'à l'échéance — la confusion même que ce dépôt combat.        │
 * │ « Fin programmée » dit la vérité à l'éditeur ; le lecteur garde ses mots.│
 * │                                                                          │
 * │ `essai` et `anomalie` n'existent pas dans le prototype. Leurs segments   │
 * │ n'apparaissent que s'ils ont au moins une ligne : un filtre toujours     │
 * │ vide encombrerait la barre, un filtre caché masquerait des données.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Observe = 'essai' | 'actif' | 'annule' | 'impaye' | 'expire' | 'anomalie';
type Domaine = 'lecture' | 'association';

/** Une ligne rendue par `admin_lister_abonnements` (migration 0092). */
interface LigneAbonnement {
  id: string;
  nom: string | null;
  email: string | null;
  domaine: Domaine;
  offre: 'mensuel' | 'annuel';
  statut_observe: Observe;
  fin_periode: string | null;
  fin_acces: string | null;
  cree_le: string;
  devise: string;
  montant: number;
}

interface LigneStats {
  abonnes_lecture: number;
  adherents_association: number;
  nb_impayes: number;
  nb_anomalies: number;
  recurrent_par_devise: { devise: string; mensuel: number }[];
}

/** L'ordre du prototype, puis les deux statuts qu'il ne connaît pas. */
const STATUTS: readonly Observe[] = ['actif', 'impaye', 'annule', 'expire', 'essai', 'anomalie'];
const HORS_PROTOTYPE: readonly Observe[] = ['essai', 'anomalie'];
const DOMAINES: readonly Domaine[] = ['lecture', 'association'];

const LIBELLE_STATUT: Record<Observe, CleTraduction> = {
  actif: 'admin.aboStatutActif',
  essai: 'admin.aboStatutEssai',
  impaye: 'admin.aboStatutImpaye',
  annule: 'admin.aboStatutAnnule',
  expire: 'admin.aboStatutExpire',
  anomalie: 'admin.aboStatutAnomalie',
};

/**
 * La teinte : celle que le prototype attribue, et `anomalie` avec le
 * terracotta — non parce qu'elle est grave, mais parce qu'elle est la seule
 * ligne sur laquelle il y a quelque chose à faire.
 */
const ETAT_STATUT: Record<Observe, string | undefined> = {
  actif: styles.etatPublie,
  essai: styles.etatPublie,
  impaye: styles.etatAccent,
  annule: styles.etatAlerte,
  expire: styles.etatBrouillon,
  anomalie: styles.etatAlerte,
};

const LIBELLE_DOMAINE: Record<Domaine, CleTraduction> = {
  lecture: 'admin.aboLecture',
  association: 'admin.aboAdhesion',
};

const FORMULE_DOMAINE: Record<Domaine, CleTraduction> = {
  lecture: 'admin.aboFormuleLecture',
  association: 'admin.aboFormuleAssociation',
};

/** Les cotes du tableau, reprises du prototype d'administration. */
const COLONNES = 'minmax(0, 1.4fr) minmax(0, 1fr) 110px 120px 110px 150px 16px';
const LARGEUR_MIN = '800px';

function premier(brut: string | string[] | undefined): string | undefined {
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return valeur && valeur.length > 0 ? valeur : undefined;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.abonnements'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminAbonnements({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const demande = premier(requete['statut']);
  const statut = STATUTS.includes(demande as Observe) ? (demande as Observe) : undefined;
  const demandeDomaine = premier(requete['domaine']);
  const domaine = DOMAINES.includes(demandeDomaine as Domaine)
    ? (demandeDomaine as Domaine)
    : undefined;
  const q = premier(requete['q']);
  const ouvert = premier(requete['abonnement']);

  /*
   * La bande de chiffres n'est PAS filtrée : elle dit l'état de la boutique,
   * les filtres disent ce qu'on regarde. Même règle que les commandes.
   */
  const [resultat, stats, parStatutBrut, parDomaineBrut, reglages, detail] = await Promise.all([
    listerAbonnements({
      statut: statut ?? null,
      domaine: domaine ?? null,
      recherche: q ?? null,
      page: 1,
      taille: 50,
    }).catch(() => null),
    statsAbonnements().catch(() => null),
    compterAbonnementsParStatut({ domaine: domaine ?? null, recherche: q ?? null }).catch(
      () => null,
    ),
    compterAbonnementsParDomaine({ statut: statut ?? null, recherche: q ?? null }).catch(
      () => null,
    ),
    /*
     * La durée de grâce est LUE, jamais écrite : le prototype dit « 7 jours »
     * en dur, et c'est la valeur du jour — mais elle se règle depuis
     * l'administration, et une phrase figée mentirait au premier réglage.
     */
    getBusinessSettings().catch(() => null),
    ouvert ? lireAbonnement(ouvert).catch(() => null) : Promise.resolve(null),
  ]);

  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const abonnements = resultat.donnees as unknown as LigneAbonnement[];
  const chiffres = stats?.ok ? (stats.donnees as unknown as LigneStats[])[0] : undefined;
  const parStatut = new Map(
    ((parStatutBrut?.ok ? parStatutBrut.donnees : []) as { statut: string; nb: number }[]).map(
      (l) => [l.statut, Number(l.nb)],
    ),
  );
  const parDomaine = new Map(
    ((parDomaineBrut?.ok ? parDomaineBrut.donnees : []) as { domaine: string; nb: number }[]).map(
      (l) => [l.domaine, Number(l.nb)],
    ),
  );

  const abonnementOuvert =
    detail?.ok && Array.isArray(detail.donnees) && detail.donnees.length > 0
      ? (detail.donnees[0] as DetailAbonnement)
      : null;

  /* UN formateur par devise présente, résolu une seule fois. */
  const devises = [
    ...new Set([
      ...abonnements.map((a) => a.devise),
      ...(chiffres?.recurrent_par_devise ?? []).map((r) => r.devise),
      ...(abonnementOuvert ? [abonnementOuvert.devise] : []),
    ]),
  ];
  const monnaies = new Map(
    await Promise.all(devises.map(async (c) => [c, await lireDevise(c)] as const)),
  );
  const afficher = (montant: number, code: string): string => {
    const monnaie = monnaies.get(code);
    return monnaie ? formateur(monnaie)(montant) : `${String(montant)} ${code}`;
  };
  const nomDevise = (code: string): string => {
    const symbole = monnaies.get(code)?.symbole ?? '';
    return symbole.length > 1 ? symbole : code;
  };

  const date = (iso: string | null, options: Intl.DateTimeFormatOptions): string =>
    iso ? new Date(iso).toLocaleDateString(langue, options) : '—';
  const jourMoisAn: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const moisAn: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };

  const base = `/${langue}/admin/abonnements`;
  const lien = (modif: { statut?: string; domaine?: string; abonnement?: string }): string => {
    const params = new URLSearchParams();
    const s = 'statut' in modif ? modif.statut : statut;
    const d = 'domaine' in modif ? modif.domaine : domaine;
    if (s) params.set('statut', s);
    if (d) params.set('domaine', d);
    if (q) params.set('q', q);
    if (modif.abonnement) params.set('abonnement', modif.abonnement);
    const chaine = params.toString();
    return chaine ? `${base}?${chaine}` : base;
  };

  const decompte = `${String(abonnements.length)} ${t(
    abonnements.length === 1 ? 'admin.decompteAbonnementUn' : 'admin.decompteAbonnements',
  )}`;

  /* Les statuts hors prototype n'ont de segment que s'ils ont des lignes. */
  const segments = STATUTS.filter(
    (valeur) =>
      !HORS_PROTOTYPE.includes(valeur) || (parStatut.get(valeur) ?? 0) > 0 || statut === valeur,
  );

  const impayes = chiffres?.nb_impayes ?? 0;
  const anomalies = chiffres?.nb_anomalies ?? 0;

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/abonnements"
      titre={t('admin.abonnements')}
      sousTitre={t('admin.abonnementsSousTitreV3')}
    >
      {/* ── La bande de chiffres ──────────────────────────────────────────── */}
      {chiffres ? (
        <div className={`${styles.carte} ${styles.bandeau}`}>
          <ul className={styles.bandeauGrille}>
            <li className={styles.bandeauCellule}>
              <span className={styles.bandeauIntitule}>{t('admin.aboAbonnesLecture')}</span>
              <span className={`${styles.bandeauValeur} ${styles.bandeauValeurVentes}`}>
                {chiffres.abonnes_lecture}
              </span>
              <span className={styles.bandeauNote}>{t('admin.aboActifsNote')}</span>
            </li>
            <li className={styles.bandeauCellule}>
              <span className={styles.bandeauIntitule}>{t('admin.aboAdherents')}</span>
              <span className={`${styles.bandeauValeur} ${styles.bandeauValeurVentes}`}>
                {chiffres.adherents_association}
              </span>
              <span className={styles.bandeauNote}>{t('admin.aboActifsNote')}</span>
            </li>
            {/*
              UNE cellule de récurrent PAR DEVISE, jamais un total : il n'existe
              pas de taux de change dans la boutique, et un nombre qui en
              supposerait un ne serait prélevé nulle part.
            */}
            {chiffres.recurrent_par_devise.map((ligne) => (
              <li key={ligne.devise} className={styles.bandeauCellule}>
                <span className={styles.bandeauIntitule}>
                  {t('admin.aboRecurrent')} · {nomDevise(ligne.devise)}
                </span>
                <span className={`${styles.bandeauValeur} ${styles.bandeauValeurVentes}`}>
                  {afficher(ligne.mensuel, ligne.devise)}
                </span>
                <span className={styles.bandeauNote}>{t('admin.aboRecurrentNote')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Le bandeau des impayés, s'il y en a ───────────────────────────── */}
      {impayes > 0 ? (
        <div className={`${styles.avertissement} ${styles.avertissementLigne}`}>
          <span className={styles.avertissementChiffre}>{impayes}</span>
          <div className={styles.avertissementBloc}>
            <p className={styles.avertissementTitre}>{t('admin.aboImpayesTitre')}</p>
            {/*
              La phrase du prototype continue par « Une relance part
              automatiquement à J+1 et J+4 ». Aucune relance n'existe dans ce
              dépôt : l'écrire annoncerait à l'éditeur un envoi qui n'a jamais
              lieu, et il attendrait un règlement que personne n'a demandé.
            */}
            <p className={styles.avertissementTexte}>
              {t('admin.aboImpayesTexteAvant')} {reglages?.periodeGraceJours ?? '—'}{' '}
              {t('admin.aboImpayesTexteApres')}
            </p>
          </div>
          <a className={styles.boutonSecondaire} href={lien({ statut: 'impaye' })}>
            {t('admin.aboVoirImpayes')}
          </a>
        </div>
      ) : null}

      {/* ── Recherche et filtres, dans une seule carte ────────────────────── */}
      <div className={`${styles.carte} ${styles.filtresCarte}`}>
        <form method="get" action={base} className={styles.filtresLigne} role="search">
          {statut ? <input type="hidden" name="statut" value={statut} /> : null}
          {domaine ? <input type="hidden" name="domaine" value={domaine} /> : null}

          <div className={styles.rechercheChamp}>
            <button
              type="submit"
              className={styles.rechercheEnvoi}
              aria-label={t('catalogue.rechercheAction')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder={t('admin.aboRecherche')}
              className={styles.rechercheSaisieOrganic}
              aria-label={t('catalogue.recherche')}
            />
          </div>

          <p className={`${styles.decompte} ${styles.decompteVentes}`}>{decompte}</p>
        </form>

        <div className={styles.filtresBarres}>
          {/*
            « Toutes » et « Tous » ne portent PAS de compteur, contrairement à
            l'écran des commandes : c'est ce que le prototype dessine ici, et le
            total est déjà dit par le décompte, deux centimètres plus haut.
          */}
          <nav className={styles.seg} aria-label={t('admin.colFormule')}>
            <a
              className={domaine ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
              href={lien({ domaine: undefined })}
              aria-current={domaine ? undefined : 'true'}
            >
              {t('admin.aboToutes')}
            </a>
            {DOMAINES.map((valeur) => {
              const actif = domaine === valeur;
              return (
                <a
                  key={valeur}
                  className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
                  href={lien({ domaine: valeur })}
                  aria-current={actif ? 'true' : undefined}
                >
                  {t(LIBELLE_DOMAINE[valeur])}
                  <span className={styles.segCompte}>{parDomaine.get(valeur) ?? 0}</span>
                </a>
              );
            })}
          </nav>

          <nav className={styles.seg} aria-label={t('admin.colStatut')}>
            <a
              className={statut ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
              href={lien({ statut: undefined })}
              aria-current={statut ? undefined : 'true'}
            >
              {t('admin.aboTous')}
            </a>
            {segments.map((valeur) => {
              const actif = statut === valeur;
              return (
                <a
                  key={valeur}
                  className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
                  href={lien({ statut: valeur })}
                  aria-current={actif ? 'true' : undefined}
                >
                  {t(LIBELLE_STATUT[valeur])}
                  <span className={styles.segCompte}>{parStatut.get(valeur) ?? 0}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Le tableau ────────────────────────────────────────────────────── */}
      <div className={`${styles.carte} ${styles.grilleCadre}`}>
        {abonnements.length === 0 ? (
          <p className={styles.grilleVide}>{t('admin.aboVide')}</p>
        ) : (
          <table
            className={styles.grille}
            role="table"
            style={{ '--grille-colonnes': COLONNES, '--grille-min': LARGEUR_MIN } as CSSProperties}
          >
            <thead role="rowgroup">
              <tr className={`${styles.grilleEntete} ${styles.grilleEnteteVentes}`} role="row">
                <th scope="col" role="columnheader">
                  {t('admin.colAbonne')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colFormule')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colDepuis')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colEcheance')}
                </th>
                <th scope="col" role="columnheader" className={styles.grilleColPrix}>
                  {t('admin.colMontant')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colStatut')}
                </th>
                <th scope="col" role="columnheader">
                  <span className="sr-only">{t('admin.colOuvrir')}</span>
                </th>
              </tr>
            </thead>

            <tbody role="rowgroup">
              {abonnements.map((abonnement) => {
                const anonyme = t('admin.nonPublie');
                const termine = abonnement.statut_observe === 'expire';

                return (
                  <tr key={abonnement.id} className={`${styles.grilleRangee} ${styles.venteRangee}`} role="row">
                    <td role="cell">
                      {/* Le nom EST le lien, comme le numéro d'une commande. */}
                      <p className={`${styles.venteFort} ${styles.venteCoupe}`}>
                        <a className={styles.venteLien} href={lien({ abonnement: abonnement.id })}>
                          {abonnement.nom ?? anonyme}
                        </a>
                      </p>
                      <p className={`${styles.venteLigne2} ${styles.venteCoupe}`}>
                        {abonnement.email ?? ''}
                      </p>
                    </td>

                    <td role="cell">
                      <p className={styles.venteDemi}>{t(FORMULE_DOMAINE[abonnement.domaine])}</p>
                    </td>

                    <td role="cell" className={styles.venteTexte}>
                      {date(abonnement.cree_le, moisAn)}
                    </td>

                    {/*
                      Un abonnement terminé affiche QUAND il l'a été. Pour un
                      impayé, c'est la fin de la grâce, pas la fin de la période
                      payée — la base la calcule avec la même fonction que
                      celle qui décide que l'abonnement est échu.
                    */}
                    <td role="cell" className={styles.venteTexte}>
                      {termine
                        ? `${t('admin.aboTermineLe')} ${date(abonnement.fin_acces, jourMoisAn)}`
                        : date(abonnement.fin_acces, jourMoisAn)}
                    </td>

                    <td role="cell" className={`${styles.grilleMontant} ${styles.grilleMontantAbonnement}`}>
                      {afficher(abonnement.montant, abonnement.devise)}{' '}
                      {t(abonnement.offre === 'annuel' ? 'admin.aboParAn' : 'admin.aboParMois')}
                    </td>

                    <td role="cell">
                      <span className={`${styles.etat} ${ETAT_STATUT[abonnement.statut_observe]}`}>
                        {t(LIBELLE_STATUT[abonnement.statut_observe])}
                      </span>
                    </td>

                    <td role="cell">
                      <svg
                        className={styles.grilleChevron}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── La ligne de santé ─────────────────────────────────────────────── */}
      {anomalies > 0 ? (
        <p className={styles.sante}>
          <span className={`${styles.santePastille} ${styles.santePastilleAlerte}`} aria-hidden="true" />
          <span>
            {anomalies}{' '}
            {t(anomalies === 1 ? 'admin.aboSanteAnomalieUn' : 'admin.aboSanteAnomalies')}{' '}
            <a href={lien({ statut: 'anomalie' })}>{t('admin.aboSanteVoir')}</a>
          </span>
        </p>
      ) : (
        <p className={styles.sante}>
          <span className={styles.santePastille} aria-hidden="true" />
          <span>{t('admin.aboSanteOk')}</span>
        </p>
      )}

      {abonnementOuvert ? (
        <PanneauAbonnement
          langue={langue}
          abonnement={abonnementOuvert}
          fermeture={lien({})}
          formater={(montant) => afficher(montant, abonnementOuvert.devise)}
          libelleStatut={t(LIBELLE_STATUT[abonnementOuvert.statut_observe])}
          teinteStatut={ETAT_STATUT[abonnementOuvert.statut_observe]}
        />
      ) : null}
    </GabaritAdmin>
  );
}
