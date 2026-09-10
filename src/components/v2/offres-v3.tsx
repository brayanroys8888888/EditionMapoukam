import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { lirePageEditoriale } from '@/content/editorial';
import type { ReponseOffres } from '@/domain/api/contract';

import { Revele } from './revele';
import styles from './offres-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LES OFFRES — L'ÉCRAN ORGANIC.                                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 924 à 964. Les mesures sont dans la feuille voisine ; ce
 * fichier ne porte que la structure et les données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUS LES MONTANTS VIENNENT DU SERVEUR, SANS EXCEPTION.                  │
 * │                                                                          │
 * │ Le prototype écrit « 2 000 FCFA », « 4 500 FCFA / mois » et « 10 000     │
 * │ FCFA / an ». Ces trois nombres sont INVENTÉS — le dossier de maquettes   │
 * │ le dit de lui-même — et les recopier créerait une seconde grille         │
 * │ tarifaire : celle que le client lit avant de payer l'autre.              │
 * │                                                                          │
 * │ `affichage` est déjà mis en forme par le serveur, avec sa monnaie et sa  │
 * │ zone. L'écran l'affiche ; il ne le recompose pas. Le franc CFA n'a pas   │
 * │ de sous-unité, et une division par cent écrite ici multiplierait         │
 * │ l'erreur par cent sur chaque ligne.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX PHRASES SONT LUES, ET NON ÉCRITES.                                 │
 * │                                                                          │
 * │ « L'abonnement ne donne pas le téléchargement » et « l'achat le donne »  │
 * │ sont rendues explicitement par l'API — `donne_telechargement`, toujours  │
 * │ `false` pour l'abonnement, toujours `true` pour l'achat. Elles           │
 * │ pourraient être écrites en dur : elles ne le sont pas, pour que la page  │
 * │ ne dépende pas de la mémoire de qui l'édite. C'est la confusion la plus  │
 * │ coûteuse du projet, et cet écran est le premier endroit où un client la  │
 * │ rencontre.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉCARTS AU PROTOTYPE, ÉCRITS ICI PARCE QU'ILS SE VOIENT.           │
 * │                                                                          │
 * │ 1. le sur-titre de la carte sombre dit « Lecture en ligne », là où le    │
 * │    prototype écrit « Le plus choisi ». Personne n'a encore choisi :      │
 * │    l'abonnement n'est pas ouvert (`abonnement_ouvert`), et une part de   │
 * │    marché affirmée sur une formule qu'on ne peut pas souscrire est une   │
 * │    phrase fausse. Le sur-titre dit donc ce que la formule OUVRE ;        │
 * │ 2. les questions ne sont pas celles du prototype. Le dépôt en porte six, │
 * │    écrites par l'éditeur, dans `src/content/editorial.ts`. Celles du     │
 * │    prototype annoncent des moyens de paiement qu'aucun prestataire réel  │
 * │    ne sert encore — le projet tourne derrière `FakePaymentProvider` ;    │
 * │ 3. le tableau comparatif de la V2 disparaît. Son information ne se perd  │
 * │    pas : chaque carte porte désormais SA limite, à la ligne, et c'est    │
 * │    l'idée du prototype — on lit ce qu'une formule n'ouvre pas au moment  │
 * │    où on lit son prix, et non trois écrans plus bas.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le ton d'une carte — le prototype en pose trois, et un seul est sombre. */
type Ton = 'clair' | 'sombre' | 'accent';

interface Carte {
  cle: string;
  ton: Ton;
  oeil: string;
  titre: string;
  /** Déjà mis en forme par le serveur. `null` quand la formule n'est pas ouverte. */
  prix: string | null;
  /** « par mois », « par an » — ou rien pour un achat à l'unité. */
  prixUnite: string | null;
  prixNote: string | null;
  /** Le corps qui remplace le prix et la liste quand la formule est fermée. */
  corps: string | null;
  inclus: string[];
  /** Ce que la formule N'ouvre PAS. */
  limite: string | null;
  action: { libelle: string; href: string } | null;
}

