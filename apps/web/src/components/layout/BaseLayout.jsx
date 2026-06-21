import { Outlet } from 'react-router-dom';
import { Header } from './Header';

/** Root layout composing Header and page content (Outlet) without Footer. */
export function BaseLayout() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header />
      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
