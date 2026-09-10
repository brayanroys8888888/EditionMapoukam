import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { IDENTITE_EDITEUR } from '@/content/editorial';

import styles from './contact.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ NOUS ÉCRIRE — L'ÉCRAN ORGANIC.                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Le dessin vient du prototype de passation, lignes 1032 à 1088. Les mesures
 * sont dans `contact.module.css`, où elles sont commentées une à une ; ce
 * fichier ne porte que la structure et les données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FORMULAIRE OUVRE LE COURRIEL, IL N'ENVOIE RIEN LUI-MÊME.             │
 * │                                                                          │
 * │ Le prototype fait afficher « Message envoyé » par un bandeau. Il le dit  │
 * │ lui-même en tête du dossier : « No real backend: auth, payment,          │
 * │ downloads and the newsletter are all stubbed with toasts ». Ici il y a   │
 * │ un vrai produit derrière, et AUCUNE route qui reçoive un message de      │
 * │ contact : `FileMailer` écrit dans `.mails/` pour le développement, ce    │
 * │ n'est pas un canal vers l'éditeur.                                       │
 * │                                                                          │
 * │ Un bandeau « message envoyé » que personne ne reçoit est le pire des     │
 * │ deux mondes : le visiteur croit avoir écrit et attend une réponse qui    │
 * │ ne viendra pas. `action="mailto:"` remet donc le message dans SON        │
 * │ logiciel de courrier, où il voit ce qu'il envoie et en garde une trace.  │
 * │                                                                          │
 * │ À remplacer par une vraie route le jour où un prestataire d'envoi sera   │
 * │ branché — la mise en page, elle, ne bougera pas.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE CHAMPS, ET PAS UN DE PLUS.                                       │
 * │                                                                          │
 * │ Nom, adresse, sujet, message. Aucun champ « âge de votre enfant »,       │
 * │ aucun champ « prénom de votre enfant » : c'est une exigence de           │
 * │ conformité, et un formulaire de contact est exactement l'endroit où ce   │
 * │ genre de champ s'ajoute « pour mieux conseiller ».                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN JAVASCRIPT. C'EST UN CHOIX, PAS UN OUBLI.                         │
 * │                                                                          │
 * │ Les quatre sujets sont un groupe de boutons radio : la sélection, la     │
 * │ traversée aux flèches et l'envoi de la valeur sont le travail du         │
 * │ navigateur. Le §5.1 du cahier des charges décrit une part importante du  │
 * │ public sur connexion lente ; une page de contact qui attend un paquet    │
 * │ client pour laisser cocher « Un livre » dessert exactement celui qui     │
 * │ essaie de joindre l'éditeur parce que le reste ne marche pas.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Les tracés des trois pictogrammes, repris du prototype à l'identique.
 *
 * Ils sont DÉCORATIFS — voir `.picto` dans la feuille : l'étiquette est écrite
 * à côté, en toutes lettres. D'où `aria-hidden` sur chaque `<svg>` : annoncés,
 * ils feraient dire « image » avant « Adresse », deux fois pour rien.
 */
const TRACES = {
  adresse: [
    'M12 21s-6.5-5.5-6.5-10a6.5 6.5 0 0 1 13 0c0 4.5-6.5 10-6.5 10Z',
    'M12 12.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4',
  ],
  telephone: ['M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6L16 13.5 20 15v3a2 2 0 0 1-2.2 2A15 15 0 0 1 4 6.2A2 2 0 0 1 6 4Z'],
  email: ['M4 6.5h16v11H4z', 'm4.5 7 7.5 6 7.5-6'],
} as const;

function Picto({ traces }: { traces: readonly string[] }): ReactNode {
  return (
    <span className={styles.picto}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {traces.map((trace) => (
          <path key={trace} d={trace} />
        ))}
      </svg>
    </span>
  );
}

/** Une carte de coordonnée : pictogramme, étiquette, valeur. */
function Coordonnee({
  traces,
  etiquette,
  valeur,
  lien,
}: {
  traces: readonly string[];
  etiquette: string;
  valeur: string;
  /** Absent pour l'adresse : une adresse postale ne s'ouvre nulle part. */
  lien?: string;
}): ReactNode {
  return (
    <li className={styles.coordonnee}>
      <Picto traces={traces} />
      <span>
        <span className={styles.coordonneeCle}>{etiquette}</span>
        <span className={styles.coordonneeValeur}>
          {lien ? <a href={lien}>{valeur}</a> : valeur}
        </span>
      </span>
    </li>
  );
}

/**
 * Les quatre sujets, dans l'ordre du prototype.
 *
 * La VALEUR envoyée est la clé, jamais le libellé traduit : un message reçu
 * doit se trier de la même façon qu'il vienne du site français ou anglais.
 */
const SUJETS: readonly { valeur: string; cle: CleTraduction }[] = [
  { valeur: 'livre', cle: 'v2.contactSujetLivre' },
  { valeur: 'livret', cle: 'v2.contactSujetLivret' },
  { valeur: 'consulting', cle: 'v2.contactSujetConsulting' },
  { valeur: 'association', cle: 'v2.contactSujetAssociation' },
];

