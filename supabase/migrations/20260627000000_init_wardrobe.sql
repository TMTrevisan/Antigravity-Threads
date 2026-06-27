-- 1. Create the wardrobe_items table
CREATE TABLE IF NOT EXISTS public.wardrobe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    category TEXT NOT NULL,
    sub_category TEXT NOT NULL,
    brand TEXT,
    color_family TEXT NOT NULL,
    color_hex TEXT,
    tonal_value TEXT,
    fabric_type TEXT,
    fit_block TEXT,
    status TEXT DEFAULT 'Active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;

-- 3. Create simple open access policies (for development/personal use)
CREATE POLICY "Allow public read access" 
ON public.wardrobe_items 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.wardrobe_items 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access" 
ON public.wardrobe_items 
FOR UPDATE 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access" 
ON public.wardrobe_items 
FOR DELETE 
USING (true);
