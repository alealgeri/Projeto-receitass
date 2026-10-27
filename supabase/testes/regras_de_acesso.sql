-- Testes das regras de acesso (RLS) da migração 0001_equipes.sql.
-- Rodar num banco vazio, depois de auth_simulado.sql e da migração:
--   psql -v ON_ERROR_STOP=1 -f auth_simulado.sql -f ../migrations/0001_equipes.sql -f regras_de_acesso.sql
-- Cada bloco termina em erro se a regra não se comportar como esperado.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@padaria.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@padaria.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@outra.com');

-- Troca de usuário: simula o login (o papel e o JWT que o Supabase usaria).
create function pg_temp.como(usuario text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', usuario, 'email', email)::text, false);
  execute 'set role authenticated';
end;
$$;

-- Espera que o comando falhe (regra de acesso ou erro da função).
create function pg_temp.deve_falhar(comando text, motivo text) returns void language plpgsql as $$
begin
  execute comando;
  raise exception 'FALHOU: deveria ter sido bloqueado: %', motivo;
exception
  when raise_exception then
    if sqlerrm like 'FALHOU:%' then raise; end if;
  when others then
    null; -- bloqueado, como esperado
end;
$$;

create temp table ids (nome text primary key, valor uuid);
grant all on ids to authenticated;

-- 1. Ana cria a equipe e vira dona.
select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'ana@padaria.com');
insert into ids values ('padaria', public.criar_equipe('Padaria da Ana'));
do $$ begin
  assert (select count(*) from public.minhas_equipes()) = 1, 'Ana deveria ter 1 equipe';
  assert (select papel from public.minhas_equipes()) = 'dono', 'Ana deveria ser dona';
end $$;

-- 2. Ana grava ingrediente e receita; o servidor marca quem alterou.
insert into public.ingredientes (equipe_id, id, dados)
  select valor, 'ing_farinha', '{"id":"ing_farinha","nome":"Farinha","tipo":"massa","precos":[]}' from ids where nome = 'padaria';
insert into public.receitas (equipe_id, id, dados, atualizado_por)
  select valor, 'rec_pao', '{"id":"rec_pao","nome":"Pão"}', '00000000-0000-0000-0000-00000000000c' from ids where nome = 'padaria';
do $$ begin
  assert (select count(*) from public.ingredientes) = 1, 'Ana deveria ver 1 ingrediente';
  assert (select atualizado_por from public.receitas) = '00000000-0000-0000-0000-00000000000a',
    'atualizado_por deveria ser quem gravou, não o valor enviado';
end $$;
-- Upsert (como o app faz) também passa.
insert into public.ingredientes (equipe_id, id, dados)
  select valor, 'ing_farinha', '{"id":"ing_farinha","nome":"Farinha T55","tipo":"massa","precos":[]}' from ids where nome = 'padaria'
  on conflict (equipe_id, id) do update set dados = excluded.dados;
do $$ begin
  assert (select dados ->> 'nome' from public.ingredientes) = 'Farinha T55', 'upsert deveria atualizar';
end $$;

-- 3. Carla, de fora, não vê nem altera nada da equipe da Ana.
select pg_temp.como('00000000-0000-0000-0000-00000000000c', 'carla@outra.com');
do $$ begin
  assert (select count(*) from public.ingredientes) = 0, 'Carla não deveria ver ingredientes';
  assert (select count(*) from public.receitas) = 0, 'Carla não deveria ver receitas';
  assert (select count(*) from public.equipes) = 0, 'Carla não deveria ver a equipe';
  assert (select count(*) from public.membros) = 0, 'Carla não deveria ver os membros';
  assert (select count(*) from public.minhas_equipes()) = 0, 'Carla não tem equipe';
end $$;
select pg_temp.deve_falhar(format(
  $q$insert into public.ingredientes (equipe_id, id, dados) values (%L, 'x', '{}')$q$,
  (select valor from ids where nome = 'padaria')), 'Carla gravando na equipe da Ana');
select pg_temp.deve_falhar(format(
  $q$insert into public.convites (equipe_id, email) values (%L, 'carla@outra.com')$q$,
  (select valor from ids where nome = 'padaria')), 'Carla se convidando');
update public.ingredientes set dados = '{}';
delete from public.ingredientes;
update public.equipes set nome = 'Invadida';

-- Nada mudou para a Ana.
select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'ana@padaria.com');
do $$ begin
  assert (select dados ->> 'nome' from public.ingredientes) = 'Farinha T55', 'Carla não poderia ter alterado';
  assert (select nome from public.equipes) = 'Padaria da Ana', 'Carla não poderia ter renomeado';
end $$;

-- 4. Ana convida o Bruno.
with c as (
  insert into public.convites (equipe_id, email) select valor, 'bruno@padaria.com' from ids where nome = 'padaria'
  returning id
)
insert into ids select 'convite_bruno', id from c;
do $$ begin
  assert (select criado_por from public.convites) = '00000000-0000-0000-0000-00000000000a', 'convite registra quem criou';
