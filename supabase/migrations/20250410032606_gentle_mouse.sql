/*
  # Update RLS policies for checkouts

  1. Changes
    - Drop existing policies
    - Add new policy to allow public access to view checkouts
    - Keep admin management policies

  2. Security
    - Enable public read access to checkouts
    - Maintain admin-only write access for status updates
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can create checkouts" ON checkouts;
DROP POLICY IF EXISTS "Users can view their own checkouts" ON checkouts;
DROP POLICY IF EXISTS "Admins can view all checkouts" ON checkouts;
DROP POLICY IF EXISTS "Admins can update checkouts" ON checkouts;
DROP POLICY IF EXISTS "Users can update their own checkouts" ON checkouts;

-- Create new policies
CREATE POLICY "Public can view checkouts"
ON checkouts
FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can create checkouts"
ON checkouts
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Admins can update checkouts"
ON checkouts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
);