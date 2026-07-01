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

    const processingPromises = ids.map(async (id) => {
      try {
        // 1. Fetch garment record joined with all its related image assets
        const { data: garment, error: fetchError } = await supabase
          .from('garments')
          .select('*, garment_images(*)')
          .eq('id', id)
          .single();

        if (fetchError || !garment) {
          throw new Error(`Garment not found in DB: ${fetchError?.message || 'Empty row'}`);
        }

        const imagesList = garment.garment_images || [];
        if (imagesList.length === 0) {
          throw new Error(`No images registered for garment ID: ${id}`);
        }

        // 2. Fetch all image assets concurrently into base64 buffers
        const imageParts = await Promise.all(
          imagesList.map(async (img: any) => {
            // SSRF security check: Ensure image source host matches our public Supabase endpoint
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            if (supabaseUrl && !img.storage_path.startsWith(supabaseUrl)) {
              throw new Error('Security Violation: Invalid image storage domain.');
            }

            const imageResponse = await fetch(img.storage_path);
            if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image asset: ${img.storage_path}`);
            }
            const imageBlob = await imageResponse.blob();
            const arrayBuffer = await imageBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Data = buffer.toString('base64');
            const mimeType = imageBlob.type || 'image/jpeg';
            return {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            };
          })
        );

        // 3. Prompt Gemini Flash with JSON Schema constraints, instruction synthesis across photos
        const promptText = `
          You are an expert fashion stylist. You are given multiple images of the same garment.
          - Evaluate the wide-angle profile shot(s) to determine the category, color, silhouette, fabric texture, and fit.
          - Evaluate close-up details or clothing laundry tags to extract the exact brand name, sizing, and specific fabric content percentages.
          
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
          model: 'gemini-flash-latest',
          contents: [
            ...imageParts,
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

        // 4. Background Removal Cutout Integration (Remove.bg or local BackgroundRemover)
        const primaryImage = imagesList.find((img: any) => img.is_primary_profile) || imagesList[0];
        let processedImageUrl = primaryImage.storage_path;
        const removeBgApiKey = process.env.REMOVE_BG_API_KEY || '';
        const localRemoverUrl = process.env.BACKGROUND_REMOVER_URL || 'http://localhost:5000';
        
        if (removeBgApiKey) {
          try {
            const removeBgFormData = new FormData();
            removeBgFormData.append('image_url', primaryImage.storage_path);
            removeBgFormData.append('size', 'auto');

            const removeBgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
              method: 'POST',
              headers: {
                'X-Api-Key': removeBgApiKey,
              },
              body: removeBgFormData,
            });

            if (removeBgRes.ok) {
              const cutoutBlob = await removeBgRes.blob();
              const cutoutBuffer = Buffer.from(await cutoutBlob.arrayBuffer());

              const cutoutFileName = `processed/${id}-${Date.now()}.png`;
              const { data: cutoutUpload, error: cutoutError } = await supabase.storage
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

                // Update primary image path to display background cutout
                await supabase
                  .from('garment_images')
                  .update({ storage_path: processedImageUrl })
                  .eq('id', primaryImage.id);
              }
            }
          } catch (bgErr) {
            console.error('Remove.bg background removal failed, falling back:', bgErr);
          }
        } else if (localRemoverUrl) {
          let localSuccess = false;
          try {
            // Fetch original image from storage
            const imageResponse = await fetch(primaryImage.storage_path);
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();

              const localFormData = new FormData();
              localFormData.append('file', imageBlob, 'image.jpg');

              const localRes = await fetch(localRemoverUrl, {
                method: 'POST',
                body: localFormData,
              });

              if (localRes.ok) {
                const cutoutBlob = await localRes.blob();
                const cutoutBuffer = Buffer.from(await cutoutBlob.arrayBuffer());

                const cutoutFileName = `processed/${id}-${Date.now()}.png`;
                const { data: cutoutUpload, error: cutoutError } = await supabase.storage
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

                  // Update primary image path to display background cutout
                  await supabase
                    .from('garment_images')
                    .update({ storage_path: processedImageUrl })
                    .eq('id', primaryImage.id);
                  localSuccess = true;
                }
              } else {
                console.warn(`Local backgroundremover responded with status: ${localRes.status}`);
              }
            }
          } catch (localBgErr) {
            console.warn('Local background removal failed, falling back to Hugging Face cloud Space:', localBgErr);
          }

          // Cloud fallback: Try Hugging Face serverless Inference API if HF_TOKEN is defined, otherwise fallback to local python!
          if (!localSuccess) {
            let cloudSuccess = false;
            const hfToken = process.env.HF_TOKEN || '';

            if (hfToken) {
              try {
                console.log('Attempting Hugging Face Serverless Inference API for background removal...');
                const imageResponse = await fetch(primaryImage.storage_path);
                if (imageResponse.ok) {
                  const imageBlob = await imageResponse.blob();
                  const buffer = Buffer.from(await imageBlob.arrayBuffer());

                  const hfRes = await fetch('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${hfToken}`,
                      'Content-Type': 'application/octet-stream',
                    },
                    body: buffer,
                  });

                  if (hfRes.ok) {
                    const cutoutBuffer = Buffer.from(await hfRes.arrayBuffer());
                    const cutoutFileName = `processed/${id}-${Date.now()}.png`;

                    const { data: cutoutUpload, error: cutoutError } = await supabase.storage
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

                      // Update primary image path to display background cutout
                      await supabase
                        .from('garment_images')
                        .update({ storage_path: processedImageUrl })
                        .eq('id', primaryImage.id);
                      
                      cloudSuccess = true;
                      console.log('Hugging Face Serverless Inference background cutout successful.');
                    }
                  } else {
                    console.warn(`HF Inference API responded with status: ${hfRes.status} - ${await hfRes.text()}`);
                  }
                }
              } catch (hfErr) {
                console.error('Hugging Face Serverless Inference failed:', hfErr);
              }
            }

            if (!cloudSuccess) {
              try {
                console.log('Running local Python background removal fallback...');
                const imageResponse = await fetch(primaryImage.storage_path);
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

                  const tempIn = path.join(tempDir, `in-${id}.jpg`);
                  const tempOut = path.join(tempDir, `out-${id}.png`);

                  fs.writeFileSync(tempIn, buffer);

                  // Run python3 scripts/remove_bg.py
                  const pyScript = path.join(process.cwd(), 'scripts', 'remove_bg.py');
                  const cmd = `python3 "${pyScript}" "${tempIn}" "${tempOut}"`;
                  execSync(cmd);

                  if (fs.existsSync(tempOut)) {
                    const cutoutBuffer = fs.readFileSync(tempOut);
                    const cutoutFileName = `processed/${id}-${Date.now()}.png`;
                    
                    const { data: cutoutUpload, error: cutoutError } = await supabase.storage
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

                      // Update primary image path to display background cutout
                      await supabase
                        .from('garment_images')
                        .update({ storage_path: processedImageUrl })
                        .eq('id', primaryImage.id);
                    }
                  }

                  // Cleanup
                  if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                  if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                }
              } catch (pyErr) {
                console.error('Local Python background removal failed:', pyErr);
              }
            }
          }
        }

        // 5. Update the core DB record to Active
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
            ai_extracted_json: parsed,
          })
          .eq('id', id);

        if (updateError) {
          throw new Error(`Failed to update garment database row: ${updateError.message}`);
        }

        // 6. Log Telemetry
        const promptTokens = response.usageMetadata?.promptTokenCount || 0;
        const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
        await logTelemetry('Gemini_Vision_Ingest', promptTokens, candidatesTokens, { garmentId: id, imagesCount: imagesList.length });

        const bgSuccess = (processedImageUrl !== primaryImage.storage_path);
        return { 
          id, 
          success: true, 
          backgroundRemovalSuccess: bgSuccess,
          error: bgSuccess ? undefined : 'Background removal failed: both Hugging Face cloud API and local engines failed. Check API token or network.'
        };
      } catch (err: any) {
        console.error(`Error processing batch item ${id}:`, err);

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
