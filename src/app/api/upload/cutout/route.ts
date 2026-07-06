import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const garmentId = formData.get('garmentId') as string | null;
    const file = formData.get('file') as File | null;

    if (!garmentId) {
      return NextResponse.json({ error: 'No garment ID provided.' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'No cutout image file provided.' }, { status: 400 });
    }

    // 1. Fetch primary image record for this garment
    const { data: primaryImage, error: fetchError } = await supabase
      .from('garment_images')
      .select('id')
      .eq('garment_id', garmentId)
      .eq('is_primary_profile', true)
      .single();

    if (fetchError || !primaryImage) {
      return NextResponse.json({ error: 'Primary garment image record not found.' }, { status: 404 });
    }

    // 2. Upload cutout file to Supabase storage
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileName = `processed/${garmentId}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('wardrobe-images')
      .getPublicUrl(fileName);

    // 3. Update the garment image table row with the processed path
    const { error: updateError } = await supabase
      .from('garment_images')
      .update({ storage_path: publicUrl })
      .eq('id', primaryImage.id);

    if (updateError) {
      return NextResponse.json({ error: `Database update failed: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error('Cutout upload error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred uploading the cutout.' }, { status: 500 });
  }
}
