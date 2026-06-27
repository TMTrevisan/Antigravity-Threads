import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET all items joined with their garment_images
export async function GET() {
  try {
    const { data: items, error } = await supabase
      .from('garments')
      .select('*, garment_images(*)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const itemsWithImages = (items || []).map((item: any) => {
      const images = item.garment_images || [];
      const primary = images.find((img: any) => img.is_primary_profile) || images[0];
      return {
        ...item,
        images,
        primary_image_url: primary ? primary.storage_path : null,
      };
    });

    return NextResponse.json({ items: itemsWithImages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// PATCH update item details
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, images, primary_image_url, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });
    }

    // 1. Update core garment data
    const { data: updatedItem, error } = await supabase
      .from('garments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Query related images to return in updated state
    const { data: garmentImages } = await supabase
      .from('garment_images')
      .select('*')
      .eq('garment_id', id);

    const imagesList = garmentImages || [];
    const primary = imagesList.find((img: any) => img.is_primary_profile) || imagesList[0];

    return NextResponse.json({ 
      success: true, 
      item: {
        ...updatedItem,
        images: imagesList,
        primary_image_url: primary ? primary.storage_path : null,
      } 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// DELETE item and all its associated images in storage
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });
    }

    // 1. Fetch all associated garment images
    const { data: images, error: fetchError } = await supabase
      .from('garment_images')
      .select('storage_path')
      .eq('garment_id', id);

    if (fetchError) {
      return NextResponse.json({ error: `Failed to fetch images: ${fetchError.message}` }, { status: 500 });
    }

    // 2. Loop and delete each file from Supabase Storage bucket
    if (images && images.length > 0) {
      const storagePaths = images
        .map((img: any) => {
          const urlParts = img.storage_path.split('/wardrobe-images/');
          return urlParts.length > 1 ? urlParts[1] : null;
        })
        .filter((path): path is string => !!path);

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('wardrobe-images')
          .remove(storagePaths);
        
        if (storageError) {
          console.warn('Failed to remove images from storage:', storageError.message);
        }
      }
    }

    // 3. Delete row from database (Cascades deletion to garment_images due to foreign key constraint)
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
