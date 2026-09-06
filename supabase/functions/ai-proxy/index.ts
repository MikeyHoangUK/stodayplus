import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
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

  if (!GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: 'GROQ_API_KEY secret is not set in Supabase.' } }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const payload = await req.json()
    // llama-3.3-70b-versatile was deprecated by Groq on 2026-08-16; gpt-oss-120b is their recommended replacement
    payload.model = 'openai/gpt-oss-120b'

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const rawText = await resp.text()
    let data: unknown
    try { data = JSON.parse(rawText) } catch { data = { error: { message: rawText } } }

    if (!resp.ok) {
      const errMsg = (data as { error?: { message?: string } })?.error?.message
        || `Groq error ${resp.status}: ${rawText.slice(0, 300)}`
      return new Response(
        JSON.stringify({ error: { message: errMsg } }),
        { status: resp.status, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify(data), {
      status: 200,
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
