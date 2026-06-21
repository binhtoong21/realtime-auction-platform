import { test, expect } from '@playwright/test';

test.describe('Global Layout & App Shell (R1)', () => {
  let sellerToken, bidder1Token;

  test.beforeAll(async ({ request }) => {
    // Reset database and seed default users
    const res = await request.post('/api/test/seed');
    const body = await res.json();
    sellerToken = body.data.users.seller.token;
    bidder1Token = body.data.users.bidder1.token;
  });

  test.beforeEach(async ({ context }) => {
    // Clear cookies/localStorage to start fresh
  });

  // ==========================================
  // TIER 1: Feature Coverage (Layout)
  // ==========================================

  test('TC-L1-01: Sticky Header Geometry', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('#site-header');
    await expect(header).toBeVisible();

    // Verify height is 48px
    const boundingBox = await header.boundingBox();
    expect(boundingBox.height).toBe(48);

    // Verify computed style is position: sticky and top: 0px
    const computedStyles = await header.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { position: style.position, top: style.top };
    });
    expect(computedStyles.position).toBe('sticky');
    expect(computedStyles.top).toBe('0px');
  });

  test('TC-L1-02: Header Navigation & Router Integration', async ({ page }) => {
    // Log in bidder1 by setting token in localStorage
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('accessToken', token);
    }, bidder1Token);
    
    await page.goto('/');
    const navLinks = page.locator('.header__nav-link');
    await expect(navLinks.first()).toBeVisible();

    // Navigate to /auth/login or /
    const marketLink = page.locator('.header__nav-link', { hasText: 'Market' });
    await marketLink.click();
    await expect(page).toHaveURL(/(\/|\/auctions)$/);
  });

  test('TC-L1-03: Real-Time Connection Indicator State', async ({ page }) => {
    await page.goto('/');
    const connDot = page.locator('.header__connection-dot');
    await expect(connDot).toBeVisible();
    
    // Expect raw CSS dot (no emojis in text content)
    const textContent = await connDot.textContent();
    expect(textContent.trim()).toBe('');
  });

  test('TC-L1-04: Theme Toggle and CSS Custom Properties', async ({ page }) => {
    await page.goto('/');
    const themeBtn = page.locator('.header__theme-toggle');
    await expect(themeBtn).toBeVisible();

    // Click theme toggle to turn dark
    await themeBtn.click();
    const htmlTheme = await page.locator('html').getAttribute('data-theme');
    expect(htmlTheme).toBe('dark');

    // Click theme toggle again to turn light
    await themeBtn.click();
    const htmlThemeLight = await page.locator('html').getAttribute('data-theme');
    expect(htmlThemeLight || 'light').toBe('light');
  });

  test('TC-L1-05: One-Line Footer Layout', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('#site-footer');
    // Footer is completely removed or simplified in V2. 
    // Assert that standard 4-column footer elements are completely absent.
    const footerCols = page.locator('.footer__column');
    await expect(footerCols).toHaveCount(0);
  });

  // ==========================================
  // TIER 2: Boundary & Corner Cases (Layout)
  // ==========================================

  test('TC-L2-01: Anonymous User Layout Restrictions', async ({ page }) => {
    await page.goto('/');
    // Check user-specific links are absent
    const myBidsLink = page.locator('.header__nav-link', { hasText: 'My Bids' });
    await expect(myBidsLink).toHaveCount(0);

    const watchlistLink = page.locator('.header__nav-link', { hasText: 'Watchlist' });
    await expect(watchlistLink).toHaveCount(0);

    const createBtn = page.locator('.header__create-btn');
    await expect(createBtn).toHaveCount(0);

    // Verify Login/Signup buttons are visible
    const loginLink = page.locator('.header__auth .header__nav-link', { hasText: 'Login' });
    await expect(loginLink).toBeVisible();
  });

  test('TC-L2-02: Responsive Header (Mobile Viewport < 640px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Log in bidder1
    await page.evaluate((token) => {
      localStorage.setItem('accessToken', token);
    }, bidder1Token);
    await page.goto('/');

    // User email/name is hidden via CSS, but avatar element (28px) is still visible
    const avatar = page.locator('.header__avatar');
    await expect(avatar).toBeVisible();
    
    const boundingBox = await avatar.boundingBox();
    expect(boundingBox.width).toBe(28);
    expect(boundingBox.height).toBe(28);
  });

  test('TC-L2-03: Logo Typography Compliance', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('.header__logo');
    await expect(logo).toBeVisible();

    const styles = await logo.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight
      };
    });

    // Font-family should contain 'Inter' or system-ui, not DM Serif
    expect(styles.fontFamily.toLowerCase()).toContain('inter');
    expect(styles.fontSize).toBe('14px');
  });

  test('TC-L2-04: Avatar Initials Fallback', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('accessToken', token);
    }, bidder1Token);
    await page.goto('/');

    const avatar = page.locator('.header__avatar');
    await expect(avatar).toBeVisible();
    const text = await avatar.textContent();
    // 'bidder1@example.com' -> initials 'BI'
    expect(text.trim()).toBe('BI');
  });

  test('TC-L2-05: Spacing Variable Strict Verification', async ({ page }) => {
    await page.goto('/');
    const headerInner = page.locator('.header__inner');
    await expect(headerInner).toBeVisible();

    const padding = await headerInner.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.padding;
    });
    
    // Should use high-density padding (e.g. <=16px), not large padding values
    const numericPadding = parseInt(padding) || 0;
    expect(numericPadding).toBeLessThanOrEqual(16);
  });
});
