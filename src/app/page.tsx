/**
 * Page racine volontairement vide de toute interface : le périmètre est
 * backend. Elle existe pour que `next build` dispose d'une route.
 */
export default function Home() {
  return (
    <main>
      <h1>API des contes africains</h1>
      <p>Ce service n’expose pas d’interface publique.</p>
    </main>
  );
}
