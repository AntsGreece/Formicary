import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    'Missing Supabase env vars. Copy .env.local.example to .env.local and fill in your keys, then restart `npm run dev`.',
  )
}

export const supabase = createClient(url, anonKey)
