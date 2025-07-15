-- Enable storage for image uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('promo-items', 'promo-items', true);

-- Allow public access to promo-items bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'promo-items');

-- Create policy for authenticated users to manage files
CREATE POLICY "Authenticated users can upload files"
ON storage.objects
FOR ALL 
TO authenticated
USING (bucket_id = 'promo-items')
WITH CHECK (bucket_id = 'promo-items');