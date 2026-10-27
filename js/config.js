/*
 * Receitas com Custo — configuração da nuvem (Supabase).
 *
 * Vazio: o app funciona só neste aparelho, sem login, como antes.
 * Preenchido: login, equipes e dados sincronizados entre aparelhos.
 * O passo a passo está no README, em "Contas e equipes".
 *
 * A chave publicável ("publishable" ou "anon") pode ficar no código: quem protege os dados
 * são as regras de acesso do banco (supabase/migrations). NUNCA coloque aqui a chave
 * secreta ("secret" ou "service_role").
 */
window.CONFIG_NUVEM = {
  url: '', // ex.: 'https://abcdefghijklmnop.supabase.co'
  chavePublica: '', // ex.: 'sb_publishable_...' ou a chave "anon public"
};
