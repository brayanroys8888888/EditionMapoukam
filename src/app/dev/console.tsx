'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Interface de la console de simulation.
 *
 * Volontairement sans dépendance ni feuille de style : ce n'est pas une
 * interface produit, c'est un pupitre de commande. Chaque bouton émet un vrai
 * événement signé vers le vrai gestionnaire de webhooks, et affiche sa réponse
 * telle quelle — y compris ses erreurs, qui sont l'essentiel de ce qu'on vient
 * y observer.
 */
interface Commande {
  id: string;
  user_id: string;
  montant_total: number;
  devise: string;
  statut: string;
}

interface Abonnement {
  id: string;
  user_id: string;
  offre: string;
  statut: string;
  fin_periode: string;
}

interface EvenementWebhook {
  event_id: string;
  type: string;
  signature_valide: boolean;
  recu_le: string;
  traite_le: string | null;
}

interface Etat {
  maintenant: string;
  commandes: Commande[];
  abonnements: Abonnement[];
  webhooks: EvenementWebhook[];
}

interface Email {
  fichier: string;
  destinataire: string;
  sujet: string;
  modele: string;
}

const STYLE_BLOC: CSSProperties = {
  border: '1px solid #ccc',
  padding: '1rem',
  marginBottom: '1rem',
};

export function ConsoleSimulation() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [journal, setJournal] = useState<string[]>([]);
  const [occupe, setOccupe] = useState(false);

  const tracer = useCallback((ligne: string) => {
    setJournal((precedent) =>
      [`${new Date().toLocaleTimeString()} — ${ligne}`, ...precedent].slice(0, 40),
    );
  }, []);

  const rafraichir = useCallback(async () => {
    const [reponseEtat, reponseEmails] = await Promise.all([
      fetch('/api/dev/state'),
      fetch('/api/dev/emails'),
    ]);
    if (reponseEtat.ok) setEtat((await reponseEtat.json()) as Etat);
    if (reponseEmails.ok) {
      const corps = (await reponseEmails.json()) as { emails: Email[] };
      setEmails(corps.emails);
    }
  }, []);

  useEffect(() => {
    void rafraichir();
  }, [rafraichir]);

  const appeler = useCallback(
    async (url: string, init: RequestInit, libelle: string) => {
      setOccupe(true);
      try {
        const reponse = await fetch(url, init);
        const texte = await reponse.text();
        tracer(`${libelle} → ${String(reponse.status)} ${texte.slice(0, 300)}`);
        await rafraichir();
      } catch (erreur) {
        tracer(`${libelle} → échec : ${erreur instanceof Error ? erreur.message : 'inconnu'}`);
      } finally {
        setOccupe(false);
      }
    },
    [rafraichir, tracer],
  );

  const emettre = useCallback(
    (type: string, donnees: Record<string, unknown>) =>
      appeler(
        '/api/dev/events',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, donnees }),
        },
        type,
      ),
    [appeler],
  );

  return (
    <main style={{ fontFamily: 'monospace', padding: '1.5rem', maxWidth: '70rem' }}>
      <h1>Console de simulation</h1>
      <p>
        Chaque action émet un <strong>vrai événement signé</strong> vers le vrai gestionnaire de
        webhooks. Aucune n’écrit en base, à l’exception de la remise à zéro.
      </p>

      <section style={STYLE_BLOC}>
        <h2>Horloge</h2>
        <p>Instant vu par le métier : {etat?.maintenant ?? '…'}</p>
        {[1, 7, 30, 90, 365].map((jours) => (
          <button
            key={jours}
            type="button"
            disabled={occupe}
            onClick={() =>
              void appeler(
                '/api/dev/clock',
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ jours }),
                },
                `avance de ${String(jours)} j`,
              )
            }
          >
            +{jours} j
          </button>
        ))}
        <button
          type="button"
          disabled={occupe}
          onClick={() =>
            void appeler('/api/dev/clock', { method: 'DELETE' }, 'horloge réinitialisée')
          }
        >
          heure réelle
        </button>
      </section>

      <section style={STYLE_BLOC}>
        <h2>Commandes</h2>
        {etat?.commandes.length === 0 && <p>Aucune commande.</p>}
        <ul>
          {etat?.commandes.map((commande) => (
            <li key={commande.id}>
              {commande.id.slice(0, 8)} — {String(commande.montant_total)} {commande.devise} —{' '}
              <strong>{commande.statut}</strong>{' '}
              <button
                type="button"
                disabled={occupe}
                onClick={() => void emettre('paiement.reussi', { orderId: commande.id })}
              >
                payer
              </button>
              <button
                type="button"
                disabled={occupe}
                onClick={() => void emettre('paiement.echoue', { orderId: commande.id })}
              >
                échouer
              </button>
              <button
                type="button"
                disabled={occupe}
                onClick={() => void emettre('paiement.abandonne', { orderId: commande.id })}
              >
                abandonner
              </button>
              <button
                type="button"
                disabled={occupe}
                onClick={() => void emettre('remboursement.effectue', { orderId: commande.id })}
              >
                rembourser
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={STYLE_BLOC}>
        <h2>Abonnements</h2>
        {etat?.abonnements.length === 0 && <p>Aucun abonnement.</p>}
        <ul>
          {etat?.abonnements.map((abonnement) => (
            <li key={abonnement.id}>
              {abonnement.id.slice(0, 8)} — {abonnement.offre} —{' '}
              <strong>{abonnement.statut}</strong> — fin {abonnement.fin_periode}{' '}
              {(
                [
                  ['abonnement.renouvele', 'renouveler'],
                  ['abonnement.prelevement_echoue', 'échec de prélèvement'],
                  ['abonnement.annule', 'annuler'],
                  ['abonnement.expire', 'expirer'],
                ] as const
              ).map(([type, libelle]) => (
                <button
                  key={type}
                  type="button"
                  disabled={occupe}
                  onClick={() => void emettre(type, { subscriptionId: abonnement.id })}
                >
                  {libelle}
                </button>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section style={STYLE_BLOC}>
        <h2>Webhooks reçus</h2>
        <ul>
          {etat?.webhooks.map((evenement) => (
            <li key={evenement.event_id}>
              {evenement.recu_le} — {evenement.type} — signature{' '}
              {evenement.signature_valide ? 'valide' : 'INVALIDE'} —{' '}
              {evenement.traite_le ? 'traité' : 'non traité'}
            </li>
          ))}
        </ul>
      </section>

      <section style={STYLE_BLOC}>
        <h2>Emails écrits dans .mails/</h2>
        {emails.length === 0 && <p>Aucun email.</p>}
        <ul>
          {emails.map((email) => (
            <li key={email.fichier}>
              {email.destinataire} — {email.sujet} <em>({email.modele})</em>
            </li>
          ))}
        </ul>
      </section>

      <section style={STYLE_BLOC}>
        <h2>Remise à zéro</h2>
        <p>
          Efface les données transactionnelles, les emails et le décalage d’horloge. Le catalogue
          n’est pas touché.
        </p>
        <button
          type="button"
          disabled={occupe}
          onClick={() => void appeler('/api/dev/reset', { method: 'POST' }, 'remise à zéro')}
        >
          réinitialiser
        </button>
      </section>

      <section style={STYLE_BLOC}>
        <h2>Journal</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{journal.join('\n')}</pre>
      </section>
    </main>
  );
}
