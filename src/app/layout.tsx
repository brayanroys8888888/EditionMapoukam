import type { ReactNode } from 'react';

/**
 * Racine minimale exigée par l'App Router.
 *
 * Ce projet est backend : il n'y a pas d'interface publique. Seule la console
 * de simulation `/dev` comportera des pages, et elle restera rudimentaire.
 */
export const metadata = {
  title: 'Contes africains — API',
  description: 'Backend de la plateforme de contes africains illustrés.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
