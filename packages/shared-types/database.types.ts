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
      companies: {
        Row: {
          batch_expiry_enabled: boolean
          billing_cycle: string | null
          cash_control_enabled: boolean
          cashier_flow_enabled: boolean
          code: string
          created_at: string
          currency: string
          enable_printer: boolean
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          logo_path: string | null
          low_stock_threshold: number
          name: string
          notification_category_preferences: Json | null
          paystack_customer_code: string | null
          paystack_subscription_code: string | null
          public_slug: string | null
          public_storefront_enabled: boolean
          public_whatsapp_number: string | null
          require_opening_count: boolean
          sms_period_end: string | null
          sms_usage_by_category: Json | null
          sms_used_this_period: number
          status: string
          subscription_exempt_reason: string | null
          subscription_exempt_until: string | null
          subscription_expired_reminder_sent_at: string | null
          subscription_expires_at: string | null
          subscription_grace_period_end: string | null
          subscription_started_at: string | null
          subscription_status: string | null
          subscription_tier_id: string | null
          trial_ends_at: string | null
          updated_at: string
          variance_notification_threshold: number
        }
        Insert: {
          batch_expiry_enabled?: boolean
          billing_cycle?: string | null
          cash_control_enabled?: boolean
          cashier_flow_enabled?: boolean
          code: string
          created_at?: string
          currency?: string
          enable_printer?: boolean
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          logo_path?: string | null
          low_stock_threshold?: number
          name: string
          notification_category_preferences?: Json | null
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          public_slug?: string | null
          public_storefront_enabled?: boolean
          public_whatsapp_number?: string | null
          require_opening_count?: boolean
          sms_period_end?: string | null
          sms_usage_by_category?: Json | null
          sms_used_this_period?: number
          status?: string
          subscription_exempt_reason?: string | null
          subscription_exempt_until?: string | null
          subscription_expired_reminder_sent_at?: string | null
          subscription_expires_at?: string | null
          subscription_grace_period_end?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          subscription_tier_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          variance_notification_threshold?: number
        }
        Update: {
          batch_expiry_enabled?: boolean
          billing_cycle?: string | null
          cash_control_enabled?: boolean
          cashier_flow_enabled?: boolean
          code?: string
          created_at?: string
          currency?: string
          enable_printer?: boolean
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          logo_path?: string | null
          low_stock_threshold?: number
          name?: string
          notification_category_preferences?: Json | null
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          public_slug?: string | null
          public_storefront_enabled?: boolean
          public_whatsapp_number?: string | null
          require_opening_count?: boolean
          sms_period_end?: string | null
          sms_usage_by_category?: Json | null
          sms_used_this_period?: number
          status?: string
          subscription_exempt_reason?: string | null
          subscription_exempt_until?: string | null
          subscription_expired_reminder_sent_at?: string | null
          subscription_expires_at?: string | null
          subscription_grace_period_end?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          subscription_tier_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          variance_notification_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "companies_subscription_tier_id_fkey"
            columns: ["subscription_tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          authorization_status: string
          company_id: string
          created_at: string
          id: string
          role_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          authorization_status?: string
          company_id: string
          created_at?: string
          id?: string
          role_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          authorization_status?: string
          company_id?: string
          created_at?: string
          id?: string
          role_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_template: boolean
          name: string
          permissions: string[]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_template?: boolean
          name: string
          permissions?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_template?: boolean
          name?: string
          permissions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_tiers: {
        Row: {
          code: string
          created_at: string
          features: Json
          id: string
          is_active: boolean
          limits: Json
          name: string
          price_monthly: number
          price_yearly: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          limits?: Json
          name: string
          price_monthly: number
          price_yearly: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          limits?: Json
          name?: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_id: { Args: never; Returns: string }
      current_role_name: { Args: never; Returns: string }
      is_platform_admin: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const

