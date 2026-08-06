import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { lireBibliotheque } from '@/lib/account/bibliotheque';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { identifierAppelant } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Motif } from '@/components/motif';
import { teintesRegion } from '@/components/catalogue';
import { GabaritEspace } from '@/components/espace';
import espace from '@/components/espace/espace.module.css';
import ecran from '@/components/ecran/ecran.module.css';
import { telechargerConte } from '../actions';

/**
 * Ma bibliothèque — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN LE PLUS IMPORTANT DU PROJET, ET LE PLUS FACILE À RATER.         │
 * │                                                                          │
 * │ « Abonnement expiré + bibliothèque remplie » est LE cas métier central,  │
 * │ et le bug classique de ce domaine. Il doit répondre à trois questions    │
 * │ sans ambiguïté :                                                         │
 * │                                                                          │
 * │   * ce que j'ai PERDU — la lecture des titres d'abonnement, nommée ;    │
 * │   * ce que je GARDE — mes achats, lecture ET téléchargement, sans        │
 * │     limite de durée ;                                                    │
 * │   * POURQUOI — l'abonnement ouvrait la lecture, jamais le fichier.       │
 * │                                                                          │
 * │ Le bouton de téléchargement suit `peut_telecharger`, jamais un motif ni  │
 * │ un statut d'abonnement. C'est ce qui garantit qu'un abonné expiré        │
 * │ retrouve ses achats intacts.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'compte.bibliotheque') };
}

export default async function PageBibliotheque({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  // Un téléchargement refusé revient ici avec son CODE : la route rédige ses
  // messages en français, et l'écran les traduit depuis le code.
  const brut = requete['erreur'];
  const erreur = Array.isArray(brut) ? brut[0] : brut;

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let bibliotheque;
  let abonnement;
  try {
    [bibliotheque, abonnement] = await Promise.all([
      lireBibliotheque(appelant.id, langue),
      abonnementCourant(appelant.id),
    ]);
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ `statutEffectif`, JAMAIS `statut`.                                     │
  // │                                                                        │
  // │ Le second est ce que le prestataire a rapporté ; le premier replie les │
  // │ dates et décrit la réalité. Un abonnement dont la période est échue    │
  // │ sans qu'aucun événement ne soit arrivé — un webhook perdu — est encore │
  // │ « actif » au sens rapporté, et ne l'est plus au sens observé.          │
  // │                                                                        │
  // │ L'avertissement ne paraît donc QUE si l'abonnement a réellement pris   │
  // │ fin : un abonné actif n'a rien perdu, et le lui annoncer serait        │
  // │ alarmant à tort.                                                       │
  // └────────────────────────────────────────────────────────────────────────┘
  const abonnementPerdu =
    abonnement !== null && abonnement.statutEffectif !== 'actif' && abonnement.statutEffectif !== 'essai';

  return (
    <GabaritEspace langue={langue} onglet="compte/bibliotheque" email={appelant.email}>
      <h1 className={ecran.titre}>{traduire(langue, 'compte.bibliotheque')}</h1>
      <p className={ecran.intro}>{traduire(langue, 'compte.bibliothequeIntro')}</p>

      {erreur ? (
        <p className={ecran.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {/* ── Abonnement expiré : les trois questions ─────────────────────── */}
      {abonnementPerdu ? (
        <section className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
          <h2 className={ecran.panneauTitre}>
            {traduire(langue, 'compte.perteAbonnementTitre')}
          </h2>

          {/* Ce que j'ai perdu. */}
          <p className={ecran.panneauTexte}>
            {traduire(langue, 'compte.perteAbonnementPerdu')}
          </p>

          {/*
            Ce que je garde — en encre pleine, parce que c'est la phrase qui
            évite la réclamation. Elle est affichée MÊME si la bibliothèque est
            vide : un abonné expiré sans achat doit lire la perte, et c'est le
            contre-test de ce comportement.
          */}
          <p className={ecran.panneauTexteFort}>
            {traduire(langue, 'compte.perteAbonnementGarde')}
          </p>

          {/* Pourquoi. */}
          <p className={ecran.panneauTexte}>
            {traduire(langue, 'compte.perteAbonnementPourquoi')}
          </p>

          {/* « Reprendre un abonnement » mène au tunnel : celui qui lit cette
              phrase a déjà été abonné, il n'a rien à redécouvrir. */}
          <a className={ecran.boutonPrimaire} href={`/${langue}/abonnement/souscrire`}>
            {traduire(langue, 'compte.perteAbonnementAction')}
          </a>
        </section>
      ) : null}

      {/* ── Reprendre ma lecture ────────────────────────────────────────── */}
      {bibliotheque.en_cours.length > 0 ? (
        <section className={ecran.section}>
          <h2 className={ecran.sousTitre}>{traduire(langue, 'compte.enCoursTitre')}</h2>

          <ul className={espace.enCours}>
            {bibliotheque.en_cours.map((entree) => (
              <li
                key={entree.livre_id}
                className={espace.reprise}
                style={teintesRegion(entree.region)}
              >
                {entree.couverture ? (
                  <img
                    src={entree.couverture.vignette}
                    width={200}
                    height={300}
                    loading="lazy"
                    decoding="async"
                    alt=""
                    className={espace.repriseImage}
                  />
                ) : null}

                <div className={espace.repriseTexte}>
                  <a className={espace.repriseTitre} href={`/${langue}/contes/${entree.slug}`}>
                    {entree.titre}
                  </a>

                  {/*
                    « Page 7 sur 32 », et RIEN de plus. La maquette ajoute
                    « lu par Kadi » — un prénom d'enfant, que la règle de
                    conformité interdit et que le schéma ne porte nulle part.
                  */}
                  {entree.reprise ? (
                    <p className={espace.repriseProgres}>
                      {traduire(langue, 'compte.reprisePage').replace(
                        '{page}',
                        String(entree.reprise.page),
                      )}
                    </p>
                  ) : null}
                </div>

                {/*
                  La progression SURVIT à la perte d'accès : un ancien abonné
                  voit sa page de reprise sans pouvoir rouvrir le conte. On ne
                  propose donc « Reprendre » que si le moteur de droits le
                  permet — proposer une porte qui se refermera au nez de qui la
                  pousse serait pire que ne rien proposer.
                */}
                {entree.acces.canRead ? (
                  <a className={espace.repriseAction} href={`/${langue}/lire/${entree.slug}`}>
                    {traduire(langue, 'compte.lire')}
                  </a>
                ) : (
                  <p className={espace.repriseProgres}>
                    {traduire(langue, 'compte.plusAccessible')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Mes contes achetés ──────────────────────────────────────────── */}
      <section className={ecran.section}>
        <div className={espace.enteteSection}>
          <h2 className={ecran.sousTitre}>{traduire(langue, 'compte.achatsTitre')}</h2>

          {bibliotheque.achats.length > 0 ? (
            <p className={espace.noteSection}>
              {traduire(langue, 'compte.achatsCompte').replace(
                '{nombre}',
                String(bibliotheque.achats.length),
              )}
            </p>
          ) : null}
        </div>

        {bibliotheque.achats.length === 0 ? (
          <div className={ecran.vide}>
            {/*
              Jamais un bloc vide : le modèle est celui du catalogue — dire ce
              qui manque, et donner une action.
            */}
            <Motif region="vide" place="plein" rayon="14px" className={ecran.videMotif} />

            <div className={ecran.videTexte}>
              <p className={ecran.videTitre}>{traduire(langue, 'compte.achatsVide')}</p>
              <p className={ecran.videCorps}>{traduire(langue, 'compte.achatsVideCorps')}</p>
            </div>

            <a className={ecran.boutonSecondaire} href={`/${langue}/catalogue`}>
              {traduire(langue, 'compte.achatsVideAction')}
            </a>
          </div>
        ) : (
          <ul className={espace.achats}>
            {bibliotheque.achats.map((entree) => (
              <li
                key={entree.livre_id}
                className={espace.achat}
                style={teintesRegion(entree.region)}
              >
                {entree.couverture ? (
                  <img
                    src={entree.couverture.vignette}
                    width={320}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    alt=""
                    className={espace.achatImage}
                  />
                ) : null}

                <div className={espace.achatCorps}>
                  {entree.region ? (
                    <p className={espace.achatOrigine}>
                      <span className={espace.achatPuce} aria-hidden="true" />
                      {traduire(langue, `regions.${entree.region}`)}
                    </p>
                  ) : null}

                  <a className={espace.achatTitre} href={`/${langue}/contes/${entree.slug}`}>
                    {entree.titre}
                  </a>

                  {/*
                    Dit explicitement, et pas seulement sous-entendu : c'est la
                    réponse à « qu'est-ce que je garde ? », posée avant même
                    que la question ne se pose.
                  */}
                  <p className={espace.achatNote}>
                    {entree.source === 'offert'
                      ? traduire(langue, 'compte.offert')
                      : entree.peut_telecharger
                        ? traduire(langue, 'compte.conserveSansLimite')
                        : ''}
                  </p>
                </div>

                <div className={espace.achatActions}>
                  {entree.acces.canRead ? (
                    <a className={espace.achatLire} href={`/${langue}/lire/${entree.slug}`}>
                      {traduire(langue, 'compte.lire')}
                    </a>
                  ) : (
                    <p className={espace.achatIndisponible}>
                      {traduire(langue, 'compte.plusAccessible')}
                    </p>
                  )}

                  {/*
                    ┌──────────────────────────────────────────────────────────┐
                    │ DEUX CHOIX ET UN BOUTON, ET NON UN BOUTON PAR           │
                    │ COMBINAISON.                                             │
                    │                                                          │
                    │ Cette carte énumérait toutes les combinaisons langue ×    │
                    │ format : un conte en deux langues donnait QUATRE boutons  │
                    │ de téléchargement, plus « Lire » — cinq commandes dans    │
                    │ une carte de 224 px, où il fallait lire chaque libellé    │
                    │ pour distinguer « PDF (FR) » de « PDF (EN) ».            │
                    │                                                          │
                    │ Le sélecteur de langue ne paraît QUE s'il y a un choix à  │
                    │ faire : un menu à une seule entrée impose une décision    │
                    │ sans en offrir aucune.                                    │
                    └──────────────────────────────────────────────────────────┘

                    Le droit vient de `peut_telecharger`, jamais d'un motif
                    d'accès — c'est ce qui garantit qu'un abonné expiré retrouve
                    ses achats intacts. Le serveur le revérifie de toute façon à
                    chaque téléchargement, contre `entitlements`.

                    C'est une ACTION et non un lien : la route de téléchargement
                    rend une URL signée en JSON, pas un fichier. Un lien direct
                    affichait donc du JSON brut dans le navigateur.
                  */}
                  {entree.peut_telecharger ? (
                    <form
                      className={espace.achatTelechargement}
                      action={telechargerConte.bind(null, langue, entree.livre_id)}
                    >
                      {entree.langues.length > 1 ? (
                        <span className={espace.achatChoix}>
                          <label
                            className={espace.achatChoixLibelle}
                            htmlFor={`langue-${entree.livre_id}`}
                          >
                            {traduire(langue, 'compte.choixLangue')}
                          </label>
                          <select
                            className={espace.achatChoixListe}
                            id={`langue-${entree.livre_id}`}
                            name="langue_contenu"
                            defaultValue={entree.langues[0]}
                          >
                            {entree.langues.map((codeLangue) => (
                              <option key={codeLangue} value={codeLangue}>
                                {traduire(langue, `langue.${codeLangue}` as CleTraduction)}
                              </option>
                            ))}
                          </select>
                        </span>
                      ) : (
                        <input type="hidden" name="langue_contenu" value={entree.langues[0]} />
                      )}

                      <span className={espace.achatChoix}>
                        <label
                          className={espace.achatChoixLibelle}
                          htmlFor={`format-${entree.livre_id}`}
                        >
                          {traduire(langue, 'compte.choixFormat')}
                        </label>
                        <select
                          className={espace.achatChoixListe}
                          id={`format-${entree.livre_id}`}
                          name="format"
                          defaultValue="pdf"
                        >
                          <option value="pdf">PDF</option>
                          <option value="epub">EPUB</option>
                        </select>
                      </span>

                      <button type="submit" className={espace.achatTelecharger}>
                        {traduire(langue, 'compte.telecharger')}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </GabaritEspace>
  );
}
