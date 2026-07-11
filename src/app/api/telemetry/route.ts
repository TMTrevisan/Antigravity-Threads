import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api';
import { fail, ok } from '@/lib/api';

export const GET = withUser(async ({ user }) => {
  // 1. Fetch this user's ledger rows only.
  // NOTE: this route previously used `order('timestamp', ...)`. The actual
  // column name in production is unverified — see REVIEW.md tech-debt #12.
  // Adjust to `created_at` here once confirmed.
  const { data: ledger, error } = await user.client
    .from('billing_and_token_ledger')
    .select('*')
    .eq('user_id', user.id)
    .order('timestamp', { ascending: false })
    .limit(500);

  if (error) return fail(500, error.message);

  // 2. Aggregate.
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;

  const serviceStats: Record<string, { count: number; totalLatency: number; totalCost: number }> = {};

  for (const entry of ledger || []) {
    totalTokensIn += entry.tokens_in || 0;
    totalTokensOut += entry.tokens_out || 0;
    totalCost += Number(entry.estimated_cost || 0);

    const service = entry.service;
    if (!serviceStats[service]) {
      serviceStats[service] = { count: 0, totalLatency: 0, totalCost: 0 };
    }
    serviceStats[service].count += 1;
    serviceStats[service].totalLatency += entry.latency_ms || 100;
    serviceStats[service].totalCost += Number(entry.estimated_cost || 0);
  }

  const services = Object.keys(serviceStats).map((key) => ({
    service: key,
    count: serviceStats[key].count,
    avgLatencyMs: Math.round(serviceStats[key].totalLatency / serviceStats[key].count),
    totalCost: Number(serviceStats[key].totalCost.toFixed(6)),
  }));

  return ok({
    stats: {
      totalTokensIn,
      totalTokensOut,
      totalCost: Number(totalCost.toFixed(6)),
      services,
    },
    recentLogs: ledger,
  });
});