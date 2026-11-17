import type { User } from '@supabase/supabase-js';

/** Server-controlled flag. Do not read user_metadata.is_admin. */
export function isAppAdmin(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  return user?.app_metadata?.is_admin === true;
}
