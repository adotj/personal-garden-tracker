import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔧 Supabase URL loaded:', supabaseUrl);
console.log('🔧 Supabase Key loaded (first 30 chars):', supabaseAnonKey?.substring(0, 30));

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);
