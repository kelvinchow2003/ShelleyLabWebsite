import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  AlertTriangle,
  Pencil,
  Trash2,
  Paperclip,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ProjectForm } from '../components/ProjectForm';
import { Modal } from '../components/Modal';
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
} from '../lib/database.types';

type SortKey = 'submitted_date' | 'title' | 'status' | 'priority';

export function Projects({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [appTypes, setAppTypes] = useState<Map<string, string>>(new Map());
  const [salesReps, setSalesReps] = useState<Map<string, string>>(new Map());
  const [labMap, setLabMap] = useState<Map<string, string>>(new Map());
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [assignments, setAssignments] = useState<Map<string, string[]>>(new Map());
  const [fileCounts, setFileCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [labFilter, setLabFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'not-urgent'>(
    'all'
  );
  const [tagFilter, setTagFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('submitted_date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  async function loadAll() {
    setLoading(true);
    const [projRes, labRes, appRes, repRes, userRes, assignRes, fileRes] =
      await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('labs').select('*').order('name'),
        supabase.from('application_types').select('id,name'),
        supabase.from('sales_reps').select('id,name'),
        supabase.from('user_profiles').select('*'),
        supabase.from('project_assignments').select('project_id,user_id'),
        supabase.from('project_files').select('project_id'),
      ]);

    setProjects(projRes.data ?? []);
    setLabs(labRes.data ?? []);
    setLabMap(new Map((labRes.data ?? []).map((l) => [l.id, l.name])));
    setAppTypes(new Map((appRes.data ?? []).map((a) => [a.id, a.name])));
    setSalesReps(new Map((repRes.data ?? []).map((r) => [r.id, r.name])));
    setUsers(new Map((userRes.data ?? []).map((u) => [u.id, u])));

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

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) for (const t of p.tags) set.add(t);
    return [...set].sort();
  }, [projects]);

  const filtered = useMemo(() => {
    let result = projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (labFilter !== 'all' && p.lab_id !== labFilter) return false;
      if (priorityFilter === 'urgent' && !p.is_urgent) return false;
      if (priorityFilter === 'not-urgent' && p.is_urgent) return false;
      if (tagFilter !== 'all' && !p.tags.includes(tagFilter)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${p.project_name} ${p.company} ${p.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'title':
          cmp = a.project_name.localeCompare(b.project_name);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'priority':
          cmp = Number(a.is_urgent) - Number(b.is_urgent);
          break;
        case 'submitted_date':
        default:
          cmp =
            new Date(a.submitted_date).getTime() -
            new Date(b.submitted_date).getTime();
          break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [projects, statusFilter, labFilter, priorityFilter, tagFilter, search, sortKey, sortOrder]);

  async function changeStatus(p: Project, status: ProjectStatus) {
    const { error } = await supabase
      .from('projects')
      .update({ status })
      .eq('id', p.id);
    if (!error) {
      setProjects((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, status } : x))
      );
      if (user) {
        await createAdminLog(user.id, 'updated', 'project', p.id, {
          status: { before: p.status, after: status },
        });
      }
    }
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
      setDeleting(null);
      await loadAll();
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
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
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
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
        <p className="text-sm text-gray-500">
          {filtered.length} of {projects.length} projects
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400">
          No projects match your filters.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
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
      )}

      {showForm && (
        <ProjectForm
          project={editing}
          onClose={() => setShowForm(false)}
          onSaved={loadAll}
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
                {deletingBusy && <Loader2 className="h-4 w-4 animate-spin" />}
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
            <span className="text-[10px] text-gray-400">
              +{project.tags.length - 4}
            </span>
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
