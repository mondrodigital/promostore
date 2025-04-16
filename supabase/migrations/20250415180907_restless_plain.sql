-- Drop existing bucket if it exists
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;

-- Recreate storage bucket
DELETE FROM storage.buckets WHERE id = 'promo-items';
INSERT INTO storage.buckets (id, name, public) 
VALUES ('promo-items', 'promo-items', true);

-- Allow public access to view files
CREATE POLICY "Public Access"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'promo-items');

-- Allow authenticated users to manage files
CREATE POLICY "Authenticated users can upload files"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'promo-items');

CREATE POLICY "Authenticated users can update files"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'promo-items')
WITH CHECK (bucket_id = 'promo-items');

CREATE POLICY "Authenticated users can delete files"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'promo-items');

-- Grant necessary permissions
GRANT ALL ON SCHEMA storage TO anon;
GRANT ALL ON SCHEMA storage TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;