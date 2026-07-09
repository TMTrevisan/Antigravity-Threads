import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { garmentId, storagePath } = await request.json();

    if (!garmentId || !storagePath) {
      return NextResponse.json({ error: 'Missing garmentId or storagePath.' }, { status: 400 });
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

    let processedImageUrl = null;
    const removeBgApiKey = process.env.REMOVE_BG_API_KEY || '';
    const localRemoverUrl = process.env.BACKGROUND_REMOVER_URL || '';
    
    // Attempt 1: Remove.bg API
    if (removeBgApiKey) {
      try {
        const removeBgFormData = new FormData();
        removeBgFormData.append('image_url', storagePath);
        removeBgFormData.append('size', 'auto');

        const removeBgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: { 'X-Api-Key': removeBgApiKey },
          body: removeBgFormData,
        });

        if (removeBgRes.ok) {
          const cutoutBlob = await removeBgRes.blob();
          const cutoutBuffer = Buffer.from(await cutoutBlob.arrayBuffer());

          const cutoutFileName = `processed/${garmentId}-${Date.now()}.png`;
          const { error: cutoutError } = await supabase.storage
            .from('wardrobe-images')
            .upload(cutoutFileName, cutoutBuffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (!cutoutError) {
            const { data: { publicUrl } } = supabase.storage
              .from('wardrobe-images')
              .getPublicUrl(cutoutFileName);
            processedImageUrl = publicUrl;
          }
        }
      } catch (err) {
        console.error('Server cutout: Remove.bg failed:', err);
      }
    }

    // Attempt 2: Hugging Face Serverless Inference API (briaai/RMBG-1.4)
    if (!processedImageUrl) {
      const hfToken = process.env.HF_TOKEN || '';
      if (hfToken) {
        try {
          const imageResponse = await fetch(storagePath);
          if (imageResponse.ok) {
            const imageBlob = await imageResponse.blob();
            const buffer = Buffer.from(await imageBlob.arrayBuffer());

            const hfRes = await fetch('https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${hfToken}`,
                'Content-Type': 'application/octet-stream',
              },
              body: buffer,
            });

            if (hfRes.ok) {
              const cutoutBuffer = Buffer.from(await hfRes.arrayBuffer());
              const cutoutFileName = `processed/${garmentId}-${Date.now()}.png`;

              const { error: cutoutError } = await supabase.storage
                .from('wardrobe-images')
                .upload(cutoutFileName, cutoutBuffer, {
                  contentType: 'image/png',
                  upsert: true,
                });

              if (!cutoutError) {
                const { data: { publicUrl } } = supabase.storage
                  .from('wardrobe-images')
                  .getPublicUrl(cutoutFileName);
                processedImageUrl = publicUrl;
              }
            }
          }
        } catch (err) {
          console.error('Server cutout: HF Inference failed:', err);
        }
      }
    }

    // Attempt 3: Local Python script fallback
    if (!processedImageUrl) {
      try {
        const imageResponse = await fetch(storagePath);
        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob();
          const buffer = Buffer.from(await imageBlob.arrayBuffer());

          const fs = require('fs');
          const path = require('path');
          const { execSync } = require('child_process');

          const tempDir = path.join(process.cwd(), 'tmp');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const tempIn = path.join(tempDir, `in-${garmentId}.jpg`);
          const tempOut = path.join(tempDir, `out-${garmentId}.png`);

          fs.writeFileSync(tempIn, buffer);

          const pyScript = path.join(process.cwd(), 'scripts', 'remove_bg.py');
          const cmd = `python3 "${pyScript}" "${tempIn}" "${tempOut}"`;
          execSync(cmd);

          if (fs.existsSync(tempOut)) {
            const cutoutBuffer = fs.readFileSync(tempOut);
            const cutoutFileName = `processed/${garmentId}-${Date.now()}.png`;
            
            const { error: cutoutError } = await supabase.storage
              .from('wardrobe-images')
              .upload(cutoutFileName, cutoutBuffer, {
                contentType: 'image/png',
                upsert: true,
              });

            if (!cutoutError) {
              const { data: { publicUrl } } = supabase.storage
                .from('wardrobe-images')
                .getPublicUrl(cutoutFileName);
              processedImageUrl = publicUrl;
            }
          }

          if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
          if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        }
      } catch (err) {
        console.error('Server cutout: Python fallback failed:', err);
      }
    }

    if (!processedImageUrl) {
      return NextResponse.json({ error: 'Background removal failed on the server. Configure HF_TOKEN or REMOVE_BG_API_KEY.' }, { status: 500 });
    }

    // Update primary image record
    const { error: updateError } = await supabase
      .from('garment_images')
      .update({ storage_path: processedImageUrl })
      .eq('id', primaryImage.id);

    if (updateError) {
      return NextResponse.json({ error: `Database update failed: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: processedImageUrl });
  } catch (error: any) {
    console.error('Server cutout error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during server cutout.' }, { status: 500 });
  }
}
