import { NextResponse } from 'next/server';
import { ok } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'No prompt provided.' }, { status: 400 });
    }

    const hfToken = process.env.HF_TOKEN || '';
    if (!hfToken) {
      return NextResponse.json({ error: 'HF_TOKEN is not configured on the server. Please add it to your environment variables.' }, { status: 500 });
    }

    console.log(`Starting AI outfit generation with prompt: "${prompt}"`);

    // Call Hugging Face Serverless Text-to-Image API (FLUX.1-schnell)
    const hfResponse = await fetch(
      'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
        }),
      }
    );

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      console.error(`Hugging Face T2I failed with status ${hfResponse.status}:`, errText);
      return NextResponse.json({ error: `Image generation failed: ${errText || hfResponse.statusText}` }, { status: 500 });
    }

    const arrayBuffer = await hfResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;

    return ok({ url: dataUrl });
  } catch (error: any) {
    console.error('Generative outfit API error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during image generation' }, { status: 500 });
  }
}
