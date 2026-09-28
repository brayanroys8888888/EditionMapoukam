import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { listerOffres } from '@/lib/admin/service';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { PanneauOffre, type OffreEditable } from './panneau-offre';
import { offresLesPlusChoisies } from './plus-choisie';

/**
 * LES OFFRES D'ABONNEMENT — §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN VEND DES DROITS. IL N'EN DÉFINIT AUCUN.                       │
 * │                                                                          │
 * │ Une offre porte un DOMAINE, et le domaine dit ce qu'elle ouvre :          │
 * │ `lecture` la lecture en ligne du catalogue, `association` les contenus    │
 * │ réservés de l'espace associatif. Ce que chacun ouvre est écrit UNE fois,  │
 * │ dans `abonnement_ouvre_droit` (migration 0067), et c'est de là que vient  │
 * │ l'étanchéité de §3.6 — pas d'une phrase de cet écran.                    │
 * │                                                                          │
 * │ Conséquence : créer une offre `association` n'ouvre rien de nouveau. Elle │
 * │ met en vente un droit qui existait déjà, sans ligne de code de plus.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « CE QUI MANQUE » EST LU, PAS CALCULÉ ICI.                              │
 * │                                                                          │
 * │ `admin_lister_offres` rend `manques` : les zones sans prix. L'écran       │
 * │ pourrait comparer la liste des zones à celle des prix et arriver au même  │
 * │ résultat — pour un temps. C'est exactement ce que fait                    │
 * │ `manques_pour_publication` pour les titres, et pour la même raison :      │
 * │ un manque calculé deux fois finit par se contredire, et c'est l'écran     │
 * │ qui a l'air d'avoir raison.                                              │
 * │                                                                          │
 * │ Le refus d'activer une offre sans prix vit dans la même fonction. L'écran │
 * │ n'empêche pas le geste : il montre le manque, et la base tranche.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA GRILLE DE CARTES REMPLACE LE TABLEAU — ET CE N'EST PAS QU'UN HABIT.   │
 * │                                                                          │
 * │ Quatre formules ne font pas un tableau : on ne les balaye pas du regard   │
 * │ pour en trouver une, on les COMPARE. Le prototype le dit en les mettant  │
 * │ côte à côte, chacune portant son prix par zone, et c'est la seule         │
 * │ disposition où « laquelle est la plus chère en Afrique » se lit d'un      │
 * │ coup d'œil.                                                              │
 * │                                                                          │
 * │ Ce qui disparaît du tableau : rien. Le code, le domaine, la périodicité,  │
 * │ l'ordre et le compte d'abonnés sont tous rendus — dans la carte pour ce   │
 * │ qui se compare, dans le tiroir pour ce qui s'édite.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ZONES = ['afrique', 'international'] as const;

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Un prix d'offre, tel que `admin_lister_offres` l'assemble en JSON. */
interface PrixOffre {
  montant: number;
  devise: string;
}

/** Une ligne rendue par `admin_lister_offres`. */
interface LigneOffre {
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
  prix: Record<string, PrixOffre>;
  manques: string[];
  abonnements: number | string;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.offres'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminOffres({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);
  const ouverte = premier(requete['offre']);
  const nouvelle = premier(requete['nouvelle']) === '1';

  const resultat = await listerOffres().catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const offres = resultat.donnees as unknown as LigneOffre[];
  const ecran = `/${langue}/admin/offres`;

  /*
   * Un formateur PAR DEVISE, résolu depuis la base.
   *
   * Le franc CFA n'a pas de sous-unité : diviser par cent afficherait des
   * montants faux d'un facteur cent. C'est la même précaution que sur les
   * commandes, les abonnements et les promos — et elle ne se devine pas de la
   * zone, puisque la zone `afrique` couvre XAF et XOF.
   */
  const devises = [
    ...new Set(offres.flatMap((offre) => Object.values(offre.prix).map((prix) => prix.devise))),
  ];
  const formateurs = new Map(
    await Promise.all(
      devises.map(async (code) => [code, formateur(await lireDevise(code))] as const),
    ),
  );

  const montant = (prix: PrixOffre): string =>
    formateurs.get(prix.devise)?.(prix.montant) ?? `${String(prix.montant)} ${prix.devise}`;

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ « LE PLUS CHOISI » EST COMPTÉ, JAMAIS DÉCRÉTÉ.                         │
   * │                                                                        │
   * │ Le prototype écrit la mention en dur sur sa première carte. Ici elle    │
   * │ désigne la formule qui devance STRICTEMENT toutes les autres de son     │
   * │ domaine, et seulement si elle a au moins un abonné.                     │
   * │                                                                        │
   * │ Les deux gardes comptent autant l'une que l'autre. Sans le « au moins  │
   * │ un », la mention se poserait le premier jour sur une formule que        │
   * │ personne n'a prise. Sans le « strictement », deux formules à égalité    │
   * │ se la disputeraient et l'ordre de la liste trancherait — c'est-à-dire   │
   * │ le hasard.                                                             │
   * │                                                                        │
   * │ Par DOMAINE, parce que lecture et adhésion ne se concurrencent pas :    │
   * │ comparer leurs effectifs dirait seulement lequel des deux publics est   │
   * │ le plus nombreux.                                                      │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  /*
   * La regle vit dans `plus-choisie.ts`, et elle y vit pour etre TESTEE : ses
   * trois gardes — au moins un abonne, strictement devant, et par domaine —
   * sont ce qui empeche la mention de mentir. Voir ce fichier pour le detail.
   */
  const meilleures = offresLesPlusChoisies(offres);

