import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import {
  compterCommandesParStatut,
  lireCommande,
  listerCommandes,
  statsCommandes,
} from '@/lib/admin/service';
import { PanneauCommande, type DetailCommande } from './panneau-commande';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';

/**
 * LES COMMANDES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ACHETEUR ANONYMISÉ RESTE ANONYME, Y COMPRIS ICI.                     │
 * │                                                                          │
 * │ `acheteur_anonymise` est rendu par la base pour les comptes effacés au   │
 * │ titre du droit à l'oubli. La commande, elle, survit — elle est une pièce │
 * │ comptable. L'écran affiche donc la commande sans son adresse ET sans son │
 * │ nom : en rendre un seul des deux recomposerait l'identité par l'autre    │
 * │ bout. La recherche ne les interroge pas non plus, pour la même raison.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MONTANTS SONT FORMATÉS PAR DEVISE, ET JAMAIS ADDITIONNÉS.           │
 * │                                                                          │
 * │ Une liste mêle des euros et des francs CFA — le second n'a pas de        │
 * │ sous-unité. Un formatage unique diviserait les deux par cent, et le      │
 * │ tableau afficherait des montants faux d'un facteur cent une ligne sur    │
 * │ deux.                                                                    │
 * │                                                                          │
 * │ La bande de chiffres suit la même règle, et c'est elle qui la rend       │
 * │ visible : une cellule « net encaissé » PAR DEVISE, jamais un total       │
 * │ unique. Il n'existe pas de taux de change dans la boutique, et un nombre │
 * │ qui en supposerait un ne serait facturable nulle part.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Une ligne rendue par `admin_lister_commandes` (migration 0089). */
interface LigneCommande {
  id: string;
  numero: number;
  nom: string | null;
  email: string | null;
  montant_total: number;
  devise: string;
  zone: string;
  statut: 'en_attente' | 'paye' | 'echoue' | 'rembourse';
  moyen_paiement: 'carte' | 'orange_money' | 'mtn_momo' | 'autre' | null;
  cree_le: string;
  acheteur_anonymise: boolean;
  nb_lignes: number;
  premier_titre: string | null;
  premier_type: 'conte' | 'livret_pedagogique' | null;
}

/** Une ligne rendue par `admin_stats_commandes`. */
interface LigneStats {
  devise: string;
  net_encaisse: number;
  nb_payees: number;
  nb_en_attente: number;
  nb_remboursees_30j: number;
}

/** Une ligne rendue par `admin_compter_commandes_par_statut`. */
interface LigneCompte {
  statut: string;
  nb: number;
}

const STATUTS = ['paye', 'en_attente', 'echoue', 'rembourse'] as const;
type Statut = (typeof STATUTS)[number];

/**
 * Les libellés COURTS des statuts.
 *
 * `paiement.*` porte des phrases — « Paiement confirmé. Les contes sont dans
 * votre bibliothèque. » Sur un segment de filtre, seul un mot tient. La table
 * est explicite plutôt que dérivée : `paye` → `Payée` n'est pas une règle
 * qu'on puisse deviner d'une langue à l'autre.
 */
const LIBELLE_STATUT: Record<Statut, CleTraduction> = {
  paye: 'admin.cmdPayee',
  en_attente: 'admin.cmdEnAttente',
  echoue: 'admin.cmdEchouee',
  rembourse: 'admin.cmdRemboursee',
};

/**
 * La teinte de la pastille. Trois états visuels pour quatre statuts.
 *
 * `string | undefined` parce qu'un module CSS est typé ainsi : une classe
 * absente de la feuille rend `undefined`, et le compilateur refuse qu'on
 * prétende le contraire. `classes-css.test.ts` garde l'autre bout — il
 * échouerait sur une classe qui n'existerait pas.
 */
const ETAT_STATUT: Record<Statut, string | undefined> = {
  paye: styles.etatPublie,
  en_attente: styles.etatBrouillon,
  echoue: styles.etatAlerte,
  rembourse: styles.etatBrouillon,
};

const MOYENS = {
  carte: 'admin.moyenCarte',
  orange_money: 'admin.moyenOrangeMoney',
  mtn_momo: 'admin.moyenMtnMomo',
  autre: 'admin.moyenAutre',
} as const satisfies Record<string, CleTraduction>;

/** Les cotes du tableau, reprises du prototype d'administration. */
const COLONNES =
  'minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.3fr) 110px 100px 104px 16px';
const LARGEUR_MIN = '820px';

