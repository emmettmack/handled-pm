// Demo vs real. Without Clerk keys (local dev, the public browser demo) the app is a demo with sample data and
// simulate buttons. With them (the hosted app) it's a real workspace. DEMO_MODE=1/0 overrides, for local testing.
export const isDemo = () => (process.env.DEMO_MODE ? process.env.DEMO_MODE === '1' : !process.env.CLERK_SECRET_KEY?.trim());
