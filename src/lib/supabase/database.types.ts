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
          resume?: string | null
          statut?: Database["public"]["Enums"]["translation_status"]
          titre?: string
        }
        Relationships: [
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
          slug?: string
          statut?: Database["public"]["Enums"]["book_status"]
          themes?: string[]
        }
        Relationships: []
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
      ingestion_jobs: {
        Row: {
          book_id: string | null
          chemin_source: string
          couche_texte: boolean | null
          cree_le: string
          erreur: string | null
          etape: string | null
          id: string
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
          erreur?: string | null
          etape?: string | null
          id?: string
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
          erreur?: string | null
          etape?: string | null
          id?: string
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
          maj_le: string
          user_id: string
        }
        Insert: {
          book_id: string
          derniere_page: number
          maj_le?: string
          user_id: string
        }
        Update: {
          book_id?: string
          derniere_page?: number
          maj_le?: string
          user_id?: string
        }
        Relationships: [
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
          cree_le: string
          email: string
          id: string
          langue_preferee: string
          maj_le: string
          nom_complet: string | null
          role: Database["public"]["Enums"]["user_role"]
          suspendu: boolean
        }
        Insert: {
          cree_le?: string
          email: string
          id: string
          langue_preferee?: string
          maj_le?: string
          nom_complet?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspendu?: boolean
        }
        Update: {
          cree_le?: string
          email?: string
          id?: string
          langue_preferee?: string
          maj_le?: string
          nom_complet?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspendu?: boolean
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
      [_ in never]: never
    }
    Functions: {
      app_now: { Args: never; Returns: string }
      is_admin: { Args: { p_user?: string }; Returns: boolean }
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
      entitlement_type: "achat" | "offert"
      ingestion_status: "en_attente" | "en_cours" | "termine" | "echoue"
      order_status: "en_attente" | "paye" | "rembourse" | "echoue"
      price_zone: "international" | "afrique"
      promo_type: "montant" | "pourcentage"
      subscription_status: "essai" | "actif" | "annule" | "impaye" | "expire"
      translation_status: "brouillon" | "publie"
      user_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
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
      entitlement_type: ["achat", "offert"],
      ingestion_status: ["en_attente", "en_cours", "termine", "echoue"],
      order_status: ["en_attente", "paye", "rembourse", "echoue"],
      price_zone: ["international", "afrique"],
      promo_type: ["montant", "pourcentage"],
      subscription_status: ["essai", "actif", "annule", "impaye", "expire"],
      translation_status: ["brouillon", "publie"],
      user_role: ["user", "admin"],
    },
  },
} as const

