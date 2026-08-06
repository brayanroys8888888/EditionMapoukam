import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { langueValide, traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { tableauDeBord } from '@/lib/admin/service';
import * as stats from '@/lib/admin/stats';
import { lireDevise, formateur } from '@/lib/money/affichage';
import { getClock } from '@/lib/clock';
import { Erreur } from '@/components/etats';
import {
  CarteMontant,
  Compteur,
  GabaritAdmin,
  GraphiqueBarres,
  stylesAdmin as styles,
  type BarreGraphique,
} from '@/components/admin';
import { exigerAdministrateur } from './garde';

/**
 * TABLEAU DE BORD — ce qui demande une attention, puis ce que la période a
 * produit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORDRE DES BLOCS EST UNE DÉCISION, PAS UNE MISE EN PAGE.               │
 * │                                                                          │
 * │ Les trois compteurs d'ennuis restent EN TÊTE, avant les chiffres         │
 * │ commerciaux. Une anomalie d'abonnement est un client qui a payé et n'a   │
 * │ plus accès ; un brouillon non publiable est un titre qui n'existe pas    │
 * │ pour la boutique. Les enterrer sous un chiffre d'affaires ferait         │
 * │ regarder le revenu tous les jours et les ennuis jamais.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN CHIFFRE N'EST CALCULÉ ICI. TOUS VIENNENT DE FONCTIONS SQL.       │
 * │                                                                          │
 * │ Ce n'est pas une question de vitesse. Agréger en TypeScript exigerait de │
 * │ RAPATRIER les lignes — toutes les commandes, toutes les progressions de  │
 * │ lecture — dans le processus applicatif. Le seuil d'agrégation qui        │
 * │ protège les lecteurs deviendrait alors un filtre appliqué APRÈS coup,    │
 * │ sur des données nominatives déjà sorties de la base.                     │
 * │                                                                          │
 * │ Et aucun MONTANT n'est additionné dans cet écran : la consolidation      │
 * │ s'arrête à la devise, et elle est faite par `group by devise` en SQL.    │
 * │ Un `.reduce` sur des montants échouerait d'ailleurs au test              │
 * │ d'architecture du frontend — à juste titre, puisque la somme aurait fini │
 * │ par franchir la frontière de devise.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PÉRIODE PASSE PAR L'HORLOGE MÉTIER, JAMAIS PAR L'HEURE DU SYSTÈME.  │
 * │                                                                          │
 * │ La console de simulation avance le temps pour éprouver les fins de       │
 * │ période. « Les trente derniers jours » doit suivre — sans quoi les       │
 * │ séries seraient incohérentes avec les faits que la simulation vient de   │
 * │ produire. `getClock().now()` est la seule origine admise, et un test     │
 * │ d'architecture interdit la lecture directe de l'heure dans les écrans.   │
 * │                                                                          │
 * │ Ce test lit le TEXTE du fichier, commentaires compris : écrire l'appel   │
 * │ interdit pour dire qu'on ne l'emploie pas le fait échouer. C'est une      │
 * │ grossièreté du test, mais elle est du bon côté — un test qui pardonne    │
 * │ les commentaires pardonne aussi le code mis en commentaire.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Ce que rend `admin_tableau_de_bord`. */
interface DonneesTableau {
  abonnements?: {
    anomalies?: {
      subscription_id: string;
      statut_rapporte: string;
      fin_periode: string | null;
      echue_depuis_heures: number | null;
    }[];
  };
  brouillons_non_publiables?: { id: string; slug: string; manques: string[] }[];
  copies_purgeables?: number;
}

/** Les lignes des agrégats, telles que les fonctions SQL les rendent. */
interface LigneResume {
  devise: string;
  brut: number;
  rembourse: number;
  net: number;
  nb_transactions: number;
}

interface LigneAbonnes {
  statut_observe: string;
  offre: string;
  zone: string;
  devise: string;
  nombre: number;
}

interface LigneMouvement {
  mouvement: string;
  offre: string;
  nombre: number;
}

interface LigneTitreAchete {
  book_id: string;
  slug: string;
  langue: string;
  devise: string;
  nb_achats: number;
  montant: number;
}

interface LigneTitreLu {
  book_id: string;
  slug: string;
  langue: string;
  nb_lecteurs: number;
}

interface LigneLangue {
  langue: string;
  achats: number;
  telechargements: number | null;
  lecteurs: number | null;
  sous_le_seuil: boolean;
}

interface LigneZone {
  zone: string;
  telechargements: number;
  lecteurs: number | null;
  sous_le_seuil: boolean;
}

/**
 * Les périodes offertes, en jours. `null` = depuis le début.
 *
 * Bornées à un an : au-delà, la fonction SQL plafonne d'elle-même à trois ans,
 * et un écran qui proposerait « cinq ans » ferait découvrir le refus après
 * coup.
 */
const PERIODES = [
  { cle: '30', jours: 30 },
  { cle: '90', jours: 90 },
  { cle: '365', jours: 365 },
  { cle: 'tout', jours: null },
] as const;

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.tableauDeBord'),
    // Rien de l'administration ne s'indexe.
    robots: { index: false, follow: false },
  };
}

