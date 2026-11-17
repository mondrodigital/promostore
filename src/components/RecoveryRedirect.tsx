import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { subscribePasswordRecovery } from '../lib/supabase';

export default function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const sendToReset = () => {
      if (location.pathname !== '/reset-password') {
        navigate('/reset-password', { replace: true });
      }
    };

    if (window.location.hash.includes('type=recovery')) {
      sendToReset();
    }

    return subscribePasswordRecovery(sendToReset);
  }, [location.pathname, navigate]);

  return null;
}