  const lien = (parametres: { offre?: string; nouvelle?: boolean }): string => {
    const p = new URLSearchParams();
    if (parametres.offre !== undefined) p.set('offre', parametres.offre);
    if (parametres.nouvelle === true) p.set('nouvelle', '1');
    const suite = p.toString();
    return suite === '' ? ecran : `${ecran}?${suite}`;
  };

  const offreOuverte = offres.find((offre) => offre.id === ouverte) ?? null;

  /** La ligne « Mensuel · 4 abonnés », telle que le prototype l'écrit. */
  const ligneMeta = (offre: LigneOffre): string => {
    const contrats = Number(offre.abonnements);
    const periode = t(`admin.offrePeriode_${offre.periode}` as CleTraduction);
    const abonnes =
      contrats === 1
        ? t('admin.offreUnAbonne')
        : t('admin.offreDesAbonnes').replace('{nb}', String(contrats));
    return `${periode} · ${abonnes}`;
  };

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/offres"
      titre={t('admin.offres')}
      sousTitre={t('admin.offresSousTitreV3')}
      actions={
        <a className={styles.boutonPrimaire} href={lien({ nouvelle: true })}>
          {/* Le « + » des boutons de création, comme sur les deux catalogues. */}
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
          {t('admin.offreNouvelle')}
        </a>
      }
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offreCreee')}</p>
      ) : null}
      {requete['maj'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offreModifiee')}</p>
      ) : null}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offreSupprimee')}</p>
      ) : null}

      {offres.length === 0 ? (
        <div className={styles.carte}>
          <p className={styles.vide}>{t('admin.aucuneOffre')}</p>
        </div>
      ) : (
        <div className={styles.offresGrille}>
          {offres.map((offre) => (
            <article key={offre.id} className={`${styles.carte} ${styles.offreCarte}`}>
              <div className={styles.offreHaut}>
                {/*
                  Le sur-titre n'occupe la place que s'il a quelque chose à
                  dire : un `<p>` vide pousserait l'étiquette d'une ligne sur
                  les cartes sans mention, et les hauteurs de carte
                  cesseraient de s'aligner.
                */}
                {meilleures.has(offre.id) ? (
                  <p className={styles.offreKicker}>{t('admin.offrePlusChoisie')}</p>
                ) : (
                  <span />
                )}

                <span
                  className={`${styles.etat} ${styles.etatPetit} ${
                    offre.actif ? styles.etatPublie : styles.etatBrouillon
                  }`}
                >
                  {t(offre.actif ? 'admin.offreVisibleTag' : 'admin.offreMasqueeTag')}
                </span>
              </div>

              <div>
                <h2 className={styles.offreNom}>{offre.libelle_fr}</h2>
                <p className={styles.offreMeta}>{ligneMeta(offre)}</p>
              </div>

              <div className={styles.offrePrix}>
                {ZONES.filter((zone) => offre.prix[zone] !== undefined).map((zone) => (
                  <div key={zone} className={styles.offrePrixLigne}>
                    <span className={styles.offrePrixZone}>
                      {t(`admin.conteZone_${zone}` as CleTraduction)}
                    </span>
                    <span className={styles.offrePrixValeur}>
                      {montant(offre.prix[zone] as PrixOffre)}
                    </span>
                  </div>
                ))}

                {/*
                  LE MANQUE EST DIT DANS LA COLONNE DES PRIX, pas en marge.
                  C'est là qu'on cherche le prix, donc là qu'il faut lire qu'il
                  n'y en a pas — et c'est aussi ce qui empêche l'offre d'être
                  mise en vente.
                */}
                {offre.manques.map((zone) => (
                  <div key={zone} className={styles.offrePrixLigne}>
                    <span className={styles.offrePrixZone}>
                      {t(`admin.conteZone_${zone}` as CleTraduction)}
                    </span>
                    <span className={styles.manque}>{t('admin.offreSansPrix')}</span>
                  </div>
                ))}
              </div>

              {/*
                UNE SEULE LIGNE À COCHE, ET C'EST L'ACCROCHE DE LA FORMULE.

                Le prototype en montre trois ou quatre par carte — « ce que
                l'offre ouvre », éditable ligne par ligne. La base ne porte
                qu'un `descriptif`, et la page publique ne lit MÊME PAS ce
                champ pour ses puces : elles sont figées en
                internationalisation, une par nature de carte. Afficher ici
                une liste éditable donnerait à croire que le site la rend.
                Le tiroir porte l'arbitrage complet.
              */}
              {offre.descriptif_fr ? (
                <ul className={styles.offreInclus}>
                  <li className={styles.offreInclusLigne}>
                    <span className={styles.offreCoche} aria-hidden="true">
                      {'✓'}
                    </span>
                    <span>{offre.descriptif_fr}</span>
                  </li>
                </ul>
              ) : null}

              <a
                className={`${styles.boutonSecondaire} ${styles.offreAction}`}
                href={lien({ offre: offre.id })}
              >
                {t('admin.offreModifier')}
              </a>
            </article>
          ))}
        </div>
      )}

      <p className={styles.aide}>{t('admin.offreAchatUniteAide')}</p>

      {nouvelle ? (
        <PanneauOffre langue={langue} offre={null} fermeture={lien({})} />
      ) : offreOuverte ? (
        <PanneauOffre
          langue={langue}
          offre={
            {
              ...offreOuverte,
              abonnements: Number(offreOuverte.abonnements),
            } satisfies OffreEditable
          }
          fermeture={lien({})}
        />
      ) : null}
    </GabaritAdmin>
  );
}
