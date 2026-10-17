# Diary Chat A.I — independent hosting edition
Built by Dipanshu. Prepared 15 October 2026.

This is a complete separate copy of the existing diary, AI planner and simple chat app, with Supabase authentication replacing the ChatGPT Sites identity integration. The existing hosted app is not modified by this package. No real user data, passwords, provider credentials or hosting secrets are included.

## What is implemented
- Google OAuth (enabled after owner configures the Google provider).
- Email/password signup, verification email, resend verification, login, password recovery, password update and signout.
- Server-verified user identity, cookie-based session refresh, same-origin authentication writes, and private responses.
- First-login profile setup: name, globally unique username within this app, country/region, preferred language and timezone. Countries/languages/timezones accept typed values. These fields are not public search results.
- Existing diary and voice dictation with automatic reconnect, AI content calendar, encrypted BYOK provider settings, profile editing and simple text chat.
- Persistent SQLite database on a Node host. Existing parameterized queries and owner checks preserved.

The interface is currently English; preferred language is stored as a preference and does not translate every screen. Speech recognition depends on the browser and selected language. No guarantee of availability in every country. Calls and call translation are intentionally absent.

## 1. Run locally on Windows
Use Node 24.13 or newer (Node 24.19 works). Open PowerShell in this extracted folder:

```powershell
npm.cmd run setup
npm.cmd ci
npm.cmd run dev
```
Open http://localhost:3000. Without Supabase settings, the login page clearly says setup is pending and disables login. There is no fake successful login or demo account.

Edit `.env.local` as described below. Restart after changes. To check a production build:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

## 2. Create the authentication project
1. Create a Supabase project in your own account at https://supabase.com/dashboard.
2. In its Connect/API settings, copy the project URL and **publishable key** to `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. Do not use a secret/service-role key for these fields. Regular login does not need a privileged key; the developer dashboard uses a separate server-only secret as described below.
4. Set `APP_URL=http://localhost:3000` locally, then the final HTTPS origin on the hosting server.
5. In Authentication > URL Configuration, set Site URL to APP_URL. Add exact redirect URLs for `/auth/callback`, `/auth/callback?flow=recovery`, `/auth/confirm` and `/auth/update-password` on each allowed origin.
6. Enable Email authentication and keep **Confirm email** enabled. Set the provider minimum password length to 12. App signup/reset validation also requires 12–128 characters.
7. In Authentication > Email Templates, use these link targets:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   The app verifies the one-time token server-side. These templates also allow opening the email on another device. Keep any branding changes separate from the link target.
8. Configure custom SMTP with a sender address you control before accepting public users. Supply the email service's SMTP host, port, username and password in Supabase, not in client code. Configure sender-domain verification with that email provider.

Supabase's default mail service is restricted to authorized team addresses and is not public production delivery. Public signup and password reset require working custom SMTP. No email is sent by this source package until you configure a real project and submit an auth request.

## 3. Add Google later
1. In Google Cloud Console, configure the OAuth consent screen for your application.
2. Create an OAuth client of type **Web application**.
3. In Supabase Authentication > Providers > Google, copy the callback URL shown there. Register that exact URL as Google's authorized redirect URI (normally `https://<your-project-ref>.supabase.co/auth/v1/callback`). Do not substitute the app callback for this Google-to-Supabase callback.
4. Put the Google **Client ID** and **Client Secret** in the Supabase Google provider settings. These are OAuth credentials, not a Google AI API key.
5. Enable the provider, then set `GOOGLE_AUTH_ENABLED=true` in the app environment and restart/redeploy.
6. While Google's consent screen is in testing mode, add permitted test users. Complete Google's publication requirements before general release.

Google secrets belong in the Supabase provider dashboard. They are never embedded in this ZIP or the browser bundle. Email login remains available independently of Google.

