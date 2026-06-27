import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

// Initialize the Google Gen AI client
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

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const notes = formData.get('notes') as string | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    // 1. Convert file to buffer for Supabase upload and base64 for Gemini
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // 2. Upload to Supabase Storage
    const fileExtension = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
    const filePath = `wardrobe/${fileName}`;

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

    // 3. Prepare Image for Gemini
    const base64Data = buffer.toString('base64');
    
    const promptText = `
      You are an expert fashion stylist and wardrobe archivist. Analyze the attached clothing item photo.
      
      Look closely at:
      - The type of clothing item (e.g. T-Shirt, Dress Shirt, Chinos, Jeans, Sneakers, Blazer).
      - The color and the specific hex code representing its dominant shade (for rendering in UI swatches).
      - The fabric (e.g., Linen, Cotton, Denim, Wool, Leather, Silk, Synthetic).
      - The fit block (e.g., Slim, Regular, Relaxed, Oversized, Tailored).
      - The tonal value (Light, Medium, Dark, Vibrant).
      - Brand markings or labels if visible (otherwise guess or return "Unknown").
      
      Additional context provided by the owner:
      "${notes || 'None'}"
      
      Use this additional context to refine your classification, fit analysis, or status recommendations (e.g., if they mention keeping, donating, or how it fits).
    `;

    // 4. Query Gemini with Structured JSON Output
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: imageFile.type,
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
              enum: ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories', 'Other'] 
            },
            sub_category: { type: 'string', description: 'e.g. T-Shirt, Button-Down Shirt, Jeans, Chinos, Boots, Jacket' },
            brand: { type: 'string', description: 'Brand name, or "Unknown"' },
            color_family: { type: 'string', description: 'Color name, e.g. Olive Green, Navy Blue, Crimson, Cream' },
            color_hex: { type: 'string', description: 'Nearest 6-character hex code, e.g. #556b2f' },
            tonal_value: { type: 'string', enum: ['Light', 'Medium', 'Dark', 'Vibrant'] },
            fabric_type: { type: 'string', description: 'e.g. Linen, Denim, Cotton, Leather, Knitwear' },
            fit_block: { type: 'string', description: 'e.g. Slim, Regular, Relaxed, Tailored, Oversized' },
            status: { type: 'string', enum: ['Active', 'Donate', 'Sell'] },
          },
          required: ['category', 'sub_category', 'brand', 'color_family', 'color_hex', 'tonal_value', 'fabric_type', 'fit_block', 'status'],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Empty response received from Gemini API.');
    }

    const parsedData = JSON.parse(responseText);

    // 5. Save to Supabase Database
    const { data: dbItem, error: dbError } = await supabase
      .from('wardrobe_items')
      .insert([
        {
          image_url: publicUrl,
          category: parsedData.category,
          sub_category: parsedData.sub_category,
          brand: parsedData.brand === 'Unknown' ? null : parsedData.brand,
          color_family: parsedData.color_family,
          color_hex: parsedData.color_hex,
          tonal_value: parsedData.tonal_value,
          fabric_type: parsedData.fabric_type,
          fit_block: parsedData.fit_block,
          status: parsedData.status,
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
      { error: error.message || 'An error occurred during image ingestion.' },
      { status: 500 }
    );
  }
}
