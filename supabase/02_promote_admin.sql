-- CDEV Admin - opcional
-- Depois de criar sua conta no Supabase Auth, rode este script para garantir
-- permissao de administrador.

update public.users
set role = 'admin',
    active = true,
    updated_at = now()
where email = 'cdev.main@gmail.com';

select id, email, role, active, updated_at
from public.users
where email = 'cdev.main@gmail.com';
