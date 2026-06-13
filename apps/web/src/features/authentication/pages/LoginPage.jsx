import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useMutation } from '../../../core/hooks/useMutation';
import { useAuthDispatch } from '../../../core/context/AuthContext';
import { setAccessToken } from '../../../core/api/tokenManager';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { mutate, isLoading, error } = useMutation('/auth/login', 'post');
  const { login } = useAuthDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await mutate({ email, password });
      
      if (!response?.data?.accessToken || !response?.data?.user) {
        console.error('Invalid response from server: Missing authentication data');
        throw new Error('Unexpected server response. Please try again.');
      }

      // Store token in module-level variable
      setAccessToken(response.data.accessToken);
      
      // Store user in context
      login(response.data.user);
      
      const returnUrl = location.state?.from || '/';
      navigate(returnUrl);
    } catch (err) {
      // Error is handled by useMutation, accessible via `error` state
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
      <h1 style={{ marginBottom: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>Sign In</h1>
      
      {error && (
        <div style={{ backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', border: '1px solid var(--color-danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Email</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }}
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', paddingRight: 'var(--space-10)' }}
              required
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 'var(--space-3)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                padding: 0
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div style={{ marginTop: 'var(--space-2)', textAlign: 'right' }}>
            <Link to="/auth/forgot-password" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-brand)' }}>Forgot password?</Link>
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
            marginTop: 'var(--space-2)'
          }}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        Don't have an account? <Link to="/auth/register" style={{ color: 'var(--color-brand)' }}>Register</Link>
      </p>
    </div>
  );
}
