import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Plus, Upload, X } from 'lucide-react';
import { Modal } from './Modal';
import { supabase, EQUIPMENT_LOAN_FILES_BUCKET } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createAdminLog, compressImageIfNeeded, buildStoragePath } from '../lib/utils';
import { getInventoryMap, adjustInventory } from '../lib/inventory';
import type { Lab, Equipment, EquipmentInventory } from '../lib/database.types';

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx';

export function EquipmentLoanForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [inventory, setInventory] = useState<Map<string, EquipmentInventory>>(new Map());
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

  async function reloadInventory(equipmentList: Equipment[]) {
    setInventory(await getInventoryMap(equipmentList.map((e) => e.id)));
  }

  useEffect(() => {
    async function load() {
      const [labRes, eqRes] = await Promise.all([
        supabase.from('labs').select('*').order('name'),
        supabase.from('equipment').select('*').order('name'),
      ]);
      const loadedLabs = labRes.data ?? [];
      const loadedEq = eqRes.data ?? [];
      setLabs(loadedLabs);
      setEquipment(loadedEq);
      await reloadInventory(loadedEq);
      const toronto = loadedLabs.find((l) => l.name === 'Toronto');
      setLabId(toronto?.id ?? loadedLabs[0]?.id ?? '');
      setLoading(false);
    }
    load();
  }, []);

  /** Available units for an equipment at the currently selected lab; null = untracked (unlimited). */
  function availableFor(equipmentId: string): number | null {
    if (!labId) return null;
    const row = inventory.get(`${equipmentId}:${labId}`);
    return row ? row.quantity_available : null;
  }

  function toggleEquipment(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  }

  function setQuantity(id: string, qty: number) {
    const avail = availableFor(id);
    let q = Math.max(1, qty);
    if (avail !== null) q = Math.min(q, Math.max(1, avail));
    setSelected((prev) => new Map(prev).set(id, q));
  }

  async function addNewEquipment() {
    if (!user) return;
    const name = newEquipName.trim();
    if (!name) return;
    const lab = labId || labs[0]?.id;
    if (!lab) {
      toast.error('No lab available to attach new equipment.');
      return;
    }
    const { data, error: insErr } = await supabase
      .from('equipment')
      .insert({ name, lab_id: lab, created_by: user.id })
      .select('*')
      .single();
    if (insErr) {
      toast.error(`Failed to add equipment: ${insErr.message}`);
      return;
    }
    if (data) {
      const next = [...equipment, data].sort((a, b) => a.name.localeCompare(b.name));
      setEquipment(next);
      await reloadInventory(next);
      setSelected((prev) => new Map(prev).set(data.id, 1));
      setNewEquipName('');
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = '';
  }

  const overLimit = useMemo(() => {
    for (const [id, qty] of selected) {
      const avail = availableFor(id);
      if (avail !== null && qty > avail) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, inventory, labId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!expectedReturn) return toast.error('Expected return date is required');
    if (!contactName.trim()) return toast.error('Contact name is required');
    if (selected.size === 0)
      return toast.error('Select at least one piece of equipment');
    if (overLimit)
      return toast.error('One or more items exceed available stock at this lab');

    setSubmitting(true);
    try {
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

      // Decrement inventory for each loaned item.
      for (const [equipmentId, qty] of selected) {
        await adjustInventory(equipmentId, labId || null, -qty);
      }

      const loanIds = (inserted ?? []).map((r) => r.id);
      const leadLoanId = loanIds[0];

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

      for (const id of loanIds) {
        await createAdminLog(user.id, 'created', 'equipment_loan', id, {
          contact_name: contactName.trim(),
        });
      }

      toast.success(
        `Loaned ${loanIds.length} item${loanIds.length === 1 ? '' : 's'} to ${contactName.trim()}`
      );
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create loan');
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
        disabled={submitting || overLimit}
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
                const avail = availableFor(eq.id);
                const soldOut = avail !== null && avail <= 0 && !checked;
                return (
                  <div
                    key={eq.id}
                    className="flex items-center justify-between rounded px-1 py-1 hover:bg-gray-50"
                  >
                    <label
                      className={`flex items-center gap-2 text-sm ${soldOut ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={soldOut}
                        onChange={() => toggleEquipment(eq.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">{eq.name}</span>
                      {avail !== null && (
                        <span
                          className={`text-xs ${avail <= 0 ? 'text-red-500' : 'text-gray-400'}`}
                        >
                          ({avail} available)
                        </span>
                      )}
                    </label>
                    {checked && (
                      <input
                        type="number"
                        min={1}
                        max={avail ?? undefined}
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

          {overLimit && (
            <p className="text-sm text-red-600">
              One or more items exceed the available stock at this lab. Lower the
              quantity or pick a different lab.
            </p>
          )}

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
        </form>
      )}
    </Modal>
  );
}
