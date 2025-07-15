-- Add category field to promo_items table
ALTER TABLE promo_items ADD COLUMN category TEXT DEFAULT 'Misc';

-- Create check constraint for valid categories
ALTER TABLE promo_items ADD CONSTRAINT valid_category 
CHECK (category IN ('Tents', 'Tables', 'Linens', 'Displays', 'Decor', 'Games', 'Misc'));

-- Update existing items with reasonable default categories based on their names
UPDATE promo_items SET category = 'Tents' WHERE name ILIKE '%tent%';
UPDATE promo_items SET category = 'Tables' WHERE name ILIKE '%table%' AND name NOT ILIKE '%cloth%' AND name NOT ILIKE '%cover%' AND name NOT ILIKE '%runner%';
UPDATE promo_items SET category = 'Linens' WHERE name ILIKE '%cloth%' OR name ILIKE '%cover%' OR name ILIKE '%runner%';
UPDATE promo_items SET category = 'Displays' WHERE name ILIKE '%banner%' OR name ILIKE '%stand%' OR name ILIKE '%display%' OR name ILIKE '%counter%';
UPDATE promo_items SET category = 'Decor' WHERE name ILIKE '%chair%'; 