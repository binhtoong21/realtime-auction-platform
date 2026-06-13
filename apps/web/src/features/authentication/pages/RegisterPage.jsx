import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useMutation } from '../../../core/hooks/useMutation';
import { axiosClient } from '../../../core/api/axiosClient';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const emailCheckResultRef = useRef(null);
  
  const { mutate, isLoading, error } = useMutation('/auth/register', 'post');
  const navigate = useNavigate();

  const handleEmailBlur = async () => {
    if (!email || !email.includes('@')) return;
    
    try {
      const response = await axiosClient.get(`/auth/check-email?email=${encodeURIComponent(email)}`);
      emailCheckResultRef.current = response.data?.data ?? null;
    } catch (err) {
      emailCheckResultRef.current = null; // network error → fallback to submit-time check
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg('');
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    
    let emailCheck = emailCheckResultRef.current;
    if (!emailCheck) {
      // user hasn't blurred or request hasn't returned → fetch now
      try {
        const response = await axiosClient.get(`/auth/check-email?email=${encodeURIComponent(email)}`);
        emailCheck = response.data?.data ?? null;
      } catch (err) {
        // network error → ignore and let BE return 409 if exists
      }
    }

    if (emailCheck && !emailCheck.available) {
      setFieldErrors({ email: emailCheck.message });
      return;
    }

    try {
      await mutate({ displayName: username, email, password });
      
      setSuccessMsg('Registration successful! Please check your email to verify your account.');
      // Optionally navigate to login after a delay
      setTimeout(() => {
        navigate('/auth/login');
      }, 3000);
    } catch (err) {
      // Error is handled by useMutation, accessible via `error` state
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
      <h1 style={{ marginBottom: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>Create an Account</h1>

      {error && !fieldErrors.email && !fieldErrors.confirmPassword && (
        <div style={{ backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', margin: 'var(--space-4) 0', fontSize: 'var(--text-sm)', border: '1px solid var(--color-danger)' }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', margin: 'var(--space-4) 0', fontSize: 'var(--text-sm)', border: '1px solid var(--color-success)' }}>
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Username</label>
          <input 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%' }}
            required
            minLength={3}
            maxLength={20}
            disabled={isLoading}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Email</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              emailCheckResultRef.current = null; // stale, needs re-fetch
              if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: null }));
            }}
            onBlur={handleEmailBlur}
            style={{ 
              width: '100%',
              borderColor: fieldErrors.email ? 'var(--color-danger)' : 'var(--color-border)'
            }}
            required
            disabled={isLoading}
          />
          {fieldErrors.email && (
            <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
              {fieldErrors.email}
            </div>
          )}
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
              minLength={8}
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
              style={{ 
                width: '100%', 
                paddingRight: 'var(--space-10)',
                borderColor: confirmPassword && password !== confirmPassword ? 'var(--color-danger)' : 'var(--color-border)'
              }}
              required
              minLength={8}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
              {fieldErrors.confirmPassword}
            </div>
          )}
        </div>
        <button 
          type="submit" 
          disabled={isLoading || successMsg}
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
          {isLoading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>

      <p style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        Already have an account? <Link to="/auth/login" style={{ color: 'var(--color-brand)' }}>Sign in</Link>
      </p>
    </div>
  );
}
