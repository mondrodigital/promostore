/*
  # Fix checkout policies

  1. Changes
    - Drop existing policies to start fresh
    - Add new policies for:
      - Public users to create checkouts
      - Authenticated users to view their own checkouts
      - Admins to view all checkouts
      - Admins to update checkouts
    - Add policy for users to update their own checkouts

  2. Security
    - Maintains RLS
    - Ensures proper access control
    - Allows guest checkouts while maintaining security
*/

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Anyone can create checkouts" ON checkouts;
DROP POLICY IF EXISTS "Users can create checkouts" ON checkouts;
DROP POLICY IF EXISTS "Users can view their own checkouts" ON checkouts;
DROP POLICY IF EXISTS "Admins can update checkouts" ON checkouts;
DROP POLICY IF EXISTS "Users can update their own checkouts" ON checkouts;

-- Create policy for public checkout creation
CREATE POLICY "Anyone can create checkouts"
  ON checkouts
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policy for authenticated users to view their own checkouts
CREATE POLICY "Users can view their own checkouts"
  ON checkouts
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    user_email = (SELECT email FROM users WHERE id = auth.uid())
  );

-- Create policy for admins to view all checkouts
CREATE POLICY "Admins can view all checkouts"
  ON checkouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Create policy for admins to update any checkout
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Create policy for users to update their own checkouts
CREATE POLICY "Users can update their own checkouts"
  ON checkouts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());