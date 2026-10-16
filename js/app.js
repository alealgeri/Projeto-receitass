/*
 * Receitas com Custo — telas.
 * Painel 1: ingredientes e preços mensais. Painel 2: receitas com custo.
 * Painel 3: produção com multiplicador e ajustes que valem só para a produção.
 */
(function () {
  'use strict';

  const C = window.Calculos;
  const D = window.Dados;
  const ABAS = ['ingredientes', 'receitas', 'producao'];
  const MES_ATUAL = C.mesDe(new Date());
  const ATALHOS = [0.5, 1, 1.5, 2, 3];

  /* ---------- Estado ---------- */

  let dados = D.carregar(MES_ATUAL);
  const tela = D.carregarTela();
  const primeiraVisita = !tela.aba;

  const estado = {
    aba: abaInicial(),
    busca: '',
    mensal: null, // { mes, valores: { idIngrediente: texto }, erros: {} }
    receita: null, // rascunho da receita em edição
    ingrediente: null, // rascunho do diálogo de ingrediente
    ajuste: null, // rascunho do diálogo de ajuste
    producaoId: typeof tela.producaoId === 'string' ? tela.producaoId : null,
    producao: limparProducao(tela.producao), // { idReceita: { mult, rend, ajustes } }
  };

  function abaInicial() {
    const hash = location.hash.slice(1);
    if (ABAS.includes(hash)) return hash;
    return ABAS.includes(tela.aba) ? tela.aba : 'producao';
  }

  /** Confere as configurações de produção guardadas no navegador. */
  function limparProducao(bruto) {
    const limpo = {};
    if (!bruto || typeof bruto !== 'object') return limpo;
    for (const [id, cfg] of Object.entries(bruto)) {
      if (!cfg || typeof cfg !== 'object') continue;
      const ajustes = (Array.isArray(cfg.ajustes) ? cfg.ajustes : []).filter((a) => {
        if (!a || !Number.isFinite(a.valor) || !['pct', 'qtd'].includes(a.modo)) return false;
        if (a.modo === 'qtd' && !C.tipoDaUnidade(a.unidade)) return false;
        if (a.alvo === 'item') return Number.isInteger(a.indice) && a.indice >= 0;
        return a.alvo === 'extra' && typeof a.ingredienteId === 'string' && a.modo === 'qtd';
      });
      limpo[id] = {
        mult: typeof cfg.mult === 'string' ? cfg.mult : '1',
        rend: typeof cfg.rend === 'string' ? cfg.rend : null,
        ajustes,
      };
    }
    return limpo;
  }

  /* ---------- Utilidades ---------- */

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  const num = C.parseNumero;
  const moeda = C.formatarMoeda;
  const qtdTxt = C.formatarQuantidade;
  const arred = (n, casas) => Math.round(n * 10 ** casas) / 10 ** casas;
  const plural = (n, um, varios) => (n === 1 ? um : varios);

  function ingrediente(id) {
    return dados.ingredientes.find((i) => i.id === id) || null;
  }

  function receita(id) {
    return dados.receitas.find((r) => r.id === id) || null;
  }

  function porNome(lista) {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  }

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function precoTxt(preco, tipo) {
    return preco == null ? 'sem preço' : moeda(preco, true) + '/' + C.TIPOS[tipo].base;
  }

  /** Como o preço foi informado: "R$ 115,00 por 25 kg" ou "R$ 52,00 por kg". */
  function entradaTxt(entrada, tipo) {
    if (!entrada) return '';
    if (entrada.tipo === 'embalagem') return moeda(entrada.preco) + ' por ' + qtdTxt(entrada.qtd, entrada.unidade);
    return moeda(entrada.preco) + ' por ' + C.TIPOS[tipo].base;
  }

  function rendimentoTxt(qtd, unidade) {
    return C.formatarNumero(qtd, 2) + ' ' + (unidade || 'unidades');
  }

  function multTxt(m) {
    return C.formatarNumero(m, 4) + '×';
  }

  function sinal(v) {
    return v < 0 ? '−' : '+';
  }

  function usosDoIngrediente(id) {
    return dados.receitas.filter((r) => r.itens.some((it) => it.ingredienteId === id));
  }

  function temExemplos() {
    return dados.ingredientes.some((i) => i.exemplo) || dados.receitas.some((r) => r.exemplo);
  }

  function salvarDados() {
    D.salvar(dados);
    atualizarFaixas();
  }

  function salvarTela() {
    D.salvarTela({ aba: estado.aba, producaoId: estado.producaoId, producao: estado.producao });
  }

  /** Re-renderiza mantendo o foco e o cursor no campo em que a pessoa está digitando. */
  function manterFoco(fn) {
    const ativo = document.activeElement;
    const id = ativo && ativo.id;
    let inicio = null;
    let fim = null;
    try {
      inicio = ativo.selectionStart;
      fim = ativo.selectionEnd;
    } catch (erro) {
      /* campo sem seleção de texto */
    }
    fn();
    if (!id) return;
    const el = document.getElementById(id);
    if (el && el !== document.activeElement) {
      el.focus({ preventScroll: true });
      if (inicio != null) {
        try {
          el.setSelectionRange(inicio, fim);
        } catch (erro) {
          /* campo sem seleção de texto */
        }
      }
    }
  }

  let temporizadorAviso = null;
  function avisar(mensagem) {
    const el = $('#aviso-rapido');
    el.textContent = mensagem;
    el.classList.add('visivel');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => el.classList.remove('visivel'), 2800);
  }

  function abrirDialogo(seletor) {
    const d = $(seletor);
    if (d.open) return;
    try {
      d.showModal();
    } catch (erro) {
      d.setAttribute('open', '');
    }
  }

  function fecharDialogo(seletor) {
    const d = $(seletor);
    if (d.open) d.close();
  }

  /** Confirmação dentro da página (sem window.confirm). Resolve true ou false. */
  function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false }) {
    return new Promise((resolve) => {
      const d = $('#dlg-confirmar');
      d.innerHTML = `<div class="dlg-form">
        <header class="dlg-cabeca"><h2 id="dlg-confirmar-titulo">${esc(titulo)}</h2></header>
        <div class="dlg-corpo"><p>${esc(texto)}</p></div>
        <footer class="dlg-rodape">
          <button type="button" class="btn" data-confirmar="nao">Cancelar</button>
          <button type="button" class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" data-confirmar="sim">${esc(botao)}</button>
        </footer></div>`;
      let respondido = false;
      const responder = (valor) => {
        if (respondido) return;
        respondido = true;
        if (d.open) d.close();
        resolve(valor);
      };
      d.addEventListener('close', () => responder(false), { once: true });
      $$('[data-confirmar]', d).forEach((b) =>
        b.addEventListener('click', () => responder(b.dataset.confirmar === 'sim')));
      abrirDialogo('#dlg-confirmar');
      $('[data-confirmar="nao"]', d).focus();
    });
  }

  /* ---------- Estrutura ---------- */

  function atualizarFaixas() {
    $('#aviso-exemplo').hidden = !temExemplos();
    $('#aviso-armazenamento').hidden = D.armazenamentoDisponivel();
  }

  function render() {
    $$('.aba').forEach((a) => a.setAttribute('aria-current', a.dataset.aba === estado.aba ? 'page' : 'false'));
    let html;
    if (estado.aba === 'ingredientes') html = telaIngredientes();
    else if (estado.aba === 'receitas') html = telaReceitas();
    else html = telaProducao();
    manterFoco(() => {
      $('#principal').innerHTML = html;
    });
  }

  function mudarAba(aba) {
    if (!ABAS.includes(aba)) return;
    estado.aba = aba;
    try {
      history.replaceState(null, '', '#' + aba);
    } catch (erro) {
      /* alguns ambientes não permitem mudar o endereço */
    }
    salvarTela();
    render();
    window.scrollTo(0, 0);
  }

  /* =====================================================================
   * Painel 1 — Ingredientes
   * ===================================================================== */

  function cabecaIngredientes() {
    return `<div class="painel-cabeca">
      <div><h1>Ingredientes</h1>
        <p class="sub">Custo de compra de cada ingrediente, atualizado uma vez por mês. As receitas usam sempre o preço mais recente.</p></div>
      <div class="acoes"><button type="button" class="btn" data-acao="novo-ingrediente">+ Novo ingrediente</button></div>
    </div>`;
  }

  function telaIngredientes() {
    if (estado.mensal) return telaMensal();
    const lista = dados.ingredientes;
    if (!lista.length) {
      return `<section class="painel">${cabecaIngredientes()}
        <div class="cartao vazio">
          <h2>Nenhum ingrediente cadastrado</h2>
          <p class="sub">Cadastre cada ingrediente com o preço de compra: por kg, por litro, por unidade ou pelo preço da embalagem.</p>
          <button type="button" class="btn btn-primario" data-acao="novo-ingrediente">+ Novo ingrediente</button>
        </div></section>`;
    }
    const atualizados = lista.filter((i) => C.statusPreco(i, MES_ATUAL) === 'atualizado').length;
    const faltam = lista.length - atualizados;
    const pct = Math.round((atualizados / lista.length) * 100);
    return `<section class="painel">
      ${cabecaIngredientes()}
      <div class="cartao resumo-mes">
        <div>
          <span class="rotulo">Preços de ${esc(C.nomeMes(MES_ATUAL))}</span>
          <div><strong class="num">${atualizados} de ${lista.length}</strong> ${plural(lista.length, 'ingrediente atualizado', 'ingredientes atualizados')}${faltam ? ` · ${faltam} ${plural(faltam, 'pendente', 'pendentes')}` : ''}</div>
          <div class="progresso" role="progressbar" aria-label="Ingredientes atualizados no mês" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        </div>
        <button type="button" class="btn btn-primario" data-acao="abrir-mensal">Atualizar preços do mês</button>
      </div>
      <label class="campo busca"><span>Buscar</span>
        <input id="busca-ingrediente" type="search" data-campo="busca" value="${esc(estado.busca)}" placeholder="Nome do ingrediente" autocomplete="off"></label>
      <div class="cartao tabela-lista" id="lista-ingredientes">${linhasIngredientes()}</div>
    </section>`;
  }

  function linhasIngredientes() {
    const filtro = normalizar(estado.busca);
    const lista = porNome(dados.ingredientes).filter((i) => !filtro || normalizar(i.nome).includes(filtro));
    const cabeca = `<div class="lin lin-cabeca rotulo"><span>Ingrediente</span><span>Preço atual</span><span>Variação</span><span>Situação</span><span></span></div>`;
    if (!lista.length) return cabeca + `<div class="lin"><span class="sub">Nenhum ingrediente com “${esc(estado.busca)}”.</span></div>`;
    return cabeca + lista.map(linhaIngrediente).join('');
  }

  function linhaIngrediente(ing) {
    const reg = C.registroAtual(ing);
    const preco = C.precoAtual(ing);
    const status = C.statusPreco(ing, MES_ATUAL);
    const v = C.variacaoAtual(ing);
    const anterior = reg ? C.registroAnterior(ing, reg.mes) : null;
    const usos = usosDoIngrediente(ing.id).length;
    let chip = '<span class="chip chip-erro">Sem preço</span>';
    if (status === 'atualizado') chip = '<span class="chip chip-ok">Atualizado</span>';
    else if (status === 'pendente') chip = `<span class="chip chip-alerta">Pendente · último em ${esc(C.nomeMes(reg.mes, true))}</span>`;
    const detalhe = [
      reg ? entradaTxt(reg.entrada, ing.tipo) + ' · ' + C.nomeMes(reg.mes, true) : C.TIPOS[ing.tipo].nome,
      usos ? `em ${usos} ${plural(usos, 'receita', 'receitas')}` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="lin">
      <div class="lin-nome"><strong>${esc(ing.nome)}${ing.exemplo ? ' <span class="chip chip-exemplo">exemplo</span>' : ''}</strong><small>${esc(detalhe)}</small></div>
      <div class="preco-grande">${preco != null ? `${esc(moeda(preco, true))}<small>/${C.TIPOS[ing.tipo].base}</small>` : '<span class="sub">—</span>'}</div>
      <div class="var num ${v > 0.0005 ? 'sobe' : v < -0.0005 ? 'desce' : ''}">${v != null ? `${esc(C.formatarVariacao(v))}<small>vs ${esc(C.nomeMes(anterior.mes, true))}</small>` : '<span class="sub">—</span>'}</div>
      <div>${chip}</div>
      <button type="button" class="btn btn-p" data-acao="editar-ingrediente" data-id="${esc(ing.id)}">Editar</button>
    </div>`;
  }

  /* ---------- Atualização mensal ---------- */

  function abrirMensal() {
    estado.mensal = { mes: MES_ATUAL, valores: {}, erros: {} };
    preencherMensal();
    render();
    window.scrollTo(0, 0);
  }

  /** Começa com os preços já registrados no mês escolhido. */
  function preencherMensal() {
    const m = estado.mensal;
    m.valores = {};
    m.erros = {};
    for (const ing of dados.ingredientes) {
      const reg = C.registroDoMes(ing, m.mes);
      if (reg) m.valores[ing.id] = C.formatarCampo(reg.entrada.preco);
    }
  }

  /** Registro que define como o preço é informado: o do mês, se já existe, ou o último anterior. */
  function referenciaMensal(ing, mes) {
    return C.registroDoMes(ing, mes) || C.registroAnterior(ing, mes) || null;
  }

  function entradaMensal(ing, mes, texto) {
    const preco = num(texto);
    if (!Number.isFinite(preco) || preco < 0) return null;
    const ref = referenciaMensal(ing, mes);
    if (ref && ref.entrada.tipo === 'embalagem') {
      return { tipo: 'embalagem', preco, qtd: ref.entrada.qtd, unidade: ref.entrada.unidade };
    }
    return { tipo: 'direto', preco };
  }

  function telaMensal() {
    const { mes } = estado.mensal;
    const meses = C.listaMeses(MES_ATUAL, 24, 1);
    return `<section class="painel">
      <div class="painel-cabeca">
        <div>
          <button type="button" class="voltar" data-acao="fechar-mensal">← Ingredientes</button>
          <h1>Atualizar preços do mês</h1>
          <p class="sub">Digite o preço de compra deste mês. Campo vazio não muda nada. Se o preço continua o mesmo, toque em “Manter”.</p>
        </div>
        <label class="campo"><span>Mês de referência</span>
          <select id="mensal-mes" data-campo="mensal-mes">${meses.map((m) => `<option value="${m}"${m === mes ? ' selected' : ''}>${esc(C.nomeMes(m))}</option>`).join('')}</select></label>
      </div>
      <div class="cartao tabela-lista">
        <div class="lin lin-mensal lin-cabeca rotulo"><span>Ingrediente</span><span>Preço anterior</span><span>Preço em ${esc(C.nomeMes(mes, true))}</span><span>Variação</span></div>
        ${porNome(dados.ingredientes).map((ing) => linhaMensal(ing, mes)).join('')}
      </div>
      <div class="barra-salvar">
        <span class="barra-resumo" id="mensal-resumo">${resumoMensal()}</span>
        <div class="acoes">
          <button type="button" class="btn" data-acao="fechar-mensal">Cancelar</button>
          <button type="button" class="btn btn-primario" data-acao="salvar-mensal">Salvar preços de ${esc(C.nomeMes(mes))}</button>
        </div>
      </div>
    </section>`;
  }

  function linhaMensal(ing, mes) {
    const anterior = C.registroAnterior(ing, mes);
    const ref = referenciaMensal(ing, mes);
    const entrada = ref ? ref.entrada : { tipo: 'direto' };
    const sufixo = entrada.tipo === 'embalagem' ? 'por ' + qtdTxt(entrada.qtd, entrada.unidade) : 'por ' + C.TIPOS[ing.tipo].base;
    const valor = estado.mensal.valores[ing.id] || '';
    const jaTem = C.registroDoMes(ing, mes);
    return `<div class="lin lin-mensal">
      <div class="lin-nome"><strong>${esc(ing.nome)}</strong>${jaTem ? `<small>Já registrado em ${esc(C.nomeMes(mes, true))}</small>` : ''}</div>
      <div class="lin-nome">${anterior
        ? `<span class="preco-grande">${esc(entradaTxt(anterior.entrada, ing.tipo))}</span><small>${esc(C.nomeMes(anterior.mes, true))} · ${esc(precoTxt(C.precoPorBase(anterior.entrada), ing.tipo))}</small>`
        : '<span class="sub">Sem registro anterior</span>'}</div>
      <div class="mensal-entrada">
        <div class="grupo"><span class="grupo-txt">R$</span><input id="mensal-${esc(ing.id)}" data-campo="mensal-valor" data-id="${esc(ing.id)}" inputmode="decimal" autocomplete="off" value="${esc(valor)}" class="${estado.mensal.erros[ing.id] ? 'invalido' : ''}" aria-label="Preço de ${esc(ing.nome)} ${esc(sufixo)}"><span class="grupo-txt">${esc(sufixo)}</span></div>
        ${anterior ? `<button type="button" class="btn btn-p" data-acao="manter-preco" data-id="${esc(ing.id)}">Manter</button>` : ''}
      </div>
      <div class="var num" id="mensal-var-${esc(ing.id)}">${variacaoMensalHtml(ing, mes)}</div>
    </div>`;
  }

  function variacaoMensalHtml(ing, mes) {
    const texto = estado.mensal.valores[ing.id];
    const anterior = C.registroAnterior(ing, mes);
    const entrada = texto && anterior ? entradaMensal(ing, mes, texto) : null;
    const v = entrada ? C.variacao(C.precoPorBase(entrada), C.precoPorBase(anterior.entrada)) : null;
    if (v == null) return '<span class="sub">—</span>';
    return `<span class="${v > 0.0005 ? 'sobe' : v < -0.0005 ? 'desce' : ''}">${esc(C.formatarVariacao(v))}</span>`;
  }

  function resumoMensal() {
    const n = Object.values(estado.mensal.valores).filter((t) => String(t).trim()).length;
    return n ? `<strong>${n}</strong> ${plural(n, 'preço preenchido', 'preços preenchidos')}` : 'Nenhum preço preenchido';
  }

  /** "Manter": repete o último preço, convertido para o formato deste mês se a embalagem mudou. */
  function manterPreco(id) {
    const ing = ingrediente(id);
    const m = estado.mensal;
    const anterior = ing && C.registroAnterior(ing, m.mes);
    if (!anterior) return;
    const precoBase = C.precoPorBase(anterior.entrada);
    const ref = referenciaMensal(ing, m.mes);
    const preco = ref.entrada.tipo === 'embalagem' ? precoBase * C.paraBase(ref.entrada.qtd, ref.entrada.unidade) : precoBase;
    m.valores[id] = C.formatarCampo(arred(preco, 2));
    delete m.erros[id];
    const campo = document.getElementById('mensal-' + id);
    if (campo) {
      campo.value = m.valores[id];
      campo.classList.remove('invalido');
    }
    $('#mensal-var-' + CSS.escape(id)).innerHTML = variacaoMensalHtml(ing, m.mes);
    $('#mensal-resumo').innerHTML = resumoMensal();
  }

  function salvarMensal() {
    const { mes, valores } = estado.mensal;
    const erros = {};
    let salvos = 0;
    const atualizados = dados.ingredientes.map((ing) => {
      const texto = String(valores[ing.id] || '').trim();
      if (!texto) return ing;
      const entrada = entradaMensal(ing, mes, texto);
      if (!entrada || C.precoPorBase(entrada) == null) {
        erros[ing.id] = true;
        return ing;
      }
      salvos++;
      return { ...ing, exemplo: false, precos: C.registrarPreco(ing.precos, mes, entrada) };
    });
    if (Object.keys(erros).length) {
      estado.mensal.erros = erros;
      render();
      avisar('Corrija os preços marcados em vermelho.');
      return;
    }
    if (!salvos) {
      avisar('Preencha pelo menos um preço.');
      return;
    }
    dados.ingredientes = atualizados;
    salvarDados();
    estado.mensal = null;
    render();
    avisar(`${salvos} ${plural(salvos, 'preço salvo', 'preços salvos')} em ${C.nomeMes(mes)}`);
  }

  /* ---------- Diálogo de ingrediente ---------- */

  function abrirIngrediente(id, retorno = null) {
    const ing = id ? ingrediente(id) : null;
    const reg = ing ? C.registroAtual(ing) : null;
    const e = reg ? reg.entrada : null;
    const tipo = ing ? ing.tipo : 'massa';
    const noRascunho = !!(ing && estado.receita && estado.receita.itens.some((it) => it.ingredienteId === ing.id));
    estado.ingrediente = {
      id: ing ? ing.id : null,
      nome: ing ? ing.nome : '',
      tipo,
      tipoTravado: !!ing && (ing.precos.length > 0 || usosDoIngrediente(ing.id).length > 0 || noRascunho),
      modo: e ? e.tipo : 'direto',
      preco: e ? C.formatarCampo(e.preco) : '',
      embQtd: e && e.tipo === 'embalagem' ? C.formatarCampo(e.qtd) : '',
      embUnidade: e && e.tipo === 'embalagem' ? e.unidade : C.TIPOS[tipo].base,
      mes: MES_ATUAL,
      precoAlterado: false,
      precos: ing ? C.historico(ing) : [],
      retorno,
    };
    renderDialogoIngrediente();
    abrirDialogo('#dlg-ingrediente');
    const el = $(ing ? '#ing-preco' : '#ing-nome');
    if (el) el.focus();
  }

  function entradaDoRascunho(r) {
    const preco = num(r.preco);
    if (r.modo === 'embalagem') return { tipo: 'embalagem', preco, qtd: num(r.embQtd), unidade: r.embUnidade };
    return { tipo: 'direto', preco };
  }

  function renderDialogoIngrediente() {
    const r = estado.ingrediente;
    if (!r) return;
    const def = C.TIPOS[r.tipo];
    const meses = C.listaMeses(MES_ATUAL, 24, 1);
    const precoCampo = (rotulo) => `<input id="ing-preco" data-ing="preco" inputmode="decimal" autocomplete="off" value="${esc(r.preco)}" placeholder="0,00" aria-label="${esc(rotulo)}">`;
    const html = `<form class="dlg-form" data-form="ingrediente" novalidate>
      <header class="dlg-cabeca">
        <h2 id="dlg-ingrediente-titulo">${r.id ? 'Editar ingrediente' : 'Novo ingrediente'}</h2>
        <button type="button" class="icone" data-acao="fechar-dialogo" aria-label="Fechar">×</button>
      </header>
      <div class="dlg-corpo">
        <label class="campo"><span>Nome</span>
          <input id="ing-nome" data-ing="nome" value="${esc(r.nome)}" placeholder="Ex.: Farinha de trigo" autocomplete="off" maxlength="200"></label>
        <fieldset class="campo"><legend>Como é medido</legend>
          <div class="segmentos">${Object.entries(C.TIPOS).map(([t, d]) => `<label><input type="radio" name="ing-tipo" id="ing-tipo-${t}" data-ing="tipo" value="${t}"${r.tipo === t ? ' checked' : ''}${r.tipoTravado && r.tipo !== t ? ' disabled' : ''}><span>${d.nome} (${C.unidadesDoTipo(t).join(', ')})</span></label>`).join('')}</div>
          ${r.tipoTravado ? '<small>O tipo não muda depois que o ingrediente tem preço ou está em receita. Para outro tipo, crie um ingrediente novo.</small>' : ''}
        </fieldset>
        <fieldset class="campo"><legend>Preço de compra</legend>
          <div class="segmentos">
            <label><input type="radio" name="ing-modo" id="ing-modo-direto" data-ing="modo" value="direto"${r.modo === 'direto' ? ' checked' : ''}><span>Preço por ${def.base}</span></label>
            <label><input type="radio" name="ing-modo" id="ing-modo-embalagem" data-ing="modo" value="embalagem"${r.modo === 'embalagem' ? ' checked' : ''}><span>Preço da embalagem</span></label>
          </div>
          ${r.modo === 'direto'
            ? `<div class="grupo"><span class="grupo-txt">R$</span>${precoCampo('Preço por ' + def.base)}<span class="grupo-txt">por ${def.base}</span></div>`
            : `<div class="linha-emb">
                <div class="grupo"><span class="grupo-txt">R$</span>${precoCampo('Preço da embalagem')}</div>
                <span class="dica">por</span>
                <div class="grupo"><input id="ing-emb-qtd" data-ing="embQtd" inputmode="decimal" autocomplete="off" value="${esc(r.embQtd)}" placeholder="${r.tipo === 'unidade' ? '30' : '25'}" aria-label="Tamanho da embalagem"><select id="ing-emb-unidade" data-ing="embUnidade" aria-label="Unidade da embalagem">${C.unidadesDoTipo(r.tipo).map((u) => `<option${u === r.embUnidade ? ' selected' : ''}>${u}</option>`).join('')}</select></div>
              </div>`}
          <div class="calc-caixa" id="ing-calc">${calcIngredienteHtml()}</div>
        </fieldset>
        <label class="campo"><span>Mês de referência do preço</span>
          <select id="ing-mes" data-ing="mes">${meses.map((m) => `<option value="${m}"${m === r.mes ? ' selected' : ''}>${esc(C.nomeMes(m))}</option>`).join('')}</select>
          <small>${r.id ? 'Um preço novo só é registrado se você mudar o valor, a embalagem ou o mês.' : 'Sem o preço ainda? Deixe em branco e preencha depois.'}</small></label>
        ${r.precos.length ? historicoHtml() : ''}
        <p class="erro-msg" id="ing-erro" hidden></p>
      </div>
      <footer class="dlg-rodape">
        ${r.id ? '<button type="button" class="btn btn-perigo esquerda" data-acao="excluir-ingrediente">Excluir</button>' : ''}
        <button type="button" class="btn" data-acao="fechar-dialogo">Cancelar</button>
        <button type="submit" class="btn btn-primario">Salvar</button>
      </footer>
    </form>`;
    manterFoco(() => {
      $('#dlg-ingrediente').innerHTML = html;
    });
  }

  function calcIngredienteHtml() {
    const r = estado.ingrediente;
    if (!String(r.preco).trim()) return '<span class="vazio-calc">Informe o preço para ver o custo por grama, ml ou unidade.</span>';
    const p = C.precoPorBase(entradaDoRascunho(r));
    if (p == null) {
      return `<span class="vazio-calc">${r.modo === 'embalagem' ? 'Confira o preço e o tamanho da embalagem.' : 'Confira o preço.'}</span>`;
    }
    const def = C.TIPOS[r.tipo];
    const linhas = [`<span>= <strong>${esc(moeda(p, true))}</strong> por ${def.base}</span>`];
    if (def.menor !== def.base) linhas.push(`<span>= ${esc(moeda(p / 1000, true))} por ${def.menor}</span>`);
    const anterior = r.precos.filter((x) => x.mes < r.mes).pop();
    const v = anterior ? C.variacao(p, C.precoPorBase(anterior.entrada)) : null;
    if (v != null) linhas.push(`<span>${esc(C.formatarVariacao(v))} em relação a ${esc(C.nomeMes(anterior.mes, true))}</span>`);
    return linhas.join('');
  }

  function historicoHtml() {
    const r = estado.ingrediente;
    const base = C.TIPOS[r.tipo].base;
    const linhas = [...r.precos].reverse().map((reg) => {
      const anterior = r.precos.filter((x) => x.mes < reg.mes).pop();
      const p = C.precoPorBase(reg.entrada);
      const v = anterior ? C.variacao(p, C.precoPorBase(anterior.entrada)) : null;
      return `<tr>
        <td>${esc(C.nomeMes(reg.mes, true))}</td>
        <td>${esc(entradaTxt(reg.entrada, r.tipo))}</td>
        <td class="n">${esc(moeda(p, true))}</td>
        <td class="n ${v > 0.0005 ? 'sobe' : v < -0.0005 ? 'desce' : ''}">${v != null ? esc(C.formatarVariacao(v)) : '—'}</td>
        <td><button type="button" class="icone" data-acao="remover-registro" data-mes="${esc(reg.mes)}" aria-label="Apagar o preço de ${esc(C.nomeMes(reg.mes))}">×</button></td>
      </tr>`;
    });
    return `<div class="campo"><span>Histórico de preços</span>
      <div class="rolagem-simples"><table class="historico">
        <thead><tr><th>Mês</th><th>Como foi informado</th><th class="n">Por ${base}</th><th class="n">Var.</th><th><span class="oculto">Apagar</span></th></tr></thead>
        <tbody>${linhas.join('')}</tbody>
      </table></div>
      <small>Um registro apagado aqui só some de vez quando você salvar.</small></div>`;
  }

  function erroIngrediente(mensagem, seletorCampo) {
    const el = $('#ing-erro');
    el.textContent = mensagem;
    el.hidden = false;
    if (seletorCampo) {
      const campo = $(seletorCampo);
      if (campo) {
        campo.classList.add('invalido');
        campo.focus();
      }
    }
  }

  function salvarIngrediente() {
    const r = estado.ingrediente;
    if (!r) return;
    const nome = r.nome.trim();
    if (!nome) return erroIngrediente('Dê um nome ao ingrediente.', '#ing-nome');
    const repetido = dados.ingredientes.find((i) => i.id !== r.id && normalizar(i.nome) === normalizar(nome));
    if (repetido) return erroIngrediente(`Já existe um ingrediente chamado “${repetido.nome}”.`, '#ing-nome');

    let precos = r.precos;
    if (String(r.preco).trim() && (r.precoAlterado || !r.id)) {
      const e = entradaDoRascunho(r);
      if (C.precoPorBase(e) == null) {
        const campo = r.modo === 'embalagem' && !(num(r.embQtd) > 0) ? '#ing-emb-qtd' : '#ing-preco';
        return erroIngrediente(r.modo === 'embalagem' ? 'Confira o preço e o tamanho da embalagem.' : 'Confira o preço.', campo);
      }
      const entrada = e.tipo === 'embalagem'
        ? { tipo: 'embalagem', preco: e.preco, qtd: e.qtd, unidade: e.unidade }
        : { tipo: 'direto', preco: e.preco };
      precos = C.registrarPreco(precos, r.mes, entrada);
    }

    const salvo = { id: r.id || D.novoId('ing'), nome, tipo: r.tipo, precos, exemplo: false };
    if (r.id) dados.ingredientes = dados.ingredientes.map((i) => (i.id === r.id ? salvo : i));
    else dados.ingredientes.push(salvo);
    salvarDados();

    if (r.retorno && estado.receita) {
      const item = estado.receita.itens.find((it) => it.chave === r.retorno.chave);
      if (item) {
        item.ingredienteId = salvo.id;
        if (C.tipoDaUnidade(item.unidade) !== salvo.tipo) item.unidade = C.TIPOS[salvo.tipo].menor;
        estado.receita.alterado = true;
      }
    }
    estado.ingrediente = null;
    fecharDialogo('#dlg-ingrediente');
    render();
    avisar(r.id ? 'Ingrediente salvo' : 'Ingrediente cadastrado');
  }

  async function excluirIngrediente() {
    const r = estado.ingrediente;
    if (!r || !r.id) return;
    const usos = usosDoIngrediente(r.id).map((rec) => rec.nome);
    if (estado.receita && estado.receita.itens.some((it) => it.ingredienteId === r.id)) usos.push('receita em edição');
    if (usos.length) {
      return erroIngrediente(`Este ingrediente está em: ${usos.join(', ')}. Tire-o dessas receitas antes de excluir.`);
    }
    const ok = await confirmar({
      titulo: 'Excluir ingrediente?',
      texto: `“${r.nome}” e todo o histórico de preços serão apagados.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    dados.ingredientes = dados.ingredientes.filter((i) => i.id !== r.id);
    salvarDados();
    estado.ingrediente = null;
    fecharDialogo('#dlg-ingrediente');
    render();
    avisar('Ingrediente excluído');
  }

  /* =====================================================================
   * Painel 2 — Receitas
   * ===================================================================== */

  let contadorChave = 0;
  const novaChave = () => 'k' + ++contadorChave;
  const itemVazio = () => ({ chave: novaChave(), ingredienteId: '', qtd: '', unidade: 'g' });

  function telaReceitas() {
    if (estado.receita) return telaEditor();
    const lista = porNome(dados.receitas);
    const cabeca = `<div class="painel-cabeca">
      <div><h1>Receitas</h1>
        <p class="sub">Cada receita soma os ingredientes pelo preço mais recente do painel 1. Para produzir, escolha a receita no painel 3.</p></div>
      <div class="acoes"><button type="button" class="btn btn-primario" data-acao="nova-receita">+ Nova receita</button></div>
    </div>`;
    if (!lista.length) {
      return `<section class="painel">${cabeca}
        <div class="cartao vazio">
          <h2>Nenhuma receita cadastrada</h2>
          <p class="sub">${dados.ingredientes.length
            ? 'Monte a primeira receita escolhendo os ingredientes e as quantidades. O custo aparece enquanto você digita.'
            : 'Cadastre os ingredientes no painel 1 ou crie cada um direto dentro da receita.'}</p>
          <button type="button" class="btn btn-primario" data-acao="nova-receita">+ Nova receita</button>
        </div></section>`;
    }
    return `<section class="painel">${cabeca}<div class="lista-receitas">${lista.map(cartaoReceita).join('')}</div></section>`;
  }

  function cartaoReceita(rec) {
    const c = C.custoReceita(rec, dados.ingredientes);
    const pendentes = new Set(rec.itens
      .filter((it) => {
        const ing = ingrediente(it.ingredienteId);
        return ing && C.statusPreco(ing, MES_ATUAL) === 'pendente';
      })
      .map((it) => it.ingredienteId)).size;
    const avisos = [];
    if (c.semPreco) avisos.push(`<span class="chip chip-erro">${c.semPreco} sem preço</span>`);
    if (pendentes) avisos.push(`<span class="chip chip-alerta">${pendentes} ${plural(pendentes, 'preço de mês anterior', 'preços de meses anteriores')}</span>`);
    const rend = rec.rendimento.qtd;
    const id = esc(rec.id);
    return `<article class="cartao rec">
      <div class="rec-info">
        <h2>${esc(rec.nome)}${rec.exemplo ? ' <span class="chip chip-exemplo">exemplo</span>' : ''}</h2>
        <p>${rend ? 'Rende ' + esc(rendimentoTxt(rend, rec.rendimento.unidade)) + ' · ' : ''}${rec.itens.length} ${plural(rec.itens.length, 'ingrediente', 'ingredientes')}</p>
        ${avisos.length ? `<div class="rec-avisos">${avisos.join('')}</div>` : ''}
      </div>
      <div class="rec-num"><span class="rotulo">Custo da receita</span><strong>${esc(moeda(c.total))}</strong>${c.semPreco ? '<small>parcial</small>' : ''}</div>
      <div class="rec-num"><span class="rotulo">Custo por unidade</span><strong>${c.porUnidade != null ? esc(moeda(c.porUnidade)) : '—'}</strong><small>${rend ? '÷ ' + esc(rendimentoTxt(rend, rec.rendimento.unidade)) : 'sem rendimento'}</small></div>
      <div class="rec-acoes">
        <button type="button" class="btn btn-primario btn-p" data-acao="produzir" data-id="${id}">Produzir</button>
        <button type="button" class="btn btn-p" data-acao="editar-receita" data-id="${id}">Editar</button>
        <button type="button" class="btn btn-p" data-acao="duplicar-receita" data-id="${id}">Duplicar</button>
        <button type="button" class="btn btn-p btn-perigo" data-acao="excluir-receita" data-id="${id}">Excluir</button>
      </div>
    </article>`;
  }

  async function abrirEditor(id) {
    const atual = estado.receita;
    if (atual && atual.alterado && atual.id !== id) {
      const ok = await confirmar({
        titulo: 'Descartar a receita em edição?',
        texto: `As alterações em “${atual.nome.trim() || 'Nova receita'}” ainda não foram salvas.`,
        botao: 'Descartar',
        perigo: true,
      });
      if (!ok) return;
    }
    const rec = id ? receita(id) : null;
    if (!atual || atual.id !== id || !id) {
      estado.receita = {
        id: rec ? rec.id : null,
        nome: rec ? rec.nome : '',
        rendQtd: rec && rec.rendimento.qtd ? C.formatarCampo(rec.rendimento.qtd) : '',
        rendUnidade: rec ? rec.rendimento.unidade : '',
        itens: rec && rec.itens.length
          ? rec.itens.map((it) => ({ chave: novaChave(), ingredienteId: it.ingredienteId, qtd: C.formatarCampo(it.qtd), unidade: it.unidade }))
          : [itemVazio()],
        preparo: rec ? rec.preparo : '',
        obsTempo: rec ? rec.obs.tempo : '',
        obsEspacoQtd: rec && rec.obs.espacoQtd ? C.formatarCampo(rec.obs.espacoQtd) : '',
        obsEspacoDesc: rec ? rec.obs.espacoDesc : '',
        obsTexto: rec ? rec.obs.texto : '',
        erros: {},
        alterado: false,
      };
    }
    mudarAba('receitas');
    if (!rec) {
      const nome = $('#rec-nome');
      if (nome) nome.focus();
    }
  }

  function custoRascunho() {
    const r = estado.receita;
    return C.custoReceita({ itens: r.itens, rendimento: { qtd: r.rendQtd } }, dados.ingredientes);
  }

  function telaEditor() {
    const r = estado.receita;
    const c = custoRascunho();
    const v = (campo) => esc(r[campo]);
    const inv = (campo) => (r.erros[campo] ? ' invalido' : '');
    return `<section class="painel">
      <div class="painel-cabeca">
        <div>
          <button type="button" class="voltar" data-acao="cancelar-receita">← Receitas</button>
          <h1>${r.id ? 'Editar receita' : 'Nova receita'}</h1>
          <p class="sub">O custo é calculado enquanto você digita: quantidade × preço do painel de ingredientes.</p>
        </div>
      </div>
      <div class="editor-grade">
        <section class="cartao bloco">
          <div class="dados-receita">
            <label class="campo"><span>Nome da receita</span>
              <input id="rec-nome" data-rec="nome" value="${v('nome')}" placeholder="Ex.: Croissant" autocomplete="off" maxlength="200" class="${inv('nome')}"></label>
            <div class="campo"><span>Rendimento</span>
              <div class="linha-campos">
                <input id="rec-rend-qtd" data-rec="rendQtd" inputmode="decimal" autocomplete="off" value="${v('rendQtd')}" placeholder="28" aria-label="Quanto a receita rende" class="${inv('rendQtd')}">
                <input id="rec-rend-unidade" data-rec="rendUnidade" value="${v('rendUnidade')}" placeholder="croissants" aria-label="Unidade do rendimento" maxlength="60" autocomplete="off">
              </div></div>
          </div>
        </section>
        <section class="cartao bloco">
          <div class="bloco-cabeca"><h2>Ingredientes</h2><span class="dica">Não está na lista? Escolha “+ Novo ingrediente…”.</span></div>
          <div class="itens" id="rec-itens">${itensEditorHtml(c)}</div>
          <div><button type="button" class="btn" data-acao="adicionar-item">+ Adicionar ingrediente</button></div>
          <div class="totais-receita" id="rec-totais">${totaisEditorHtml(c)}</div>
        </section>
        <section class="cartao bloco">
          <label class="campo"><span>Modo de preparo</span>
            <textarea id="rec-preparo" data-rec="preparo" rows="8" placeholder="1. Misture os secos…">${v('preparo')}</textarea></label>
          <div class="obs-campos">
            <div><h3>Obs</h3><p class="dica">Opcional. Aparece no fim do modo de preparo; campos vazios não aparecem na produção.</p></div>
            <label class="campo"><span>Tempo de produção</span>
              <input id="rec-obs-tempo" data-rec="obsTempo" value="${v('obsTempo')}" placeholder="Ex.: 3 h de trabalho + 12 h de descanso" maxlength="300" autocomplete="off">
              <small>Fica igual em qualquer multiplicador.</small></label>
            <div class="campo"><span>Espaço ocupado por receita</span>
              <div class="linha-campos">
                <input id="rec-obs-espaco-qtd" data-rec="obsEspacoQtd" inputmode="decimal" autocomplete="off" value="${v('obsEspacoQtd')}" placeholder="2" aria-label="Quantidade de espaço por receita" class="${inv('obsEspacoQtd')}">
                <input id="rec-obs-espaco-desc" data-rec="obsEspacoDesc" value="${v('obsEspacoDesc')}" placeholder="assadeiras 60 × 40 cm" aria-label="Que espaço ocupa" maxlength="200" autocomplete="off">
              </div>
              <small>Acompanha o multiplicador na produção: 2 assadeiras em 0,7× = 1,4.</small></div>
            <label class="campo"><span>Observações</span>
              <textarea id="rec-obs-texto" data-rec="obsTexto" rows="3" placeholder="Ex.: forno a 180 °C por 18 min">${v('obsTexto')}</textarea></label>
          </div>
        </section>
      </div>
      <div class="barra-salvar">
        <span class="barra-resumo" id="rec-resumo">${resumoEditorHtml(c)}</span>
        <div class="acoes">
          <button type="button" class="btn" data-acao="cancelar-receita">Cancelar</button>
          <button type="button" class="btn btn-primario" data-acao="salvar-receita">Salvar receita</button>
        </div>
      </div>
    </section>`;
  }

  function itensEditorHtml(c) {
    const r = estado.receita;
    const cabeca = '<div class="item item-cabeca rotulo"><span>Ingrediente</span><span>Quantidade</span><span>Unid.</span><span>Cálculo</span><span>% do custo</span><span></span></div>';
    if (!r.itens.length) return cabeca + '<p class="dica item-nenhum">Nenhum ingrediente na receita ainda.</p>';
    const opcoes = porNome(dados.ingredientes);
    return cabeca + r.itens.map((it, i) => itemHtml(it, c.linhas[i], c.total, opcoes)).join('');
  }

  function itemHtml(it, linha, total, opcoes) {
    const ing = linha.ingrediente;
    const tipo = ing ? ing.tipo : C.tipoDaUnidade(it.unidade) || 'massa';
    const k = it.chave;
    const erro = estado.receita.erros['item-' + k];
    return `<div class="item">
      <select id="item-ing-${k}" data-item="ingredienteId" data-chave="${k}" aria-label="Ingrediente" class="${erro === 'ing' ? 'invalido' : ''}">
        <option value="">Escolha o ingrediente…</option>
        ${opcoes.map((o) => `<option value="${esc(o.id)}"${o.id === it.ingredienteId ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}
        <option value="__novo">+ Novo ingrediente…</option>
      </select>
      <input id="item-qtd-${k}" data-item="qtd" data-chave="${k}" inputmode="decimal" autocomplete="off" value="${esc(it.qtd)}" placeholder="0" aria-label="Quantidade" class="${erro === 'qtd' ? 'invalido' : ''}">
      <select id="item-un-${k}" data-item="unidade" data-chave="${k}" aria-label="Unidade">${C.unidadesDoTipo(tipo).map((u) => `<option${u === it.unidade ? ' selected' : ''}>${u}</option>`).join('')}</select>
      <div class="item-calc" id="item-calc-${k}">${calcItemHtml(it, linha)}</div>
      <div class="item-parte" id="item-parte-${k}">${parteItemHtml(linha, total)}</div>
      <button type="button" class="icone" data-acao="remover-item" data-chave="${k}" aria-label="Remover ${ing ? esc(ing.nome) : 'linha'}">×</button>
    </div>`;
  }

  /** O cálculo da linha, como no pedido: 1,5 g × R$ 4,80/kg = R$ 0,0072. */
  function calcItemHtml(it, linha) {
    const ing = linha.ingrediente;
    if (!ing) return '<span class="dica">—</span>';
    if (linha.precoBase == null) {
      return `<span class="sem">sem preço</span> <button type="button" class="btn btn-p" data-acao="editar-ingrediente" data-id="${esc(ing.id)}">Informar preço</button>`;
    }
    const q = Number.isFinite(linha.qtd) ? qtdTxt(linha.qtd, it.unidade) : '? ' + it.unidade;
    return `${esc(q)} × ${esc(precoTxt(linha.precoBase, ing.tipo))} = <strong>${linha.custo != null ? esc(moeda(linha.custo, true)) : '—'}</strong>`;
  }

  function parteItemHtml(linha, total) {
    if (linha.custo == null || !(total > 0)) return '';
    const pct = (linha.custo / total) * 100;
    return `<span class="barrinha"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></span><span>${esc(C.formatarNumero(pct, 1))}%</span>`;
  }

  function totaisEditorHtml(c) {
    const r = estado.receita;
    const rend = num(r.rendQtd);
    return `<div class="total-par"><span class="rotulo">Custo total</span><strong>${esc(moeda(c.total))}</strong>${c.semPreco ? `<small class="dica">parcial: ${c.semPreco} sem preço</small>` : ''}</div>
      <div class="total-par"><span class="rotulo">Custo por unidade</span><strong>${c.porUnidade != null ? esc(moeda(c.porUnidade)) : '—'}</strong><small class="dica">${rend > 0 ? '÷ ' + esc(rendimentoTxt(rend, r.rendUnidade.trim())) : 'informe o rendimento'}</small></div>`;
  }

  function resumoEditorHtml(c) {
    return `Custo <strong>${esc(moeda(c.total))}</strong>${c.porUnidade != null ? ` · <strong>${esc(moeda(c.porUnidade))}</strong> por unidade` : ''}`;
  }

  /** Atualiza só os números do editor, sem redesenhar os campos. */
  function atualizarCalculosEditor() {
    const r = estado.receita;
    if (!r) return;
    const c = custoRascunho();
    r.itens.forEach((it, i) => {
      const calc = document.getElementById('item-calc-' + it.chave);
      if (calc) calc.innerHTML = calcItemHtml(it, c.linhas[i]);
      const parte = document.getElementById('item-parte-' + it.chave);
      if (parte) parte.innerHTML = parteItemHtml(c.linhas[i], c.total);
    });
    $('#rec-totais').innerHTML = totaisEditorHtml(c);
    $('#rec-resumo').innerHTML = resumoEditorHtml(c);
  }

  function redesenharItens() {
    const c = custoRascunho();
    manterFoco(() => {
      $('#rec-itens').innerHTML = itensEditorHtml(c);
    });
    $('#rec-totais').innerHTML = totaisEditorHtml(c);
    $('#rec-resumo').innerHTML = resumoEditorHtml(c);
  }

  function salvarReceita() {
    const r = estado.receita;
    const erros = {};
    const nome = r.nome.trim();
    if (!nome) erros.nome = true;

    const rendTexto = r.rendQtd.trim();
    const rendQtd = rendTexto ? num(rendTexto) : null;
    if (rendTexto && !(rendQtd > 0)) erros.rendQtd = true;

    const espacoTexto = r.obsEspacoQtd.trim();
    const espacoQtd = espacoTexto ? num(espacoTexto) : null;
    if (espacoTexto && !(espacoQtd > 0)) erros.obsEspacoQtd = true;

    const itens = [];
    for (const it of r.itens) {
      const qtdTexto = String(it.qtd).trim();
      if (!it.ingredienteId && !qtdTexto) continue; // linha vazia é ignorada
      if (!ingrediente(it.ingredienteId)) {
        erros['item-' + it.chave] = 'ing';
        continue;
      }
      const qtd = num(qtdTexto);
      if (!(qtd > 0)) {
        erros['item-' + it.chave] = 'qtd';
        continue;
      }
      itens.push({ ingredienteId: it.ingredienteId, qtd, unidade: it.unidade });
    }

    if (Object.keys(erros).length) {
      r.erros = erros;
      render();
      avisar(erros.nome ? 'Dê um nome à receita.' : 'Corrija os campos marcados em vermelho.');
      return;
    }

    const salva = {
      id: r.id || D.novoId('rec'),
      nome,
      rendimento: { qtd: rendQtd, unidade: r.rendUnidade.trim() },
      itens,
      preparo: r.preparo.replace(/\s+$/, ''),
      obs: {
        tempo: r.obsTempo.trim(),
        espacoQtd,
        espacoDesc: r.obsEspacoDesc.trim(),
        texto: r.obsTexto.replace(/\s+$/, ''),
      },
      exemplo: false,
      atualizadaEm: new Date().toISOString(),
    };
    if (r.id && receita(r.id)) dados.receitas = dados.receitas.map((x) => (x.id === r.id ? salva : x));
    else dados.receitas.push(salva);
    // Os ajustes de produção apontam para linhas da receita; com a receita alterada, recomeçam.
    if (estado.producao[salva.id]) estado.producao[salva.id].ajustes = [];
    salvarDados();
    salvarTela();
    estado.receita = null;
    render();
    window.scrollTo(0, 0);
    avisar('Receita salva');
  }

  async function cancelarReceita() {
    const r = estado.receita;
    if (r && r.alterado) {
      const ok = await confirmar({
        titulo: 'Descartar alterações?',
        texto: 'O que você mudou nesta receita não será salvo.',
        botao: 'Descartar',
        perigo: true,
      });
      if (!ok) return;
    }
    estado.receita = null;
    render();
    window.scrollTo(0, 0);
  }

  function duplicarReceita(id) {
    const rec = receita(id);
    if (!rec) return;
    const copia = JSON.parse(JSON.stringify(rec));
    copia.id = D.novoId('rec');
    copia.nome = rec.nome + ' (cópia)';
    copia.exemplo = false;
    copia.atualizadaEm = new Date().toISOString();
    dados.receitas.push(copia);
    salvarDados();
    render();
    avisar('Cópia criada: ' + copia.nome);
  }

  async function excluirReceita(id) {
    const rec = receita(id);
    if (!rec) return;
    const ok = await confirmar({
      titulo: 'Excluir receita?',
      texto: `“${rec.nome}” será apagada. Os ingredientes continuam no painel 1.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    dados.receitas = dados.receitas.filter((r) => r.id !== id);
    delete estado.producao[id];
    if (estado.producaoId === id) estado.producaoId = null;
    salvarDados();
    salvarTela();
    render();
    avisar('Receita excluída');
  }

  /* =====================================================================
   * Painel 3 — Produção
   * ===================================================================== */

  function configProducao(id) {
    if (!estado.producao[id]) estado.producao[id] = { mult: '1', rend: null, ajustes: [] };
    return estado.producao[id];
  }

  /**
   * Multiplicador em uso. Quando a pessoa digita o rendimento desejado, o multiplicador
   * sai exato da divisão (40 ÷ 28), sem o arredondamento do campo.
   */
  function multiplicadorAtual(cfg, rec) {
    if (cfg.rend != null && rec.rendimento.qtd) {
      const m = C.multiplicadorParaRendimento(rec.rendimento.qtd, cfg.rend);
      return m > 0 ? m : NaN;
    }
    const m = num(cfg.mult);
    return m > 0 ? m : NaN;
  }

  function chaveAjuste(a) {
    return a.alvo === 'item' ? 'item:' + a.indice : 'extra:' + a.ingredienteId;
  }

  function telaProducao() {
    const rec = estado.producaoId ? receita(estado.producaoId) : null;
    if (!rec) return telaEscolha();
    const cfg = configProducao(rec.id);
    const m = multiplicadorAtual(cfg, rec);
    const base = C.custoReceita(rec, dados.ingredientes);
    const rendBase = rec.rendimento.qtd;
    const valorRend = cfg.rend != null ? cfg.rend : rendBase && Number.isFinite(m) ? C.formatarCampo(arred(rendBase * m, 3)) : '';
    return `<section class="painel">
      <div class="painel-cabeca">
        <div>
          <button type="button" class="voltar" data-acao="trocar-receita">← Todas as receitas</button>
          <h1>${esc(rec.nome)}</h1>
          <p class="sub">Receita base: ${rendBase ? 'rende ' + esc(rendimentoTxt(rendBase, rec.rendimento.unidade)) + ' · ' : ''}custo ${esc(moeda(base.total))}</p>
        </div>
        <div class="acoes">
          <button type="button" class="btn" data-acao="editar-receita" data-id="${esc(rec.id)}">Editar receita</button>
          <button type="button" class="btn so-local" data-acao="imprimir">Imprimir ficha</button>
        </div>
      </div>
      <div class="controle">
        <div class="campo"><label for="prod-mult">Multiplicador da receita</label>
          <div class="grupo"><input id="prod-mult" data-campo="prod-mult" inputmode="decimal" autocomplete="off" value="${esc(cfg.rend != null && Number.isFinite(m) ? C.formatarCampo(arred(m, 4)) : cfg.mult)}" class="${Number.isFinite(m) ? '' : 'invalido'}"><span class="grupo-txt">× a receita</span></div>
          <div class="atalhos" id="prod-atalhos">${atalhosHtml(m)}</div>
        </div>
        <span class="controle-ou">ou</span>
        <div class="campo"><label for="prod-rend">Rendimento desejado</label>
          <div class="grupo"><input id="prod-rend" data-campo="prod-rend" inputmode="decimal" autocomplete="off" value="${esc(valorRend)}"${rendBase ? '' : ' disabled placeholder="—"'}><span class="grupo-txt">${esc(rec.rendimento.unidade || 'unidades')}</span></div>
          <small>${rendBase ? `Receita base = ${esc(rendimentoTxt(rendBase, rec.rendimento.unidade))} (1×)` : 'Informe o rendimento na receita para usar este campo.'}</small>
        </div>
      </div>
      <p class="so-impressao" id="prod-impressao">${impressaoHtml(rec, m)}</p>
      <div class="painel" id="prod-resultado">${resultadoHtml(rec, cfg)}</div>
      ${preparoHtml(rec, m)}
    </section>`;
  }

  function telaEscolha() {
    const lista = porNome(dados.receitas);
    const cabeca = `<div class="painel-cabeca"><div><h1>Produção</h1>
      <p class="sub">Escolha a receita e quantas vezes vai produzir. Quantidades e custos acompanham o multiplicador.</p></div></div>`;
    if (!lista.length) {
      return `<section class="painel">${cabeca}
        <div class="cartao vazio">
          <h2>Nenhuma receita para produzir</h2>
          <p class="sub">Cadastre uma receita no painel 2 e ela aparece aqui.</p>
          <button type="button" class="btn btn-primario" data-acao="ir-aba" data-aba="receitas">Ir para Receitas</button>
        </div></section>`;
    }
    return `<section class="painel">${cabeca}
      <div class="escolha">${lista.map((rec) => {
        const c = C.custoReceita(rec, dados.ingredientes);
        return `<button type="button" class="escolha-cartao" data-acao="produzir" data-id="${esc(rec.id)}">
          <h2>${esc(rec.nome)}</h2>
          <p>${rec.rendimento.qtd ? 'Rende ' + esc(rendimentoTxt(rec.rendimento.qtd, rec.rendimento.unidade)) : 'Sem rendimento informado'}</p>
          <span class="num">${esc(moeda(c.total))} por receita${c.porUnidade != null ? ' · ' + esc(moeda(c.porUnidade)) + ' cada' : ''}</span>
        </button>`;
      }).join('')}</div></section>`;
  }

  function atalhosHtml(m) {
    return ATALHOS.map((v) => `<button type="button" data-acao="atalho" data-valor="${v}" aria-pressed="${Math.abs(m - v) < 1e-9}">${esc(C.formatarNumero(v, 1))}×</button>`).join('');
  }

  function impressaoHtml(rec, m) {
    if (!Number.isFinite(m)) return '';
    const rend = rec.rendimento.qtd ? ' · ' + rendimentoTxt(rec.rendimento.qtd * m, rec.rendimento.unidade) : '';
    return esc(`Ficha de produção: ${multTxt(m)} a receita${rend} · ${new Date().toLocaleDateString('pt-BR')}`);
  }

  function resultadoHtml(rec, cfg) {
    const m = multiplicadorAtual(cfg, rec);
    if (!Number.isFinite(m)) {
      return `<div class="cartao vazio"><h2>Multiplicador inválido</h2>
        <p class="sub">Digite um número maior que zero, como 0,7 ou 2.</p></div>`;
    }
    const p = C.calcularProducao(rec, dados.ingredientes, m, cfg.ajustes);
    const custoBase = C.custoReceita(rec, dados.ingredientes).total;
    const und = rec.rendimento.unidade || 'unidades';

    const numeros = `<div class="numeros">
      <div class="numero numero-destaque"><span class="rotulo">Custo desta produção</span><strong>${esc(moeda(p.custoTotal))}</strong>
        <small>${p.temAjustes ? `${esc(moeda(p.custoMultiplicado))} ${sinal(p.custoAjustes)} ${esc(moeda(Math.abs(p.custoAjustes), true))} de ajustes` : `${esc(multTxt(m))} ${esc(moeda(custoBase))}`}</small></div>
      <div class="numero"><span class="rotulo">Custo por unidade</span><strong>${p.porUnidade != null ? esc(moeda(p.porUnidade)) : '—'}</strong>
        <small>${p.rendimento ? '÷ ' + esc(rendimentoTxt(p.rendimento, und)) : 'informe o rendimento na receita'}</small></div>
      <div class="numero"><span class="rotulo">Rendimento</span><strong>${p.rendimento ? esc(C.formatarNumero(p.rendimento, 2)) : '—'}</strong>
        <small>${esc(und)}</small></div>
    </div>`;

    const chips = cfg.ajustes.map((a) => {
      const linha = p.linhas.find((l) => l.ajuste === a);
      if (!linha || !linha.ingrediente) return '';
      return `<span class="ajuste-chip">
        <button type="button" data-acao="editar-ajuste" data-alvo="${esc(chaveAjuste(a))}">${esc(linha.ingrediente.nome)} ${esc(descricaoAjuste(linha))}</button>
        <button type="button" data-acao="remover-ajuste" data-alvo="${esc(chaveAjuste(a))}" aria-label="Remover ajuste de ${esc(linha.ingrediente.nome)}">×</button>
      </span>`;
    }).join('');

    const temAj = p.temAjustes;
    const mt = esc(multTxt(m));
    const linhas = p.linhas.map((l) => {
      const extra = l.origem === 'extra';
      const nome = l.ingrediente ? esc(l.ingrediente.nome) : '<span class="fraco">ingrediente removido</span>';
      const aj = l.ajuste
        ? `<button type="button" class="btn-ajuste-linha" data-acao="editar-ajuste" data-alvo="${esc(chaveAjuste(l.ajuste))}">${esc(descricaoAjuste(l))}</button>`
        : '<span class="fraco">—</span>';
      // Em tela estreita as colunas de detalhe somem e o detalhe vai para baixo do nome.
      const detalhe = [
        extra ? '' : `base ${qtdTxt(l.qtdBase, l.unidade)} × ${multTxt(m)}`,
        l.ajuste ? `ajuste ${descricaoAjuste(l)}` : '',
      ].filter(Boolean).join(' · ');
      return `<tr${extra ? ' class="extra"' : ''}>
        <td>${nome}${extra ? ' <span class="chip">fora da receita</span>' : ''}<small class="det-estreito">${esc(detalhe)}</small></td>
        <td class="n fraco col-det">${extra ? '—' : esc(qtdTxt(l.qtdBase, l.unidade))}</td>
        ${temAj ? `<td class="n col-det">${extra ? '—' : esc(qtdTxt(l.qtdMultiplicada, l.unidade))}</td><td class="n aj col-det">${aj}</td>` : ''}
        <td class="n usar">${esc(qtdTxt(l.qtdFinal, l.unidade))}</td>
        <td class="n">${l.custoFinal != null ? esc(moeda(l.custoFinal, true)) : '<span class="fraco">sem preço</span>'}</td>
      </tr>`;
    }).join('');

    const tabela = `<div class="rolagem"><table class="tabela">
      <thead><tr>
        <th>Ingrediente</th><th class="n col-det">Receita base</th>
        ${temAj ? `<th class="n col-det">× ${mt}</th><th class="n col-det">Ajuste</th>` : ''}
        <th class="n usar">Usar${temAj ? '' : ` (${mt})`}</th><th class="n">Custo</th>
      </tr></thead>
      <tbody>${linhas || `<tr><td class="fraco">A receita não tem ingredientes.</td><td class="col-det"${temAj ? ' colspan="3"' : ''}></td><td class="usar"></td><td></td></tr>`}</tbody>
      <tfoot><tr><td>Total</td><td class="col-det"${temAj ? ' colspan="3"' : ''}></td><td class="n usar"></td><td class="n">${esc(moeda(p.custoTotal))}</td></tr></tfoot>
    </table></div>`;

    const totais = totaisTipoTxt(p.totaisFinais);
    const totaisAntes = totaisTipoTxt(p.totaisAntes);
    return `${numeros}
      ${p.semPreco ? `<p><span class="chip chip-erro">${p.semPreco} ${plural(p.semPreco, 'ingrediente sem preço', 'ingredientes sem preço')}: custo parcial</span></p>` : ''}
      <div class="bloco-cabeca">
        <h2>Ingredientes para esta produção</h2>
        <button type="button" class="btn" data-acao="abrir-ajuste"${rec.itens.length || dados.ingredientes.length ? '' : ' disabled'}>+ Ajustar ingrediente</button>
      </div>
      ${chips ? `<div class="ajustes-lista"><span class="dica">Ajustes só desta produção (a receita não muda):</span>${chips}</div>` : ''}
      ${tabela}
      ${totais ? `<p class="totais-tipo"><span>Total de ingredientes:</span> ${totais}${temAj && totaisAntes !== totais ? ` <span>(sem ajuste: ${totaisAntes})</span>` : ''}</p>` : ''}`;
  }

  /** Texto curto do ajuste de uma linha: "+10% (+26 ml)" ou "+35 ml". */
  function descricaoAjuste(linha) {
    const a = linha.ajuste;
    const extra = sinal(linha.extra) + qtdTxt(Math.abs(linha.extra), linha.unidade);
    if (a.modo === 'pct') return `${sinal(a.valor)}${C.formatarNumero(Math.abs(a.valor), 2)}% (${extra})`;
    return extra;
  }

  function totaisTipoTxt(totais) {
    return ['massa', 'volume', 'unidade']
      .filter((t) => totais[t] > 0)
      .map((t) => `<strong>${esc(qtdTxt(totais[t], C.TIPOS[t].menor))}</strong>`)
      .join(' · ');
  }

  function preparoHtml(rec, m) {
    const o = rec.obs;
    const temObs = !!(o.tempo || o.espacoQtd || o.texto);
    if (!rec.preparo && !temObs) return '';
    return `<section class="cartao preparo">
      <h2>Modo de preparo</h2>
      ${rec.preparo ? `<div class="preparo-texto">${esc(rec.preparo)}</div>` : ''}
      ${temObs ? `<div class="obs-bloco">
        <h3>Obs</h3>
        ${o.tempo ? `<div class="obs-linha"><span>Tempo de produção</span><span>${esc(o.tempo)}</span></div>` : ''}
        ${o.espacoQtd ? `<div class="obs-linha"><span>Espaço ocupado</span><span id="prod-espaco">${espacoHtml(rec, m)}</span></div>` : ''}
        ${o.texto ? `<div class="obs-linha"><span>Observações</span><span class="preparo-texto">${esc(o.texto)}</span></div>` : ''}
      </div>` : ''}
    </section>`;
  }

  function espacoHtml(rec, m) {
    const o = rec.obs;
    const desc = esc(o.espacoDesc || '');
    const e = C.espacoNaProducao(o.espacoQtd, m);
    if (!e) return `${esc(C.formatarNumero(o.espacoQtd, 2))} ${desc} por receita`;
    const pratico = e.pratico !== e.exato ? ` <span class="dica">(na prática, ${e.pratico})</span>` : '';
    return `<strong class="num">${esc(C.formatarNumero(e.exato, 2))}</strong> ${desc}${pratico}
      <span class="dica">· ${esc(C.formatarNumero(o.espacoQtd, 2))} por receita × ${esc(C.formatarNumero(m, 4))}</span>`;
  }

  /** Atualiza os resultados sem redesenhar os campos do multiplicador. */
  function atualizarProducao(rec, cfg) {
    const m = multiplicadorAtual(cfg, rec);
    $('#prod-resultado').innerHTML = resultadoHtml(rec, cfg);
    $('#prod-atalhos').innerHTML = atalhosHtml(m);
    $('#prod-impressao').innerHTML = impressaoHtml(rec, m);
    $('#prod-mult').classList.toggle('invalido', !Number.isFinite(m));
    const espaco = $('#prod-espaco');
    if (espaco) espaco.innerHTML = espacoHtml(rec, m);
    salvarTela();
  }

  function produzir(id) {
    estado.producaoId = id;
    mudarAba('producao');
  }

  /* ---------- Diálogo de ajuste ---------- */

  function infoAlvo(rec, chave) {
    if (!chave) return null;
    const [tipo, ref] = [chave.slice(0, chave.indexOf(':')), chave.slice(chave.indexOf(':') + 1)];
    if (tipo === 'item') {
      const indice = Number(ref);
      const item = rec.itens[indice];
      if (!item) return null;
      const ing = ingrediente(item.ingredienteId);
      return { alvo: 'item', indice, ingrediente: ing, unidade: item.unidade, tipo: C.tipoDaUnidade(item.unidade) };
    }
    const ing = ingrediente(ref);
    if (!ing) return null;
    return { alvo: 'extra', ingredienteId: ing.id, ingrediente: ing, unidade: C.TIPOS[ing.tipo].menor, tipo: ing.tipo };
  }

  function abrirAjuste(chave) {
    const rec = receita(estado.producaoId);
    if (!rec) return;
    const cfg = configProducao(rec.id);
    if (!Number.isFinite(multiplicadorAtual(cfg, rec))) {
      avisar('Corrija o multiplicador antes de ajustar.');
      return;
    }
    const existente = chave ? cfg.ajustes.find((a) => chaveAjuste(a) === chave) : null;
    let alvo = chave;
    if (!alvo) {
      if (rec.itens.length) alvo = 'item:0';
      else if (dados.ingredientes.length) alvo = 'extra:' + porNome(dados.ingredientes)[0].id;
    }
    const info = infoAlvo(rec, alvo);
    if (!info) return;
    estado.ajuste = {
      alvo,
      modo: info.alvo === 'extra' ? 'qtd' : existente ? existente.modo : 'pct',
      valor: existente ? C.formatarCampo(existente.valor) : '',
      unidade: existente && existente.unidade ? existente.unidade : info.unidade,
      editando: !!existente,
    };
    renderDialogoAjuste();
    abrirDialogo('#dlg-ajuste');
    $('#aj-valor').focus();
  }

  function renderDialogoAjuste() {
    const a = estado.ajuste;
    const rec = receita(estado.producaoId);
    if (!a || !rec) return;
    const cfg = configProducao(rec.id);
    const m = multiplicadorAtual(cfg, rec);
    const info = infoAlvo(rec, a.alvo);
    const naReceita = new Set(rec.itens.map((it) => it.ingredienteId));
    const fora = porNome(dados.ingredientes).filter((i) => !naReceita.has(i.id));
    const opcoesReceita = rec.itens.map((it, i) => {
      const ing = ingrediente(it.ingredienteId);
      const chave = 'item:' + i;
      return `<option value="${chave}"${a.alvo === chave ? ' selected' : ''}>${esc(ing ? ing.nome : 'ingrediente removido')} · ${esc(qtdTxt(it.qtd * m, it.unidade))}</option>`;
    }).join('');
    const opcoesFora = fora.map((i) => {
      const chave = 'extra:' + i.id;
      return `<option value="${esc(chave)}"${a.alvo === chave ? ' selected' : ''}>${esc(i.nome)}</option>`;
    }).join('');
    const extra = info && info.alvo === 'extra';
    const unidades = info ? C.unidadesDoTipo(info.tipo) : [];
    const html = `<form class="dlg-form" data-form="ajuste" novalidate>
      <header class="dlg-cabeca">
        <h2 id="dlg-ajuste-titulo">${a.editando ? 'Editar ajuste' : 'Ajustar ingrediente'}</h2>
        <button type="button" class="icone" data-acao="fechar-dialogo" aria-label="Fechar">×</button>
      </header>
      <div class="dlg-corpo">
        <p class="dica">Vale só para esta produção de ${esc(rec.nome)} (${esc(multTxt(m))}). A receita salva não muda.</p>
        <label class="campo"><span>Ingrediente</span>
          <select id="aj-alvo" data-aj="alvo"${a.editando ? ' disabled' : ''}>
            ${opcoesReceita ? `<optgroup label="Na receita">${opcoesReceita}</optgroup>` : ''}
            ${opcoesFora ? `<optgroup label="Fora da receita (acrescentar)">${opcoesFora}</optgroup>` : ''}
          </select></label>
        <fieldset class="campo"><legend>Tipo de acréscimo</legend>
          <div class="segmentos">
            <label><input type="radio" name="aj-modo" id="aj-modo-pct" data-aj="modo" value="pct"${a.modo === 'pct' ? ' checked' : ''}${extra ? ' disabled' : ''}><span>% sobre a quantidade</span></label>
            <label><input type="radio" name="aj-modo" id="aj-modo-qtd" data-aj="modo" value="qtd"${a.modo === 'qtd' ? ' checked' : ''}><span>Quantidade por receita base</span></label>
          </div>
          ${extra ? '<small>Ingrediente fora da receita entra por quantidade.</small>' : ''}
        </fieldset>
        <div class="campo"><label for="aj-valor">${a.modo === 'pct' ? 'Acréscimo em %' : 'Acréscimo por receita base'}</label>
          <div class="grupo"><input id="aj-valor" data-aj="valor" inputmode="decimal" autocomplete="off" value="${esc(a.valor)}" placeholder="${a.modo === 'pct' ? '10' : '50'}">${a.modo === 'pct'
            ? '<span class="grupo-txt">%</span>'
            : `<select id="aj-unidade" data-aj="unidade" aria-label="Unidade">${unidades.map((u) => `<option${u === a.unidade ? ' selected' : ''}>${u}</option>`).join('')}</select>`}</div>
          <small>${a.modo === 'pct'
            ? 'Incide sobre a quantidade já multiplicada.'
            : `É multiplicado junto com a receita: em ${esc(multTxt(m))}, 50 vira ${esc(C.formatarNumero(50 * m, 2))}.`} Para reduzir, use valor negativo.</small>
        </div>
        <div class="calc-caixa" id="aj-previa">${previaAjusteHtml()}</div>
        <p class="erro-msg" id="aj-erro" hidden></p>
      </div>
      <footer class="dlg-rodape">
        ${a.editando ? '<button type="button" class="btn btn-perigo esquerda" data-acao="remover-ajuste-dialogo">Remover ajuste</button>' : ''}
        <button type="button" class="btn" data-acao="fechar-dialogo">Cancelar</button>
        <button type="submit" class="btn btn-primario">Aplicar ajuste</button>
      </footer>
    </form>`;
    manterFoco(() => {
      $('#dlg-ajuste').innerHTML = html;
    });
  }

  function ajusteDoRascunho(rec) {
    const a = estado.ajuste;
    const info = infoAlvo(rec, a.alvo);
    const valor = num(a.valor);
    if (!info || !Number.isFinite(valor) || valor === 0) return null;
    if (info.alvo === 'item') {
      return a.modo === 'pct'
        ? { alvo: 'item', indice: info.indice, modo: 'pct', valor }
        : { alvo: 'item', indice: info.indice, modo: 'qtd', valor, unidade: a.unidade };
    }
    return { alvo: 'extra', ingredienteId: info.ingredienteId, modo: 'qtd', valor, unidade: a.unidade };
  }

  /** Simula a produção com e sem o ajuste para mostrar o efeito antes de aplicar. */
  function simularAjuste(rec, novo) {
    const cfg = configProducao(rec.id);
    const m = multiplicadorAtual(cfg, rec);
    const outros = cfg.ajustes.filter((x) => chaveAjuste(x) !== chaveAjuste(novo));
    const antes = C.calcularProducao(rec, dados.ingredientes, m, outros);
    const depois = C.calcularProducao(rec, dados.ingredientes, m, [...outros, novo]);
    const linha = depois.linhas.find((l) => l.ajuste === novo);
    return { m, outros, antes, depois, linha };
  }

  function previaAjusteHtml() {
    const rec = receita(estado.producaoId);
    const novo = rec && ajusteDoRascunho(rec);
    if (!novo) return '<span class="vazio-calc">Digite o acréscimo para ver o cálculo.</span>';
    const { m, antes, depois, linha } = simularAjuste(rec, novo);
    if (!linha) return '';
    const u = linha.unidade;
    const partes = [];
    if (linha.origem === 'receita') {
      partes.push(`<span>${esc(linha.ingrediente ? linha.ingrediente.nome : 'Ingrediente')}: ${esc(qtdTxt(linha.qtdBase, u))} × ${esc(multTxt(m))} = ${esc(qtdTxt(linha.qtdMultiplicada, u))}</span>`);
    }
    const extraTxt = sinal(linha.extra) + qtdTxt(Math.abs(linha.extra), u);
    if (novo.modo === 'pct') {
      partes.push(`<span>${sinal(novo.valor)}${esc(C.formatarNumero(Math.abs(novo.valor), 2))}% = ${esc(extraTxt)}</span>`);
    } else {
      partes.push(`<span>${sinal(novo.valor)}${esc(qtdTxt(Math.abs(novo.valor), novo.unidade))} por receita × ${esc(multTxt(m))} = ${esc(extraTxt)}</span>`);
    }
    partes.push(`<span>Usar: <strong>${esc(qtdTxt(linha.qtdFinal, u))}</strong></span>`);
    if (linha.qtdFinal < 0) partes.push('<span class="erro-msg">A redução passa da quantidade da receita.</span>');
    partes.push(`<span>Custo do ajuste: ${linha.custoExtra != null ? sinal(linha.custoExtra) + esc(moeda(Math.abs(linha.custoExtra), true)) : 'sem preço'}</span>`);
    partes.push(`<span>Custo da produção: ${esc(moeda(antes.custoTotal))} → <strong>${esc(moeda(depois.custoTotal))}</strong></span>`);
    if (depois.porUnidade != null) {
      partes.push(`<span>Por unidade: ${esc(moeda(antes.porUnidade))} → <strong>${esc(moeda(depois.porUnidade))}</strong></span>`);
    }
    return partes.join('');
  }

  function aplicarAjuste() {
    const rec = receita(estado.producaoId);
    if (!rec || !estado.ajuste) return;
    const novo = ajusteDoRascunho(rec);
    const erro = $('#aj-erro');
    if (!novo) {
      erro.textContent = 'Digite um valor diferente de zero.';
      erro.hidden = false;
      $('#aj-valor').classList.add('invalido');
      $('#aj-valor').focus();
      return;
    }
    const { outros, linha } = simularAjuste(rec, novo);
    if (!linha || linha.qtdFinal < 0) {
      erro.textContent = 'A redução passa da quantidade da receita.';
      erro.hidden = false;
      return;
    }
    const cfg = configProducao(rec.id);
    cfg.ajustes = [...outros, novo];
    estado.ajuste = null;
    fecharDialogo('#dlg-ajuste');
    atualizarProducao(rec, cfg);
    avisar('Ajuste aplicado a esta produção');
  }

  function removerAjuste(chave) {
    const rec = receita(estado.producaoId);
    if (!rec) return;
    const cfg = configProducao(rec.id);
    cfg.ajustes = cfg.ajustes.filter((a) => chaveAjuste(a) !== chave);
    atualizarProducao(rec, cfg);
    avisar('Ajuste removido');
  }

  /* =====================================================================
   * Dados e backup
   * ===================================================================== */

  function abrirDados() {
    const ni = dados.ingredientes.length;
    const nr = dados.receitas.length;
    $('#dlg-dados').innerHTML = `<div class="dlg-form">
      <header class="dlg-cabeca">
        <h2 id="dlg-dados-titulo">Dados e backup</h2>
        <button type="button" class="icone" data-acao="fechar-dialogo" aria-label="Fechar">×</button>
      </header>
      <div class="dlg-corpo">
        <p class="sub">Os dados ficam salvos só neste navegador, neste aparelho: ${ni} ${plural(ni, 'ingrediente', 'ingredientes')} e ${nr} ${plural(nr, 'receita', 'receitas')}. Baixe um backup de vez em quando; ele também serve para levar os dados para outro aparelho.</p>
        <div class="opcoes-dados">
          <button type="button" class="btn so-local" data-acao="exportar">Baixar backup (.json)</button>
          <button type="button" class="btn" data-acao="importar">Importar backup…</button>
          <input type="file" id="arquivo-backup" accept=".json,application/json" data-campo="importar" hidden>
          ${temExemplos()
            ? '<button type="button" class="btn" data-acao="apagar-exemplos">Apagar dados de exemplo</button>'
            : '<button type="button" class="btn" data-acao="carregar-exemplo">Carregar o exemplo do croissant</button>'}
          <button type="button" class="btn btn-perigo" data-acao="apagar-tudo">Apagar todos os dados</button>
        </div>
      </div>
    </div>`;
    abrirDialogo('#dlg-dados');
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receitas-com-custo-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avisar('Backup baixado');
  }

  function importar(arquivo) {
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = async () => {
      let novos;
      try {
        novos = D.validar(JSON.parse(String(leitor.result)));
      } catch (erro) {
        avisar(erro instanceof SyntaxError ? 'O arquivo não é um backup válido (JSON com erro).' : erro.message);
        return;
      }
      const ok = await confirmar({
        titulo: 'Substituir os dados atuais?',
        texto: `O backup tem ${novos.ingredientes.length} ingredientes e ${novos.receitas.length} receitas. Os dados atuais deste navegador (${dados.ingredientes.length} ingredientes e ${dados.receitas.length} receitas) serão substituídos.`,
        botao: 'Substituir',
        perigo: true,
      });
      if (!ok) return;
      substituirDados(novos);
      avisar('Backup importado');
    };
    leitor.onerror = () => avisar('Não foi possível ler o arquivo.');
    leitor.readAsText(arquivo);
  }

  function substituirDados(novos) {
    dados = novos;
    estado.receita = null;
    estado.mensal = null;
    estado.producao = {};
    estado.producaoId = dados.receitas.length ? porNome(dados.receitas)[0].id : null;
    salvarDados();
    salvarTela();
    fecharDialogo('#dlg-dados');
    render();
  }

  async function apagarExemplos() {
    const ok = await confirmar({
      titulo: 'Apagar dados de exemplo?',
      texto: 'Saem a receita e os ingredientes marcados como exemplo. O que você criou ou editou continua.',
      botao: 'Apagar exemplos',
      perigo: true,
    });
    if (!ok) return;
    dados.receitas = dados.receitas.filter((r) => !r.exemplo);
    const usados = new Set(dados.receitas.flatMap((r) => r.itens.map((it) => it.ingredienteId)));
    if (estado.receita) estado.receita.itens.forEach((it) => usados.add(it.ingredienteId));
    dados.ingredientes = dados.ingredientes.filter((i) => !i.exemplo || usados.has(i.id));
    for (const id of Object.keys(estado.producao)) if (!receita(id)) delete estado.producao[id];
    if (estado.producaoId && !receita(estado.producaoId)) estado.producaoId = null;
    salvarDados();
    salvarTela();
    fecharDialogo('#dlg-dados');
    render();
    avisar('Exemplos apagados');
  }

  function carregarExemplo() {
    const ex = D.exemplo(MES_ATUAL);
    const idsEx = new Set([...ex.ingredientes, ...ex.receitas].map((x) => x.id));
    dados.ingredientes = dados.ingredientes.filter((i) => !idsEx.has(i.id)).concat(ex.ingredientes);
    dados.receitas = dados.receitas.filter((r) => !idsEx.has(r.id)).concat(ex.receitas);
    salvarDados();
    fecharDialogo('#dlg-dados');
    render();
    avisar('Exemplo do croissant carregado');
  }

  async function apagarTudo() {
    const ok = await confirmar({
      titulo: 'Apagar todos os dados?',
      texto: 'Todos os ingredientes, preços e receitas deste navegador serão apagados. Se quiser guardar, baixe um backup antes.',
      botao: 'Apagar tudo',
      perigo: true,
    });
    if (!ok) return;
    substituirDados(D.vazio());
    avisar('Dados apagados');
  }

  /* =====================================================================
   * Eventos
   * ===================================================================== */

  function itemDaChave(chave) {
    return estado.receita ? estado.receita.itens.find((it) => it.chave === chave) : null;
  }

  document.addEventListener('click', (e) => {
    const aba = e.target.closest('a.aba');
    if (aba) {
      e.preventDefault();
      mudarAba(aba.dataset.aba);
      return;
    }
    const el = e.target.closest('[data-acao]');
    if (!el || el.disabled) return;
    const id = el.dataset.id;
    switch (el.dataset.acao) {
      case 'ir-aba': mudarAba(el.dataset.aba); break;
      case 'fechar-dialogo': {
        const d = el.closest('dialog');
        if (d) d.close();
        break;
      }

      // Ingredientes
      case 'novo-ingrediente': abrirIngrediente(null); break;
      case 'editar-ingrediente': abrirIngrediente(id); break;
      case 'excluir-ingrediente': excluirIngrediente(); break;
      case 'remover-registro': {
        const r = estado.ingrediente;
        r.precos = r.precos.filter((p) => p.mes !== el.dataset.mes);
        renderDialogoIngrediente();
        break;
      }
      case 'abrir-mensal': abrirMensal(); break;
      case 'fechar-mensal': estado.mensal = null; render(); break;
      case 'salvar-mensal': salvarMensal(); break;
      case 'manter-preco': manterPreco(id); break;

      // Receitas
      case 'nova-receita': abrirEditor(null); break;
      case 'editar-receita': abrirEditor(id); break;
      case 'duplicar-receita': duplicarReceita(id); break;
      case 'excluir-receita': excluirReceita(id); break;
      case 'cancelar-receita': cancelarReceita(); break;
      case 'salvar-receita': salvarReceita(); break;
      case 'adicionar-item': {
        const novo = itemVazio();
        estado.receita.itens.push(novo);
        estado.receita.alterado = true;
        redesenharItens();
        document.getElementById('item-ing-' + novo.chave).focus();
        break;
      }
      case 'remover-item': {
        const r = estado.receita;
        r.itens = r.itens.filter((it) => it.chave !== el.dataset.chave);
        r.alterado = true;
        redesenharItens();
        break;
      }

      // Produção
      case 'produzir': produzir(id); break;
      case 'trocar-receita': estado.producaoId = null; salvarTela(); render(); break;
      case 'atalho': {
        const rec = receita(estado.producaoId);
        const cfg = configProducao(rec.id);
        cfg.mult = C.formatarCampo(Number(el.dataset.valor));
        cfg.rend = null;
        $('#prod-mult').value = cfg.mult;
        const rend = $('#prod-rend');
        if (rend && rec.rendimento.qtd) rend.value = C.formatarCampo(arred(rec.rendimento.qtd * Number(el.dataset.valor), 3));
        atualizarProducao(rec, cfg);
        break;
      }
      case 'abrir-ajuste': abrirAjuste(null); break;
      case 'editar-ajuste': abrirAjuste(el.dataset.alvo); break;
      case 'remover-ajuste': removerAjuste(el.dataset.alvo); break;
      case 'remover-ajuste-dialogo': {
        const chave = estado.ajuste && estado.ajuste.alvo;
        estado.ajuste = null;
        fecharDialogo('#dlg-ajuste');
        if (chave) removerAjuste(chave);
        break;
      }
      case 'imprimir': window.print(); break;

      // Dados
      case 'abrir-dados': abrirDados(); break;
      case 'exportar': exportar(); break;
      case 'importar': $('#arquivo-backup').click(); break;
      case 'apagar-exemplos': apagarExemplos(); break;
      case 'carregar-exemplo': carregarExemplo(); break;
      case 'apagar-tudo': apagarTudo(); break;
      default: break;
    }
  });

  // Campos de texto: atualizam o rascunho e só os números calculados.
  document.addEventListener('input', (e) => {
    const alvo = e.target;
    if (alvo.tagName === 'SELECT' || alvo.type === 'radio' || alvo.type === 'file') return;
    const d = alvo.dataset;
    alvo.classList.remove('invalido');

    if (d.campo === 'busca') {
      estado.busca = alvo.value;
      $('#lista-ingredientes').innerHTML = linhasIngredientes();
    } else if (d.campo === 'mensal-valor' && estado.mensal) {
      estado.mensal.valores[d.id] = alvo.value;
      delete estado.mensal.erros[d.id];
      $('#mensal-var-' + CSS.escape(d.id)).innerHTML = variacaoMensalHtml(ingrediente(d.id), estado.mensal.mes);
      $('#mensal-resumo').innerHTML = resumoMensal();
    } else if (d.rec && estado.receita) {
      estado.receita[d.rec] = alvo.value;
      estado.receita.alterado = true;
      delete estado.receita.erros[d.rec];
      if (d.rec === 'rendQtd' || d.rec === 'rendUnidade') atualizarCalculosEditor();
    } else if (d.item === 'qtd') {
      const item = itemDaChave(d.chave);
      if (!item) return;
      item.qtd = alvo.value;
      estado.receita.alterado = true;
      delete estado.receita.erros['item-' + d.chave];
      atualizarCalculosEditor();
    } else if (d.ing && estado.ingrediente) {
      estado.ingrediente[d.ing] = alvo.value;
      if (d.ing !== 'nome') {
        estado.ingrediente.precoAlterado = true;
        $('#ing-calc').innerHTML = calcIngredienteHtml();
      }
      $('#ing-erro').hidden = true;
    } else if (d.aj === 'valor' && estado.ajuste) {
      estado.ajuste.valor = alvo.value;
      $('#aj-erro').hidden = true;
      $('#aj-previa').innerHTML = previaAjusteHtml();
    } else if (d.campo === 'prod-mult' || d.campo === 'prod-rend') {
      const rec = receita(estado.producaoId);
      if (!rec) return;
      const cfg = configProducao(rec.id);
      if (d.campo === 'prod-mult') {
        cfg.mult = alvo.value;
        cfg.rend = null;
        const m = multiplicadorAtual(cfg, rec);
        const rend = $('#prod-rend');
        if (rend && rec.rendimento.qtd) rend.value = Number.isFinite(m) ? C.formatarCampo(arred(rec.rendimento.qtd * m, 3)) : '';
      } else {
        cfg.rend = alvo.value;
        const m = multiplicadorAtual(cfg, rec);
        if (Number.isFinite(m)) {
          cfg.mult = C.formatarCampo(arred(m, 4));
          $('#prod-mult').value = cfg.mult;
        }
        alvo.classList.toggle('invalido', !Number.isFinite(m));
      }
      atualizarProducao(rec, cfg);
    }
  });

  // Listas, botões de opção e arquivos.
  document.addEventListener('change', (e) => {
    const alvo = e.target;
    const d = alvo.dataset;

    if (d.campo === 'mensal-mes' && estado.mensal) {
      estado.mensal.mes = alvo.value;
      preencherMensal();
      render();
    } else if (d.campo === 'importar') {
      importar(alvo.files && alvo.files[0]);
      alvo.value = '';
    } else if (d.item === 'ingredienteId') {
      const item = itemDaChave(d.chave);
      if (!item) return;
      if (alvo.value === '__novo') {
        alvo.value = item.ingredienteId;
        abrirIngrediente(null, { chave: item.chave });
        return;
      }
      item.ingredienteId = alvo.value;
      const ing = ingrediente(alvo.value);
      if (ing && C.tipoDaUnidade(item.unidade) !== ing.tipo) item.unidade = C.TIPOS[ing.tipo].menor;
      estado.receita.alterado = true;
      delete estado.receita.erros['item-' + d.chave];
      redesenharItens();
    } else if (d.item === 'unidade') {
      const item = itemDaChave(d.chave);
      if (!item) return;
      item.unidade = alvo.value;
      estado.receita.alterado = true;
      atualizarCalculosEditor();
    } else if (d.ing && estado.ingrediente) {
      const r = estado.ingrediente;
      if (d.ing === 'tipo') {
        r.tipo = alvo.value;
        r.embUnidade = C.TIPOS[r.tipo].base;
        renderDialogoIngrediente();
      } else if (d.ing === 'modo') {
        r.modo = alvo.value;
        r.precoAlterado = true;
        renderDialogoIngrediente();
      } else if (d.ing === 'embUnidade' || d.ing === 'mes') {
        r[d.ing] = alvo.value;
        r.precoAlterado = true;
        $('#ing-calc').innerHTML = calcIngredienteHtml();
      }
    } else if (d.aj && estado.ajuste) {
      const a = estado.ajuste;
      if (d.aj === 'alvo') {
        const rec = receita(estado.producaoId);
        const info = infoAlvo(rec, alvo.value);
        a.alvo = alvo.value;
        if (info) {
          a.unidade = info.unidade;
          if (info.alvo === 'extra') a.modo = 'qtd';
        }
        renderDialogoAjuste();
      } else if (d.aj === 'modo') {
        a.modo = alvo.value;
        renderDialogoAjuste();
      } else if (d.aj === 'unidade') {
        a.unidade = alvo.value;
        $('#aj-previa').innerHTML = previaAjusteHtml();
      }
    }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const formulario = e.target.dataset.form;
    if (formulario === 'ingrediente') salvarIngrediente();
    else if (formulario === 'ajuste') aplicarAjuste();
  });

  window.addEventListener('hashchange', () => {
    const aba = location.hash.slice(1);
    if (ABAS.includes(aba) && aba !== estado.aba) mudarAba(aba);
  });

  $('#dlg-ingrediente').addEventListener('close', () => { estado.ingrediente = null; });
  $('#dlg-ajuste').addEventListener('close', () => { estado.ajuste = null; });

  /* ---------- Início ---------- */

  if (primeiraVisita && !estado.producaoId && dados.receitas.length) estado.producaoId = dados.receitas[0].id;
  $('#marca-mes').textContent = 'Mês de referência: ' + C.nomeMes(MES_ATUAL);
  atualizarFaixas();
  render();
  salvarTela();
})();
