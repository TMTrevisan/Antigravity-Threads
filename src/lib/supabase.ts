import { createClient } from '@supabase/supabase-js';

// Use placeholder credentials during Next.js static build steps if environment variables are missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url-for-build-steps.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key-build-step';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or Anon Key is missing in environment. Using placeholder configuration for build step compilation.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Dynamically generate Supabase client using Request headers/Authorization bearer token for secure multi-user session scoping
export function getSupabaseClient(request?: Request) {
  if (!request) return supabase;
  
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }
  
  return supabase;
}
