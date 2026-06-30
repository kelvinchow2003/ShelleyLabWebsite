-- =============================================================================
-- ShelleyAutomationLab — Complete Supabase / Postgres setup
-- =============================================================================
-- Paste this entire file into the Supabase SQL Editor and run it once.
-- It is idempotent where possible (safe to re-run).
--
-- It creates: tables, RLS policies, triggers, indexes, seed data, and the two
-- private storage buckets (project-files, equipment-loan-files) with policies.
-- =============================================================================

-- Required extension for gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- user_profiles -------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- labs ----------------------------------------------------------------------
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- application_types ----------------------------------------------------------
create table if not exists public.application_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- sales_reps -----------------------------------------------------------------
create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- project_tags ---------------------------------------------------------------
create table if not exists public.project_tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- projects -------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  tags text[] default '{}',
  status text default 'pending'
    check (status in ('pending','in_progress','complete','cancelled','not_feasible')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- ShelleyLab fields
  lab_id uuid references public.labs(id) on delete set null,
  company text default '',
  project_name text default '',
  application_type_id uuid references public.application_types(id) on delete set null,
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  is_urgent boolean default false,
  submitted_date timestamptz default now()
);

-- project_assignments --------------------------------------------------------
create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  unique (project_id, user_id)
);

-- project_files --------------------------------------------------------------
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text default '',
  file_size int default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- admin_logs -----------------------------------------------------------------
create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz default now()
);

-- equipment ------------------------------------------------------------------
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  lab_id uuid not null references public.labs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- equipment_items ------------------------------------------------------------
create table if not exists public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  name text not null,
  quantity int default 1,
  created_at timestamptz default now()
);

-- equipment_inventory --------------------------------------------------------
create table if not exists public.equipment_inventory (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  quantity_total int default 0,
  quantity_available int default 0,
  updated_at timestamptz default now(),
  unique (equipment_id, lab_id)
);

-- equipment_loans ------------------------------------------------------------
create table if not exists public.equipment_loans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  contact_name text not null,
  contact_email text default '',
  contact_phone text default '',
  expected_return_date date not null,
  actual_return_date date,
  status text default 'borrowing'
    check (status in ('borrowing','returned','overdue')),
  quantity_borrowed int default 1,
  lab_id uuid references public.labs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- equipment_loan_files -------------------------------------------------------
