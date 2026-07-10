import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET all saved outfits
export async function GET(request: Request) {
  try {
    const client = getSupabaseClient(request);
    const { data: outfits, error } = await client
      .from('saved_outfits')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ outfits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// POST save a new outfit combination
export async function POST(request: Request) {
  try {
    const { name, item_ids, styling_reasoning } = await request.json();

    if (!name || !item_ids || !Array.isArray(item_ids)) {
      return NextResponse.json({ error: 'Name and item_ids array are required.' }, { status: 400 });
    }

    const client = getSupabaseClient(request);
    const { data: outfit, error } = await client
      .from('saved_outfits')
      .insert([
        {
          name,
          item_ids,
          styling_reasoning: styling_reasoning || null,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, outfit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// DELETE a saved outfit
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Outfit ID is required.' }, { status: 400 });
    }

    const client = getSupabaseClient(request);
    const { error } = await client
      .from('saved_outfits')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
