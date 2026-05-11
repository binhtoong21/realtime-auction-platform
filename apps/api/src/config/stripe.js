import Stripe from 'stripe';

let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-04-30.basil',
  });
} else {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set. Stripe features will be unavailable.');

  // Proxy that throws a clear error when any Stripe method is called
  stripe = new Proxy({}, {
    get(_, prop) {
      if (prop === 'webhooks') {
        return {
          constructEvent: () => {
            throw new Error('Stripe is not configured');
          },
        };
      }
      return new Proxy({}, {
        get() {
          return () => {
            const error = new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env');
            error.statusCode = 503;
            error.errorCode = 'STRIPE_NOT_CONFIGURED';
            throw error;
          };
        },
      });
    },
  });
}

export default stripe;
