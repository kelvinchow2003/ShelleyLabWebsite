// Hand-authored database types for the typed Supabase client.
// These mirror supabase/setup_database.sql.

export type ProjectStatus =
  | 'pending'
  | 'in_progress'
  | 'complete'
  | 'cancelled'
  | 'not_feasible';

export type LoanStatus = 'borrowing' | 'returned' | 'overdue';

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      labs: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      application_types: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sales_reps: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      project_tags: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          title: string;
          description: string;
          tags: string[];
          status: ProjectStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
          lab_id: string | null;
          company: string;
          project_name: string;
          application_type_id: string | null;
          sales_rep_id: string | null;
          is_urgent: boolean;
          submitted_date: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          tags?: string[];
          status?: ProjectStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          lab_id?: string | null;
          company?: string;
          project_name?: string;
          application_type_id?: string | null;
          sales_rep_id?: string | null;
          is_urgent?: boolean;
          submitted_date?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          tags?: string[];
          status?: ProjectStatus;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          lab_id?: string | null;
          company?: string;
          project_name?: string;
          application_type_id?: string | null;
          sales_rep_id?: string | null;
          is_urgent?: boolean;
          submitted_date?: string;
        };
        Relationships: [];
      };
      project_assignments: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          assigned_at: string;
          assigned_by: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Relationships: [];
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          file_name: string;
          file_path: string;
          file_type?: string;
          file_size?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          file_name?: string;
          file_path?: string;
          file_type?: string;
          file_size?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          changes: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          changes?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          changes?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      equipment: {
        Row: {
          id: string;
          name: string;
          description: string;
          lab_id: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          lab_id: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          lab_id?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      equipment_items: {
        Row: {
          id: string;
          equipment_id: string;
          name: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          name: string;
          quantity?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          name?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      equipment_inventory: {
        Row: {
          id: string;
          equipment_id: string;
          lab_id: string;
          quantity_total: number;
          quantity_available: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          lab_id: string;
          quantity_total?: number;
          quantity_available?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          lab_id?: string;
          quantity_total?: number;
          quantity_available?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      equipment_loans: {
        Row: {
          id: string;
          equipment_id: string;
          contact_name: string;
          contact_email: string;
          contact_phone: string;
          expected_return_date: string;
          actual_return_date: string | null;
          status: LoanStatus;
          quantity_borrowed: number;
          lab_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          contact_name: string;
          contact_email?: string;
          contact_phone?: string;
          expected_return_date: string;
          actual_return_date?: string | null;
          status?: LoanStatus;
          quantity_borrowed?: number;
          lab_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          contact_name?: string;
          contact_email?: string;
          contact_phone?: string;
          expected_return_date?: string;
          actual_return_date?: string | null;
          status?: LoanStatus;
          quantity_borrowed?: number;
          lab_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      equipment_loan_files: {
        Row: {
          id: string;
          loan_id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          file_name: string;
          file_path: string;
          file_type?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          loan_id?: string;
          file_name?: string;
          file_path?: string;
          file_type?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      deleted_projects: {
        Row: {
          id: string;
          project_id: string | null;
          project_name: string;
          company: string;
          description: string;
          lab_id: string | null;
          status: string;
          submitted_date: string | null;
          deleted_by: string;
          deleted_at: string;
          project_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          project_name: string;
          company?: string;
          description?: string;
          lab_id?: string | null;
          status?: string;
          submitted_date?: string | null;
          deleted_by: string;
          deleted_at?: string;
          project_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string | null;
          project_name?: string;
          company?: string;
          description?: string;
          lab_id?: string | null;
          status?: string;
          submitted_date?: string | null;
          deleted_by?: string;
          deleted_at?: string;
          project_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row aliases used throughout the app.
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type Lab = Database['public']['Tables']['labs']['Row'];
export type ApplicationType = Database['public']['Tables']['application_types']['Row'];
export type SalesRep = Database['public']['Tables']['sales_reps']['Row'];
export type ProjectTag = Database['public']['Tables']['project_tags']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectAssignment = Database['public']['Tables']['project_assignments']['Row'];
export type ProjectFile = Database['public']['Tables']['project_files']['Row'];
export type AdminLog = Database['public']['Tables']['admin_logs']['Row'];
export type Equipment = Database['public']['Tables']['equipment']['Row'];
export type EquipmentItem = Database['public']['Tables']['equipment_items']['Row'];
export type EquipmentInventory = Database['public']['Tables']['equipment_inventory']['Row'];
export type EquipmentLoan = Database['public']['Tables']['equipment_loans']['Row'];
export type EquipmentLoanFile = Database['public']['Tables']['equipment_loan_files']['Row'];
export type DeletedProject = Database['public']['Tables']['deleted_projects']['Row'];
