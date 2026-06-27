import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. Fetch all records from billing_and_token_ledger
    const { data: ledger, error } = await supabase
      .from('billing_and_token_ledger')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Perform aggregation
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCost = 0;
    
    const serviceStats: Record<string, { count: number; totalLatency: number; totalCost: number }> = {};

    ledger.forEach((entry: any) => {
      totalTokensIn += entry.tokens_in || 0;
      totalTokensOut += entry.tokens_out || 0;
      totalCost += Number(entry.estimated_cost || 0);

      const service = entry.service;
      if (!serviceStats[service]) {
        serviceStats[service] = { count: 0, totalLatency: 0, totalCost: 0 };
      }
      serviceStats[service].count += 1;
      serviceStats[service].totalLatency += entry.latency_ms || 100; // default/fallback latency
      serviceStats[service].totalCost += Number(entry.estimated_cost || 0);
    });

    const services = Object.keys(serviceStats).map(key => ({
      service: key,
      count: serviceStats[key].count,
      avgLatencyMs: Math.round(serviceStats[key].totalLatency / serviceStats[key].count),
      totalCost: Number(serviceStats[key].totalCost.toFixed(6)),
    }));

    return NextResponse.json({
      success: true,
      stats: {
        totalTokensIn,
        totalTokensOut,
        totalCost: Number(totalCost.toFixed(6)),
        services,
      },
      recentLogs: ledger.slice(0, 15),
    });
  } catch (error: any) {
    console.error('Telemetry query error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
