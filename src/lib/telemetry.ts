import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type TokenService = 'Gemini_Vision_Ingest' | 'Gemini_Stylist_Engine' | 'Pirate_Weather_API' | 'Gemini_Search_Image';

/**
 * Logs token usage and estimated API cost to the billing_and_token_ledger
 * table. Pass the authenticated user's JWT-scoped client when available
 * so the row carries `user_id` and the per-user telemetry dashboard works.
 */
export async function logTelemetry(
  service: TokenService,
  tokensIn: number,
  tokensOut: number,
  metadata?: Record<string, any>,
  options: { client?: SupabaseClient; userId?: string } = {}
) {
  try {
    const client = options.client ?? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    // Pricing rates per 1,000,000 tokens (Gemini 2.5 Flash / 1.5 Flash reference rates)
    let costPerTokenIn = 0.000000075; // $0.075 / 1M
    let costPerTokenOut = 0.0000003;  // $0.30 / 1M

    if (service === 'Pirate_Weather_API') {
      costPerTokenIn = 0.0001; // Weather flat lookup cost mock
      costPerTokenOut = 0;
    }

    const estimatedCost = (tokensIn * costPerTokenIn) + (tokensOut * costPerTokenOut);

    const row: Record<string, unknown> = {
      service,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      estimated_cost: Number(estimatedCost.toFixed(6)),
      metadata: {
        ...metadata,
        env: process.env.NODE_ENV,
      },
    };
    if (options.userId) row.user_id = options.userId;

    const { error } = await client.from('billing_and_token_ledger').insert([row]);

    if (error) {
      console.warn('Telemetry insertion warning:', error.message);
    }
  } catch (err) {
    console.error('Failed to log telemetry:', err);
  }
}