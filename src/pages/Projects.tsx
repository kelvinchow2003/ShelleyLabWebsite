import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  AlertTriangle,
  Pencil,
  Trash2,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Download,
  List,
  LayoutGrid,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { exportCsv, dateStamp } from '../lib/csv';
import { ProjectForm } from '../components/ProjectForm';
import { Modal } from '../components/Modal';
import { CardGridSkeleton, EmptyState } from '../components/Skeleton';
import {
  PROJECT_STATUSES,
  formatStatusLabel,
  getStatusColor,
  formatDate,
  createAdminLog,
  getInitials,
} from '../lib/utils';
import type {
  Project,
  Lab,
  UserProfile,
  ProjectStatus,
  ProjectTag,
} from '../lib/database.types';

type SortKey = 'submitted_date' | 'title' | 'status' | 'priority';
type ViewMode = 'list' | 'grid';
const PAGE_SIZE = 12;
const VIEW_STORAGE_KEY = 'projects_view';

const SORT_COLUMN: Record<SortKey, string> = {
  submitted_date: 'submitted_date',
  title: 'project_name',
  status: 'status',
  priority: 'is_urgent',
};

export function Projects({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();

  // Reference data (loaded once).
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labMap, setLabMap] = useState<Map<string, string>>(new Map());
  const [appTypes, setAppTypes] = useState<Map<string, string>>(new Map());
  const [salesReps, setSalesReps] = useState<Map<string, string>>(new Map());
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [tags, setTags] = useState<ProjectTag[]>([]);

  // Current page data.
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Map<string, string[]>>(new Map());
  const [fileCounts, setFileCounts] = useState<Map<string, number>>(new Map());
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modals.
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Filters.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [labFilter, setLabFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'not-urgent'>(
    'all'
  );
  const [tagFilter, setTagFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('submitted_date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);

  // View mode (list = default), persisted across sessions.
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === 'grid' ? 'grid' : 'list';
  });
  function changeView(v: ViewMode) {
    setView(v);
    localStorage.setItem(VIEW_STORAGE_KEY, v);
  }

  // Debounce the search input.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  // Load reference data once.
  useEffect(() => {
    async function loadRefs() {
      const [labRes, appRes, repRes, userRes, tagRes] = await Promise.all([
        supabase.from('labs').select('*').order('name'),
        supabase.from('application_types').select('id,name'),
        supabase.from('sales_reps').select('id,name'),
        supabase.from('user_profiles').select('*'),
        supabase.from('project_tags').select('*').order('name'),
      ]);
      setLabs(labRes.data ?? []);
      setLabMap(new Map((labRes.data ?? []).map((l) => [l.id, l.name])));
      setAppTypes(new Map((appRes.data ?? []).map((a) => [a.id, a.name])));
      setSalesReps(new Map((repRes.data ?? []).map((r) => [r.id, r.name])));
      setUsers(new Map((userRes.data ?? []).map((u) => [u.id, u])));
      setTags(tagRes.data ?? []);
    }
    loadRefs();
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('projects').select('*', { count: 'exact' });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (labFilter !== 'all') query = query.eq('lab_id', labFilter);
    if (priorityFilter === 'urgent') query = query.eq('is_urgent', true);
    if (priorityFilter === 'not-urgent') query = query.eq('is_urgent', false);
    if (tagFilter !== 'all') query = query.contains('tags', [tagFilter]);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().replace(/[%,]/g, ' ');
      query = query.or(
        `project_name.ilike.%${q}%,company.ilike.%${q}%,description.ilike.%${q}%`
      );
    }

    query = query
      .order(SORT_COLUMN[sortKey], { ascending: sortOrder === 'asc' })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    setProjects(rows);
    setTotalCount(count ?? 0);

    // Load assignments + file counts for just this page.
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [assignRes, fileRes] = await Promise.all([
        supabase.from('project_assignments').select('project_id,user_id').in('project_id', ids),
        supabase.from('project_files').select('project_id').in('project_id', ids),
      ]);
      const assignMap = new Map<string, string[]>();
      for (const a of assignRes.data ?? []) {
        const arr = assignMap.get(a.project_id) ?? [];
        arr.push(a.user_id);
        assignMap.set(a.project_id, arr);
      }
      setAssignments(assignMap);
      const counts = new Map<string, number>();
      for (const f of fileRes.data ?? []) {
        counts.set(f.project_id, (counts.get(f.project_id) ?? 0) + 1);
      }
      setFileCounts(counts);
    } else {
      setAssignments(new Map());
      setFileCounts(new Map());
    }
    setLoading(false);
  }, [
    statusFilter,
    labFilter,
    priorityFilter,
    tagFilter,
    debouncedSearch,
    sortKey,
    sortOrder,
    page,
    toast,
  ]);

  // Reset to first page when filters change.
  useEffect(() => {
    setPage(0);
  }, [statusFilter, labFilter, priorityFilter, tagFilter, debouncedSearch, sortKey, sortOrder]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Realtime: refresh the current page when projects change.
  useEffect(() => {
    const channel = supabase
      .channel('projects_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => loadPage()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function changeStatus(p: Project, status: ProjectStatus) {
    const { error } = await supabase.from('projects').update({ status }).eq('id', p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
    if (user) {
      await createAdminLog(user.id, 'updated', 'project', p.id, {
        status: { before: p.status, after: status },
      });
    }
    toast.success(`Status set to ${formatStatusLabel(status)}`);
  }

  async function confirmDelete() {
    if (!deleting || !user) return;
    setDeletingBusy(true);
    try {
      await supabase.from('deleted_projects').insert({
        project_id: deleting.id,
        project_name: deleting.project_name,
        company: deleting.company,
        description: deleting.description,
        lab_id: deleting.lab_id,
        status: deleting.status,
        submitted_date: deleting.submitted_date,
        deleted_by: user.id,
        project_data: deleting as unknown as Record<string, unknown>,
      });
      await supabase.from('projects').delete().eq('id', deleting.id);
      await createAdminLog(user.id, 'deleted', 'project', deleting.id, {
        project_name: deleting.project_name,
      });
      toast.success('Project deleted and archived');
      setDeleting(null);
      await loadPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeletingBusy(false);
    }
  }

  async function handleExport() {
    let query = supabase.from('projects').select('*');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (labFilter !== 'all') query = query.eq('lab_id', labFilter);
    if (priorityFilter === 'urgent') query = query.eq('is_urgent', true);
    if (priorityFilter === 'not-urgent') query = query.eq('is_urgent', false);
    if (tagFilter !== 'all') query = query.contains('tags', [tagFilter]);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().replace(/[%,]/g, ' ');
      query = query.or(
        `project_name.ilike.%${q}%,company.ilike.%${q}%,description.ilike.%${q}%`
      );
    }
    query = query.order(SORT_COLUMN[sortKey], { ascending: sortOrder === 'asc' });

    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []).map((p) => ({
      project_name: p.project_name,
      company: p.company,
      status: formatStatusLabel(p.status),
      lab: p.lab_id ? labMap.get(p.lab_id) ?? '' : '',
      application_type: p.application_type_id ? appTypes.get(p.application_type_id) ?? '' : '',
      sales_rep: p.sales_rep_id ? salesReps.get(p.sales_rep_id) ?? '' : '',
      urgent: p.is_urgent ? 'Yes' : 'No',
      tags: p.tags.join('; '),
      submitted_date: formatDate(p.submitted_date),
    }));
    if (rows.length === 0) {
      toast.info('No projects match the current filters');
      return;
    }
    exportCsv(`projects-${dateStamp()}`, rows, [
      { key: 'project_name', label: 'Project Name' },
      { key: 'company', label: 'Company' },
      { key: 'status', label: 'Status' },
      { key: 'lab', label: 'Lab' },
      { key: 'application_type', label: 'Application Type' },
      { key: 'sales_rep', label: 'Sales Rep' },
      { key: 'urgent', label: 'Urgent' },
      { key: 'tags', label: 'Tags' },
      { key: 'submitted_date', label: 'Submitted' },
    ]);
    toast.success(`Exported ${rows.length} project${rows.length === 1 ? '' : 's'}`);
  }

  const rangeStart = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalCount, page * PAGE_SIZE + projects.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project name, company, or description…"
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as 'all' | ProjectStatus)}>
            <option value="all">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatStatusLabel(s)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Lab" value={labFilter} onChange={setLabFilter}>
            <option value="all">All labs</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Priority" value={priorityFilter} onChange={(v) => setPriorityFilter(v as 'all' | 'urgent' | 'not-urgent')}>
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="not-urgent">Not urgent</option>
          </FilterSelect>
          <FilterSelect label="Tag" value={tagFilter} onChange={setTagFilter}>
            <option value="all">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Sort by" value={sortKey} onChange={(v) => setSortKey(v as SortKey)}>
            <option value="submitted_date">Submitted date</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
          </FilterSelect>
          <FilterSelect label="Order" value={sortOrder} onChange={(v) => setSortOrder(v as 'desc' | 'asc')}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </FilterSelect>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {totalCount === 0
              ? '0 projects'
              : `Showing ${rangeStart}–${rangeEnd} of ${totalCount} projects`}
          </p>
          <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
            <ViewToggleButton
              active={view === 'list'}
              onClick={() => changeView('list')}
              label="List view"
            >
              <List className="h-4 w-4" />
            </ViewToggleButton>
            <ViewToggleButton
              active={view === 'grid'}
              onClick={() => changeView('grid')}
              label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </ViewToggleButton>
          </div>
        </div>
      </div>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" />}
          title="No projects match your filters"
          description="Adjust the filters above or create a new project."
          actionLabel="New Project"
          onAction={() => {
            setEditing(null);
            setShowForm(true);
          }}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  labName={p.lab_id ? labMap.get(p.lab_id) ?? '—' : '—'}
                  appTypeName={p.application_type_id ? appTypes.get(p.application_type_id) ?? '—' : '—'}
                  salesRepName={p.sales_rep_id ? salesReps.get(p.sales_rep_id) ?? '—' : '—'}
                  assignedUsers={(assignments.get(p.id) ?? [])
                    .map((id) => users.get(id))
                    .filter((u): u is UserProfile => !!u)}
                  fileCount={fileCounts.get(p.id) ?? 0}
                  onOpen={() => onOpenProject(p.id)}
                  onEdit={() => {
                    setEditing(p);
                    setShowForm(true);
                  }}
                  onDelete={() => setDeleting(p)}
                  onStatusChange={(s) => changeStatus(p, s)}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <ListTh>Project</ListTh>
                      <ListTh className="hidden sm:table-cell">Company</ListTh>
                      <ListTh>Status</ListTh>
                      <ListTh className="hidden md:table-cell">Lab</ListTh>
                      <ListTh className="hidden lg:table-cell">Assigned</ListTh>
                      <ListTh className="hidden xl:table-cell">Files</ListTh>
                      <ListTh className="hidden lg:table-cell">Submitted</ListTh>
                      <ListTh className="text-right">Actions</ListTh>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {projects.map((p) => (
                      <ProjectListRow
                        key={p.id}
                        project={p}
                        labName={p.lab_id ? labMap.get(p.lab_id) ?? '—' : '—'}
                        assignedUsers={(assignments.get(p.id) ?? [])
                          .map((id) => users.get(id))
                          .filter((u): u is UserProfile => !!u)}
                        fileCount={fileCounts.get(p.id) ?? 0}
                        onOpen={() => onOpenProject(p.id)}
                        onEdit={() => {
                          setEditing(p);
                          setShowForm(true);
                        }}
                        onDelete={() => setDeleting(p)}
                        onStatusChange={(s) => changeStatus(p, s)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <ProjectForm
          project={editing}
          onClose={() => setShowForm(false)}
          onSaved={loadPage}
        />
      )}

      {deleting && (
        <Modal
          title="Delete Project"
          onClose={() => !deletingBusy && setDeleting(null)}
          maxWidth="max-w-md"
          footer={
            <>
              <button
                onClick={() => setDeleting(null)}
                disabled={deletingBusy}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingBusy}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingBusy && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-700">
            Are you sure you want to delete{' '}
            <strong>{deleting.project_name}</strong>? It will be archived and can be
            recovered from the Deleted page.
          </p>
        </Modal>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-gray-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      >
        {children}
      </select>
    </label>
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded p-1.5 transition ${
        active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function ListTh({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

function ProjectListRow({
  project,
  labName,
  assignedUsers,
  fileCount,
  onOpen,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  project: Project;
  labName: string;
  assignedUsers: UserProfile[];
  fileCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: ProjectStatus) => void;
}) {
  const visible = assignedUsers.slice(0, 3);
  const overflow = assignedUsers.length - visible.length;
  return (
    <tr onClick={onOpen} className="cursor-pointer hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="font-medium text-gray-900">{project.project_name}</span>
          {project.is_urgent && (
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
              <AlertTriangle className="h-3 w-3" /> URGENT
            </span>
          )}
        </div>
      </td>
      <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">{project.company}</td>
      <td className="px-4 py-3">
        <select
          value={project.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(e.target.value as ProjectStatus);
          }}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(
            project.status
          )}`}
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatStatusLabel(s)}
            </option>
          ))}
        </select>
      </td>
      <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{labName}</td>
      <td className="hidden px-4 py-3 lg:table-cell">
        {assignedUsers.length > 0 ? (
          <div className="flex -space-x-2">
            {visible.map((u) => (
              <span
                key={u.id}
                title={u.display_name || u.email}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-[9px] font-semibold text-blue-700"
              >
                {getInitials(u.display_name || u.email)}
              </span>
            ))}
            {overflow > 0 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[9px] font-semibold text-gray-600">
                +{overflow}
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="hidden px-4 py-3 text-gray-500 xl:table-cell">
        {fileCount > 0 ? (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" />
            {fileCount}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
        {formatDate(project.submitted_date, false)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProjectCard({
  project,
  labName,
  appTypeName,
  salesRepName,
  assignedUsers,
  fileCount,
  onOpen,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  project: Project;
  labName: string;
  appTypeName: string;
  salesRepName: string;
  assignedUsers: UserProfile[];
  fileCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: ProjectStatus) => void;
}) {
  const visible = assignedUsers.slice(0, 3);
  const overflow = assignedUsers.length - visible.length;

  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-gray-900">{project.project_name}</h3>
            {project.is_urgent && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                <AlertTriangle className="h-3 w-3" /> URGENT
              </span>
            )}
          </div>
          <p className="truncate text-sm text-gray-500">{project.company}</p>
        </div>
        <select
          value={project.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(e.target.value as ProjectStatus);
          }}
          className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(
            project.status
          )}`}
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-gray-600">{project.description}</p>
      )}

      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-600">{labName}</span>
        {appTypeName !== '—' && <span> · {appTypeName}</span>}
        {salesRepName !== '—' && <span> · {salesRepName}</span>}
      </div>

      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {project.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
            >
              {t}
            </span>
          ))}
          {project.tags.length > 4 && (
            <span className="text-[10px] text-gray-400">+{project.tags.length - 4}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex items-center gap-3">
          {assignedUsers.length > 0 && (
            <div className="flex -space-x-2">
              {visible.map((u) => (
                <span
                  key={u.id}
                  title={u.display_name || u.email}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-[10px] font-semibold text-blue-700"
                >
                  {getInitials(u.display_name || u.email)}
                </span>
              ))}
              {overflow > 0 && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[10px] font-semibold text-gray-600">
                  +{overflow}
                </span>
              )}
            </div>
          )}
          {fileCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Paperclip className="h-3.5 w-3.5" />
              {fileCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <span className="text-[10px] text-gray-300">
        Submitted {formatDate(project.submitted_date, false)}
      </span>
    </div>
  );
}