create table if not exists public.equipment_loan_files (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.equipment_loans(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text default '',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- deleted_projects (archive) -------------------------------------------------
create table if not exists public.deleted_projects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  project_name text not null,
  company text default '',
  description text default '',
  lab_id uuid,
  status text default 'pending',
  submitted_date timestamptz,
  deleted_by uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz default now(),
  project_data jsonb,
  created_at timestamptz default now()
);

-- =============================================================================
-- TRIGGERS (bump updated_at)
-- =============================================================================
drop trigger if exists set_updated_at_projects on public.projects;
create trigger set_updated_at_projects
  before update on public.projects
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_updated_at_user_profiles on public.user_profiles;
create trigger set_updated_at_user_profiles
  before update on public.user_profiles
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_created_by on public.projects(created_by);
create index if not exists idx_projects_lab_id on public.projects(lab_id);
create index if not exists idx_projects_application_type_id on public.projects(application_type_id);
create index if not exists idx_projects_sales_rep_id on public.projects(sales_rep_id);
create index if not exists idx_projects_submitted_date on public.projects(submitted_date);
create index if not exists idx_projects_is_urgent on public.projects(is_urgent);

create index if not exists idx_project_assignments_project_id on public.project_assignments(project_id);
create index if not exists idx_project_assignments_user_id on public.project_assignments(user_id);

create index if not exists idx_project_files_project_id on public.project_files(project_id);

create index if not exists idx_admin_logs_user_id on public.admin_logs(user_id);
create index if not exists idx_admin_logs_entity on public.admin_logs(entity_type, entity_id);

create index if not exists idx_equipment_lab_id on public.equipment(lab_id);

create index if not exists idx_equipment_loans_status on public.equipment_loans(status);
create index if not exists idx_equipment_loans_expected_return on public.equipment_loans(expected_return_date);

create index if not exists idx_deleted_projects_deleted_at on public.deleted_projects(deleted_at desc);
create index if not exists idx_deleted_projects_project_id on public.deleted_projects(project_id);

-- =============================================================================
-- SEED DATA
-- =============================================================================
insert into public.labs (name) values
  ('Toronto'), ('Cambridge'), ('Windsor'), ('Vancouver'), ('Calgary')
on conflict (name) do nothing;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.user_profiles        enable row level security;
alter table public.labs                  enable row level security;
alter table public.application_types     enable row level security;
alter table public.sales_reps            enable row level security;
alter table public.project_tags          enable row level security;
alter table public.projects              enable row level security;
alter table public.project_assignments   enable row level security;
alter table public.project_files         enable row level security;
alter table public.admin_logs            enable row level security;
alter table public.equipment             enable row level security;
alter table public.equipment_items       enable row level security;
alter table public.equipment_inventory   enable row level security;
alter table public.equipment_loans       enable row level security;
alter table public.equipment_loan_files  enable row level security;
alter table public.deleted_projects      enable row level security;

-- ----- user_profiles --------------------------------------------------------
drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select" on public.user_profiles
  for select to authenticated using (true);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ----- labs (read-only lookup) ----------------------------------------------
drop policy if exists "labs_select" on public.labs;
create policy "labs_select" on public.labs
  for select to authenticated using (true);

drop policy if exists "labs_insert" on public.labs;
create policy "labs_insert" on public.labs
  for insert to authenticated with check (true);

-- ----- application_types ----------------------------------------------------
drop policy if exists "application_types_select" on public.application_types;
create policy "application_types_select" on public.application_types
  for select to authenticated using (true);

drop policy if exists "application_types_insert" on public.application_types;
create policy "application_types_insert" on public.application_types
  for insert to authenticated with check (created_by = auth.uid());

-- ----- sales_reps -----------------------------------------------------------
drop policy if exists "sales_reps_select" on public.sales_reps;
create policy "sales_reps_select" on public.sales_reps
  for select to authenticated using (true);

drop policy if exists "sales_reps_insert" on public.sales_reps;
create policy "sales_reps_insert" on public.sales_reps
  for insert to authenticated with check (created_by = auth.uid());

-- ----- project_tags ---------------------------------------------------------
drop policy if exists "project_tags_select" on public.project_tags;
create policy "project_tags_select" on public.project_tags
  for select to authenticated using (true);

drop policy if exists "project_tags_insert" on public.project_tags;
create policy "project_tags_insert" on public.project_tags
  for insert to authenticated with check (true);

-- ----- projects -------------------------------------------------------------
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated using (true);

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.project_assignments pa
      where pa.project_id = projects.id and pa.user_id = auth.uid()
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.project_assignments pa
      where pa.project_id = projects.id and pa.user_id = auth.uid()
    )
  );

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete to authenticated using (created_by = auth.uid());

-- ----- project_assignments --------------------------------------------------
drop policy if exists "project_assignments_select" on public.project_assignments;
create policy "project_assignments_select" on public.project_assignments
  for select to authenticated using (true);

drop policy if exists "project_assignments_insert" on public.project_assignments;
create policy "project_assignments_insert" on public.project_assignments
  for insert to authenticated with check (
    exists (
      select 1 from public.projects p
      where p.id = project_assignments.project_id and p.created_by = auth.uid()
    )
  );

drop policy if exists "project_assignments_delete" on public.project_assignments;
create policy "project_assignments_delete" on public.project_assignments
  for delete to authenticated using (
    exists (
      select 1 from public.projects p
      where p.id = project_assignments.project_id and p.created_by = auth.uid()
    )
  );

-- ----- project_files --------------------------------------------------------
drop policy if exists "project_files_select" on public.project_files;
create policy "project_files_select" on public.project_files
  for select to authenticated using (true);

drop policy if exists "project_files_insert" on public.project_files;
create policy "project_files_insert" on public.project_files
  for insert to authenticated with check (uploaded_by = auth.uid());

drop policy if exists "project_files_delete" on public.project_files;
create policy "project_files_delete" on public.project_files
  for delete to authenticated using (uploaded_by = auth.uid());

-- ----- admin_logs (audit trail) ---------------------------------------------
drop policy if exists "admin_logs_select" on public.admin_logs;
create policy "admin_logs_select" on public.admin_logs
  for select to authenticated using (true);

drop policy if exists "admin_logs_insert" on public.admin_logs;
create policy "admin_logs_insert" on public.admin_logs
  for insert to authenticated with check (true);

