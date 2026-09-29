import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import {
  lireCampagne,
  lireMotDuMois,
  listerAbonnements,
  listerCommentairesAssociation,
  listerContenusAssociation,
  listerEvenementsAssociation,
  listerPublicationsAssociation,
  prochainsJeudis,
  statsAssociation,
} from '@/lib/admin/service';
import { CATEGORIES_ASSOCIATION } from '@/lib/association/service';
import { Erreur } from '@/components/etats';
import { BoutonSoumission, GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { OngletAgenda, type LigneEvenement } from './onglet-agenda';
import { OngletCampagne, type Campagne } from './onglet-campagne';
import { OngletCommentaires, type LigneCommentaire } from './onglet-commentaires';
import { OngletPublications, type LignePublication } from './onglet-publications';
import { SIGLE_TYPE, TYPES_PUBLICATION, type TypePublication } from './types-publication';
import { changerPublication, modifierContenu, supprimerContenu } from './actions';

/**
 * L'ESPACE ASSOCIATIF — §3.6, §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES CARTES, PAS UN TABLEAU — ET CE N'EST PAS UN GOÛT.                   │
 * │                                                                          │
 * │ Chaque contenu porte un FORMULAIRE. Un champ de saisie logé dans une      │
 * │ cellule de tableau se retrouve à la largeur de sa colonne, c'est-à-dire   │
 * │ quelques centimètres. C'est le même arbitrage que pour les versions       │
 * │ linguistiques d'un conte, et il réutilise les mêmes classes.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN NE MONTRE JAMAIS LE CORPS D'UN TEXTE.                         │
 * │                                                                          │
 * │ `admin_lister_contenus_association` n'en rend pas — elle rend le titre,   │
 * │ le rangement et la liste des langues écrites. Le corps existe bien côté   │
 * │ administration (`admin_lire_contenu_association` le rend, et c'est le     │
 * │ seul endroit du dépôt qui en a le droit), mais l'afficher ici ferait      │
 * │ transiter tout le fonds associatif à chaque ouverture de la liste.        │
 * │                                                                          │
 * │ Conséquence assumée : le formulaire d'écriture ci-dessous REMPLACE la     │
 * │ version, il ne la corrige pas. L'aide du champ le dit.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ACCES = ['libre', 'abonnes'] as const;

const COLONNES_ADHERENTS = 'minmax(0, 1.6fr) minmax(0, 1fr) 130px 130px 130px';
const LARGEUR_MIN_ADHERENTS = '680px';

/** Les onglets que nous pouvons tenir. Voir le bloc « CINQ ONGLETS ». */
const ONGLETS = [
  'publications',
  'agenda',
  'commentaires',
  'adherents',
  'campagne',
] as const;
type Onglet = (typeof ONGLETS)[number];

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Une ligne rendue par `admin_lister_contenus_association`. */
interface LigneContenu {
  id: string;
  slug: string;
  categorie: (typeof CATEGORIES_ASSOCIATION)[number];
  acces: 'libre' | 'abonnes';
  statut: 'brouillon' | 'publie';
  publie_le: string | null;
  vedette: boolean;
  ordre: number;
  titre: string | null;
  langues: string[];
}

/** Les quatre chiffres, tels que `admin_stats_association` les compte. */
interface StatsAssociation {
  adherents: number | string;
  a_renouveler: number | string;
  a_moderer: number | string;
  prochaine_publication: string | null;
  brouillons: number | string;
  derniere_publication: string | null;
}

/** Une adhésion, telle que `admin_lister_abonnements` la rend. */
interface LigneAdherent {
  id: string;
  nom: string | null;
  email: string | null;
  offre: string;
  statut_observe: string;
  fin_acces: string | null;
  cree_le: string;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.association'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminAssociation({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  const onglet: Onglet = ONGLETS.includes(premier(requete['onglet']) as Onglet)
    ? (premier(requete['onglet']) as Onglet)
    : 'publications';
  const ouvert = premier(requete['contenu']);
  const nouvelEvenement = premier(requete['evenement']) === '1';

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CHAQUE ONGLET NE PAIE QUE SA LECTURE.                                  │
   * │                                                                        │
   * │ Cinq onglets, sept lectures possibles. Les charger toutes à chaque     │
   * │ visite ferait payer la file de modération, l'agenda et la campagne à   │
   * │ qui vient seulement relire sa liste de publications.                    │
   * │                                                                        │
   * │ Les deux premières, elles, sont toujours là : les chiffres de la bande │
   * │ et les compteurs des onglets s'affichent quel que soit l'onglet ouvert.│
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const [resultat, stats, adherents, publicationsBrutes, jeudisBruts, motBrut, evenementsBruts, campagneBrute, commentairesBruts] =
    await Promise.all([
      listerContenusAssociation().catch(() => null),
      statsAssociation().catch(() => null),
      onglet === 'adherents'
        ? listerAbonnements({ domaine: 'association', page: 1, taille: 50 }).catch(() => null)
        : Promise.resolve(null),
      onglet === 'publications'
        ? listerPublicationsAssociation({ langue }).catch(() => null)
        : Promise.resolve(null),
      onglet === 'publications' ? prochainsJeudis(4).catch(() => null) : Promise.resolve(null),
      onglet === 'publications' ? lireMotDuMois().catch(() => null) : Promise.resolve(null),
      onglet === 'agenda' ? listerEvenementsAssociation().catch(() => null) : Promise.resolve(null),
      onglet === 'campagne' ? lireCampagne().catch(() => null) : Promise.resolve(null),
      onglet === 'commentaires'
        ? listerCommentairesAssociation('en_attente').catch(() => null)
        : Promise.resolve(null),
    ]);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const contenus = resultat.donnees as unknown as LigneContenu[];
  const chiffres = ((stats?.ok ? stats.donnees : [])[0] ?? null) as StatsAssociation | null;
  const lignesAdherents = (adherents?.ok ? adherents.donnees : []) as unknown as LigneAdherent[];

  const publications = (publicationsBrutes?.ok
    ? publicationsBrutes.donnees
    : []) as unknown as LignePublication[];

  const jeudis = ((jeudisBruts?.ok ? jeudisBruts.donnees : []) as {
    jour: string;
    titre: string | null;
    etat: string | null;
  }[]).map((jeudi) => ({
    jour: String(jeudi.jour).slice(0, 10),
    titre: jeudi.titre,
    etat: jeudi.etat,
  }));

  // `admin_lire_mot_du_mois` rend zéro ou une ligne : il n'y a qu'un mot
  // affiché à la fois, un index partiel le garantit.
  const mot = ((motBrut?.ok ? motBrut.donnees : [])[0] ?? null) as {
    texte: string;
    signature: string;
  } | null;

  const evenements = (evenementsBruts?.ok
    ? evenementsBruts.donnees
    : []) as unknown as LigneEvenement[];

  const campagne = ((campagneBrute?.ok ? campagneBrute.donnees : [])[0] ?? null) as Campagne | null;

  const commentaires = (commentairesBruts?.ok
    ? commentairesBruts.donnees
    : []) as unknown as LigneCommentaire[];

  const ecran = `/${langue}/admin/association`;
  const lien = (p: { onglet?: Onglet; contenu?: string; evenement?: boolean }): string => {
    const q = new URLSearchParams();
    if (p.onglet !== undefined && p.onglet !== 'publications') q.set('onglet', p.onglet);
    if (p.contenu !== undefined) q.set('contenu', p.contenu);
    if (p.evenement === true) q.set('evenement', '1');
    const suite = q.toString();
    return suite === '' ? ecran : `${ecran}?${suite}`;
  };

  /** L'écran de rédaction, à vide ou avec son type déjà posé. */
  const ecranRedaction = (type?: TypePublication): string =>
    type === undefined ? `${ecran}/rediger` : `${ecran}/rediger?type=${type}`;

  /*
   * La publication ouverte, s'il y en a une. Un identifiant inconnu rend une
   * liste vide plutôt qu'une erreur : une adresse copiée après une
   * suppression doit rendre l'écran, pas une page cassée.
   */
  /** Le nombre à poser sur un onglet, ou `null` quand il n'en appelle pas. */
  const compteur = (valeur: Onglet): number | null => {
    if (valeur === 'publications') return contenus.length;
    if (valeur === 'commentaires') return Number(chiffres?.a_moderer ?? 0);
    if (valeur === 'adherents') return Number(chiffres?.adherents ?? 0);
    return null;
  };

  const selection = ouvert === undefined ? [] : contenus.filter((c) => c.id === ouvert);

  const date = (iso: string | null): string =>
    iso
      ? new Date(iso).toLocaleDateString(langue, { day: 'numeric', month: 'short' })
      : '—';

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/association"
      gouttiere="association"
      titre={t('admin.association')}
      sousTitre={t('admin.assoSousTitreV3')}
      embleme={
        /*
         * Le logo vit dans `public/images/association/`, d'où le middleware le
         * laisse passer sans redirection. Il est décoratif : le titre à côté
         * dit déjà de quoi l'écran parle, et un texte de remplacement qui
         * répète le titre fait perdre une ligne à qui écoute la page.
         */
        <img
          className={styles.embleme}
          src="/images/association/logo-dave.jpg"
          alt=""
          width={56}
          height={56}
          /* Il est en haut de page, toujours visible : le differer le ferait
             apparaitre apres coup, sous les yeux de l'editeur. */
          loading="eager"
          decoding="async"
        />
      }
      actions={
        /*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ UN BOUTON SCINDÉ : LE GESTE À GAUCHE, LE CHOIX À DROITE.        │
         * │                                                                  │
         * │ Le bouton principal EST un lien vers l'écran de rédaction, et il │
         * │ y va d'un clic. Il ouvrait auparavant un formulaire replié au    │
         * │ bas de cette page — celui-là a disparu : deux chemins de         │
         * │ création divergent, et c'est toujours celui qu'on n'a pas        │
         * │ regardé qui écrit en base.                                       │
         * │                                                                  │
         * │ Le volet de droite épargne le second choix : le type est déjà    │
         * │ posé en arrivant. C'est un `<details>`, donc il s'ouvre au       │
         * │ clavier et sans une ligne de JavaScript — la même mécanique que  │
         * │ les rayons du menu public.                                       │
         * └──────────────────────────────────────────────────────────────────┘
         */
        <span className={styles.scinde}>
          <a className={styles.boutonPrimaire} href={ecranRedaction()}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('admin.assoNouvellePublication')}
          </a>

          <details className={styles.menu}>
            <summary
              className={`${styles.boutonPrimaire} ${styles.menuResume}`}
              aria-label={t('admin.assoChoisirType')}
              title={t('admin.assoChoisirType')}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>

            <div className={styles.menuPanneau}>
              <p className={styles.menuIntitule}>{t('admin.assoChoisirType')}</p>
              {TYPES_PUBLICATION.map((valeur) => (
                <a className={styles.menuLien} key={valeur} href={ecranRedaction(valeur)}>
                  <span className={styles.pastilleType} aria-hidden="true">
                    {SIGLE_TYPE[valeur]}
                  </span>
                  {t(`admin.redType_${valeur}` as CleTraduction)}
                </a>
              ))}
            </div>
          </details>
        </span>
      }
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuCree')}</p>
      ) : null}
      {requete['maj'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuModifie')}</p>
      ) : null}
      {requete['publie'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuPublie')}</p>
      ) : null}
      {requete['depublie'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuDepublie')}</p>
      ) : null}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuSupprime')}</p>
      ) : null}

      {/* ── La bande de quatre chiffres ──────────────────────────────────── */}
      {chiffres ? (
        <div className={`${styles.carte} ${styles.bandeau}`}>
          <ul className={`${styles.bandeauGrille} ${styles.bandeauGrilleAssociation}`}>
            <li className={styles.bandeauCellule}>
              <p className={styles.bandeauIntitule}>{t('admin.assoAdherents')}</p>
              <p className={styles.bandeauValeur}>{Number(chiffres.adherents)}</p>
              <p className={styles.bandeauNote}>{t('admin.assoAdherentsNote')}</p>
            </li>
            <li className={styles.bandeauCellule}>
              <p className={styles.bandeauIntitule}>{t('admin.assoARenouveler')}</p>
              <p className={styles.bandeauValeur}>{Number(chiffres.a_renouveler)}</p>
              <p className={styles.bandeauNote}>{t('admin.assoARenouvelerNote')}</p>
            </li>
            {/*
              LES QUATRE CHIFFRES DU PROTOTYPE, ENFIN TOUS RÉELS.

              Les deux derniers étaient des substituts : ni la modération ni la
              programmation n'existaient, et deux cases vides auraient annoncé
              des fonctions absentes. Les migrations 0096 et 0099 les ont
              apportées ; `admin_stats_association` les compte depuis la 0102.
            */}
            <li className={styles.bandeauCellule}>
              <p className={styles.bandeauIntitule}>{t('admin.assoAModerer')}</p>
              <p className={styles.bandeauValeur}>{Number(chiffres.a_moderer)}</p>
              <p className={styles.bandeauNote}>{t('admin.assoAModererNote')}</p>
            </li>
            <li className={styles.bandeauCellule}>
              <p className={styles.bandeauIntitule}>{t('admin.assoProchaine')}</p>
              <p className={styles.bandeauValeur}>{date(chiffres.prochaine_publication)}</p>
              <p className={styles.bandeauNote}>
                {chiffres.prochaine_publication === null
                  ? t('admin.assoProchaineAucune')
                  : t('admin.assoProchaineNote')}
              </p>
            </li>
          </ul>
        </div>
      ) : null}

      {/*
        ┌──────────────────────────────────────────────────────────────────┐
        │ CINQ ONGLETS AU PROTOTYPE, DEUX ICI.                             │
        │                                                                  │
        │ Il propose Publications · Agenda · Commentaires · Adhérents ·    │
        │ Campagne. Trois d'entre eux n'ont ni données ni spécification :  │
        │ le cahier des charges §F4 bis décrit un espace qui « ne sert que │
        │ du texte », sans agenda d'ateliers, sans fil de commentaires et  │
        │ sans campagne de dons chiffrée par région.                       │
        │                                                                  │
        │ Les dessiner vides aurait annoncé trois fonctions absentes, et   │
        │ un éditeur aurait cliqué dessus. Les deux qui restent sont       │
        │ entièrement servis par de vraies données.                        │
        └──────────────────────────────────────────────────────────────────┘
      */}
      <nav className={styles.seg} aria-label={t('admin.assoOnglets')}>
        {ONGLETS.map((valeur) => {
          const actif = onglet === valeur;
          return (
            <a
              key={valeur}
              className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
              href={lien({ onglet: valeur })}
              aria-current={actif ? 'true' : undefined}
            >
              {t(`admin.assoOnglet_${valeur}` as CleTraduction)}
              {/*
                CHAQUE ONGLET COMPTE CE QU'IL A À TRAITER, ou rien.

                Un compteur à zéro sur l'agenda ne dirait pas « rien à faire » :
                il dirait « aucun atelier », ce qui est une autre information
                et qui se lit déjà dans l'onglet. On ne compte donc que là où
                le nombre APPELLE un geste.
              */}
              {compteur(valeur) === null ? null : (
                <span className={styles.segCompte}>{compteur(valeur)}</span>
              )}
            </a>
          );
        })}
      </nav>

      {onglet === 'publications' ? (
        <OngletPublications
          langue={langue}
          publications={publications}
          jeudis={jeudis}
          mot={mot}
          lienPublication={(id) => `/${langue}/admin/association/rediger?contenu=${id}`}
        />
      ) : null}

      {onglet === 'agenda' ? (
        <OngletAgenda
          langue={langue}
          evenements={evenements}
          ouvert={nouvelEvenement}
          lienNouveau={lien({ onglet: 'agenda', evenement: true })}
          lienFermer={lien({ onglet: 'agenda' })}
        />
      ) : null}

      {onglet === 'commentaires' ? (
        <OngletCommentaires langue={langue} commentaires={commentaires} />
      ) : null}

      {onglet === 'campagne' ? <OngletCampagne langue={langue} campagne={campagne} /> : null}

      {onglet === 'adherents' ? (
        /* ── Les adhérents ────────────────────────────────────────────── */
        <div className={`${styles.carte} ${styles.grilleCadre}`}>
          {lignesAdherents.length === 0 ? (
            <p className={styles.grilleVide}>{t('admin.assoAucunAdherent')}</p>
          ) : (
            <table
              className={styles.grille}
              style={
                {
                  '--grille-colonnes': COLONNES_ADHERENTS,
                  '--grille-min': LARGEUR_MIN_ADHERENTS,
                } as CSSProperties
              }
            >
              <thead>
                <tr className={`${styles.grilleEntete} ${styles.grilleEnteteVentes}`}>
                  <th scope="col">{t('admin.assoColAdherent')}</th>
                  <th scope="col">{t('admin.assoColFormule')}</th>
                  <th scope="col">{t('admin.assoColDepuis')}</th>
                  <th scope="col">{t('admin.assoColEcheance')}</th>
                  <th scope="col">{t('admin.colStatut')}</th>
                </tr>
              </thead>
              <tbody>
                {lignesAdherents.map((adherent) => (
                  <tr className={styles.grilleRangee} key={adherent.id}>
                    <td>
                      <p className={styles.adherentNom}>{adherent.nom ?? t('admin.nonPublie')}</p>
                      <p className={styles.adherentEmail}>{adherent.email ?? ''}</p>
                    </td>
                    {/*
                      « PROFIL » au prototype — « Parent », « Enseignante ».
                      Aucun champ de ce genre n'existe, et aucune règle ne dit
                      d'en collecter un. La FORMULE, elle, est un fait.
                    */}
                    <td className={styles.noteVentes}>
                      {t(`admin.offrePeriode_${adherent.offre}` as CleTraduction)}
                    </td>
                    <td className={styles.noteVentes}>{date(adherent.cree_le)}</td>
                    <td className={styles.noteVentes}>{date(adherent.fin_acces)}</td>
                    <td>
                      <span
                        className={`${styles.etat} ${
                          adherent.statut_observe === 'actif'
                            ? styles.etatPublie
                            : styles.etatBrouillon
                        }`}
                      >
                        {adherent.statut_observe}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {/*
        LE PANNEAU DE RÉDACTION NE S’OUVRE QUE SUR LA PUBLICATION CHOISIE.

        Il portait AUTREFOIS les huit contenus dépliés en même temps : huit
        formulaires de réglages, huit dépôts de version et huit boutons de
        suppression sur une même page. Cliquer une rangée de la liste le
        réduit à celle qu’on édite — et c’est aussi ce que fait le
        prototype, dont la rangée mène à l’éditeur.
      */}
      {selection.length === 0 ? null : (
        <div className={styles.cadre}>
          <div className={styles.versions}>
              {selection.map((contenu) => (
                <article className={styles.version} key={contenu.id}>
                  <header className={styles.versionEntete}>
                    <span className={styles.versionLangue}>
                      {/*
                        Un contenu sans version française n'a pas de titre à
                        montrer. Son slug le désigne alors — c'est l'identifiant
                        que le rédacteur a choisi, et il le reconnaîtra.
                      */}
                      {contenu.titre ?? contenu.slug}
                    </span>

                    <span
                      className={`${styles.etat} ${
                        contenu.statut === 'publie' ? styles.etatPublie : styles.etatBrouillon
                      }`}
                    >
                      {traduire(langue, `admin.statut_${contenu.statut}` as CleTraduction)}
                    </span>

                    <span className={styles.etat}>
                      {traduire(langue, `admin.contenuAcces_${contenu.acces}` as CleTraduction)}
                    </span>

                    <span className={styles.versionFichiers}>
                      {contenu.slug}
                      {' · '}
                      {traduire(langue, 'admin.colLangues')} :{' '}
                      {contenu.langues.length > 0
                        ? contenu.langues
                            .map((code) =>
                              code === 'fr' || code === 'en'
                                ? traduire(langue, `langue.${code}` as CleTraduction)
                                : code,
                            )
                            .join(', ')
                        : '—'}
                      {contenu.publie_le
                        ? ` · ${new Date(contenu.publie_le).toLocaleDateString(langue)}`
                        : ''}
                    </span>
                  </header>

                  {/* ── Rangement ────────────────────────────────────────── */}
                  <form className={styles.formulaire} action={modifierContenu.bind(null, langue)}>
                    <input type="hidden" name="id" value={contenu.id} />

                    <span className={styles.blocIntitule}>
                      {traduire(langue, 'admin.contenuReglages')}
                    </span>

                    <div className={styles.rangee}>
                      <div className={styles.champ}>
                        <label className={styles.libelle} htmlFor={`cat-${contenu.id}`}>
                          {traduire(langue, 'admin.contenuCategorie')}
                        </label>
                        <select
                          className={styles.saisie}
                          id={`cat-${contenu.id}`}
                          name="categorie"
                          defaultValue={contenu.categorie}
                        >
                          {CATEGORIES_ASSOCIATION.map((categorie) => (
                            <option key={categorie} value={categorie}>
                              {traduire(langue, `v2.cat_${categorie}` as CleTraduction)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.champ}>
                        <label className={styles.libelle} htmlFor={`acces-${contenu.id}`}>
                          {traduire(langue, 'admin.contenuAcces')}
                        </label>
                        <select
                          className={styles.saisie}
                          id={`acces-${contenu.id}`}
                          name="acces"
                          defaultValue={contenu.acces}
                        >
                          {ACCES.map((acces) => (
                            <option key={acces} value={acces}>
                              {traduire(langue, `admin.contenuAcces_${acces}` as CleTraduction)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.champ}>
                        <label className={styles.libelle} htmlFor={`ordre-${contenu.id}`}>
                          {traduire(langue, 'admin.contenuOrdre')}
                        </label>
                        <input
                          className={styles.saisie}
                          id={`ordre-${contenu.id}`}
                          name="ordre"
                          type="number"
                          min={0}
                          max={999}
                          step={1}
                          defaultValue={contenu.ordre}
                        />
                      </div>
                    </div>

                    <label className={styles.interrupteur} htmlFor={`vedette-${contenu.id}`}>
                      <input
                        className={styles.interrupteurCase}
                        id={`vedette-${contenu.id}`}
                        name="vedette"
                        type="checkbox"
                        value="oui"
                        defaultChecked={contenu.vedette}
                      />
                      <span>
                        <span className={styles.interrupteurNom}>
                          {traduire(langue, 'admin.contenuVedette')}
                        </span>
                        <span className={styles.interrupteurNote}>
                          {traduire(langue, 'admin.contenuVedetteAide')}
                        </span>
                      </span>
                    </label>

                    <div className={styles.boutons}>
                      <BoutonSoumission variante="secondaire">
                        {traduire(langue, 'admin.contenuEnregistrer')}
                      </BoutonSoumission>
                    </div>
                  </form>

                  {/* ── Publication et suppression ───────────────────────── */}
                  <div className={styles.boutons}>
                    {/*
                      L'état VOULU part dans le formulaire, jamais « bascule » :
                      deux onglets ouverts sur cette liste inverseraient sinon
                      deux fois un statut touché une seule fois.
                    */}
                    <form
                      className={styles.formulaireNu}
                      action={changerPublication.bind(null, langue)}
                    >
                      <input type="hidden" name="id" value={contenu.id} />
                      <input
                        type="hidden"
                        name="publie"
                        value={contenu.statut === 'publie' ? 'non' : 'oui'}
                      />
                      <BoutonSoumission variante="discret">
                        {traduire(
                          langue,
                          contenu.statut === 'publie'
                            ? 'admin.contenuDepublier'
                            : 'admin.contenuPublier',
                        )}
                      </BoutonSoumission>
                    </form>

                    <form
                      className={styles.formulaireNu}
                      action={supprimerContenu.bind(null, langue)}
                    >
                      <input type="hidden" name="id" value={contenu.id} />
                      <BoutonSoumission variante="danger">
                        {traduire(langue, 'admin.contenuSupprimer')}
                      </BoutonSoumission>
                    </form>
                  </div>
                </article>
              ))}
          </div>

          <p className={styles.aide}>{traduire(langue, 'admin.contenuSuppressionAide')}</p>
        </div>
      )}
    </GabaritAdmin>
  );
}
