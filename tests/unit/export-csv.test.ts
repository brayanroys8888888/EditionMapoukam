import { describe, expect, it } from 'vitest';

import { cellule } from '@/app/api/admin/orders/export/route';

/**
 * L'ÉCHAPPEMENT CSV DE L'EXPORT DES COMMANDES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE VIRGULE MAL ÉCHAPPÉE NE CASSE RIEN — ELLE DÉCALE.                   │
 * │                                                                          │
 * │ Le fichier s'ouvre, le tableur ne proteste pas, et une ligne sur vingt   │
 * │ porte le montant dans la colonne du statut. C'est un défaut qu'on ne     │
 * │ découvre qu'en relisant un export — et personne ne relit un export.      │
 * │                                                                          │
 * │ Le catalogue porte justement des titres à virgule et à apostrophe :      │
 * │ « La poule qui pondait des œufs d'or ». La règle n'est donc pas          │
 * │ théorique.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('une cellule CSV', () => {
  it('laisse nue une valeur sans caractère spécial', () => {
    expect(cellule('anansi-l-araignee-maligne')).toBe('anansi-l-araignee-maligne');
    expect(cellule(1500)).toBe('1500');
  });

  it('rend une chaîne VIDE pour une valeur absente', () => {
    // Un acheteur anonymisé n'a ni nom ni adresse : la cellule est vide, et
    // surtout pas « null », qui se lirait comme un nom dans un tableur.
    expect(cellule(null)).toBe('');
    expect(cellule(undefined)).toBe('');
  });

  it('entoure une valeur qui porte une virgule', () => {
    expect(cellule('Fotso, Nadège')).toBe('"Fotso, Nadège"');
  });

  it('double les guillemets et entoure — la seule échappe de RFC 4180', () => {
    expect(cellule('le conte dit « d"or »')).toBe('"le conte dit « d""or »"');
  });

  it('entoure une valeur qui porte un saut de ligne', () => {
    // Sans les guillemets, le saut créerait une LIGNE de plus dans le fichier,
    // et toutes les suivantes seraient décalées d'un cran.
    expect(cellule('deux\nlignes')).toBe('"deux\nlignes"');
    expect(cellule('retour\r\nchariot')).toBe('"retour\r\nchariot"');
  });

  it('n’entoure pas pour une apostrophe seule', () => {
    // L'apostrophe n'est pas un caractère spécial du CSV : entourer pour elle
    // alourdirait la moitié des cellules d'un catalogue francophone.
    expect(cellule("La poule qui pondait des œufs d'or")).toBe(
      "La poule qui pondait des œufs d'or",
    );
  });
});
