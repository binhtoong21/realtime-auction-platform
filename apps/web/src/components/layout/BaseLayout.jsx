import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

export function BaseLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, padding: 'var(--space-8)', maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
