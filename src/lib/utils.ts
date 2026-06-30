import { supabase } from './supabase';

// -----------------------------------------------------------------------------
// Get-or-create helpers — find a row by name, insert it if it does not exist.
// -----------------------------------------------------------------------------

export async function getOrCreateApplicationType(
  name: string,
  userId: string
): Promise<string> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from('application_types')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('application_types')
    .insert({ name: trimmed, created_by: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getOrCreateSalesRep(
  name: string,
  userId: string
): Promise<string> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from('sales_reps')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('sales_reps')
    .insert({ name: trimmed, created_by: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getOrCreateTag(name: string): Promise<string> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from('project_tags')
    .select('name')
    .eq('name', trimmed)
    .maybeSingle();
  if (existing) return existing.name;

  const { data, error } = await supabase
    .from('project_tags')
    .insert({ name: trimmed })
    .select('name')
    .single();
  if (error) throw error;
  return data.name;
}

// -----------------------------------------------------------------------------
// Audit trail
// -----------------------------------------------------------------------------

export async function createAdminLog(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  changes?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('admin_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    changes: changes ?? null,
  });
  if (error) {
    // Never let an audit-log failure break the primary action.
    console.error('Failed to write admin log:', error);
  }
}

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

export function formatDate(dateString: string | null | undefined, includeTime = true): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return date.toLocaleDateString('en-US', options);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// -----------------------------------------------------------------------------
// Status colors — Tailwind classes for projects and loans.
// -----------------------------------------------------------------------------

export function getStatusColor(status: string): string {
  switch (status) {
    // project statuses
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'complete':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'cancelled':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'not_feasible':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    // loan statuses
    case 'borrowing':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'returned':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'overdue':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export const PROJECT_STATUSES = [
  'pending',
  'in_progress',
  'complete',
  'cancelled',
  'not_feasible',
] as const;

export function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// -----------------------------------------------------------------------------
// Loan overdue logic
// -----------------------------------------------------------------------------

export function isLoanOverdue(
  expectedReturnDate: string,
  actualReturnDate: string | null,
  status: string
): boolean {
  if (status === 'returned' || actualReturnDate) return false;
  const expected = new Date(expectedReturnDate);
  if (Number.isNaN(expected.getTime())) return false;
  // Compare against the start of today (date-only semantics).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expected.setHours(0, 0, 0, 0);
  return expected.getTime() < today.getTime();
}

// -----------------------------------------------------------------------------
// File helpers
// -----------------------------------------------------------------------------

/** Sanitize a filename: replace unsafe characters with _ and cap at 200 chars. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[&?#%]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[<>:"/\\|*]/g, '_');
  return cleaned.slice(0, 200);
}

/**
 * Compress an image client-side via canvas if it is larger than 1MB.
 * Non-image files (or small images) are returned unchanged.
 * Max dimension 1920px, JPEG quality 80%.
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
  const ONE_MB = 1024 * 1024;
  if (!file.type.startsWith('image/') || file.size <= ONE_MB) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1920;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], newName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/** Build a unique storage path under a folder using a timestamp. */
export function buildStoragePath(folder: string, fileName: string): string {
  return `${folder}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

/** Create a signed URL (1-hour expiry) for a private storage object. */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error('Failed to create signed URL:', error);
    return null;
  }
  return data.signedUrl;
}

/** Compute initials from a display name or email. */
export function getInitials(nameOrEmail: string): string {
  const base = (nameOrEmail || '').trim();
  if (!base) return '?';
  if (base.includes('@')) {
    return base[0].toUpperCase();
  }
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
