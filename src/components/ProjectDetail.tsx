import { useEffect, useState } from 'react';
import { Loader2, Download, AlertTriangle } from 'lucide-react';
import { Modal, StatusBadge } from './Modal';
import { supabase, PROJECT_FILES_BUCKET } from '../lib/supabase';
import {
  formatDate,
  formatFileSize,
  getStatusColor,
  formatStatusLabel,
  getSignedUrl,
  getInitials,
} from '../lib/utils';
import type { Project, ProjectFile, UserProfile } from '../lib/database.types';

export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [labName, setLabName] = useState('—');
  const [appTypeName, setAppTypeName] = useState('—');
  const [salesRepName, setSalesRepName] = useState('—');
  const [assignedUsers, setAssignedUsers] = useState<UserProfile[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: proj } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      if (!proj) {
        setLoading(false);
        return;
      }
      setProject(proj);

      const [labRes, fileRes, assignRes] = await Promise.all([
        proj.lab_id
          ? supabase.from('labs').select('name').eq('id', proj.lab_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('project_files').select('*').eq('project_id', projectId).order('created_at'),
        supabase.from('project_assignments').select('user_id').eq('project_id', projectId),
      ]);
      if (labRes.data) setLabName(labRes.data.name);
      setFiles(fileRes.data ?? []);

      if (proj.application_type_id) {
        const { data } = await supabase
          .from('application_types')
          .select('name')
          .eq('id', proj.application_type_id)
          .maybeSingle();
        if (data) setAppTypeName(data.name);
      }
      if (proj.sales_rep_id) {
        const { data } = await supabase
          .from('sales_reps')
          .select('name')
          .eq('id', proj.sales_rep_id)
          .maybeSingle();
        if (data) setSalesRepName(data.name);
      }

      const userIds = (assignRes.data ?? []).map((a) => a.user_id);
      if (userIds.length) {
        const { data: us } = await supabase
          .from('user_profiles')
          .select('*')
          .in('id', userIds);
        setAssignedUsers(us ?? []);
      }
      setLoading(false);
    }
    load();
  }, [projectId]);

  async function downloadFile(file: ProjectFile) {
    const url = await getSignedUrl(PROJECT_FILES_BUCKET, file.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Modal title="Project Details" onClose={onClose} maxWidth="max-w-3xl">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : !project ? (
        <p className="py-8 text-center text-gray-500">Project not found.</p>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{project.project_name}</h1>
              {project.is_urgent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3 w-3" /> URGENT
                </span>
              )}
              <StatusBadge
                label={formatStatusLabel(project.status)}
                className={getStatusColor(project.status)}
              />
            </div>
            <p className="mt-1 text-gray-500">{project.company}</p>
          </div>

          {project.description && (
            <p className="whitespace-pre-wrap text-sm text-gray-700">{project.description}</p>
          )}

          <div className="grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
            <Detail label="Lab" value={labName} />
            <Detail label="Application Type" value={appTypeName} />
            <Detail label="Sales Rep" value={salesRepName} />
            <Detail label="Submitted Date" value={formatDate(project.submitted_date)} />
          </div>

          {project.tags.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {assignedUsers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Assigned Users</h3>
              <div className="space-y-2">
                {assignedUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                      {getInitials(u.display_name || u.email)}
                    </span>
                    <span className="text-sm text-gray-700">
                      {u.display_name || u.email}{' '}
                      <span className="text-gray-400">{u.email}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Attachments</h3>
              <ul className="space-y-1">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm"
                  >
                    <span className="truncate text-gray-700">
                      {f.file_name}{' '}
                      <span className="text-gray-400">({formatFileSize(f.file_size)})</span>
                    </span>
                    <button
                      onClick={() => downloadFile(f)}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    >
                      <Download className="h-4 w-4" /> Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-gray-200 pt-3 text-xs text-gray-400">
            Created {formatDate(project.created_at)} · Last updated{' '}
            {formatDate(project.updated_at)}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800">{value}</dd>
    </div>
  );
}
