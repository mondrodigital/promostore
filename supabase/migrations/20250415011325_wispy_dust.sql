/*
  # Update RLS policies for public access
  
  1. Changes
    - Disable RLS on promo_items table to allow all operations
    - Remove existing policies that were requiring authentication
*/

-- Disable RLS on promo_items table
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;