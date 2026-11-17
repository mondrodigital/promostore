import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

type RecoveryListener = () => void;

const recoveryListeners = new Set<RecoveryListener>();
let passwordRecoveryPending = false;

export function subscribePasswordRecovery(listener: RecoveryListener): () => void {
  recoveryListeners.add(listener);
  if (passwordRecoveryPending) listener();
  return () => {
    recoveryListeners.delete(listener);
  };
}

export function consumePasswordRecovery(): void {
  passwordRecoveryPending = false;
}

supabase.auth.onAuthStateChange((event) => {
  if (event !== 'PASSWORD_RECOVERY') return;
  passwordRecoveryPending = true;
  recoveryListeners.forEach((listener) => listener());
});