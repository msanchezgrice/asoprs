const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!configuredSupabaseUrl || !configuredSupabaseAnonKey) {
  throw new Error("Supabase public configuration is missing.");
}

const supabaseUrl: string = configuredSupabaseUrl;
const supabaseAnonKey: string = configuredSupabaseAnonKey;

export { supabaseAnonKey, supabaseUrl };
