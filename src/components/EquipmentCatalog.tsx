import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createAdminLog } from '../lib/utils';
import { getInventoryMap } from '../lib/inventory';
import { EquipmentForm } from './EquipmentForm';
import { Modal } from './Modal';
import { CardGridSkeleton, EmptyState } from './Skeleton';
import type { Equipment, Lab, EquipmentInventory } from '../lib/database.types';

export function EquipmentCatalog() {
  const { user } = useAuth();
  const toast = useToast();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [labMap, setLabMap] = useState<Map<string, string>>(new Map());
  const [inventory, setInventory] = useState<Map<string, EquipmentInventory>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [deleting, setDeleting] = useState<Equipment | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [eqRes, labRes] = await Promise.all([
      supabase.from('equipment').select('*').order('name'),
      supabase.from('labs').select('*').order('name'),
    ]);
    const eq = eqRes.data ?? [];
    setEquipment(eq);
    setLabMap(new Map((labRes.data ?? []).map((l: Lab) => [l.id, l.name])));
    setInventory(await getInventoryMap(eq.map((e) => e.id)));
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function inventoryFor(equipmentId: string): EquipmentInventory[] {
    const rows: EquipmentInventory[] = [];
    for (const [key, row] of inventory) {
      if (key.startsWith(`${equipmentId}:`)) rows.push(row);
    }
    return rows;
  }

  async function confirmDelete() {
    if (!deleting || !user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('equipment').delete().eq('id', deleting.id);
      if (error) throw error;
      await createAdminLog(user.id, 'deleted', 'equipment', deleting.id, {
        name: deleting.name,
      });
      toast.success('Equipment deleted');
      setDeleting(null);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete equipment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add Equipment
        </button>
      </div>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : equipment.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No equipment yet"
          description="Add equipment to track inventory and loans."
          actionLabel="Add Equipment"
          onAction={() => {
            setEditing(null);
            setShowForm(true);
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {equipment.map((eq) => {
            const rows = inventoryFor(eq.id);
            return (
              <div
                key={eq.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-900">{eq.name}</h3>
                    <p className="text-xs text-gray-400">
                      Home: {labMap.get(eq.lab_id) ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(eq);
                        setShowForm(true);
                      }}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(eq)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {eq.description && (
                  <p className="line-clamp-2 text-sm text-gray-600">{eq.description}</p>
                )}

                {rows.length > 0 ? (
                  <div className="space-y-1 border-t border-gray-100 pt-2">
                    {rows.map((r) => {
                      const low = r.quantity_available === 0;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-500">
                            {labMap.get(r.lab_id) ?? 'Unknown lab'}
                          </span>
                          <span
                            className={`font-medium ${low ? 'text-red-600' : 'text-gray-800'}`}
                          >
                            {r.quantity_available} / {r.quantity_total} available
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="border-t border-gray-100 pt-2 text-xs text-gray-400">
                    No inventory tracked.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <EquipmentForm
          equipment={editing}
          onClose={() => setShowForm(false)}
          onSaved={loadAll}
        />
      )}

      {deleting && (
        <Modal
          title="Delete Equipment"
          onClose={() => !busy && setDeleting(null)}
          maxWidth="max-w-md"
          footer={
            <>
              <button
                onClick={() => setDeleting(null)}
                disabled={busy}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
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
            Delete <strong>{deleting.name}</strong>? This also removes its inventory and{' '}
            <strong>any loan history</strong> for this item. This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