## 4. AI key encryption
`npm.cmd run setup` automatically creates the encryption secret without printing it. If you need to generate one manually:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Put it in `KEY_ENCRYPTION_SECRET` in `.env.local` / hosting secret settings. Preserve it across redeploys and backups. Rotating it without re-encrypting data makes saved AI keys unreadable. Each user enters their OpenRouter, Gemini or Groq key inside app Settings. Provider usage charges apply to their account.

## 5. Hosting
This edition needs a **persistent Node 24 server or Docker host with a persistent disk**. SQLite must not be put on an ephemeral serverless filesystem. Run one app instance against its local disk; do not horizontally scale this SQLite deployment.

Included Dockerfile and compose.yaml:

```sh
docker compose up --build -d
```

Fill `.env.local` first. Docker Compose persists the database in the `diary-data` volume. Put the app behind HTTPS, set APP_URL to that exact public origin and update Supabase redirect settings. Use your host's TLS reverse proxy. Back up the SQLite database consistently with SQLite's backup mechanism or with the app stopped and the database checkpointed. Store the encryption secret separately and securely.

No hosting account, paid service or domain has been provisioned. Deployment requires your hosting account and Supabase project configuration. The current ChatGPT Sites link still points to the previous version.

## 6. Existing-data migration
Do not infer identity from matching display names or arbitrary supplied emails. Old Sites IDs and Supabase IDs are different.

1. Keep the old app available and retain a backup.
2. Create and verify destination Supabase accounts; verify ownership before mapping old user IDs to new UUIDs.
3. Obtain a trusted export of the old `profiles`, `records`, and `messages` rows, as JSON arrays under those keys. Do not include credentials.
4. Create a local `identity-map.json`: `{"old-sites-user-id":"verified-supabase-user-uuid"}`. Keep private data outside the source repository.
5. Stop the new app. With DATABASE_PATH set, run `node scripts/migrate-data.mjs exported-rows.json identity-map.json` from this project folder.
6. The importer backs up an existing destination, uses a transaction, rejects duplicates rather than overwriting, skips unmapped data, and imports messages only when both users are mapped. It refuses an active WAL database.
7. Users reconnect AI provider keys in the new app. No key-vault secret is copied from the old host.
8. Check record counts and access isolation before switching users to the new URL.

Migration has not been run against live user data. This package contains no live data export.

## Verification
Automated tests cover backend owner isolation, unique usernames, private chat, AI-key encryption, auth route validation/origin checks, signup/login/reset/signout dispatch, Google enablement, mic reconnect and stop behavior. Provider responses are mocked. Build and local HTTP checks are recorded in VALIDATION.md.

Before opening public registration, complete one real email signup/verification, resend, reset, expired-link test, Google login/logout, and a two-account diary-isolation test using your configured services. Confirm both a desktop and mobile browser's microphone. Configure appropriate auth rate limits in Supabase and monitor delivery errors.

## Reference documentation
- https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/auth-smtp

## 7. Developer-only admin dashboard

Intended administrator email: **dipanshu.niat@gmail.com**.

The `/admin` page and `/api/admin/users` endpoint both require a server-verified email and an exact match to **both** `ADMIN_USER_ID` and `ADMIN_EMAIL`. A username, profile field, browser flag or editable auth metadata cannot grant admin access. Missing configuration denies access. No account has been elevated on a live service by this package.

### Activate after setting up Supabase
1. Sign up using `dipanshu.niat@gmail.com` and verify the email (or sign in through Google after Google is configured).
2. Add these server-only settings to `.env.local` or the hosting secret settings:
   - `ADMIN_EMAIL=dipanshu.niat@gmail.com`
   - `SUPABASE_SECRET_KEY`: your Supabase project's secret key (legacy service-role keys also work). This is privileged and must never use a `NEXT_PUBLIC_` prefix or be entered in the app's AI API-key form.
   - `ADMIN_USER_ID`: the verified account UUID from Supabase Authentication > Users.
