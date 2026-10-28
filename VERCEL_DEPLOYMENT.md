# Deploying Avinash Studio to Vercel with Supabase Cloud PostgreSQL

Avinash Studio is pre-configured for **1-Click Vercel Deployment** (`vercel.json` + `/api/index.ts` serverless backend + **Supabase PostgreSQL** persistent database).

---

## Step 1: Run the SQL Schema in Your Supabase Project

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. In the left sidebar, click **SQL Editor** → **New query**.
3. Copy and paste the entire contents of [`SUPABASE_SETUP.sql`](./SUPABASE_SETUP.sql) (also available inside the app under **Settings & Connections → Copy SQL for Supabase**) and click **Run**.
4. This creates 3 tables with Row Level Security (RLS) policies:
   - `public.avinash_leads` (Stores all discovered & manual client leads, conversion scores, and outreach pitches)
   - `public.avinash_workspace_state` (Stores your SMS Gateway, Gmail SMTP, AI keys, and Studio Persona across Vercel cold starts)
   - `public.avinash_activity_logs` (Stores your multi-channel SMS, Email, Instagram DM, and AI discovery logs)

---

## Step 2: Deploy to Vercel & Add Environment Variables

1. Push this repository to GitHub / GitLab and import it into [Vercel](https://vercel.com/new).
2. In **Vercel Project Settings → Environment Variables**, add:

| Variable Name | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase Project URL (`https://xxxxxxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Your Supabase `anon` `public` key (or `service_role` key) |
| `VITE_SUPABASE_URL` | Same Supabase Project URL (`https://xxxxxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase `anon` `public` key |
| `GEMINI_API_KEY` | *(Optional)* Your Google AI Studio Gemini API Key (`AIzaSy...`) |
| `GROQ_API_KEY` | *(Optional)* Your Groq Cloud API Key (`gsk_...`) |

3. Click **Deploy**.
4. You can also paste or update your **Supabase Project URL** and **Supabase API Key** anytime directly inside the live app at **Settings & Connections → Supabase Cloud Database → Connect & Sync**.
