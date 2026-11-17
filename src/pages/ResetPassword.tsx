import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { consumePasswordRecovery, supabase } from '../lib/supabase';
import { isAppAdmin } from '../lib/admin';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setHasSession(Boolean(session));
      setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      consumePasswordRecovery();
      if (isAppAdmin(data.user)) {
        navigate('/admin', { replace: true });
        return;
      }
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Password update failed:', err);
      setError('Could not update the password. Request a new reset link and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0075AE]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-[#0075AE]/10">
            <KeyRound className="h-6 w-6 text-[#0075AE]" />
          </div>
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Set a new password</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Choose a new admin password for the Vellum Event Items Store.
          </p>
        </div>

        {!hasSession ? (
          <div className="bg-white shadow rounded-lg p-6 text-sm text-gray-700 space-y-4">
            <p>Open the password reset link from your email, then set a new password on this page.</p>
            <Link to="/login" className="inline-block text-[#0075AE] font-medium hover:underline">
              Back to admin sign in
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">{error}</div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                  New password
                </label>
                <input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#0075AE] focus:border-[#0075AE] sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#0075AE] focus:border-[#0075AE] sm:text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#0075AE] hover:bg-[#005f8c] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0075AE] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
