-- Drop existing policies and bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete images" ON storage.objects;

-- Recreate storage bucket with proper configuration
DELETE FROM storage.buckets WHERE id = 'promo-items';
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'promo-items',
  'promo-items',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
);

-- Create policy for public access to view files
CREATE POLICY "Public Access"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'promo-items');

-- Create policy for public to upload files
CREATE POLICY "Anyone can upload images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'promo-items' 
  AND LENGTH(name) > 1
);

-- Create policy for public to update files
CREATE POLICY "Anyone can update images"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'promo-items')
WITH CHECK (bucket_id = 'promo-items');

-- Create policy for public to delete files
CREATE POLICY "Anyone can delete images"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'promo-items');

-- Grant necessary permissions
GRANT ALL ON SCHEMA storage TO public;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO public;