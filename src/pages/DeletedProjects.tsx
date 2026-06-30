import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Trash2, Inbox } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/Modal';
import {
  formatDate,
  getStatusColor,
  formatStatusLabel,
  createAdminLog,
} from '../lib/utils';
import type {
  DeletedProject,
  UserProfile,
  ProjectStatus,
} from '../lib/database.types';
import type { Database } from '../lib/database.types';

type ProjectInsert = Database['public']['Tables']['projects']['Insert'];

export function DeletedProjects() {
  const { user } = useAuth();
  const [deleted, setDeleted] = useState<DeletedProject[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const [delRes, userRes] = await Promise.all([
      supabase.from('deleted_projects').select('*').order('deleted_at', { ascending: false }),
      supabase.from('user_profiles').select('*'),
    ]);
    setDeleted(delRes.data ?? []);
    setUsers(new Map((userRes.data ?? []).map((u) => [u.id, u])));
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function recover(dp: DeletedProject) {
    if (!user) return;
    setRecoveringId(dp.id);
    try {
      const data = (dp.project_data ?? {}) as Record<string, unknown>;
      const payload: ProjectInsert = {
        title: (data.title as string) ?? dp.project_name,
        project_name: (data.project_name as string) ?? dp.project_name,
        company: (data.company as string) ?? dp.company,
        description: (data.description as string) ?? dp.description,
        tags: (data.tags as string[]) ?? [],
        status: ((data.status as ProjectStatus) ?? (dp.status as ProjectStatus)) ?? 'pending',
        lab_id: (data.lab_id as string | null) ?? dp.lab_id ?? null,
        application_type_id: (data.application_type_id as string | null) ?? null,
        sales_rep_id: (data.sales_rep_id as string | null) ?? null,
        is_urgent: (data.is_urgent as boolean) ?? false,
        submitted_date:
          (data.submitted_date as string) ?? dp.submitted_date ?? new Date().toISOString(),
        // created_by must be the current user to satisfy RLS.
        created_by: user.id,
      };

      const { data: inserted, error } = await supabase
        .from('projects')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;

      await createAdminLog(user.id, 'recovered', 'project', inserted.id, {
        project_name: dp.project_name,
      });
      await supabase.from('deleted_projects').delete().eq('id', dp.id);
      await loadAll();
    } catch (err) {
      console.error('Failed to recover project:', err);
    } finally {
      setRecoveringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deleted Projects</h1>
        <p className="mt-1 text-gray-500">
          Archived projects can be recovered back into the active list.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : deleted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          No deleted projects. Nice and tidy.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {deleted.map((dp) => {
            const by = users.get(dp.deleted_by);
            return (
              <div
                key={dp.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                      <Trash2 className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{dp.project_name}</span>
                    </h3>
                    <p className="truncate text-sm text-gray-500">{dp.company}</p>
                  </div>
                  <StatusBadge
                    label={formatStatusLabel(dp.status)}
                    className={getStatusColor(dp.status)}
                  />
                </div>

                {dp.description && (
                  <p className="line-clamp-2 text-sm text-gray-600">{dp.description}</p>
                )}

                <div className="space-y-0.5 border-t border-gray-100 pt-3 text-xs text-gray-400">
                  <p>Deleted by {by ? by.display_name || by.email : 'Unknown'}</p>
                  <p>Deleted on {formatDate(dp.deleted_at)}</p>
                  <p>Originally submitted {formatDate(dp.submitted_date, false)}</p>
                </div>

                <button
                  onClick={() => recover(dp)}
                  disabled={recoveringId === dp.id}
                  className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {recoveringId === dp.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Recover Project
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
