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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      comments: {
        Row: {
          body: string
          content_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          body: string
          content_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          content_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      content_attachments: {
        Row: {
          content_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_attachments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          body: Json | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          parent_id: string
          title: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          body?: Json | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          parent_id: string
          title?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          body?: Json | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          parent_id?: string
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      customs: {
        Row: {
          created_at: string | null
          created_by: string | null
          customs_date: string | null
          customs_fee: Json | null
          customs_no: string | null
          deleted_at: string | null
          etc_desc: string | null
          etc_fee: Json | null
          fee_received: boolean | null
          id: string
          shipping_doc_id: string | null
          transport_fee: Json | null
          updated_at: string | null
          vat_fee: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customs_date?: string | null
          customs_fee?: Json | null
          customs_no?: string | null
          deleted_at?: string | null
          etc_desc?: string | null
          etc_fee?: Json | null
          fee_received?: boolean | null
          id?: string
          shipping_doc_id?: string | null
          transport_fee?: Json | null
          updated_at?: string | null
          vat_fee?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customs_date?: string | null
          customs_fee?: Json | null
          customs_no?: string | null
          deleted_at?: string | null
          etc_desc?: string | null
          etc_fee?: Json | null
          fee_received?: boolean | null
          id?: string
          shipping_doc_id?: string | null
          transport_fee?: Json | null
          updated_at?: string | null
          vat_fee?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "customs_shipping_doc_id_fkey"
            columns: ["shipping_doc_id"]
            isOneToOne: false
            referencedRelation: "shipping_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          delivery_date: string | null
          id: string
          pi_id: string | null
          shipping_doc_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          id?: string
          pi_id?: string | null
          shipping_doc_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          id?: string
          pi_id?: string | null
          shipping_doc_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "proforma_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_shipping_doc_id_fkey"
            columns: ["shipping_doc_id"]
            isOneToOne: false
            referencedRelation: "shipping_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_change_requests: {
        Row: {
          created_at: string | null
          delivery_id: string | null
          id: string
          reason: string | null
          requested_by: string | null
          requested_date: string
          responded_by: string | null
          response_text: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_id?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          requested_date: string
          responded_by?: string | null
          response_text?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_id?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          requested_date?: string
          responded_by?: string | null
          response_text?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_change_requests_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          doc_prefix: string
          doc_yymm: string
          seq_no: number
        }
        Insert: {
          doc_prefix: string
          doc_yymm: string
          seq_no?: number
        }
        Update: {
          doc_prefix?: string
          doc_yymm?: string
          seq_no?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          advice_date: string | null
          arrival_date: string | null
          created_at: string | null
          created_by: string | null
          customs_fee_received: boolean | null
          customs_id: string | null
          deleted_at: string | null
          delivery_date: string | null
          delivery_id: string | null
          id: string
          pi_id: string | null
          po_id: string | null
          saelim_no: string | null
          shipping_doc_id: string | null
          updated_at: string | null
        }
        Insert: {
          advice_date?: string | null
          arrival_date?: string | null
          created_at?: string | null
          created_by?: string | null
          customs_fee_received?: boolean | null
          customs_id?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          delivery_id?: string | null
          id?: string
          pi_id?: string | null
          po_id?: string | null
          saelim_no?: string | null
          shipping_doc_id?: string | null
          updated_at?: string | null
        }
        Update: {
          advice_date?: string | null
          arrival_date?: string | null
          created_at?: string | null
          created_by?: string | null
          customs_fee_received?: boolean | null
          customs_id?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          delivery_id?: string | null
          id?: string
          pi_id?: string | null
          po_id?: string | null
          saelim_no?: string | null
          shipping_doc_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customs_id_fkey"
            columns: ["customs_id"]
            isOneToOne: false
            referencedRelation: "customs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "proforma_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_doc_id_fkey"
            columns: ["shipping_doc_id"]
            isOneToOne: false
            referencedRelation: "shipping_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_en: string | null
          address_ko: string | null
          created_at: string | null
          deleted_at: string | null
          fax: string | null
          id: string
          name_en: string
          name_ko: string | null
          phone: string | null
          signature_image_url: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          address_en?: string | null
          address_ko?: string | null
          created_at?: string | null
          deleted_at?: string | null
          fax?: string | null
          id?: string
          name_en: string
          name_ko?: string | null
          phone?: string | null
          signature_image_url?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          address_en?: string | null
          address_ko?: string | null
          created_at?: string | null
          deleted_at?: string | null
          fax?: string | null
          id?: string
          name_en?: string
          name_ko?: string | null
          phone?: string | null
          signature_image_url?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          gsm: number | null
          hs_code: string | null
          id: string
          name: string
          updated_at: string | null
          width_mm: number | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          gsm?: number | null
          hs_code?: string | null
          id?: string
          name: string
          updated_at?: string | null
          width_mm?: number | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          gsm?: number | null
          hs_code?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          width_mm?: number | null
        }
        Relationships: []
      }
      proforma_invoices: {
        Row: {
          amount: number | null
          buyer_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          delivery_term: string | null
          details: Json | null
          discharge_port: string | null
          id: string
          loading_port: string | null
          notes: string | null
          payment_term: string | null
          pi_date: string
          pi_no: string
          po_id: string | null
          ref_no: string | null
          status: string | null
          supplier_id: string | null
          updated_at: string | null
          validity: string | null
        }
        Insert: {
          amount?: number | null
          buyer_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivery_term?: string | null
          details?: Json | null
          discharge_port?: string | null
          id?: string
          loading_port?: string | null
          notes?: string | null
          payment_term?: string | null
          pi_date: string
          pi_no: string
          po_id?: string | null
          ref_no?: string | null
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
          validity?: string | null
        }
        Update: {
          amount?: number | null
          buyer_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivery_term?: string | null
          details?: Json | null
          discharge_port?: string | null
          id?: string
          loading_port?: string | null
          notes?: string | null
          payment_term?: string | null
          pi_date?: string
          pi_no?: string
          po_id?: string | null
          ref_no?: string | null
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
          validity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_invoices_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount: number | null
          buyer_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          delivery_term: string | null
          details: Json | null
          discharge_port: string | null
          id: string
          loading_port: string | null
          notes: string | null
          payment_term: string | null
          po_date: string
          po_no: string
          ref_no: string | null
          status: string | null
          supplier_id: string | null
          updated_at: string | null
          validity: string | null
        }
        Insert: {
          amount?: number | null
          buyer_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivery_term?: string | null
          details?: Json | null
          discharge_port?: string | null
          id?: string
          loading_port?: string | null
          notes?: string | null
          payment_term?: string | null
          po_date: string
          po_no: string
          ref_no?: string | null
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
          validity?: string | null
        }
        Update: {
          amount?: number | null
          buyer_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivery_term?: string | null
          details?: Json | null
          discharge_port?: string | null
          id?: string
          loading_port?: string | null
          notes?: string | null
          payment_term?: string | null
          po_date?: string
          po_no?: string
          ref_no?: string | null
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
          validity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_documents: {
        Row: {
          amount: number | null
          ci_date: string
          ci_no: string
          consignee_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          delivery_term: string | null
          details: Json | null
          discharge_port: string | null
          eta: string | null
          etd: string | null
          gross_weight: number | null
          id: string
          loading_port: string | null
          net_weight: number | null
          notes: string | null
          package_no: number | null
          payment_term: string | null
          pi_id: string | null
          pl_no: string
          ref_no: string | null
          ship_date: string | null
          shipper_id: string | null
          status: string | null
          updated_at: string | null
          vessel: string | null
          voyage: string | null
        }
        Insert: {
          amount?: number | null
          ci_date: string
          ci_no: string
          consignee_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivery_term?: string | null
          details?: Json | null
          discharge_port?: string | null
          eta?: string | null
          etd?: string | null
          gross_weight?: number | null
          id?: string
          loading_port?: string | null
          net_weight?: number | null
          notes?: string | null
          package_no?: number | null
          payment_term?: string | null
          pi_id?: string | null
          pl_no: string
          ref_no?: string | null
          ship_date?: string | null
          shipper_id?: string | null
          status?: string | null
          updated_at?: string | null
          vessel?: string | null
          voyage?: string | null
        }
        Update: {
          amount?: number | null
          ci_date?: string
          ci_no?: string
          consignee_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivery_term?: string | null
          details?: Json | null
          discharge_port?: string | null
          eta?: string | null
          etd?: string | null
          gross_weight?: number | null
          id?: string
          loading_port?: string | null
          net_weight?: number | null
          notes?: string | null
          package_no?: number | null
          payment_term?: string | null
          pi_id?: string | null
          pl_no?: string
          ref_no?: string | null
          ship_date?: string | null
          shipper_id?: string | null
          status?: string | null
          updated_at?: string | null
          vessel?: string | null
          voyage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_documents_consignee_id_fkey"
            columns: ["consignee_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_documents_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "proforma_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_documents_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stuffing_lists: {
        Row: {
          cntr_no: string | null
          created_at: string | null
          id: string
          roll_details: Json | null
          roll_no_range: string | null
          seal_no: string | null
          shipping_doc_id: string | null
          sl_no: string | null
          updated_at: string | null
        }
        Insert: {
          cntr_no?: string | null
          created_at?: string | null
          id?: string
          roll_details?: Json | null
          roll_no_range?: string | null
          seal_no?: string | null
          shipping_doc_id?: string | null
          sl_no?: string | null
          updated_at?: string | null
        }
        Update: {
          cntr_no?: string | null
          created_at?: string | null
          id?: string
          roll_details?: Json | null
          roll_no_range?: string | null
          seal_no?: string | null
          shipping_doc_id?: string | null
          sl_no?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stuffing_lists_shipping_doc_id_fkey"
            columns: ["shipping_doc_id"]
            isOneToOne: false
            referencedRelation: "shipping_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          id: string
          name: string
          org_id: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          name: string
          org_id?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_doc_number: {
        Args: { doc_type: string; ref_date?: string }
        Returns: string
      }
      get_user_org_id: { Args: never; Returns: string }
      get_user_org_type: { Args: never; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
