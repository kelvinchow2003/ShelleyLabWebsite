import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, X, Upload, Download, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { supabase, PROJECT_FILES_BUCKET } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  getOrCreateApplicationType,
  getOrCreateSalesRep,
  getOrCreateTag,
  createAdminLog,
  compressImageIfNeeded,
  buildStoragePath,
  getSignedUrl,
  formatFileSize,
} from '../lib/utils';
import type {
  Project,
  Lab,
  ApplicationType,
  SalesRep,
  ProjectTag,
  UserProfile,
  ProjectFile,
} from '../lib/database.types';

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls';

export function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project?: Project | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!project;

  const [labs, setLabs] = useState<Lab[]>([]);
  const [appTypes, setAppTypes] = useState<ApplicationType[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [allTags, setAllTags] = useState<ProjectTag[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [labId, setLabId] = useState('');
  const [company, setCompany] = useState(project?.company ?? '');
  const [projectName, setProjectName] = useState(project?.project_name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');

  const [appTypeMode, setAppTypeMode] = useState<'select' | 'new'>('select');
  const [appTypeId, setAppTypeId] = useState(project?.application_type_id ?? '');
  const [appTypeNew, setAppTypeNew] = useState('');

  const [salesRepMode, setSalesRepMode] = useState<'select' | 'new'>('select');
  const [salesRepId, setSalesRepId] = useState(project?.sales_rep_id ?? '');
  const [salesRepNew, setSalesRepNew] = useState('');

  const [selectedTags, setSelectedTags] = useState<string[]>(project?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const [isUrgent, setIsUrgent] = useState(project?.is_urgent ?? false);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);

  const [existingFiles, setExistingFiles] = useState<ProjectFile[]>([]);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const [labsRes, appRes, repRes, tagRes, userRes] = await Promise.all([
        supabase.from('labs').select('*').order('name'),
        supabase.from('application_types').select('*').order('name'),
        supabase.from('sales_reps').select('*').order('name'),
        supabase.from('project_tags').select('*').order('name'),
        supabase.from('user_profiles').select('*').order('display_name'),
      ]);
      const loadedLabs = labsRes.data ?? [];
      setLabs(loadedLabs);
      setAppTypes(appRes.data ?? []);
      setSalesReps(repRes.data ?? []);
      setAllTags(tagRes.data ?? []);
      setUsers(userRes.data ?? []);

      // Default lab to Toronto for new projects.
      if (project?.lab_id) {
        setLabId(project.lab_id);
      } else {
        const toronto = loadedLabs.find((l) => l.name === 'Toronto');
        setLabId(toronto?.id ?? loadedLabs[0]?.id ?? '');
      }

      if (project) {
        const [assignRes, fileRes] = await Promise.all([
          supabase
            .from('project_assignments')
            .select('user_id')
            .eq('project_id', project.id),
          supabase
            .from('project_files')
            .select('*')
            .eq('project_id', project.id)
            .order('created_at'),
        ]);
        setAssignedUserIds((assignRes.data ?? []).map((a) => a.user_id));
        setExistingFiles(fileRes.data ?? []);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!selectedTags.includes(trimmed)) {
      setSelectedTags((t) => [...t, trimmed]);
    }
    setTagInput('');
  }

  function toggleUser(id: string) {
    setAssignedUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (isEdit && project) {
      // Upload immediately for existing projects.
      uploadFiles(project.id, files);
    } else {
      setQueuedFiles((prev) => [...prev, ...files]);
    }
    e.target.value = '';
  }

  async function uploadFiles(projectId: string, files: File[]) {
    if (!user) return;
    const inserted: ProjectFile[] = [];
    for (const raw of files) {
      const file = await compressImageIfNeeded(raw);
      const path = buildStoragePath(`projects/${projectId}`, file.name);
      const { error: upErr } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .upload(path, file);
      if (upErr) {
        setError(`Failed to upload ${file.name}: ${upErr.message}`);
        continue;
      }
      const { data, error: dbErr } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_path: path,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        })
        .select('*')
        .single();
      if (!dbErr && data) inserted.push(data);
    }
    if (inserted.length) setExistingFiles((prev) => [...prev, ...inserted]);
  }

  async function downloadFile(file: ProjectFile) {
    const url = await getSignedUrl(PROJECT_FILES_BUCKET, file.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function deleteExistingFile(file: ProjectFile) {
    await supabase.storage.from(PROJECT_FILES_BUCKET).remove([file.file_path]);
    await supabase.from('project_files').delete().eq('id', file.id);
    setExistingFiles((prev) => prev.filter((f) => f.id !== file.id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');

    if (!labId) return setError('Lab location is required');
    if (!company.trim()) return setError('Company is required');
    if (!projectName.trim()) return setError('Project name is required');

    setSubmitting(true);
    try {
      // Resolve application type
      let resolvedAppTypeId: string | null = null;
      if (appTypeMode === 'new' && appTypeNew.trim()) {
        resolvedAppTypeId = await getOrCreateApplicationType(appTypeNew, user.id);
      } else if (appTypeMode === 'select' && appTypeId) {
        resolvedAppTypeId = appTypeId;
      }

      // Resolve sales rep
      let resolvedSalesRepId: string | null = null;
      if (salesRepMode === 'new' && salesRepNew.trim()) {
        resolvedSalesRepId = await getOrCreateSalesRep(salesRepNew, user.id);
      } else if (salesRepMode === 'select' && salesRepId) {
        resolvedSalesRepId = salesRepId;
      }

      // Resolve tags (get-or-create each)
      const resolvedTags: string[] = [];
      for (const t of selectedTags) {
        resolvedTags.push(await getOrCreateTag(t));
      }

      const payload = {
        title: projectName.trim(),
        project_name: projectName.trim(),
        company: company.trim(),
        description: description.trim(),
        lab_id: labId,
        application_type_id: resolvedAppTypeId,
        sales_rep_id: resolvedSalesRepId,
        tags: resolvedTags,
        is_urgent: isUrgent,
      };

      let projectId: string;
      if (isEdit && project) {
        const { error: updErr } = await supabase
          .from('projects')
          .update(payload)
          .eq('id', project.id);
        if (updErr) throw updErr;
        projectId = project.id;
        await createAdminLog(user.id, 'updated', 'project', projectId, {
          before: {
            project_name: project.project_name,
            company: project.company,
            status: project.status,
            is_urgent: project.is_urgent,
          },
          after: payload,
        });
      } else {
        const { data, error: insErr } = await supabase
          .from('projects')
          .insert({ ...payload, created_by: user.id })
          .select('id')
          .single();
        if (insErr) throw insErr;
        projectId = data.id;
        await createAdminLog(user.id, 'created', 'project', projectId, payload);
      }

      // Replace assignments with the selected set.
      await supabase.from('project_assignments').delete().eq('project_id', projectId);
      if (assignedUserIds.length) {
        await supabase.from('project_assignments').insert(
          assignedUserIds.map((uid) => ({
            project_id: projectId,
            user_id: uid,
            assigned_by: user.id,
          }))
        );
      }

      // Upload queued files for brand-new projects.
      if (!isEdit && queuedFiles.length) {
        await uploadFiles(projectId, queuedFiles);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="project-form"
        disabled={submitting}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isEdit ? 'Save Changes' : 'Create Project'}
      </button>
    </>
  );

  return (
    <Modal
      title={isEdit ? 'Edit Project' : 'Create New Project'}
      onClose={onClose}
      footer={footer}
      maxWidth="max-w-3xl"
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <form id="project-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="lab" className="mb-1 block text-sm font-medium text-gray-700">
                Lab Location <span className="text-red-500">*</span>
              </label>
              <select
                id="lab"
                value={labId}
                onChange={(e) => setLabId(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="company" className="mb-1 block text-sm font-medium text-gray-700">
                Company <span className="text-red-500">*</span>
              </label>
              <input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pname" className="mb-1 block text-sm font-medium text-gray-700">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="pname"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label htmlFor="desc" className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Application Type */}
          <SelectOrCreate
            label="Application Type"
            mode={appTypeMode}
            setMode={setAppTypeMode}
            selectId={appTypeId}
            setSelectId={setAppTypeId}
            newValue={appTypeNew}
            setNewValue={setAppTypeNew}
            options={appTypes}
          />

          {/* Sales Rep */}
          <SelectOrCreate
            label="Sales Rep"
            mode={salesRepMode}
            setMode={setSalesRepMode}
            selectId={salesRepId}
            setSelectId={setSalesRepId}
            newValue={salesRepNew}
            setNewValue={setSalesRepNew}
            options={salesReps}
          />

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tags</label>
            {allTags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {allTags.map((t) => {
                  const active = selectedTags.includes(t.name);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addTag(t.name)}
                      disabled={active}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        active
                          ? 'cursor-default border-blue-200 bg-blue-100 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Add a tag…"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            {selectedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => setSelectedTags((s) => s.filter((x) => x !== t))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Urgent */}
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Mark as Urgent
          </label>

          {/* Assign users */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Assign Users</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              {users.length === 0 && (
                <p className="px-1 text-sm text-gray-400">No users found.</p>
              )}
              {users.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">
                    {u.display_name || u.email}{' '}
                    <span className="text-gray-400">({u.email})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Files */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Attachments</label>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              Upload files
              <input type="file" multiple accept={FILE_ACCEPT} onChange={onFileInput} className="hidden" />
            </label>

            {queuedFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {queuedFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-gray-700">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setQueuedFiles((q) => q.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {existingFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {existingFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-gray-700">
                      {f.file_name}{' '}
                      <span className="text-gray-400">({formatFileSize(f.file_size)})</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadFile(f)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteExistingFile(f)}
                        className="text-gray-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  );
}

function SelectOrCreate({
  label,
  mode,
  setMode,
  selectId,
  setSelectId,
  newValue,
  setNewValue,
  options,
}: {
  label: string;
  mode: 'select' | 'new';
  setMode: (m: 'select' | 'new') => void;
  selectId: string;
  setSelectId: (v: string) => void;
  newValue: string;
  setNewValue: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => setMode(mode === 'select' ? 'new' : 'select')}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          {mode === 'select' ? '+ Add new' : 'Choose existing'}
        </button>
      </div>
      {mode === 'select' ? (
        <select
          value={selectId}
          onChange={(e) => setSelectId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        >
          <option value="">— None —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={`New ${label.toLowerCase()}…`}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      )}
    </div>
  );
}
