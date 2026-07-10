import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logTelemetry } from '@/lib/telemetry';

/**
 * Image Search Priority Chain:
 *
 * 1. BING IMAGE SEARCH (recommended primary)
 *    - Azure Cognitive Services / Bing Search v7
 *    - Free tier: 1,000 queries/month
 *    - Setup: https://portal.azure.com → Create "Bing Search v7" resource
 *    - Env var: BING_SEARCH_KEY
 *
 * 2. SERPER.DEV (Google Image search proxy – easiest setup)
 *    - Free tier: 2,500 queries total (then $50/50k)
 *    - Setup: https://serper.dev → create account → copy API key
 *    - Env var: SERPER_API_KEY
 *
 * 3. GOOGLE CSE (legacy – only works for engines created before Jan 20 2026
 *    that still have "Search the entire web" toggled ON)
 *    - Env vars: GOOGLE_CSE_KEY + GOOGLE_CSE_CX
 *
 * 4. GEMINI GROUNDING (last resort – returns page URLs not direct image CDN links)
 *    - Env var: GEMINI_API_KEY
 */

const BING_SEARCH_KEY = process.env.BING_SEARCH_KEY || '';
const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || '';
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || '';

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
    console.log(`[image-search] Query: "${cleanSearchQuery}"`);

    // ── PATH 1: Bing Image Search ────────────────────────────────────────────
    if (BING_SEARCH_KEY) {
      try {
        const q = encodeURIComponent(`${cleanSearchQuery} product photo`);
        const bingUrl = `https://api.bing.microsoft.com/v7.0/images/search?q=${q}&count=8&imageType=Photo&safeSearch=Moderate`;

        const res = await fetch(bingUrl, {
          headers: { 'Ocp-Apim-Subscription-Key': BING_SEARCH_KEY }
        });

        if (res.ok) {
          const data = await res.json();
          const images = (data.value || []).map((item: any) => ({
            url: item.contentUrl,
            source: item.hostPageDisplayUrl || item.hostPageUrl || 'Bing Images',
            title: item.name || cleanSearchQuery
          }));
          await logTelemetry('Gemini_Search_Image', 0, 0, { brand, query: cleanSearchQuery, engine: 'bing', results: images.length });
          return NextResponse.json({ images: images.slice(0, 8) });
        } else {
          const errText = await res.text();
          console.warn('[image-search] Bing error:', res.status, errText);
        }
      } catch (bingErr: any) {
        console.error('[image-search] Bing failed, trying next:', bingErr.message);
      }
    }

    // ── PATH 2: Serper.dev (Google Image search proxy) ──────────────────────
    if (SERPER_API_KEY) {
      try {
        const res = await fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: {
            'X-API-KEY': SERPER_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: `${cleanSearchQuery} product photo`, num: 8 })
        });

        if (res.ok) {
          const data = await res.json();
          const images = (data.images || []).map((item: any) => ({
            url: item.imageUrl,
            source: item.source || 'Google Images',
            title: item.title || cleanSearchQuery
          }));
          await logTelemetry('Gemini_Search_Image', 0, 0, { brand, query: cleanSearchQuery, engine: 'serper', results: images.length });
          return NextResponse.json({ images: images.slice(0, 8) });
        } else {
          const errText = await res.text();
          console.warn('[image-search] Serper error:', res.status, errText);
        }
      } catch (serperErr: any) {
        console.error('[image-search] Serper failed, trying next:', serperErr.message);
      }
    }

    // ── PATH 3: Google CSE (legacy engines with "Search the entire web" ON) ─
    if (GOOGLE_CSE_KEY && GOOGLE_CSE_CX) {
      try {
        const allImages: { url: string; source: string; title: string }[] = [];
        const queries = [`${cleanSearchQuery} product photo`, `${cleanSearchQuery} official`];

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
            console.warn('[image-search] CSE error:', res.status, errText);
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

        if (allImages.length > 0) {
          await logTelemetry('Gemini_Search_Image', 0, 0, { brand, query: cleanSearchQuery, engine: 'google_cse', results: allImages.length });
          return NextResponse.json({ images: allImages.slice(0, 8) });
        }
      } catch (cseErr: any) {
        console.error('[image-search] CSE failed, trying Gemini grounding:', cseErr.message);
      }
    }

    // ── PATH 4: Gemini Grounding (last resort) ──────────────────────────────
    if (!ai) {
      return NextResponse.json({
        error: 'No image search engine configured. Add BING_SEARCH_KEY (recommended) or SERPER_API_KEY to your Vercel environment variables.',
        images: []
      }, { status: 200 }); // Return 200 with empty so the UI shows "no results" vs crashing
    }

    const queryText = `Find 6 direct, high-quality product image URLs (ending in .jpg, .jpeg, .png, or .webp) for the exact garment: "${cleanSearchQuery}". Search only official brand sites, Nordstrom, SSENSE, Farfetch, Mr Porter, or similar premium fashion retailers. Return ONLY direct image file URLs — no redirect links, no HTML page links.`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: [{ text: queryText }],
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
    console.error('[image-search] Fatal error:', error);
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

    console.log(`[image-replace] Downloading for garment ${garmentId}: ${imageUrl}`);

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

    // Check if there are any existing images for this garment
    const { data: existingImages, error: fetchError } = await supabase
      .from('garment_images')
      .select('id')
      .eq('garment_id', garmentId);

    const isFirst = !existingImages || existingImages.length === 0;

    const ext = contentType.split('/').pop()?.split(';')[0] || 'jpg';
    const fileName = `raw/${garmentId}-added-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(fileName, buffer, { contentType, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from('wardrobe-images').getPublicUrl(fileName);

    // Insert as a new image. If it's the first image, mark it primary. Otherwise, false.
    const { data: newImage, error: insertError } = await supabase
      .from('garment_images')
      .insert({
        garment_id: garmentId,
        storage_path: publicUrl,
        is_primary_profile: isFirst,
        asset_type: isFirst ? 'profile' : 'detail'
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: `DB insert failed: ${insertError.message}` }, { status: 500 });
    }

    // Fetch the updated images list to return to the UI
    const { data: allImages } = await supabase
      .from('garment_images')
      .select('*')
      .eq('garment_id', garmentId);

    await supabase.from('garments').update({ status: 'Active', updated_at: new Date().toISOString() }).eq('id', garmentId);
    return NextResponse.json({ success: true, url: publicUrl, images: allImages || [] });
  } catch (error: any) {
    console.error('[image-replace] Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during replacement' }, { status: 500 });
  }
}
