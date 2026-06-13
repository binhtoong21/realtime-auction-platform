import { useState } from 'react';
import { Link } from 'react-router-dom';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Placeholder for actual API call
    setSubmitted(true);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: 'var(--color-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
      <h1 style={{ marginBottom: 'var(--space-4)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>Reset Password</h1>
      
      {submitted ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)', border: '1px solid var(--color-success)' }}>
            If an account exists for that email, we have sent a password reset link.
          </div>
          <Link to="/auth/login" className="btn-primary" style={{ textDecoration: 'none' }}>Return to Login</Link>
        </div>
      ) : (
        <>
          <p style={{ marginBottom: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>
            
            <button 
              type="submit" 
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
              Send Reset Link
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
