import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const garmentId = formData.get('garmentId') as string | null;
    const file = formData.get('file') as File | null;

    if (!garmentId) {
      return NextResponse.json({ error: 'Missing garmentId.' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate image format
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Security Violation: File is not an image.' }, { status: 400 });
    }

    const fileExtension = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${garmentId}-add-${Date.now()}.${fileExtension}`;
    const filePath = `raw/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('wardrobe-images')
      .getPublicUrl(filePath);

    // Register in garment_images (set as non-primary initially)
    const { data: imgRecord, error: imgError } = await supabase
      .from('garment_images')
      .insert([
        {
          garment_id: garmentId,
          storage_path: publicUrl,
          is_primary_profile: false,
          asset_type: 'detail',
        },
      ])
      .select()
      .single();

    if (imgError) {
      return NextResponse.json({ error: `Database insertion failed: ${imgError.message}` }, { status: 500 });
    }

    // Return updated images list for this garment
    const { data: updatedImages } = await supabase
      .from('garment_images')
      .select('*')
      .eq('garment_id', garmentId);

    return NextResponse.json({ success: true, image: imgRecord, images: updatedImages });
  } catch (error: any) {
    console.error('Add image error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred uploading the image' }, { status: 500 });
  }
}