function premier(brut: string | string[] | undefined): string | undefined {
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return valeur && valeur.length > 0 ? valeur : undefined;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.commandes'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminCommandes({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  const demande = premier(requete['statut']);
  const statut = STATUTS.includes(demande as Statut) ? (demande as Statut) : undefined;
  const devise = premier(requete['devise']);
  const q = premier(requete['q']);
  const ouverte = premier(requete['commande']);
  const confirmeRemboursement = premier(requete['rembourser']) === '1';

  /*
   * La bande de chiffres n'est PAS filtrée.
   *
   * « Net encaissé » et « en attente » disent l'état de la boutique ; les
   * filtres disent ce qu'on regarde. Les faire suivre le filtre ferait
   * afficher zéro en attente dès qu'on coche « Payée » — et un tableau de bord
   * qui s'annule quand on l'interroge n'en est plus un.
   */
  const [resultat, stats, comptes, detail] = await Promise.all([
    listerCommandes({
      statut: statut ?? null,
      devise: devise ?? null,
      recherche: q ?? null,
      page: 1,
      taille: 50,
    }).catch(() => null),
    statsCommandes().catch(() => null),
    compterCommandesParStatut({ devise: devise ?? null, recherche: q ?? null }).catch(() => null),
    /*
     * Le détail n'est lu QUE si le panneau est ouvert. Une liste de cinquante
     * commandes qui chargerait cinquante détails paierait, à chaque
     * affichage, le coût d'un écran que personne n'a demandé.
     */
    ouverte ? lireCommande(ouverte).catch(() => null) : Promise.resolve(null),
  ]);

  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const commandes = resultat.donnees as unknown as LigneCommande[];
  const lignesStats = (stats?.ok ? (stats.donnees as unknown as LigneStats[]) : []) ?? [];

  const parStatut = new Map(
    ((comptes?.ok ? (comptes.donnees as unknown as LigneCompte[]) : []) ?? []).map((l) => [
      l.statut,
      Number(l.nb),
    ]),
  );
  const total = [...parStatut.values()].reduce((somme, n) => somme + n, 0);

  /*
   * UN formateur par devise présente, résolu une seule fois. Les lire ligne
   * par ligne ferait autant d'allers-retours en base qu'il y a de commandes.
   */
  const devises = [...new Set([...commandes, ...lignesStats].map((l) => l.devise))];
  const monnaies = new Map(await Promise.all(devises.map(async (c) => [c, await lireDevise(c)] as const)));
  const afficher = (montant: number, code: string): string => {
    const monnaie = monnaies.get(code);
    return monnaie ? formateur(monnaie)(montant) : `${String(montant)} ${code}`;
  };

  /*
   * Le NOM de la devise pour un sur-titre — « EUR », « FCFA ».
   *
   * Le symbole d'une devise est tantôt un glyphe (« € »), tantôt un nom
   * (« FCFA »). Un glyphe seul ne se lit pas dans un intertitre en capitales :
   * on prend donc le symbole quand c'est un mot, et le code sinon.
   */
  const nomDevise = (code: string): string => {
    const symbole = monnaies.get(code)?.symbole ?? '';
    return symbole.length > 1 ? symbole : code;
  };

  const commandeOuverte =
    detail?.ok && Array.isArray(detail.donnees) && detail.donnees.length > 0
      ? (detail.donnees[0] as DetailCommande)
      : null;

  const base = `/${langue}/admin/commandes`;
  const lien = (modif: { statut?: string; devise?: string }): string => {
    const params = new URLSearchParams();
    const s = 'statut' in modif ? modif.statut : statut;
    const d = 'devise' in modif ? modif.devise : devise;
    if (s) params.set('statut', s);
    if (d) params.set('devise', d);
    if (q) params.set('q', q);
    const chaine = params.toString();
    return chaine ? `${base}?${chaine}` : base;
  };

  /** L'écran, avec une commande ouverte — et les filtres conservés. */
  const lienPanneau = (id: string, rembourser = false): string => {
    const params = new URLSearchParams();
    if (statut) params.set('statut', statut);
    if (devise) params.set('devise', devise);
    if (q) params.set('q', q);
    params.set('commande', id);
    if (rembourser) params.set('rembourser', '1');
    return `${base}?${params.toString()}`;
  };

  const decompte = `${String(commandes.length)} ${traduire(
    langue,
    commandes.length === 1 ? 'admin.decompteCommandeUn' : 'admin.decompteCommandes',
  )}`;

  const enAttente = lignesStats[0]?.nb_en_attente ?? 0;
  const remboursees = lignesStats[0]?.nb_remboursees_30j ?? 0;

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/commandes"
      titre={traduire(langue, 'admin.commandes')}
      sousTitre={traduire(langue, 'admin.commandesSousTitreV3')}
      actions={
        <a className={styles.boutonSecondaire} href={`/api/admin/orders/export${lien({}).slice(base.length)}`}>
          {traduire(langue, 'admin.exporterCsv')}
        </a>
      }
    >
      {/* ── La bande de chiffres ──────────────────────────────────────────── */}
      {lignesStats.length > 0 ? (
        <div className={`${styles.carte} ${styles.bandeau}`}>
          <ul className={styles.bandeauGrille}>
            {lignesStats.map((ligne) => (
              <li key={ligne.devise} className={styles.bandeauCellule}>
                <span className={styles.bandeauIntitule}>
                  {traduire(langue, 'admin.caNet')} · {nomDevise(ligne.devise)}
                </span>
                <span className={`${styles.bandeauValeur} ${styles.bandeauValeurVentes}`}>
                  {afficher(ligne.net_encaisse, ligne.devise)}
                </span>
                <span className={styles.bandeauNote}>
                  {ligne.nb_payees}{' '}
                  {traduire(
                    langue,
                    ligne.nb_payees === 1 ? 'admin.caPayeeUn' : 'admin.caPayees',
                  )}
                </span>
              </li>
            ))}

            <li className={styles.bandeauCellule}>
              <span className={styles.bandeauIntitule}>
                {traduire(langue, 'admin.cmdEnAttente')}
              </span>
              <span className={`${styles.bandeauValeur} ${styles.bandeauValeurVentes}`}>{enAttente}</span>
              <span className={styles.bandeauNote}>
                {traduire(langue, 'admin.cmdEnAttenteNote')}
              </span>
            </li>

            <li className={styles.bandeauCellule}>
              <span className={styles.bandeauIntitule}>
                {traduire(langue, 'admin.cmdRemboursees')}
              </span>
              <span className={`${styles.bandeauValeur} ${styles.bandeauValeurVentes}`}>{remboursees}</span>
              <span className={styles.bandeauNote}>
                {traduire(langue, 'admin.cmdRembourseesNote')}
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      {/* ── Recherche et filtres, dans une seule carte ────────────────────── */}
      <div className={`${styles.carte} ${styles.filtresCarte}`}>
        <form method="get" action={base} className={styles.filtresLigne} role="search">
          {statut ? <input type="hidden" name="statut" value={statut} /> : null}
          {devise ? <input type="hidden" name="devise" value={devise} /> : null}

          <div className={styles.rechercheChamp}>
            <button
              type="submit"
              className={styles.rechercheEnvoi}
              aria-label={traduire(langue, 'catalogue.rechercheAction')}
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
              placeholder={traduire(langue, 'admin.commandesRecherche')}
              className={styles.rechercheSaisieOrganic}
              aria-label={traduire(langue, 'catalogue.recherche')}
            />
          </div>

          <p className={`${styles.decompte} ${styles.decompteVentes}`}>{decompte}</p>
        </form>

        <div className={styles.filtresBarres}>
          <nav className={styles.seg} aria-label={traduire(langue, 'admin.colStatut')}>
            <a
              className={statut ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
              href={lien({ statut: undefined })}
              aria-current={statut ? undefined : 'true'}
            >
              {traduire(langue, 'admin.cmdToutes')}
              <span className={styles.segCompte}>{total}</span>
            </a>

            {STATUTS.map((valeur) => {
              const actif = statut === valeur;
              return (
                <a
                  key={valeur}
                  className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
                  href={lien({ statut: valeur })}
                  aria-current={actif ? 'true' : undefined}
                >
                  {traduire(langue, LIBELLE_STATUT[valeur])}
                  <span className={styles.segCompte}>{parStatut.get(valeur) ?? 0}</span>
                </a>
              );
            })}
          </nav>

          {/*
            Le segmenté des DEVISES n'apparaît qu'au-delà d'une seule : un
            filtre à un seul choix ne filtre rien, et occuperait la place d'un
            contrôle utile.
          */}
          {devises.length > 1 ? (
            <nav className={styles.seg} aria-label={traduire(langue, 'admin.colMontant')}>
              <a
                className={devise ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
                href={lien({ devise: undefined })}
                aria-current={devise ? undefined : 'true'}
              >
                {traduire(langue, 'admin.toutesDevises')}
              </a>

              {devises.map((code) => {
                const actif = devise === code;
                return (
                  <a
                    key={code}
                    className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
                    href={lien({ devise: code })}
                    aria-current={actif ? 'true' : undefined}
                  >
                    {nomDevise(code)}
                  </a>
                );
              })}
            </nav>
          ) : null}
        </div>
      </div>

      {/* ── Le tableau ────────────────────────────────────────────────────── */}
      <div className={`${styles.carte} ${styles.grilleCadre}`}>
        {commandes.length === 0 ? (
          <p className={styles.grilleVide}>{traduire(langue, 'admin.cmdVide')}</p>
        ) : (
          <table
            className={styles.grille}
            role="table"
            style={
              { '--grille-colonnes': COLONNES, '--grille-min': LARGEUR_MIN } as CSSProperties
            }
          >
            <thead role="rowgroup">
              <tr className={`${styles.grilleEntete} ${styles.grilleEnteteVentes}`} role="row">
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colCommande')}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colClient')}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colContenu')}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colPaiement')}
                </th>
                <th scope="col" role="columnheader" className={styles.grilleColPrix}>
                  {traduire(langue, 'admin.colMontant')}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colStatut')}
                </th>
                {/* La colonne du chevron : sans intitulé, mais elle existe. */}
                <th scope="col" role="columnheader">
                  <span className="sr-only">{traduire(langue, 'admin.colOuvrir')}</span>
                </th>
              </tr>
            </thead>

            <tbody role="rowgroup">
              {commandes.map((commande) => {
                const autres = commande.nb_lignes - 1;
                const anonyme = traduire(langue, 'admin.nonPublie');

                return (
                  <tr key={commande.id} className={styles.grilleRangee} role="row">
                    <td role="cell">
                      {/*
                        `tabular-nums` SANS l'alignement à droite : `.numerique`
                        porte les deux, et pousserait « EM-1048 » contre le
                        bord droit de sa cellule alors que la date, dessous,
                        reste à gauche. Deux lignes d'un même bloc alignées
                        chacune de son côté se lisent comme deux colonnes.
                      */}
                      <p className={`${styles.grilleTitre} ${styles.grilleNumero}`}>
                        {/*
                          Le numéro EST le lien : partout ailleurs dans le
                          produit, on ouvre une ligne en cliquant ce qui la
                          nomme. Une colonne « Ouvrir » de plus aurait ajouté
                          une cible à viser sur une ligne qui en a déjà une.
                        */}
                        <a className={styles.grilleTitre} href={lienPanneau(commande.id)}>
                          EM-{commande.numero}
                        </a>
                      </p>
                      <p className={styles.grilleSousLigne}>
                        {new Date(commande.cree_le).toLocaleDateString(langue, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </td>

                    {/*
                      Un acheteur anonymisé n'a plus ni nom ni adresse à
                      montrer : la commande survit comme pièce comptable, la
                      personne non.
                    */}
                    <td role="cell">
                      <p className={styles.grilleAuteur}>
                        {commande.acheteur_anonymise ? anonyme : (commande.nom ?? anonyme)}
                      </p>
                      {commande.acheteur_anonymise ? null : (
                        <p className={styles.grilleSousLigne}>{commande.email ?? ''}</p>
                      )}
                    </td>

                    <td role="cell">
                      <p className={styles.grilleAuteur}>{commande.premier_titre ?? '—'}</p>
                      <p className={styles.grilleSousLigne}>
                        {autres > 0
                          ? `+ ${String(autres)} ${traduire(
                              langue,
                              autres === 1 ? 'admin.cmdAutreUn' : 'admin.cmdAutres',
                            )}`
                          : traduire(
                              langue,
                              `documents.${commande.premier_type ?? 'conte'}` as CleTraduction,
                            )}
                      </p>
                    </td>

                    {/*
                      Le moyen de paiement est NUL sur les commandes d'avant la
                      migration 0089 : le prestataire ne l'a jamais rapporté, et
                      le déduire après coup serait inventer.
                    */}
                    <td role="cell" className={styles.grilleAuteur}>
                      {commande.moyen_paiement
                        ? traduire(langue, MOYENS[commande.moyen_paiement])
                        : traduire(langue, 'admin.moyenInconnu')}
                    </td>

                    <td role="cell" className={`${styles.grillePrix} ${styles.numerique}`}>
                      {afficher(commande.montant_total, commande.devise)}
                    </td>

                    <td role="cell">
                      <span className={`${styles.etat} ${ETAT_STATUT[commande.statut]}`}>
                        {traduire(langue, LIBELLE_STATUT[commande.statut])}
                      </span>
                    </td>

                    <td role="cell">
                      {/* Décoratif : la ligne entière ouvrira le panneau. */}
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

      <p className={`${styles.note} ${styles.noteVentes}`}>{traduire(langue, 'admin.cmdAide')}</p>

      {commandeOuverte ? (
        <PanneauCommande
          langue={langue}
          commande={commandeOuverte}
          fermeture={lien({})}
          filtres={{ statut, devise, q }}
          confirmeRemboursement={confirmeRemboursement}
          urlConfirmer={lienPanneau(commandeOuverte.id, true)}
          formater={(montant) => afficher(montant, commandeOuverte.devise)}
        />
      ) : null}
    </GabaritAdmin>
  );
}
