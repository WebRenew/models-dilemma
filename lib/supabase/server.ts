import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

/**
 * Creates a Supabase client for Server Components with cookie-based auth.
 * Uses anon key - suitable for read operations and user-authenticated writes.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
        }
      },
    },
  })
}

/**
 * Creates a Supabase admin client with service role key.
 * Bypasses RLS - use for server-side operations that need full access.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  // Handle typo in env var name (KEYY vs KEY)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEYY

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export { createClient as createServerClient }
