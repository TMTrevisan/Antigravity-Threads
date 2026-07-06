import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(request: Request) {
  try {
    const { garmentId, imageId } = await request.json();

    if (!garmentId || !imageId) {
      return NextResponse.json({ error: 'Missing garmentId or imageId.' }, { status: 400 });
    }

    // 1. Set all other images for this garment as not primary
    const { error: resetError } = await supabase
      .from('garment_images')
      .update({ is_primary_profile: false })
      .eq('garment_id', garmentId);

    if (resetError) {
      return NextResponse.json({ error: `Reset primary failed: ${resetError.message}` }, { status: 500 });
    }

    // 2. Set the chosen image as primary
    const { error: setError } = await supabase
      .from('garment_images')
      .update({ is_primary_profile: true })
      .eq('id', imageId);

    if (setError) {
      return NextResponse.json({ error: `Set primary failed: ${setError.message}` }, { status: 500 });
    }

    // 3. Return updated images list
    const { data: updatedImages } = await supabase
      .from('garment_images')
      .select('*')
      .eq('garment_id', garmentId);

    return NextResponse.json({ success: true, images: updatedImages });
  } catch (error: any) {
    console.error('Set primary image error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred setting primary image' }, { status: 500 });
  }
}
