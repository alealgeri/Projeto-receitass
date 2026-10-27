/*
 * Receitas com Custo — nuvem.
 * Login, equipes e gravação dos dados no Supabase. A biblioteca oficial (supabase-js,
 * versão fixa) é carregada da CDN só quando a nuvem está configurada em js/config.js.
 * Erros viram mensagens em português com um `codigo` que o app usa para decidir o que fazer:
 *   'conexao' (sem internet), 'sessao' (entrar de novo), 'credenciais', 'nao-confirmado',
 *   'ja-existe', 'senha-fraca', 'limite', 'permissao', 'regra' (mensagem do próprio banco).
 */
(function (raiz) {
  'use strict';

  const URL_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
  const CHAVE_SESSAO = 'receitas-com-custo:sessao';
  const config = raiz.CONFIG_NUVEM || {};
  let cliente = null;

  function ativa() {
    return Boolean(config.url && config.chavePublica);
  }

  function erro(mensagem, codigo, causa) {
    return Object.assign(new Error(mensagem), { codigo, causa });
  }

  function semConexao(e) {
    return e && (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError'
      || /failed to fetch|networkerror|load failed|network request failed/i.test(String(e.message || e.details || '')));
  }

  /** Traduz erros do Supabase (login e banco) para mensagens que a pessoa entende. */
  function traduzir(e, padrao) {
    if (!e) return erro(padrao, 'desconhecido');
    if (e.codigo) return e;
    const codigo = e.code || e.error_code || '';
    const status = e.status || 0;
    const mensagem = String(e.message || '');
    switch (codigo) {
      case 'invalid_credentials': return erro('E-mail ou senha incorretos.', 'credenciais', e);
      case 'email_not_confirmed': return erro('Confirme o e-mail antes de entrar: abra o link que enviamos para você.', 'nao-confirmado', e);
      case 'user_already_exists':
      case 'email_exists': return erro('Já existe uma conta com este e-mail. Use “Entrar”.', 'ja-existe', e);
      case 'weak_password': return erro('Senha fraca. Use pelo menos 8 caracteres, com letras e números.', 'senha-fraca', e);
      case 'same_password': return erro('A nova senha precisa ser diferente da atual.', 'senha-fraca', e);
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit': return erro('Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.', 'limite', e);
      case 'session_not_found':
      case 'refresh_token_not_found':
      case 'bad_jwt':
      case 'PGRST301':
      case 'PGRST303': return erro('Sua sessão expirou. Entre de novo.', 'sessao', e);
      default: break;
    }
    // Mensagens escritas em português pelas funções do banco (supabase/migrations).
    if (['P0001', 'P0002', '28000'].includes(codigo) && mensagem) return erro(mensagem, 'regra', e);
    if (codigo === '42501') {
      return /^new row violates|permission denied/i.test(mensagem)
        ? erro('Você não tem permissão para isso nesta equipe.', 'permissao', e)
        : erro(mensagem, 'regra', e);
    }
    if (status === 429) return erro('Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.', 'limite', e);
    if (status === 401) return erro('Sua sessão expirou. Entre de novo.', 'sessao', e);
    if (semConexao(e)) return erro('Sem conexão com o servidor. Confira a internet.', 'conexao', e);
    return erro(padrao + (mensagem ? ` (${mensagem})` : ''), 'desconhecido', e);
  }

  /** Lança o erro traduzido de uma resposta { data, error } do supabase-js. */
  function conferir(resposta, padrao) {
    if (resposta.error) throw traduzir(resposta.error, padrao);
    return resposta.data;
  }

  /* ---------- Sessão ---------- */

  /**
   * Carrega a biblioteca, abre a sessão guardada (ou a que veio no link do e-mail)
   * e avisa mudanças de sessão (entrar, sair, link de nova senha).
   */
  async function iniciar(aoMudarSessao) {
    let sdk;
    try {
      sdk = await import(URL_SDK);
    } catch (e) {
      throw erro('Não foi possível carregar o app. Confira a conexão com a internet e tente de novo.', 'conexao', e);
    }
    cliente = sdk.createClient(config.url, config.chavePublica, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: CHAVE_SESSAO },
    });
    if (aoMudarSessao) cliente.auth.onAuthStateChange((evento, sessao) => aoMudarSessao(evento, sessao));
    const { data, error } = await cliente.auth.getSession();
    if (error) throw traduzir(error, 'Não foi possível abrir a sessão.');
    return data.session;
  }

  async function sessaoAtual() {
    const { data } = await cliente.auth.getSession();
    return data.session;
  }

  async function entrar(email, senha) {
    return conferir(await cliente.auth.signInWithPassword({ email, password: senha }), 'Não foi possível entrar.').session;
  }

  /** Cria a conta. Se o projeto pede confirmação por e-mail, volta sem sessão. */
  async function cadastrar(email, senha, endereco) {
    const dados = conferir(
      await cliente.auth.signUp({ email, password: senha, options: { emailRedirectTo: endereco } }),
      'Não foi possível criar a conta.',
    );
    return { sessao: dados.session, precisaConfirmar: !dados.session };
  }

  async function recuperarSenha(email, endereco) {
    conferir(await cliente.auth.resetPasswordForEmail(email, { redirectTo: endereco }), 'Não foi possível enviar o e-mail.');
  }

  async function definirSenha(senha) {
    conferir(await cliente.auth.updateUser({ password: senha }), 'Não foi possível trocar a senha.');
  }

  /** Sai só deste aparelho (funciona mesmo sem internet). */
  async function sair() {
    if (cliente) await cliente.auth.signOut({ scope: 'local' });
  }

  /* ---------- Equipes ---------- */

  async function minhasEquipes() {
    return conferir(await cliente.rpc('minhas_equipes'), 'Não foi possível carregar suas equipes.') || [];
  }

  async function criarEquipe(nome) {
    return conferir(await cliente.rpc('criar_equipe', { nome }), 'Não foi possível criar a equipe.');
  }

  async function renomearEquipe(equipeId, nome) {
    conferir(await cliente.from('equipes').update({ nome }).eq('id', equipeId), 'Não foi possível renomear a equipe.');
  }

  async function membros(equipeId) {
    return conferir(
      await cliente.from('membros').select('usuario_id,email,papel,entrou_em').eq('equipe_id', equipeId).order('entrou_em'),
      'Não foi possível carregar os membros.',
    );
  }

  async function removerMembro(equipeId, usuarioId) {
    conferir(
      await cliente.from('membros').delete().eq('equipe_id', equipeId).eq('usuario_id', usuarioId),
      'Não foi possível remover da equipe.',
    );
  }

  async function convites(equipeId) {
    return conferir(
      await cliente.from('convites').select('id,email,papel,expira_em').eq('equipe_id', equipeId).order('criado_em'),
      'Não foi possível carregar os convites.',
    );
  }

  async function convidar(equipeId, email, papel) {
    return conferir(
      await cliente.from('convites').insert({ equipe_id: equipeId, email, papel }).select('id,email,papel,expira_em').single(),
      'Não foi possível criar o convite.',
    );
  }

  async function cancelarConvite(id) {
    conferir(await cliente.from('convites').delete().eq('id', id), 'Não foi possível cancelar o convite.');
  }

  /** Dados do convite antes de aceitar: { equipe, email, expirado } ou null. */
  async function verConvite(id) {
    const linhas = conferir(await cliente.rpc('ver_convite', { convite: id }), 'Não foi possível abrir o convite.');
    return (linhas && linhas[0]) || null;
  }

  async function aceitarConvite(id) {
    return conferir(await cliente.rpc('aceitar_convite', { convite: id }), 'Não foi possível aceitar o convite.');
  }

  /* ---------- Dados da equipe ---------- */

  /** Ingredientes e receitas da equipe, no formato do app (ainda não validados). */
  async function carregarDados(equipeId) {
    const [ingredientes, receitas] = await Promise.all([
      cliente.from('ingredientes').select('id,dados').eq('equipe_id', equipeId),
      cliente.from('receitas').select('id,dados').eq('equipe_id', equipeId),
    ]);
    return {
      ingredientes: conferir(ingredientes, 'Não foi possível carregar os ingredientes.').map((l) => l.dados),
      receitas: conferir(receitas, 'Não foi possível carregar as receitas.').map((l) => l.dados),
    };
  }

  /**
   * Envia as alterações calculadas por Dados.diferencas:
   * { salvar: { ingredientes: [docs], receitas: [docs] }, apagar: { ingredientes: [ids], receitas: [ids] } }
   */
  async function enviarMudancas(equipeId, mudancas) {
    const pedidos = [];
    for (const tabela of ['ingredientes', 'receitas']) {
      const salvar = mudancas.salvar[tabela];
      if (salvar.length) {
        pedidos.push(cliente.from(tabela)
          .upsert(salvar.map((doc) => ({ equipe_id: equipeId, id: doc.id, dados: doc })), { onConflict: 'equipe_id,id' }));
      }
      const apagar = mudancas.apagar[tabela];
      if (apagar.length) pedidos.push(cliente.from(tabela).delete().eq('equipe_id', equipeId).in('id', apagar));
    }
    const respostas = await Promise.all(pedidos);
    for (const r of respostas) conferir(r, 'Não foi possível salvar na nuvem.');
  }

  raiz.Nuvem = {
    ativa,
    iniciar,
    sessaoAtual,
    entrar,
    cadastrar,
    recuperarSenha,
    definirSenha,
    sair,
    minhasEquipes,
    criarEquipe,
    renomearEquipe,
    membros,
    removerMembro,
    convites,
    convidar,
    cancelarConvite,
    verConvite,
    aceitarConvite,
    carregarDados,
    enviarMudancas,
  };
})(typeof self !== 'undefined' ? self : this);
