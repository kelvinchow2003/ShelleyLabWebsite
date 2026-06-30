import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Loader2,
} from 'lucide-react';
import { supabase, EQUIPMENT_LOAN_FILES_BUCKET } from '../lib/supabase';
import { EquipmentLoanForm } from '../components/EquipmentLoanForm';
import { EquipmentCatalog } from '../components/EquipmentCatalog';
import { Modal } from '../components/Modal';
import { RowsSkeleton, EmptyState } from '../components/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { formatDate, getStatusColor, isLoanOverdue, getSignedUrl } from '../lib/utils';
import { adjustInventory } from '../lib/inventory';
import type {
  EquipmentLoan,
  EquipmentLoanFile,
  Lab,
  LoanStatus,
} from '../lib/database.types';

interface LoanWithMeta extends EquipmentLoan {
  equipment_name: string;
  lab_name: string;
}

interface Batch {
  key: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  created_at: string;
  loans: LoanWithMeta[];
  files: EquipmentLoanFile[];
}

function effectiveStatus(loan: EquipmentLoan): LoanStatus {
  if (loan.status === 'returned' || loan.actual_return_date) return 'returned';
  if (isLoanOverdue(loan.expected_return_date, loan.actual_return_date, loan.status))
    return 'overdue';
  return 'borrowing';
}

