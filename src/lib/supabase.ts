import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

export { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
