import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';
import { logTelemetry } from '@/lib/telemetry';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// POST: Search the web using Gemini grounding for clean manufacturer images
export async function POST(request: Request) {
  try {
    if (!ai) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const { brand, description } = await request.json();

    if (!brand && !description) {
      return NextResponse.json({ error: 'Please provide at least a brand or a description.' }, { status: 400 });
    }

    const cleanSearchQuery = `${brand || ''} ${description || ''}`.trim();
    const queryText = `Find direct, high-quality product images (JPG/PNG) for: "${cleanSearchQuery}". Search official manufacturer sites or major fashion retailers (Nordstrom, REI, SSENSE, Farfetch, Mr Porter, etc.). Return clean flat-lay or model product shots with direct image URLs.`;

    console.log(`Starting Google Search Grounding for clean query: ${cleanSearchQuery}`);
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
              description: 'Direct high-resolution image URLs of the matching garment from manufacturer or retailer pages.',
              items: {
                type: 'OBJECT',
                properties: {
                  url: { type: 'STRING', description: 'Direct image URL' },
                  source: { type: 'STRING', description: 'Source website name (e.g. Patagonia, SSENSE)' },
                  title: { type: 'STRING', description: 'Title or label of the image' }
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
    if (!text) {
      return NextResponse.json({ images: [] });
    }

    const parsed = JSON.parse(text);
    
    // Log Telemetry
    const promptTokens = response.usageMetadata?.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
    await logTelemetry('Gemini_Search_Image', promptTokens, candidatesTokens, { brand, query: queryText });

    return NextResponse.json({ images: parsed.images || [] });
  } catch (error: any) {
    console.error('Image search route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during search' }, { status: 500 });
  }
}

// PUT: Download the chosen manufacturer image and replace the garment's profile image
export async function PUT(request: Request) {
  try {
    const { garmentId, imageUrl } = await request.json();

    if (!garmentId || !imageUrl) {
      return NextResponse.json({ error: 'Missing garmentId or imageUrl.' }, { status: 400 });
    }

    console.log(`Downloading manufacturer image for replacement: ${imageUrl}`);
    
    // Fetch the image with custom User-Agent headers to avoid bot detection block
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.8'
      }
    });

    if (!imageResponse.ok) {
      return NextResponse.json({ error: `Failed to download image from source: Status ${imageResponse.status}` }, { status: 400 });
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const blob = await imageResponse.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());

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

    const fileExtension = contentType.split('/').pop() || 'jpg';
    const fileName = `raw/${garmentId}-replaced-${Date.now()}.${fileExtension}`;

    // 2. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('wardrobe-images')
      .getPublicUrl(fileName);

    // 3. Update the garment image table row
    const { error: updateError } = await supabase
      .from('garment_images')
      .update({ storage_path: publicUrl })
      .eq('id', primaryImage.id);

    if (updateError) {
      return NextResponse.json({ error: `Database update failed: ${updateError.message}` }, { status: 500 });
    }

    // 4. Update the garment status to processing so it can be cutout again if needed
    await supabase
      .from('garments')
      .update({ status: 'Active' })
      .eq('id', garmentId);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error('Image replacement PUT route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during replacement' }, { status: 500 });
  }
}