/** Un tableau simple, avec son titre et son message de vide. */
function Bloc({
  titre,
  vide,
  garni,
  children,
}: {
  titre: string;
  vide: string;
  /** Y a-t-il quelque chose à montrer ? */
  garni: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitre}>{titre}</h2>

      <div className={styles.cadre}>
        {garni ? children : <p className={`${styles.vide} ${styles.videCalme}`}>{vide}</p>}
      </div>
    </section>
  );
}

/** Le compte, ou la mention de masquage sous le seuil d'agrégation. */
function SousSeuil({
  valeur,
  langue,
}: {
  valeur: number | null;
  langue: LangueInterface;
}): ReactNode {
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ MASQUÉ N'EST PAS ZÉRO, ET L'ÉCRAN NE DOIT PAS LES CONFONDRE.          │
  // │                                                                        │
  // │ La base rend `null` pour un segment de moins de cinq personnes —       │
  // │ masqué plutôt que supprimé, pour qu'une ligne absente ne se confonde   │
  // │ pas avec un segment vide. Afficher « 0 » ici annulerait tout le        │
  // │ raisonnement : on lirait « personne ne lit en anglais » là où la base  │
  // │ dit « trop peu de monde pour le dire sans les nommer ».                │
  // └────────────────────────────────────────────────────────────────────────┘
  if (valeur === null) return <em>{traduire(langue, 'admin.seuilMasque')}</em>;
  return <>{valeur}</>;
}

