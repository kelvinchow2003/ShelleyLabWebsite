import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY in your .env file (locally) and in your Vercel ' +
      'project Environment Variables (Production + Preview).'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Storage bucket names (private — accessed via signed URLs only).
export const PROJECT_FILES_BUCKET = 'project-files';
export const EQUIPMENT_LOAN_FILES_BUCKET = 'equipment-loan-files';
