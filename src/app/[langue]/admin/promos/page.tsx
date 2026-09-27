import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { compterPromosParStatut, listerPromos } from '@/lib/admin/service';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { PanneauPromo } from './panneau-promo';

/**
 * LES CODES PROMOTIONNELS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE STATUT EST CALCULÉ EN BASE, ET UNE SEULE FOIS.                       │
 * │                                                                          │
 * │ Actif, programmé, expiré, épuisé, désactivé : `statut_promo` (migration  │
 * │ 0093) répond, contre `app_now()` — la même horloge injectable que le     │
 * │ reste du projet. La liste l'appelle, les compteurs de segments           │
 * │ l'appellent, le filtre l'appelle.                                        │
 * │                                                                          │
 * │ Le recalculer ici donnerait une seconde définition, et c'est toujours la │
 * │ copie qui a l'air d'avoir raison. Pire : les compteurs annonceraient un  │
 * │ nombre que le clic ne montrerait pas.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « S'APPLIQUE À » DIT LA VÉRITÉ, ET ELLE EST COURTE.                     │
 * │                                                                          │
 * │ Le prototype y liste des produits — contes, livrets, abonnement,         │
 * │ adhésion. Aucune portée n'existe en base : un code porte sur TOUT le     │
 * │ panier. La colonne l'écrit plutôt que d'afficher une liste inventée, et  │
 * │ la seconde ligne porte la seule condition réelle — la zone tarifaire     │
 * │ d'un code à montant fixe.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type StatutPromo = 'actif' | 'programme' | 'epuise' | 'expire' | 'inactif';

/** Une ligne rendue par `admin_lister_promos` (migration 0093). */
interface LignePromo {
  id: string;
  code: string;
  type: 'montant' | 'pourcentage';
  valeur: number;
  devise: string | null;
  zone: 'international' | 'afrique' | null;
  debut_le: string | null;
  expire_le: string | null;
  usage_max: number | null;
  usage_count: number;
  statut: StatutPromo;
}

/** L'ordre du prototype, puis « désactivé » qu'il ne connaît pas. */
const STATUTS: readonly StatutPromo[] = ['actif', 'programme', 'epuise', 'expire', 'inactif'];

/*
 * `inactif` est A NOUS : le prototype ne connaît pas de code désactivé à la
 * main. Son segment n'apparaît donc que s'il a des lignes — un filtre
 * toujours vide encombrerait la barre, un filtre caché masquerait des codes.
 * Même règle que `essai` et `anomalie` sur l'écran des abonnements.
 */
const HORS_PROTOTYPE: readonly StatutPromo[] = ['inactif'];

const LIBELLE_STATUT: Record<StatutPromo, CleTraduction> = {
  actif: 'admin.promoStatutActif',
  programme: 'admin.promoStatutProgramme',
  epuise: 'admin.promoStatutEpuise',
  expire: 'admin.promoStatutExpire',
  inactif: 'admin.promoStatutInactif',
};

const ETAT_STATUT: Record<StatutPromo, string | undefined> = {
  actif: styles.etatPublie,
  programme: styles.etatAccent,
  epuise: styles.etatAlerte,
  expire: styles.etatBrouillon,
  inactif: styles.etatBrouillon,
};

/** La jauge d'utilisations se remplit en pour-cent — ce n'est pas un montant. */
const POUR_CENT = 100;

/** Les cotes du tableau, reprises du prototype d'administration. */
const COLONNES = 'minmax(0, 1.1fr) 120px minmax(0, 1.3fr) 150px minmax(0, 1fr) 100px 16px';
const LARGEUR_MIN = '820px';

