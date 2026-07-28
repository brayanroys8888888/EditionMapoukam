import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ce chantier est backend : les erreurs de type sont traitées par
  // `npm run verify`, jamais contournées au build. (Next 16 a retiré
  // l'intégration ESLint du build ; `npm run lint` s'en charge.)
  typescript: { ignoreBuildErrors: false },
  // poppler et sharp sont invoqués côté serveur uniquement ; ils ne doivent
  // jamais être embarqués dans un bundle client.
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
