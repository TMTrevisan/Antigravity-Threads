import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET all wear logs (to compute CPW client-side)
export async function GET() {
  try {
    const { data: logs, error } = await supabase
      .from('wear_logs')
      .select('id, garment_id, worn_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// POST log a garment as worn
export async function POST(request: Request) {
  try {
    const { garment_id } = await request.json();

    if (!garment_id) {
      return NextResponse.json({ error: 'garment_id is required.' }, { status: 400 });
    }

    const { data: log, error } = await supabase
      .from('wear_logs')
      .insert([
        {
          garment_id,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
