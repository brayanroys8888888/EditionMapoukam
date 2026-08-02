export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      active_price_zones: {
        Row: {
          active: boolean
          maj_le: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Insert: {
          active?: boolean
          maj_le?: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Update: {
          active?: boolean
          maj_le?: string
          zone?: Database["public"]["Enums"]["price_zone"]
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          acteur_id: string | null
          action: string
          ancienne_valeur: Json | null
          cible_id: string | null
          cible_type: string
          cree_le: string
          id: string
          motif: string | null
          nouvelle_valeur: Json | null
        }
        Insert: {
          acteur_id?: string | null
          action: string
          ancienne_valeur?: Json | null
          cible_id?: string | null
          cible_type: string
          cree_le?: string
          id?: string
          motif?: string | null
          nouvelle_valeur?: Json | null
        }
        Update: {
          acteur_id?: string | null
          action?: string
          ancienne_valeur?: Json | null
          cible_id?: string | null
          cible_type?: string
          cree_le?: string
          id?: string
          motif?: string | null
          nouvelle_valeur?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_acteur_id_fkey"
            columns: ["acteur_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      book_pages: {
        Row: {
          chemin_allegee: string
          chemin_haute: string
          cree_le: string
          hauteur: number | null
          id: string
          largeur: number | null
          numero: number
          texte: string | null
          translation_id: string
        }
        Insert: {
          chemin_allegee: string
          chemin_haute: string
          cree_le?: string
          hauteur?: number | null
          id?: string
          largeur?: number | null
          numero: number
          texte?: string | null
          translation_id: string
        }
        Update: {
          chemin_allegee?: string
          chemin_haute?: string
          cree_le?: string
          hauteur?: number | null
          id?: string
          largeur?: number | null
          numero?: number
          texte?: string | null
          translation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_pages_translation_id_fkey"
            columns: ["translation_id"]
            isOneToOne: false
            referencedRelation: "book_translations"
            referencedColumns: ["id"]
          },
        ]
      }
      book_prices: {
        Row: {
          book_id: string
          devise: string
          maj_le: string
          montant: number
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Insert: {
          book_id: string
          devise: string
          maj_le?: string
          montant: number
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Update: {
          book_id?: string
          devise?: string
          maj_le?: string
          montant?: number
          zone?: Database["public"]["Enums"]["price_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "book_prices_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_prices_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_prices_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      book_translations: {
        Row: {
          book_id: string
          cree_le: string
          fichier_lecture: string | null
          fichier_telechargement: string | null
          id: string
          langue: string
          maj_le: string
          nb_pages: number | null
          recherche: unknown
          resume: string | null
          statut: Database["public"]["Enums"]["translation_status"]
          titre: string
        }
        Insert: {
          book_id: string
          cree_le?: string
          fichier_lecture?: string | null
          fichier_telechargement?: string | null
          id?: string
          langue: string
          maj_le?: string
          nb_pages?: number | null
          recherche?: unknown
          resume?: string | null
          statut?: Database["public"]["Enums"]["translation_status"]
          titre: string
        }
        Update: {
          book_id?: string
          cree_le?: string
          fichier_lecture?: string | null
          fichier_telechargement?: string | null
          id?: string
          langue?: string
          maj_le?: string
          nb_pages?: number | null
          recherche?: unknown
          resume?: string | null
          statut?: Database["public"]["Enums"]["translation_status"]
          titre?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_translations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_translations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          age_max: number | null
          age_min: number | null
          auteur: string
          couverture_url: string | null
          cree_le: string
          disponible_achat: boolean
          gratuit: boolean
          id: string
          illustrateur: string | null
          inclus_abonnement: boolean
          maj_le: string
          nb_pages_extrait: number | null
          origine_culturelle: string | null
          publie_le: string | null
          recherche: unknown
          slug: string
          statut: Database["public"]["Enums"]["book_status"]
          themes: string[]
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          auteur: string
          couverture_url?: string | null
          cree_le?: string
          disponible_achat?: boolean
          gratuit?: boolean
          id?: string
          illustrateur?: string | null
          inclus_abonnement?: boolean
          maj_le?: string
          nb_pages_extrait?: number | null
          origine_culturelle?: string | null
          publie_le?: string | null
          recherche?: unknown
          slug: string
          statut?: Database["public"]["Enums"]["book_status"]
          themes?: string[]
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          auteur?: string
          couverture_url?: string | null
          cree_le?: string
          disponible_achat?: boolean
          gratuit?: boolean
          id?: string
          illustrateur?: string | null
          inclus_abonnement?: boolean
          maj_le?: string
          nb_pages_extrait?: number | null
          origine_culturelle?: string | null
          publie_le?: string | null
          recherche?: unknown
          slug?: string
          statut?: Database["public"]["Enums"]["book_status"]
          themes?: string[]
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          fenetre_nouveaute_jours: number
          id: number
          jours_essai: number
          maj_le: string
          maj_par: string | null
          periode_grace_jours: number
          retention_copies_mois: number
          tolerance_renouvellement_heures: number
        }
        Insert: {
          fenetre_nouveaute_jours?: number
          id?: number
          jours_essai?: number
          maj_le?: string
          maj_par?: string | null
          periode_grace_jours?: number
          retention_copies_mois?: number
          tolerance_renouvellement_heures?: number
        }
        Update: {
          fenetre_nouveaute_jours?: number
          id?: number
          jours_essai?: number
          maj_le?: string
          maj_par?: string | null
          periode_grace_jours?: number
          retention_copies_mois?: number
          tolerance_renouvellement_heures?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_maj_par_fkey"
            columns: ["maj_par"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings_audit: {
        Row: {
          apres: Json
          avant: Json
          id: string
          modifie_le: string
          modifie_par: string | null
        }
        Insert: {
          apres: Json
          avant: Json
          id?: string
          modifie_le?: string
          modifie_par?: string | null
        }
        Update: {
          apres?: Json
          avant?: Json
          id?: string
          modifie_le?: string
          modifie_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_audit_modifie_par_fkey"
            columns: ["modifie_par"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          ajoute_le: string
          book_id: string
          cart_id: string
          id: string
          langue: string
        }
        Insert: {
          ajoute_le?: string
          book_id: string
          cart_id: string
          id?: string
          langue: string
        }
        Update: {
          ajoute_le?: string
          book_id?: string
          cart_id?: string
          id?: string
          langue?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "cart_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          cree_le: string
          id: string
          maj_le: string
          user_id: string
        }
        Insert: {
          cree_le?: string
          id?: string
          maj_le?: string
          user_id: string
        }
        Update: {
          cree_le?: string
          id?: string
          maj_le?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          decimals: number
          libelle: string
          symbole: string
        }
        Insert: {
          code: string
          decimals: number
          libelle: string
          symbole: string
        }
        Update: {
          code?: string
          decimals?: number
          libelle?: string
          symbole?: string
        }
        Relationships: []
      }
      dev_clock_activation: {
        Row: {
          active_le: string
          id: number
          note: string
        }
        Insert: {
          active_le?: string
          id?: number
          note: string
        }
        Update: {
          active_le?: string
          id?: number
          note?: string
        }
        Relationships: []
      }
      download_copies: {
        Row: {
          book_id: string
          chemin: string
          copie_id: string
          cree_le: string
          dernier_acces_le: string
          format: Database["public"]["Enums"]["download_format"]
          langue: string
          octets: number
          user_id: string
        }
        Insert: {
          book_id: string
          chemin: string
          copie_id: string
          cree_le?: string
          dernier_acces_le?: string
          format: Database["public"]["Enums"]["download_format"]
          langue: string
          octets: number
          user_id: string
        }
        Update: {
          book_id?: string
          chemin?: string
          copie_id?: string
          cree_le?: string
          dernier_acces_le?: string
          format?: Database["public"]["Enums"]["download_format"]
          langue?: string
          octets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_copies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "download_copies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_copies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      download_logs: {
        Row: {
          adresse_ip: unknown
          book_id: string
          format: Database["public"]["Enums"]["download_format"]
          id: string
          langue: string
          telecharge_le: string
          user_id: string
        }
        Insert: {
          adresse_ip?: unknown
          book_id: string
          format: Database["public"]["Enums"]["download_format"]
          id?: string
          langue: string
          telecharge_le?: string
          user_id: string
        }
        Update: {
          adresse_ip?: unknown
          book_id?: string
          format?: Database["public"]["Enums"]["download_format"]
          id?: string
          langue?: string
          telecharge_le?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_logs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "download_logs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          chemin_fichier: string | null
          destinataire: string
          envoye_le: string
          erreur: string | null
          id: string
          langue: string
          modele: string
          sujet: string
          user_id: string | null
        }
        Insert: {
          chemin_fichier?: string | null
          destinataire: string
          envoye_le?: string
          erreur?: string | null
          id?: string
          langue: string
          modele: string
          sujet: string
          user_id?: string | null
        }
        Update: {
          chemin_fichier?: string | null
          destinataire?: string
          envoye_le?: string
          erreur?: string | null
          id?: string
          langue?: string
          modele?: string
          sujet?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          cle_idempotence: string
          cree_le: string
          derniere_erreur: string | null
          destinataire: string
          envoye_le: string | null
          id: string
          langue: string
          modele: string
          statut: Database["public"]["Enums"]["email_statut"]
          tentatives: number
          user_id: string | null
          variables: Json
        }
        Insert: {
          cle_idempotence: string
          cree_le?: string
          derniere_erreur?: string | null
          destinataire: string
          envoye_le?: string | null
          id?: string
          langue: string
          modele: string
          statut?: Database["public"]["Enums"]["email_statut"]
          tentatives?: number
          user_id?: string | null
          variables?: Json
        }
        Update: {
          cle_idempotence?: string
          cree_le?: string
          derniere_erreur?: string | null
          destinataire?: string
          envoye_le?: string | null
          id?: string
          langue?: string
          modele?: string
          statut?: Database["public"]["Enums"]["email_statut"]
          tentatives?: number
          user_id?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          accorde_le: string
          book_id: string
          expire_le: string | null
          id: string
          peut_telecharger: boolean
          source_id: string | null
          type: Database["public"]["Enums"]["entitlement_type"]
          user_id: string
        }
        Insert: {
          accorde_le?: string
          book_id: string
          expire_le?: string | null
          id?: string
          peut_telecharger?: boolean
          source_id?: string | null
          type: Database["public"]["Enums"]["entitlement_type"]
          user_id: string
        }
        Update: {
          accorde_le?: string
          book_id?: string
          expire_le?: string | null
          id?: string
          peut_telecharger?: boolean
          source_id?: string | null
          type?: Database["public"]["Enums"]["entitlement_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "entitlements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          ajoute_le: string
          book_id: string
          user_id: string
        }
        Insert: {
          ajoute_le?: string
          book_id: string
          user_id: string
        }
        Update: {
          ajoute_le?: string
          book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "favorites_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          book_id: string | null
          chemin_source: string
          couche_texte: boolean | null
          cree_le: string
          empreinte: string | null
          erreur: string | null
          etape: string | null
          id: string
          jeton: string | null
          maj_le: string
          nb_pages: number | null
          statut: Database["public"]["Enums"]["ingestion_status"]
          translation_id: string | null
        }
        Insert: {
          book_id?: string | null
          chemin_source: string
          couche_texte?: boolean | null
          cree_le?: string
          empreinte?: string | null
          erreur?: string | null
          etape?: string | null
          id?: string
          jeton?: string | null
          maj_le?: string
          nb_pages?: number | null
          statut?: Database["public"]["Enums"]["ingestion_status"]
          translation_id?: string | null
        }
        Update: {
          book_id?: string | null
          chemin_source?: string
          couche_texte?: boolean | null
          cree_le?: string
          empreinte?: string | null
          erreur?: string | null
          etape?: string | null
          id?: string
          jeton?: string | null
          maj_le?: string
          nb_pages?: number | null
          statut?: Database["public"]["Enums"]["ingestion_status"]
          translation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "ingestion_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_translation_id_fkey"
            columns: ["translation_id"]
            isOneToOne: false
            referencedRelation: "book_translations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          annee: number
          dernier_numero: number
        }
        Insert: {
          annee: number
          dernier_numero?: number
        }
        Update: {
          annee?: number
          dernier_numero?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          conservation_jusqu_au: string
          devise: string
          emise_le: string
          facture_adresse: Json
          facture_email: string
          facture_nom: string
          facture_pays: string | null
          id: string
          lignes: Json
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          numero: string
          order_id: string | null
          subscription_id: string | null
          taux_tva: number
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Insert: {
          conservation_jusqu_au: string
          devise: string
          emise_le?: string
          facture_adresse?: Json
          facture_email: string
          facture_nom: string
          facture_pays?: string | null
          id?: string
          lignes: Json
          montant_ht: number
          montant_ttc: number
          montant_tva?: number
          numero: string
          order_id?: string | null
          subscription_id?: string | null
          taux_tva?: number
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Update: {
          conservation_jusqu_au?: string
          devise?: string
          emise_le?: string
          facture_adresse?: Json
          facture_email?: string
          facture_nom?: string
          facture_pays?: string | null
          id?: string
          lignes?: Json
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          numero?: string
          order_id?: string | null
          subscription_id?: string | null
          taux_tva?: number
          user_id?: string
          zone?: Database["public"]["Enums"]["price_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          book_id: string
          devise: string
          id: string
          langue: string
          order_id: string
          prix_unitaire: number
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Insert: {
          book_id: string
          devise: string
          id?: string
          langue: string
          order_id: string
          prix_unitaire: number
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Update: {
          book_id?: string
          devise?: string
          id?: string
          langue?: string
          order_id?: string
          prix_unitaire?: number
          zone?: Database["public"]["Enums"]["price_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "order_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "order_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cree_le: string
          devise: string
          id: string
          maj_le: string
          montant_total: number
          paye_le: string | null
          prestataire: string
          promo_code_id: string | null
          reference_paiement: string | null
          remise: number
          statut: Database["public"]["Enums"]["order_status"]
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Insert: {
          cree_le?: string
          devise: string
          id?: string
          maj_le?: string
          montant_total: number
          paye_le?: string | null
          prestataire?: string
          promo_code_id?: string | null
          reference_paiement?: string | null
          remise?: number
          statut?: Database["public"]["Enums"]["order_status"]
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Update: {
          cree_le?: string
          devise?: string
          id?: string
          maj_le?: string
          montant_total?: number
          paye_le?: string | null
          prestataire?: string
          promo_code_id?: string | null
          reference_paiement?: string | null
          remise?: number
          statut?: Database["public"]["Enums"]["order_status"]
          user_id?: string
          zone?: Database["public"]["Enums"]["price_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "orders_promo_code_fk"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          detail: Json
          devise: string | null
          id: string
          montant: number | null
          order_id: string | null
          subscription_id: string | null
          survenu_le: string
          type: string
          user_id: string | null
          webhook_event_id: string | null
        }
        Insert: {
          detail?: Json
          devise?: string | null
          id?: string
          montant?: number | null
          order_id?: string | null
          subscription_id?: string | null
          survenu_le?: string
          type: string
          user_id?: string | null
          webhook_event_id?: string | null
        }
        Update: {
          detail?: Json
          devise?: string | null
          id?: string
          montant?: number | null
          order_id?: string | null
          subscription_id?: string | null
          survenu_le?: string
          type?: string
          user_id?: string | null
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          actif: boolean
          code: string
          cree_le: string
          devise: string | null
          expire_le: string | null
          id: string
          type: Database["public"]["Enums"]["promo_type"]
          usage_count: number
          usage_max: number | null
          valeur: number
          zone: Database["public"]["Enums"]["price_zone"] | null
        }
        Insert: {
          actif?: boolean
          code: string
          cree_le?: string
          devise?: string | null
          expire_le?: string | null
          id?: string
          type: Database["public"]["Enums"]["promo_type"]
          usage_count?: number
          usage_max?: number | null
          valeur: number
          zone?: Database["public"]["Enums"]["price_zone"] | null
        }
        Update: {
          actif?: boolean
          code?: string
          cree_le?: string
          devise?: string | null
          expire_le?: string | null
          id?: string
          type?: Database["public"]["Enums"]["promo_type"]
          usage_count?: number
          usage_max?: number | null
          valeur?: number
          zone?: Database["public"]["Enums"]["price_zone"] | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          id: string
          order_id: string
          promo_code_id: string
          user_id: string
          utilise_le: string
        }
        Insert: {
          id?: string
          order_id: string
          promo_code_id: string
          user_id: string
          utilise_le?: string
        }
        Update: {
          id?: string
          order_id?: string
          promo_code_id?: string
          user_id?: string
          utilise_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_progress: {
        Row: {
          book_id: string
          derniere_page: number
          langue: string
          maj_le: string
          user_id: string
        }
        Insert: {
          book_id: string
          derniere_page: number
          langue: string
          maj_le?: string
          user_id: string
        }
        Update: {
          book_id?: string
          derniere_page?: number
          langue?: string
          maj_le?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_popularity"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          annule_le: string | null
          cree_le: string
          debut_periode: string
          devise: string
          fin_periode: string
          id: string
          id_prestataire: string | null
          impaye_depuis: string | null
          jours_essai: number
          maj_le: string
          montant: number
          offre: string
          statut: Database["public"]["Enums"]["subscription_status"]
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Insert: {
          annule_le?: string | null
          cree_le?: string
          debut_periode?: string
          devise: string
          fin_periode: string
          id?: string
          id_prestataire?: string | null
          impaye_depuis?: string | null
          jours_essai?: number
          maj_le?: string
          montant: number
          offre: string
          statut?: Database["public"]["Enums"]["subscription_status"]
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        Update: {
          annule_le?: string | null
          cree_le?: string
          debut_periode?: string
          devise?: string
          fin_periode?: string
          id?: string
          id_prestataire?: string | null
          impaye_depuis?: string | null
          jours_essai?: number
          maj_le?: string
          montant?: number
          offre?: string
          statut?: Database["public"]["Enums"]["subscription_status"]
          user_id?: string
          zone?: Database["public"]["Enums"]["price_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_devise_fkey"
            columns: ["devise"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          anonymise_le: string | null
          cree_le: string
          email: string
          id: string
          langue_preferee: string
          maj_le: string
          nom_complet: string | null
          role: Database["public"]["Enums"]["user_role"]
          statut: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          anonymise_le?: string | null
          cree_le?: string
          email: string
          id: string
          langue_preferee?: string
          maj_le?: string
          nom_complet?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          statut?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          anonymise_le?: string | null
          cree_le?: string
          email?: string
          id?: string
          langue_preferee?: string
          maj_le?: string
          nom_complet?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          statut?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          erreur: string | null
          event_id: string
          id: string
          payload: Json
          recu_le: string
          signature_valide: boolean
          traite_le: string | null
          type: string
        }
        Insert: {
          erreur?: string | null
          event_id: string
          id?: string
          payload: Json
          recu_le?: string
          signature_valide: boolean
          traite_le?: string | null
          type: string
        }
        Update: {
          erreur?: string | null
          event_id?: string
          id?: string
          payload?: Json
          recu_le?: string
          signature_valide?: boolean
          traite_le?: string | null
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      book_popularity: {
        Row: {
          achats: number | null
          book_id: string | null
          lecteurs: number | null
          score: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      abonnements_en_anomalie: {
        Args: { p_at?: string }
        Returns: {
          depuis: string
          fin_periode: string
          statut_rapporte: Database["public"]["Enums"]["subscription_status"]
          subscription_id: string
          user_id: string
        }[]
      }
      access_for: {
        Args: { p_at?: string; p_book: string; p_user: string }
        Returns: Database["public"]["CompositeTypes"]["access_decision"]
        SetofOptions: {
          from: "*"
          to: "access_decision"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      access_for_books: {
        Args: { p_at?: string; p_books: string[]; p_user: string }
        Returns: {
          book_id: string
          can_download: boolean
          can_read: boolean
          reason: Database["public"]["Enums"]["access_reason"]
        }[]
      }
      acteur_courant: { Args: never; Returns: string }
      admin_changer_publication: {
        Args: {
          p_acteur: string
          p_book_ids: string[]
          p_statut: Database["public"]["Enums"]["book_status"]
        }
        Returns: {
          sortie_book_id: string
          sortie_publie_le: string
          sortie_statut: Database["public"]["Enums"]["book_status"]
        }[]
      }
      admin_changer_zone_abonnement: {
        Args: {
          p_acteur: string
          p_motif?: string
          p_subscription_id: string
          p_zone: Database["public"]["Enums"]["price_zone"]
        }
        Returns: {
          annule_le: string | null
          cree_le: string
          debut_periode: string
          devise: string
          fin_periode: string
          id: string
          id_prestataire: string | null
          impaye_depuis: string | null
          jours_essai: number
          maj_le: string
          montant: number
          offre: string
          statut: Database["public"]["Enums"]["subscription_status"]
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_definir_prix: {
        Args: {
          p_acteur: string
          p_book_id: string
          p_devise: string
          p_montant: number
          p_zone: Database["public"]["Enums"]["price_zone"]
        }
        Returns: {
          book_id: string
          devise: string
          maj_le: string
          montant: number
          zone: Database["public"]["Enums"]["price_zone"]
        }
        SetofOptions: {
          from: "*"
          to: "book_prices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_definir_statut_compte: {
        Args: {
          p_acteur: string
          p_motif?: string
          p_suspendu: boolean
          p_user_id: string
        }
        Returns: {
          anonymise_le: string | null
          cree_le: string
          email: string
          id: string
          langue_preferee: string
          maj_le: string
          nom_complet: string | null
          role: Database["public"]["Enums"]["user_role"]
          statut: Database["public"]["Enums"]["user_status"]
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_enregistrer_promo: {
        Args: {
          p_acteur: string
          p_actif?: boolean
          p_code: string
          p_devise?: string
          p_expire_le?: string
          p_type: Database["public"]["Enums"]["promo_type"]
          p_usage_max?: number
          p_valeur: number
          p_zone?: Database["public"]["Enums"]["price_zone"]
        }
        Returns: {
          actif: boolean
          code: string
          cree_le: string
          devise: string | null
          expire_le: string | null
          id: string
          type: Database["public"]["Enums"]["promo_type"]
          usage_count: number
          usage_max: number | null
          valeur: number
          zone: Database["public"]["Enums"]["price_zone"] | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_lister_abonnements: {
        Args: { p_page?: number; p_statut?: string; p_taille?: number }
        Returns: {
          debut_periode: string
          devise: string
          email: string
          fin_periode: string
          id: string
          montant: number
          offre: string
          statut: Database["public"]["Enums"]["subscription_status"]
          statut_observe: Database["public"]["Enums"]["subscription_status_effectif"]
          total_lignes: number
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      admin_lister_audit: {
        Args: {
          p_action?: string
          p_cible_id?: string
          p_page?: number
          p_taille?: number
        }
        Returns: {
          acteur_email: string
          acteur_id: string
          action: string
          ancienne_valeur: Json
          cible_id: string
          cible_type: string
          cree_le: string
          id: string
          motif: string
          nouvelle_valeur: Json
          total_lignes: number
        }[]
      }
      admin_lister_commandes: {
        Args: {
          p_page?: number
          p_statut?: string
          p_taille?: number
          p_user_id?: string
        }
        Returns: {
          acheteur_anonymise: boolean
          cree_le: string
          devise: string
          email: string
          id: string
          montant_total: number
          nb_lignes: number
          numero_facture: string
          paye_le: string
          remise: number
          statut: Database["public"]["Enums"]["order_status"]
          total_lignes: number
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      admin_lister_livres: {
        Args: { p_page?: number; p_statut?: string; p_taille?: number }
        Returns: {
          auteur: string
          disponible_achat: boolean
          gratuit: boolean
          id: string
          inclus_abonnement: boolean
          manques: string[]
          prix: Json
          publiable: boolean
          publie_le: string
          slug: string
          statut: Database["public"]["Enums"]["book_status"]
          total_lignes: number
        }[]
      }
      admin_lister_promos: {
        Args: { p_page?: number; p_taille?: number }
        Returns: {
          actif: boolean
          code: string
          devise: string
          expire_le: string
          id: string
          total_lignes: number
          type: Database["public"]["Enums"]["promo_type"]
          usage_count: number
          usage_max: number
          valeur: number
          zone: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      admin_lister_utilisateurs: {
        Args: {
          p_page?: number
          p_recherche?: string
          p_statut?: string
          p_taille?: number
        }
        Returns: {
          anonymise: boolean
          cree_le: string
          email: string
          id: string
          nb_commandes: number
          nb_droits: number
          nom_complet: string
          role: Database["public"]["Enums"]["user_role"]
          statut: Database["public"]["Enums"]["user_status"]
          total_lignes: number
        }[]
      }
      admin_modifier_livre: {
        Args: {
          p_acteur: string
          p_age_max?: number
          p_age_min?: number
          p_auteur?: string
          p_book_id: string
          p_disponible_achat?: boolean
          p_gratuit?: boolean
          p_inclus_abonnement?: boolean
          p_nb_pages_extrait?: number
          p_origine_culturelle?: string
        }
        Returns: {
          age_max: number | null
          age_min: number | null
          auteur: string
          couverture_url: string | null
          cree_le: string
          disponible_achat: boolean
          gratuit: boolean
          id: string
          illustrateur: string | null
          inclus_abonnement: boolean
          maj_le: string
          nb_pages_extrait: number | null
          origine_culturelle: string | null
          publie_le: string | null
          recherche: unknown
          slug: string
          statut: Database["public"]["Enums"]["book_status"]
          themes: string[]
        }
        SetofOptions: {
          from: "*"
          to: "books"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_modifier_parametres: {
        Args: {
          p_acteur: string
          p_fenetre_nouveaute_jours?: number
          p_jours_essai?: number
          p_periode_grace_jours?: number
          p_retention_copies_mois?: number
          p_tolerance_renouvellement_heures?: number
        }
        Returns: {
          fenetre_nouveaute_jours: number
          id: number
          jours_essai: number
          maj_le: string
          maj_par: string | null
          periode_grace_jours: number
          retention_copies_mois: number
          tolerance_renouvellement_heures: number
        }
        SetofOptions: {
          from: "*"
          to: "business_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_octroyer_droit: {
        Args: {
          p_acteur: string
          p_book_id: string
          p_expire_le?: string
          p_motif: string
          p_peut_telecharger?: boolean
          p_user_id: string
        }
        Returns: {
          accorde_le: string
          book_id: string
          expire_le: string | null
          id: string
          peut_telecharger: boolean
          source_id: string | null
          type: Database["public"]["Enums"]["entitlement_type"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "entitlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_poser_acteur: {
        Args: { p_acteur: string; p_motif?: string }
        Returns: undefined
      }
      admin_retirer_droit: {
        Args: { p_acteur: string; p_entitlement_id: string; p_motif?: string }
        Returns: undefined
      }
      admin_tableau_de_bord: { Args: never; Returns: Json }
      admin_tracer_purge: {
        Args: { p_acteur: string; p_nombre: number }
        Returns: undefined
      }
      anonymize_user: {
        Args: { p_user_id: string }
        Returns: {
          anonymise_le: string | null
          cree_le: string
          email: string
          id: string
          langue_preferee: string
          maj_le: string
          nom_complet: string | null
          role: Database["public"]["Enums"]["user_role"]
          statut: Database["public"]["Enums"]["user_status"]
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      app_now: { Args: never; Returns: string }
      catalog_list: {
        Args: {
          p_acces?: string
          p_age_max?: number
          p_age_min?: number
          p_at?: string
          p_langue?: string
          p_origine?: string
          p_page?: number
          p_recherche?: string
          p_taille?: number
          p_themes?: string[]
          p_tri?: string
          p_zone?: Database["public"]["Enums"]["price_zone"]
        }
        Returns: {
          age_max: number
          age_min: number
          auteur: string
          book_id: string
          couverture_url: string
          devise: string
          disponible_achat: boolean
          gratuit: boolean
          illustrateur: string
          inclus_abonnement: boolean
          langues: string[]
          montant: number
          nb_pages: number
          origine_culturelle: string
          publie_le: string
          resume: string
          score_popularite: number
          slug: string
          themes: string[]
          titre: string
          total: number
          zone_prix: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      compter_abonnements: {
        Args: { p_at?: string }
        Returns: {
          nombre: number
          statut: Database["public"]["Enums"]["subscription_status_effectif"]
        }[]
      }
      contexte_applicatif: { Args: never; Returns: boolean }
      copies_purgeables: {
        Args: { p_at?: string }
        Returns: {
          chemin: string
          copie_id: string
          dernier_acces_le: string
        }[]
      }
      create_order: {
        Args: {
          p_devise: string
          p_lignes: Json
          p_montant_total: number
          p_promo_code_id: string
          p_remise: number
          p_user_id: string
          p_zone: Database["public"]["Enums"]["price_zone"]
        }
        Returns: string
      }
      dev_reset_demo_state: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["dev_reset_report"]
        SetofOptions: {
          from: "*"
          to: "dev_reset_report"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      emails_a_envoyer: {
        Args: { p_limite?: number }
        Returns: {
          destinataire: string
          id: string
          langue: string
          modele: string
          user_id: string
          variables: Json
        }[]
      }
      emettre_facture: {
        Args: {
          p_adresse?: Json
          p_nom?: string
          p_order_id: string
          p_pays?: string
          p_retention_years?: number
        }
        Returns: {
          conservation_jusqu_au: string
          devise: string
          emise_le: string
          facture_adresse: Json
          facture_email: string
          facture_nom: string
          facture_pays: string | null
          id: string
          lignes: Json
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          numero: string
          order_id: string | null
          subscription_id: string | null
          taux_tva: number
          user_id: string
          zone: Database["public"]["Enums"]["price_zone"]
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_order: {
        Args: {
          p_motif?: string
          p_order_id: string
          p_webhook_event_id?: string
        }
        Returns: boolean
      }
      fenetre_de_vente_ecoulee: {
        Args: { p_at: string; p_fenetre_jours: number; p_publie_le: string }
        Returns: boolean
      }
      fulfill_order: {
        Args: {
          p_order_id: string
          p_reference_paiement?: string
          p_webhook_event_id?: string
        }
        Returns: {
          deja_traite: boolean
          nb_droits: number
        }[]
      }
      is_admin: { Args: { p_user?: string }; Returns: boolean }
      journaliser_admin: {
        Args: {
          p_action: string
          p_ancienne: Json
          p_cible_id: string
          p_cible_type: string
          p_motif?: string
          p_nouvelle: Json
        }
        Returns: string
      }
      manques_pour_publication: {
        Args: { p_book_id: string }
        Returns: string[]
      }
      marquer_email: {
        Args: { p_envoye: boolean; p_erreur?: string; p_id: string }
        Returns: undefined
      }
      motif_courant: { Args: never; Returns: string }
      pages_publiees: {
        Args: { p_book_id: string; p_langue: string }
        Returns: number
      }
      periode_stats: {
        Args: { p_at?: string; p_debut: string; p_fin: string }
        Returns: {
          debut: string
          fin: string
        }[]
      }
      prochain_numero_facture: { Args: { p_annee: number }; Returns: string }
      programmer_email: {
        Args: {
          p_cle: string
          p_modele: string
          p_user_id: string
          p_variables?: Json
        }
        Returns: string
      }
      purge_expired_invoices: {
        Args: { p_at?: string }
        Returns: Database["public"]["CompositeTypes"]["purge_report"]
        SetofOptions: {
          from: "*"
          to: "purge_report"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_order: {
        Args: {
          p_book_ids?: string[]
          p_order_id: string
          p_webhook_event_id?: string
        }
        Returns: {
          commande_soldee: boolean
          droits_retires: number
        }[]
      }
      reprise_lecture: {
        Args: { p_book_id: string; p_langue: string; p_user_id: string }
        Returns: {
          borne_appliquee: boolean
          langue_origine: string
          page: number
        }[]
      }
      seuil_agregation: { Args: never; Returns: number }
      stats_abonnes: {
        Args: { p_at?: string }
        Returns: {
          devise: string
          nombre: number
          offre: string
          statut_observe: Database["public"]["Enums"]["subscription_status_effectif"]
          zone: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      stats_chiffre_affaires: {
        Args: { p_at?: string; p_debut?: string; p_fin?: string }
        Returns: {
          devise: string
          flux: string
          montant: number
          nb_transactions: number
          zone: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      stats_langues: {
        Args: { p_at?: string; p_debut?: string; p_fin?: string }
        Returns: {
          achats: number
          langue: string
          lecteurs: number
          sous_le_seuil: boolean
          telechargements: number
        }[]
      }
      stats_mouvements_abonnement: {
        Args: { p_at?: string; p_debut?: string; p_fin?: string }
        Returns: {
          mouvement: string
          nombre: number
          offre: string
        }[]
      }
      stats_telechargements_par_zone: {
        Args: { p_at?: string; p_debut?: string; p_fin?: string }
        Returns: {
          lecteurs: number
          sous_le_seuil: boolean
          telechargements: number
          zone: Database["public"]["Enums"]["price_zone"]
        }[]
      }
      stats_titres_achetes: {
        Args: {
          p_at?: string
          p_debut?: string
          p_fin?: string
          p_page?: number
          p_taille?: number
        }
        Returns: {
          book_id: string
          devise: string
          langue: string
          montant: number
          nb_achats: number
          slug: string
          total_lignes: number
        }[]
      }
      stats_titres_lus: {
        Args: {
          p_at?: string
          p_debut?: string
          p_fin?: string
          p_page?: number
          p_taille?: number
        }
        Returns: {
          book_id: string
          langue: string
          nb_lecteurs: number
          slug: string
          total_lignes: number
        }[]
      }
      statut_effectif:
        | {
            Args: {
              p_at?: string
              p_fin_periode: string
              p_impaye_depuis: string
              p_statut: Database["public"]["Enums"]["subscription_status"]
            }
            Returns: Database["public"]["Enums"]["subscription_status_effectif"]
          }
        | {
            Args: { s: Database["public"]["Tables"]["subscriptions"]["Row"] }
            Returns: Database["public"]["Enums"]["subscription_status_effectif"]
          }
      taille_page_admin: { Args: { p_demandee: number }; Returns: number }
      themes_texte: { Args: { p_themes: string[] }; Returns: string }
      titres_impactes_par_fenetre: {
        Args: { p_at?: string; p_nouvelle_fenetre: number }
        Returns: {
          entrent_dans_abonnement: number
          sortent_de_l_abonnement: number
        }[]
      }
    }
    Enums: {
      access_reason:
        | "purchase"
        | "granted"
        | "subscription"
        | "free"
        | "preview"
        | "none"
      book_status: "brouillon" | "publie" | "archive"
      download_format: "pdf" | "epub"
      email_statut: "en_attente" | "envoye" | "echoue"
      entitlement_type: "achat" | "offert"
      ingestion_status: "en_attente" | "en_cours" | "termine" | "echoue"
      order_status: "en_attente" | "paye" | "rembourse" | "echoue"
      price_zone: "international" | "afrique"
      promo_type: "montant" | "pourcentage"
      subscription_status: "essai" | "actif" | "annule" | "impaye" | "expire"
      subscription_status_effectif:
        | "essai"
        | "actif"
        | "annule"
        | "impaye"
        | "expire"
        | "anomalie"
      translation_status: "brouillon" | "publie"
      user_role: "user" | "admin"
      user_status: "actif" | "suspendu" | "anonymise"
    }
    CompositeTypes: {
      access_decision: {
        can_read: boolean | null
        can_download: boolean | null
        reason: Database["public"]["Enums"]["access_reason"] | null
      }
      dev_reset_report: {
        commandes: number | null
        abonnements: number | null
        droits: number | null
        webhooks: number | null
        comptes: number | null
      }
      purge_report: {
        factures_supprimees: number | null
        commandes_supprimees: number | null
        comptes_supprimes: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_reason: [
        "purchase",
        "granted",
        "subscription",
        "free",
        "preview",
        "none",
      ],
      book_status: ["brouillon", "publie", "archive"],
      download_format: ["pdf", "epub"],
      email_statut: ["en_attente", "envoye", "echoue"],
      entitlement_type: ["achat", "offert"],
      ingestion_status: ["en_attente", "en_cours", "termine", "echoue"],
      order_status: ["en_attente", "paye", "rembourse", "echoue"],
      price_zone: ["international", "afrique"],
      promo_type: ["montant", "pourcentage"],
      subscription_status: ["essai", "actif", "annule", "impaye", "expire"],
      subscription_status_effectif: [
        "essai",
        "actif",
        "annule",
        "impaye",
        "expire",
        "anomalie",
      ],
      translation_status: ["brouillon", "publie"],
      user_role: ["user", "admin"],
      user_status: ["actif", "suspendu", "anonymise"],
    },
  },
} as const

