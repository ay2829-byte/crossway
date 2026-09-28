# Crossway: setup guide

Everything here is free. Total time is about 30 to 45 minutes.

**Files in this folder**

| File | What it is |
|---|---|
| `index.html` | The app: sign in page and your board |
| `admin.html` | Your signup stats page (only you can open it) |
| `config.js` | Where you paste your two Supabase values |
| `supabase.sql` | Sets up the database. You run it once in Supabase |
| `vercel.json` | Small hosting settings file. Leave it as is |

---

## Step 1. Create the database (Supabase)

1. Go to **supabase.com**, click **Start your project**, and sign in with GitHub (create a GitHub account first if you don't have one).
2. Click **New project**. Name it `crossway`, create a strong database password (save it somewhere), pick a region close to you (for example US East or US Central), and click **Create new project**. Wait about 2 minutes.
3. In the left menu open **SQL Editor**, then **New query**.
4. Open `supabase.sql` in any text editor. Check the line marked `>>> CHANGE THIS <<<` has the email you'll sign in with. Copy the whole file, paste it into Supabase, and click **Run**. You should see "Success. No rows returned".
5. Click the **Connect** button at the top (or **Project Settings > API**). Copy the **Project URL** and the **anon / publishable key**.
6. Open `config.js` and replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with those two values. Keep the quotes. Never paste the `service_role` or secret key.

## Step 2. Put the files on GitHub

1. On **github.com**, click **+ > New repository**. Name it `crossway` and click **Create repository**.
2. On the next page click **uploading an existing file**.
3. Drag in `index.html`, `admin.html`, `config.js`, `vercel.json` (you can include the others too). Click **Commit changes**.

## Step 3. Go live (Vercel)

1. Go to **vercel.com** and sign up with GitHub.
2. Click **Add New > Project**, find `crossway`, and click **Import**.
3. Leave the settings as they are (Framework: Other) and click **Deploy**.
4. You get a link like `https://crossway-abc.vercel.app`. Copy it.

## Step 4. Tell Supabase your website address

1. In Supabase open **Authentication > URL Configuration**.
2. Set **Site URL** to your Vercel link.
3. Under **Redirect URLs**, add your Vercel link followed by `/**`, for example `https://crossway-abc.vercel.app/**`. Save.

At this point email sign up works. Open your link and try it.

## Step 5. Turn on "Continue with Google"

1. In Supabase open **Authentication > Sign In / Providers > Google**. Copy the **Callback URL** shown there (it ends in `/auth/v1/callback`). Keep this tab open.
2. In a new tab go to **console.cloud.google.com** and create a new project called `Crossway`.
3. Open **Google Auth Platform** (or **APIs & Services > OAuth consent screen**) and click **Get started**. App name `Crossway`, your email as support email, audience **External**, then finish.
4. Go to **Clients > Create client**. Type: **Web application**.
   * **Authorized JavaScript origins**: your Vercel link, for example `https://crossway-abc.vercel.app`
   * **Authorized redirect URIs**: the Supabase Callback URL from step 1
   * Click **Create**, then copy the **Client ID** and **Client secret**.
5. Go to **Audience** and click **Publish app** so anyone can sign in, not just test users.
6. Back in Supabase, turn Google **on**, paste the Client ID and Client secret, and click **Save**.

## Step 6. Check your stats

Sign in on your site with the email you put in `supabase.sql`. A **Signup stats** button appears at the bottom of the sidebar. It opens `your-link/admin`.

It shows total people joined, new signups per day, Google versus email, who is active this week, how many people actually created tasks, and a searchable list of everyone who joined.

To add another admin, run this in Supabase SQL Editor:

```sql
insert into public.app_admins(email) values ('their@email.com');
```

---

## Good to know

* **Email limits on the free plan.** Supabase's built in email sender only sends a few emails per hour, so confirmation and password reset emails can get delayed once many people sign up with email. Google sign in is not affected. To fix it, connect a free email service like Resend under **Authentication > Emails > SMTP Settings**, or turn off **Confirm email** under **Authentication > Sign In / Providers > Email**.
* **Free plan pauses after 7 days with no activity.** If nobody uses the app for a week, Supabase pauses the project. You unpause it with one click in the dashboard.
* **Making changes later.** Edit a file on GitHub (pencil icon), click **Commit**, and Vercel updates the site in about 30 seconds.
* **Custom domain.** Buy a domain (for example on Namecheap or Cloudflare), then add it in Vercel under **Settings > Domains**. Also add the new address in Supabase URL Configuration and in Google's Authorized JavaScript origins.
