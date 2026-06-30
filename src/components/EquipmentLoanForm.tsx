import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, Upload, X } from 'lucide-react';
import { Modal } from './Modal';
import { supabase, EQUIPMENT_LOAN_FILES_BUCKET } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  createAdminLog,
  compressImageIfNeeded,
  buildStoragePath,
} from '../lib/utils';
import type { Lab, Equipment } from '../lib/database.types';

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx';

export function EquipmentLoanForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  const [labId, setLabId] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [newEquipName, setNewEquipName] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const [labRes, eqRes] = await Promise.all([
        supabase.from('labs').select('*').order('name'),
        supabase.from('equipment').select('*').order('name'),
      ]);
      const loadedLabs = labRes.data ?? [];
      setLabs(loadedLabs);
      setEquipment(eqRes.data ?? []);
      const toronto = loadedLabs.find((l) => l.name === 'Toronto');
      setLabId(toronto?.id ?? loadedLabs[0]?.id ?? '');
      setLoading(false);
    }
    load();
  }, []);

  function toggleEquipment(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  }

  function setQuantity(id: string, qty: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(id, Math.max(1, qty));
      return next;
    });
  }

  async function addNewEquipment() {
    if (!user) return;
    const name = newEquipName.trim();
    if (!name) return;
    const lab = labId || labs[0]?.id;
    if (!lab) {
      setError('No lab available to attach new equipment.');
      return;
    }
    const { data, error: insErr } = await supabase
      .from('equipment')
      .insert({ name, lab_id: lab, created_by: user.id })
      .select('*')
      .single();
    if (insErr) {
      setError(`Failed to add equipment: ${insErr.message}`);
      return;
    }
    if (data) {
      setEquipment((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected((prev) => new Map(prev).set(data.id, 1));
      setNewEquipName('');
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');
    if (!expectedReturn) return setError('Expected return date is required');
    if (!contactName.trim()) return setError('Contact name is required');
    if (selected.size === 0) return setError('Select at least one piece of equipment');

    setSubmitting(true);
    try {
      // Same created_at across the batch so they group together.
      const createdAt = new Date().toISOString();
      const rows = [...selected.entries()].map(([equipmentId, qty]) => ({
        equipment_id: equipmentId,
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        expected_return_date: expectedReturn,
        status: 'borrowing' as const,
        quantity_borrowed: qty,
        lab_id: labId || null,
        created_by: user.id,
        created_at: createdAt,
      }));

      const { data: inserted, error: insErr } = await supabase
        .from('equipment_loans')
        .insert(rows)
        .select('id');
      if (insErr) throw insErr;

      const loanIds = (inserted ?? []).map((r) => r.id);
      const leadLoanId = loanIds[0];

      // Attach files to the first (lead) loan.
      if (leadLoanId && files.length) {
        for (const raw of files) {
          const file = await compressImageIfNeeded(raw);
          const path = buildStoragePath(`loans/${leadLoanId}`, file.name);
          const { error: upErr } = await supabase.storage
            .from(EQUIPMENT_LOAN_FILES_BUCKET)
            .upload(path, file);
          if (upErr) continue;
          await supabase.from('equipment_loan_files').insert({
            loan_id: leadLoanId,
            file_name: file.name,
            file_path: path,
            file_type: file.type,
            uploaded_by: user.id,
          });
        }
      }

      // Audit log per loan.
      for (const id of loanIds) {
        await createAdminLog(user.id, 'created', 'equipment_loan', id, {
          contact_name: contactName.trim(),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create loan');
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
        form="loan-form"
        disabled={submitting}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Create Loan{selected.size > 0 ? ` (${selected.size})` : ''}
      </button>
    </>
  );

  return (
    <Modal title="New Equipment Loan" onClose={onClose} footer={footer} maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <form id="loan-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="loan-lab" className="mb-1 block text-sm font-medium text-gray-700">
                Lab
              </label>
              <select
                id="loan-lab"
                value={labId}
                onChange={(e) => setLabId(e.target.value)}
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
              <label htmlFor="loan-return" className="mb-1 block text-sm font-medium text-gray-700">
                Expected Return Date <span className="text-red-500">*</span>
              </label>
              <input
                id="loan-return"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="loan-name" className="mb-1 block text-sm font-medium text-gray-700">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                id="loan-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label htmlFor="loan-email" className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="loan-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label htmlFor="loan-phone" className="mb-1 block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                id="loan-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Equipment picker */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Equipment</label>
            <div className="mb-2 flex gap-2">
              <input
                value={newEquipName}
                onChange={(e) => setNewEquipName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNewEquipment();
                  }
                }}
                placeholder="Add new equipment…"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={addNewEquipment}
                className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              {equipment.length === 0 && (
                <p className="px-1 text-sm text-gray-400">
                  No equipment yet — add some above.
                </p>
              )}
              {equipment.map((eq) => {
                const checked = selected.has(eq.id);
                return (
                  <div
                    key={eq.id}
                    className="flex items-center justify-between rounded px-1 py-1 hover:bg-gray-50"
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEquipment(eq.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">{eq.name}</span>
                    </label>
                    {checked && (
                      <input
                        type="number"
                        min={1}
                        value={selected.get(eq.id) ?? 1}
                        onChange={(e) => setQuantity(eq.id, Number(e.target.value))}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="rounded-md bg-blue-50 p-3 text-sm">
              <p className="mb-1 font-medium text-blue-800">Selected Equipment</p>
              <ul className="space-y-0.5 text-blue-700">
                {[...selected.entries()].map(([id, qty]) => {
                  const eq = equipment.find((e) => e.id === id);
                  return (
                    <li key={id}>
                      {eq?.name ?? 'Unknown'} × {qty}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Files */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Attachments</label>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              Attach files
              <input type="file" multiple accept={FILE_ACCEPT} onChange={onFileInput} className="hidden" />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-gray-700">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
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
