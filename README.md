# CalPal

A mobile-first calorie planning app with Google-only authentication and saved,
personalized nutrition targets.

## Supabase setup

1. Open the Supabase SQL editor and run `supabase-schema.sql`.
2. In Authentication > Providers, enable Google and leave other sign-in providers disabled.
3. Add your Google OAuth client ID and secret to the Google provider.
4. Add the deployed app URL to Authentication > URL Configuration > Redirect URLs.
5. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`.

Run locally with `npm run dev`. Production validation is available through
`npm run build` and `npm run lint`.

## Calorie calculation

The target uses the Mifflin-St Jeor equation, an activity multiplier, and a
goal-based calorie adjustment. Results are estimates and are not medical advice.
