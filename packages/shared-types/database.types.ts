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
      customers: {
        Row: {
          company_id: string
          created_at: string
          credit_approved_by: string | null
          credit_limit: number
          credit_terms_days: number | null
          email: string | null
          first_name: string
          id: string
          is_credit_approved: boolean
          is_supplier: boolean
          last_name: string | null
          last_repayment_amount: number | null
          last_repayment_date: string | null
          notes: string | null
          notifications_enabled: boolean
          payment_terms: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          credit_approved_by?: string | null
          credit_limit?: number
          credit_terms_days?: number | null
          email?: string | null
          first_name: string
          id?: string
          is_credit_approved?: boolean
          is_supplier?: boolean
          last_name?: string | null
          last_repayment_amount?: number | null
          last_repayment_date?: string | null
          notes?: string | null
          notifications_enabled?: boolean
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          credit_approved_by?: string | null
          credit_limit?: number
          credit_terms_days?: number | null
          email?: string | null
          first_name?: string
          id?: string
          is_credit_approved?: boolean
          is_supplier?: boolean
          last_name?: string | null
          last_repayment_amount?: number | null
          last_repayment_date?: string | null
          notes?: string | null
          notifications_enabled?: boolean
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          company_id: string
          created_at: string
          expiry_date: string | null
          id: string
          product_id: string
          purchased_at: string
          quantity: number
          remaining: number
          stock_location_id: string | null
          supplier_id: string | null
          unit_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id: string
          purchased_at?: string
          quantity: number
          remaining: number
          stock_location_id?: string | null
          supplier_id?: string | null
          unit_cost: number
        }
        Update: {
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string
          purchased_at?: string
          quantity?: number
          remaining?: number
          stock_location_id?: string | null
          supplier_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          company_id: string
          created_at: string
          id: string
          meta: Json
          product_id: string
          quantity: number
          source_id: string | null
          source_type: string | null
          total_cost: number | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          meta?: Json
          product_id: string
          quantity: number
          source_id?: string | null
          source_type?: string | null
          total_cost?: number | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          meta?: Json
          product_id?: string
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          total_cost?: number | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_parent: boolean
          is_system: boolean
          name: string
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_parent?: boolean
          is_system?: boolean
          name: string
          parent_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_parent?: boolean
          is_system?: boolean
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_journal_entries: {
        Row: {
          company_id: string
          created_at: string
          entry_date: string
          id: string
          memo: string | null
          posted_at: string
          reversal_of: string | null
          source_id: string
          source_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entry_date: string
          id?: string
          memo?: string | null
          posted_at?: string
          reversal_of?: string | null
          source_id: string
          source_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          memo?: string | null
          posted_at?: string
          reversal_of?: string | null
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_entries_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "ledger_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_journal_lines: {
        Row: {
          account_id: string
          company_id: string
          credit: number
          debit: number
          entry_id: string
          id: string
          meta: Json
          order_id: string | null
        }
        Insert: {
          account_id: string
          company_id: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          meta?: Json
          order_id?: string | null
        }
        Update: {
          account_id?: string
          company_id?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          meta?: Json
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          company_id: string
          created_at: string
          custom_price: number | null
          id: string
          line_total: number
          order_id: string
          price_override_reason: string | null
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_price?: number | null
          id?: string
          line_total: number
          order_id: string
          price_override_reason?: string | null
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_price?: number | null
          id?: string
          line_total?: number
          order_id?: string
          price_override_reason?: string | null
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cashier_pending_at: string | null
          cashier_session_id: string | null
          client_ref: string | null
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          is_credit_sale: boolean
          status: string
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          cashier_pending_at?: string | null
          cashier_session_id?: string | null
          client_ref?: string | null
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_credit_sale?: boolean
          status?: string
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          cashier_pending_at?: string | null
          cashier_session_id?: string | null
          client_ref?: string | null
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_credit_sale?: boolean
          status?: string
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          is_cashier_controlled: boolean
          ledger_account_code: string
          name: string
          reconciliation_type: string
          requires_reconciliation: boolean
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_cashier_controlled?: boolean
          ledger_account_code: string
          name: string
          reconciliation_type: string
          requires_reconciliation?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_cashier_controlled?: boolean
          ledger_account_code?: string
          name?: string
          reconciliation_type?: string
          requires_reconciliation?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          method_code: string
          mpesa_receipt: string | null
          order_id: string
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          method_code: string
          mpesa_receipt?: string | null
          order_id: string
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          method_code?: string
          mpesa_receipt?: string | null
          order_id?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          allow_fractional: boolean
          barcode: string | null
          company_id: string
          created_at: string
          id: string
          image_path: string | null
          name: string
          price: number
          sku: string
          track_inventory: boolean
          updated_at: string
          wholesale_price: number | null
        }
        Insert: {
          active?: boolean
          allow_fractional?: boolean
          barcode?: string | null
          company_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          name: string
          price: number
          sku: string
          track_inventory?: boolean
          updated_at?: string
          wholesale_price?: number | null
        }
        Update: {
          active?: boolean
          allow_fractional?: boolean
          barcode?: string | null
          company_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          name?: string
          price?: number
          sku?: string
          track_inventory?: boolean
          updated_at?: string
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          method_code: string
          order_id: string
          reason: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method_code: string
          order_id: string
          reason?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method_code?: string
          order_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      stock_locations: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_company_id_fkey"
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
      complete_order: {
        Args: { p_actor: string; p_order_id: string; p_payments: Json }
        Returns: string
      }
      consume_fifo: {
        Args: {
          p_company_id: string
          p_product_id: string
          p_quantity: number
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      convert_draft: {
        Args: { p_order_id: string; p_payments: Json }
        Returns: string
      }
      create_customer: {
        Args: {
          p_email?: string
          p_first_name: string
          p_last_name?: string
          p_phone?: string
        }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      current_role_name: { Args: never; Returns: string }
      current_user_has_permission: {
        Args: { p_permission: string }
        Returns: boolean
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_platform_admin: { Args: never; Returns: boolean }
      post_balance_adjustment: {
        Args: { p_amount: number; p_customer_id: string; p_reason: string }
        Returns: string
      }
      post_expense: {
        Args: {
          p_amount: number
          p_category?: string
          p_memo?: string
          p_source_account_code: string
        }
        Returns: string
      }
      post_journal_entry: {
        Args: {
          p_company_id: string
          p_entry_date?: string
          p_lines: Json
          p_memo: string
          p_source_id: string
          p_source_type: string
        }
        Returns: string
      }
      post_payment_allocation: {
        Args: {
          p_amount: number
          p_method_code: string
          p_order_id: string
          p_reference?: string
        }
        Returns: string
      }
      post_payment_reversal: { Args: { p_payment_id: string }; Returns: string }
      post_refund: {
        Args: {
          p_amount: number
          p_method_code: string
          p_order_id: string
          p_reason?: string
        }
        Returns: string
      }
      post_reversal_entry: {
        Args: {
          p_company_id: string
          p_lines: Json
          p_memo: string
          p_reversal_of: string
          p_source_id: string
          p_source_type: string
        }
        Returns: string
      }
      post_sale: {
        Args: {
          p_client_ref?: string
          p_customer_id: string
          p_lines: Json
          p_park?: boolean
          p_payments: Json
        }
        Returns: string
      }
      post_supplier_balance_adjustment: {
        Args: { p_amount: number; p_reason: string; p_supplier_id: string }
        Returns: string
      }
      post_transfer: {
        Args: {
          p_fee?: number
          p_from_account_code: string
          p_memo?: string
          p_principal: number
          p_to_account_code: string
          p_transfer_id?: string
        }
        Returns: string
      }
      provision_company: {
        Args: {
          p_company_name: string
          p_currency?: string
          p_store_name?: string
        }
        Returns: string
      }
      require_asset_leaf_account: {
        Args: { p_code: string; p_company_id: string }
        Returns: string
      }
      save_draft: {
        Args: { p_customer_id: string; p_draft_id?: string; p_lines: Json }
        Returns: string
      }
      send_sms_hook: { Args: { event: Json }; Returns: Json }
      settle_order: {
        Args: { p_order_id: string; p_payments: Json }
        Returns: string
      }
      void_sale: {
        Args: { p_order_id: string; p_reason: string }
        Returns: string
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

