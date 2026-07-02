import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: { message: 'Sign in to use AI features.' } }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: { message: 'Sign in to use AI features.' } }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const payload = await req.json()
    payload.model = 'gemini-2.0-flash'

    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GEMINI_API_KEY,
        },
        body: JSON.stringify(payload),
      }
    )

    const data = await resp.json()
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(
      JSON.stringify({ error: { message: msg } }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
