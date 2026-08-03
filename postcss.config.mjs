/**
 * PostCSS — uniquement pour Tailwind v4, qui sert les composants shadcn/ui.
 *
 * Les CSS Modules des écrans déjà livrés ne passent pas par ici : Next les
 * traite lui-même. Ajouter un greffon supplémentaire les affecterait tous,
 * pour un besoin qui ne concerne que les nouveaux écrans.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