end $$;

-- Carla não consegue usar o convite do Bruno, mas pode ver de que equipe é.
select pg_temp.como('00000000-0000-0000-0000-00000000000c', 'carla@outra.com');
do $$ begin
  assert (select equipe from public.ver_convite((select valor from ids where nome = 'convite_bruno'))) = 'Padaria da Ana',
    'ver_convite mostra a equipe';
end $$;
select pg_temp.deve_falhar(format('select public.aceitar_convite(%L)',
  (select valor from ids where nome = 'convite_bruno')), 'Carla aceitando convite do Bruno');

-- Bruno aceita (e-mail com maiúsculas também vale).
select pg_temp.como('00000000-0000-0000-0000-00000000000b', 'Bruno@Padaria.com');
select public.aceitar_convite((select valor from ids where nome = 'convite_bruno'));
do $$ begin
  assert (select papel from public.minhas_equipes()) = 'membro', 'Bruno deveria ser membro';
  assert (select count(*) from public.ingredientes) = 1, 'Bruno deveria ver os ingredientes da equipe';
  assert (select count(*) from public.membros) = 2, 'Bruno deveria ver os 2 membros';
  assert (select count(*) from public.convites) = 0, 'Bruno, que não é dono, não vê convites';
end $$;
-- O convite foi usado e some; aceitar de novo falha.
select pg_temp.deve_falhar(format('select public.aceitar_convite(%L)',
  (select valor from ids where nome = 'convite_bruno')), 'convite usado duas vezes');

-- 5. Bruno edita receitas, mas não administra a equipe.
insert into public.receitas (equipe_id, id, dados)
  select valor, 'rec_bolo', '{"id":"rec_bolo","nome":"Bolo"}' from ids where nome = 'padaria';
delete from public.receitas where id = 'rec_pao';
do $$ begin
  assert (select count(*) from public.receitas) = 1, 'Bruno deveria criar e apagar receitas';
end $$;
select pg_temp.deve_falhar(format(
  $q$insert into public.convites (equipe_id, email) values (%L, 'carla@outra.com')$q$,
  (select valor from ids where nome = 'padaria')), 'membro convidando');
update public.equipes set nome = 'Padaria do Bruno';
delete from public.membros where usuario_id = '00000000-0000-0000-0000-00000000000a';
delete from public.equipes;

select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'ana@padaria.com');
do $$ begin
  assert (select nome from public.equipes) = 'Padaria da Ana', 'membro não renomeia a equipe';
  assert (select count(*) from public.membros) = 2, 'membro não remove a dona';
end $$;

-- 6. Bruno sai da equipe sozinho; a dona não pode sair (só apagar a equipe).
select pg_temp.como('00000000-0000-0000-0000-00000000000b', 'bruno@padaria.com');
delete from public.membros where usuario_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.minhas_equipes()) = 0, 'Bruno deveria ter saído';
  assert (select count(*) from public.receitas) = 0, 'fora da equipe, Bruno não vê mais as receitas';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'ana@padaria.com');
delete from public.membros where usuario_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.membros) = 1, 'a dona não sai sozinha';
end $$;

-- 7. Convite vencido não vale.
with c as (
  insert into public.convites (equipe_id, email, expira_em)
    select valor, 'carla@outra.com', now() - interval '1 day' from ids where nome = 'padaria'
  returning id
)
insert into ids select 'convite_vencido', id from c;
select pg_temp.como('00000000-0000-0000-0000-00000000000c', 'carla@outra.com');
do $$ begin
  assert (select expirado from public.ver_convite((select valor from ids where nome = 'convite_vencido'))), 'deveria estar vencido';
end $$;
select pg_temp.deve_falhar(format('select public.aceitar_convite(%L)',
  (select valor from ids where nome = 'convite_vencido')), 'convite vencido');

-- 8. Sem login (anon), nada é acessível.
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select pg_temp.deve_falhar('select * from public.ingredientes', 'anon lendo ingredientes');
select pg_temp.deve_falhar('select * from public.equipes', 'anon lendo equipes');
select pg_temp.deve_falhar($q$select public.criar_equipe('x')$q$, 'anon criando equipe');

-- 9. A dona apaga a equipe e tudo vai junto.
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'ana@padaria.com');
delete from public.equipes;
reset role;
do $$ begin
  assert (select count(*) from public.equipes) = 0, 'equipe apagada';
  assert (select count(*) from public.ingredientes) + (select count(*) from public.receitas)
    + (select count(*) from public.membros) + (select count(*) from public.convites) = 0, 'dados apagados junto';
end $$;

select 'Todas as regras de acesso se comportaram como esperado.' as resultado;
