import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';
import { logTelemetry } from '@/lib/telemetry';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export async function POST(request: Request) {
  try {
    if (!ai) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No garment IDs provided.' }, { status: 400 });
    }

    // Process each garment ID asynchronously (concurrently with a Promise pool or map)
    const processingPromises = ids.map(async (id) => {
      try {
        // 1. Fetch garment record from Supabase
        const { data: garment, error: fetchError } = await supabase
          .from('garments')
          .select('raw_image_url, notes')
          .eq('id', id)
          .single();

        if (fetchError || !garment) {
          throw new Error(`Garment not found in DB: ${fetchError?.message || 'Empty row'}`);
        }

        // 2. Fetch the image file into a buffer
        const imageResponse = await fetch(garment.raw_image_url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image file from URL: ${garment.raw_image_url}`);
        }
        const imageBlob = await imageResponse.blob();
        const arrayBuffer = await imageBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString('base64');
        const mimeType = imageBlob.type || 'image/jpeg';

        // 3. Prompt Gemini Flash with JSON Schema constraints
        const promptText = `
          You are an expert fashion stylist. Analyze the attached garment image.
          
          Classify the item under these rules:
          - Category: Must be exactly one of: 'Tops', 'Bottoms', 'Outerwear', 'Footwear', 'Tailoring'.
          - Sub-Category: e.g. T-Shirt, Chinos, Chelsea Boots, Bomber Jacket, Blazer.
          - Color Family: The dominant color name.
          - Hex Code: Nearest hex code swatch representing the color, e.g. #002060.
          - Tonal Value: Must be exactly one of: 'Light', 'Medium', 'Dark'.
          - Fabric Type: e.g. Cotton, Linen, Denim, Wool, Silk.
          - Fit Block: e.g. Slim, Regular, Relaxed, Tailored.
          - Brand: The visible brand (or "Unknown").
          
          Additional context note from user:
          "${garment.notes || 'None'}"
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            promptText,
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                category: { 
                  type: 'string', 
                  enum: ['Tops', 'Bottoms', 'Outerwear', 'Footwear', 'Tailoring'] 
                },
                sub_category: { type: 'string' },
                brand: { type: 'string' },
                color_family: { type: 'string' },
                hex_code: { type: 'string', description: 'Hex code swatch e.g. #556b2f' },
                tonal_value: { type: 'string', enum: ['Light', 'Medium', 'Dark'] },
                fabric_type: { type: 'string' },
                fit_block: { type: 'string' },
              },
              required: ['category', 'sub_category', 'color_family', 'hex_code', 'tonal_value', 'fabric_type', 'fit_block'],
            },
          },
        });

        const responseText = response.text;
        if (!responseText) {
          throw new Error('Empty parsing response received from Gemini API.');
        }

        const parsed = JSON.parse(responseText);

        // 4. Update the DB record to Active and store details
        const { error: updateError } = await supabase
          .from('garments')
          .update({
            category: parsed.category,
            sub_category: parsed.sub_category,
            brand: parsed.brand === 'Unknown' ? null : parsed.brand,
            color_family: parsed.color_family,
            hex_code: parsed.hex_code,
            tonal_value: parsed.tonal_value,
            fabric_type: parsed.fabric_type,
            fit_block: parsed.fit_block,
            status: 'Active',
            processed_image_url: garment.raw_image_url, // Placeholder for cutout cutout cut
            ai_extracted_json: parsed,
          })
          .eq('id', id);

        if (updateError) {
          throw new Error(`Failed to update garment database row: ${updateError.message}`);
        }

        // 5. Log Telemetry
        const promptTokens = response.usageMetadata?.promptTokenCount || 0;
        const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
        await logTelemetry('Gemini_Vision_Ingest', promptTokens, candidatesTokens, { garmentId: id });

        return { id, success: true };
      } catch (err: any) {
        console.error(`Error processing batch item ${id}:`, err);

        // Flag item status as Processing_Failed so it shows up in client
        await supabase
          .from('garments')
          .update({ status: 'Processing_Failed', notes: err.message || 'Processing failed.' })
          .eq('id', id);

        return { id, success: false, error: err.message };
      }
    });

    const results = await Promise.all(processingPromises);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Batch process controller error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
