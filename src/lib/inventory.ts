import { supabase } from './supabase';
import type { EquipmentInventory } from './database.types';

/** Fetch the inventory row for an equipment/lab pair, or null if none exists. */
export async function getInventoryRow(
  equipmentId: string,
  labId: string
): Promise<EquipmentInventory | null> {
  const { data } = await supabase
    .from('equipment_inventory')
    .select('*')
    .eq('equipment_id', equipmentId)
    .eq('lab_id', labId)
    .maybeSingle();
  return data ?? null;
}

/** Fetch all inventory rows for a set of equipment ids, keyed by `${equipmentId}:${labId}`. */
export async function getInventoryMap(
  equipmentIds: string[]
): Promise<Map<string, EquipmentInventory>> {
  const map = new Map<string, EquipmentInventory>();
  if (equipmentIds.length === 0) return map;
  const { data } = await supabase
    .from('equipment_inventory')
    .select('*')
    .in('equipment_id', equipmentIds);
  for (const row of data ?? []) {
    map.set(`${row.equipment_id}:${row.lab_id}`, row);
  }
  return map;
}

/** Set the total quantity for an equipment/lab pair, preserving the borrowed count. */
export async function upsertInventory(
  equipmentId: string,
  labId: string,
  quantityTotal: number
): Promise<void> {
  const existing = await getInventoryRow(equipmentId, labId);
  if (existing) {
    const borrowed = existing.quantity_total - existing.quantity_available;
    const available = Math.max(0, quantityTotal - Math.max(0, borrowed));
    await supabase
      .from('equipment_inventory')
      .update({
        quantity_total: quantityTotal,
        quantity_available: available,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('equipment_inventory').insert({
      equipment_id: equipmentId,
      lab_id: labId,
      quantity_total: quantityTotal,
      quantity_available: quantityTotal,
    });
  }
}

/**
 * Adjust available stock by `delta` (negative when loaning out, positive on return).
 * Clamped to [0, quantity_total]. No-op when no inventory row is tracked for the pair
 * (so equipment without managed inventory still loans freely).
 */
export async function adjustInventory(
  equipmentId: string,
  labId: string | null,
  delta: number
): Promise<void> {
  if (!labId || delta === 0) return;
  const existing = await getInventoryRow(equipmentId, labId);
  if (!existing) return;
  const next = Math.max(
    0,
    Math.min(existing.quantity_total, existing.quantity_available + delta)
  );
  await supabase
    .from('equipment_inventory')
    .update({ quantity_available: next, updated_at: new Date().toISOString() })
    .eq('id', existing.id);
}
