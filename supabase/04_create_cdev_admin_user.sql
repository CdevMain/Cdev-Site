-- CDEV Admin - criar usuario administrador inicial
--
-- Email: cdev.main@gmail.com
--
-- IMPORTANTE:
-- Este arquivo contem senha em texto claro apenas para facilitar o setup inicial.
-- Depois de rodar e confirmar o login, apague este arquivo ou remova a senha dele.
--
-- Rode no Supabase SQL Editor.

do $$
declare
  new_user_id uuid;
  admin_email text := 'cdev.main@gmail.com';
  admin_password text := 'Facas325!';
begin
  select id
  into new_user_id
  from auth.users
  where email = admin_email
  limit 1;

  if new_user_id is null then
    new_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    )
    values (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      new_user_id::text,
      new_user_id,
      jsonb_build_object(
        'sub', new_user_id::text,
        'email', admin_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      admin_email,
      now(),
      now(),
      now()
    )
    on conflict (provider, provider_id) do nothing;
  else
    update auth.users
    set encrypted_password = crypt(admin_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = new_user_id;
  end if;

  insert into public.users (id, email, role, active, updated_at)
  values (new_user_id, admin_email, 'admin', true, now())
  on conflict (id) do update
  set email = excluded.email,
      role = 'admin',
      active = true,
      updated_at = now();
end $$;

select
  u.id,
  u.email,
  p.role,
  p.active,
  u.email_confirmed_at,
  p.updated_at
from auth.users u
join public.users p on p.id = u.id
where u.email = 'cdev.main@gmail.com';
