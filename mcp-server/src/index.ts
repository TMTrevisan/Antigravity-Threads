import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 10000;

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase credentials are not set in environment variables.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// Create MCP Server
const server = new Server(
  {
    name: 'wardrobe-stylist-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tools Schema List
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_wardrobe',
        description: 'List all items currently stored in the wardrobe archive database.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter items by category (e.g. Tops, Bottoms, Outerwear, Shoes, Accessories)',
            },
            status: {
              type: 'string',
              description: 'Filter items by status (e.g. Active, Donate, Sell). Defaults to "All".',
            },
          },
        },
      },
      {
        name: 'get_styling_recommendations',
        description: 'Generate customized outfit recommendations and lookbook gap analysis from the wardrobe database.',
        inputSchema: {
          type: 'object',
          properties: {
            weather: {
              type: 'string',
              description: 'Current weather context (e.g. "Chilly and raining", "75°F and Sunny").',
            },
            event: {
              type: 'string',
              description: 'The type of event or context (e.g. "casual coffee meeting", "formal dinner", "date night").',
            },
            lookbook: {
              type: 'string',
              description: 'Optional styling aesthetic goal or target lookbook reference (e.g. "minimalist warm tones", "structured silhouettes").',
            },
          },
          required: ['weather', 'event'],
        },
      },
      {
        name: 'add_wardrobe_item',
        description: 'Directly add a new item record to the wardrobe database.',
        inputSchema: {
          type: 'object',
          properties: {
            image_url: { type: 'string', description: 'Publicly accessible URL to the item photo' },
            category: { type: 'string', enum: ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories', 'Other'] },
            sub_category: { type: 'string', description: 'e.g. T-Shirt, Chinos, Chelsea Boots, Denim Jacket' },
            brand: { type: 'string', description: 'Brand name or designer' },
            color_family: { type: 'string', description: 'e.g. Olive, Beige, Black' },
            color_hex: { type: 'string', description: 'Nearest hexadecimal swatch code (e.g. #556b2f)' },
            tonal_value: { type: 'string', enum: ['Light', 'Medium', 'Dark', 'Vibrant'] },
            fabric_type: { type: 'string', description: 'e.g. Linen, Denim, Knitwear, Wool' },
            fit_block: { type: 'string', description: 'e.g. Slim, Regular, Relaxed, Tailored' },
            status: { type: 'string', enum: ['Active', 'Donate', 'Sell'] },
            notes: { type: 'string', description: 'Any fitting context or notes' },
          },
          required: ['image_url', 'category', 'sub_category', 'color_family'],
        },
      },
      {
        name: 'delete_wardrobe_item',
        description: 'Remove an item from the wardrobe archive database by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The UUID of the item to delete.' },
          },
          required: ['id'],
        },
      },
    ],
  };
});

// Register Tool Call Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_wardrobe': {
        const { category, status } = (args || {}) as { category?: string; status?: string };
        let query = supabase.from('wardrobe_items').select('*');

        if (category && category !== 'All') {
          query = query.eq('category', category);
        }
        if (status && status !== 'All') {
          query = query.eq('status', status);
        } else if (!status) {
          query = query.eq('status', 'Active'); // Default to showing active items only
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case 'get_styling_recommendations': {
        const { weather, event, lookbook } = args as { weather: string; event: string; lookbook?: string };

        // Fetch active items
        const { data: items, error } = await supabase
          .from('wardrobe_items')
          .select('*')
          .eq('status', 'Active');

        if (error) throw new Error(error.message);
        if (!items || items.length === 0) {
          return {
            content: [{ type: 'text', text: 'Closet is empty. No clothes found to style!' }],
          };
        }

        if (!ai) {
          throw new Error('GEMINI_API_KEY is not configured on the server.');
        }

        const promptText = `
          You are an expert personal fashion stylist. Generate outfit combinations and styling advice from these closet items:
          
          Context:
          - Weather: ${weather}
          - Event: ${event}
          - Target Lookbook: ${lookbook || 'balanced modern style'}
          
          Closet Database:
          ${JSON.stringify(items, null, 2)}
          
          Styling rules:
          1. Balance contrasts (light vs dark) or use sophisticated tonal harmonies.
          2. Fit coordination (e.g. relax top with straight bottoms).
          3. Match the weather and event formality.
          
          Provide 2 complete outfit options (using item IDs) and styling advice. Also list 2 gaps in their wardrobe to achieve the target lookbook. Return results in clean markdown.
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptText,
        });

        return {
          content: [
            {
              type: 'text',
              text: response.text || 'Failed to generate recommendations.',
            },
          ],
        };
      }

      case 'add_wardrobe_item': {
        const itemData = args as any;
        const { data, error } = await supabase
          .from('wardrobe_items')
          .insert([itemData])
          .select()
          .single();

        if (error) throw new Error(error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully added garment to archive! Item:\n${JSON.stringify(data, null, 2)}`,
            },
          ],
        };
      }

      case 'delete_wardrobe_item': {
        const { id } = args as { id: string };
        const { error } = await supabase.from('wardrobe_items').delete().eq('id', id);

        if (error) throw new Error(error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted garment ID: ${id}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing tool ${name}: ${err.message}`,
        },
      ],
    };
  }
});

// Express Server setup for SSE transport
const app = express();
app.use(cors());
app.use(express.json());

let transport: SSEServerTransport | null = null;

// Endpoint to start the SSE session
app.get('/sse', async (req, res) => {
  console.log('SSE connection requested');
  transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
});

// Endpoint for client messages
app.post('/message', async (req, res) => {
  if (!transport) {
    res.status(400).send('No active SSE connection');
    return;
  }
  console.log('Received message from client');
  await transport.handlePostMessage(req, res);
});

// Basic Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', mcp: 'wardrobe-stylist-mcp' });
});

app.listen(port, () => {
  console.log(`Wardrobe Stylist MCP Server running over SSE on port ${port}`);
  console.log(`SSE Route: http://localhost:${port}/sse`);
  console.log(`Message Route: http://localhost:${port}/message`);
});
