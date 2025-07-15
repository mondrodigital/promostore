-- Add category field to promo_items table
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Misc';

-- Create check constraint for valid categories
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'valid_category'
    ) THEN
        ALTER TABLE promo_items ADD CONSTRAINT valid_category 
        CHECK (category IN ('Tents', 'Tables', 'Linens', 'Displays', 'Decor', 'Games', 'Misc'));
    END IF;
END $$;

-- Update existing items with reasonable default categories based on their names
UPDATE promo_items SET category = 'Tents' WHERE name ILIKE '%tent%' AND category = 'Misc';
UPDATE promo_items SET category = 'Tables' WHERE name ILIKE '%table%' AND name NOT ILIKE '%cloth%' AND name NOT ILIKE '%cover%' AND name NOT ILIKE '%runner%' AND category = 'Misc';
UPDATE promo_items SET category = 'Linens' WHERE (name ILIKE '%cloth%' OR name ILIKE '%cover%' OR name ILIKE '%runner%') AND category = 'Misc';
UPDATE promo_items SET category = 'Displays' WHERE (name ILIKE '%banner%' OR name ILIKE '%stand%' OR name ILIKE '%display%' OR name ILIKE '%counter%' OR name ILIKE '%literature%') AND category = 'Misc';
UPDATE promo_items SET category = 'Decor' WHERE name ILIKE '%chair%' AND category = 'Misc'; 