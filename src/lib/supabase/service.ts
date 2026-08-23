import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

function createServiceClient(serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let serviceClient: ReturnType<typeof createServiceClient> | null = null;

export function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged database access.");
  }

  if (!serviceClient) {
    serviceClient = createServiceClient(serviceKey);
  }

  return serviceClient;
}
