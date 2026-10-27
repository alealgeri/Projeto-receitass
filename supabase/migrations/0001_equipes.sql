-- Receitas com Custo — contas por equipe.
--
-- Cada negócio é uma equipe. O dono convida funcionários pelo e-mail; todos os membros
-- veem e editam os mesmos ingredientes e receitas. As regras de acesso (RLS) garantem
-- que uma equipe nunca vê os dados de outra.
--
-- Ingredientes e receitas são guardados como documentos JSON, no mesmo formato que o
-- app usa (veja js/dados.js), um registro por ingrediente e um por receita.
--
-- Para aplicar: no painel do Supabase, abra "SQL Editor", cole este arquivo e clique em "Run".

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  criada_por uuid references auth.users (id) on delete set null,
  criada_em timestamptz not null default now()
);

create table public.membros (
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('dono', 'membro')),
  email text not null,
  entrou_em timestamptz not null default now(),
  primary key (equipe_id, usuario_id)
);
create index membros_usuario on public.membros (usuario_id);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days'
);
create index convites_equipe on public.convites (equipe_id);

create table public.ingredientes (
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  dados jsonb not null check (pg_column_size(dados) < 200000),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (equipe_id, id)
);

create table public.receitas (
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  dados jsonb not null check (pg_column_size(dados) < 200000),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (equipe_id, id)
);

-- Marca quem e quando alterou cada documento, sem confiar no que o app manda.
create function public.marcar_alteracao() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

create trigger ingredientes_alteracao before insert or update on public.ingredientes
  for each row execute function public.marcar_alteracao();
create trigger receitas_alteracao before insert or update on public.receitas
  for each row execute function public.marcar_alteracao();

-- ---------------------------------------------------------------------------
-- Funções de apoio às regras de acesso
-- (security definer para consultar membros sem cair nas regras da própria tabela)
-- ---------------------------------------------------------------------------

create function public.eh_membro(equipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
    where m.equipe_id = equipe and m.usuario_id = auth.uid()
  );
$$;

create function public.eh_dono(equipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
    where m.equipe_id = equipe and m.usuario_id = auth.uid() and m.papel = 'dono'
  );
$$;

-- ---------------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------------

alter table public.equipes enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.ingredientes enable row level security;
alter table public.receitas enable row level security;

-- Equipes: membros veem; só o dono renomeia ou apaga. Criar é pela função criar_equipe.
create policy equipes_ver on public.equipes for select to authenticated
  using (public.eh_membro(id));
create policy equipes_renomear on public.equipes for update to authenticated
  using (public.eh_dono(id)) with check (public.eh_dono(id));
create policy equipes_apagar on public.equipes for delete to authenticated
  using (public.eh_dono(id));

-- Membros: membros veem a equipe; o dono remove outras pessoas; um membro pode sair.
-- Entrar é pelas funções criar_equipe e aceitar_convite.
create policy membros_ver on public.membros for select to authenticated
  using (public.eh_membro(equipe_id));
create policy membros_remover on public.membros for delete to authenticated
  using (
    (public.eh_dono(equipe_id) and usuario_id <> auth.uid())
    or (usuario_id = auth.uid() and papel = 'membro')
  );

-- Convites: só o dono vê, cria e cancela.
create policy convites_ver on public.convites for select to authenticated
  using (public.eh_dono(equipe_id));
create policy convites_criar on public.convites for insert to authenticated
  with check (public.eh_dono(equipe_id) and criado_por = auth.uid());
create policy convites_cancelar on public.convites for delete to authenticated
  using (public.eh_dono(equipe_id));

-- Ingredientes e receitas: todos os membros leem e editam os da sua equipe.
create policy ingredientes_equipe on public.ingredientes for all to authenticated
  using (public.eh_membro(equipe_id)) with check (public.eh_membro(equipe_id));
create policy receitas_equipe on public.receitas for all to authenticated
  using (public.eh_membro(equipe_id)) with check (public.eh_membro(equipe_id));

-- ---------------------------------------------------------------------------
-- Funções chamadas pelo app
-- ---------------------------------------------------------------------------

-- Cria a equipe e torna quem criou o dono.
create function public.criar_equipe(nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso entrar na conta.' using errcode = '28000';
  end if;
  insert into public.equipes (nome, criada_por) values (trim(nome), auth.uid()) returning id into v_id;
  insert into public.membros (equipe_id, usuario_id, papel, email)
    values (v_id, auth.uid(), 'dono', coalesce(auth.jwt() ->> 'email', ''));
  return v_id;
end;
$$;

-- Equipes de quem está usando, com o papel em cada uma.
create function public.minhas_equipes() returns table (id uuid, nome text, papel text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nome, m.papel
  from public.membros m join public.equipes e on e.id = m.equipe_id
  where m.usuario_id = auth.uid()
  order by m.entrou_em;
$$;

-- O que o convidado vê antes de aceitar (ainda não é membro, então não lê a equipe).
create function public.ver_convite(convite uuid) returns table (equipe text, email text, expirado boolean)
language sql stable security definer set search_path = '' as $$
  select e.nome, c.email, c.expira_em < now()
  from public.convites c join public.equipes e on e.id = c.equipe_id
  where c.id = convite;
$$;

-- Aceita o convite: só para o e-mail convidado, dentro do prazo.
create function public.aceitar_convite(convite uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.convites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'É preciso entrar na conta.' using errcode = '28000';
  end if;
  select * into c from public.convites where id = convite;
  if not found then
    raise exception 'Convite não encontrado. Peça um novo link ao dono da equipe.' using errcode = 'P0002';
  end if;
  if c.expira_em < now() then
    raise exception 'Este convite expirou. Peça um novo link ao dono da equipe.' using errcode = 'P0001';
  end if;
  if lower(c.email) <> v_email then
    raise exception 'Este convite é para outro e-mail. Entre com o e-mail convidado.' using errcode = '42501';
  end if;
  insert into public.membros (equipe_id, usuario_id, papel, email)
    values (c.equipe_id, auth.uid(), c.papel, v_email)
    on conflict (equipe_id, usuario_id) do nothing;
  delete from public.convites where id = convite;
  return c.equipe_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só usuários com login usam as tabelas e funções.
-- ---------------------------------------------------------------------------

revoke all on public.equipes, public.membros, public.convites, public.ingredientes, public.receitas from anon;
grant select, update, delete on public.equipes to authenticated;
grant select, delete on public.membros to authenticated;
grant select, insert, delete on public.convites to authenticated;
grant select, insert, update, delete on public.ingredientes, public.receitas to authenticated;

revoke execute on function public.marcar_alteracao(), public.eh_membro(uuid), public.eh_dono(uuid),
  public.criar_equipe(text), public.minhas_equipes(), public.ver_convite(uuid), public.aceitar_convite(uuid)
  from public, anon;
grant execute on function public.eh_membro(uuid), public.eh_dono(uuid), public.criar_equipe(text),
  public.minhas_equipes(), public.ver_convite(uuid), public.aceitar_convite(uuid)
  to authenticated;
