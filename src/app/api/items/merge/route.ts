import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: Merge two garments together
export async function POST(request: Request) {
  try {
    const client = getSupabaseClient(request);
    const { sourceGarmentId, targetGarmentId } = await request.json();

    if (!sourceGarmentId || !targetGarmentId) {
      return NextResponse.json({ error: 'Both sourceGarmentId and targetGarmentId are required.' }, { status: 400 });
    }

    if (sourceGarmentId === targetGarmentId) {
      return NextResponse.json({ error: 'Cannot merge a garment into itself.' }, { status: 400 });
    }

    // 1. Fetch source garment images & wear logs
    const { data: sourceImages, error: imgError } = await client
      .from('garment_images')
      .select('*')
      .eq('garment_id', sourceGarmentId);

    const { data: sourceWears, error: wearError } = await client
      .from('wear_logs')
      .select('*')
      .eq('garment_id', sourceGarmentId);

    if (imgError || wearError) {
      return NextResponse.json({ error: `Failed to fetch source garment records: ${imgError?.message || wearError?.message}` }, { status: 500 });
    }

    // 2. Re-assign all source images to target garment, forcing them to be secondary/detail type
    if (sourceImages && sourceImages.length > 0) {
      for (const img of sourceImages) {
        const { error: imgUpdateError } = await client
          .from('garment_images')
          .update({
            garment_id: targetGarmentId,
            is_primary_profile: false,
            asset_type: 'detail'
          })
          .eq('id', img.id);
        if (imgUpdateError) {
          return NextResponse.json({ error: `Failed to merge image ${img.id}: ${imgUpdateError.message}` }, { status: 500 });
        }
      }
    }

    // 3. Re-assign all source wear logs to target garment
    if (sourceWears && sourceWears.length > 0) {
      for (const wear of sourceWears) {
        const { error: wearUpdateError } = await client
          .from('wear_logs')
          .update({ garment_id: targetGarmentId })
          .eq('id', wear.id);
        if (wearUpdateError) {
          return NextResponse.json({ error: `Failed to merge wear entry ${wear.id}: ${wearUpdateError.message}` }, { status: 500 });
        }
      }
    }

    // 4. Update saved outfits that reference the source item
    try {
      const { data: outfits } = await client.from('saved_outfits').select('id, item_ids');
      if (outfits && outfits.length > 0) {
        for (const outfit of outfits) {
          if (Array.isArray(outfit.item_ids) && outfit.item_ids.includes(sourceGarmentId)) {
            let updatedIds = outfit.item_ids.map((id: string) => id === sourceGarmentId ? targetGarmentId : id);
            // Deduplicate in case target is already in the list
            updatedIds = Array.from(new Set(updatedIds));
            await client
              .from('saved_outfits')
              .update({ item_ids: updatedIds })
              .eq('id', outfit.id);
          }
        }
      }
    } catch (outfitErr) {
      console.warn('Merge: failed to update referencing saved outfits:', outfitErr);
    }

    // 5. Delete source garment record
    const { error: deleteError } = await client
      .from('garments')
      .delete()
      .eq('id', sourceGarmentId);

    if (deleteError) {
      return NextResponse.json({ error: `Failed to delete source garment: ${deleteError.message}` }, { status: 500 });
    }

    // 6. Fetch target garment fully populated to return to client
    const { data: targetGarment } = await client
      .from('garments')
      .select('*, garment_images(*)')
      .eq('id', targetGarmentId)
      .single();

    const imagesList = targetGarment?.garment_images || [];
    const primary = imagesList.find((img: any) => img.is_primary_profile) || imagesList[0];

    return NextResponse.json({
      success: true,
      item: {
        ...targetGarment,
        images: imagesList,
        primary_image_url: primary ? primary.storage_path : null
      }
    });
  } catch (error: any) {
    console.error('Merge API error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during merge execution' }, { status: 500 });
  }
}