export function Equipment() {
  const toast = useToast();
  const [tab, setTab] = useState<'loans' | 'catalog'>('loans');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <TabButton active={tab === 'loans'} onClick={() => setTab('loans')}>
            Loans
          </TabButton>
          <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
            Catalog
          </TabButton>
        </div>
      </div>

      {tab === 'loans' ? <LoansView toast={toast} /> : <EquipmentCatalog />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function LoansView({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [loans, setLoans] = useState<LoanWithMeta[]>([]);
  const [filesByLoan, setFilesByLoan] = useState<Map<string, EquipmentLoanFile[]>>(
    new Map()
  );
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBatch, setDeletingBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'all' | LoanStatus>('borrowing');
  const [labFilter, setLabFilter] = useState('all');

  async function loadAll() {
    const [loanRes, labRes] = await Promise.all([
      supabase.from('equipment_loans').select('*').order('created_at', { ascending: false }),
      supabase.from('labs').select('*').order('name'),
    ]);
    const loanRows = loanRes.data ?? [];
    setLabs(labRes.data ?? []);

    const equipmentIds = [...new Set(loanRows.map((l) => l.equipment_id))];
    const labIds = [...new Set(loanRows.map((l) => l.lab_id).filter(Boolean))] as string[];
    const loanIds = loanRows.map((l) => l.id);

    const [eqRes, labNameRes, fileRes] = await Promise.all([
      equipmentIds.length
        ? supabase.from('equipment').select('id,name').in('id', equipmentIds)
        : Promise.resolve({ data: [] }),
      labIds.length
        ? supabase.from('labs').select('id,name').in('id', labIds)
        : Promise.resolve({ data: [] }),
      loanIds.length
        ? supabase.from('equipment_loan_files').select('*').in('loan_id', loanIds)
        : Promise.resolve({ data: [] }),
    ]);

    const eqMap = new Map((eqRes.data ?? []).map((e) => [e.id, e.name]));
    const labMap = new Map((labNameRes.data ?? []).map((l) => [l.id, l.name]));

    setLoans(
      loanRows.map((l) => ({
        ...l,
        equipment_name: eqMap.get(l.equipment_id) ?? 'Unknown equipment',
        lab_name: l.lab_id ? labMap.get(l.lab_id) ?? '—' : '—',
      }))
    );

    const fmap = new Map<string, EquipmentLoanFile[]>();
    for (const f of fileRes.data ?? []) {
      const arr = fmap.get(f.loan_id) ?? [];
      arr.push(f);
      fmap.set(f.loan_id, arr);
    }
    setFilesByLoan(fmap);
    setSelectedIds(new Set());
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // Realtime: refresh whenever loans change anywhere.
    const channel = supabase
      .channel('equipment_loans_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment_loans' },
        () => loadAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const batches = useMemo<Batch[]>(() => {
    const filtered = loans.filter((l) => {
      if (statusFilter !== 'all' && effectiveStatus(l) !== statusFilter) return false;
      if (labFilter !== 'all' && l.lab_id !== labFilter) return false;
      return true;
    });

    const map = new Map<string, Batch>();
    for (const l of filtered) {
      const key = `${l.contact_name}__${l.created_at}`;
      let batch = map.get(key);
      if (!batch) {
        batch = {
          key,
          contact_name: l.contact_name,
          contact_email: l.contact_email,
          contact_phone: l.contact_phone,
          created_at: l.created_at,
          loans: [],
          files: [],
        };
        map.set(key, batch);
      }
      batch.loans.push(l);
      for (const f of filesByLoan.get(l.id) ?? []) batch.files.push(f);
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [loans, filesByLoan, statusFilter, labFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function returnLoans(targets: LoanWithMeta[]) {
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase
        .from('equipment_loans')
        .update({ status: 'returned', actual_return_date: today })
        .in(
          'id',
          targets.map((t) => t.id)
        );
      // Restock inventory for each returned item.
      for (const t of targets) {
        await adjustInventory(t.equipment_id, t.lab_id, t.quantity_borrowed);
      }
      toast.success(
        `Returned ${targets.length} item${targets.length === 1 ? '' : 's'}`
      );
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to return items');
    } finally {
      setBusy(false);
    }
  }

  async function returnSelectedInBatch(batch: Batch) {
    await returnLoans(
      batch.loans.filter(
        (l) => selectedIds.has(l.id) && effectiveStatus(l) !== 'returned'
      )
    );
  }

  async function returnAllInBatch(batch: Batch) {
    await returnLoans(batch.loans.filter((l) => effectiveStatus(l) !== 'returned'));
  }

  async function confirmDeleteBatch() {
    if (!deletingBatch) return;
    setBusy(true);
    try {
      const loanIds = deletingBatch.loans.map((l) => l.id);
      const paths = deletingBatch.files.map((f) => f.file_path);
      if (paths.length) {
        await supabase.storage.from(EQUIPMENT_LOAN_FILES_BUCKET).remove(paths);
      }
      await supabase.from('equipment_loan_files').delete().in('loan_id', loanIds);
      // Restock any items that were still out before deleting.
      for (const l of deletingBatch.loans) {
        if (effectiveStatus(l) !== 'returned') {
          await adjustInventory(l.equipment_id, l.lab_id, l.quantity_borrowed);
        }
      }
      await supabase.from('equipment_loans').delete().in('id', loanIds);
      toast.success('Loan batch deleted');
      setDeletingBatch(null);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete batch');
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(file: EquipmentLoanFile) {
    const url = await getSignedUrl(EQUIPMENT_LOAN_FILES_BUCKET, file.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('Could not generate download link');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-medium text-gray-500">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | LoanStatus)}
              className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All</option>
              <option value="borrowing">Borrowing</option>
              <option value="returned">Returned</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <label className="text-xs font-medium text-gray-500">
            Lab
            <select
              value={labFilter}
              onChange={(e) => setLabFilter(e.target.value)}
              className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All labs</option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Loan
        </button>
      </div>

      {loading ? (
        <RowsSkeleton count={4} />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No loans match your filters"
          description="Create a loan to check equipment out to a contact."
          actionLabel="New Loan"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const unreturned = batch.loans.filter(
              (l) => effectiveStatus(l) !== 'returned'
            );
            const selectedCount = batch.loans.filter(
              (l) => selectedIds.has(l.id) && effectiveStatus(l) !== 'returned'
            ).length;
            return (
              <div
                key={batch.key}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{batch.contact_name}</h3>
                  <p className="text-sm text-gray-500">
                    {[batch.contact_email, batch.contact_phone]
                      .filter(Boolean)
                      .join(' · ') || 'No contact info'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Loaned on {formatDate(batch.created_at)} · {batch.loans.length} item
                    {batch.loans.length === 1 ? '' : 's'}
                  </p>
                </div>

                <ul className="mt-4 divide-y divide-gray-100 border-y border-gray-100">
                  {batch.loans.map((l) => {
                    const status = effectiveStatus(l);
                    const returned = status === 'returned';
                    return (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center gap-3 py-3 text-sm"
                      >
                        {!returned && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(l.id)}
                            onChange={() => toggleSelect(l.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                        <span className="flex-1 font-medium text-gray-800">
                          {l.equipment_name}
                          <span className="ml-1 font-normal text-gray-400">
                            × {l.quantity_borrowed}
                          </span>
                        </span>
                        <LoanStatusBadge status={status} />
                        <span className="text-gray-500">{l.lab_name}</span>
                        <span className="text-gray-500">
                          Due {formatDate(l.expected_return_date, false)}
                        </span>
                        {l.actual_return_date && (
                          <span className="text-green-600">
                            Returned {formatDate(l.actual_return_date, false)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {batch.files.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">Attachments</p>
                    <div className="flex flex-wrap gap-2">
                      {batch.files.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => downloadFile(f)}
                          className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-blue-600 hover:bg-gray-50"
                        >
                          <Download className="h-3 w-3" />
                          {f.file_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {unreturned.length > 0 && (
                    <>
                      <button
                        onClick={() => returnSelectedInBatch(batch)}
                        disabled={busy || selectedCount === 0}
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        Return Selected ({selectedCount})
                      </button>
                      <button
                        onClick={() => returnAllInBatch(batch)}
                        disabled={busy}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Return All Items
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDeletingBatch(batch)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Batch
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <EquipmentLoanForm onClose={() => setShowForm(false)} onSaved={loadAll} />
      )}

      {deletingBatch && (
        <Modal
          title="Delete Loan Batch"
          onClose={() => !busy && setDeletingBatch(null)}
          maxWidth="max-w-md"
          footer={
            <>
              <button
                onClick={() => setDeletingBatch(null)}
                disabled={busy}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteBatch}
                disabled={busy}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-700">
            Delete this entire loan batch for{' '}
            <strong>{deletingBatch.contact_name}</strong> ({deletingBatch.loans.length}{' '}
            items) and its attached files? Items still on loan will be restocked.
          </p>
        </Modal>
      )}
    </div>
  );
}

function LoanStatusBadge({ status }: { status: LoanStatus }) {
  const Icon =
    status === 'returned' ? CheckCircle2 : status === 'overdue' ? AlertTriangle : Clock;
  const label =
    status === 'returned' ? 'Returned' : status === 'overdue' ? 'Overdue' : 'Borrowing';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
        status
      )}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
