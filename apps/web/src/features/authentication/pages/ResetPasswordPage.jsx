import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useMutation } from '../../../core/hooks/useMutation';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState(false);

  const { mutate, isLoading, error } = useMutation('/auth/reset-password', 'post');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    try {
      await mutate({ token, newPassword: password });
      setSuccess(true);
      // Optional: automatically navigate to login after a few seconds
      setTimeout(() => {
        navigate('/auth/login');
      }, 3000);
    } catch (err) {
      // Error is handled by useMutation, accessible via `error` state
      console.error('Reset password error:', err);
    }
  };

  if (!token) {
    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
        <h1 style={{ marginBottom: 'var(--space-4)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>Invalid Request</h1>
        <div style={{ backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)', border: '1px solid var(--color-danger)' }}>
          Missing reset token. Please use the link provided in your email.
        </div>
        <Link to="/auth/forgot-password" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-brand)' }}>Request a new reset link</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
      <h1 style={{ marginBottom: 'var(--space-4)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>Create New Password</h1>
      
      {success ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)', border: '1px solid var(--color-success)' }}>
            Your password has been successfully reset. All active sessions have been logged out.
          </div>
          <p style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Redirecting to login...
          </p>
          <Link to="/auth/login" className="btn-primary" style={{ textDecoration: 'none' }}>Go to Login</Link>
        </div>
      ) : (
        <>
          <p style={{ marginBottom: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Please enter your new password below.
          </p>

          {(error || validationError) && (
            <div style={{ backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', border: '1px solid var(--color-danger)' }}>
              {validationError || error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: 'var(--space-2)', paddingRight: 'var(--space-10)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', padding: 0 }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Must be at least 8 characters, including a capital letter and a number.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: 'var(--space-2)', paddingRight: 'var(--space-10)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{ position: 'absolute', right: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', padding: 0 }}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              style={{
                backgroundColor: 'var(--color-action)',
                color: 'var(--color-action-text)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontWeight: 500,
                marginTop: 'var(--space-2)',
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
            <Link to="/auth/login" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-brand)' }}>Back to Login</Link>
          </div>
        </>
      )}
    </div>
  );
}
