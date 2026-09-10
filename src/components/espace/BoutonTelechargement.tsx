'use client';

import { useState, useRef } from 'react';
import { RotorInline } from '@/components/etats';
import { traduire, type LangueInterface } from '@/i18n';
import espace from '@/components/espace/espace.module.css';

interface Proprietes {
  langue?: LangueInterface;
  livreId?: string;
  libelle: string;
  className?: string;
  formats?: readonly string[];
  actionServer?: (donnees: FormData) => Promise<void>;
}

/**
 * Bouton de téléchargement avec modal de choix de format et arrêt automatique du loader.
 */
export function BoutonTelechargement({
  langue = 'fr',
  libelle,
  className,
  formats = ['pdf', 'epub'],
  actionServer,
}: Proprietes) {
  const [chargement, setChargement] = useState(false);
  const [modalOuverte, setModalOuverte] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputFormatRef = useRef<HTMLInputElement | null>(null);

  const lancerTelechargement = (formatChoisi: string) => {
    setChargement(true);
    setModalOuverte(false);

    if (inputFormatRef.current) {
      inputFormatRef.current.value = formatChoisi;
    }

    if (formRef.current) {
      formRef.current.requestSubmit();
    }

    // Le téléchargement de fichier ne recharge pas la page : on arrête le spinner après 2.5 secondes
    setTimeout(() => {
      setChargement(false);
    }, 2500);
  };

  const surClicBouton = () => {
    if (formats.length > 1) {
      setModalOuverte(true);
    } else {
      lancerTelechargement(formats[0] ?? 'pdf');
    }
  };

  return (
    <>
      <form ref={formRef} action={actionServer} style={{ display: 'inline' }}>
        <input type="hidden" name="format" ref={inputFormatRef} defaultValue="pdf" />

        <button
          type="button"
          onClick={surClicBouton}
          className={className || espace.achatTelecharger}
          disabled={chargement}
          aria-busy={chargement ? 'true' : undefined}
        >
          {chargement ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <RotorInline />
              <span>{libelle}</span>
            </span>
          ) : (
            libelle
          )}
        </button>
      </form>

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
              {formats.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => lancerTelechargement(fmt)}
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
    </>
  );
}
