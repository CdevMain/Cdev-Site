This is just my personal site!!

## Admin/Supabase setup

1. Copy `assets/js/supabase.config.example.js` to `assets/js/supabase.config.js`.
2. Fill in the Supabase project URL and anon key.
3. Run `supabase/schema.sql` in the Supabase SQL Editor.
4. Deploy `supabase/functions/admin-users` with `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` configured.
5. The first authenticated profile created by the SQL trigger becomes `admin`; subsequent users default to `user`.

## Property spreadsheets

Run these scripts in order when setting up the spreadsheet module:

1. `supabase/05_property_spreadsheets.sql`
2. Optional sample import: `supabase/06_seed_hj_flats_2026.sql`

Admins can create spreadsheets in `admin.html`, choosing the owner login, year, cleaning fee and commission percentage. Owners with regular `user` role can open `dashboard.html` and view only their own spreadsheets.

## CDEV Control Center

Painel operacional (Site Factory + CRM + financeiro recorrente + monitoramento) em `/control`,
usando o mesmo login, as mesmas permissões e o mesmo Supabase do painel.

1. Rode no Supabase SQL Editor: `supabase/07_control_center.sql` e `supabase/08_control_center_templates.sql`
   (opcional: `supabase/09_control_center_cron.sql`).
2. Na VPS, instale o worker de monitoramento: `ops/monitor/README.md`.
3. URLs limpas (`/admin`, `/dashboard`, `/control`): `ops/nginx/clean-urls.conf`.
4. Demos e domínios de clientes: `ops/nginx/`.

Rodar local: `npx serve . -l 5500` e abrir `http://localhost:5500/login`.

Documentação completa: `docs/CONTROL_CENTER.md`.