/** La coche du prototype : 16 px, trait de 3, sans remplissage. */
function Coche(): ReactNode {
  return (
    <svg
      className={styles.coche}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

export function OffresV3({
  langue,
  offres,
}: {
  langue: LangueInterface;
  offres: ReponseOffres;
}): ReactNode {
  const { abonnement, association, achat_unite: achat } = offres;

  /*
   * La variante de LANCEMENT — pilotée par un réglage serveur,
   * `business_settings.abonnement_ouvert`, et jamais par un compteur de titres
   * calculé ici. Le seuil de trente à quarante titres de §3.3 est une décision
   * commerciale, pas une règle de code.
   */
  const ouvert = abonnement.ouvert;

  // L'ordre est celui que rend `offres_publiques` : la formule d'entrée en
  // premier. La seconde périodicité devient la note du prix.
  const principale = abonnement.offres[0] ?? null;
  const secondaire = abonnement.offres[1] ?? null;

  /*
   * L'ADHÉSION N'EST AFFICHÉE QUE SI UNE OFFRE EXISTE.
   *
   * `offres_publiques` ne rend que les formules actives QUI ONT UN PRIX dans
   * la zone demandée. Une carte « Adhérer » posée sans cette garde mènerait,
   * les jours où l'éditeur n'a encore rien tarifé, à un tunnel qui refuse.
   */
  const adhesion = association.offres[0] ?? null;

  const parPeriode = (periode: string): string =>
    traduire(langue, 'offres.abonnementParPeriode').replace('{periode}', periode);

  const cartes: Carte[] = [
    {
      cle: 'achat',
      ton: 'clair',
      oeil: traduire(langue, 'offres.achatOeil'),
      titre: traduire(langue, 'offres.achatTitre'),
      prix: traduire(langue, 'offres.achatAPartirDe').replace('{montant}', achat.affichage),
      prixUnite: null,
      prixNote: traduire(langue, 'offres.achatPrixNote'),
      corps: null,
      inclus: [
        // La première ligne est LUE : c'est la promesse du fichier, et c'est
        // le serveur qui l'affirme.
        ...(achat.donne_telechargement ? [traduire(langue, 'offres.achatDonne1')] : []),
        traduire(langue, 'offres.achatDonne2'),
        traduire(langue, 'offres.achatDonne3'),
      ],
      limite: traduire(langue, 'offres.achatLimite'),
      action: {
        libelle: traduire(langue, 'offres.achatParcourir'),
        href: `/${langue}/catalogue`,
      },
    },

    {
      cle: 'lecture',
      ton: 'sombre',
      oeil: ouvert
        ? traduire(langue, 'offres.abonnementOeil')
        : traduire(langue, 'offres.bientot'),
      titre: ouvert
        ? traduire(langue, 'offres.abonnementTitreCarte')
        : traduire(langue, 'offres.abonnementFermeTitre'),
      prix: ouvert && principale ? principale.affichage : null,
      prixUnite: ouvert && principale ? parPeriode(principale.periode) : null,
      prixNote: ouvert
        ? secondaire
          ? `${secondaire.affichage} ${parPeriode(secondaire.periode)}`
          : traduire(langue, 'offres.abonnementPrixNote')
        : null,
      corps: ouvert ? null : traduire(langue, 'offres.abonnementFermeCorps'),
      inclus: ouvert
        ? [
            traduire(langue, 'offres.abonnementDonne1'),
            traduire(langue, 'offres.abonnementDonne2'),
            traduire(langue, 'offres.abonnementDonne3'),
          ]
        : [],
      // Lue, jamais écrite — voir l'encadré en tête de fichier.
      limite:
        ouvert && !abonnement.donne_telechargement
          ? traduire(langue, 'offres.abonnementLimite')
          : null,
      action: ouvert
        ? {
            libelle:
              abonnement.jours_essai > 0
                ? traduire(langue, 'offres.abonnementCommencerEssai').replace(
                    '{jours}',
                    String(abonnement.jours_essai),
                  )
                : traduire(langue, 'offres.abonnementSouscrire'),
            /*
              LE BOUTON MÈNE AU TUNNEL, ET NON À « MON ABONNEMENT ».

              Il a mené une fois à `/compte/abonnement`, qui répondait « vous
              n'avez pas d'abonnement » et renvoyait ici : une boucle fermée
              sur elle-même, où le bouton le plus visible de la page ne menait
              nulle part. Le tunnel, lui, sait quoi faire de quelqu'un qui est
              déjà abonné.
            */
            href: `/${langue}/abonnement/souscrire`,
          }
        : null,
    },
  ];

  if (adhesion) {
    cartes.push({
      cle: 'association',
      ton: 'accent',
      oeil: traduire(langue, 'offres.associationOeil'),
      titre: traduire(langue, 'offres.associationTitreCarte'),
      prix: adhesion.affichage,
      prixUnite: parPeriode(adhesion.periode),
      /*
       * La seconde périodicité passe en note, comme sur la carte de lecture —
       * une adhésion annuelle existe, et la taire ferait croire au mensuel
       * seul. À défaut, la note rappelle que les deux abonnements sont
       * distincts, ce que la ligne de limite dit ensuite autrement.
       */
      prixNote: association.offres[1]
        ? `${association.offres[1].affichage} ${parPeriode(association.offres[1].periode)}`
        : traduire(langue, 'offres.associationPrixNote'),
      corps: null,
      inclus: [
        traduire(langue, 'offres.associationDonne1'),
        traduire(langue, 'offres.associationDonne2'),
        traduire(langue, 'offres.associationDonne3'),
      ],
      limite: traduire(langue, 'offres.associationLimite'),
      action: {
        libelle: traduire(langue, 'offres.associationAdherer'),
        // Le domaine est DANS l'adresse : les deux abonnements sont étanches,
        // et se tromper de domaine vendrait le catalogue à qui voulait adhérer.
        href: `/${langue}/abonnement/souscrire?domaine=association`,
      },
    });
  }

  /*
   * Les questions viennent de la page éditoriale, pas d'une seconde liste.
   * Elle existe déjà, elle est traduite, et elle est la page vers laquelle
   * mène le pied de page — deux listes divergeraient à la première correction.
   */
  const questions = lirePageEditoriale(langue, 'questions-frequentes');

  return (
    <>
      {/* ── Le bandeau ────────────────────────────────────────────────── */}
      <section className={styles.bandeau}>
        <div className={styles.bandeauInterieur}>
          <span className={styles.oeil}>{traduire(langue, 'offres.oeil')}</span>
          <h1 className={styles.titre}>{traduire(langue, 'offres.titrePage')}</h1>
          <p className={styles.chapeau}>{traduire(langue, 'offres.introPage')}</p>
        </div>
      </section>

      <section className={styles.sectionFormules}>
        {/* ── Les formules ────────────────────────────────────────────── */}
        <Revele>
          <ul className={styles.formules}>
            {cartes.map((carte) => (
              <li
                key={carte.cle}
                className={[
                  styles.formule,
                  styles[carte.ton],
                  // Sans bouton, la carte est une ANNONCE : elle centre son
                  // contenu plutôt que de laisser un vide sous son texte.
                  carte.action ? '' : styles.ferme,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.formuleOeil}>{carte.oeil}</span>
                <h2 className={styles.formuleTitre}>{carte.titre}</h2>

                {carte.prix ? (
                  <p className={styles.prix}>
                    {carte.prix}
                    {/*
                      La périodicité est DANS la même ligne et au même corps
                      que le montant : le prototype écrit « 4 500 FCFA / mois »
                      d'un seul tenant. La rapetisser en ferait une note, et
                      « 7,99 € » sans période est un prix qu'on ne peut pas
                      comparer.
                    */}
                    {carte.prixUnite ? ` ${carte.prixUnite}` : null}
                  </p>
                ) : null}

                {carte.prixNote ? <p className={styles.prixNote}>{carte.prixNote}</p> : null}

                {carte.corps ? <p className={styles.corps}>{carte.corps}</p> : null}

                {carte.inclus.length > 0 ? (
                  <ul className={styles.inclusListe}>
                    {carte.inclus.map((ligne) => (
                      <li className={styles.inclus} key={ligne}>
                        <Coche />
                        {ligne}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/*
                  La limite est au même endroit sur les trois cartes, et dans
                  le même corps : c'est ce qui la rend comparable. Elle est
                  séparée par un filet parce qu'elle change de registre — tout
                  ce qui la précède est une promesse.
                */}
                {carte.limite ? <p className={styles.limite}>{carte.limite}</p> : null}

                {carte.action ? (
                  <a className={styles.formuleAction} href={carte.action.href}>
                    {carte.action.libelle}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Revele>

        {/* ── Les questions fréquentes ────────────────────────────────── */}
        {questions ? (
          <Revele>
            <div className={styles.questions}>
              <h2 className={styles.questionsTitre}>{questions.titre}</h2>

              <div className={styles.questionsGrille}>
                {questions.sections.map((section) => (
                  <div className={styles.question} key={section.titre}>
                    <p className={styles.questionIntitule}>{section.titre}</p>
                    {section.paragraphes?.map((paragraphe) => (
                      <p className={styles.questionReponse} key={paragraphe}>
                        {paragraphe}
                      </p>
                    ))}
                  </div>
                ))}
              </div>

              <a className={styles.questionsLien} href={`/${langue}/questions-frequentes`}>
                {traduire(langue, 'offres.questionsToutes')}
              </a>
            </div>
          </Revele>
        ) : null}
      </section>
    </>
  );
}
