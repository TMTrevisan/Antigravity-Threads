import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { logTelemetry } from '@/lib/telemetry';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export async function POST(request: Request) {
  try {
    if (!ai) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    const { weather, event, lookbook, items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No wardrobe items provided for styling analysis.' },
        { status: 400 }
      );
    }

    // Filter only Active items
    const activeItems = items.filter((item: any) => item.status === 'Active');

    if (activeItems.length === 0) {
      return NextResponse.json(
        { error: 'No active wardrobe items found. Complete the ingestion process first.' },
        { status: 400 }
      );
    }

    // Minified Data Serialization Protocol (CSV-like plain text string)
    // Format: id|category|sub_category|color_family|tonal_value|fabric_type|fit_block
    const serializedGarments = activeItems
      .map((item: any) => {
        const id = item.id || '';
        const cat = item.category || '';
        const sub = item.sub_category || '';
        const col = item.color_family || '';
        const tone = item.tonal_value || '';
        const fab = item.fabric_type || '';
        const fit = item.fit_block || '';
        return `${id}|${cat}|${sub}|${col}|${tone}|${fab}|${fit}`;
      })
      .join('\n');

    const promptText = `
      You are an expert personal fashion stylist. Recommend outfit options for your client.
      
      Client Details:
      - Current Weather: ${weather || 'Any weather'}
      - Event / Vibe: ${event || 'Casual'}
      - Target Lookbook / Aesthetic: ${lookbook || 'Clean, balanced, modern style'}
      
      Wardrobe Items Available (Serialized Format: id|category|sub_category|color|tonality|fabric|fit):
      ${serializedGarments}
      
      Styling Rules:
      1. Contrast & Tonality: Ensure outfits use balanced contrast (e.g. light top with dark bottoms) or varying tonal shades of the same colors.
      2. Silhouette & Fit: Balance shapes (e.g. relaxed top with tapered bottom, or structured layers).
      3. Weather & Event: Align fits and fabrics (e.g. linen for heat, wool/layering for cold) with event formality.
      4. Complete Outfits: Combine a top and a bottom, plus outerwear/footwear if available. Refer to the items ONLY by their exact UUID from the list.
      
      Suggest 2 to 3 distinct outfits. For each outfit, list the UUIDs of the items used.
      Also list 2 specific wardrobe gaps (staples or colors missing) to achieve their lookbook style.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            outfits: {
              type: 'array',
              description: 'Recommended outfits',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  item_ids: { 
                    type: 'array', 
                    description: 'UUIDs of the items matching the serialized garment ids',
                    items: { type: 'string' } 
                  },
                  styling_reasoning: { type: 'string', description: 'Why this outfit is perfect for this context.' }
                },
                required: ['name', 'item_ids', 'styling_reasoning']
              }
            },
            gap_analysis: {
              type: 'string',
              description: 'What key pieces or colors the closet is missing to achieve this lookbook style.'
            },
            general_tips: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['outfits', 'gap_analysis', 'general_tips']
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Empty response received from stylist engine.');
    }

    const recommendations = JSON.parse(responseText);

    // Log Telemetry
    const promptTokens = response.usageMetadata?.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
    await logTelemetry('Gemini_Stylist_Engine', promptTokens, candidatesTokens, { itemsCount: activeItems.length });

    return NextResponse.json({ success: true, recommendations });
  } catch (error: any) {
    console.error('Stylist endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during styling analysis.' },
      { status: 500 }
    );
  }
}