-- ----- equipment ------------------------------------------------------------
drop policy if exists "equipment_select" on public.equipment;
create policy "equipment_select" on public.equipment
  for select to authenticated using (true);

drop policy if exists "equipment_insert" on public.equipment;
create policy "equipment_insert" on public.equipment
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "equipment_update" on public.equipment;
create policy "equipment_update" on public.equipment
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ----- equipment_items ------------------------------------------------------
drop policy if exists "equipment_items_select" on public.equipment_items;
create policy "equipment_items_select" on public.equipment_items
  for select to authenticated using (true);

drop policy if exists "equipment_items_insert" on public.equipment_items;
create policy "equipment_items_insert" on public.equipment_items
  for insert to authenticated with check (true);

-- ----- equipment_inventory --------------------------------------------------
drop policy if exists "equipment_inventory_select" on public.equipment_inventory;
create policy "equipment_inventory_select" on public.equipment_inventory
  for select to authenticated using (true);

drop policy if exists "equipment_inventory_insert" on public.equipment_inventory;
create policy "equipment_inventory_insert" on public.equipment_inventory
  for insert to authenticated with check (true);

drop policy if exists "equipment_inventory_update" on public.equipment_inventory;
create policy "equipment_inventory_update" on public.equipment_inventory
  for update to authenticated using (true) with check (true);

-- ----- equipment_loans ------------------------------------------------------
drop policy if exists "equipment_loans_select" on public.equipment_loans;
create policy "equipment_loans_select" on public.equipment_loans
  for select to authenticated using (true);

drop policy if exists "equipment_loans_insert" on public.equipment_loans;
create policy "equipment_loans_insert" on public.equipment_loans
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "equipment_loans_update" on public.equipment_loans;
create policy "equipment_loans_update" on public.equipment_loans
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "equipment_loans_delete" on public.equipment_loans;
create policy "equipment_loans_delete" on public.equipment_loans
  for delete to authenticated using (created_by = auth.uid());

-- ----- equipment_loan_files -------------------------------------------------
drop policy if exists "equipment_loan_files_select" on public.equipment_loan_files;
create policy "equipment_loan_files_select" on public.equipment_loan_files
  for select to authenticated using (true);

drop policy if exists "equipment_loan_files_insert" on public.equipment_loan_files;
create policy "equipment_loan_files_insert" on public.equipment_loan_files
  for insert to authenticated with check (uploaded_by = auth.uid());

drop policy if exists "equipment_loan_files_delete" on public.equipment_loan_files;
create policy "equipment_loan_files_delete" on public.equipment_loan_files
  for delete to authenticated using (uploaded_by = auth.uid());

-- ----- deleted_projects -----------------------------------------------------
drop policy if exists "deleted_projects_select" on public.deleted_projects;
create policy "deleted_projects_select" on public.deleted_projects
  for select to authenticated using (true);

drop policy if exists "deleted_projects_insert" on public.deleted_projects;
create policy "deleted_projects_insert" on public.deleted_projects
  for insert to authenticated with check (deleted_by = auth.uid());

drop policy if exists "deleted_projects_delete" on public.deleted_projects;
create policy "deleted_projects_delete" on public.deleted_projects
  for delete to authenticated using (deleted_by = auth.uid());

-- =============================================================================
-- STORAGE BUCKETS + POLICIES
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('equipment-loan-files', 'equipment-loan-files', false)
on conflict (id) do nothing;

-- project-files policies
drop policy if exists "project_files_storage_select" on storage.objects;
create policy "project_files_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-files');

drop policy if exists "project_files_storage_insert" on storage.objects;
create policy "project_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-files');

drop policy if exists "project_files_storage_delete" on storage.objects;
create policy "project_files_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-files' and auth.uid() = owner);

-- equipment-loan-files policies
drop policy if exists "equipment_loan_files_storage_select" on storage.objects;
create policy "equipment_loan_files_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'equipment-loan-files');

drop policy if exists "equipment_loan_files_storage_insert" on storage.objects;
create policy "equipment_loan_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'equipment-loan-files');

drop policy if exists "equipment_loan_files_storage_delete" on storage.objects;
create policy "equipment_loan_files_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'equipment-loan-files' and auth.uid() = owner);

-- =============================================================================
-- Done.
-- =============================================================================