export default async function PageAdmin({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  const brut = requete['periode'];
  const demandee = Array.isArray(brut) ? brut[0] : brut;
  const periodeChoisie =
    PERIODES.find((valeur) => valeur.cle === demandee) ?? PERIODES[0];

  // L'instant vient de l'horloge INJECTABLE : après un déplacement du temps par
  // la console de simulation, « les trente derniers jours » suivent.
  const maintenant = getClock().now();
  const periode =
    periodeChoisie.jours === null
      ? {}
      : {
          debut: new Date(
            maintenant.getTime() - periodeChoisie.jours * 86_400_000,
          ).toISOString(),
          fin: maintenant.toISOString(),
        };

  const attention = await tableauDeBord().catch(() => null);
  if (!attention?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const donnees = attention.donnees as DonneesTableau;
  const anomalies = donnees.abonnements?.anomalies ?? [];
  const brouillons = donnees.brouillons_non_publiables ?? [];
  const copies = donnees.copies_purgeables ?? 0;

  /*
   * Les sept agrégats sont demandés EN PARALLÈLE.
   *
   * En série, chacun attend le précédent : sept allers-retours en base pour un
   * écran qui ne dépend d'aucun de leurs résultats pour formuler le suivant.
   *
   * Chacun retombe sur `null` en cas d'échec, et le bloc concerné affiche alors
   * son message d'indisponibilité. Un agrégat en panne ne doit pas emporter le
   * tableau de bord entier — les compteurs d'ennuis, eux, ont déjà été lus.
   */
  const pagination = { page: 1, taille: 10 };

  const [resume, abonnes, mouvements, achetes, lus, parLangue, parZone] = await Promise.all([
    stats.chiffreAffairesResume(periode).catch(() => null),
    stats.abonnes().catch(() => null),
    stats.mouvementsAbonnement(periode).catch(() => null),
    stats.titresAchetes({ ...periode, ...pagination }).catch(() => null),
    stats.titresLus({ ...periode, ...pagination }).catch(() => null),
    stats.langues(periode).catch(() => null),
    stats.telechargementsParZone(periode).catch(() => null),
  ]);

  const lignesResume = (resume?.ok ? (resume.donnees as unknown as LigneResume[]) : []) ?? [];

  /*
   * UN FORMATEUR PAR DEVISE, RÉSOLU AVANT LE RENDU.
   *
   * `lireDevise` interroge la table `currencies` : le nombre de décimales et le
   * symbole y vivent, et non dans une constante du code. Le franc CFA n'a pas
   * de sous-unité — 1500 vaut 1 500 FCFA quand 1500 vaut 15,00 €.
   *
   * Les devises rencontrées viennent des lignes elles-mêmes : rien n'est
   * supposé sur celles qui existent.
   */
  const devises = [
    ...new Set([
      ...lignesResume.map((ligne) => ligne.devise),
      ...(achetes?.ok ? (achetes.donnees as unknown as LigneTitreAchete[]) : []).map(
        (ligne) => ligne.devise,
      ),
    ]),
  ];

  const formateurs = new Map<string, (montant: number) => string>();
  await Promise.all(
    devises.map(async (code) => {
      const monnaie = await lireDevise(code).catch(() => null);
      if (monnaie) formateurs.set(code, formateur(monnaie));
    }),
  );

  /** Le montant mis en forme dans SA devise, ou le nombre brut si elle manque. */
  const enDevise = (montant: number, devise: string): string =>
    (formateurs.get(devise) ?? ((valeur: number) => String(valeur)))(montant);

  const lignesAbonnes = abonnes?.ok ? (abonnes.donnees as unknown as LigneAbonnes[]) : [];
  const lignesMouvements = mouvements?.ok
    ? (mouvements.donnees as unknown as LigneMouvement[])
    : [];
  const lignesAchetes = achetes?.ok ? (achetes.donnees as unknown as LigneTitreAchete[]) : [];
  const lignesLus = lus?.ok ? (lus.donnees as unknown as LigneTitreLu[]) : [];
  const lignesLangues = parLangue?.ok ? (parLangue.donnees as unknown as LigneLangue[]) : [];
  const lignesZones = parZone?.ok ? (parZone.donnees as unknown as LigneZone[]) : [];

  /*
   * LES BARRES SE COMPARENT ENTRE ELLES, JAMAIS ENTRE DEVISES.
   *
   * Les séries graphiques ne portent que des COMPTES — des abonnés, des
   * souscriptions, des lecteurs. Dessiner des montants aurait mis un euro et un
   * franc CFA sur la même échelle, ce qui est très exactement l'erreur que
   * D4 point 4 interdit.
   */
  const barresAbonnes: BarreGraphique[] = lignesAbonnes.map((ligne) => ({
    libelle: traduire(langue, `abonnement.statut_${ligne.statut_observe}` as CleTraduction),
    valeur: ligne.nombre,
    affichage: String(ligne.nombre),
  }));

  const barresMouvements: BarreGraphique[] = lignesMouvements.map((ligne) => ({
    libelle: ligne.mouvement,
    valeur: ligne.nombre,
    affichage: String(ligne.nombre),
  }));

  const barresLangues: BarreGraphique[] = lignesLangues.map((ligne) => ({
    libelle: traduire(langue, `langue.${ligne.langue}` as CleTraduction),
    valeur: ligne.achats,
    affichage: String(ligne.achats),
  }));

  const base = `/${langue}/admin`;

  return (
    <GabaritAdmin
      langue={langue}
      section=""
      titre={traduire(langue, 'admin.tableauDeBord')}
      sousTitre={traduire(langue, 'admin.tableauSousTitre')}
    >
      {/* ── Ce qui demande une attention ─────────────────────────────────── */}
      <ul className={`${styles.chiffres} ${styles.section}`}>
        <Compteur
          intitule={traduire(langue, 'admin.anomalies')}
          valeur={anomalies.length}
          note={traduire(langue, 'admin.anomaliesNote')}
        />
        <Compteur
          intitule={traduire(langue, 'admin.brouillons')}
          valeur={brouillons.length}
          note={traduire(langue, 'admin.brouillonsNote')}
        />
        <Compteur
          intitule={traduire(langue, 'admin.copies')}
          valeur={copies}
          note={traduire(langue, 'admin.copiesNote')}
        />
      </ul>

      {/* ── La période ───────────────────────────────────────────────────── */}
      <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.financesTitre')}</h2>
      <p className={styles.graphiqueLegende}>{traduire(langue, 'admin.financesSousTitre')}</p>

      <nav className={styles.filtres} aria-label={traduire(langue, 'admin.periodeTitre')}>
        {PERIODES.map((valeur) => {
          const actif = valeur.cle === periodeChoisie.cle;
          return (
            <a
              key={valeur.cle}
              className={actif ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
              href={`${base}?periode=${valeur.cle}`}
              aria-current={actif ? 'true' : undefined}
            >
              {traduire(langue, `admin.periode_${valeur.cle}` as CleTraduction)}
            </a>
          );
        })}
      </nav>

      {/* ── Chiffre d'affaires, une carte par devise ─────────────────────── */}
      {lignesResume.length === 0 ? (
        <p className={`${styles.cadre} ${styles.vide} ${styles.videCalme} ${styles.section}`}>
          {traduire(langue, resume?.ok ? 'admin.caVide' : 'admin.financesIndisponible')}
        </p>
      ) : (
        <ul className={styles.montants}>
          {lignesResume.map((ligne) => (
            <CarteMontant
              key={ligne.devise}
              devise={ligne.devise}
              intitule={traduire(langue, 'admin.caNet')}
              principal={enDevise(ligne.net, ligne.devise)}
              details={[
                {
                  terme: traduire(langue, 'admin.caBrut'),
                  valeur: enDevise(ligne.brut, ligne.devise),
                },
                {
                  terme: traduire(langue, 'admin.caRembourse'),
                  valeur: enDevise(ligne.rembourse, ligne.devise),
                },
                {
                  terme: traduire(langue, 'admin.caCommandes'),
                  valeur: String(ligne.nb_transactions),
                },
              ]}
            />
          ))}
        </ul>
      )}

      {/* ── Abonnés et mouvements, en barres ─────────────────────────────── */}
      <div className={styles.colonnes}>
        <section>
          <h3 className={styles.sectionTitre}>{traduire(langue, 'admin.abonnesTitre')}</h3>

          {barresAbonnes.length === 0 ? (
            <p className={`${styles.cadre} ${styles.vide} ${styles.videCalme}`}>
              {traduire(langue, 'admin.abonnesVide')}
            </p>
          ) : (
            <>
              <GraphiqueBarres
                titre={traduire(langue, 'admin.abonnesTitre')}
                barres={barresAbonnes}
              />
              <p className={styles.graphiqueLegende}>
                {traduire(langue, 'admin.graphiqueLegende')}
              </p>
            </>
          )}
        </section>

        <section>
          <h3 className={styles.sectionTitre}>{traduire(langue, 'admin.mouvementsTitre')}</h3>

          {barresMouvements.length === 0 ? (
            <p className={`${styles.cadre} ${styles.vide} ${styles.videCalme}`}>
              {traduire(langue, 'admin.mouvementsVide')}
            </p>
          ) : (
            <GraphiqueBarres
              titre={traduire(langue, 'admin.mouvementsTitre')}
              barres={barresMouvements}
              accent
            />
          )}
        </section>
      </div>

      {/* ── Titres les plus achetés ──────────────────────────────────────── */}
      <Bloc
        titre={traduire(langue, 'admin.titresAchetesTitre')}
        vide={traduire(langue, achetes?.ok ? 'admin.titresAchetesVide' : 'admin.financesIndisponible')}
        garni={lignesAchetes.length > 0}
      >
        <table className={styles.tableau}>
          <thead>
            <tr>
              <th scope="col">{traduire(langue, 'admin.colTitre')}</th>
              <th scope="col">{traduire(langue, 'admin.colLangue')}</th>
              <th scope="col" className={styles.numerique}>
                {traduire(langue, 'admin.colAchats')}
              </th>
              <th scope="col" className={styles.numerique}>
                {traduire(langue, 'admin.colMontant')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lignesAchetes.map((ligne) => (
              <tr key={`${ligne.book_id}:${ligne.langue}:${ligne.devise}`}>
                <td className={styles.cellulePrincipale}>{ligne.slug}</td>
                <td>{ligne.langue}</td>
                <td className={styles.numerique}>{ligne.nb_achats}</td>
                {/* Le montant est mis en forme dans SA devise, jamais converti :
                    la même ligne peut exister en EUR et en XAF. */}
                <td className={styles.numerique}>{enDevise(ligne.montant, ligne.devise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloc>

      {/* ── Titres les plus lus ──────────────────────────────────────────── */}
      <Bloc
        titre={traduire(langue, 'admin.titresLusTitre')}
        vide={traduire(langue, lus?.ok ? 'admin.titresLusVide' : 'admin.financesIndisponible')}
        garni={lignesLus.length > 0}
      >
        <table className={styles.tableau}>
          <thead>
            <tr>
              <th scope="col">{traduire(langue, 'admin.colTitre')}</th>
              <th scope="col">{traduire(langue, 'admin.colLangue')}</th>
              <th scope="col" className={styles.numerique}>
                {traduire(langue, 'admin.colLecteurs')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lignesLus.map((ligne) => (
              <tr key={`${ligne.book_id}:${ligne.langue}`}>
                <td className={styles.cellulePrincipale}>{ligne.slug}</td>
                <td>{ligne.langue}</td>
                <td className={styles.numerique}>{ligne.nb_lecteurs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloc>

      {/* ── Langues et zones ─────────────────────────────────────────────── */}
      <div className={styles.colonnes}>
        <section>
          <h3 className={styles.sectionTitre}>{traduire(langue, 'admin.languesTitre')}</h3>

          {lignesLangues.length === 0 ? (
            <p className={`${styles.cadre} ${styles.vide} ${styles.videCalme}`}>
              {traduire(langue, 'admin.languesVide')}
            </p>
          ) : (
            <>
              <GraphiqueBarres
                titre={traduire(langue, 'admin.languesTitre')}
                barres={barresLangues}
              />

              <div className={styles.cadre}>
                <table className={styles.tableau}>
                  <thead>
                    <tr>
                      <th scope="col">{traduire(langue, 'admin.colLangue')}</th>
                      <th scope="col" className={styles.numerique}>
                        {traduire(langue, 'admin.colAchats')}
                      </th>
                      <th scope="col" className={styles.numerique}>
                        {traduire(langue, 'admin.colTelechargements')}
                      </th>
                      <th scope="col" className={styles.numerique}>
                        {traduire(langue, 'admin.colLecteurs')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesLangues.map((ligne) => (
                      <tr key={ligne.langue}>
                        <td className={styles.cellulePrincipale}>{ligne.langue}</td>
                        {/* `achats` est COMPTABLE et reste exact ;
                            téléchargements et lecteurs sont COMPORTEMENTAUX et
                            passent sous le seuil d'agrégation. */}
                        <td className={styles.numerique}>{ligne.achats}</td>
                        <td className={styles.numerique}>
                          <SousSeuil valeur={ligne.telechargements} langue={langue} />
                        </td>
                        <td className={styles.numerique}>
                          <SousSeuil valeur={ligne.lecteurs} langue={langue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section>
          <h3 className={styles.sectionTitre}>{traduire(langue, 'admin.zonesTitre')}</h3>

          {lignesZones.length === 0 ? (
            <p className={`${styles.cadre} ${styles.vide} ${styles.videCalme}`}>
              {traduire(langue, 'admin.zonesVide')}
            </p>
          ) : (
            <div className={styles.cadre}>
              <table className={styles.tableau}>
                <thead>
                  <tr>
                    <th scope="col">{traduire(langue, 'admin.colZone')}</th>
                    <th scope="col" className={styles.numerique}>
                      {traduire(langue, 'admin.colTelechargements')}
                    </th>
                    <th scope="col" className={styles.numerique}>
                      {traduire(langue, 'admin.colLecteurs')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignesZones.map((ligne) => (
                    <tr key={ligne.zone}>
                      <td className={styles.cellulePrincipale}>
                        {traduire(langue, `admin.conteZone_${ligne.zone}` as CleTraduction)}
                      </td>
                      <td className={styles.numerique}>{ligne.telechargements}</td>
                      <td className={styles.numerique}>
                        <SousSeuil valeur={ligne.lecteurs} langue={langue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className={styles.note}>{traduire(langue, 'admin.seuilNote')}</p>

      {/* ── Les brouillons, et ce qui leur manque ────────────────────────── */}
      <Bloc
        titre={traduire(langue, 'admin.brouillons')}
        vide={traduire(langue, 'admin.rienASignaler')}
        garni={brouillons.length > 0}
      >
        <table className={styles.tableau}>
          <thead>
            <tr>
              <th scope="col">{traduire(langue, 'admin.colSlug')}</th>
              <th scope="col">{traduire(langue, 'admin.manquePour')}</th>
            </tr>
          </thead>
          <tbody>
            {brouillons.map((brouillon) => (
              <tr key={brouillon.id}>
                <td className={styles.cellulePrincipale}>
                  {/* Le slug mène à l'écran d'édition : ce tableau nomme des
                      titres incomplets, et l'endroit où les compléter est à un
                      clic plutôt qu'à une recherche dans le catalogue. */}
                  <a href={`${base}/contes/${brouillon.id}`}>{brouillon.slug}</a>
                </td>
                <td>
                  {/*
                    Les manques viennent de `manques_pour_publication`, LA
                    MÊME fonction que le déclencheur de publication. Ce qui
                    est affiché ici est exactement ce que la base refusera
                    — jamais une approximation qui laisserait découvrir le
                    refus au moment de publier.
                  */}
                  <ul className={styles.manques}>
                    {brouillon.manques.map((manque) => (
                      <li key={manque} className={styles.manque}>
                        {manque}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloc>

      {/* ── Les anomalies d'abonnement ───────────────────────────────────── */}
      <Bloc
        titre={traduire(langue, 'admin.anomalies')}
        vide={traduire(langue, 'admin.rienASignaler')}
        garni={anomalies.length > 0}
      >
        <table className={styles.tableau}>
          <thead>
            <tr>
              <th scope="col">{traduire(langue, 'admin.colCommande')}</th>
              <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
              <th scope="col" className={styles.numerique}>
                {traduire(langue, 'admin.colDate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((anomalie) => (
              <tr key={anomalie.subscription_id}>
                <td className={styles.cellulePrincipale}>{anomalie.subscription_id}</td>
                <td>
                  <span className={`${styles.etat} ${styles.etatAlerte}`}>
                    {anomalie.statut_rapporte}
                  </span>
                </td>
                <td className={styles.numerique}>
                  {anomalie.fin_periode
                    ? new Date(anomalie.fin_periode).toLocaleDateString(langue)
                    : traduire(langue, 'admin.nonPublie')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloc>
    </GabaritAdmin>
  );
}
