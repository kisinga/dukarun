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
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          start_date: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          start_date: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
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
      blog_daily_metrics: {
        Row: {
          cta_clicks: number
          engaged_readers: number
          metric_day: string
          post_id: string
          registrations: number
          scroll_50: number
          scroll_90: number
          share_clicks: number
          unique_readers: number
          views: number
        }
        Insert: {
          cta_clicks?: number
          engaged_readers?: number
          metric_day: string
          post_id: string
          registrations?: number
          scroll_50?: number
          scroll_90?: number
          share_clicks?: number
          unique_readers?: number
          views?: number
        }
        Update: {
          cta_clicks?: number
          engaged_readers?: number
          metric_day?: string
          post_id?: string
          registrations?: number
          scroll_50?: number
          scroll_90?: number
          share_clicks?: number
          unique_readers?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_daily_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_events: {
        Row: {
          event_day: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          post_id: string
          visitor_id: string
        }
        Insert: {
          event_day: string
          event_type: string
          id: string
          metadata?: Json
          occurred_at?: string
          post_id: string
          visitor_id: string
        }
        Update: {
          event_day?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          post_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_versions: {
        Row: {
          author_name: string
          content_markdown: string
          cover_image_alt: string | null
          cover_image_path: string | null
          created_at: string
          created_by: string
          excerpt: string
          id: string
          post_id: string
          publication_state: string
          published_at: string | null
          published_by: string | null
          scheduled_for: string | null
          seo_description: string | null
          seo_title: string | null
          tags: string[]
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          author_name: string
          content_markdown: string
          cover_image_alt?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by: string
          excerpt: string
          id?: string
          post_id: string
          publication_state?: string
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          seo_description?: string | null
          seo_title?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          version_number: number
        }
        Update: {
          author_name?: string
          content_markdown?: string
          cover_image_alt?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string
          excerpt?: string
          id?: string
          post_id?: string
          publication_state?: string
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          seo_description?: string | null
          seo_title?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_versions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          featured_at: string | null
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          featured_at?: string | null
          id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          featured_at?: string | null
          id?: string
          slug?: string
          updated_at?: string
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
          rendered_title: string | null
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
          rendered_title?: string | null
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
          rendered_title?: string | null
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
      categories: {
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
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_company_id_fkey"
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
          automated_customer_notifications_enabled: boolean
          automated_customer_notifications_override: boolean | null
          batch_expiry_enabled: boolean
          billing_cycle: string | null
          business_timezone: string
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
          primary_contact_user_id: string | null
          proforma_validity_days: number
          public_slug: string | null
          public_storefront_enabled: boolean
          public_whatsapp_number: string | null
          require_opening_count: boolean
          show_vat_breakdown_on_prints: boolean
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
          automated_customer_notifications_enabled?: boolean
          automated_customer_notifications_override?: boolean | null
          batch_expiry_enabled?: boolean
          billing_cycle?: string | null
          business_timezone?: string
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
          primary_contact_user_id?: string | null
          proforma_validity_days?: number
          public_slug?: string | null
          public_storefront_enabled?: boolean
          public_whatsapp_number?: string | null
          require_opening_count?: boolean
          show_vat_breakdown_on_prints?: boolean
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
          automated_customer_notifications_enabled?: boolean
          automated_customer_notifications_override?: boolean | null
          batch_expiry_enabled?: boolean
          billing_cycle?: string | null
          business_timezone?: string
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
          primary_contact_user_id?: string | null
          proforma_validity_days?: number
          public_slug?: string | null
          public_storefront_enabled?: boolean
          public_whatsapp_number?: string | null
          require_opening_count?: boolean
          show_vat_breakdown_on_prints?: boolean
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
      company_approval_events: {
        Row: {
          approval_mode: string
          approved_at: string
          approved_by: string | null
          company_id: string
          id: string
        }
        Insert: {
          approval_mode: string
          approved_at?: string
          approved_by?: string | null
          company_id: string
          id?: string
        }
        Update: {
          approval_mode?: string
          approved_at?: string
          approved_by?: string | null
          company_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_approval_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_approval_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
      company_registration_attributions: {
        Row: {
          attributed_at: string
          click_event_id: string | null
          company_id: string
          post_id: string
        }
        Insert: {
          attributed_at?: string
          click_event_id?: string | null
          company_id: string
          post_id: string
        }
        Update: {
          attributed_at?: string
          click_event_id?: string | null
          company_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_registration_attributions_click_event_id_fkey"
            columns: ["click_event_id"]
            isOneToOne: true
            referencedRelation: "blog_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_registration_attributions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_registration_attributions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_registration_attributions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
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
      company_tax_profiles: {
        Row: {
          business_timezone: string
          company_id: string
          created_at: string
          created_by: string | null
          default_tax_category_id: string | null
          effective_from: string
          effective_to: string | null
          id: string
          jurisdiction_id: string
          tax_registration_number: string | null
          vat_registered: boolean
        }
        Insert: {
          business_timezone: string
          company_id: string
          created_at?: string
          created_by?: string | null
          default_tax_category_id?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          jurisdiction_id: string
          tax_registration_number?: string | null
          vat_registered?: boolean
        }
        Update: {
          business_timezone?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          default_tax_category_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          jurisdiction_id?: string
          tax_registration_number?: string | null
          vat_registered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_tax_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tax_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tax_profiles_default_tax_category_id_fkey"
            columns: ["default_tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tax_profiles_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
      customer_deposit_allocations: {
        Row: {
          amount: number
          application_id: string
          company_id: string
          created_at: string
          deposit_id: string
          id: string
        }
        Insert: {
          amount: number
          application_id: string
          company_id: string
          created_at?: string
          deposit_id: string
          id?: string
        }
        Update: {
          amount?: number
          application_id?: string
          company_id?: string
          created_at?: string
          deposit_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposit_allocations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_allocations_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_source_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_allocations_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "customer_deposits"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deposit_applications: {
        Row: {
          amount: number
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          order_id: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
        }
        Insert: {
          amount: number
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          order_id: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          order_id?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposit_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposit_applications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deposit_refund_allocations: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          deposit_id: string
          id: string
          refund_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          deposit_id: string
          id?: string
          refund_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          deposit_id?: string
          id?: string
          refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposit_refund_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refund_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refund_allocations_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_source_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refund_allocations_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "customer_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refund_allocations_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deposit_refunds: {
        Row: {
          amount: number
          cashier_session_id: string | null
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          location_id: string
          method_code: string
          reason: string
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          location_id: string
          method_code: string
          reason: string
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          location_id?: string
          method_code?: string
          reason?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposit_refunds_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "customer_deposit_refunds_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deposits: {
        Row: {
          amount: number
          cashier_session_id: string | null
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          customer_receipt_id: string | null
          id: string
          location_id: string
          method_code: string
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
        }
        Insert: {
          amount: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          customer_receipt_id?: string | null
          id?: string
          location_id: string
          method_code: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          customer_receipt_id?: string | null
          id?: string
          location_id?: string
          method_code?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposits_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_receipt_id_fkey"
            columns: ["customer_receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "customer_deposits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_receipts: {
        Row: {
          amount: number
          applied_amount: number
          cashier_session_id: string | null
          client_ref: string
          collection_allocation_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          downpayment_amount: number
          id: string
          location_id: string
          method_code: string
          posted_at: string | null
          reference: string | null
          request_fingerprint: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
        }
        Insert: {
          amount: number
          applied_amount?: number
          cashier_session_id?: string | null
          client_ref: string
          collection_allocation_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          downpayment_amount?: number
          id?: string
          location_id: string
          method_code: string
          posted_at?: string | null
          reference?: string | null
          request_fingerprint: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          applied_amount?: number
          cashier_session_id?: string | null
          client_ref?: string
          collection_allocation_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          downpayment_amount?: number
          id?: string
          location_id?: string
          method_code?: string
          posted_at?: string | null
          reference?: string | null
          request_fingerprint?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_collection_allocation_id_fkey"
            columns: ["collection_allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_collection_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "customer_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_statement_links: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          expires_at: string
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          link_source: string
          open_count: number
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          expires_at: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          link_source?: string
          open_count?: number
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expires_at?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          link_source?: string
          open_count?: number
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
      daily_business_closes: {
        Row: {
          business_date: string
          company_id: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          signed_off_at: string
          signed_off_by: string
          status: string
          summary: Json
        }
        Insert: {
          business_date: string
          company_id: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          signed_off_at?: string
          signed_off_by: string
          status?: string
          summary: Json
        }
        Update: {
          business_date?: string
          company_id?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          signed_off_at?: string
          signed_off_by?: string
          status?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_business_closes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_business_closes_company_id_fkey"
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
      expense_documents: {
        Row: {
          category: string
          claim_input_vat: boolean
          company_id: string
          created_at: string
          created_by: string | null
          expense_date: string
          gross_total: number
          id: string
          input_tax_total: number
          journal_entry_id: string | null
          memo: string | null
          net_total: number
          source_account_code: string
          supplier_tax_pin: string | null
          tax_category_code: string
          tax_category_id: string | null
          tax_classification: string
          tax_invoice_date: string | null
          tax_invoice_number: string | null
          tax_point_at: string | null
          tax_profile_id: string | null
          tax_rate_bps: number
          tax_rate_version_id: string | null
        }
        Insert: {
          category: string
          claim_input_vat?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          expense_date: string
          gross_total: number
          id?: string
          input_tax_total: number
          journal_entry_id?: string | null
          memo?: string | null
          net_total: number
          source_account_code: string
          supplier_tax_pin?: string | null
          tax_category_code: string
          tax_category_id?: string | null
          tax_classification: string
          tax_invoice_date?: string | null
          tax_invoice_number?: string | null
          tax_point_at?: string | null
          tax_profile_id?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
        }
        Update: {
          category?: string
          claim_input_vat?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          gross_total?: number
          id?: string
          input_tax_total?: number
          journal_entry_id?: string | null
          memo?: string | null
          net_total?: number
          source_account_code?: string
          supplier_tax_pin?: string | null
          tax_category_code?: string
          tax_category_id?: string | null
          tax_classification?: string
          tax_invoice_date?: string | null
          tax_invoice_number?: string | null
          tax_point_at?: string | null
          tax_profile_id?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_documents_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_documents_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_documents_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "company_tax_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_documents_tax_rate_version_id_fkey"
            columns: ["tax_rate_version_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      external_document_links: {
        Row: {
          audience_role: string
          company_id: string
          created_at: string
          created_by: string | null
          document_type: string
          expires_at: string
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          party_id: string
          revoked_at: string | null
          snapshot: Json
          subject_id: string
          token_hash: string
        }
        Insert: {
          audience_role?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          document_type: string
          expires_at: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          party_id: string
          revoked_at?: string | null
          snapshot: Json
          subject_id: string
          token_hash: string
        }
        Update: {
          audience_role?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          expires_at?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          party_id?: string
          revoked_at?: string | null
          snapshot?: Json
          subject_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_document_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_document_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_document_links_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "external_document_links_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "external_document_links_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "external_document_links_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_document_links_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "external_document_links_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
          original_cost: number
          purchased_at: string
          quantity: number
          remaining: number
          remaining_cost: number
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
          original_cost: number
          purchased_at?: string
          quantity: number
          remaining: number
          remaining_cost: number
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
          original_cost?: number
          purchased_at?: string
          quantity?: number
          remaining?: number
          remaining_cost?: number
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
      late_sale_reviews: {
        Row: {
          client_ref: string
          company_id: string
          created_at: string
          device_id: string | null
          id: string
          location_id: string
          occurred_at: string
          original_period_id: string | null
          payload: Json
          posted_order_id: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          client_ref: string
          company_id: string
          created_at?: string
          device_id?: string | null
          id?: string
          location_id: string
          occurred_at: string
          original_period_id?: string | null
          payload: Json
          posted_order_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          client_ref?: string
          company_id?: string
          created_at?: string
          device_id?: string | null
          id?: string
          location_id?: string
          occurred_at?: string
          original_period_id?: string | null
          payload?: Json
          posted_order_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_sale_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_sale_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_sale_reviews_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_sale_reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "late_sale_reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_sale_reviews_original_period_id_fkey"
            columns: ["original_period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_sale_reviews_posted_order_id_fkey"
            columns: ["posted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
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
          money_account_kind: string | null
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
          money_account_kind?: string | null
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
          money_account_kind?: string | null
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
          cashier_session_id: string | null
          company_id: string
          created_at: string
          entry_date: string
          finalized_at: string | null
          id: string
          late_posting_reason: string | null
          memo: string | null
          occurred_at: string | null
          payload_hash: string | null
          posted_at: string
          posting_location_id: string | null
          posting_source: string | null
          reversal_of: string | null
          source_id: string
          source_type: string
        }
        Insert: {
          cashier_session_id?: string | null
          company_id: string
          created_at?: string
          entry_date: string
          finalized_at?: string | null
          id?: string
          late_posting_reason?: string | null
          memo?: string | null
          occurred_at?: string | null
          payload_hash?: string | null
          posted_at?: string
          posting_location_id?: string | null
          posting_source?: string | null
          reversal_of?: string | null
          source_id: string
          source_type: string
        }
        Update: {
          cashier_session_id?: string | null
          company_id?: string
          created_at?: string
          entry_date?: string
          finalized_at?: string | null
          id?: string
          late_posting_reason?: string | null
          memo?: string | null
          occurred_at?: string | null
          payload_hash?: string | null
          posted_at?: string
          posting_location_id?: string | null
          posting_source?: string | null
          reversal_of?: string | null
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_journal_entries_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "ledger_journal_entries_posting_location_id_fkey"
            columns: ["posting_location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "ledger_journal_entries_posting_location_id_fkey"
            columns: ["posting_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
          customer_id: string | null
          debit: number
          entry_id: string
          id: string
          location_id: string | null
          meta: Json
          order_id: string | null
          supplier_id: string | null
        }
        Insert: {
          account_id: string
          company_id: string
          credit?: number
          customer_id?: string | null
          debit?: number
          entry_id: string
          id?: string
          location_id?: string | null
          meta?: Json
          order_id?: string | null
          supplier_id?: string | null
        }
        Update: {
          account_id?: string
          company_id?: string
          credit?: number
          customer_id?: string | null
          debit?: number
          entry_id?: string
          id?: string
          location_id?: string | null
          meta?: Json
          order_id?: string | null
          supplier_id?: string | null
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
            foreignKeyName: "ledger_journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
            foreignKeyName: "ledger_journal_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "ledger_journal_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      legacy_customer_account_reconciliations: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_id: string
          id: string
          ledger_balance: number
          prior_document_balance: number
          reason: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          ledger_balance: number
          prior_document_balance: number
          reason: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          ledger_balance?: number
          prior_document_balance?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_customer_account_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "legacy_customer_account_reconciliations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
      location_payment_provider_accounts: {
        Row: {
          company_id: string
          created_at: string
          location_id: string
          provider: string
          provider_account_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          location_id: string
          provider: string
          provider_account_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          location_id?: string
          provider?: string
          provider_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_payment_provider_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_provider_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_provider_accounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_payment_provider_accounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_provider_accounts_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
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
          cta_label: string | null
          cta_link: string | null
          failed_count: number
          id: string
          name: string
          recipient_count: number
          reviewed_at: string | null
          scheduled_for: string | null
          scope: string
          sent_at: string | null
          sent_count: number
          skipped_count: number
          status: string
          template_id: string | null
          template_version: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          audience: string
          audience_config?: Json
          body: string
          channel: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_link?: string | null
          failed_count?: number
          id?: string
          name: string
          recipient_count?: number
          reviewed_at?: string | null
          scheduled_for?: string | null
          scope: string
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          template_id?: string | null
          template_version?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string
          audience_config?: Json
          body?: string
          channel?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_link?: string | null
          failed_count?: number
          id?: string
          name?: string
          recipient_count?: number
          reviewed_at?: string | null
          scheduled_for?: string | null
          scope?: string
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          template_id?: string | null
          template_version?: number | null
          title?: string | null
          updated_at?: string
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
      mpesa_callback_tokens: {
        Row: {
          activated_at: string | null
          attempt_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          provider_account_id: string
          retire_after: string | null
          status: string
          token_hash: string
        }
        Insert: {
          activated_at?: string | null
          attempt_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          provider_account_id: string
          retire_after?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          activated_at?: string | null
          attempt_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          provider_account_id?: string
          retire_after?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_callback_tokens_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_callback_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_callback_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_callback_tokens_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_connections: {
        Row: {
          business_shortcode: string
          c2b_callback_seen_at: string | null
          c2b_registered_at: string | null
          c2b_test_collection_id: string | null
          company_id: string
          created_at: string
          daraja_app_id: string
          onboarding_request_id: string | null
          organization_shortcode: string
          party_b: string
          passkey_secret_id: string
          provider_account_id: string
          shortcode_type: string
          stk_test_collection_id: string | null
          updated_at: string
        }
        Insert: {
          business_shortcode: string
          c2b_callback_seen_at?: string | null
          c2b_registered_at?: string | null
          c2b_test_collection_id?: string | null
          company_id: string
          created_at?: string
          daraja_app_id: string
          onboarding_request_id?: string | null
          organization_shortcode: string
          party_b: string
          passkey_secret_id: string
          provider_account_id: string
          shortcode_type: string
          stk_test_collection_id?: string | null
          updated_at?: string
        }
        Update: {
          business_shortcode?: string
          c2b_callback_seen_at?: string | null
          c2b_registered_at?: string | null
          c2b_test_collection_id?: string | null
          company_id?: string
          created_at?: string
          daraja_app_id?: string
          onboarding_request_id?: string | null
          organization_shortcode?: string
          party_b?: string
          passkey_secret_id?: string
          provider_account_id?: string
          shortcode_type?: string
          stk_test_collection_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_c2b_test_collection_fk"
            columns: ["c2b_test_collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_connections_daraja_app_id_fkey"
            columns: ["daraja_app_id"]
            isOneToOne: false
            referencedRelation: "mpesa_daraja_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_connections_onboarding_request_id_fkey"
            columns: ["onboarding_request_id"]
            isOneToOne: false
            referencedRelation: "mpesa_onboarding_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_connections_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: true
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_stk_test_collection_fk"
            columns: ["stk_test_collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_daraja_apps: {
        Row: {
          app_name: string
          company_id: string
          consumer_key_secret_id: string
          consumer_secret_secret_id: string
          created_at: string
          created_by: string | null
          environment: string
          id: string
          oauth_verified_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_name: string
          company_id: string
          consumer_key_secret_id: string
          consumer_secret_secret_id: string
          created_at?: string
          created_by?: string | null
          environment: string
          id?: string
          oauth_verified_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_name?: string
          company_id?: string
          consumer_key_secret_id?: string
          consumer_secret_secret_id?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          oauth_verified_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_daraja_apps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_daraja_apps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_late_posting_reviews: {
        Row: {
          allocation_id: string
          collection_id: string
          company_id: string
          created_at: string
          id: string
          intent_id: string | null
          original_business_date: string
          reason: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          allocation_id: string
          collection_id: string
          company_id: string
          created_at?: string
          id?: string
          intent_id?: string | null
          original_business_date: string
          reason?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          allocation_id?: string
          collection_id?: string
          company_id?: string
          created_at?: string
          id?: string
          intent_id?: string | null
          original_business_date?: string
          reason?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_late_posting_reviews_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_collection_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_late_posting_reviews_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_late_posting_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_late_posting_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_late_posting_reviews_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_onboarding_requests: {
        Row: {
          company_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          handled_by: string | null
          id: string
          legal_name: string
          merchant_notes: string | null
          mpesa_username: string
          operator_notes: string | null
          requested_by: string
          requested_location_ids: string[]
          shortcode: string
          shortcode_type: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at?: string
          handled_by?: string | null
          id?: string
          legal_name: string
          merchant_notes?: string | null
          mpesa_username: string
          operator_notes?: string | null
          requested_by: string
          requested_location_ids?: string[]
          shortcode: string
          shortcode_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          handled_by?: string | null
          id?: string
          legal_name?: string
          merchant_notes?: string | null
          mpesa_username?: string
          operator_notes?: string | null
          requested_by?: string
          requested_location_ids?: string[]
          shortcode?: string
          shortcode_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_onboarding_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_onboarding_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_payment_attempts: {
        Row: {
          attempt_number: number
          checkout_request_id: string | null
          company_id: string
          created_at: string
          customer_message: string | null
          id: string
          intent_id: string
          last_queried_at: string | null
          merchant_request_id: string | null
          next_query_at: string | null
          query_attempts: number
          query_lease_until: string | null
          response_code: string | null
          response_description: string | null
          result_code: string | null
          result_description: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number: number
          checkout_request_id?: string | null
          company_id: string
          created_at?: string
          customer_message?: string | null
          id?: string
          intent_id: string
          last_queried_at?: string | null
          merchant_request_id?: string | null
          next_query_at?: string | null
          query_attempts?: number
          query_lease_until?: string | null
          response_code?: string | null
          response_description?: string | null
          result_code?: string | null
          result_description?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          checkout_request_id?: string | null
          company_id?: string
          created_at?: string
          customer_message?: string | null
          id?: string
          intent_id?: string
          last_queried_at?: string | null
          merchant_request_id?: string | null
          next_query_at?: string | null
          query_attempts?: number
          query_lease_until?: string | null
          response_code?: string | null
          response_description?: string | null
          result_code?: string | null
          result_description?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_payment_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_attempts_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_payment_intents: {
        Row: {
          amount: number
          cash_amount: number
          client_ref: string
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          created_by_role: string | null
          current_attempt_id: string | null
          expires_at: string
          fulfilled_collection_id: string | null
          id: string
          initiating_cashier_session_id: string | null
          location_id: string
          payer_phone: string | null
          provider_account_id: string
          request_fingerprint: string
          result_code: string | null
          result_description: string | null
          review_reason: string | null
          state_version: number
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
          workflow: string
        }
        Insert: {
          amount: number
          cash_amount?: number
          client_ref: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          created_by_role?: string | null
          current_attempt_id?: string | null
          expires_at?: string
          fulfilled_collection_id?: string | null
          id?: string
          initiating_cashier_session_id?: string | null
          location_id: string
          payer_phone?: string | null
          provider_account_id: string
          request_fingerprint: string
          result_code?: string | null
          result_description?: string | null
          review_reason?: string | null
          state_version?: number
          status?: string
          subject_id: string
          subject_type: string
          updated_at?: string
          workflow: string
        }
        Update: {
          amount?: number
          cash_amount?: number
          client_ref?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          created_by_role?: string | null
          current_attempt_id?: string | null
          expires_at?: string
          fulfilled_collection_id?: string | null
          id?: string
          initiating_cashier_session_id?: string | null
          location_id?: string
          payer_phone?: string | null
          provider_account_id?: string
          request_fingerprint?: string
          result_code?: string | null
          result_description?: string | null
          review_reason?: string | null
          state_version?: number
          status?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_intent_current_attempt_fk"
            columns: ["current_attempt_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_fulfilled_collection_id_fkey"
            columns: ["fulfilled_collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_initiating_cashier_session_id_fkey"
            columns: ["initiating_cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_platform_settings: {
        Row: {
          enabled: boolean
          manual_fallback_allowed: boolean
          pilot_company_id: string | null
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          manual_fallback_allowed?: boolean
          pilot_company_id?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          manual_fallback_allowed?: boolean
          pilot_company_id?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_platform_settings_pilot_company_id_fkey"
            columns: ["pilot_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_platform_settings_pilot_company_id_fkey"
            columns: ["pilot_company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_provider_events: {
        Row: {
          attempt_id: string | null
          callback_token_id: string
          collection_id: string | null
          company_id: string
          error: string | null
          event_type: string
          id: string
          lease_until: string | null
          next_attempt_at: string
          payload: Json | null
          payload_purged_at: string | null
          payload_sha256: string
          processed_at: string | null
          processing_attempts: number
          provider_account_id: string
          provider_event_key: string
          received_at: string
          result_code: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          attempt_id?: string | null
          callback_token_id: string
          collection_id?: string | null
          company_id: string
          error?: string | null
          event_type: string
          id?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          payload_purged_at?: string | null
          payload_sha256: string
          processed_at?: string | null
          processing_attempts?: number
          provider_account_id: string
          provider_event_key: string
          received_at?: string
          result_code?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          attempt_id?: string | null
          callback_token_id?: string
          collection_id?: string | null
          company_id?: string
          error?: string | null
          event_type?: string
          id?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          payload_purged_at?: string | null
          payload_sha256?: string
          processed_at?: string | null
          processing_attempts?: number
          provider_account_id?: string
          provider_event_key?: string
          received_at?: string
          result_code?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_provider_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_provider_events_callback_token_id_fkey"
            columns: ["callback_token_id"]
            isOneToOne: false
            referencedRelation: "mpesa_callback_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_provider_events_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_provider_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_provider_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_provider_events_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
          action_label: string | null
          body: string | null
          campaign_id: string | null
          campaign_recipient_id: string | null
          clicked_at: string | null
          company_id: string
          created_at: string
          dedupe_key: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_label?: string | null
          body?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          clicked_at?: string | null
          company_id: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_label?: string | null
          body?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          clicked_at?: string | null
          company_id?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
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
          gross_total: number
          id: string
          line_total: number
          net_total: number
          order_id: string
          price_override_reason: string | null
          quantity: number
          tax_category_code: string | null
          tax_category_id: string | null
          tax_classification: string | null
          tax_rate_bps: number
          tax_rate_version_id: string | null
          tax_total: number
          unit_price: number
          variant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_price?: number | null
          gross_total?: number
          id?: string
          line_total: number
          net_total?: number
          order_id: string
          price_override_reason?: string | null
          quantity: number
          tax_category_code?: string | null
          tax_category_id?: string | null
          tax_classification?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
          unit_price: number
          variant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_price?: number | null
          gross_total?: number
          id?: string
          line_total?: number
          net_total?: number
          order_id?: string
          price_override_reason?: string | null
          quantity?: number
          tax_category_code?: string | null
          tax_category_id?: string | null
          tax_classification?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
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
            foreignKeyName: "order_lines_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_tax_rate_version_id_fkey"
            columns: ["tax_rate_version_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_versions"
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
            referencedRelation: "low_stock_variants_by_location"
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
          account_sale_request_fingerprint: string | null
          accounting_posting_date: string | null
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
          gross_total: number
          id: string
          is_credit_sale: boolean
          late_posting_reason: string | null
          location_id: string
          net_total: number
          posting_source: string | null
          status: string
          tax_document_id: string | null
          tax_point_at: string | null
          tax_profile_id: string | null
          tax_snapshot_status: string
          tax_total: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_sale_request_fingerprint?: string | null
          accounting_posting_date?: string | null
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
          gross_total?: number
          id?: string
          is_credit_sale?: boolean
          late_posting_reason?: string | null
          location_id: string
          net_total?: number
          posting_source?: string | null
          status?: string
          tax_document_id?: string | null
          tax_point_at?: string | null
          tax_profile_id?: string | null
          tax_snapshot_status?: string
          tax_total?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_sale_request_fingerprint?: string | null
          accounting_posting_date?: string | null
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
          gross_total?: number
          id?: string
          is_credit_sale?: boolean
          late_posting_reason?: string | null
          location_id?: string
          net_total?: number
          posting_source?: string | null
          status?: string
          tax_document_id?: string | null
          tax_point_at?: string | null
          tax_profile_id?: string | null
          tax_snapshot_status?: string
          tax_total?: number
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tax_document_id_fkey"
            columns: ["tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "company_tax_profiles"
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
          cashier_session_event: string | null
          cashier_session_id: string | null
          channel: string
          company_id: string
          created_at: string
          customer_id: string | null
          customer_statement_link_id: string | null
          dedupe_key: string | null
          document_copy_role: string | null
          document_subject_id: string | null
          document_type: string | null
          error: string | null
          external_document_link_id: string | null
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
          team_invitation_id: string | null
          template_key: string | null
          template_version: number | null
        }
        Insert: {
          attempts?: number
          body: string
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          cashier_session_event?: string | null
          cashier_session_id?: string | null
          channel: string
          company_id: string
          created_at?: string
          customer_id?: string | null
          customer_statement_link_id?: string | null
          dedupe_key?: string | null
          document_copy_role?: string | null
          document_subject_id?: string | null
          document_type?: string | null
          error?: string | null
          external_document_link_id?: string | null
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
          team_invitation_id?: string | null
          template_key?: string | null
          template_version?: number | null
        }
        Update: {
          attempts?: number
          body?: string
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          cashier_session_event?: string | null
          cashier_session_id?: string | null
          channel?: string
          company_id?: string
          created_at?: string
          customer_id?: string | null
          customer_statement_link_id?: string | null
          dedupe_key?: string | null
          document_copy_role?: string | null
          document_subject_id?: string | null
          document_type?: string | null
          error?: string | null
          external_document_link_id?: string | null
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
          team_invitation_id?: string | null
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
            foreignKeyName: "outbox_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "outbox_customer_statement_link_id_fkey"
            columns: ["customer_statement_link_id"]
            isOneToOne: false
            referencedRelation: "customer_statement_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_external_document_link_id_fkey"
            columns: ["external_document_link_id"]
            isOneToOne: false
            referencedRelation: "external_document_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_fallback_for_outbox_id_fkey"
            columns: ["fallback_for_outbox_id"]
            isOneToOne: false
            referencedRelation: "outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_team_invitation_id_fkey"
            columns: ["team_invitation_id"]
            isOneToOne: false
            referencedRelation: "team_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_collection_allocations: {
        Row: {
          allocated_by: string | null
          amount: number
          cashier_session_id: string | null
          collection_id: string
          company_id: string
          created_at: string
          customer_receipt_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          posted_after_session_close: boolean
          posted_at: string | null
          posting_date: string | null
          released_at: string | null
          reversed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allocated_by?: string | null
          amount: number
          cashier_session_id?: string | null
          collection_id: string
          company_id: string
          created_at?: string
          customer_receipt_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          posted_after_session_close?: boolean
          posted_at?: string | null
          posting_date?: string | null
          released_at?: string | null
          reversed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allocated_by?: string | null
          amount?: number
          cashier_session_id?: string | null
          collection_id?: string
          company_id?: string
          created_at?: string
          customer_receipt_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          posted_after_session_close?: boolean
          posted_at?: string | null
          posting_date?: string | null
          released_at?: string | null
          reversed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_collection_allocations_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_allocations_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_allocations_customer_receipt_id_fkey"
            columns: ["customer_receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_collection_reversals: {
        Row: {
          accounting_resource_id: string | null
          allocation_id: string | null
          collection_id: string
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          provider_reference: string
          provider_reversed_at: string
          reason: string
          recorded_by: string
          status: string
        }
        Insert: {
          accounting_resource_id?: string | null
          allocation_id?: string | null
          collection_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          provider_reference: string
          provider_reversed_at: string
          reason: string
          recorded_by: string
          status?: string
        }
        Update: {
          accounting_resource_id?: string | null
          allocation_id?: string | null
          collection_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          provider_reference?: string
          provider_reversed_at?: string
          reason?: string
          recorded_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_collection_reversals_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_collection_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_reversals_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_reversals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collection_reversals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_collections: {
        Row: {
          account_reference: string | null
          allocation_status: string
          amount: number
          classification: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          environment: string
          id: string
          mpesa_intent_id: string | null
          notes: string | null
          occurred_at: string
          payer_name: string | null
          payer_phone: string | null
          provider: string
          provider_account_id: string
          provider_receipt: string
          provider_status: string
          source: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          account_reference?: string | null
          allocation_status?: string
          amount: number
          classification?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          environment: string
          id?: string
          mpesa_intent_id?: string | null
          notes?: string | null
          occurred_at: string
          payer_name?: string | null
          payer_phone?: string | null
          provider: string
          provider_account_id: string
          provider_receipt: string
          provider_status?: string
          source: string
          updated_at?: string
          verification_status: string
        }
        Update: {
          account_reference?: string | null
          allocation_status?: string
          amount?: number
          classification?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          environment?: string
          id?: string
          mpesa_intent_id?: string | null
          notes?: string | null
          occurred_at?: string
          payer_name?: string | null
          payer_phone?: string | null
          provider?: string
          provider_account_id?: string
          provider_receipt?: string
          provider_status?: string
          source?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collections_mpesa_intent_id_fkey"
            columns: ["mpesa_intent_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collections_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_accounts"
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
      payment_provider_accounts: {
        Row: {
          activated_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          disabled_at: string | null
          display_name: string
          environment: string
          id: string
          manual_fallback_until: string | null
          method_code: string
          provider: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activated_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          display_name: string
          environment: string
          id?: string
          manual_fallback_until?: string | null
          method_code?: string
          provider: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activated_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          display_name?: string
          environment?: string
          id?: string
          manual_fallback_until?: string | null
          method_code?: string
          provider?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_accounts_company_id_fkey"
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
          cashier_session_id: string | null
          collection_allocation_id: string | null
          company_id: string
          created_at: string
          customer_deposit_application_id: string | null
          customer_receipt_id: string | null
          id: string
          ledger_account_code: string | null
          location_id: string
          method_code: string
          mpesa_receipt: string | null
          order_id: string
          reference: string | null
          settlement_kind: string
          status: string
        }
        Insert: {
          amount: number
          cashier_session_id?: string | null
          collection_allocation_id?: string | null
          company_id: string
          created_at?: string
          customer_deposit_application_id?: string | null
          customer_receipt_id?: string | null
          id?: string
          ledger_account_code?: string | null
          location_id: string
          method_code: string
          mpesa_receipt?: string | null
          order_id: string
          reference?: string | null
          settlement_kind?: string
          status?: string
        }
        Update: {
          amount?: number
          cashier_session_id?: string | null
          collection_allocation_id?: string | null
          company_id?: string
          created_at?: string
          customer_deposit_application_id?: string | null
          customer_receipt_id?: string | null
          id?: string
          ledger_account_code?: string | null
          location_id?: string
          method_code?: string
          mpesa_receipt?: string | null
          order_id?: string
          reference?: string | null
          settlement_kind?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_collection_allocation_id_fkey"
            columns: ["collection_allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_collection_allocations"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "payments_customer_deposit_application_fk"
            columns: ["customer_deposit_application_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_receipt_id_fkey"
            columns: ["customer_receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
      period_closing_packs: {
        Row: {
          accounting_period_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          snapshot: Json
        }
        Insert: {
          accounting_period_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot: Json
        }
        Update: {
          accounting_period_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "period_closing_packs_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: true
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_closing_packs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_closing_packs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
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
          intro_offer_bonus_months: number
          intro_offer_enabled: boolean
          intro_offer_paid_months: number
          intro_offer_tier_id: string
          singleton: boolean
          trial_duration_days: number
          updated_at: string
        }
        Insert: {
          default_trial_tier_id: string
          intro_offer_bonus_months?: number
          intro_offer_enabled?: boolean
          intro_offer_paid_months?: number
          intro_offer_tier_id: string
          singleton?: boolean
          trial_duration_days?: number
          updated_at?: string
        }
        Update: {
          default_trial_tier_id?: string
          intro_offer_bonus_months?: number
          intro_offer_enabled?: boolean
          intro_offer_paid_months?: number
          intro_offer_tier_id?: string
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
          {
            foreignKeyName: "platform_billing_settings_intro_offer_tier_id_fkey"
            columns: ["intro_offer_tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_communication_settings: {
        Row: {
          external_messaging_enabled: boolean
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          external_messaging_enabled?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          external_messaging_enabled?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_registration_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_window: string
          approval_count: number
          created_at: string
          id: string
          threshold: number
          window_started_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_window: string
          approval_count: number
          created_at?: string
          id?: string
          threshold: number
          window_started_at: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_window?: string
          approval_count?: number
          created_at?: string
          id?: string
          threshold?: number
          window_started_at?: string
        }
        Relationships: []
      }
      platform_registration_settings: {
        Row: {
          automatic_company_approval_enabled: boolean
          daily_alert_threshold: number
          hourly_alert_threshold: number
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          automatic_company_approval_enabled?: boolean
          daily_alert_threshold?: number
          hourly_alert_threshold?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          automatic_company_approval_enabled?: boolean
          daily_alert_threshold?: number
          hourly_alert_threshold?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pos_devices: {
        Row: {
          company_id: string
          device_key: string
          id: string
          last_seen_at: string
          last_synced_at: string | null
          location_id: string | null
          pending_count: number
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          device_key: string
          id?: string
          last_seen_at?: string
          last_synced_at?: string | null
          location_id?: string | null
          pending_count?: number
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          device_key?: string
          id?: string
          last_seen_at?: string
          last_synced_at?: string | null
          location_id?: string | null
          pending_count?: number
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "pos_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_tax_treatment_versions: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          product_id: string
          tax_category_id: string | null
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          product_id: string
          tax_category_id?: string | null
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          product_id?: string
          tax_category_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_tax_treatment_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tax_treatment_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tax_treatment_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tax_treatment_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tax_treatment_versions_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
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
          tax_category_id: string | null
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
          tax_category_id?: string | null
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
          tax_category_id?: string | null
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
          {
            foreignKeyName: "products_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      public_site_deploy_requests: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          deployment_id: string | null
          id: string
          next_attempt_at: string
          reason: string
          requested_by: string | null
          resource_id: string | null
          resource_type: string
          revision_id: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          deployment_id?: string | null
          id?: string
          next_attempt_at?: string
          reason: string
          requested_by?: string | null
          resource_id?: string | null
          resource_type: string
          revision_id?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          deployment_id?: string | null
          id?: string
          next_attempt_at?: string
          reason?: string
          requested_by?: string | null
          resource_id?: string | null
          resource_type?: string
          revision_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_site_deploy_requests_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "public_site_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_site_deploy_requests_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "blog_post_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      public_site_deployments: {
        Row: {
          completed_at: string | null
          created_at: string
          error_summary: string | null
          id: string
          provider: string
          provider_deployment_id: string | null
          requested_by: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          id?: string
          provider?: string
          provider_deployment_id?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          id?: string
          provider?: string
          provider_deployment_id?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_drafts: {
        Row: {
          account_code: string | null
          advance_amount: number
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          expenses: Json
          id: string
          lines: Json
          notes: string | null
          payment_amount: number | null
          payment_mode: string | null
          posted_purchase_id: string | null
          purchase_date: string
          reference: string | null
          status: string
          stock_location_id: string | null
          supplier_id: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          advance_amount?: number
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          expenses?: Json
          id?: string
          lines: Json
          notes?: string | null
          payment_amount?: number | null
          payment_mode?: string | null
          posted_purchase_id?: string | null
          purchase_date?: string
          reference?: string | null
          status?: string
          stock_location_id?: string | null
          supplier_id: string
          total_cost: number
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          advance_amount?: number
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          expenses?: Json
          id?: string
          lines?: Json
          notes?: string | null
          payment_amount?: number | null
          payment_mode?: string | null
          posted_purchase_id?: string | null
          purchase_date?: string
          reference?: string | null
          status?: string
          stock_location_id?: string | null
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
            referencedRelation: "purchase_history"
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
            foreignKeyName: "purchase_drafts_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "purchase_drafts_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_drafts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
      purchase_expenses: {
        Row: {
          account_code: string | null
          amount: number
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          custom_label: string | null
          gross_total: number
          id: string
          memo: string | null
          net_total: number
          purchase_id: string
          settlement: string
          tax_category_code: string | null
          tax_category_id: string | null
          tax_classification: string | null
          tax_rate_bps: number
          tax_rate_version_id: string | null
          tax_total: number
        }
        Insert: {
          account_code?: string | null
          amount: number
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          custom_label?: string | null
          gross_total?: number
          id?: string
          memo?: string | null
          net_total?: number
          purchase_id: string
          settlement: string
          tax_category_code?: string | null
          tax_category_id?: string | null
          tax_classification?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
        }
        Update: {
          account_code?: string | null
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom_label?: string | null
          gross_total?: number
          id?: string
          memo?: string | null
          net_total?: number
          purchase_id?: string
          settlement?: string
          tax_category_code?: string | null
          tax_category_id?: string | null
          tax_classification?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_expenses_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_expenses_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_expenses_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_expenses_tax_rate_version_id_fkey"
            columns: ["tax_rate_version_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          batch_number: string | null
          company_id: string
          created_at: string
          expiry_date: string | null
          gross_total: number
          id: string
          inventory_batch_id: string | null
          line_total: number
          net_total: number
          purchase_id: string
          quantity: number
          tax_category_code: string | null
          tax_category_id: string | null
          tax_classification: string | null
          tax_rate_bps: number
          tax_rate_version_id: string | null
          tax_total: number
          unit_cost: number
          value_source: string
          variant_id: string
        }
        Insert: {
          batch_number?: string | null
          company_id: string
          created_at?: string
          expiry_date?: string | null
          gross_total?: number
          id?: string
          inventory_batch_id?: string | null
          line_total: number
          net_total?: number
          purchase_id: string
          quantity: number
          tax_category_code?: string | null
          tax_category_id?: string | null
          tax_classification?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
          unit_cost: number
          value_source?: string
          variant_id: string
        }
        Update: {
          batch_number?: string | null
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          gross_total?: number
          id?: string
          inventory_batch_id?: string | null
          line_total?: number
          net_total?: number
          purchase_id?: string
          quantity?: number
          tax_category_code?: string | null
          tax_category_id?: string | null
          tax_classification?: string | null
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
          unit_cost?: number
          value_source?: string
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
            referencedRelation: "purchase_history"
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
            foreignKeyName: "purchase_lines_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_tax_rate_version_id_fkey"
            columns: ["tax_rate_version_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_versions"
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
            referencedRelation: "low_stock_variants_by_location"
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
          settlement_kind: string
          status: string
          supplier_advance_application_id: string | null
          supplier_payment_id: string | null
        }
        Insert: {
          account_code: string
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id: string
          settlement_kind?: string
          status?: string
          supplier_advance_application_id?: string | null
          supplier_payment_id?: string | null
        }
        Update: {
          account_code?: string
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id?: string
          settlement_kind?: string
          status?: string
          supplier_advance_application_id?: string | null
          supplier_payment_id?: string | null
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
            referencedRelation: "purchase_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_supplier_advance_application_fk"
            columns: ["supplier_advance_application_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_supplier_payment_id_fkey"
            columns: ["supplier_payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          claim_input_vat: boolean
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          credit_due_at: string | null
          goods_net_total: number
          goods_subtotal: number
          gross_total: number
          id: string
          input_tax_total: number
          is_credit: boolean
          net_total: number
          notes: string | null
          purchase_date: string
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          stock_location_id: string
          supplier_id: string
          supplier_tax_pin: string | null
          tax_invoice_date: string | null
          tax_invoice_number: string | null
          tax_point_at: string | null
          tax_profile_id: string | null
          tax_snapshot_status: string
          total_cost: number
        }
        Insert: {
          claim_input_vat?: boolean
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_due_at?: string | null
          goods_net_total?: number
          goods_subtotal?: number
          gross_total?: number
          id?: string
          input_tax_total?: number
          is_credit?: boolean
          net_total?: number
          notes?: string | null
          purchase_date?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          stock_location_id: string
          supplier_id: string
          supplier_tax_pin?: string | null
          tax_invoice_date?: string | null
          tax_invoice_number?: string | null
          tax_point_at?: string | null
          tax_profile_id?: string | null
          tax_snapshot_status?: string
          total_cost: number
        }
        Update: {
          claim_input_vat?: boolean
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_due_at?: string | null
          goods_net_total?: number
          goods_subtotal?: number
          gross_total?: number
          id?: string
          input_tax_total?: number
          is_credit?: boolean
          net_total?: number
          notes?: string | null
          purchase_date?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          stock_location_id?: string
          supplier_id?: string
          supplier_tax_pin?: string | null
          tax_invoice_date?: string | null
          tax_invoice_number?: string | null
          tax_point_at?: string | null
          tax_profile_id?: string | null
          tax_snapshot_status?: string
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "company_tax_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_accounts: {
        Row: {
          account_code: string
          balance_scope: string
          declared: number
          expected: number
          id: string
          reason: string | null
          reconciliation_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          variance: number
        }
        Insert: {
          account_code: string
          balance_scope: string
          declared: number
          expected: number
          id?: string
          reason?: string | null
          reconciliation_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          variance: number
        }
        Update: {
          account_code?: string
          balance_scope?: string
          declared?: number
          expected?: number
          id?: string
          reason?: string | null
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
          gross_total: number
          id: string
          ledger_account_code: string | null
          location_id: string
          method_code: string
          net_total: number
          order_id: string
          original_tax_document_id: string | null
          reason: string | null
          stock_outcome: string
          tax_document_id: string | null
          tax_total: number
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          gross_total?: number
          id?: string
          ledger_account_code?: string | null
          location_id: string
          method_code: string
          net_total?: number
          order_id: string
          original_tax_document_id?: string | null
          reason?: string | null
          stock_outcome?: string
          tax_document_id?: string | null
          tax_total?: number
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          gross_total?: number
          id?: string
          ledger_account_code?: string | null
          location_id?: string
          method_code?: string
          net_total?: number
          order_id?: string
          original_tax_document_id?: string | null
          reason?: string | null
          stock_outcome?: string
          tax_document_id?: string | null
          tax_total?: number
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
          {
            foreignKeyName: "refunds_original_tax_document_id_fkey"
            columns: ["original_tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_tax_document_id_fkey"
            columns: ["tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_documents"
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
          total_cost: number
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
          total_cost: number
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
          total_cost?: number
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
            referencedRelation: "low_stock_variants_by_location"
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
      subscription_intro_offer_redemptions: {
        Row: {
          amount: number
          bonus_applied: boolean
          bonus_months: number
          company_id: string
          id: string
          paid_months: number
          payment_reference: string
          redeemed_at: string
          tier_id: string
        }
        Insert: {
          amount: number
          bonus_applied?: boolean
          bonus_months: number
          company_id: string
          id?: string
          paid_months: number
          payment_reference: string
          redeemed_at?: string
          tier_id: string
        }
        Update: {
          amount?: number
          bonus_applied?: boolean
          bonus_months?: number
          company_id?: string
          id?: string
          paid_months?: number
          payment_reference?: string
          redeemed_at?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_intro_offer_redemptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_intro_offer_redemptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_intro_offer_redemptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
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
      supplier_advance_allocations: {
        Row: {
          advance_id: string
          amount: number
          application_id: string
          company_id: string
          created_at: string
          id: string
        }
        Insert: {
          advance_id: string
          amount: number
          application_id: string
          company_id: string
          created_at?: string
          id?: string
        }
        Update: {
          advance_id?: string
          amount?: number
          application_id?: string
          company_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_advance_allocations_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_source_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_allocations_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "supplier_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_allocations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_advance_applications: {
        Row: {
          amount: number
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          purchase_id: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          supplier_id: string
        }
        Insert: {
          amount: number
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id: string
        }
        Update: {
          amount?: number
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_advance_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_advance_applications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      supplier_advance_return_allocations: {
        Row: {
          advance_id: string
          amount: number
          company_id: string
          created_at: string
          id: string
          return_id: string
        }
        Insert: {
          advance_id: string
          amount: number
          company_id: string
          created_at?: string
          id?: string
          return_id: string
        }
        Update: {
          advance_id?: string
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_advance_return_allocations_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_source_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_return_allocations_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "supplier_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_return_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_return_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_return_allocations_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_advance_returns: {
        Row: {
          account_code: string
          amount: number
          cashier_session_id: string | null
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          reason: string
          reference: string | null
          status: string
          supplier_id: string
        }
        Insert: {
          account_code: string
          amount: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          reason: string
          reference?: string | null
          status?: string
          supplier_id: string
        }
        Update: {
          account_code?: string
          amount?: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          reason?: string
          reference?: string | null
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_advance_returns_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_advance_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      supplier_advances: {
        Row: {
          account_code: string
          amount: number
          cashier_session_id: string | null
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          supplier_id: string
        }
        Insert: {
          account_code: string
          amount: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id: string
        }
        Update: {
          account_code?: string
          amount?: number
          cashier_session_id?: string | null
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_advances_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "supplier_advances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          account_code: string
          amount: number
          cashier_session_id: string
          client_ref: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          purchase_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          supplier_id: string
        }
        Insert: {
          account_code: string
          amount: number
          cashier_session_id: string
          client_ref?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          purchase_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id: string
        }
        Update: {
          account_code?: string
          amount?: number
          cashier_session_id?: string
          client_ref?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          purchase_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_cashier_session_id_fkey"
            columns: ["cashier_session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "supplier_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      tax_categories: {
        Row: {
          active: boolean
          classification: string
          code: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_default: boolean
          jurisdiction_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          classification: string
          code: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_default?: boolean
          jurisdiction_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          classification?: string
          code?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_default?: boolean
          jurisdiction_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_categories_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_document_lines: {
        Row: {
          company_id: string
          created_at: string
          description: string
          gross_total: number
          id: string
          net_total: number
          quantity: number
          source_order_line_id: string | null
          tax_category_code: string
          tax_category_id: string | null
          tax_classification: string
          tax_document_id: string
          tax_rate_bps: number
          tax_rate_version_id: string | null
          tax_total: number
          variant_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          gross_total: number
          id?: string
          net_total: number
          quantity: number
          source_order_line_id?: string | null
          tax_category_code: string
          tax_category_id?: string | null
          tax_classification: string
          tax_document_id: string
          tax_rate_bps: number
          tax_rate_version_id?: string | null
          tax_total: number
          variant_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          gross_total?: number
          id?: string
          net_total?: number
          quantity?: number
          source_order_line_id?: string | null
          tax_category_code?: string
          tax_category_id?: string | null
          tax_classification?: string
          tax_document_id?: string
          tax_rate_bps?: number
          tax_rate_version_id?: string | null
          tax_total?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_document_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_source_order_line_id_fkey"
            columns: ["source_order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_tax_document_id_fkey"
            columns: ["tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_tax_rate_version_id_fkey"
            columns: ["tax_rate_version_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "tax_document_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "tax_document_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "tax_document_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      tax_document_sequences: {
        Row: {
          company_id: string
          document_kind: string
          last_value: number
          sequence_year: number
        }
        Insert: {
          company_id: string
          document_kind: string
          last_value?: number
          sequence_year: number
        }
        Update: {
          company_id?: string
          document_kind?: string
          last_value?: number
          sequence_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_document_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          document_kind: string
          document_number: string
          external_payload: Json | null
          external_reference: string | null
          external_status: string
          gross_total: number
          id: string
          net_total: number
          original_document_id: string | null
          source_order_id: string | null
          tax_point_at: string
          tax_profile_id: string
          tax_total: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          document_kind: string
          document_number: string
          external_payload?: Json | null
          external_reference?: string | null
          external_status?: string
          gross_total: number
          id?: string
          net_total: number
          original_document_id?: string | null
          source_order_id?: string | null
          tax_point_at: string
          tax_profile_id: string
          tax_total: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_kind?: string
          document_number?: string
          external_payload?: Json | null
          external_reference?: string | null
          external_status?: string
          gross_total?: number
          id?: string
          net_total?: number
          original_document_id?: string | null
          source_order_id?: string | null
          tax_point_at?: string
          tax_profile_id?: string
          tax_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_original_document_id_fkey"
            columns: ["original_document_id"]
            isOneToOne: false
            referencedRelation: "tax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "company_tax_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_jurisdictions: {
        Row: {
          active: boolean | null
          country_code: string
          created_at: string
          currency_code: string
          default_timezone: string
          id: string
          name: string
          published_at: string | null
          published_by: string | null
          retired_at: string | null
          retired_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          country_code: string
          created_at?: string
          currency_code: string
          default_timezone: string
          id?: string
          name: string
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          country_code?: string
          created_at?: string
          currency_code?: string
          default_timezone?: string
          id?: string
          name?: string
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_rate_versions: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          notes: string | null
          published_at: string
          published_by: string | null
          rate_bps: number
          tax_category_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          published_at?: string
          published_by?: string | null
          rate_bps: number
          tax_category_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          published_at?: string
          published_by?: string | null
          rate_bps?: number
          tax_category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rate_versions_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          company_id: string
          created_at: string
          display_name: string
          expires_at: string
          id: string
          invited_by: string
          last_delivery_error: string | null
          last_notified_at: string | null
          notification_version: number
          phone: string
          role_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id: string
          created_at?: string
          display_name: string
          expires_at?: string
          id?: string
          invited_by: string
          last_delivery_error?: string | null
          last_notified_at?: string | null
          notification_version?: number
          phone: string
          role_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string
          created_at?: string
          display_name?: string
          expires_at?: string
          id?: string
          invited_by?: string
          last_delivery_error?: string | null
          last_notified_at?: string | null
          notification_version?: number
          phone?: string
          role_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
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
      customer_account_balances: {
        Row: {
          company_id: string | null
          customer_id: string | null
          downpayment_balance: number | null
          net_balance: number | null
          receivable_balance: number | null
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
      customer_deposit_balances: {
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
      customer_deposit_source_balances: {
        Row: {
          amount: number | null
          available: number | null
          company_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string | null
          method_code: string | null
          reference: string | null
        }
        Insert: {
          amount?: number | null
          available?: never
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          method_code?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number | null
          available?: never
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          method_code?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
      low_stock_variants_by_location: {
        Row: {
          company_id: string | null
          location_id: string | null
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
      purchase_history: {
        Row: {
          all_in_total: number | null
          client_ref: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          credit_due_at: string | null
          expense_total: number | null
          goods_subtotal: number | null
          id: string | null
          is_credit: boolean | null
          notes: string | null
          paid: number | null
          payment_status: string | null
          purchase_date: string | null
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          separate_expense_total: number | null
          status: string | null
          stock_location_id: string | null
          supplier_id: string | null
          total_cost: number | null
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
            referencedRelation: "low_stock_variants_by_location"
            referencedColumns: ["location_id"]
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
      supplier_advance_balances: {
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
      supplier_advance_source_balances: {
        Row: {
          account_code: string | null
          amount: number | null
          available: number | null
          company_id: string | null
          created_at: string | null
          id: string | null
          reference: string | null
          supplier_id: string | null
        }
        Insert: {
          account_code?: string | null
          amount?: number | null
          available?: never
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          reference?: string | null
          supplier_id?: string | null
        }
        Update: {
          account_code?: string | null
          amount?: number | null
          available?: never
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          reference?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_ar_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_deposit_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_advances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_ap_balances"
            referencedColumns: ["supplier_id"]
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
      supplier_purchase_metrics: {
        Row: {
          average_order: number | null
          company_id: string | null
          open_purchase_count: number | null
          outstanding: number | null
          purchase_count: number | null
          supplier_id: string | null
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
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "low_stock_variants_by_location"
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
            referencedRelation: "customer_account_balances"
            referencedColumns: ["customer_id"]
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
            referencedRelation: "customer_deposit_balances"
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
            referencedRelation: "supplier_advance_balances"
            referencedColumns: ["supplier_id"]
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
      activate_intro_offer: {
        Args: {
          p_amount: number
          p_bonus_months: number
          p_company_id: string
          p_paid_months: number
          p_reference: string
          p_tier_id: string
          p_unit_price: number
        }
        Returns: string
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
      allocate_mpesa_collection: {
        Args: {
          p_collection_id: string
          p_customer_id?: string
          p_location_id?: string
          p_notes?: string
          p_order_id?: string
        }
        Returns: Json
      }
      append_catalog_import_chunk: {
        Args: { p_chunk_index: number; p_import_id: string; p_products: Json }
        Returns: Json
      }
      apply_customer_deposit: {
        Args: { p_amount: number; p_client_ref?: string; p_order_id: string }
        Returns: string
      }
      apply_role_template: { Args: { p_template_id: string }; Returns: string }
      apply_supplier_advance: {
        Args: { p_amount: number; p_client_ref?: string; p_purchase_id: string }
        Returns: string
      }
      approve_company_transition: {
        Args: { p_company_id: string; p_mode: string }
        Returns: string
      }
      approve_request: {
        Args: { p_approval_id: string; p_reason?: string }
        Returns: string
      }
      assert_approval_authority: {
        Args: { p_type: string }
        Returns: undefined
      }
      assert_customer_account_consistent: {
        Args: { p_company_id: string; p_customer_id: string }
        Returns: undefined
      }
      assert_effective_barcode_available: {
        Args: {
          p_barcode: string
          p_company_id: string
          p_exclude_variant_id: string
        }
        Returns: undefined
      }
      assert_entitled: {
        Args: { p_check?: string; p_company_id: string }
        Returns: undefined
      }
      assert_platform_admin: { Args: never; Returns: undefined }
      assert_supplier_account_consistent: {
        Args: { p_company_id: string; p_supplier_id: string }
        Returns: undefined
      }
      assert_tax_rate_window_available: {
        Args: {
          p_effective_from: string
          p_effective_to: string
          p_exclude_id?: string
          p_tax_category_id: string
        }
        Returns: undefined
      }
      assert_team_invitation_capacity: {
        Args: { p_company_id: string; p_exclude_phone?: string }
        Returns: undefined
      }
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
      assign_missing_variant_barcodes: {
        Args: { p_assignments: Json }
        Returns: {
          assigned: boolean
          barcode: string
          variant_id: string
        }[]
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
      available_tender_accounts: {
        Args: { p_location_id?: string }
        Returns: {
          account_code: string
          account_name: string
          is_default: boolean
          method_code: string
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
      build_period_closing_pack: {
        Args: { p_end_date: string; p_period_id: string; p_start_date: string }
        Returns: Json
      }
      can_approve_request_type: { Args: { p_type: string }; Returns: boolean }
      cancel_controlled_external_messages: {
        Args: {
          p_company_id: string
          p_include_manual: boolean
          p_reason: string
        }
        Returns: number
      }
      cancel_purchase_draft: { Args: { p_draft_id: string }; Returns: string }
      cancel_scheduled_company_tax_profile: {
        Args: { p_profile_id: string }
        Returns: string
      }
      cancel_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      cashier_controlled_accounts: {
        Args: {
          p_company_id: string
          p_location_id: string
          p_session_id?: string
        }
        Returns: {
          account_code: string
          account_name: string
        }[]
      }
      cashier_count_accounts: {
        Args: { p_location_id: string; p_session_id?: string }
        Returns: {
          account_code: string
          account_name: string
        }[]
      }
      cashier_expected_balances: {
        Args: { p_location_id: string; p_session_id?: string }
        Returns: {
          account_code: string
          expected_balance: number
        }[]
      }
      cashier_kes: { Args: { p_amount: number }; Returns: string }
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
          tax_category_id: string | null
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
          p_category?: string
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
      claim_public_site_deployment: { Args: never; Returns: Json }
      claim_team_invitations: { Args: never; Returns: Json }
      classify_mpesa_collection: {
        Args: {
          p_classification: string
          p_collection_id: string
          p_notes: string
        }
        Returns: undefined
      }
      cleanup_abandoned_catalog_imports: { Args: never; Returns: number }
      close_accounting_period: { Args: { p_end_date: string }; Returns: string }
      close_accounting_period_legacy: {
        Args: { p_end_date: string }
        Returns: string
      }
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
      closed_period_pack: { Args: { p_period_id: string }; Returns: Json }
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
      company_has_terms_acceptance_at_or_after: {
        Args: { p_company_id: string; p_required_version: string }
        Returns: boolean
      }
      company_subscription_accessible: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      company_tax_settings: { Args: never; Returns: Json }
      company_terms_access_allowed: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      complete_order: {
        Args: { p_actor: string; p_order_id: string; p_payments: Json }
        Returns: string
      }
      complete_order_core: {
        Args: {
          p_context: Database["public"]["CompositeTypes"]["posting_context"]
          p_order_id: string
          p_payments: Json
        }
        Returns: string
      }
      complete_order_with_prepayment: {
        Args: {
          p_client_ref?: string
          p_credit_amount: number
          p_deposit_amount: number
          p_order_id: string
          p_payments: Json
        }
        Returns: string
      }
      complete_order_with_prepayment_core: {
        Args: {
          p_client_ref: string
          p_context: Database["public"]["CompositeTypes"]["posting_context"]
          p_credit_amount: number
          p_deposit_amount: number
          p_order_id: string
          p_payments: Json
        }
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
      confirm_purchase_draft_complete: {
        Args: { p_draft_id: string }
        Returns: string
      }
      confirm_purchase_draft_with_advance: {
        Args: { p_draft_id: string }
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
      create_money_account: {
        Args: { p_kind: string; p_name: string }
        Returns: string
      }
      create_mpesa_payment_attempt: {
        Args: { p_callback_token_hash: string; p_intent_id: string }
        Returns: string
      }
      create_mpesa_payment_intent: {
        Args: {
          p_amount: number
          p_cash_amount: number
          p_client_ref: string
          p_customer_id?: string
          p_draft_id?: string
          p_lines?: Json
          p_location_id: string
          p_order_id?: string
          p_phone: string
          p_workflow: string
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
      credit_health_dashboard: { Args: { p_days?: number }; Returns: Json }
      credit_reminder_scan: { Args: never; Returns: number }
      current_access_snapshot: { Args: never; Returns: Json }
      current_company_id: { Args: never; Returns: string }
      current_company_id_unchecked: { Args: never; Returns: string }
      current_company_legal_status: { Args: never; Returns: Json }
      current_entitlements: { Args: never; Returns: Json }
      current_published_company_terms: {
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
      customer_account_status: {
        Args: { p_customer_id: string }
        Returns: {
          difference: number
          document_balance: number
          is_consistent: boolean
          ledger_balance: number
        }[]
      }
      customer_deposit_activity: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: Json
      }
      customer_deposit_available: {
        Args: { p_customer_id: string }
        Returns: number
      }
      customer_document_balance: {
        Args: { p_company_id: string; p_customer_id: string }
        Returns: number
      }
      customer_ledger_balance: {
        Args: { p_company_id: string; p_customer_id: string }
        Returns: number
      }
      customer_receipt_preview: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: Json
      }
      customer_receipt_result: { Args: { p_receipt_id: string }; Returns: Json }
      customer_statement: {
        Args: {
          p_before_date?: string
          p_before_id?: string
          p_customer_id: string
          p_limit?: number
        }
        Returns: {
          activity_kind: string
          balance: number
          credit: number
          date: string
          debit: number
          description: string
          details: Json
          has_more: boolean
          id: string
          receipt_id: string
          reference: string
        }[]
      }
      customer_statement_message_context: {
        Args: { p_channel: string; p_customer_id: string }
        Returns: Json
      }
      daily_close_status: { Args: { p_business_date?: string }; Returns: Json }
      dashboard_location_snapshot: {
        Args: { p_location_id?: string; p_since?: string }
        Returns: Json
      }
      dashboard_sales_snapshot: { Args: { p_since?: string }; Returns: Json }
      declare_mpesa_manual_fallback: {
        Args: { p_intent_id: string; p_provider_receipt: string }
        Returns: Json
      }
      delete_proforma: { Args: { p_order_id: string }; Returns: string }
      delete_stock_location: {
        Args: { p_location_id: string }
        Returns: string
      }
      deny_request: {
        Args: { p_approval_id: string; p_reason?: string }
        Returns: string
      }
      dispatch_due_platform_campaigns: { Args: never; Returns: number }
      dispatch_platform_campaign: {
        Args: { p_campaign_id: string }
        Returns: Json
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
      emit_team_invitation_event: {
        Args: { p_event: string; p_invitation_id: string; p_version: number }
        Returns: Json
      }
      estimate_order_tax: { Args: { p_order_id: string }; Returns: Json }
      execute_customer_receipt: {
        Args: { p_receipt_id: string }
        Returns: string
      }
      execute_customer_receipt_core: {
        Args: {
          p_context: Database["public"]["CompositeTypes"]["posting_context"]
          p_receipt_id: string
        }
        Returns: string
      }
      execute_customer_receipt_reversal: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: string
      }
      execute_full_credit_note: {
        Args: {
          p_method_code: string
          p_order_id: string
          p_reason: string
          p_stock_outcome: string
        }
        Returns: string
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
      external_document_context: {
        Args: {
          p_channel: string
          p_document_type: string
          p_include_company_copy?: boolean
          p_subject_id: string
        }
        Returns: Json
      }
      external_messaging_allowed: {
        Args: { p_automated: boolean; p_company_id: string }
        Returns: boolean
      }
      feature_enabled: {
        Args: { p_company_id: string; p_feature: string }
        Returns: boolean
      }
      finalize_campaign_recipient: {
        Args: { p_recipient_id: string; p_status: string }
        Returns: undefined
      }
      finalize_catalog_import: { Args: { p_import_id: string }; Returns: Json }
      finalize_message_quota: {
        Args: { p_accepted: boolean; p_outbox_id: string }
        Returns: undefined
      }
      finalize_mpesa_cash_split: {
        Args: { p_intent_id: string }
        Returns: string
      }
      finalize_public_site_deployment: {
        Args: {
          p_deployment_id: string
          p_error_summary?: string
          p_status: string
        }
        Returns: boolean
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
      invite_team_member: {
        Args: { p_display_name: string; p_phone: string; p_role_id: string }
        Returns: Json
      }
      is_approved_member: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_valid_legal_document_version: {
        Args: { p_version: string }
        Returns: boolean
      }
      issue_customer_statement_link: {
        Args: {
          p_company_id: string
          p_created_by?: string
          p_customer_id: string
          p_source?: string
        }
        Returns: string
      }
      journal_entry_payload_hash: {
        Args: { p_entry_id: string }
        Returns: string
      }
      journal_payload_hash: {
        Args: { p_entry_date: string; p_lines: Json; p_memo: string }
        Returns: string
      }
      jsonb_uuid_array_contains: {
        Args: { p_id: string; p_value: Json }
        Returns: boolean
      }
      latest_required_company_terms: {
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
      list_mpesa_provider_event_reviews: {
        Args: { p_limit?: number }
        Returns: {
          allowed_actions: string[]
          attempt_id: string
          collection_id: string
          error: string
          event_type: string
          id: string
          intent_id: string
          processing_attempts: number
          provider_account_id: string
          provider_account_name: string
          provider_event_key: string
          received_at: string
          result_code: string
        }[]
      }
      list_reconcilable_accounts: {
        Args: { p_location_id?: string }
        Returns: {
          account_code: string
          account_name: string
          balance: number
          balance_scope: string
          blocked_reason: string
          can_adjust: boolean
          last_reconciled_at: string
          location_id: string
          location_name: string
          requires_reconciliation: boolean
        }[]
      }
      list_reversible_mpesa_collections: {
        Args: { p_limit?: number }
        Returns: {
          allocation_id: string
          amount: number
          collection_id: string
          customer_receipt_id: string
          occurred_at: string
          order_code: string
          provider_receipt: string
        }[]
      }
      list_unallocated_mpesa_collections: {
        Args: { p_before?: string; p_limit?: number }
        Returns: {
          account_reference: string
          allocation_status: string
          allowed_actions: string[]
          amount: number
          classification: string
          created_at: string
          id: string
          intent_id: string
          late_review_id: string
          notes: string
          occurred_at: string
          payer_name: string
          payer_phone: string
          provider_account_id: string
          provider_receipt: string
          provider_status: string
          queue_reason: string
          review_reason: string
          source: string
          verification_status: string
        }[]
      }
      location_account_balance: {
        Args: { p_code: string; p_company_id: string; p_location_id: string }
        Returns: number
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
      lock_customer_account: {
        Args: { p_company_id: string; p_customer_id: string }
        Returns: undefined
      }
      mpesa_apply_collection_to_intent: {
        Args: {
          p_attempt_id: string
          p_collection_id: string
          p_intent_id: string
        }
        Returns: Json
      }
      mpesa_availability: { Args: { p_location_id: string }; Returns: Json }
      mpesa_claim_provider_events: {
        Args: { p_limit?: number }
        Returns: {
          attempt_id: string
          event_type: string
          id: string
          payload: Json
          processing_attempts: number
          provider_account_id: string
        }[]
      }
      mpesa_claim_status_queries: {
        Args: { p_limit?: number }
        Returns: {
          attempt_id: string
          checkout_request_id: string
        }[]
      }
      mpesa_commissioning_state: {
        Args: { p_request_id: string }
        Returns: Json
      }
      mpesa_complete_provider_event: {
        Args: {
          p_collection_id?: string
          p_event_id: string
          p_result_code?: string
        }
        Returns: undefined
      }
      mpesa_finalize_stk_success: {
        Args: {
          p_amount: number
          p_attempt_id: string
          p_occurred_at: string
          p_payer_name?: string
          p_payer_phone: string
          p_provider_receipt: string
        }
        Returns: Json
      }
      mpesa_finalize_stk_terminal: {
        Args: {
          p_attempt_id: string
          p_description: string
          p_result_code: string
        }
        Returns: undefined
      }
      mpesa_ingest_provider_event: {
        Args: {
          p_event_key: string
          p_event_type: string
          p_payload: Json
          p_payload_sha256: string
          p_token_hash: string
        }
        Returns: string
      }
      mpesa_intent_status: { Args: { p_intent_id: string }; Returns: Json }
      mpesa_latest_trusted_callback_payload: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      mpesa_post_reserved_allocation: {
        Args: {
          p_additional_payments?: Json
          p_allocation_id: string
          p_collection_id: string
          p_context: Database["public"]["CompositeTypes"]["posting_context"]
        }
        Returns: undefined
      }
      mpesa_private_connection: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      mpesa_private_for_attempt: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      mpesa_record_c2b_collection: {
        Args: {
          p_account_reference: string
          p_amount: number
          p_occurred_at: string
          p_payer_name: string
          p_payer_phone: string
          p_provider_account_id: string
          p_provider_receipt: string
        }
        Returns: Json
      }
      mpesa_record_query_pending: {
        Args: {
          p_attempt_id: string
          p_description: string
          p_result_code: string
        }
        Returns: undefined
      }
      mpesa_record_request_unknown: {
        Args: { p_attempt_id: string; p_description: string }
        Returns: undefined
      }
      mpesa_record_stk_request: {
        Args: {
          p_attempt_id: string
          p_checkout_request_id: string
          p_customer_message: string
          p_merchant_request_id: string
          p_response_code: string
          p_response_description: string
        }
        Returns: undefined
      }
      mpesa_retry_provider_event: {
        Args: { p_error: string; p_event_id: string; p_terminal?: boolean }
        Returns: undefined
      }
      mpesa_setup_status: { Args: never; Returns: Json }
      mpesa_transition_intent: {
        Args: {
          p_attempt_id: string
          p_collection_id?: string
          p_expected_version: number
          p_from: string[]
          p_intent_id: string
          p_result_code?: string
          p_result_description?: string
          p_review_reason?: string
          p_to: string
        }
        Returns: number
      }
      mpesa_upsert_collection: {
        Args: {
          p_account_reference: string
          p_amount: number
          p_created_by?: string
          p_intent_id?: string
          p_occurred_at: string
          p_payer_name: string
          p_payer_phone: string
          p_provider_account_id: string
          p_provider_receipt: string
          p_source: string
          p_verification_status: string
        }
        Returns: Json
      }
      my_companies: {
        Args: never
        Returns: {
          code: string
          company_id: string
          is_active: boolean
          name: string
          role_name: string
          status: string
        }[]
      }
      next_monthly_anniversary: {
        Args: { p_after?: string; p_anchor: string }
        Returns: string
      }
      next_tax_document_number: {
        Args: {
          p_company_id: string
          p_document_kind: string
          p_tax_point: string
        }
        Returns: string
      }
      normalize_legal_markdown: { Args: { p_content: string }; Returns: string }
      normalize_team_phone: { Args: { p_phone: string }; Returns: string }
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
      notify_once: {
        Args: {
          p_body: string
          p_company_id: string
          p_dedupe_key: string
          p_link: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      open_cashier_session: { Args: { p_declarations: Json }; Returns: string }
      open_cashier_session_at_location: {
        Args: { p_declarations: Json; p_location_id: string }
        Returns: string
      }
      order_posting_context: {
        Args: { p_order_id: string; p_source?: string }
        Returns: Database["public"]["CompositeTypes"]["posting_context"]
        SetofOptions: {
          from: "*"
          to: "posting_context"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      order_vat_reporting_date: {
        Args: { p_order_id: string; p_tax_point: string; p_timezone: string }
        Returns: string
      }
      patch_product_categories: {
        Args: {
          p_add_category_ids?: string[]
          p_product_ids: string[]
          p_remove_category_ids?: string[]
        }
        Returns: Json
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
      period_close_readiness: { Args: { p_end_date?: string }; Returns: Json }
      platform_acknowledge_registration_alert: {
        Args: { p_alert_id: string }
        Returns: boolean
      }
      platform_activate_mpesa_c2b_token: {
        Args: { p_token_id: string }
        Returns: undefined
      }
      platform_advance_mpesa_request: {
        Args: { p_action: string; p_notes?: string; p_request_id: string }
        Returns: undefined
      }
      platform_archive_blog_post: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      platform_blog_metrics: {
        Args: { p_post_id?: string; p_since?: string }
        Returns: Json
      }
      platform_blog_post: { Args: { p_post_id: string }; Returns: Json }
      platform_blog_posts: { Args: never; Returns: Json }
      platform_campaign_metrics: {
        Args: { p_campaign_id: string }
        Returns: Json
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
      platform_cancel_campaign: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      platform_cancel_mpesa_c2b_token: {
        Args: { p_token_id: string }
        Returns: undefined
      }
      platform_cancel_scheduled_blog_post: {
        Args: { p_post_id: string }
        Returns: boolean
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
      platform_configure_mpesa_connection: {
        Args: {
          p_app_name: string
          p_business_shortcode: string
          p_consumer_key: string
          p_consumer_secret: string
          p_daraja_app_id?: string
          p_environment: string
          p_location_ids?: string[]
          p_organization_shortcode: string
          p_party_b: string
          p_passkey: string
          p_request_id: string
        }
        Returns: string
      }
      platform_create_mpesa_test_attempt: {
        Args: {
          p_amount: number
          p_callback_token_hash: string
          p_connection_id: string
          p_phone: string
        }
        Returns: string
      }
      platform_delete_blog_post: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      platform_discard_legal_draft: {
        Args: { p_id: string }
        Returns: undefined
      }
      platform_duplicate_campaign: {
        Args: { p_campaign_id: string }
        Returns: string
      }
      platform_external_communication_metrics: {
        Args: { p_since?: string }
        Returns: Json
      }
      platform_feature_blog_post: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      platform_launch_campaign: {
        Args: { p_campaign_id: string; p_scheduled_for?: string }
        Returns: Json
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
      platform_mpesa_overview: { Args: never; Returns: Json }
      platform_operations_snapshot: { Args: never; Returns: Json }
      platform_prepare_mpesa_c2b_token: {
        Args: { p_callback_token_hash: string; p_connection_id: string }
        Returns: string
      }
      platform_publish_blog_post: { Args: { p_post_id: string }; Returns: Json }
      platform_publish_legal_document: {
        Args: { p_expected_sha256: string; p_id: string }
        Returns: Json
      }
      platform_publish_tax_category: {
        Args: { p_effective_from: string; p_tax_category_id: string }
        Returns: string
      }
      platform_publish_tax_package: {
        Args: { p_jurisdiction_id: string }
        Returns: Json
      }
      platform_publish_tax_rate_version: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_notes?: string
          p_rate_bps: number
          p_tax_category_id: string
        }
        Returns: string
      }
      platform_registration_alerts: {
        Args: { p_limit?: number }
        Returns: Json
      }
      platform_registration_config: { Args: never; Returns: Json }
      platform_retire_tax_category: {
        Args: { p_effective_to: string; p_tax_category_id: string }
        Returns: string
      }
      platform_retire_tax_jurisdiction: {
        Args: { p_jurisdiction_id: string }
        Returns: string
      }
      platform_review_campaign: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      platform_save_blog_draft: {
        Args: {
          p_author_name: string
          p_content_markdown: string
          p_cover_image_alt?: string
          p_cover_image_path?: string
          p_excerpt: string
          p_post_id: string
          p_seo_description?: string
          p_seo_title?: string
          p_slug: string
          p_tags?: string[]
          p_title: string
        }
        Returns: Json
      }
      platform_save_campaign_draft: {
        Args: {
          p_audience?: string
          p_body: string
          p_campaign_id?: string
          p_channel: string
          p_company_ids?: string[]
          p_cta_label?: string
          p_cta_link?: string
          p_name: string
          p_subscription_status?: string
          p_tier_id?: string
          p_title: string
        }
        Returns: string
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
      platform_schedule_blog_post: {
        Args: { p_post_id: string; p_scheduled_for: string }
        Returns: Json
      }
      platform_set_company_automation_override: {
        Args: { p_company_id: string; p_override?: boolean }
        Returns: number
      }
      platform_set_company_status: {
        Args: { p_company_id: string; p_status: string }
        Returns: string
      }
      platform_set_external_messaging: {
        Args: { p_enabled: boolean }
        Returns: number
      }
      platform_set_mpesa_settings: {
        Args: {
          p_enabled: boolean
          p_manual_fallback_allowed: boolean
          p_pilot_company_id?: string
        }
        Returns: undefined
      }
      platform_site_deployments: { Args: never; Returns: Json }
      platform_stats: { Args: never; Returns: Json }
      platform_tax_catalog: { Args: never; Returns: Json }
      platform_tax_package_readiness: {
        Args: { p_jurisdiction_id: string }
        Returns: Json
      }
      platform_update_billing_config: {
        Args: { p_default_trial_tier_id: string; p_trial_duration_days: number }
        Returns: Json
      }
      platform_update_billing_policy: {
        Args: {
          p_default_trial_tier_id: string
          p_intro_offer_bonus_months: number
          p_intro_offer_enabled: boolean
          p_intro_offer_paid_months: number
          p_intro_offer_tier_id: string
          p_trial_duration_days: number
        }
        Returns: Json
      }
      platform_update_mpesa_connection: {
        Args: {
          p_action: string
          p_collection_id?: string
          p_connection_id: string
          p_fallback_until?: string
          p_notes?: string
        }
        Returns: undefined
      }
      platform_update_registration_config: {
        Args: {
          p_automatic_company_approval_enabled: boolean
          p_daily_alert_threshold: number
          p_hourly_alert_threshold: number
        }
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
      platform_upsert_tax_category: {
        Args: {
          p_active?: boolean
          p_classification: string
          p_code: string
          p_is_default?: boolean
          p_jurisdiction_id: string
          p_name: string
        }
        Returns: string
      }
      platform_upsert_tax_jurisdiction: {
        Args: {
          p_active?: boolean
          p_country_code: string
          p_currency_code: string
          p_default_timezone: string
          p_name: string
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
      pos_device_heartbeat: {
        Args: {
          p_device_key: string
          p_location_id: string
          p_pending_count: number
          p_synced?: boolean
        }
        Returns: string
      }
      post_balance_adjustment: {
        Args: { p_amount: number; p_customer_id: string; p_reason: string }
        Returns: string
      }
      post_credit_sale_at_location: {
        Args: {
          p_approval_reason?: string
          p_client_ref?: string
          p_customer_id: string
          p_draft_id?: string
          p_lines: Json
          p_location_id: string
        }
        Returns: Json
      }
      post_customer_deposit_refund: {
        Args: {
          p_amount: number
          p_client_ref?: string
          p_customer_id: string
          p_location_id?: string
          p_method_code?: string
          p_reason: string
          p_reference?: string
        }
        Returns: Json
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
      post_customer_receipt: {
        Args: {
          p_amount: number
          p_client_ref?: string
          p_customer_id: string
          p_location_id: string
          p_method_code: string
          p_reference?: string
        }
        Returns: Json
      }
      post_customer_receipt_reversal: {
        Args: { p_reason: string; p_receipt_id: string }
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
      post_expense_with_tax: {
        Args: {
          p_amount: number
          p_category?: string
          p_claim_input_vat?: boolean
          p_expense_date?: string
          p_memo?: string
          p_source_account_code: string
          p_supplier_tax_pin?: string
          p_tax_category_id?: string
          p_tax_invoice_date?: string
          p_tax_invoice_number?: string
        }
        Returns: string
      }
      post_full_refund: {
        Args: {
          p_method_code: string
          p_order_id: string
          p_reason: string
          p_stock_outcome: string
        }
        Returns: Json
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
      post_journal_entry_with_context: {
        Args: {
          p_company_id: string
          p_context: Database["public"]["CompositeTypes"]["posting_context"]
          p_lines: Json
          p_memo: string
          p_source_id: string
          p_source_type: string
        }
        Returns: string
      }
      post_location_variance_adjustment: {
        Args: {
          p_account_code: string
          p_company_id: string
          p_count_id: string
          p_declared: number
          p_location_id: string
          p_reason?: string
          p_session_id: string
        }
        Returns: string
      }
      post_manual_location_variance_adjustment: {
        Args: {
          p_account_code: string
          p_company_id: string
          p_declared: number
          p_location_id: string
          p_reason: string
          p_reconciliation_id: string
        }
        Returns: string
      }
      post_offline_sale_at_location: {
        Args: {
          p_client_ref: string
          p_customer_id: string
          p_device_key: string
          p_draft_id?: string
          p_lines: Json
          p_location_id: string
          p_occurred_at: string
          p_payments: Json
          p_pending_count?: number
        }
        Returns: Json
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
      post_sale_with_prepayment_at_location: {
        Args: {
          p_client_ref?: string
          p_credit_amount: number
          p_customer_id: string
          p_deposit_amount: number
          p_draft_id?: string
          p_lines: Json
          p_location_id: string
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
      post_supplier_fifo_payment: {
        Args: {
          p_account_code: string
          p_amount: number
          p_client_ref: string
          p_supplier_id: string
        }
        Returns: string
      }
      post_supplier_payment: {
        Args: {
          p_account_code: string
          p_amount: number
          p_client_ref?: string
          p_purchase_id: string
          p_supplier_id: string
        }
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
      prepare_controlled_outbox_delivery: {
        Args: { p_outbox_id: string }
        Returns: boolean
      }
      prepare_mpesa_checkout: {
        Args: {
          p_amount: number
          p_cash_amount: number
          p_client_ref: string
          p_customer_id?: string
          p_draft_id?: string
          p_lines?: Json
          p_location_id: string
          p_order_id?: string
          p_phone: string
          p_retry?: boolean
          p_workflow: string
        }
        Returns: Json
      }
      prepayment_money_account: {
        Args: {
          p_account_code: string
          p_location_id: string
          p_reference?: string
        }
        Returns: string
      }
      prepayment_tender_account: {
        Args: {
          p_location_id: string
          p_method_code: string
          p_reference?: string
        }
        Returns: string
      }
      preview_customer_statement: {
        Args: { p_channel: string; p_customer_id: string }
        Returns: Json
      }
      preview_external_document: {
        Args: {
          p_channel: string
          p_document_type: string
          p_include_company_copy?: boolean
          p_subject_id: string
        }
        Returns: Json
      }
      primary_contact_notification_preferences: {
        Args: { p_company_id: string }
        Returns: Json
      }
      primary_contact_notification_settings: { Args: never; Returns: Json }
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
      provision_company_registration: {
        Args: {
          p_address?: string
          p_blog_ref?: string
          p_company_name: string
          p_currency?: string
          p_email?: string
          p_owner_name?: string
          p_store_name?: string
          p_terms_content_sha256?: string
          p_terms_version?: string
          p_trial_tier_code?: string
        }
        Returns: Json
      }
      provision_company_registration_core: {
        Args: {
          p_address: string
          p_blog_ref: string
          p_company_name: string
          p_currency: string
          p_email: string
          p_owner_name: string
          p_store_name: string
          p_terms_content_sha256: string
          p_terms_version: string
          p_trial_tier_code: string
        }
        Returns: Json
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
      public_blog_post: { Args: { p_slug: string }; Returns: Json }
      public_blog_posts: {
        Args: {
          p_before?: string
          p_before_id?: string
          p_limit?: number
          p_tag?: string
        }
        Returns: Json
      }
      public_blog_sitemap: { Args: never; Returns: Json }
      public_customer_statement: {
        Args: {
          p_before_date?: string
          p_before_id?: string
          p_limit?: number
          p_token: string
        }
        Returns: Json
      }
      public_external_document: { Args: { p_token: string }; Returns: Json }
      public_featured_blog_post: { Args: never; Returns: Json }
      public_storefront_sitemap: { Args: never; Returns: Json }
      publish_due_blog_posts: { Args: never; Returns: number }
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
      purge_mpesa_raw_payloads: { Args: never; Returns: number }
      queue_cashier_session_notification: {
        Args: { p_event: string; p_session_id: string }
        Returns: string
      }
      queue_manual_document_message: {
        Args: {
          p_body: string
          p_bypass_quiet_hours?: boolean
          p_channel: string
          p_company_id: string
          p_recipient: string
          p_subject?: string
        }
        Returns: string
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
      queue_mpesa_processor: { Args: never; Returns: undefined }
      queue_sms_fallback: { Args: { p_outbox_id: string }; Returns: string }
      queue_team_outbox: {
        Args: {
          p_body: string
          p_channel: string
          p_company_id: string
          p_dedupe_key: string
          p_fallback_body?: string
          p_invitation_id: string
          p_recipient: string
          p_subject: string
          p_template_key: string
        }
        Returns: string
      }
      reconcile_all_company_usage: { Args: never; Returns: number }
      reconcile_company_usage: {
        Args: { p_company_id?: string }
        Returns: number
      }
      reconcile_platform_campaign_deliveries: { Args: never; Returns: number }
      reconcile_runtime_sms_quota: {
        Args: { p_final_body: string; p_outbox_id: string }
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
      record_blog_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_metadata?: Json
          p_post_id: string
          p_visitor_id: string
        }
        Returns: boolean
      }
      record_customer_deposit: {
        Args: {
          p_amount: number
          p_client_ref?: string
          p_customer_id: string
          p_location_id?: string
          p_method_code: string
          p_reference?: string
        }
        Returns: string
      }
      record_manual_reconciliation: {
        Args: { p_declarations: Json; p_location_id?: string }
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
      record_notification_click: {
        Args: { p_notification_id: string }
        Returns: boolean
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
      record_purchase_complete: {
        Args: {
          p_account_code?: string
          p_expenses?: Json
          p_lines: Json
          p_notes?: string
          p_payment_amount?: number
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      record_purchase_complete_with_tax: {
        Args: {
          p_account_code?: string
          p_claim_input_vat?: boolean
          p_expenses?: Json
          p_lines: Json
          p_notes?: string
          p_payment_amount?: number
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
          p_supplier_tax_pin?: string
          p_tax_invoice_date?: string
          p_tax_invoice_number?: string
        }
        Returns: string
      }
      record_purchase_with_advance: {
        Args: {
          p_account_code?: string
          p_advance_amount?: number
          p_client_ref?: string
          p_credit_amount?: number
          p_expenses?: Json
          p_lines: Json
          p_notes?: string
          p_payment_amount?: number
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
      record_supplier_advance: {
        Args: {
          p_account_code: string
          p_amount: number
          p_client_ref?: string
          p_location_id?: string
          p_reference?: string
          p_supplier_id: string
        }
        Returns: string
      }
      record_supplier_advance_return: {
        Args: {
          p_account_code: string
          p_amount: number
          p_client_ref?: string
          p_location_id?: string
          p_reason: string
          p_reference?: string
          p_supplier_id: string
        }
        Returns: string
      }
      refresh_analytics: { Args: never; Returns: undefined }
      refresh_auth_otp_delivery_status: { Args: never; Returns: number }
      refresh_blog_daily_metrics: { Args: never; Returns: number }
      refresh_catalog_search_product: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      refresh_catalog_search_variant: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      refresh_payment_collection_status: {
        Args: { p_collection_id: string }
        Returns: undefined
      }
      refund_customer_deposit: {
        Args: {
          p_amount: number
          p_client_ref?: string
          p_customer_id: string
          p_location_id?: string
          p_method_code?: string
          p_reason: string
          p_reference?: string
        }
        Returns: string
      }
      remove_team_member: { Args: { p_membership_id: string }; Returns: string }
      render_customer_statement_message: {
        Args: { p_context: Json; p_url: string }
        Returns: Json
      }
      render_external_document_message: {
        Args: { p_context: Json; p_copy: boolean; p_url: string }
        Returns: Json
      }
      render_message_template: {
        Args: { p_body: string; p_values: Json }
        Returns: string
      }
      request_mpesa_onboarding: {
        Args: {
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_legal_name: string
          p_location_ids?: string[]
          p_mpesa_username: string
          p_notes?: string
          p_shortcode: string
          p_shortcode_type: string
        }
        Returns: string
      }
      request_mpesa_reversal: {
        Args: {
          p_collection_id: string
          p_provider_reference: string
          p_provider_reversed_at: string
          p_reason: string
        }
        Returns: Json
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
      require_open_cashier_session_at_location: {
        Args: { p_company_id: string; p_location_id: string }
        Returns: string
      }
      resend_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      reserve_message_quota: {
        Args: { p_channel: string; p_company_id: string; p_units: number }
        Returns: undefined
      }
      reset_communication_period_locked: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      resolve_business_location: {
        Args: { p_location_id?: string }
        Returns: string
      }
      resolve_catalog_barcode: {
        Args: { p_barcode: string; p_location_id?: string }
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
      resolve_category_inclusive_tax: {
        Args: {
          p_company_id: string
          p_gross: number
          p_tax_category_id: string
          p_tax_point: string
        }
        Returns: {
          gross_total: number
          net_total: number
          tax_category_code: string
          tax_category_id: string
          tax_classification: string
          tax_profile_id: string
          tax_rate_bps: number
          tax_rate_version_id: string
          tax_total: number
          vat_registered: boolean
        }[]
      }
      resolve_inclusive_tax: {
        Args: {
          p_company_id: string
          p_gross: number
          p_product_id: string
          p_tax_point: string
        }
        Returns: {
          gross_total: number
          net_total: number
          tax_category_code: string
          tax_category_id: string
          tax_classification: string
          tax_profile_id: string
          tax_rate_bps: number
          tax_rate_version_id: string
          tax_total: number
          vat_registered: boolean
        }[]
      }
      resolve_platform_campaign_recipient: {
        Args: { p_company_id: string }
        Returns: Json
      }
      resolve_tender_account: {
        Args: {
          p_company_id: string
          p_location_id: string
          p_method_code: string
          p_requested_account_code?: string
        }
        Returns: string
      }
      retire_pos_device: {
        Args: { p_device_id: string; p_reason: string }
        Returns: string
      }
      retry_mpesa_collection_posting: {
        Args: { p_collection_id: string }
        Returns: Json
      }
      reverse_credit_purchase: {
        Args: { p_purchase_id: string; p_reason: string }
        Returns: string
      }
      reverse_customer_deposit_application: {
        Args: { p_application_id: string; p_reason: string }
        Returns: string
      }
      reverse_supplier_advance_application: {
        Args: { p_application_id: string; p_reason: string }
        Returns: string
      }
      reverse_supplier_payment: {
        Args: { p_reason: string; p_supplier_payment_id: string }
        Returns: string
      }
      revert_variance: {
        Args: { p_reason?: string; p_recon_account_id: string }
        Returns: string
      }
      review_late_sale: {
        Args: { p_approve: boolean; p_reason?: string; p_review_id: string }
        Returns: Json
      }
      review_mpesa_late_posting: {
        Args: { p_approve: boolean; p_notes?: string; p_review_id: string }
        Returns: Json
      }
      review_mpesa_provider_event: {
        Args: { p_action: string; p_event_id: string; p_notes: string }
        Returns: Json
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
      save_purchase_draft_complete: {
        Args: {
          p_account_code?: string
          p_draft_id?: string
          p_expenses?: Json
          p_lines: Json
          p_notes?: string
          p_payment_amount?: number
          p_payment_mode?: string
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      save_purchase_draft_with_advance: {
        Args: {
          p_account_code?: string
          p_advance_amount?: number
          p_client_ref?: string
          p_draft_id?: string
          p_expenses?: Json
          p_lines: Json
          p_notes?: string
          p_payment_amount?: number
          p_purchase_date?: string
          p_reference?: string
          p_stock_location_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      scan_registration_volume_alerts: { Args: never; Returns: number }
      schedule_company_tax_profile: {
        Args: {
          p_default_tax_category_id: string
          p_effective_from: string
          p_jurisdiction_id: string
          p_tax_registration_number: string
          p_vat_registered: boolean
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
      send_customer_statement: {
        Args: {
          p_bypass_quiet_hours?: boolean
          p_channel: string
          p_customer_id: string
        }
        Returns: Json
      }
      send_external_document: {
        Args: {
          p_bypass_quiet_hours?: boolean
          p_channel: string
          p_document_type: string
          p_include_company_copy?: boolean
          p_subject_id: string
        }
        Returns: Json
      }
      send_sms_hook: { Args: { event: Json }; Returns: Json }
      set_automated_customer_notifications: {
        Args: { p_enabled: boolean }
        Returns: number
      }
      set_commissions_enabled: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      set_company_primary_contact: {
        Args: { p_user_id: string }
        Returns: string
      }
      set_customer_deleted: {
        Args: { p_customer_id: string; p_deleted?: boolean }
        Returns: string
      }
      set_location_payment_account: {
        Args: {
          p_account_code: string
          p_location_id: string
          p_method_code: string
        }
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
      set_primary_contact_notification_preferences: {
        Args: {
          p_cashier_enabled: boolean
          p_channel: string
          p_team_enabled: boolean
        }
        Returns: Json
      }
      set_product_categories: {
        Args: { p_category_ids: string[]; p_product_id: string }
        Returns: string
      }
      set_product_tax_category: {
        Args: { p_product_id: string; p_tax_category_id?: string }
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
      sign_off_business_day: {
        Args: { p_business_date: string }
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
      storefront_catalog_page: {
        Args: {
          p_category_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_slug: string
        }
        Returns: {
          available: boolean
          image_path: string
          kind: string
          manufacturer_id: string
          manufacturer_name: string
          price: number
          product_id: string
          product_name: string
          sku: string
          total_count: number
          variant_id: string
          variant_name: string
        }[]
      }
      storefront_catalogue_visible: {
        Args: { c: Database["public"]["Tables"]["companies"]["Row"] }
        Returns: boolean
      }
      storefront_categories: {
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
          to: "categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      storefront_product: {
        Args: { p_product_id: string; p_slug: string }
        Returns: {
          available: boolean
          image_path: string
          kind: string
          manufacturer_id: string
          manufacturer_name: string
          price: number
          product_id: string
          product_name: string
          sku: string
          total_count: number
          variant_id: string
          variant_name: string
        }[]
      }
      subscription_expiry_scan: { Args: never; Returns: number }
      supplier_account_status: {
        Args: { p_supplier_id: string }
        Returns: {
          difference: number
          document_balance: number
          is_consistent: boolean
          ledger_balance: number
        }[]
      }
      supplier_advance_activity: {
        Args: { p_limit?: number; p_supplier_id: string }
        Returns: Json
      }
      supplier_advance_available: {
        Args: { p_supplier_id: string }
        Returns: number
      }
      supplier_document_balance: {
        Args: { p_company_id: string; p_supplier_id: string }
        Returns: number
      }
      supplier_ledger_balance: {
        Args: { p_company_id: string; p_supplier_id: string }
        Returns: number
      }
      sweep_mpesa_processing: { Args: never; Returns: undefined }
      sync_cache_stream: {
        Args: { p_after_sequence?: number; p_limit?: number; p_stream: string }
        Returns: Json
      }
      team_delivery_error_code: { Args: { p_error: string }; Returns: string }
      team_invitation_delivery_status: {
        Args: { p_invitation_id: string; p_version: number }
        Returns: Json
      }
      team_management_snapshot: { Args: never; Returns: Json }
      transfer_stock: {
        Args: {
          p_from_location_id: string
          p_lines: Json
          p_notes?: string
          p_to_location_id: string
        }
        Returns: string
      }
      trigger_public_site_deploy: { Args: never; Returns: undefined }
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
      update_money_account: {
        Args: { p_account_id: string; p_is_active?: boolean; p_name?: string }
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
      update_tax_print_settings: {
        Args: { p_show_vat_breakdown: boolean }
        Returns: boolean
      }
      update_team_member: {
        Args: {
          p_authorization_status?: string
          p_membership_id: string
          p_role_id?: string
        }
        Returns: string
      }
      upsert_category: {
        Args: {
          p_active?: boolean
          p_category_id?: string
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
      user_has_company_permission_unchecked: {
        Args: { p_company_id: string; p_permission: string }
        Returns: boolean
      }
      validate_blog_fields: {
        Args: {
          p_author_name: string
          p_content_markdown: string
          p_cover_image_alt: string
          p_cover_image_path: string
          p_excerpt: string
          p_seo_description: string
          p_seo_title: string
          p_slug: string
          p_tags: string[]
          p_title: string
        }
        Returns: undefined
      }
      validate_cashier_declarations:
        | {
            Args: {
              p_company_id: string
              p_declarations: Json
              p_location_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_company_id: string
              p_declarations: Json
              p_location_id: string
              p_session_id: string
            }
            Returns: undefined
          }
      validate_platform_campaign: {
        Args: {
          p_audience: string
          p_body: string
          p_channel: string
          p_company_ids: string[]
          p_cta_label: string
          p_cta_link: string
          p_name: string
          p_subscription_status: string
          p_tier_id: string
          p_title: string
        }
        Returns: undefined
      }
      vat_late_transaction_schedule: {
        Args: {
          p_company_id: string
          p_end_date: string
          p_start_date: string
          p_timezone: string
        }
        Returns: Json
      }
      vat_report: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
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
      posting_context: {
        company_id: string | null
        location_id: string | null
        actor_id: string | null
        cashier_session_id: string | null
        occurred_at: string | null
        posting_date: string | null
        source: string | null
        late_reason: string | null
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
    Enums: {},
  },
} as const