3. Alternatively, after setting the email, URL and secret key, run `npm.cmd run admin:bind`. It finds exactly one verified matching account, refuses unverified/ambiguous accounts and conflicting existing bindings, and fills `ADMIN_USER_ID` in `.env.local`. It does not create an account or send an email. On hosting, copy the reported UUID into the server environment.
4. Restart/redeploy. After signing in as that account, **Admin dashboard** appears in the sidebar. Other users cannot see the link or access the endpoint directly.

### Included dashboard features
- Total registered auth accounts, verified emails, signups in the last rolling seven days, completed profiles.
- Name, email, unique username, country, language, timezone, signup time, last sign-in, verification status, profile completion and sign-in methods.
- Search by name/email/username/user ID; filter by verification and country; paginated account list; view details; refresh.
- Counts include accounts that never created a diary profile, because the source is the Supabase Auth directory, joined with app profiles by UUID.
- Empty, loading, provider-error and no-results states. No fabricated sample accounts.

Passwords, API keys, private diary entries and conversations are excluded. This dashboard includes protected account access controls and deletion, described in section 8. It never discloses passwords and does not offer role changes. Dates display in the administrator's browser timezone. Last sign-in is not live online status.

This implementation fetches all auth-account pages when refreshing/searching, then applies global filters and totals. It supports fewer than 50,000 accounts per refresh; at the safety cap it reports an error instead of displaying partial totals. For larger deployments, replace this with a protected indexed directory sync. Counts represent a refresh snapshot; simultaneous signups/deletions can change them during provider pagination. Use a dedicated Supabase project for this app, since its auth directory is the counted population.

The public publishable key is still used for regular authentication. The new privileged secret is used only by the server-side admin directory after authorization. The source adds a server-only module boundary and response-field allowlist.

Reference: https://supabase.com/docs/reference/javascript/auth-admin-listusers

## 8. Pause, resume, block and delete accounts

Open Admin dashboard > View beside an account. The developer account cannot be targeted, including by direct API requests.

- **Pause access:** a temporary administrative hold with no automatic expiry. Data is retained until the administrator chooses Resume.
- **Resume access:** restores a paused account. For blocked accounts the button reads **Unblock & resume**.
- **Block account:** denies that account's app access until the administrator explicitly unblocks it. Data is retained. This is an app-level restriction tied to a verified user ID, not a ban of a person's email address, device, country or future accounts.
- **Delete account:** requires typing the displayed email (or UUID for an account without email). Deletes the Supabase auth account and local profile, diary/calendar/brand records, encrypted saved AI keys and all messages involving that account. The confirmation explicitly explains that those messages disappear for the other participants too.

Every mutation requires verified developer authorization and a same-origin POST. Changes cannot be made through GET requests. The local access state is checked on every protected request, including requests from existing sessions; data writes re-check before committing. Already rendered content cannot be recalled, and work already in flight may finish before a restriction is committed. The normal email-login response explains when app access is restricted. A blocked Google-authenticated session also cannot access protected app endpoints.

Deletion is performed across two systems, so it is not a single distributed transaction. The app first records a durable `deleting` state to prevent access and reactivation, then removes the remote auth account, then transactionally removes local app data. If either cleanup stage fails, the dashboard shows **Deletion pending** with **Retry deletion**; it does not report success. Retrying also handles a remote user that was removed before local cleanup failed. Pending deletions remain visible even when they are no longer in the remote account list. Local identity tombstones prevent stale sessions from reopening access.

A minimal local audit table retains actor UUID, target UUID, action and timestamp. The tombstone and audit records remain after deletion, without the deleted account's email or diary/chat contents. Existing backups, provider logs and external copies are not erased by this app operation. A deleted person can create a new account with a new identity if public signup remains enabled; deletion is not an email blocklist.

No real user has been paused, blocked or deleted while building this feature. Live operation still requires deployment and the owner credentials described above.
