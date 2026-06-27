import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const notes = formData.get('notes') as string | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    // 1. Convert file to buffer for Supabase upload
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // 2. Upload to Supabase Storage
    const fileExtension = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
    const filePath = `raw/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(filePath, buffer, {
        contentType: imageFile.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload image to storage: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('wardrobe-images')
      .getPublicUrl(filePath);

    // 3. Save to database with status 'Processing' and placeholder required properties
    const { data: dbItem, error: dbError } = await supabase
      .from('garments')
      .insert([
        {
          raw_image_url: publicUrl,
          category: 'Tops', // Temporary fallback
          sub_category: 'Processing...',
          color_family: 'Extracting...',
          tonal_value: 'Light', // Temporary fallback
          fabric_type: 'Extracting...',
          fit_block: 'Extracting...',
          status: 'Processing',
          notes: notes || null,
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('Database insertion error:', dbError);
      return NextResponse.json(
        { error: `Failed to save to database: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item: dbItem });
  } catch (error: any) {
    console.error('Upload handler error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during image upload.' },
      { status: 500 }
    );
  }
}
