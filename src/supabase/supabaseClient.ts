import { Database } from "types/supabase";
import { createClient } from "@supabase/supabase-js";

// Use this for client side db call. Automatically uses anon key that can fetch only the logged user data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

export default supabase;
