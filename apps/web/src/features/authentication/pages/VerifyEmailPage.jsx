import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '../../../core/hooks/useMutation';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const { mutate, isLoading, error } = useMutation('/auth/verify-email', 'get');
  const calledRef = useRef(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (token && !calledRef.current) {
      calledRef.current = true;
      mutate(null, { url: `/auth/verify-email?token=${encodeURIComponent(token)}` })
        .then(response => {
          if (response?.data?.success) {
            setSuccessMsg(response.data.message || 'Email verified successfully!');
          }
        })
        .catch(() => {});
    }
  }, [token, mutate]);

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Email Verification</h2>

      {!token && (
        <div style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
          Invalid or missing verification token.
        </div>
      )}

      {isLoading && (
        <div style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          Verifying your email... Please wait.
        </div>
      )}

      {error && (
        <div style={{ backgroundColor: '#FEF2F2', color: 'var(--color-danger)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ backgroundColor: '#F0FDF4', color: 'var(--color-success)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          {successMsg}
        </div>
      )}

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Link to="/auth/login" style={{ 
          display: 'inline-block',
          backgroundColor: 'var(--color-action)',
          color: 'var(--color-action-text)',
          padding: 'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
          fontWeight: 500
        }}>
          Go to Login
        </Link>
      </div>
    </div>
  );
}
