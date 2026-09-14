-- CDEV Admin - conferencia rapida
-- Rode para validar se tabelas, toggles e usuarios foram criados.

select key, enabled, description, updated_at
from public.system_settings
order by key;

select id, email, role, active, last_login, updated_at
from public.users
order by updated_at desc;
