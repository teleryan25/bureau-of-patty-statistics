# Bureau auth email configuration

In Supabase Dashboard → Authentication → Email Templates, set the Invite User subject to
`Notice of Appointment — Bureau of Patty Statistics` and paste `invite.html` into the body.
Set the Site URL to the production BPS URL and allow that origin (plus the local development
origin, if used) in Redirect URLs. Configure SMTP in Supabase for reliable delivery; no SMTP
credentials belong in this repository.

The Cloudflare Pages project needs server-only environment variables `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. The service-role value must never be exposed as a `PUBLIC_`
variable or placed in `config.js`.