export function ContactV3({ langue }: { langue: LangueInterface }): ReactNode {
  const email = IDENTITE_EDITEUR.emailContact;

  return (
    <>
      {/* ── Le bandeau de tête ────────────────────────────────────────── */}
      <section className={styles.tete}>
        <div className={styles.teteInterieur}>
          <span className={styles.oeil}>{traduire(langue, 'v2.contactOeil')}</span>
          <h1 className={styles.titre}>{traduire(langue, 'v2.contactTitre')}</h1>
          <p className={styles.chapeau}>{traduire(langue, 'v2.contactTexte')}</p>
        </div>
      </section>

      <section className={styles.corps}>
        {/* ── Colonne gauche : les coordonnées ────────────────────────── */}
        <div>
          <h2 className={styles.colonneTitre}>{traduire(langue, 'v2.contactCoordonnees')}</h2>

          {/*
            Chaque carte ne paraît QUE si sa valeur existe. Une étiquette
            « Téléphone » suivie du vide annonce une information manquante au
            lieu de la taire.
          */}
          <ul className={styles.coordonnees}>
            {IDENTITE_EDITEUR.adresse ? (
              <Coordonnee
                traces={TRACES.adresse}
                etiquette={traduire(langue, 'v2.contactAdresse')}
                valeur={IDENTITE_EDITEUR.adresse}
              />
            ) : null}

            {IDENTITE_EDITEUR.telephone ? (
              <Coordonnee
                traces={TRACES.telephone}
                etiquette={traduire(langue, 'v2.contactTelephone')}
                valeur={IDENTITE_EDITEUR.telephone}
                /*
                 * `tel:` sans espaces : un numéro composé au doigt sur un
                 * téléphone doit être composable, et les espaces le cassent
                 * sur certains combinés.
                 */
                lien={`tel:${IDENTITE_EDITEUR.telephone.replace(/\s/g, '')}`}
              />
            ) : null}

            {email ? (
              <Coordonnee
                traces={TRACES.email}
                etiquette={traduire(langue, 'v2.contactCourriel')}
                valeur={email}
                lien={`mailto:${email}`}
              />
            ) : null}
          </ul>

          {/*
            Les deux phrases forment UN paragraphe, comme dans le prototype.
            Elles vivent dans deux clés parce qu'elles se réemploient
            séparément ailleurs ; c'est la mise en page qui les rassemble.
          */}
          <p className={styles.note}>
            {traduire(langue, 'v2.contactReponse')} {traduire(langue, 'v2.contactSansCompte')}
          </p>
        </div>

        {/* ── Colonne droite : le formulaire ──────────────────────────── */}
        <div className={styles.panneau}>
          <h2 className={styles.panneauTitre}>{traduire(langue, 'v2.contactFormTitre')}</h2>
          <p className={styles.panneauNote}>{traduire(langue, 'v2.contactFormNote')}</p>

          <form
            className={styles.champs}
            // `mailto:` avec `method="get"` : le navigateur compose le
            // message dans le logiciel de courrier du visiteur.
            action={email ? `mailto:${email}` : undefined}
            method="get"
            encType="text/plain"
          >
            <label className={styles.champ} htmlFor="contact-nom">
              <span className={styles.libelle}>{traduire(langue, 'v2.contactNom')}</span>
              <input
                className={styles.saisie}
                id="contact-nom"
                name="nom"
                autoComplete="name"
                placeholder={traduire(langue, 'v2.contactNomIndice')}
                required
              />
            </label>

            <label className={styles.champ} htmlFor="contact-email">
              <span className={styles.libelle}>{traduire(langue, 'v2.contactEmail')}</span>
              <input
                className={styles.saisie}
                id="contact-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={traduire(langue, 'v2.contactEmailIndice')}
                required
              />
            </label>

            <fieldset className={styles.groupe}>
              <legend className={`${styles.libelle} ${styles.libelleGroupe}`}>
                {traduire(langue, 'v2.contactSujet')}
              </legend>
              <div className={styles.sujets}>
                {SUJETS.map((sujet, rang) => (
                  <label className={styles.sujet} key={sujet.valeur}>
                    <input
                      className={styles.sujetSaisie}
                      type="radio"
                      name="sujet"
                      value={sujet.valeur}
                      /* Le prototype allume la première pastille par défaut. */
                      defaultChecked={rang === 0}
                    />
                    <span className={styles.sujetPastille}>{traduire(langue, sujet.cle)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.champ} htmlFor="contact-message">
              <span className={styles.libelle}>{traduire(langue, 'v2.contactMessage')}</span>
              <textarea
                className={`${styles.saisie} ${styles.zone}`}
                id="contact-message"
                name="message"
                rows={5}
                placeholder={traduire(langue, 'v2.contactMessageIndice')}
                required
              />
            </label>

            <button type="submit" className={styles.envoyer}>
              {traduire(langue, 'v2.contactEnvoyer')}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 12h13m-5-6 6 6-6 6" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
