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
          {
            foreignKeyName: "accounting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          due_at: string | null
          id: string
          metadata: Json
          requested_by: string | null
          result: Json | null
          status: string
          subject_id: string | null
          subject_type: string | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          requested_by?: string | null
          result?: Json | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          requested_by?: string | null
          result?: Json | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
      auth_otp_delivery_requests: {
        Row: {
          checked_at: string | null
          created_at: string
          id: string
          phone_hash: string
          phone_suffix: string
          sms_request_id: number | null
          sms_status: string | null
          whatsapp_request_id: number | null
          whatsapp_status: string | null
        }
        Insert: {
          checked_at?: string | null
          created_at?: string
          id?: string
          phone_hash: string
          phone_suffix: string
          sms_request_id?: number | null
          sms_status?: string | null
          whatsapp_request_id?: number | null
          whatsapp_status?: string | null
        }
        Update: {
          checked_at?: string | null
          created_at?: string
          id?: string
          phone_hash?: string
          phone_suffix?: string
          sms_request_id?: number | null
          sms_status?: string | null
          whatsapp_request_id?: number | null
          whatsapp_status?: string | null
        }
        Relationships: []
      }
      cache_change_log: {
        Row: {
          changed_at: string
          company_id: string
          entity_id: string
          entity_type: string
          location_id: string | null
          operation: string
          sequence: number
          stream: string
          user_id: string | null
        }
        Insert: {
          changed_at?: string
          company_id: string
          entity_id: string
          entity_type: string
          location_id?: string | null
          operation: string
          sequence: number
          stream: string
          user_id?: string | null
        }
        Update: {
          changed_at?: string
          company_id?: string
          entity_id?: string
          entity_type?: string
          location_id?: string | null
          operation?: string
          sequence?: number
          stream?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cache_change_log_company_id_stream_fkey"
            columns: ["company_id", "stream"]
            isOneToOne: false
            referencedRelation: "cache_stream_heads"
            referencedColumns: ["company_id", "stream"]
          },
        ]
      }
      cache_stream_heads: {
        Row: {
          company_id: string
          head_sequence: number
          pruned_through_sequence: number
          stream: string
          updated_at: string
        }
        Insert: {
          company_id: string
          head_sequence?: number
          pruned_through_sequence?: number
          stream: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          head_sequence?: number
          pruned_through_sequence?: number
          stream?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cache_stream_heads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cache_stream_heads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          company_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          outbox_id: string | null
          recipient: string | null
          rendered_body: string | null
          skip_reason: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          outbox_id?: string | null
          recipient?: string | null
          rendered_body?: string | null
          skip_reason?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          outbox_id?: string | null
          recipient?: string | null
          rendered_body?: string | null
          skip_reason?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "campaign_recipients_outbox_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "outbox"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "cash_drawer_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          location_id: string
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
          location_id: string
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
          location_id?: string
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
          {
            foreignKeyName: "cashier_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashier_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_export_markers: {
        Row: {
          actor: string | null
          company_id: string
          exported_at: string
          id: string
        }
        Insert: {
          actor?: string | null
          company_id: string
          exported_at?: string
          id?: string
        }
        Update: {
          actor?: string | null
          company_id?: string
          exported_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_export_markers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_export_markers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_chunks: {
        Row: {
          chunk_index: number
          company_id: string
          created_at: string
          import_id: string
          product_count: number
          products: Json
          variant_count: number
        }
        Insert: {
          chunk_index: number
          company_id: string
          created_at?: string
          import_id: string
          product_count: number
          products: Json
          variant_count: number
        }
        Update: {
          chunk_index?: number
          company_id?: string
          created_at?: string
          import_id?: string
          product_count?: number
          products?: Json
          variant_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_chunks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_chunks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_chunks_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "catalog_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_staged_products: {
        Row: {
          chunk_index: number
          company_id: string
          data: Json
          import_id: string
          product_id: string | null
          product_index: number
        }
        Insert: {
          chunk_index: number
          company_id: string
          data: Json
          import_id: string
          product_id?: string | null
          product_index: number
        }
        Update: {
          chunk_index?: number
          company_id?: string
          data?: Json
          import_id?: string
          product_id?: string | null
          product_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_staged_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_staged_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_staged_products_import_id_chunk_index_fkey"
            columns: ["import_id", "chunk_index"]
            isOneToOne: false
            referencedRelation: "catalog_import_chunks"
            referencedColumns: ["import_id", "chunk_index"]
          },
          {
            foreignKeyName: "catalog_import_staged_products_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "catalog_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_staged_variants: {
        Row: {
          chunk_index: number
          company_id: string
          data: Json
          import_id: string
          product_id: string | null
          product_index: number
          variant_id: string | null
          variant_index: number
        }
        Insert: {
          chunk_index: number
          company_id: string
          data: Json
          import_id: string
          product_id?: string | null
          product_index: number
          variant_id?: string | null
          variant_index: number
        }
        Update: {
          chunk_index?: number
          company_id?: string
          data?: Json
          import_id?: string
          product_id?: string | null
          product_index?: number
          variant_id?: string | null
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_staged_variant_import_id_chunk_index_produc_fkey"
            columns: ["import_id", "chunk_index", "product_index"]
            isOneToOne: false
            referencedRelation: "catalog_import_staged_products"
            referencedColumns: ["import_id", "chunk_index", "product_index"]
          },
          {
            foreignKeyName: "catalog_import_staged_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_staged_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_staged_variants_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "catalog_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_imports: {
        Row: {
          actor: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          mode: string
          result: Json | null
          source_export_id: string | null
          source_exported_at: string | null
          status: string
        }
        Insert: {
          actor?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          mode: string
          result?: Json | null
          source_export_id?: string | null
          source_exported_at?: string | null
          status?: string
        }
        Update: {
          actor?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          mode?: string
          result?: Json | null
          source_export_id?: string | null
          source_exported_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_imports_source_export_id_fkey"
            columns: ["source_export_id"]
            isOneToOne: false
            referencedRelation: "catalog_export_markers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_search_documents: {
        Row: {
          barcode_normalized: string | null
          company_id: string
          product_id: string
          search_text: string
          search_vector: unknown
          sku_normalized: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          barcode_normalized?: string | null
          company_id: string
          product_id: string
          search_text: string
          search_vector?: unknown
          sku_normalized: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          barcode_normalized?: string | null
          company_id?: string
          product_id?: string
          search_text?: string
          search_vector?: unknown
          sku_normalized?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_search_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_search_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_search_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_search_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_search_documents_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "catalog_search_documents_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "catalog_search_documents_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_search_documents_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      collections: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_assignments: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          plan_id: string
          staff_user_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          plan_id: string
          staff_user_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          plan_id?: string
          staff_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commission_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_lines: {
        Row: {
          basis_amount: number
          commission_amount: number
          company_id: string
          created_at: string
          created_by: string | null
          event_key: string
          event_type: string
          id: string
          occurred_on: string
          order_id: string | null
          period_id: string
          plan_id: string | null
          rate_bps: number
          reason: string | null
          staff_name: string
          staff_user_id: string
        }
        Insert: {
          basis_amount: number
          commission_amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          event_key: string
          event_type: string
          id?: string
          occurred_on: string
          order_id?: string | null
          period_id: string
          plan_id?: string | null
          rate_bps: number
          reason?: string | null
          staff_name: string
          staff_user_id: string
        }
        Update: {
          basis_amount?: number
          commission_amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_key?: string
          event_type?: string
          id?: string
          occurred_on?: string
          order_id?: string | null
          period_id?: string
          plan_id?: string | null
          rate_bps?: number
          reason?: string | null
          staff_name?: string
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commission_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_plans: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          rate_bps: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          name: string
          rate_bps: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          rate_bps?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          batch_expiry_enabled: boolean
          billing_cycle: string | null
          cash_control_enabled: boolean
          cashier_flow_enabled: boolean
          code: string
          commissions_enabled: boolean
          communication_period_end: string | null
          created_at: string
          currency: string
          customer_payment_instructions: string | null
          email: string | null
          enable_printer: boolean
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          last_payment_reference: string | null
          logo_path: string | null
          low_stock_threshold: number
          name: string
          notification_category_preferences: Json | null
          payment_reminder_channel: string
          payment_reminder_sms_fallback: boolean
          payment_reminders_enabled: boolean
          paystack_customer_code: string | null
          paystack_subscription_code: string | null
          proforma_validity_days: number
          public_slug: string | null
          public_storefront_enabled: boolean
          public_whatsapp_number: string | null
          require_opening_count: boolean
          sms_period_end: string | null
          sms_reserved_this_period: number
          sms_usage_by_category: Json | null
          sms_used_this_period: number
          status: string
          storefront_entitlement_grace_end: string | null
          subscription_exempt_reason: string | null
          subscription_exempt_until: string | null
          subscription_expired_reminder_sent_at: string | null
          subscription_expires_at: string | null
          subscription_grace_period_end: string | null
          subscription_started_at: string | null
          subscription_status: string | null
          subscription_tier_id: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          variance_notification_threshold: number
          whatsapp_reserved_this_period: number
          whatsapp_used_this_period: number
        }
        Insert: {
          address?: string | null
          batch_expiry_enabled?: boolean
          billing_cycle?: string | null
          cash_control_enabled?: boolean
          cashier_flow_enabled?: boolean
          code: string
          commissions_enabled?: boolean
          communication_period_end?: string | null
          created_at?: string
          currency?: string
          customer_payment_instructions?: string | null
          email?: string | null
          enable_printer?: boolean
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          last_payment_reference?: string | null
          logo_path?: string | null
          low_stock_threshold?: number
          name: string
          notification_category_preferences?: Json | null
          payment_reminder_channel?: string
          payment_reminder_sms_fallback?: boolean
          payment_reminders_enabled?: boolean
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          proforma_validity_days?: number
          public_slug?: string | null
          public_storefront_enabled?: boolean
          public_whatsapp_number?: string | null
          require_opening_count?: boolean
          sms_period_end?: string | null
          sms_reserved_this_period?: number
          sms_usage_by_category?: Json | null
          sms_used_this_period?: number
          status?: string
          storefront_entitlement_grace_end?: string | null
          subscription_exempt_reason?: string | null
          subscription_exempt_until?: string | null
          subscription_expired_reminder_sent_at?: string | null
          subscription_expires_at?: string | null
          subscription_grace_period_end?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          subscription_tier_id?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          variance_notification_threshold?: number
          whatsapp_reserved_this_period?: number
          whatsapp_used_this_period?: number
        }
        Update: {
          address?: string | null
          batch_expiry_enabled?: boolean
          billing_cycle?: string | null
          cash_control_enabled?: boolean
          cashier_flow_enabled?: boolean
          code?: string
          commissions_enabled?: boolean
          communication_period_end?: string | null
          created_at?: string
          currency?: string
          customer_payment_instructions?: string | null
          email?: string | null
          enable_printer?: boolean
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          last_payment_reference?: string | null
          logo_path?: string | null
          low_stock_threshold?: number
          name?: string
          notification_category_preferences?: Json | null
          payment_reminder_channel?: string
          payment_reminder_sms_fallback?: boolean
          payment_reminders_enabled?: boolean
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          proforma_validity_days?: number
          public_slug?: string | null
          public_storefront_enabled?: boolean
          public_whatsapp_number?: string | null
          require_opening_count?: boolean
          sms_period_end?: string | null
          sms_reserved_this_period?: number
          sms_usage_by_category?: Json | null
          sms_used_this_period?: number
          status?: string
          storefront_entitlement_grace_end?: string | null
          subscription_exempt_reason?: string | null
          subscription_exempt_until?: string | null
          subscription_expired_reminder_sent_at?: string | null
          subscription_expires_at?: string | null
          subscription_grace_period_end?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          subscription_tier_id?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          variance_notification_threshold?: number
          whatsapp_reserved_this_period?: number
          whatsapp_used_this_period?: number
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
      company_legal_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          company_id: string
          document_version_id: string
          id: string
          source: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          company_id: string
          document_version_id: string
          id?: string
          source: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          company_id?: string
          document_version_id?: string
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_legal_acceptances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_legal_acceptances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_legal_acceptances_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      company_membership_locations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_primary: boolean
          location_id: string
          membership_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id: string
          membership_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_membership_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_membership_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_membership_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_membership_locations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "company_memberships"
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
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
      company_staff_profiles: {
        Row: {
          avatar_path: string | null
          company_id: string
          created_at: string
          display_name: string
          id: string
          last_role_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          company_id: string
          created_at?: string
          display_name: string
          id?: string
          last_role_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          company_id?: string
          created_at?: string
          display_name?: string
          id?: string
          last_role_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_staff_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_staff_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      company_usage_counters: {
        Row: {
          active_variants: number
          company_id: string
          reconciled_at: string
          updated_at: string
        }
        Insert: {
          active_variants?: number
          company_id: string
          reconciled_at?: string
          updated_at?: string
        }
        Update: {
          active_variants?: number
          company_id?: string
          reconciled_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_usage_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_usage_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notification_checkpoints: {
        Row: {
          bucket: string
          company_id: string
          customer_id: string
          id: string
          notified_at: string
        }
        Insert: {
          bucket: string
          company_id: string
          customer_id: string
          id?: string
          notified_at?: string
        }
        Update: {
          bucket?: string
          company_id?: string
          customer_id?: string
          id?: string
          notified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notification_checkpoints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notification_checkpoints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notification_checkpoints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_notification_checkpoints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notification_checkpoints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      customer_statement_links: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_statement_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_statement_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_statement_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_statement_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_statement_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
          deleted_at: string | null
          deleted_by: string | null
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
          sms_notifications_enabled: boolean
          supplier_active: boolean
          supplier_credit_limit: number
          supplier_credit_terms_days: number | null
          updated_at: string
          whatsapp_notifications_enabled: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          credit_approved_by?: string | null
          credit_limit?: number
          credit_terms_days?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          sms_notifications_enabled?: boolean
          supplier_active?: boolean
          supplier_credit_limit?: number
          supplier_credit_terms_days?: number | null
          updated_at?: string
          whatsapp_notifications_enabled?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          credit_approved_by?: string | null
          credit_limit?: number
          credit_terms_days?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          sms_notifications_enabled?: boolean
          supplier_active?: boolean
          supplier_credit_limit?: number
          supplier_credit_terms_days?: number | null
          updated_at?: string
          whatsapp_notifications_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          accepted: boolean
          attempt_number: number
          created_at: string
          error: string | null
          id: string
          outbox_id: string
          provider: string
          response_status: number | null
        }
        Insert: {
          accepted: boolean
          attempt_number: number
          created_at?: string
          error?: string | null
          id?: string
          outbox_id: string
          provider: string
          response_status?: number | null
        }
        Update: {
          accepted?: boolean
          attempt_number?: number
          created_at?: string
          error?: string | null
          id?: string
          outbox_id?: string
          provider?: string
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string | null
          company_id: string
          created_at: string
          expiry_date: string | null
          id: string
          purchased_at: string
          quantity: number
          remaining: number
          stock_location_id: string
          supplier_id: string | null
          unit_cost: number
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          company_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          purchased_at?: string
          quantity: number
          remaining: number
          stock_location_id: string
          supplier_id?: string | null
          unit_cost: number
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          purchased_at?: string
          quantity?: number
          remaining?: number
          stock_location_id?: string
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
            foreignKeyName: "inventory_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          actor: string | null
          batch_id: string | null
          company_id: string
          created_at: string
          id: string
          meta: Json
          quantity: number
          source_id: string | null
          source_type: string | null
          stock_location_id: string | null
          total_cost: number | null
          type: string
          unit_cost: number | null
          variant_id: string
        }
        Insert: {
          actor?: string | null
          batch_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          meta?: Json
          quantity: number
          source_id?: string | null
          source_type?: string | null
          stock_location_id?: string | null
          total_cost?: number | null
          type: string
          unit_cost?: number | null
          variant_id: string
        }
        Update: {
          actor?: string | null
          batch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          meta?: Json
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          stock_location_id?: string | null
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
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
          allow_manual_posting: boolean
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
          allow_manual_posting?: boolean
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
          allow_manual_posting?: boolean
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
            foreignKeyName: "ledger_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
            foreignKeyName: "ledger_journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
            foreignKeyName: "ledger_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_entry_company_fkey"
            columns: ["entry_id", "company_id"]
            isOneToOne: false
            referencedRelation: "ledger_journal_entries"
            referencedColumns: ["id", "company_id"]
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
      legal_document_versions: {
        Row: {
          content_markdown: string | null
          content_sha256: string
          created_at: string
          created_by: string | null
          document_type: string
          effective_at: string
          enforcement_at: string | null
          id: string
          publication_state: string
          published_at: string | null
          published_by: string | null
          requires_company_acceptance: boolean
          updated_at: string
          version: string
        }
        Insert: {
          content_markdown?: string | null
          content_sha256: string
          created_at?: string
          created_by?: string | null
          document_type: string
          effective_at: string
          enforcement_at?: string | null
          id?: string
          publication_state?: string
          published_at?: string | null
          published_by?: string | null
          requires_company_acceptance?: boolean
          updated_at?: string
          version: string
        }
        Update: {
          content_markdown?: string | null
          content_sha256?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          effective_at?: string
          enforcement_at?: string | null
          id?: string
          publication_state?: string
          published_at?: string | null
          published_by?: string | null
          requires_company_acceptance?: boolean
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      location_payment_methods: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          is_cashier_controlled: boolean | null
          ledger_account_code: string | null
          location_id: string
          payment_method_id: string
          requires_reconciliation: boolean | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_cashier_controlled?: boolean | null
          ledger_account_code?: string | null
          location_id: string
          payment_method_id: string
          requires_reconciliation?: boolean | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_cashier_controlled?: boolean | null
          ledger_account_code?: string | null
          location_id?: string
          payment_method_id?: string
          requires_reconciliation?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_methods_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_methods_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          normalized_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          normalized_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaigns: {
        Row: {
          audience: string
          audience_config: Json
          body: string
          channel: string
          company_id: string | null
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          name: string
          recipient_count: number
          scope: string
          sent_at: string | null
          sent_count: number
          skipped_count: number
          status: string
          template_id: string | null
          template_version: number | null
          title: string | null
        }
        Insert: {
          audience: string
          audience_config?: Json
          body: string
          channel: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name: string
          recipient_count?: number
          scope: string
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          template_id?: string | null
          template_version?: number | null
          title?: string | null
        }
        Update: {
          audience?: string
          audience_config?: Json
          body?: string
          channel?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name?: string
          recipient_count?: number
          scope?: string
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          template_id?: string | null
          template_version?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          active: boolean
          company_id: string | null
          context: string
          created_at: string
          created_by: string | null
          id: string
          in_app_body: string | null
          in_app_title: string | null
          is_system: boolean
          name: string
          sms_body: string | null
          template_key: string
          updated_at: string
          version: number
          whatsapp_body: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          context: string
          created_at?: string
          created_by?: string | null
          id?: string
          in_app_body?: string | null
          in_app_title?: string | null
          is_system?: boolean
          name: string
          sms_body?: string | null
          template_key: string
          updated_at?: string
          version?: number
          whatsapp_body?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          context?: string
          created_at?: string
          created_by?: string | null
          id?: string
          in_app_body?: string | null
          in_app_title?: string | null
          is_system?: boolean
          name?: string
          sms_body?: string | null
          template_key?: string
          updated_at?: string
          version?: number
          whatsapp_body?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          location_id: string | null
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
          location_id?: string | null
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
          location_id?: string | null
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
            foreignKeyName: "mpesa_verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_verifications_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
            foreignKeyName: "order_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          credit_due_at: string | null
          customer_id: string | null
          expires_at: string
          id: string
          is_credit_sale: boolean
          location_id: string
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
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_due_at?: string | null
          customer_id?: string | null
          expires_at: string
          id?: string
          is_credit_sale?: boolean
          location_id: string
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
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_due_at?: string | null
          customer_id?: string | null
          expires_at?: string
          id?: string
          is_credit_sale?: boolean
          location_id?: string
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
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox: {
        Row: {
          attempts: number
          body: string
          campaign_id: string | null
          campaign_recipient_id: string | null
          channel: string
          company_id: string
          created_at: string
          customer_id: string | null
          error: string | null
          fallback_body: string | null
          fallback_channel: string | null
          fallback_for_outbox_id: string | null
          id: string
          max_attempts: number
          quota_state: string
          quota_units: number
          recipient: string
          scheduled_after: string
          sent_at: string | null
          source: string
          status: string
          subject: string | null
          template_key: string | null
          template_version: number | null
        }
        Insert: {
          attempts?: number
          body: string
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          channel: string
          company_id: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          fallback_body?: string | null
          fallback_channel?: string | null
          fallback_for_outbox_id?: string | null
          id?: string
          max_attempts?: number
          quota_state?: string
          quota_units?: number
          recipient: string
          scheduled_after?: string
          sent_at?: string | null
          source?: string
          status?: string
          subject?: string | null
          template_key?: string | null
          template_version?: number | null
        }
        Update: {
          attempts?: number
          body?: string
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          channel?: string
          company_id?: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          fallback_body?: string | null
          fallback_channel?: string | null
          fallback_for_outbox_id?: string | null
          id?: string
          max_attempts?: number
          quota_state?: string
          quota_units?: number
          recipient?: string
          scheduled_after?: string
          sent_at?: string | null
          source?: string
          status?: string
          subject?: string | null
          template_key?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outbox_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "outbox_fallback_for_outbox_id_fkey"
            columns: ["fallback_for_outbox_id"]
            isOneToOne: false
            referencedRelation: "outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          availability_scope: string
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
          availability_scope?: string
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
          availability_scope?: string
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
          {
            foreignKeyName: "payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminder_rules: {
        Row: {
          company_id: string
          enabled: boolean
          id: string
          stage_days: number
          template_key: string
        }
        Insert: {
          company_id: string
          enabled?: boolean
          id?: string
          stage_days: number
          template_key: string
        }
        Update: {
          company_id?: string
          enabled?: boolean
          id?: string
          stage_days?: number
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminder_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminder_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          location_id: string
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
          location_id: string
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
          location_id?: string
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
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
          {
            foreignKeyName: "period_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "public_storefronts"
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
      platform_billing_settings: {
        Row: {
          default_trial_tier_id: string
          singleton: boolean
          trial_duration_days: number
          updated_at: string
        }
        Insert: {
          default_trial_tier_id: string
          singleton?: boolean
          trial_duration_days?: number
          updated_at?: string
        }
        Update: {
          default_trial_tier_id?: string
          singleton?: boolean
          trial_duration_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_settings_default_trial_tier_id_fkey"
            columns: ["default_trial_tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: string
          company_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          collection_id: string
          company_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          collection_id?: string
          company_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["product_id"]
          },
        ]
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
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          manufacturer_id: string | null
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
          manufacturer_id?: string | null
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
          manufacturer_id?: string | null
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
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_manufacturer_company_fkey"
            columns: ["company_id", "manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      purchase_drafts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          lines: Json
          notes: string | null
          posted_purchase_id: string | null
          purchase_date: string
          reference: string | null
          status: string
          supplier_id: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lines: Json
          notes?: string | null
          posted_purchase_id?: string | null
          purchase_date?: string
          reference?: string | null
          status?: string
          supplier_id: string
          total_cost: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lines?: Json
          notes?: string | null
          posted_purchase_id?: string | null
          purchase_date?: string
          reference?: string | null
          status?: string
          supplier_id?: string
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_drafts_posted_purchase_id_fkey"
            columns: ["posted_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_drafts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "purchase_drafts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_drafts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          batch_number: string | null
          company_id: string
          created_at: string
          expiry_date: string | null
          id: string
          inventory_batch_id: string | null
          line_total: number
          purchase_id: string
          quantity: number
          unit_cost: number
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          company_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_batch_id?: string | null
          line_total: number
          purchase_id: string
          quantity: number
          unit_cost: number
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_batch_id?: string | null
          line_total?: number
          purchase_id?: string
          quantity?: number
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_inventory_batch_id_fkey"
            columns: ["inventory_batch_id"]
            isOneToOne: false
            referencedRelation: "expiring_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "purchase_lines_inventory_batch_id_fkey"
            columns: ["inventory_batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
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
            foreignKeyName: "purchase_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          notes: string | null
          purchase_date: string
          reference: string | null
          stock_location_id: string
          supplier_id: string
          total_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_credit?: boolean
          notes?: string | null
          purchase_date?: string
          reference?: string | null
          stock_location_id: string
          supplier_id: string
          total_cost: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_credit?: boolean
          notes?: string | null
          purchase_date?: string
          reference?: string | null
          stock_location_id?: string
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
            foreignKeyName: "purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
          reviewed_at: string | null
          reviewed_by: string | null
          variance: number
        }
        Insert: {
          account_code: string
          declared: number
          expected: number
          id?: string
          reconciliation_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          variance: number
        }
        Update: {
          account_code?: string
          declared?: number
          expected?: number
          id?: string
          reconciliation_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          location_id: string | null
          scope: string
          scope_ref_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          scope: string
          scope_ref_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
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
          {
            foreignKeyName: "reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
          location_id: string
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
          location_id: string
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
          location_id?: string
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
            foreignKeyName: "refunds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
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
          {
            foreignKeyName: "stock_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          company_id: string
          created_at: string
          destination_batch_id: string
          id: string
          quantity: number
          source_batch_id: string
          transfer_id: string
          unit_cost: number
          variant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          destination_batch_id: string
          id?: string
          quantity: number
          source_batch_id: string
          transfer_id: string
          unit_cost: number
          variant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          destination_batch_id?: string
          id?: string
          quantity?: number
          source_batch_id?: string
          transfer_id?: string
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_destination_batch_id_fkey"
            columns: ["destination_batch_id"]
            isOneToOne: false
            referencedRelation: "expiring_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_destination_batch_id_fkey"
            columns: ["destination_batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "expiring_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          notes: string | null
          status: string
          to_location_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          from_location_id: string
          id?: string
          notes?: string | null
          status?: string
          to_location_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          from_location_id?: string
          id?: string
          notes?: string | null
          status?: string
          to_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_tiers: {
        Row: {
          code: string
          commissions_available: boolean
          created_at: string
          customer_campaigns_available: boolean
          id: string
          is_active: boolean
          max_orders_per_month: number | null
          max_products: number
          max_stock_locations: number | null
          max_team_members: number | null
          multiple_locations_enabled: boolean
          name: string
          payment_reminders_available: boolean
          price_monthly: number
          price_yearly: number
          sms_per_period: number | null
          staff_performance_enabled: boolean
          storefront_available: boolean
          updated_at: string
          whatsapp_per_period: number | null
        }
        Insert: {
          code: string
          commissions_available?: boolean
          created_at?: string
          customer_campaigns_available?: boolean
          id?: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_products?: number
          max_stock_locations?: number | null
          max_team_members?: number | null
          multiple_locations_enabled?: boolean
          name: string
          payment_reminders_available?: boolean
          price_monthly: number
          price_yearly: number
          sms_per_period?: number | null
          staff_performance_enabled?: boolean
          storefront_available?: boolean
          updated_at?: string
          whatsapp_per_period?: number | null
        }
        Update: {
          code?: string
          commissions_available?: boolean
          created_at?: string
          customer_campaigns_available?: boolean
          id?: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_products?: number
          max_stock_locations?: number | null
          max_team_members?: number | null
          multiple_locations_enabled?: boolean
          name?: string
          payment_reminders_available?: boolean
          price_monthly?: number
          price_yearly?: number
          sms_per_period?: number | null
          staff_performance_enabled?: boolean
          storefront_available?: boolean
          updated_at?: string
          whatsapp_per_period?: number | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          active_company_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_company_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_company_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_aging: {
        Row: {
          balance: number | null
          bucket: string | null
          company_id: string | null
          customer_id: string | null
          days_outstanding: number | null
          oldest_unpaid_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
            foreignKeyName: "inventory_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      public_storefronts: {
        Row: {
          catalogue_visible: boolean | null
          id: string | null
          logo_path: string | null
          name: string | null
          public_whatsapp_number: string | null
          slug: string | null
        }
        Insert: {
          catalogue_visible?: never
          id?: string | null
          logo_path?: string | null
          name?: string | null
          public_whatsapp_number?: string | null
          slug?: string | null
        }
        Update: {
          catalogue_visible?: never
          id?: string | null
          logo_path?: string | null
          name?: string | null
          public_whatsapp_number?: string | null
          slug?: string | null
        }
        Relationships: []
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
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ap_aging: {
        Row: {
          balance: number | null
          bucket: string | null
          company_id: string | null
          days_outstanding: number | null
          oldest_unpaid_date: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_variant_performance: {
        Row: {
          average_unit_cost: number | null
          company_id: string | null
          highest_unit_cost: number | null
          last_purchase_date: string | null
          last_unit_cost: number | null
          lowest_unit_cost: number | null
          purchase_count: number | null
          supplier_id: string | null
          total_quantity: number | null
          total_spend: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
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
      variant_catalog: {
        Row: {
          allow_fractional: boolean | null
          barcode: string | null
          company_id: string | null
          image_path: string | null
          kind: string | null
          manufacturer_id: string | null
          manufacturer_name: string | null
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
          {
            foreignKeyName: "product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_company_terms: {
        Args: { p_content_sha256: string; p_source?: string; p_version: string }
        Returns: string
      }
      accessible_business_locations: {
        Args: never
        Returns: {
          code: string
          id: string
          is_default: boolean
          is_primary: boolean
          name: string
        }[]
      }
      account_balance: {
        Args: { p_code: string; p_company_id: string }
        Returns: number
      }
      activate_subscription: {
        Args: {
          p_amount: number
          p_billing_cycle: string
          p_company_id: string
          p_reference: string
          p_tier_id: string
        }
        Returns: string
      }
      add_commission_adjustment: {
        Args: {
          p_commission_amount: number
          p_period_id: string
          p_reason: string
          p_staff_user_id: string
        }
        Returns: string
      }
      add_team_member: {
        Args: { p_phone: string; p_role_id: string }
        Returns: string
      }
      append_catalog_import_chunk: {
        Args: { p_chunk_index: number; p_import_id: string; p_products: Json }
        Returns: Json
      }
      apply_role_template: { Args: { p_template_id: string }; Returns: string }
      approve_request: {
        Args: { p_approval_id: string; p_reason?: string }
        Returns: string
      }
      assert_approval_authority: {
        Args: { p_type: string }
        Returns: undefined
      }
      assert_entitled: {
        Args: { p_check?: string; p_company_id: string }
        Returns: undefined
      }
      assert_platform_admin: { Args: never; Returns: undefined }
      assign_commission_plan: {
        Args: {
          p_assignment_id?: string
          p_effective_from: string
          p_effective_to?: string
          p_plan_id: string
          p_staff_user_id: string
        }
        Returns: string
      }
      available_payment_methods: {
        Args: { p_location_id?: string }
        Returns: {
          code: string
          is_cashier_controlled: boolean
          ledger_account_code: string
          name: string
          reconciliation_type: string
          requires_reconciliation: boolean
        }[]
      }
      begin_catalog_import: {
        Args: {
          p_idempotency_key?: string
          p_mode?: string
          p_source_export_id?: string
        }
        Returns: Json
      }
      campaign_preview: {
        Args: {
          p_audience?: string
          p_body: string
          p_channel: string
          p_customer_ids?: string[]
        }
        Returns: Json
      }
      can_approve_request_type: { Args: { p_type: string }; Returns: boolean }
      cancel_purchase_draft: { Args: { p_draft_id: string }; Returns: string }
      cashier_session_required_for_source: {
        Args: { p_source_type: string }
        Returns: boolean
      }
      catalog_cache_entities: {
        Args: { p_product_ids?: string[]; p_variant_ids?: string[] }
        Returns: Json
      }
      catalog_cache_families: {
        Args: { p_after_product_id?: string; p_limit?: number }
        Returns: {
          active: boolean
          barcode: string | null
          company_id: string
          created_at: string
          id: string
          image_path: string | null
          manufacturer_id: string | null
          name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      catalog_cache_page: {
        Args: { p_after_variant_id?: string; p_limit?: number }
        Returns: {
          allow_fractional: boolean
          barcode: string
          company_id: string
          image_path: string
          kind: string
          manufacturer_id: string
          manufacturer_name: string
          price: number
          product_active: boolean
          product_id: string
          product_name: string
          sku: string
          stock: number
          track_inventory: boolean
          variant_active: boolean
          variant_id: string
          variant_name: string
          wholesale_price: number
        }[]
      }
      catalog_management_page: {
        Args: {
          p_direction?: string
          p_location_id?: string
          p_manufacturer?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status?: string
          p_stock_status?: string
        }
        Returns: Json
      }
      change_customer_credit: {
        Args: {
          p_credit_limit: number
          p_customer_id: string
          p_is_approved: boolean
          p_reason: string
          p_terms_days: number
        }
        Returns: Json
      }
      cleanup_abandoned_catalog_imports: { Args: never; Returns: number }
      close_accounting_period: { Args: { p_end_date: string }; Returns: string }
      close_cashier_session: {
        Args: { p_declarations: Json; p_session_id: string }
        Returns: string
      }
      close_cashier_session_at_location: {
        Args: {
          p_declarations: Json
          p_location_id: string
          p_session_id: string
        }
        Returns: string
      }
      commission_period_statement: {
        Args: { p_period_id: string }
        Returns: {
          basis_total: number
          commission_total: number
          event_count: number
          staff_name: string
          staff_user_id: string
        }[]
      }
      commissions_available: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      company_subscription_accessible: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      complete_order: {
        Args: { p_actor: string; p_order_id: string; p_payments: Json }
        Returns: string
      }
      confirm_purchase_draft: {
        Args: {
          p_account_code?: string
          p_draft_id: string
          p_is_credit: boolean
          p_stock_location_id?: string
        }
        Returns: string
      }
      confirm_purchase_draft_with_payment: {
        Args: {
          p_account_code?: string
          p_draft_id: string
          p_payment_amount: number
          p_stock_location_id?: string
        }
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
      create_approval: {
        Args: {
          p_company_id: string
          p_due_at?: string
          p_metadata: Json
          p_type: string
        }
        Returns: string
      }
      create_catalog_product: {
        Args: {
          p_barcode?: string
          p_image_path?: string
          p_name: string
          p_variants: Json
        }
        Returns: string
      }
      create_catalog_product_with_manufacturer: {
        Args: {
          p_barcode?: string
          p_image_path?: string
          p_manufacturer_id?: string
          p_name: string
          p_variants: Json
        }
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
      create_message_campaign: {
        Args: {
          p_audience?: string
          p_body: string
          p_channel: string
          p_customer_ids?: string[]
          p_name: string
          p_template_id?: string
        }
        Returns: string
      }
      create_product: {
        Args: { p_barcode?: string; p_image_path?: string; p_name: string }
        Returns: string
      }
      create_product_with_variants: {
        Args: {
          p_barcode?: string
          p_image_path?: string
          p_name: string
          p_variants: Json
        }
        Returns: string
      }
      create_stock_location: {
        Args: { p_code: string; p_is_default?: boolean; p_name: string }
        Returns: string
      }
      credit_reminder_scan: { Args: never; Returns: number }
      current_access_snapshot: { Args: never; Returns: Json }
      current_company_id: { Args: never; Returns: string }
      current_company_legal_status: { Args: never; Returns: Json }
      current_entitlements: { Args: never; Returns: Json }
      current_role_name: { Args: never; Returns: string }
      current_user_can_access_location: {
        Args: { p_location_id: string }
        Returns: boolean
      }
      current_user_has_permission: {
        Args: { p_permission: string }
        Returns: boolean
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dashboard_location_snapshot: {
        Args: { p_location_id?: string; p_since?: string }
        Returns: Json
      }
      dashboard_sales_snapshot: { Args: { p_since?: string }; Returns: Json }
      delete_proforma: { Args: { p_order_id: string }; Returns: string }
      delete_stock_location: {
        Args: { p_location_id: string }
        Returns: string
      }
      deny_request: {
        Args: { p_approval_id: string; p_reason?: string }
        Returns: string
      }
      do_void: {
        Args: { p_order_id: string; p_reason: string }
        Returns: string
      }
      emit_cache_change: {
        Args: {
          p_company_id: string
          p_entity_id: string
          p_entity_type: string
          p_location_id?: string
          p_operation?: string
          p_stream: string
          p_user_id?: string
        }
        Returns: number
      }
      emit_cache_reset: {
        Args: { p_company_id: string; p_stream: string }
        Returns: number
      }
      execute_payment_reversal: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: string
      }
      execute_refund: {
        Args: {
          p_amount: number
          p_method_code: string
          p_order_id: string
          p_reason?: string
        }
        Returns: string
      }
      expire_approval_request: {
        Args: {
          p_approval_id: string
          p_reason: string
          p_void_held_order?: boolean
        }
        Returns: undefined
      }
      expire_proformas: { Args: never; Returns: number }
      feature_enabled: {
        Args: { p_company_id: string; p_feature: string }
        Returns: boolean
      }
      finalize_catalog_import: { Args: { p_import_id: string }; Returns: Json }
      finalize_message_quota: {
        Args: { p_accepted: boolean; p_outbox_id: string }
        Returns: undefined
      }
      flush_outbox_trigger: { Args: never; Returns: undefined }
      generate_commission_period: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: string
      }
      increment_sms_usage: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      is_approved_member: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      issue_customer_statement_link: {
        Args: { p_company_id: string; p_customer_id: string }
        Returns: string
      }
      legal_markdown_sha256: { Args: { p_content: string }; Returns: string }
      list_audit_actors: {
        Args: never
        Returns: {
          phone: string
          role_name: string
          user_id: string
        }[]
      }
      list_audit_events: {
        Args: {
          p_action?: string
          p_actor?: string
          p_area?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          actor_id: string
          actor_phone: string
          actor_role: string
          after_data: Json
          area: string
          before_data: Json
          entity_id: string
          entity_type: string
          event_id: string
          event_source: string
          occurred_at: string
          operation: string
          reason: string
          total_count: number
        }[]
      }
      list_commission_periods: {
        Args: never
        Returns: {
          approved_at: string
          basis_total: number
          commission_total: number
          end_date: string
          id: string
          paid_at: string
          staff_count: number
          start_date: string
          status: string
        }[]
      }
      location_stock_for_variants: {
        Args: { p_location_id: string; p_variant_ids: string[] }
        Returns: {
          stock: number
          stock_value: number
          variant_id: string
        }[]
      }
      location_stock_snapshot: {
        Args: { p_location_id?: string }
        Returns: {
          stock: number
          stock_value: number
          variant_id: string
        }[]
      }
      my_companies: {
        Args: never
        Returns: {
          code: string
          company_id: string
          is_active: boolean
          name: string
          role_name: string
        }[]
      }
      next_monthly_anniversary: {
        Args: { p_after?: string; p_anchor: string }
        Returns: string
      }
      normalize_legal_markdown: { Args: { p_content: string }; Returns: string }
      notify: {
        Args: {
          p_body?: string
          p_company_id: string
          p_link?: string
          p_title: string
          p_type: string
          p_user_id?: string
        }
        Returns: string
      }
      notify_approval_approvers: {
        Args: { p_approval_id: string }
        Returns: undefined
      }
      notify_approval_requester: {
        Args: { p_approval_id: string }
        Returns: undefined
      }
      open_cashier_session: { Args: { p_declarations: Json }; Returns: string }
      open_cashier_session_at_location: {
        Args: { p_declarations: Json; p_location_id: string }
        Returns: string
      }
      pay_purchase: {
        Args: {
          p_account_code: string
          p_amount: number
          p_purchase_id: string
        }
        Returns: string
      }
      pay_supplier: {
        Args: {
          p_account_code: string
          p_amount: number
          p_supplier_id: string
        }
        Returns: string
      }
      platform_broadcast: {
        Args: { p_body: string; p_link?: string; p_title: string }
        Returns: number
      }
      platform_campaign_preview: {
        Args: {
          p_audience?: string
          p_channel: string
          p_company_ids?: string[]
          p_subscription_status?: string
          p_tier_id?: string
        }
        Returns: Json
      }
      platform_company_legal_status: {
        Args: never
        Returns: {
          accepted_at: string
          accepted_by: string
          company_id: string
          company_name: string
          legal_status: string
          terms_version: string
        }[]
      }
      platform_discard_legal_draft: {
        Args: { p_id: string }
        Returns: undefined
      }
      platform_legal_documents: {
        Args: never
        Returns: {
          content_markdown: string | null
          content_sha256: string
          created_at: string
          created_by: string | null
          document_type: string
          effective_at: string
          enforcement_at: string | null
          id: string
          publication_state: string
          published_at: string | null
          published_by: string | null
          requires_company_acceptance: boolean
          updated_at: string
          version: string
        }[]
        SetofOptions: {
          from: "*"
          to: "legal_document_versions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      platform_operations_snapshot: { Args: never; Returns: Json }
      platform_publish_legal_document: {
        Args: { p_expected_sha256: string; p_id: string }
        Returns: Json
      }
      platform_save_legal_draft: {
        Args: {
          p_content_markdown: string
          p_document_type: string
          p_effective_at: string
          p_enforcement_at?: string
          p_id: string
          p_requires_company_acceptance?: boolean
          p_version: string
        }
        Returns: string
      }
      platform_save_tier: {
        Args: {
          p_code: string
          p_commissions_available: boolean
          p_customer_campaigns_available: boolean
          p_is_active?: boolean
          p_max_orders_per_month?: number
          p_max_products?: number
          p_max_stock_locations?: number
          p_max_team_members?: number
          p_multiple_locations_enabled: boolean
          p_name: string
          p_payment_reminders_available: boolean
          p_price_monthly: number
          p_price_yearly: number
          p_sms_per_period?: number
          p_staff_performance_enabled: boolean
          p_storefront_available: boolean
          p_tier_id?: string
          p_whatsapp_per_period?: number
        }
        Returns: string
      }
      platform_send_campaign: {
        Args: {
          p_audience?: string
          p_body: string
          p_channel: string
          p_company_ids?: string[]
          p_name: string
          p_subscription_status?: string
          p_tier_id?: string
          p_title: string
        }
        Returns: Json
      }
      platform_set_company_status: {
        Args: { p_company_id: string; p_status: string }
        Returns: string
      }
      platform_stats: { Args: never; Returns: Json }
      platform_update_billing_config: {
        Args: { p_default_trial_tier_id: string; p_trial_duration_days: number }
        Returns: Json
      }
      platform_update_subscription: {
        Args: {
          p_company_id: string
          p_exempt_reason?: string
          p_exempt_until?: string
          p_expires_at?: string
          p_subscription_status?: string
          p_tier_id?: string
        }
        Returns: string
      }
      platform_update_tier_communications: {
        Args: {
          p_customer_campaigns_available: boolean
          p_payment_reminders_available: boolean
          p_storefront_available: boolean
          p_tier_id: string
          p_whatsapp_per_period?: number
        }
        Returns: undefined
      }
      platform_upsert_message_template: {
        Args: {
          p_in_app_body: string
          p_in_app_title: string
          p_name: string
          p_sms_body: string
          p_template_id: string
          p_whatsapp_body: string
        }
        Returns: string
      }
      platform_upsert_tier: {
        Args: {
          p_code: string
          p_commissions_available: boolean
          p_is_active?: boolean
          p_max_orders_per_month?: number
          p_max_products?: number
          p_max_stock_locations?: number
          p_max_team_members?: number
          p_multiple_locations_enabled: boolean
          p_name: string
          p_price_monthly: number
          p_price_yearly: number
          p_sms_per_period?: number
          p_staff_performance_enabled: boolean
          p_tier_id?: string
        }
        Returns: string
      }
      post_balance_adjustment: {
        Args: { p_amount: number; p_customer_id: string; p_reason: string }
        Returns: string
      }
      post_customer_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_method_code: string
          p_reference?: string
        }
        Returns: Json
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
      post_payment_reversal: {
        Args: { p_payment_id: string; p_reason?: string }
        Returns: Json
      }
      post_refund: {
        Args: {
          p_amount: number
          p_method_code: string
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
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
          p_draft_id?: string
          p_lines: Json
          p_park?: boolean
          p_payments: Json
        }
        Returns: string
      }
      post_sale_at_location: {
        Args: {
          p_approval_reason?: string
          p_client_ref?: string
          p_customer_id: string
          p_draft_id?: string
          p_lines: Json
          p_location_id: string
          p_park?: boolean
          p_payments: Json
        }
        Returns: Json
      }
      post_stock_adjustment: {
        Args: {
          p_expected_quantity: number
          p_new_quantity: number
          p_reason: string
          p_unit_cost?: number
          p_variant_id: string
        }
        Returns: string
      }
      post_stock_adjustment_at_location: {
        Args: {
          p_expected_quantity: number
          p_location_id: string
          p_new_quantity: number
          p_reason: string
          p_unit_cost?: number
          p_variant_id: string
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
          p_address?: string
          p_company_name: string
          p_currency?: string
          p_email?: string
          p_store_name?: string
          p_trial_tier_code?: string
        }
        Returns: string
      }
      provision_company_base: {
        Args: {
          p_address?: string
          p_company_name: string
          p_currency?: string
          p_email?: string
          p_store_name?: string
        }
        Returns: string
      }
      provision_company_with_terms: {
        Args: {
          p_address?: string
          p_company_name: string
          p_currency?: string
          p_email?: string
          p_owner_name?: string
          p_store_name?: string
          p_terms_content_sha256?: string
          p_terms_version?: string
          p_trial_tier_code?: string
        }
        Returns: string
      }
      public_billing_config: { Args: never; Returns: Json }
      public_customer_statement: { Args: { p_token: string }; Returns: Json }
      published_legal_document: {
        Args: { p_document_type: string }
        Returns: Json
      }
      published_legal_document_history: {
        Args: { p_document_type: string }
        Returns: Json
      }
      published_legal_document_version: {
        Args: { p_document_type: string; p_version: string }
        Returns: Json
      }
      queue_batch_message: {
        Args: { p_audience?: string; p_body: string; p_channel: string }
        Returns: number
      }
      queue_message: {
        Args: {
          p_body: string
          p_channel: string
          p_company_id: string
          p_recipient: string
          p_subject?: string
        }
        Returns: string
      }
      queue_sms_fallback: { Args: { p_outbox_id: string }; Returns: string }
      reconcile_all_company_usage: { Args: never; Returns: number }
      reconcile_company_usage: {
        Args: { p_company_id?: string }
        Returns: number
      }
      record_auth_otp_delivery_request: {
        Args: {
          p_phone_hash: string
          p_phone_suffix: string
          p_sms_request_id: number
          p_sms_status: string
          p_whatsapp_request_id: number
          p_whatsapp_status: string
        }
        Returns: undefined
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
          p_notes?: string
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      record_purchase_with_payment: {
        Args: {
          p_account_code?: string
          p_lines: Json
          p_notes?: string
          p_payment_amount: number
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      record_purchase_with_prices: {
        Args: {
          p_account_code?: string
          p_is_credit: boolean
          p_lines: Json
          p_notes?: string
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      refresh_analytics: { Args: never; Returns: undefined }
      refresh_auth_otp_delivery_status: { Args: never; Returns: number }
      refresh_catalog_search_product: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      refresh_catalog_search_variant: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      remove_team_member: { Args: { p_membership_id: string }; Returns: string }
      render_message_template: {
        Args: { p_body: string; p_values: Json }
        Returns: string
      }
      request_sale_approval: {
        Args: {
          p_company_id: string
          p_metadata: Json
          p_subject_id: string
          p_subject_type: string
          p_type: string
        }
        Returns: string
      }
      require_asset_leaf_account: {
        Args: { p_code: string; p_company_id: string }
        Returns: string
      }
      require_open_cashier_session: {
        Args: { p_company_id: string }
        Returns: string
      }
      reserve_message_quota: {
        Args: { p_channel: string; p_company_id: string; p_units: number }
        Returns: undefined
      }
      reset_communication_period_locked: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      reset_message_template: {
        Args: { p_template_key: string }
        Returns: boolean
      }
      resolve_business_location: {
        Args: { p_location_id?: string }
        Returns: string
      }
      retry_failed_campaign_recipients: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      revert_variance: {
        Args: { p_reason?: string; p_recon_account_id: string }
        Returns: string
      }
      sales_collection_events: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          basis_amount: number
          event_key: string
          event_type: string
          occurred_on: string
          order_id: string
          staff_user_id: string
        }[]
      }
      save_draft: {
        Args: { p_customer_id: string; p_draft_id?: string; p_lines: Json }
        Returns: string
      }
      save_draft_at_location: {
        Args: {
          p_customer_id: string
          p_draft_id?: string
          p_lines: Json
          p_location_id: string
        }
        Returns: string
      }
      save_purchase_draft: {
        Args: {
          p_draft_id?: string
          p_lines: Json
          p_notes?: string
          p_purchase_date?: string
          p_reference?: string
          p_supplier_id: string
        }
        Returns: string
      }
      search_catalog_variants: {
        Args: { p_limit?: number; p_location_id?: string; p_query: string }
        Returns: {
          allow_fractional: boolean
          barcode: string
          company_id: string
          image_path: string
          kind: string
          manufacturer_id: string
          manufacturer_name: string
          price: number
          product_active: boolean
          product_id: string
          product_name: string
          sku: string
          stock: number
          track_inventory: boolean
          variant_active: boolean
          variant_id: string
          variant_name: string
          wholesale_price: number
        }[]
      }
      seed_default_company_roles: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      send_message_campaign: { Args: { p_campaign_id: string }; Returns: Json }
      send_sms_hook: { Args: { event: Json }; Returns: Json }
      set_campaign_status: {
        Args: { p_action: string; p_campaign_id: string }
        Returns: string
      }
      set_commissions_enabled: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      set_customer_deleted: {
        Args: { p_customer_id: string; p_deleted?: boolean }
        Returns: string
      }
      set_membership_locations: {
        Args: {
          p_location_ids: string[]
          p_membership_id: string
          p_primary_location_id: string
        }
        Returns: string
      }
      set_payment_method_locations: {
        Args: {
          p_all_locations?: boolean
          p_code: string
          p_location_ids: string[]
        }
        Returns: string
      }
      set_product_collections: {
        Args: { p_collection_ids: string[]; p_product_id: string }
        Returns: string
      }
      set_supplier_active: {
        Args: { p_active: boolean; p_supplier_id: string }
        Returns: string
      }
      settle_order: {
        Args: { p_client_ref?: string; p_order_id: string; p_payments: Json }
        Returns: string
      }
      sms_segment_count: { Args: { p_body: string }; Returns: number }
      staff_fallback_name: { Args: { p_user_id: string }; Returns: string }
      staff_sales_daily: {
        Args: { p_from: string; p_staff_user_id: string; p_to: string }
        Returns: {
          collected: number
          day: string
          gross_sales: number
          net_sales: number
          quantity: number
          refunds: number
          transactions: number
          voided_sales: number
        }[]
      }
      staff_sales_performance: {
        Args: { p_from: string; p_to: string }
        Returns: {
          authorization_status: string
          average_sale: number
          cogs: number
          collected: number
          credit_sales: number
          display_name: string
          gross_sales: number
          held_count: number
          held_value: number
          margin: number
          net_sales: number
          quantity: number
          refunds: number
          role_name: string
          staff_user_id: string
          transactions: number
          voided_sales: number
          voids: number
        }[]
      }
      start_catalog_export: { Args: never; Returns: Json }
      stock_adjustment_history: {
        Args: {
          p_limit?: number
          p_location_id: string
          p_offset?: number
          p_search?: string
          p_variant_id?: string
        }
        Returns: {
          actor_id: string
          actor_name: string
          adjusted_at: string
          adjustment_id: string
          batch_movements: number
          location_id: string
          location_name: string
          product_name: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason: string
          sku: string
          stock_value: number
          total_count: number
          variant_id: string
          variant_name: string
        }[]
      }
      storefront_catalog: {
        Args: { p_collection_id?: string; p_slug: string }
        Returns: {
          allow_fractional: boolean | null
          barcode: string | null
          company_id: string | null
          image_path: string | null
          kind: string | null
          manufacturer_id: string | null
          manufacturer_name: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "variant_catalog"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      storefront_catalogue_visible: {
        Args: { c: Database["public"]["Tables"]["companies"]["Row"] }
        Returns: boolean
      }
      storefront_collections: {
        Args: { p_slug: string }
        Returns: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "collections"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      subscription_expiry_scan: { Args: never; Returns: number }
      sync_cache_stream: {
        Args: { p_after_sequence?: number; p_limit?: number; p_stream: string }
        Returns: Json
      }
      test_message_template: {
        Args: { p_channel: string; p_recipient: string; p_template_id: string }
        Returns: string
      }
      transfer_stock: {
        Args: {
          p_from_location_id: string
          p_lines: Json
          p_notes?: string
          p_to_location_id: string
        }
        Returns: string
      }
      update_catalog_product: {
        Args: {
          p_active?: boolean
          p_barcode?: string
          p_name: string
          p_product_id: string
          p_variants: Json
        }
        Returns: string
      }
      update_catalog_product_with_manufacturer: {
        Args: {
          p_active?: boolean
          p_barcode?: string
          p_manufacturer_id?: string
          p_name: string
          p_product_id: string
          p_variants: Json
        }
        Returns: string
      }
      update_commission_period_status: {
        Args: { p_notes?: string; p_period_id: string; p_status: string }
        Returns: string
      }
      update_communication_settings: {
        Args: {
          p_channel: string
          p_payment_instructions: string
          p_reminders_enabled: boolean
          p_rules?: Json
          p_sms_fallback: boolean
        }
        Returns: undefined
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
      update_customer_communication_preferences: {
        Args: {
          p_customer_id: string
          p_enabled: boolean
          p_sms_enabled: boolean
          p_whatsapp_enabled: boolean
        }
        Returns: undefined
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
      update_my_profile: {
        Args: { p_avatar_path?: string; p_display_name?: string }
        Returns: string
      }
      update_payment_method: {
        Args: {
          p_code: string
          p_enabled?: boolean
          p_is_cashier_controlled?: boolean
          p_requires_reconciliation?: boolean
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
      update_staff_display_name: {
        Args: { p_display_name: string; p_membership_id: string }
        Returns: string
      }
      update_stock_location: {
        Args: {
          p_code: string
          p_is_default?: boolean
          p_location_id: string
          p_name: string
        }
        Returns: string
      }
      update_supplier_credit: {
        Args: {
          p_credit_limit: number
          p_supplier_id: string
          p_terms_days?: number
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
      upsert_collection: {
        Args: {
          p_active?: boolean
          p_collection_id?: string
          p_description?: string
          p_name: string
          p_slug?: string
        }
        Returns: string
      }
      upsert_commission_plan: {
        Args: {
          p_active?: boolean
          p_effective_from: string
          p_effective_to?: string
          p_name: string
          p_plan_id?: string
          p_rate_bps: number
        }
        Returns: string
      }
      upsert_manufacturer: { Args: { p_name: string }; Returns: string }
      upsert_message_template: {
        Args: {
          p_context: string
          p_name: string
          p_sms_body: string
          p_template_id?: string
          p_template_key: string
          p_whatsapp_body: string
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
      void_approval_held_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      void_sale: {
        Args: { p_order_id: string; p_reason: string }
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
