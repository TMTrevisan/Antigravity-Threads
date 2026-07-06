import { supabase } from './supabase';

export type TokenService = 'Gemini_Vision_Ingest' | 'Gemini_Stylist_Engine' | 'Pirate_Weather_API' | 'Gemini_Search_Image';

/**
 * Logs token usage and estimated API cost to the billing_and_token_ledger table.
 */
export async function logTelemetry(
  service: TokenService,
  tokensIn: number,
  tokensOut: number,
  metadata?: Record<string, any>
) {
  try {
    // Pricing rates per 1,000,000 tokens (Gemini 2.5 Flash / 1.5 Flash reference rates)
    // Vision Ingest & Stylist: Input: $0.075 / 1M, Output: $0.30 / 1M
    // Pirate Weather API is treated as a flat token-cost mock rate
    let costPerTokenIn = 0.000000075; // $0.075 / 1,000,000
    let costPerTokenOut = 0.0000003;  // $0.30 / 1,000,000

    if (service === 'Pirate_Weather_API') {
      costPerTokenIn = 0.0001; // Weather flat lookup cost mock
      costPerTokenOut = 0;
    }

    const estimatedCost = (tokensIn * costPerTokenIn) + (tokensOut * costPerTokenOut);

    const { error } = await supabase.from('billing_and_token_ledger').insert([
      {
        service,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        estimated_cost: Number(estimatedCost.toFixed(6)),
        metadata: {
          ...metadata,
          env: process.env.NODE_ENV,
        },
      },
    ]);

    if (error) {
      console.warn('Telemetry insertion warning:', error.message);
    }
  } catch (err) {
    console.error('Failed to log telemetry:', err);
  }
}
