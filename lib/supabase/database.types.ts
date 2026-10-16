export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          role: string
          sessions_revoked_before: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          role: string
          sessions_revoked_before?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          role?: string
          sessions_revoked_before?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          entity_id: string
          entity_table: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id: string
          entity_table: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_table?: string
          id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      consultant_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          enabled: boolean
          public_name: string
          sort_order: number
          updated_at: string
          user_id: string
          zalo_phone: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          enabled?: boolean
          public_name: string
          sort_order?: number
          updated_at?: string
          user_id: string
          zalo_phone: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          enabled?: boolean
          public_name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
          zalo_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultant_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          id: string
          inquiry_id: string
          last_error: string | null
          locked_until: string | null
          next_attempt_at: string
          provider_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id?: string
          id?: string
          inquiry_id: string
          last_error?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          provider_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          id?: string
          inquiry_id?: string
          last_error?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          provider_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          assignee_id: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          deleted_at: string | null
          id: string
          idempotency_key: string
          message: string
          original_submission: Json
          reference: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          idempotency_key: string
          message?: string
          original_submission: Json
          reference?: never
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          idempotency_key?: string
          message?: string
          original_submission?: Json
          reference?: never
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inquiry_items: {
        Row: {
          currency: string
          id: string
          inquiry_id: string
          product_id: string | null
          product_name: string
          product_slug: string
          quantity: number
          unit_price: number | null
        }
        Insert: {
          currency: string
          id?: string
          inquiry_id: string
          product_id?: string | null
          product_name: string
          product_slug: string
          quantity: number
          unit_price?: number | null
        }
        Update: {
          currency?: string
          id?: string
          inquiry_id?: string
          product_id?: string | null
          product_name?: string
          product_slug?: string
          quantity?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_items_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          inquiry_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inquiry_notes_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt: string
          bytes: number | null
          cloudinary_asset_id: string
          created_at: string
          format: string
          height: number
          id: string
          public_id: string
          secure_url: string
          status: string
          updated_at: string
          uploaded_by: string | null
          width: number
        }
        Insert: {
          alt?: string
          bytes?: number | null
          cloudinary_asset_id: string
          created_at?: string
          format: string
          height: number
          id?: string
          public_id: string
          secure_url: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          width: number
        }
        Update: {
          alt?: string
          bytes?: number | null
          cloudinary_asset_id?: string
          created_at?: string
          format?: string
          height?: number
          id?: string
          public_id?: string
          secure_url?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      product_images: {
        Row: {
          asset_id: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          category_id: string
          created_at: string
          currency: string
          description: string
          featured: boolean
          id: string
          name: string
          price: number | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          attributes?: Json
          category_id: string
          created_at?: string
          currency?: string
          description?: string
          featured?: boolean
          id?: string
          name: string
          price?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          attributes?: Json
          category_id?: string
          created_at?: string
          currency?: string
          description?: string
          featured?: boolean
          id?: string
          name?: string
          price?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      slug_redirects: {
        Row: {
          created_at: string
          old_slug: string
          product_id: string
        }
        Insert: {
          created_at?: string
          old_slug: string
          product_id: string
        }
        Update: {
          created_at?: string
          old_slug?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slug_redirects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      submit_customer_inquiry: {
        Args: {
          p_idempotency_key: string
          p_contact_name: string
          p_contact_phone: string
          p_contact_email: string | null
          p_message: string | null
          p_source: string
          p_original_submission: Json
          p_items?: Json | null
        }
        Returns: {
          id: string
          reference: number
          is_duplicate: boolean
        }[]
      }
      save_catalog_product: {
        // Remote generated signature, with nullable create arguments corrected:
        // PostgreSQL accepts NULL for a new product; generator omits argument nullability.
        Args: { p_id: string | null; p_expected_version: number | null; p_data: Json; p_asset_ids: string[] }
        Returns: string
      }
      claim_unused_media: { Args: { p_id: string }; Returns: boolean }
      get_admin_session_context: { Args: never; Returns: Json }
      list_public_consultants: {
        Args: never
        Returns: {
          avatar_url: string
          public_name: string
          sort_order: number
          zalo_phone: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

export type AdminRole = "super_admin" | "staff";
export type AdminProfile = Database["public"]["Tables"]["admin_profiles"]["Row"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
