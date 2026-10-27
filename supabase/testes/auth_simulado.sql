-- Imita o pedaço do Supabase de que a migração depende, para testar num PostgreSQL comum:
-- os papéis anon e authenticated, a tabela auth.users e as funções auth.uid() e auth.jwt().
-- Só para testes locais. Nunca rode isto num projeto Supabase de verdade.

-- Papéis valem para o servidor inteiro: cria só se ainda não existem.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text not null);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Como no Supabase: tabelas novas do schema public nascem liberadas para anon e authenticated
-- (as regras de acesso e os revokes da migração é que restringem).
alter default privileges in schema public grant all on tables to anon, authenticated;
