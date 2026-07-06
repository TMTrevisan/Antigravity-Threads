import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(request: Request) {
  try {
    const { garmentId, imageId } = await request.json();

    if (!garmentId || !imageId) {
      return NextResponse.json({ error: 'Missing garmentId or imageId.' }, { status: 400 });
    }

    // 1. Fetch image path to delete from storage
    const { data: imgRecord, error: fetchError } = await supabase
      .from('garment_images')
      .select('storage_path, is_primary_profile')
      .eq('id', imageId)
      .single();

    if (fetchError || !imgRecord) {
      return NextResponse.json({ error: 'Image record not found.' }, { status: 404 });
    }

    // Do not allow deleting the primary image if there are other images unless they promote another one first
    if (imgRecord.is_primary_profile) {
      return NextResponse.json({ error: 'Cannot delete the primary profile image. Set another image as primary first.' }, { status: 400 });
    }

    // Extract file path from public URL
    const urlParts = imgRecord.storage_path.split('/wardrobe-images/');
    const filePath = urlParts[1];

    if (filePath) {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('wardrobe-images')
        .remove([filePath]);
      if (storageError) {
        console.warn('Storage deletion warning:', storageError.message);
      }
    }

    // 2. Delete from database
    const { error: dbError } = await supabase
      .from('garment_images')
      .delete()
      .eq('id', imageId);

    if (dbError) {
      return NextResponse.json({ error: `Database deletion failed: ${dbError.message}` }, { status: 500 });
    }

    // 3. Return updated images list
    const { data: updatedImages } = await supabase
      .from('garment_images')
      .select('*')
      .eq('garment_id', garmentId);

    return NextResponse.json({ success: true, images: updatedImages });
  } catch (error: any) {
    console.error('Delete image error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred deleting the image' }, { status: 500 });
  }
}
