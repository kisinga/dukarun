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
      accounting_periods: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          start_date: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          start_date: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor: string | null
          changed_at: string
          company_id: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          operation: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          actor?: string | null
          changed_at?: string
          company_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          actor?: string | null
          changed_at?: string
          company_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      cash_drawer_counts: {
        Row: {
          company_id: string
          count_type: string
          created_at: string
          created_by: string | null
          declared_cash: number
          expected_cash: number
          id: string
          session_id: string
          variance: number
        }
        Insert: {
          company_id: string
          count_type: string
          created_at?: string
          created_by?: string | null
          declared_cash: number
          expected_cash: number
          id?: string
          session_id: string
          variance: number
        }
        Update: {
          company_id?: string
          count_type?: string
          created_at?: string
          created_by?: string | null
          declared_cash?: number
          expected_cash?: number
          id?: string
          session_id?: string
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_counts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_sessions: {
        Row: {
          cashier_user_id: string
          closed_at: string | null
          closing_declared: number | null
          company_id: string
          created_at: string
          id: string
          opened_at: string
          status: string
        }
        Insert: {
          cashier_user_id: string
          closed_at?: string | null
          closing_declared?: number | null
          company_id: string
          created_at?: string
          id?: string
          opened_at?: string
          status?: string
        }
        Update: {
          cashier_user_id?: string
          closed_at?: string | null
          closing_declared?: number | null
          company_id?: string
          created_at?: string
          id?: string
          opened_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
          supplier_credit_limit: number
          supplier_credit_terms_days: number | null
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
          supplier_credit_limit?: number
          supplier_credit_terms_days?: number | null
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
          supplier_credit_limit?: number
          supplier_credit_terms_days?: number | null
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
          purchased_at: string
          quantity: number
          remaining: number
          stock_location_id: string | null
          supplier_id: string | null
          unit_cost: number
          variant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          purchased_at?: string
          quantity: number
          remaining: number
          stock_location_id?: string | null
          supplier_id?: string | null
          unit_cost: number
          variant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          purchased_at?: string
          quantity?: number
          remaining?: number
          stock_location_id?: string | null
          supplier_id?: string | null
          unit_cost?: number
          variant_id?: string
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
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
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
          quantity: number
          source_id: string | null
          source_type: string | null
          total_cost: number | null
          type: string
          unit_cost: number | null
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          meta?: Json
          quantity: number
          source_id?: string | null
          source_type?: string | null
          total_cost?: number | null
          type: string
          unit_cost?: number | null
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          meta?: Json
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          total_cost?: number | null
          type?: string
          unit_cost?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "expiring_batches"
            referencedColumns: ["batch_id"]
          },
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
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
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
      mpesa_verifications: {
        Row: {
          all_confirmed: boolean
          company_id: string
          created_at: string
          created_by: string | null
          flagged_ids: Json
          id: string
          notes: string | null
          session_id: string | null
        }
        Insert: {
          all_confirmed?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          flagged_ids?: Json
          id?: string
          notes?: string | null
          session_id?: string | null
        }
        Update: {
          all_confirmed?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          flagged_ids?: Json
          id?: string
          notes?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_verifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
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
          quantity: number
          unit_price: number
          variant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_price?: number | null
          id?: string
          line_total: number
          order_id: string
          price_override_reason?: string | null
          quantity: number
          unit_price: number
          variant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_price?: number | null
          id?: string
          line_total?: number
          order_id?: string
          price_override_reason?: string | null
          quantity?: number
          unit_price?: number
          variant_id?: string
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
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
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
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
      period_locks: {
        Row: {
          company_id: string
          lock_end_date: string
          updated_at: string
        }
        Insert: {
          company_id: string
          lock_end_date: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          lock_end_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
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
      product_variants: {
        Row: {
          active: boolean
          allow_fractional: boolean
          barcode: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          name: string
          price: number
          product_id: string
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
          kind?: string
          name: string
          price: number
          product_id: string
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
          kind?: string
          name?: string
          price?: number
          product_id?: string
          sku?: string
          track_inventory?: boolean
          updated_at?: string
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          company_id: string
          created_at: string
          id: string
          image_path: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          company_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          company_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          name?: string
          updated_at?: string
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
      purchase_payments: {
        Row: {
          account_code: string
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          purchase_id: string
        }
        Insert: {
          account_code: string
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id: string
        }
        Update: {
          account_code?: string
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_credit: boolean
          reference: string | null
          supplier_id: string
          total_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_credit?: boolean
          reference?: string | null
          supplier_id: string
          total_cost: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_credit?: boolean
          reference?: string | null
          supplier_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      reconciliation_accounts: {
        Row: {
          account_code: string
          declared: number
          expected: number
          id: string
          reconciliation_id: string
          variance: number
        }
        Insert: {
          account_code: string
          declared: number
          expected: number
          id?: string
          reconciliation_id: string
          variance: number
        }
        Update: {
          account_code?: string
          declared?: number
          expected?: number
          id?: string
          reconciliation_id?: string
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_accounts_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          scope: string
          scope_ref_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          scope: string
          scope_ref_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          scope?: string
          scope_ref_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_company_id_fkey"
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
      customer_ar_balances: {
        Row: {
          balance: number | null
          company_id: string | null
          customer_id: string | null
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
      expiring_batches: {
        Row: {
          batch_id: string | null
          company_id: string | null
          expiry_date: string | null
          product_name: string | null
          remaining: number | null
          variant_id: string | null
          variant_name: string | null
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
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      low_stock_variants: {
        Row: {
          company_id: string | null
          low_stock_threshold: number | null
          product_name: string | null
          stock: number | null
          variant_id: string | null
          variant_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_daily_customer_stats: {
        Row: {
          ar_delta: number | null
          company_id: string | null
          customer_id: string | null
          day: string | null
          orders: number | null
          revenue: number | null
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
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      mv_daily_order_stats: {
        Row: {
          company_id: string | null
          day: string | null
          method_code: string | null
          method_total: number | null
          orders: number | null
          status: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_daily_product_sales: {
        Row: {
          cogs: number | null
          company_id: string | null
          day: string | null
          quantity: number | null
          revenue: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_daily_sales_summary: {
        Row: {
          cogs: number | null
          company_id: string | null
          day: string | null
          margin: number | null
          orders: number | null
          revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          company_id: string | null
          stock: number | null
          stock_value: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rpt_daily_customer_stats: {
        Row: {
          ar_delta: number | null
          company_id: string | null
          customer_id: string | null
          day: string | null
          orders: number | null
          revenue: number | null
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
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      rpt_daily_order_stats: {
        Row: {
          company_id: string | null
          day: string | null
          method_code: string | null
          method_total: number | null
          orders: number | null
          status: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rpt_daily_product_sales: {
        Row: {
          cogs: number | null
          company_id: string | null
          day: string | null
          quantity: number | null
          revenue: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rpt_daily_sales_summary: {
        Row: {
          cogs: number | null
          company_id: string | null
          day: string | null
          margin: number | null
          orders: number | null
          revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ap_balances: {
        Row: {
          balance: number | null
          company_id: string | null
          supplier_id: string | null
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
      variant_catalog: {
        Row: {
          allow_fractional: boolean | null
          barcode: string | null
          company_id: string | null
          image_path: string | null
          kind: string | null
          price: number | null
          product_active: boolean | null
          product_id: string | null
          product_name: string | null
          sku: string | null
          stock: number | null
          track_inventory: boolean | null
          variant_active: boolean | null
          variant_id: string | null
          variant_name: string | null
          wholesale_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_balance: {
        Args: { p_code: string; p_company_id: string }
        Returns: number
      }
      add_team_member: {
        Args: { p_phone: string; p_role_id: string }
        Returns: string
      }
      close_accounting_period: { Args: { p_end_date: string }; Returns: string }
      close_cashier_session: {
        Args: { p_declarations: Json; p_session_id: string }
        Returns: string
      }
      complete_order: {
        Args: { p_actor: string; p_order_id: string; p_payments: Json }
        Returns: string
      }
      consume_fifo: {
        Args: {
          p_company_id: string
          p_movement_type?: string
          p_quantity: number
          p_source_id: string
          p_source_type: string
          p_variant_id: string
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
          p_is_supplier?: boolean
          p_last_name?: string
          p_phone?: string
        }
        Returns: string
      }
      create_product: {
        Args: { p_barcode?: string; p_image_path?: string; p_name: string }
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
      open_cashier_session: { Args: { p_declarations: Json }; Returns: string }
      pay_supplier: {
        Args: {
          p_account_code: string
          p_amount: number
          p_supplier_id: string
        }
        Returns: string
      }
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
      post_inventory_adjustment: {
        Args: { p_reason: string; p_value_change: number; p_variant_id: string }
        Returns: string
      }
      post_inventory_write_off: {
        Args: { p_quantity: number; p_reason: string; p_variant_id: string }
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
      post_variance_adjustment: {
        Args: {
          p_account_code: string
          p_company_id: string
          p_count_id: string
          p_declared: number
          p_reason?: string
          p_session_id: string
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
      record_manual_reconciliation: {
        Args: { p_declarations: Json }
        Returns: string
      }
      record_mpesa_verification: {
        Args: {
          p_all_confirmed: boolean
          p_flagged_ids?: Json
          p_notes?: string
          p_session_id: string
        }
        Returns: string
      }
      record_purchase: {
        Args: {
          p_account_code?: string
          p_is_credit: boolean
          p_lines: Json
          p_reference?: string
          p_supplier_id: string
        }
        Returns: string
      }
      refresh_analytics: { Args: never; Returns: undefined }
      remove_team_member: { Args: { p_membership_id: string }; Returns: string }
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
      update_customer: {
        Args: {
          p_customer_id: string
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_notes?: string
          p_phone?: string
        }
        Returns: string
      }
      update_customer_credit: {
        Args: {
          p_credit_limit: number
          p_customer_id: string
          p_is_approved: boolean
          p_terms_days?: number
        }
        Returns: string
      }
      update_product: {
        Args: {
          p_active?: boolean
          p_barcode?: string
          p_image_path?: string
          p_name?: string
          p_product_id: string
        }
        Returns: string
      }
      update_team_member: {
        Args: {
          p_authorization_status?: string
          p_membership_id: string
          p_role_id?: string
        }
        Returns: string
      }
      upsert_role: {
        Args: { p_name: string; p_permissions: string[]; p_role_id?: string }
        Returns: string
      }
      upsert_variant: {
        Args: {
          p_active?: boolean
          p_allow_fractional?: boolean
          p_barcode?: string
          p_kind?: string
          p_name: string
          p_price: number
          p_product_id: string
          p_sku?: string
          p_track_inventory?: boolean
          p_variant_id?: string
          p_wholesale_price?: number
        }
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

