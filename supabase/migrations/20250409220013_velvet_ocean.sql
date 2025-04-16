/*
  # Add user contact information to checkouts table

  1. Changes
    - Add user_name and user_email columns to checkouts table
    - Make user_id column nullable since we'll now support guest checkouts
    - Add validation to ensure we have either user_id or (user_name AND user_email)

  2. Security
    - Update RLS policies to allow public access for creating checkouts
    - Update existing policy for authenticated users to include email-based access
*/

-- Make user_id nullable since we'll support guest checkouts
ALTER TABLE checkouts ALTER COLUMN user_id DROP NOT NULL;

-- Add columns for guest user information
ALTER TABLE checkouts ADD COLUMN user_name text;
ALTER TABLE checkouts ADD COLUMN user_email text;

-- Add constraint to ensure we have either user_id or contact information
ALTER TABLE checkouts ADD CONSTRAINT checkouts_user_info_check 
  CHECK (
    (user_id IS NOT NULL) OR 
    (user_name IS NOT NULL AND user_email IS NOT NULL)
  );

-- Drop existing policy before recreating it
DROP POLICY IF EXISTS "Users can view their own checkouts" ON checkouts;

-- Create policy for public checkout creation
CREATE POLICY "Anyone can create checkouts"
  ON checkouts
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Recreate the viewing policy with updated conditions
CREATE POLICY "Users can view their own checkouts"
  ON checkouts
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    user_email = (SELECT email FROM users WHERE id = auth.uid())
  );