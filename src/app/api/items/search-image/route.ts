import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logTelemetry } from '@/lib/telemetry';

// Google Custom Search API – returns real, directly-accessible image URLs.
// Keys: GOOGLE_CSE_KEY (API key) + GOOGLE_CSE_CX (Programmable Search Engine ID, image-only).
// Free tier: 100 queries/day. Set up at https://programmablesearchengine.google.com/
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || '';
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || '';

// Fallback: Gemini grounding (returns landing page URLs, not direct images, but better than nothing)
import { GoogleGenAI } from '@google/genai';
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// POST: Search the web for clean manufacturer images
export async function POST(request: Request) {
  try {
    const { brand, description } = await request.json();

    if (!brand && !description) {
      return NextResponse.json({ error: 'Please provide at least a brand or a description.' }, { status: 400 });
    }

    const cleanSearchQuery = `${brand || ''} ${description || ''}`.trim();
    console.log(`Image search for: "${cleanSearchQuery}"`);

    // ── PATH A: Google Custom Search API (preferred – real image URLs) ──────────
    if (GOOGLE_CSE_KEY && GOOGLE_CSE_CX) {
      try {
        // Two rounds: first try exact query, then broaden with "product photo"
        const queries = [
          `${cleanSearchQuery} product photo`,
          `${cleanSearchQuery} official`
        ];

        const allImages: { url: string; source: string; title: string }[] = [];

        for (const q of queries) {
          if (allImages.length >= 8) break;
          const url = new URL('https://www.googleapis.com/customsearch/v1');
          url.searchParams.set('key', GOOGLE_CSE_KEY);
          url.searchParams.set('cx', GOOGLE_CSE_CX);
          url.searchParams.set('searchType', 'image');
          url.searchParams.set('q', q);
          url.searchParams.set('num', '5');
          url.searchParams.set('imgType', 'photo');
          url.searchParams.set('safe', 'active');

          const res = await fetch(url.toString());
          if (!res.ok) {
            const errText = await res.text();
            console.warn('Google CSE error:', res.status, errText);
            break;
          }
          const data = await res.json();
          for (const item of (data.items || [])) {
            if (!allImages.find(i => i.url === item.link)) {
              allImages.push({
                url: item.link,
                source: item.displayLink || 'Google Images',
                title: item.title || cleanSearchQuery
              });
            }
          }
        }

        await logTelemetry('Gemini_Search_Image', 0, 0, { brand, query: cleanSearchQuery, engine: 'google_cse', results: allImages.length });
        return NextResponse.json({ images: allImages.slice(0, 8) });
      } catch (cseErr: any) {
        console.error('Google CSE search failed, falling back to Gemini grounding:', cseErr.message);
      }
    }

    // ── PATH B: Gemini Grounding fallback (returns page thumbnails, not always direct) ──
    if (!ai) {
      return NextResponse.json({ error: 'No search engine configured. Add GOOGLE_CSE_KEY + GOOGLE_CSE_CX or GEMINI_API_KEY to your environment.' }, { status: 500 });
    }

    const queryText = `Find 6 direct, high-quality product image URLs (ending in .jpg, .jpeg, .png, or .webp) for the exact garment: "${cleanSearchQuery}". Search only official brand sites, Nordstrom, SSENSE, Farfetch, Mr Porter, or similar premium fashion retailers. Return ONLY direct image file URLs — no redirect links, no HTML page links.`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: queryText,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            images: {
              type: 'ARRAY',
              description: 'Direct product image URLs from brand or retailer CDNs.',
              items: {
                type: 'OBJECT',
                properties: {
                  url: { type: 'STRING', description: 'Direct image URL ending in .jpg/.png/.webp' },
                  source: { type: 'STRING', description: 'Retailer or brand name (e.g., Nordstrom)' },
                  title: { type: 'STRING', description: 'Product title' }
                },
                required: ['url', 'source']
              }
            }
          },
          required: ['images']
        }
      }
    });

    const text = response.text;
    if (!text) return NextResponse.json({ images: [] });

    const parsed = JSON.parse(text);

    const promptTokens = response.usageMetadata?.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
    await logTelemetry('Gemini_Search_Image', promptTokens, candidatesTokens, { brand, query: cleanSearchQuery, engine: 'gemini_grounding' });

    return NextResponse.json({ images: parsed.images || [] });
  } catch (error: any) {
    console.error('Image search route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during search' }, { status: 500 });
  }
}

// PUT: Download the chosen manufacturer image and replace the garment's primary profile image
export async function PUT(request: Request) {
  try {
    const { garmentId, imageUrl } = await request.json();

    if (!garmentId || !imageUrl) {
      return NextResponse.json({ error: 'Missing garmentId or imageUrl.' }, { status: 400 });
    }

    console.log(`Downloading replacement image for garment ${garmentId}: ${imageUrl}`);

    // Fetch image with browser-like headers to avoid 403 blocks from CDNs
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
      }
    });

    if (!imageResponse.ok) {
      return NextResponse.json({ error: `Failed to download image: HTTP ${imageResponse.status}` }, { status: 400 });
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: `URL does not point to an image (got ${contentType})` }, { status: 400 });
    }

    const blob = await imageResponse.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Find the primary image record for this garment
    const { data: primaryImage, error: fetchError } = await supabase
      .from('garment_images')
      .select('id')
      .eq('garment_id', garmentId)
      .eq('is_primary_profile', true)
      .single();

    if (fetchError || !primaryImage) {
      // If no primary image exists yet, insert a new one
      const ext = contentType.split('/').pop()?.split(';')[0] || 'jpg';
      const fileName = `raw/${garmentId}-replaced-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('wardrobe-images')
        .upload(fileName, buffer, { contentType, upsert: true });

      if (uploadError) {
        return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
      }

      const { data: { publicUrl } } = supabase.storage.from('wardrobe-images').getPublicUrl(fileName);

      const { error: insertError } = await supabase.from('garment_images').insert({
        garment_id: garmentId,
        storage_path: publicUrl,
        is_primary_profile: true,
        asset_type: 'profile'
      });

      if (insertError) {
        return NextResponse.json({ error: `DB insert failed: ${insertError.message}` }, { status: 500 });
      }

      await supabase.from('garments').update({ status: 'Active', updated_at: new Date().toISOString() }).eq('id', garmentId);
      return NextResponse.json({ success: true, url: publicUrl });
    }

    // Upload new file and update the existing primary image row
    const ext = contentType.split('/').pop()?.split(';')[0] || 'jpg';
    const fileName = `raw/${garmentId}-replaced-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(fileName, buffer, { contentType, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from('wardrobe-images').getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from('garment_images')
      .update({ storage_path: publicUrl })
      .eq('id', primaryImage.id);

    if (updateError) {
      return NextResponse.json({ error: `DB update failed: ${updateError.message}` }, { status: 500 });
    }

    await supabase.from('garments').update({ status: 'Active', updated_at: new Date().toISOString() }).eq('id', garmentId);
    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error('Image replacement PUT route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during replacement' }, { status: 500 });
  }
}
