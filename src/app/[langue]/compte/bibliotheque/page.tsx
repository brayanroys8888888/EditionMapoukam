import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire } from '@/i18n';
import { lireBibliotheque } from '@/lib/account/bibliotheque';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Motif } from '@/components/motif';
import { teintesTheme } from '@/components/catalogue';
import { GabaritEspace } from '@/components/espace';
import { GabaritEspaceV3, stylesEspaceV3 as e3 } from '@/components/v2/espace-v3';
import { estV3 } from '@/design/version';
import { BoutonTelechargement } from '@/components/espace/BoutonTelechargement';
import espace from '@/components/espace/espace.module.css';
import ecran from '@/components/ecran/ecran.module.css';


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

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let bibliotheque;
  let abonnement;
  try {
    [bibliotheque, abonnement] = await Promise.all([
      lireBibliotheque(appelant.id, langue),
      abonnementCourant(appelant.id, 'lecture'),
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

  const nomComplet = appelant.nom_complet || appelant.email.split('@')[0] || 'Utilisateur';
  const initiales =
    nomComplet
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase())
      .slice(0, 2)
      .join('') || 'EM';
  const dateMembre = appelant.cree_le
    ? new Date(appelant.cree_le).toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'mars 2026';
  const nbTitres = bibliotheque.achats.length;
  const nbLivretsGratuits = bibliotheque.achats.filter(
    (a) => a.source === 'offert' || a.slug.includes('livret') || a.slug.includes('gratuit'),
  ).length;
  const langueLecture = (appelant.langue_preferee || langue).toUpperCase();

  if (estV3()) {
    return (
      <GabaritEspaceV3
        langue={langue}
        onglet="compte/bibliotheque"
        email={appelant.email}
        titre={traduire(langue, 'compte.bibliotheque')}
        nomComplet={nomComplet}
        initiales={initiales}
        dateMembre={dateMembre}
        nbTitres={nbTitres}
        nbLivretsGratuits={nbLivretsGratuits}
        langueLecture={langueLecture}
      >
        <div className={e3.enteteSection} style={{ marginBottom: '24px', alignItems: 'center' }}>
          <div>
            <h2 className={e3.sousTitre} style={{ margin: 0 }}>{traduire(langue, 'compte.bibliotheque')}</h2>
            <p className={e3.intro} style={{ margin: '6px 0 0' }}>{traduire(langue, 'compte.bibliothequeIntro')}</p>
          </div>
          <a className={e3.boutonContour} href={`/${langue}/contes`}>
            {traduire(langue, 'compte.trouverConte')}
          </a>
        </div>

        {erreur ? (
          <p className={`${e3.panneau} ${e3.panneauAttention}`} role="alert">
            {messageErreur(langue, erreur)}
          </p>
        ) : null}

        {/* ── Abonnement expiré : les trois questions ─────────────────── */}
        {abonnementPerdu ? (
          <section className={`${e3.panneau} ${e3.panneauAttention}`}>
            <h2 className={e3.panneauTitre}>
              {traduire(langue, 'compte.perteAbonnementTitre')}
            </h2>

            {/* Ce que j'ai perdu. */}
            <p className={e3.panneauTexte}>
              {traduire(langue, 'compte.perteAbonnementPerdu')}
            </p>

            {/*
              Ce que je GARDE — c'est la phrase qui évite la réclamation, et
              elle s'affiche même sur une bibliothèque vide : un abonné expiré
              sans achat doit lire la perte.
            */}
            <p className={e3.valeur} style={{ textAlign: 'left', margin: '12px 0' }}>
              {traduire(langue, 'compte.perteAbonnementGarde')}
            </p>

            {/* Pourquoi. */}
            <p className={e3.panneauTexte}>
              {traduire(langue, 'compte.perteAbonnementPourquoi')}
            </p>

            {/* Mène au TUNNEL : qui lit cette phrase a déjà été abonné, il n'a
                aucun comparatif à redécouvrir. */}
            <p className={e3.actions} style={{ marginTop: '18px' }}>
              <a className={e3.bouton} href={`/${langue}/abonnement/souscrire`}>
                {traduire(langue, 'compte.perteAbonnementAction')}
              </a>
            </p>
          </section>
        ) : null}

        {/* ── Reprendre ma lecture ─────────────────────────────────────── */}
        {bibliotheque.en_cours.length > 0 ? (
          <section>
            <h2 className={e3.sousTitre}>{traduire(langue, 'compte.enCoursTitre')}</h2>

            <ul className={e3.liste}>
              {bibliotheque.en_cours.map((entree) => (
                <li
                  key={entree.livre_id}
                  className={e3.carteTitre}
                  style={teintesTheme(entree.themes)}
                >
                  {entree.couverture ? (
                    <img
                      src={entree.couverture.vignette}
                      width={200}
                      height={300}
                      loading="lazy"
                      decoding="async"
                      alt=""
                      className={e3.vignette}
                    />
                  ) : (
                    <span className={e3.vignette} aria-hidden="true" />
                  )}

                  <div className={e3.corps}>
                    <a className={e3.nom} href={`/${langue}/contes/${entree.slug}`}>
                      {entree.titre}
                    </a>

                    {/*
                      « Page 7 », et RIEN de plus. La maquette ajoutait un
                      prénom d'enfant, que la règle de conformité interdit et
                      que le schéma ne porte nulle part.
                    */}
                    {entree.reprise ? (
                      <span className={e3.note}>
                        {traduire(langue, 'compte.reprisePage').replace(
                          '{page}',
                          String(entree.reprise.page),
                        )}
                      </span>
                    ) : null}
                  </div>

                  {/*
                    La progression SURVIT à la perte d'accès : un ancien abonné
                    voit sa page de reprise sans pouvoir rouvrir le conte. On ne
                    propose donc « Reprendre » que si le moteur de droits le
                    permet — une porte qui se referme au nez de qui la pousse
                    est pire que pas de porte du tout.
                  */}
                  <div className={e3.actions}>
                    {entree.acces.canRead ? (
                      <a className={e3.bouton} href={`/${langue}/lire/${entree.slug}`}>
                        {traduire(langue, 'compte.lire')}
                      </a>
                    ) : (
                      <span className={e3.note}>
                        {traduire(langue, 'compte.plusAccessible')}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── Mes titres achetés ───────────────────────────────────────── */}
        <section>
          <div className={e3.enteteSection}>
            <h2 className={e3.sousTitre}>{traduire(langue, 'compte.achatsTitre')}</h2>

            {bibliotheque.achats.length > 0 ? (
              <p className={e3.compte}>
                {traduire(langue, 'compte.achatsCompte').replace(
                  '{nombre}',
                  String(bibliotheque.achats.length),
                )}
              </p>
            ) : null}
          </div>

          {bibliotheque.achats.length === 0 ? (
            /* Jamais un bloc vide : dire ce qui manque, et donner une action. */
            <div className={e3.vide}>
              <p className={e3.videTitre}>{traduire(langue, 'compte.achatsVide')}</p>
              <p className={e3.videCorps}>{traduire(langue, 'compte.achatsVideCorps')}</p>

              <a className={e3.boutonContour} href={`/${langue}/contes`}>
                {traduire(langue, 'compte.achatsVideAction')}
              </a>
            </div>
          ) : (
            <ul className={e3.liste}>
              {bibliotheque.achats.map((entree) => (
                <li
                  key={entree.livre_id}
                  className={e3.carteTitre}
                  style={teintesTheme(entree.themes)}
                >
                  {entree.couverture ? (
                    <img
                      src={entree.couverture.vignette}
                      width={320}
                      height={480}
                      loading="lazy"
                      decoding="async"
                      alt=""
                      className={e3.vignette}
                    />
                  ) : (
                    <span className={e3.vignette} aria-hidden="true" />
                  )}

                  <div className={e3.corps}>
                    {/*
                      LE THÈME À LA PLACE DE LA RÉGION — migration 0071. Un
                      thème est de la saisie libre : il s'affiche tel que
                      l'éditeur l'a écrit, sans passer par le dictionnaire.
                    */}
                    {entree.themes[0] !== undefined ? (
                      <p className={e3.theme}>
                        <span className={e3.puce} aria-hidden="true" />
                        {entree.themes[0]}
                      </p>
                    ) : null}

                    <a className={e3.nom} href={`/${langue}/contes/${entree.slug}`}>
                      {entree.titre}
                    </a>

                    {/*
                      Dit explicitement : c'est la réponse à « qu'est-ce que je
                      garde ? », posée avant même que la question ne se pose.
                    */}
                    <span className={e3.note}>
                      {entree.source === 'offert'
                        ? traduire(langue, 'compte.offert')
                        : entree.peut_telecharger
                          ? traduire(langue, 'compte.conserveSansLimite')
                          : ''}
                    </span>
                  </div>

                  <div className={e3.actions}>
                    {entree.acces.canRead ? (
                      <a className={e3.bouton} href={`/${langue}/lire/${entree.slug}`}>
                        {traduire(langue, 'compte.lire')}
                      </a>
                    ) : (
                      <span className={e3.note}>
                        {traduire(langue, 'compte.plusAccessible')}
                      </span>
                    )}

                    {/*
                      Le choix de langue vit DANS le composant, avec le
                      formulaire : rendu ici, il était hors du formulaire et
                      n'était donc jamais soumis — un titre bilingue ne se
                      téléchargeait qu'en français.
                    */}
                    {entree.peut_telecharger ? (
                      <div className={e3.telechargement}>
                        <BoutonTelechargement
                          langue={langue}
                          libelle={traduire(langue, 'compte.telecharger')}
                          className={e3.boutonContour}
                          formats={['pdf', 'epub']}
                          langues={entree.langues}
                          cheminBase={`/${langue}/telechargement/${entree.livre_id}`}
                          classesChoix={{
                            conteneur: e3.choix,
                            libelle: e3.choixLibelle,
                            liste: e3.choixListe,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </GabaritEspaceV3>
    );
  }

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
                style={teintesTheme(entree.themes)}
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
            <Motif teinte="vide" place="plein" rayon="14px" className={ecran.videMotif} />

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
                style={teintesTheme(entree.themes)}
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
                  {/*
                    LE THÈME À LA PLACE DE LA RÉGION — migration 0071.

                    La ligne portait le libellé traduit de la région. Un thème
                    est de la saisie libre : il s'affiche tel que l'éditeur l'a
                    écrit, sans passer par le dictionnaire.
                  */}
                  {entree.themes[0] !== undefined ? (
                    <p className={espace.achatOrigine}>
                      <span className={espace.achatPuce} aria-hidden="true" />
                      {entree.themes[0]}
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
                    <div className={espace.achatTelechargement}>
                      <BoutonTelechargement
                        langue={langue}
                        libelle={traduire(langue, 'compte.telecharger')}
                        formats={['pdf', 'epub']}
                        langues={entree.langues}
                        cheminBase={`/${langue}/telechargement/${entree.livre_id}`}
                      />
                    </div>
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
