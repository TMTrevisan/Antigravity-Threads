import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const client = getSupabaseClient(request);
    const { data: measurements, error } = await client
      .from('user_measurements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, measurements });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { label, measurement_type, details } = body;

    if (!label || !measurement_type) {
      return NextResponse.json({ error: 'Label and type are required.' }, { status: 400 });
    }

    const client = getSupabaseClient(request);
    const { data: measurement, error } = await client
      .from('user_measurements')
      .insert([{ label, measurement_type, details: details || {} }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, measurement });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required.' }, { status: 400 });
    }

    const client = getSupabaseClient(request);
    const { error } = await client
      .from('user_measurements')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
