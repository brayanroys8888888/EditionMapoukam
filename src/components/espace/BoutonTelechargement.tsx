'use client';

import { useState } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import espace from '@/components/espace/espace.module.css';

/**
 * Classes de la liste déroulante de langue.
 *
 * Elles viennent de l'écran appelant, parce que les deux habillages de la
 * bibliothèque n'emploient pas le même module : sans cela, le choix de langue
 * perdrait son style dans l'un des deux.
 */
interface ClassesChoix {
  conteneur?: string;
  libelle?: string;
  liste?: string;
}

interface Proprietes {
  langue?: LangueInterface;
  libelle: string;
  className?: string;
  formats?: readonly string[];
  /** Langues disponibles pour CE titre. Une seule : aucun choix n'est proposé. */
  langues?: readonly string[];
  /** Route de navigation qui mène au fichier, sans paramètres. */
  cheminBase: string;
  classesChoix?: ClassesChoix;
}

/**
 * Bouton de téléchargement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FORMULAIRE GET, ET NON UNE ACTION SERVEUR.                           │
 * │                                                                          │
 * │ Ce bouton soumettait une action serveur qui se terminait par un          │
 * │ `redirect()` vers l'URL signée. Une action serveur est exécutée par le   │
 * │ ROUTEUR : la redirection devenait une navigation, et comme le stockage   │
 * │ répond `Content-Disposition: attachment`, le navigateur la convertissait │
 * │ en téléchargement. Le document ne se déchargeait donc JAMAIS, la         │
 * │ navigation attendue n'aboutissait pas, et la file d'actions du routeur   │
 * │ restait bloquée : passé deux téléchargements, plus rien ne partait de la │
 * │ page — d'aucune carte — jusqu'à un rechargement complet.                │
 * │                                                                          │
 * │ Une soumission GET native n'implique pas le routeur. Le navigateur       │
 * │ télécharge, la page reste intacte, et l'on recommence autant de fois     │
 * │ qu'on veut. Elle fonctionne de surcroît sans JavaScript, ce que §5.1     │
 * │ rend souhaitable pour ce public.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CHOIX DE LA LANGUE VIT ICI, ET C'EST POURQUOI IL FONCTIONNE.         │
 * │                                                                          │
 * │ L'écran rendait la liste déroulante À CÔTÉ de ce composant, donc HORS du │
 * │ formulaire qu'il contient. Un champ hors formulaire n'est pas soumis :   │
 * │ `langue_contenu` n'arrivait jamais, le serveur repliait sur le français, │
 * │ et un titre bilingue ne pouvait être téléchargé qu'en français — sans    │
 * │ qu'aucun message ne le dise.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Aucun indicateur de chargement : la préparation se voit dans l'indicateur de
 * téléchargement du navigateur, qui dit la vérité. Celui qui vivait ici
 * s'éteignait au bout de 2,5 secondes sur une génération qui peut demander
 * jusqu'à une minute (`docs/API-CONTRAT.md` M12).
 */
export function BoutonTelechargement({
  langue = 'fr',
  libelle,
  className,
  formats = ['pdf', 'epub'],
  langues = ['fr'],
  cheminBase,
  classesChoix,
}: Proprietes) {
  const [modalOuverte, setModalOuverte] = useState(false);

  const premierFormat = formats[0] ?? 'pdf';
  const plusieursFormats = formats.length > 1;
  // Identifiant stable pour lier l'intitulé à sa liste, tiré du dernier
  // segment du chemin — l'identifiant du titre.
  const cle = cheminBase.split('/').filter(Boolean).at(-1) ?? 'titre';

  return (
    // `display: contents` : les enfants restent dans la grille de la carte,
    // exactement comme avant que le formulaire ne les enveloppe. Sans cela, le
    // formulaire introduirait un bloc et casserait l'alignement des actions.
    <form method="get" action={cheminBase} style={{ display: 'contents' }}>
      {langues.length > 1 ? (
        <span className={classesChoix?.conteneur ?? espace.achatChoix}>
          <label
            className={classesChoix?.libelle ?? espace.achatChoixLibelle}
            htmlFor={`langue-${cle}`}
          >
            {traduire(langue, 'compte.choixLangue')}
          </label>
          <select
            className={classesChoix?.liste ?? espace.achatChoixListe}
            id={`langue-${cle}`}
            name="langue_contenu"
            defaultValue={langues[0]}
          >
            {langues.map((codeLangue) => (
              <option key={codeLangue} value={codeLangue}>
                {traduire(langue, `langue.${codeLangue}` as CleTraduction)}
              </option>
            ))}
          </select>
        </span>
      ) : (
        <input type="hidden" name="langue_contenu" value={langues[0] ?? 'fr'} />
      )}

      {/*
        Un seul format : le bouton soumet directement, et porte le format
        lui-même. Un menu à une seule entrée imposerait une décision sans en
        offrir aucune.
      */}
      {plusieursFormats ? (
        <button
          type="button"
          onClick={() => setModalOuverte(true)}
          className={className || espace.achatTelecharger}
        >
          {libelle}
        </button>
      ) : (
        <button
          type="submit"
          name="format"
          value={premierFormat}
          className={className || espace.achatTelecharger}
        >
          {libelle}
        </button>
      )}

      {modalOuverte ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgb(24 20 12 / 45%)',
            backdropFilter: 'blur(4px)',
            padding: '20px',
          }}
          onClick={() => setModalOuverte(false)}
        >
          <div
            style={{
              background: 'var(--fond)',
              borderRadius: '24px',
              padding: '24px 28px',
              maxWidth: '360px',
              width: '100%',
              boxShadow: 'var(--ombre-carte)',
              color: 'var(--encre)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>
              {traduire(langue, 'compte.choixFormat')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/*
                Chacun SOUMET le formulaire en portant son format : c'est le
                navigateur qui navigue, et le choix de langue voyage avec.
              */}
              {formats.map((fmt) => (
                <button
                  key={fmt}
                  type="submit"
                  name="format"
                  value={fmt}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '14px',
                    border: '1.5px solid var(--bordure)',
                    background: 'var(--surface)',
                    color: 'var(--encre)',
                    fontWeight: 600,
                    fontSize: '15px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setModalOuverte(false)}
              style={{
                marginTop: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--encre-douce)',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {traduire(langue, 'v2.tiroirFermer')}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
