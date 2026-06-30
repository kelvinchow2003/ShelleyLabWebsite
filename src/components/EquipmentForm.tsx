import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createAdminLog } from '../lib/utils';
import { upsertInventory, getInventoryMap } from '../lib/inventory';
import type { Equipment, Lab } from '../lib/database.types';

export function EquipmentForm({
  equipment,
  onClose,
  onSaved,
}: {
  equipment?: Equipment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!equipment;

  const [labs, setLabs] = useState<Lab[]>([]);
  const [name, setName] = useState(equipment?.name ?? '');
  const [description, setDescription] = useState(equipment?.description ?? '');
  const [homeLab, setHomeLab] = useState(equipment?.lab_id ?? '');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: labRows } = await supabase.from('labs').select('*').order('name');
      const loadedLabs = labRows ?? [];
      setLabs(loadedLabs);

      if (equipment) {
        setHomeLab(equipment.lab_id);
        const invMap = await getInventoryMap([equipment.id]);
        const q: Record<string, number> = {};
        for (const lab of loadedLabs) {
          const row = invMap.get(`${equipment.id}:${lab.id}`);
          if (row) q[lab.id] = row.quantity_total;
        }
        setQuantities(q);
      } else {
        const toronto = loadedLabs.find((l) => l.name === 'Toronto');
        const home = toronto?.id ?? loadedLabs[0]?.id ?? '';
        setHomeLab(home);
        if (home) setQuantities({ [home]: 1 });
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) return toast.error('Equipment name is required');
    if (!homeLab) return toast.error('Home lab is required');

    setSubmitting(true);
    try {
      let equipmentId: string;
      if (isEdit && equipment) {
        const { error } = await supabase
          .from('equipment')
          .update({ name: name.trim(), description: description.trim(), lab_id: homeLab })
          .eq('id', equipment.id);
        if (error) throw error;
        equipmentId = equipment.id;
        await createAdminLog(user.id, 'updated', 'equipment', equipmentId, {
          name: name.trim(),
        });
      } else {
        const { data, error } = await supabase
          .from('equipment')
          .insert({
            name: name.trim(),
            description: description.trim(),
            lab_id: homeLab,
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        equipmentId = data.id;
        await createAdminLog(user.id, 'created', 'equipment', equipmentId, {
          name: name.trim(),
        });
      }

      // Upsert inventory per lab.
      for (const lab of labs) {
        const qty = quantities[lab.id];
        if (qty !== undefined && qty >= 0) {
          await upsertInventory(equipmentId, lab.id, qty);
        }
      }

      toast.success(isEdit ? 'Equipment updated' : 'Equipment added');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save equipment');
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
        form="equipment-form"
        disabled={submitting}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isEdit ? 'Save Changes' : 'Add Equipment'}
      </button>
    </>
  );

  return (
    <Modal
      title={isEdit ? 'Edit Equipment' : 'Add Equipment'}
      onClose={onClose}
      footer={footer}
      maxWidth="max-w-xl"
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <form id="equipment-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="eq-name" className="mb-1 block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="eq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label htmlFor="eq-desc" className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="eq-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label htmlFor="eq-lab" className="mb-1 block text-sm font-medium text-gray-700">
              Home Lab <span className="text-red-500">*</span>
            </label>
            <select
              id="eq-lab"
              value={homeLab}
              onChange={(e) => setHomeLab(e.target.value)}
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
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Quantity per Lab
            </label>
            <p className="mb-2 text-xs text-gray-400">
              Total units stocked at each lab. Leave 0 where the item isn&apos;t kept.
            </p>
            <div className="space-y-2 rounded-md border border-gray-200 p-3">
              {labs.map((l) => (
                <div key={l.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{l.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={quantities[l.id] ?? 0}
                    onChange={(e) =>
                      setQuantities((q) => ({
                        ...q,
                        [l.id]: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
