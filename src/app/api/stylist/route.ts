import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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

    // Filter only Active items for styling
    const activeItems = items.filter((item: any) => item.status === 'Active' || !item.status);

    const promptText = `
      You are an expert personal fashion stylist. Your client has provided their active wardrobe items and wants outfit recommendations based on the current weather, the type of event, and their desired lookbook/aesthetic goal.
      
      Client Input:
      - Weather: ${weather || 'Any weather'}
      - Event/Vibe: ${event || 'Casual'}
      - Target Lookbook/Aesthetic Style: ${lookbook || 'Clean, balanced, modern style'}
      
      Wardrobe Items Available (represented as JSON):
      ${JSON.stringify(
        activeItems.map((item: any) => ({
          id: item.id,
          category: item.category,
          sub_category: item.sub_category,
          brand: item.brand,
          color_family: item.color_family,
          color_hex: item.color_hex,
          tonal_value: item.tonal_value,
          fabric_type: item.fabric_type,
          fit_block: item.fit_block,
          notes: item.notes,
        })),
        null,
        2
      )}
      
      Styling Rules to Follow:
      1. Contrast & Tonality: Ensure outfits follow good styling principles. Recommend either balanced high-contrast outfits (e.g., light top with dark bottoms) or well-executed tonal/monochromatic outfits (e.g., varying shades of olive and beige).
      2. Silhouette & Fit: Balance fits (e.g., pair a relaxed-fit top with tapered/straight bottoms, or coordinate tailored layers).
      3. Practicality: Outfits must match the weather (layering for cold/rain, breathable fabrics like linen/cotton for heat) and be appropriate for the event type (e.g., smart/structured for business casual, comfortable/relaxed for casual).
      4. Complete Outfits: Each outfit should generally consist of a Top and a Bottom, and optionally Outerwear and Shoes if available in the database.
      
      Suggest 2 to 3 distinct outfits that can be made from these items.
      Also, analyze their wardrobe against their target Lookbook/Aesthetic goals and identify 2-3 specific "Gaps" (clothing items, colors, or fabrics they are missing that would unlock more looks).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            outfits: {
              type: 'array',
              description: 'List of recommended outfits',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Catchy name for the outfit, e.g. "Smart Casual Navy & Linen"' },
                  item_ids: { 
                    type: 'array', 
                    description: 'Array of the UUIDs of the items recommended in this outfit',
                    items: { type: 'string' } 
                  },
                  styling_reasoning: { 
                    type: 'string', 
                    description: 'Detailed explanation of why this outfit works, referencing the weather, event context, contrast, fits, and color palette.' 
                  }
                },
                required: ['name', 'item_ids', 'styling_reasoning']
              }
            },
            gap_analysis: {
              type: 'string',
              description: 'Analysis of what key items, colors, or fabrics are missing to fully achieve the lookbook aesthetic.'
            },
            general_tips: {
              type: 'array',
              description: 'General daily style or layering tips based on weather',
              items: { type: 'string' }
            }
          },
          required: ['outfits', 'gap_analysis', 'general_tips']
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Empty response received from Gemini API.');
    }

    const recommendations = JSON.parse(responseText);
    return NextResponse.json({ success: true, recommendations });
  } catch (error: any) {
    console.error('Stylist endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during styling analysis.' },
      { status: 500 }
    );
  }
}
