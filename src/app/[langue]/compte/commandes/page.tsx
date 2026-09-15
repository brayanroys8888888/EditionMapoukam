import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire } from '@/i18n';
import type { ReponseBibliotheque } from '@/domain/api/contract';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { GabaritEspace } from '@/components/espace';
import { GabaritEspaceV3, stylesEspaceV3 as e3 } from '@/components/v2/espace-v3';
import { estV3 } from '@/design/version';
import ecran from '@/components/ecran/ecran.module.css';

interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'compte.commandes') };
}


export default async function PageCommandes({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  const nomComplet = appelant.nom_complet || appelant.email.split('@')[0] || 'Utilisateur';
  const initiales = nomComplet.split(' ').filter(Boolean).map((p) => p[0]?.toUpperCase()).slice(0, 2).join('') || 'EM';
  const dateMembre = appelant.cree_le ? new Date(appelant.cree_le).toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }) : 'mars 2026';
  const langueLecture = (appelant.langue_preferee || langue).toUpperCase();

  const { lireBibliotheque } = await import('@/lib/account/bibliotheque');
  let bibliotheque: ReponseBibliotheque;
  try {
    bibliotheque = await lireBibliotheque(appelant.id, langue);
  } catch {
    bibliotheque = { achats: [], en_cours: [] };
  }
  const nbTitres = bibliotheque.achats.length;
  const nbLivretsGratuits = bibliotheque.achats.filter((a) => a.source === 'offert' || a.slug.includes('livret') || a.slug.includes('gratuit')).length;

  // Les commandes sont lues par `src/lib`, avec le filtre `user_id` DANS la
  // requête : la clé de service n'a rien à faire dans une page.
  const { listerCommandesDe } = await import('@/lib/orders/lecture');
  const { lireDevise, formateur } = await import('@/lib/money/affichage');
  const historique = await listerCommandesDe(appelant.id, langue);

  const formatters = new Map<string, (montant: number) => string>();
  async function formatPrix(montant: number, deviseCode: string): Promise<string> {
    let formater = formatters.get(deviseCode);
    if (!formater) {
      formater = formateur(await lireDevise(deviseCode));
      formatters.set(deviseCode, formater);
    }
    return formater(montant);
  }

  const commandes = await Promise.all(historique.map(async (o) => {
    const montant = await formatPrix(o.montant_total, o.devise);
    const date = new Date(o.cree_le).toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    const titles = o.titres.map((titre) => titre ?? 'Titre inconnu').join(' · ');

    let statutLabel = o.statut;
    if (o.statut === 'paye') statutLabel = langue === 'fr' ? 'Payée' : 'Paid';
    else if (o.statut === 'en_attente') statutLabel = langue === 'fr' ? 'En attente' : 'Pending';
    else if (o.statut === 'echec') statutLabel = langue === 'fr' ? 'Échec' : 'Failed';
    else if (o.statut === 'rembourse') statutLabel = langue === 'fr' ? 'Remboursée' : 'Refunded';

    // Short ID : year - short uuid
    const year = new Date(o.cree_le).getFullYear();
    const shortId = '#' + year + '-' + o.id.slice(0, 4);

    return {
      id: shortId,
      titre: titles || (langue === 'fr' ? 'Aucun titre' : 'No titles'),
      meta: `${date} · ${o.prestataire || 'Stripe'}`,
      statut: statutLabel,
      montant: montant
    };
  }));

  if (estV3()) {
    return (
      <GabaritEspaceV3
        langue={langue}
        onglet="compte/commandes"
        email={appelant.email}
        titre={traduire(langue, 'compte.commandes')}
        nomComplet={nomComplet}
        initiales={initiales}
        dateMembre={dateMembre}
        langueLecture={langueLecture}
        nbTitres={nbTitres}
        nbLivretsGratuits={nbLivretsGratuits}
      >
        <section>
          <h2 className={e3.sousTitre}>{traduire(langue, 'compte.commandes')}</h2>

          <ul className={e3.listeCommandes}>
            {commandes.map((cmd) => (
              <li key={cmd.id} className={e3.carteCommande}>
                <span className={e3.commandeIdentifiant}>{cmd.id}</span>
                <div className={e3.commandeDetail}>
                  <span className={e3.commandeTitre}>{cmd.titre}</span>
                  <span className={e3.commandeMeta}>{cmd.meta}</span>
                </div>
                <div className={e3.commandeDroits}>
                  <span className={e3.badgePayee}>{cmd.statut}</span>
                  <span className={e3.commandeMontant}>{cmd.montant}</span>
                </div>
              </li>
            ))}
            {commandes.length === 0 && (
              <li style={{ padding: '24px 0', color: 'var(--texte-secondaire)', textAlign: 'center' }}>
                {langue === 'fr' ? "Aucune commande trouvée." : "No orders found."}
              </li>
            )}
          </ul>
        </section>
      </GabaritEspaceV3>
    );
  }

  return (
    <GabaritEspace langue={langue} onglet="compte/commandes" email={appelant.email}>
      <h1 className={ecran.titre}>{traduire(langue, 'compte.commandes')}</h1>
      <section className={`${ecran.panneau} ${ecran.section}`}>
        <ul className={e3.listeCommandes}>
          {commandes.map((cmd) => (
            <li key={cmd.id} className={e3.carteCommande}>
              <span className={e3.commandeIdentifiant}>{cmd.id}</span>
              <div className={e3.commandeDetail}>
                <span className={e3.commandeTitre}>{cmd.titre}</span>
                <span className={e3.commandeMeta}>{cmd.meta}</span>
              </div>
              <div className={e3.commandeDroits}>
                <span className={e3.badgePayee}>{cmd.statut}</span>
                <span className={e3.commandeMontant}>{cmd.montant}</span>
              </div>
            </li>
          ))}
          {commandes.length === 0 && (
            <li style={{ padding: '24px 0', color: 'var(--texte-secondaire)', textAlign: 'center' }}>
              {langue === 'fr' ? "Aucune commande trouvée." : "No orders found."}
            </li>
          )}
        </ul>
      </section>
    </GabaritEspace>
  );
}