function premier(brut: string | string[] | undefined): string | undefined {
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return valeur && valeur.length > 0 ? valeur : undefined;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.promos'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminPromos({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const demande = premier(requete['statut']);
  const statut = STATUTS.includes(demande as StatutPromo) ? (demande as StatutPromo) : undefined;
  const q = premier(requete['q']);
  const nouveau = premier(requete['nouveau']) === '1';
  const erreur = premier(requete['erreur']);

  const [resultat, comptes] = await Promise.all([
    listerPromos({ statut: statut ?? null, recherche: q ?? null, page: 1, taille: 50 }).catch(
      () => null,
    ),
    compterPromosParStatut({ recherche: q ?? null }).catch(() => null),
  ]);

  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const promos = resultat.donnees as unknown as LignePromo[];
  const parStatut = new Map(
    ((comptes?.ok ? comptes.donnees : []) as { statut: string; nb: number }[]).map((l) => [
      l.statut,
      Number(l.nb),
    ]),
  );

  /* UN formateur par devise présente, résolu une seule fois. */
  const devises = [...new Set(promos.map((p) => p.devise).filter((d): d is string => d !== null))];
  const monnaies = new Map(
    await Promise.all(devises.map(async (c) => [c, await lireDevise(c)] as const)),
  );

  /*
   * La remise, dite comme le prototype l'écrit : « \u221220 % » ou « \u22121 000 FCFA ».
   * Le signe est un MOINS typographique, pas un trait d'union : c'est un
   * nombre négatif, et le trait d'union se lit comme une césure.
   */
  const remise = (promo: LignePromo): string => {
    if (promo.type === 'pourcentage') return `\u2212${String(promo.valeur)}\u00a0%`;
    const monnaie = promo.devise ? monnaies.get(promo.devise) : undefined;
    return `\u2212${
      monnaie ? formateur(monnaie)(promo.valeur) : `${String(promo.valeur)} ${promo.devise ?? ''}`
    }`;
  };

  const jour = (iso: string): string =>
    new Date(iso).toLocaleDateString(langue, { day: 'numeric', month: 'short', year: 'numeric' });

  /*
   * La validité en une ligne : une fenêtre, une borne, ou rien. Écrire
   * « depuis toujours \u2192 31 oct. » serait plus long ET moins clair que
   * « jusqu'au 31 oct. ».
   */
  const validite = (promo: LignePromo): string => {
    if (promo.debut_le && promo.expire_le) {
      return `${jour(promo.debut_le)} \u2192 ${jour(promo.expire_le)}`;
    }
    if (promo.debut_le) return `${t('admin.promoDepuisLe')} ${jour(promo.debut_le)}`;
    if (promo.expire_le) return `${t('admin.promoJusquAu')} ${jour(promo.expire_le)}`;
    return t('admin.promoToujours');
  };

  const base = `/${langue}/admin/promos`;
  const lien = (modif: { statut?: string; nouveau?: boolean }): string => {
    const params = new URLSearchParams();
    const s = 'statut' in modif ? modif.statut : statut;
    if (s) params.set('statut', s);
    if (q) params.set('q', q);
    if (modif.nouveau) params.set('nouveau', '1');
    const chaine = params.toString();
    return chaine ? `${base}?${chaine}` : base;
  };

  const total = [...parStatut.values()].reduce((somme, n) => somme + n, 0);

  const segments = STATUTS.filter(
    (valeur) =>
      !HORS_PROTOTYPE.includes(valeur) || (parStatut.get(valeur) ?? 0) > 0 || statut === valeur,
  );

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/promos"
      titre={t('admin.promos')}
      sousTitre={t('admin.promosSousTitreV3')}
      actions={
        <a className={styles.boutonPrimaire} href={lien({ nouveau: true })}>
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
          {t('admin.promoNouveau')}
        </a>
      }
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? <p className={styles.succes}>{t('admin.promoCree')}</p> : null}

      {/*
        ── Recherche et filtres, SUR UNE SEULE RANGÉE ───────────────────────

        Le prototype range les deux côte à côte ici, alors qu'il les empile sur
        les écrans des commandes et des abonnements. La différence n'est pas
        gratuite : ces deux-là ont DEUX segmentés et un décompte, celui-ci n'a
        qu'un segmenté et pas de décompte — « Tous » porte le total.

        Les empiler quand même coûtait quarante-neuf pixels, et tout l'écran en
        dessous les prenait.
      */}
      <div className={`${styles.carte} ${styles.filtresCarte}`}>
        <div className={styles.filtresLigne}>
          <form method="get" action={base} className={styles.rechercheChamp} role="search">
            {statut ? <input type="hidden" name="statut" value={statut} /> : null}

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
              placeholder={t('admin.promoRecherche')}
              className={styles.rechercheSaisieOrganic}
              aria-label={t('catalogue.recherche')}
            />
          </form>

          <nav className={styles.seg} aria-label={t('admin.colStatut')}>
            <a
              className={statut ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
              href={lien({ statut: undefined })}
              aria-current={statut ? undefined : 'true'}
            >
              {t('admin.promoTous')}
              {/* Le TOTAL : faute de décompte à côté du champ, il vit ici. */}
              <span className={styles.segCompte}>{total}</span>
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

      {/* ── Le tableau ───────────────────────────────────────────────────── */}
      <div className={`${styles.carte} ${styles.grilleCadre}`}>
        {promos.length === 0 ? (
          <p className={styles.grilleVide}>{t('admin.promoVide')}</p>
        ) : (
          <table
            className={styles.grille}
            role="table"
            style={{ '--grille-colonnes': COLONNES, '--grille-min': LARGEUR_MIN } as CSSProperties}
          >
            <thead role="rowgroup">
              <tr className={`${styles.grilleEntete} ${styles.grilleEnteteVentes}`} role="row">
                <th scope="col" role="columnheader">
                  {t('admin.colCode')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colReduction')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.promoPortee')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colUtilisations')}
                </th>
                <th scope="col" role="columnheader">
                  {t('admin.colValidite')}
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
              {promos.map((promo) => {
                const illimite = promo.usage_max === null;
                /*
                 * `POUR_CENT` plutot qu'un 100 nu : la regle de lint interdit
                 * la multiplication par cent, parce qu'un montant se convertit
                 * par `src/domain/money` — toutes les devises n'ont pas deux
                 * decimales. Ici, ce n'est PAS de l'argent : c'est la part
                 * d'une jauge, et cent pour cent valent cent partout.
                 */
                const part = illimite
                  ? POUR_CENT
                  : Math.min(
                      POUR_CENT,
                      Math.round((promo.usage_count / (promo.usage_max || 1)) * POUR_CENT),
                    );

                return (
                  <tr key={promo.id} className={styles.grilleRangee} role="row">
                    <td role="cell">
                      <span className={styles.promoCode}>{promo.code}</span>
                    </td>

                    <td role="cell" className={styles.venteFort}>
                      {remise(promo)}
                    </td>

                    <td role="cell">
                      <p className={styles.venteTexte}>{t('admin.promoPorteeTout')}</p>
                      {/*
                        La seule condition qui existe vraiment : un code à
                        montant fixe est cantonné à une grille tarifaire.
                      */}
                      {promo.zone ? (
                        <p className={styles.venteLigne2}>
                          {t(`admin.conteZone_${promo.zone}` as CleTraduction)}
                        </p>
                      ) : null}
                    </td>

                    <td role="cell">
                      <p className={styles.promoUtilisations}>
                        {promo.usage_count}
                        {illimite
                          ? ` \u00b7 ${t('admin.promoIllimite')}`
                          : ` / ${String(promo.usage_max)}`}
                      </p>
                      {/*
                        Décorative : le compte est écrit juste au-dessus, et le
                        répéter à un lecteur d'écran n'apprendrait rien.
                      */}
                      <span className={styles.promoJauge} aria-hidden="true">
                        <span
                          className={`${styles.promoJaugeRemplissage} ${
                            illimite
                              ? styles.promoJaugeIllimite
                              : promo.statut === 'epuise'
                                ? styles.promoJaugeEpuise
                                : ''
                          }`}
                          style={{ width: `${String(part)}%` }}
                        />
                      </span>
                    </td>

                    <td role="cell">
                      <p className={styles.promoValidite}>{validite(promo)}</p>
                    </td>

                    <td role="cell">
                      <span className={`${styles.etat} ${ETAT_STATUT[promo.statut]}`}>
                        {t(LIBELLE_STATUT[promo.statut])}
                      </span>
                    </td>

                    <td role="cell">
                      {/*
                        Le chevron est rendu mais ÉTEINT : un code ne s'ouvre
                        pas, parce qu'il ne se modifie pas. Le prototype le
                        dessine à 35 % d'opacité, et la colonne existe pour que
                        la grille garde ses sept pistes.
                      */}
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

      {nouveau ? <PanneauPromo langue={langue} fermeture={lien({})} /> : null}
    </GabaritAdmin>
  );
}
