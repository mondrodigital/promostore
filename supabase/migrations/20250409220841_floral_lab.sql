/*
  # Add checkout pickup status tracking

  1. Changes
    - Add picked_up column to checkouts table to track item pickup status
    - Add policy for admins to update checkout status

  2. Security
    - Add policy allowing admins to update checkout status
*/

-- Add picked_up status column to checkouts table
ALTER TABLE checkouts ADD COLUMN picked_up boolean DEFAULT false;

-- Add policy for admins to update checkouts
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