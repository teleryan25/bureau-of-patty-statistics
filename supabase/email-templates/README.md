# Bureau auth email configuration

The production templates can be managed through Supabase's field-level Management API after
custom SMTP is enabled (free-tier projects cannot customize templates while using Supabase's
default sender). The Invite User subject is `Notice of Appointment — Bureau of Patty
Statistics`; its body is `invite.html`. The Reset Password subject is `Bureau Credential
Recovery`; its body is `recovery.html`.
Set the Site URL to the production BPS URL and allow that origin (plus the local development
origin, if used) in Redirect URLs. Configure SMTP in Supabase for reliable delivery; no SMTP
credentials belong in this repository.

The Cloudflare Pages project needs server-only environment variables `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. The service-role value must never be exposed as a `PUBLIC_`
variable or placed in `config.js`.
