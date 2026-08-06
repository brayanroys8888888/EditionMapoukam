import type { Metadata } from 'next';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { listerLivres } from '@/lib/admin/service';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';

/**
 * LE CATALOGUE VU DE L'ADMINISTRATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI MANQUE À UN BROUILLON EST DIT ICI, PAS DÉCOUVERT À LA PUBLICATION.│
 * │                                                                          │
 * │ `admin_lister_livres` rend `manques`, calculé par                        │
 * │ `manques_pour_publication` — LA MÊME fonction que le déclencheur qui     │
 * │ refuse la publication. L'écran affiche donc exactement ce que la base    │
 * │ refusera.                                                                │
 * │                                                                          │
 * │ Une liste de contrôle réécrite dans l'interface aurait divergé au        │
 * │ premier champ ajouté, et l'éditeur aurait vu « publiable » sur un titre  │
 * │ que la base rejette.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Une ligne rendue par `admin_lister_livres`. */
interface LigneLivre {
  id: string;
  slug: string;
  auteur: string;
  statut: 'publie' | 'brouillon' | 'archive';
  gratuit: boolean;
  inclus_abonnement: boolean;
  disponible_achat: boolean;
  publie_le: string | null;
  prix: Record<string, { montant: number; devise: string }>;
  manques: string[];
  publiable: boolean;
}

const STATUTS = ['publie', 'brouillon', 'archive'] as const;

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.contes'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminContes({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  const brut = requete['statut'];
  const demande = Array.isArray(brut) ? brut[0] : brut;
  // Un statut inconnu dans l'URL ne fait pas tomber l'écran : il est ignoré.
  const statut = STATUTS.includes(demande as (typeof STATUTS)[number]) ? demande : undefined;

  const qBrut = requete['q'];
  const qSeule = Array.isArray(qBrut) ? qBrut[0] : qBrut;
  const q = qSeule?.trim();

  const resultat = await listerLivres({ statut: statut ?? null, page: 1, taille: 100 }).catch(
    () => null,
  );
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const tousLivres = resultat.donnees as unknown as LigneLivre[];
  const terme = q ? q.toLowerCase() : null;
  const livres = terme
    ? tousLivres.filter(
        (l) =>
          l.slug.toLowerCase().includes(terme) ||
          l.auteur.toLowerCase().includes(terme) ||
          l.id.toLowerCase().includes(terme),
      )
    : tousLivres;

  const base = `/${langue}/admin/contes`;

  const lienFiltreStatut = (valeur?: string) => {
    const params = new URLSearchParams();
    if (valeur) params.set('statut', valeur);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <GabaritAdmin
      langue={langue}
      section="/contes"
      titre={traduire(langue, 'admin.contes')}
      sousTitre={traduire(langue, 'admin.contesSousTitre')}
      actions={
        <a className={styles.boutonPrimaire} href={`${base}/nouveau`}>
          {traduire(langue, 'admin.conteNouveau')}
        </a>
      }
    >
      {/*
        La suppression ramène ICI, et non sur l'écran du titre supprimé : le
        relire répondrait « introuvable », c'est-à-dire un 404 après une
        opération réussie.
      */}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.conteSupprime')}</p>
      ) : null}

      {/* ── Barre de recherche admin ────────────────────────────────────── */}
      <form method="get" action={base} className={styles.recherche} role="search">
        {statut ? <input type="hidden" name="statut" value={statut} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder={traduire(langue, 'admin.recherchePlaceholder')}
          className={styles.rechercheSaisie}
          aria-label={traduire(langue, 'catalogue.recherche')}
        />
        <button type="submit" className={styles.boutonSecondaire}>
          {traduire(langue, 'catalogue.rechercheAction')}
        </button>
        {q ? (
          <a
            className={styles.boutonDiscret}
            href={statut ? `${base}?statut=${statut}` : base}
          >
            {traduire(langue, 'catalogue.retirerTousFiltres')}
          </a>
        ) : null}
      </form>

      {/* ── Filtres de statut ────────────────────────────────────────────── */}
      <nav className={styles.filtres} aria-label={traduire(langue, 'admin.colStatut')}>
        <a
          className={statut ? styles.filtre : `${styles.filtre} ${styles.filtreActif}`}
          href={lienFiltreStatut(undefined)}
          aria-current={statut ? undefined : 'true'}
        >
          {traduire(langue, 'admin.tousLesStatuts')}
        </a>

        {STATUTS.map((valeur) => {
          const actif = statut === valeur;
          return (
            <a
              key={valeur}
              className={actif ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
              href={lienFiltreStatut(valeur)}
              aria-current={actif ? 'true' : undefined}
            >
              {traduire(langue, `admin.statut_${valeur}` as CleTraduction)}
            </a>
          );
        })}
      </nav>

      <div className={styles.cadre}>

        {livres.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucunConte')}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'admin.colSlug')}</th>
                <th scope="col">{traduire(langue, 'admin.colAuteur')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                <th scope="col">{traduire(langue, 'admin.colAcces')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colPrix')}
                </th>
              </tr>
            </thead>

            <tbody>
              {livres.map((livre) => {
                const acces = [
                  livre.gratuit ? traduire(langue, 'admin.accesGratuit') : null,
                  livre.inclus_abonnement ? traduire(langue, 'admin.accesAbonnement') : null,
                  livre.disponible_achat ? traduire(langue, 'admin.accesAchat') : null,
                ].filter(Boolean);

                /*
                 * Les prix sont affichés PAR ZONE, et jamais convertis : chaque
                 * zone a sa grille, et une conversion faite ici inventerait un
                 * montant que personne ne facturera. Le formatage reste brut —
                 * c'est un écran d'administration, pas une vitrine.
                 */
                const prix = Object.entries(livre.prix ?? {});

                return (
                  <tr key={livre.id}>
                    <td className={styles.cellulePrincipale}>
                      {/*
                        Le slug est le lien d'édition. Une colonne « Modifier »
                        de plus aurait ajouté une cible à viser sur une ligne
                        qui en a déjà : le nom du conte EST ce sur quoi on
                        clique pour l'ouvrir, partout ailleurs dans le produit.
                      */}
                      <a href={`${base}/${livre.id}`}>{livre.slug}</a>

                      {/*
                        Les manques ne s'affichent QUE s'il y en a. Une ligne
                        « publiable » sur chaque conte publié serait du bruit.
                      */}
                      {livre.manques.length > 0 ? (
                        <ul className={styles.manques}>
                          {livre.manques.map((manque) => (
                            <li key={manque} className={styles.manque}>
                              {manque}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>

                    <td>{livre.auteur}</td>

                    <td>
                      <span
                        className={`${styles.etat} ${
                          livre.statut === 'publie'
                            ? styles.etatPublie
                            : livre.manques.length > 0
                              ? styles.etatAlerte
                              : styles.etatBrouillon
                        }`}
                      >
                        {traduire(langue, `admin.statut_${livre.statut}` as CleTraduction)}
                      </span>
                    </td>

                    <td>{acces.length > 0 ? acces.join(' · ') : traduire(langue, 'admin.nonPublie')}</td>

                    <td className={styles.numerique}>
                      {prix.length === 0
                        ? traduire(langue, 'admin.aucunPrix')
                        : prix
                            .map(([zone, valeur]) => `${zone} ${String(valeur.montant)} ${valeur.devise}`)
                            .join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.note}>
        {traduire(langue, 'admin.chargeParLaBase')}
      </p>
    </GabaritAdmin>
  );
}
