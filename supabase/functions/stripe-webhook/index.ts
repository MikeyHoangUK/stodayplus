// Stripe → Stoday Plus: keeps public.subscriptions in step with Stripe.
//
// Stripe calls this URL when a parent pays through the Plus Payment Link or a
// subscription changes (renews, fails, is cancelled). Every request is checked
// against STRIPE_WEBHOOK_SECRET so only Stripe can unlock Plus.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_WEBHOOK_SECRET   whsec_… from the Stripe webhook endpoint (required)
//   STRIPE_SECRET_KEY       optional; not needed for these events
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy without JWT checks (Stripe can't send a Supabase login):
//   supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || 'sk_unused', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reply = (status: number, body: string) => new Response(body, { status })

// Newer Stripe API versions moved the period end onto the subscription item
function periodEnd(sub: Stripe.Subscription): string | null {
  // deno-lint-ignore no-explicit-any
  const s = sub as any
  const t = s.current_period_end ?? s.items?.data?.[0]?.current_period_end
  return t ? new Date(t * 1000).toISOString() : null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply(405, 'POST only')
  if (!WEBHOOK_SECRET) return reply(500, 'STRIPE_WEBHOOK_SECRET is not set')

  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, WEBHOOK_SECRET, undefined, cryptoProvider)
  } catch (err) {
    return reply(400, 'Bad signature: ' + (err instanceof Error ? err.message : 'unknown'))
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session
      // The app adds ?client_reference_id=<Supabase user id> to the Payment Link
      if (s.mode === 'subscription' && s.client_reference_id && UUID.test(s.client_reference_id)) {
        const { error } = await db.from('subscriptions').upsert({
          user_id: s.client_reference_id,
          stripe_customer_id: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
          stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null,
          status: s.payment_status === 'paid' ? 'active' : 'incomplete',
          livemode: event.livemode,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (error) throw error
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      // The founding offer is the £5 price (first 50 families keep it for life)
      const price = sub.items?.data?.[0]?.price
      const fields = {
        price_id: price?.id ?? null,
        unit_amount: price?.unit_amount ?? null,
        founding: price?.unit_amount === 500,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        current_period_end: periodEnd(sub),
        cancel_at_period_end: !!sub.cancel_at_period_end,
        livemode: event.livemode,
        updated_at: new Date().toISOString(),
      }
      // Match by subscription id; fall back to the customer if checkout hasn't been recorded yet
      const bySub = await db.from('subscriptions').update(fields).eq('stripe_subscription_id', sub.id).select('user_id')
      if (bySub.error) throw bySub.error
      if (!bySub.data?.length) {
        const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        const byCust = await db.from('subscriptions').update({ ...fields, stripe_subscription_id: sub.id }).eq('stripe_customer_id', customer).select('user_id')
        if (byCust.error) throw byCust.error
        // Neither found: checkout.session.completed hasn't arrived yet; it will set the row up.
      }
    }
  } catch (err) {
    // 500 makes Stripe retry later
    return reply(500, 'Database error: ' + (err instanceof Error ? err.message : JSON.stringify(err)))
  }
  return reply(200, 'ok')
})
