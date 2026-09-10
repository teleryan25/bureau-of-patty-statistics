/* =============================================================
   Bureau of Patty Statistics — config.js

   Paste your Supabase project URL and anon (publishable) key below.
   Both are safe in frontend code: the anon key only ever grants what
   Row Level Security allows. NEVER put the service-role key here.

   While these remain empty the app runs against the local mock
   adapter, so it is fully usable (and testable) with no database.
   ============================================================= */
window.BPS = window.BPS || {};
window.BPS.config = {
  SUPABASE_URL: 'https://lovrgvvjyfvodekfeltc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_dHmzEt4-vM2mSjrmT16wsw_YR6-tdAN',

  /* Force an adapter regardless of the above: 'supabase' | 'mock' | 'auto' */
  ADAPTER: 'auto'
};
