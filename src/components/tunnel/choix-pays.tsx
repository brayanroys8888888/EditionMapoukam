import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { paysZoneAfrique, zonePourPays } from '@/domain/orders/zones';

/**
 * Choix du pays du moyen de paiement, au récapitulatif.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FORMULAIRE `GET`, ET AUCUN PRIX CALCULÉ ICI.                         │
 * │                                                                          │
 * │ Changer de pays recharge le récapitulatif avec `?pays=` : c'est `apercu` │
 * │ qui rend le nouveau total, comme pour un code promo. Le composant ne     │
 * │ connaît aucun montant — il ne pourrait qu'en inventer un.                │
 * │                                                                          │
 * │ La liste ne porte que les pays de la grille Afrique, plus « Autre pays » │
 * │ : ce sont les seuls choix qui changent quelque chose. Tout autre pays    │
 * │ mène à la grille internationale, sans verrou.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les noms de pays viennent d'`Intl.DisplayNames`, dans la langue de
 * l'interface : vingt-cinq noms recopiés dans deux fichiers de traduction
 * finiraient par diverger de la liste de `zones.ts`.
 */
export function ChoixPays({
  langue,
  action,
  pays,
  codePromo,
  classeSaisie,
  classeBouton,
  classeAide,
}: {
  langue: LangueInterface;
  /** L'écran qui se recharge avec le nouveau pays. */
  action: string;
  /** Pays retenu — celui de la requête, ou à défaut celui de l'adresse IP. */
  pays: string | null;
  codePromo: string | null;
  // Les modules CSS typent leurs classes `string | undefined`.
  classeSaisie: string | undefined;
  classeBouton: string | undefined;
  classeAide: string | undefined;
}): ReactNode {
  const noms = new Intl.DisplayNames([langue], { type: 'region' });
  const options = paysZoneAfrique()
    .map((code) => ({ code, nom: noms.of(code) ?? code }))
    .sort((a, b) => a.nom.localeCompare(b.nom, langue));

  // Un pays hors de la grille Afrique s'affiche « Autre pays » : c'est ce
  // qu'il est, tarifairement.
  const retenu = pays && zonePourPays(pays) === 'afrique' ? pays : '';

  return (
    <form method="get" action={action}>
      {codePromo ? <input type="hidden" name="promo" value={codePromo} /> : null}

      <select
        className={classeSaisie}
        id="pays-paiement"
        name="pays"
        defaultValue={retenu}
        aria-label={traduire(langue, 'recapitulatif.paysTitre')}
        aria-describedby="pays-paiement-aide"
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.nom}
          </option>
        ))}
        <option value="">{traduire(langue, 'recapitulatif.paysAutre')}</option>
      </select>

      <p id="pays-paiement-aide" className={classeAide}>
        {traduire(langue, 'recapitulatif.paysAide')}
      </p>

      <button type="submit" className={classeBouton}>
        {traduire(langue, 'recapitulatif.paysAppliquer')}
      </button>
    </form>
  );
}
