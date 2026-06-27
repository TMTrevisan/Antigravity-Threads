import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET all items
export async function GET() {
  try {
    const { data: items, error } = await supabase
      .from('garments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// PATCH update item details
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });
    }

    const { data: updatedItem, error } = await supabase
      .from('garments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// DELETE item and its associated image in storage
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });
    }

    // 1. Fetch item to get the image URL
    const { data: item, error: fetchError } = await supabase
      .from('garments')
      .select('raw_image_url')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    // 2. Delete from Supabase Storage bucket
    const urlParts = item.raw_image_url.split('/wardrobe-images/');
    if (urlParts.length > 1) {
      const storagePath = urlParts[1];
      const { error: storageError } = await supabase.storage
        .from('wardrobe-images')
        .remove([storagePath]);
      
      if (storageError) {
        console.warn('Failed to remove image from storage:', storageError.message);
      }
    }

    // 3. Delete row from database
    const { error: deleteError } = await supabase
      .from('garments')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
