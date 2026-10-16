/*
 * Receitas com Custo — cálculos.
 * Funções puras (sem tela e sem armazenamento), usadas pelo app no navegador
 * e pelos testes no Node.
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Calculos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Unidades ---------- */

  // Cada tipo tem uma unidade base (usada no preço) e fatores de conversão para ela.
  const TIPOS = {
    massa: { nome: 'Peso', base: 'kg', menor: 'g', unidades: { g: 0.001, kg: 1 } },
    volume: { nome: 'Volume', base: 'L', menor: 'ml', unidades: { ml: 0.001, L: 1 } },
    unidade: { nome: 'Unidade', base: 'un', menor: 'un', unidades: { un: 1 } },
  };

  function tipoDaUnidade(unidade) {
    for (const [tipo, def] of Object.entries(TIPOS)) {
      if (Object.prototype.hasOwnProperty.call(def.unidades, unidade)) return tipo;
    }
    return null;
  }

  function unidadesDoTipo(tipo) {
    return TIPOS[tipo] ? Object.keys(TIPOS[tipo].unidades) : [];
  }

  /** Converte uma quantidade para a unidade base do seu tipo (kg, L ou un). */
  function paraBase(qtd, unidade) {
    const tipo = tipoDaUnidade(unidade);
    if (!tipo || !Number.isFinite(qtd)) return NaN;
    return qtd * TIPOS[tipo].unidades[unidade];
  }

  /** Converte entre unidades do mesmo tipo (g ↔ kg, ml ↔ L). NaN se incompatíveis. */
  function converter(qtd, de, para) {
    const tipo = tipoDaUnidade(de);
    if (!tipo || tipo !== tipoDaUnidade(para)) return NaN;
    return paraBase(qtd, de) / TIPOS[tipo].unidades[para];
  }

  /* ---------- Números (formato brasileiro) ---------- */

  /**
   * Lê um número digitado no padrão brasileiro: "0,7", "1.250,5", "R$ 6,50".
   * Ponto sozinho seguido de exatamente 3 dígitos é separador de milhar ("1.250" = 1250);
   * nos demais casos o ponto é decimal ("1.5" = 1,5).
   */
  function parseNumero(valor) {
    if (typeof valor === 'number') return valor;
    if (valor == null) return NaN;
    let s = String(valor).replace(/\s/g, '').replace(/^R\$/i, '');
    if (!s) return NaN;
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      const pontos = (s.match(/\./g) || []).length;
      if (pontos > 1 || /^[-+]?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    }
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  /** Aceita número ou texto; devolve número (ou NaN). */
  function numero(valor) {
    return typeof valor === 'number' ? valor : parseNumero(valor);
  }

  const formatadores = new Map();
  function formatador(chave, opcoes) {
    if (!formatadores.has(chave)) formatadores.set(chave, new Intl.NumberFormat('pt-BR', opcoes));
    return formatadores.get(chave);
  }

  function formatarNumero(n, maxDecimais = 2) {
    if (!Number.isFinite(n)) return '—';
    return formatador('n' + maxDecimais, { maximumFractionDigits: maxDecimais }).format(n);
  }

  /** Número para preencher um campo: sem separador de milhar, vírgula decimal. */
  function formatarCampo(n) {
    if (!Number.isFinite(n)) return '';
    return formatador('campo', { maximumFractionDigits: 6, useGrouping: false }).format(n);
  }

  /** Valor em reais. Com `preciso`, valores pequenos (< R$ 0,10) ganham 4 casas: R$ 0,0072. */
  function formatarMoeda(valor, preciso = false) {
    if (!Number.isFinite(valor)) return '—';
    const casas = preciso && valor !== 0 && Math.abs(valor) < 0.1 ? 4 : 2;
    return formatador('brl' + casas, {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    }).format(valor);
  }

  /** Fração como percentual com sinal: 0.045 → "+4,5%". */
  function formatarVariacao(fracao) {
    if (!Number.isFinite(fracao)) return '—';
    const pct = fracao * 100;
    const texto = formatarNumero(Math.abs(pct), 1) + '%';
    if (Math.abs(pct) < 0.05) return '0%';
    return (pct > 0 ? '+' : '−') + texto;
  }

  /** Casas decimais adequadas para exibir uma quantidade na unidade dada. */
  function casasDaUnidade(unidade) {
    if (unidade === 'kg' || unidade === 'L') return 3;
    if (unidade === 'un') return 2;
    return 1;
  }

  function formatarQuantidade(qtd, unidade) {
    if (!Number.isFinite(qtd)) return '—';
    return formatarNumero(qtd, casasDaUnidade(unidade)) + ' ' + unidade;
  }

  /* ---------- Meses ---------- */

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
    'setembro', 'outubro', 'novembro', 'dezembro'];

  function mesDe(data) {
    return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0');
  }

  function mesValido(mes) {
    return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  }

  function deslocarMes(mes, delta) {
    const [ano, m] = mes.split('-').map(Number);
    const total = ano * 12 + (m - 1) + delta;
    return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
  }

  /** "2026-10" → "outubro/2026" (ou "out/26" com `curto`). */
  function nomeMes(mes, curto = false) {
    if (!mesValido(mes)) return '';
    const [ano, m] = mes.split('-');
    const nome = MESES[Number(m) - 1];
    return curto ? nome.slice(0, 3) + '/' + ano.slice(2) : nome + '/' + ano;
  }

  /** Lista de meses, do mais recente para o mais antigo. */
  function listaMeses(referencia, antes = 24, depois = 1) {
    const lista = [];
    for (let d = depois; d >= -antes; d--) lista.push(deslocarMes(referencia, d));
    return lista;
  }

  /* ---------- Preços dos ingredientes ---------- */

  /**
   * Preço por unidade base (R$/kg, R$/L ou R$/un) a partir de como foi informado:
   *   { tipo: 'direto', preco: 6.5 }                                  → 6,50/kg
   *   { tipo: 'embalagem', preco: 120, qtd: 25, unidade: 'kg' }       → 4,80/kg
   */
  function precoPorBase(entrada) {
    if (!entrada) return null;
    const preco = numero(entrada.preco);
    if (!Number.isFinite(preco) || preco < 0) return null;
    if (entrada.tipo === 'embalagem') {
      const qtdBase = paraBase(numero(entrada.qtd), entrada.unidade);
      if (!(qtdBase > 0)) return null;
      return preco / qtdBase;
    }
    return preco;
  }

  /** Registros de preço em ordem cronológica. */
  function historico(ingrediente) {
    return [...((ingrediente && ingrediente.precos) || [])].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  function registroAtual(ingrediente) {
    const h = historico(ingrediente);
    return h.length ? h[h.length - 1] : null;
  }

  /** Último registro anterior ao mês dado. */
  function registroAnterior(ingrediente, mes) {
    const h = historico(ingrediente).filter((r) => r.mes < mes);
    return h.length ? h[h.length - 1] : null;
  }

  function registroDoMes(ingrediente, mes) {
    return historico(ingrediente).find((r) => r.mes === mes) || null;
  }

  function precoAtual(ingrediente) {
    const r = registroAtual(ingrediente);
    return r ? precoPorBase(r.entrada) : null;
  }

  /** Variação do preço atual em relação ao registro anterior (fração), ou null. */
  function variacaoAtual(ingrediente) {
    const atual = registroAtual(ingrediente);
    if (!atual) return null;
    const anterior = registroAnterior(ingrediente, atual.mes);
    return variacao(precoPorBase(atual.entrada), anterior ? precoPorBase(anterior.entrada) : null);
  }

  function variacao(novo, antigo) {
    if (!Number.isFinite(novo) || !Number.isFinite(antigo) || antigo === 0) return null;
    return novo / antigo - 1;
  }

  /** 'sem-preco' | 'atualizado' (tem preço do mês de referência ou depois) | 'pendente'. */
  function statusPreco(ingrediente, mesReferencia) {
    const r = registroAtual(ingrediente);
    if (!r || precoPorBase(r.entrada) == null) return 'sem-preco';
    return r.mes >= mesReferencia ? 'atualizado' : 'pendente';
  }

  /** Inclui ou substitui o registro do mês. Devolve a nova lista (não altera a original). */
  function registrarPreco(precos, mes, entrada) {
    const lista = (precos || []).filter((r) => r.mes !== mes);
    lista.push({ mes, entrada });
    return lista.sort((a, b) => a.mes.localeCompare(b.mes));
  }

  /* ---------- Receitas ---------- */

  function indexar(ingredientes) {
    const mapa = new Map();
    for (const ing of ingredientes || []) mapa.set(ing.id, ing);
    return mapa;
  }

  /** Custo de uma quantidade numa unidade, dado o preço por unidade base. */
  function custoDe(qtd, unidade, precoBase) {
    if (precoBase == null) return null;
    const base = paraBase(qtd, unidade);
    return Number.isFinite(base) ? base * precoBase : null;
  }

  /**
   * Custo de cada linha e total da receita.
   * Aceita quantidades como número ou como texto digitado (rascunho do editor).
   */
  function custoReceita(receita, ingredientes) {
    const mapa = indexar(ingredientes);
    const linhas = ((receita && receita.itens) || []).map((item) => {
      const ingrediente = mapa.get(item.ingredienteId) || null;
      const qtd = numero(item.qtd);
      const precoBase = ingrediente ? precoAtual(ingrediente) : null;
      return { item, ingrediente, qtd, precoBase, custo: custoDe(qtd, item.unidade, precoBase) };
    });
    const total = linhas.reduce((s, l) => s + (l.custo || 0), 0);
    const semPreco = linhas.filter((l) => l.ingrediente && l.precoBase == null).length;
    const rendimento = numero(receita && receita.rendimento && receita.rendimento.qtd);
    return {
      linhas,
      total,
      semPreco,
      porUnidade: rendimento > 0 ? total / rendimento : null,
    };
  }

  /* ---------- Produção ---------- */

  /** Multiplicador necessário para chegar ao rendimento desejado. */
  function multiplicadorParaRendimento(rendimentoBase, desejado) {
    const base = numero(rendimentoBase);
    const alvo = numero(desejado);
    if (!(base > 0) || !Number.isFinite(alvo)) return NaN;
    return alvo / base;
  }

  /**
   * Quantidade extra de um ajuste, na unidade da linha.
   *   modo 'pct': percentual sobre a quantidade já multiplicada.
   *   modo 'qtd': quantidade por receita base, multiplicada junto com a receita.
   */
  function quantidadeDoAjuste(ajuste, qtdMultiplicada, multiplicador, unidadeLinha) {
    const valor = numero(ajuste.valor);
    if (!Number.isFinite(valor)) return 0;
    if (ajuste.modo === 'pct') return Number.isFinite(qtdMultiplicada) ? (qtdMultiplicada * valor) / 100 : 0;
    const naLinha = converter(valor, ajuste.unidade, unidadeLinha);
    return Number.isFinite(naLinha) ? naLinha * multiplicador : 0;
  }

  /**
   * Ficha de produção: receita × multiplicador, mais ajustes que valem só para esta produção.
   *
   * Ajustes:
   *   { alvo: 'item', indice, modo: 'pct' | 'qtd', valor, unidade }   linha da receita
   *   { alvo: 'extra', ingredienteId, modo: 'qtd', valor, unidade }   ingrediente fora da receita
   */
  function calcularProducao(receita, ingredientes, multiplicador, ajustes = []) {
    const mapa = indexar(ingredientes);
    const m = numero(multiplicador);
    const linhas = [];

    ((receita && receita.itens) || []).forEach((item, indice) => {
      const ingrediente = mapa.get(item.ingredienteId) || null;
      const precoBase = ingrediente ? precoAtual(ingrediente) : null;
      const qtdBase = numero(item.qtd);
      const qtdMultiplicada = qtdBase * m;
      const ajuste = ajustes.find((a) => a.alvo === 'item' && a.indice === indice) || null;
      const extra = ajuste ? quantidadeDoAjuste(ajuste, qtdMultiplicada, m, item.unidade) : 0;
      linhas.push(montarLinha({
        origem: 'receita', indice, ingrediente, unidade: item.unidade, precoBase,
        qtdBase, qtdMultiplicada, extra, ajuste,
      }));
    });

    for (const ajuste of ajustes) {
      if (ajuste.alvo !== 'extra') continue;
      const ingrediente = mapa.get(ajuste.ingredienteId);
      if (!ingrediente) continue;
      const extra = quantidadeDoAjuste({ ...ajuste, modo: 'qtd' }, 0, m, ajuste.unidade);
      linhas.push(montarLinha({
        origem: 'extra', indice: null, ingrediente, unidade: ajuste.unidade,
        precoBase: precoAtual(ingrediente), qtdBase: 0, qtdMultiplicada: 0, extra, ajuste,
      }));
    }

    const soma = (campo) => linhas.reduce((s, l) => s + (l[campo] || 0), 0);
    const custoMultiplicado = soma('custoMultiplicado');
    const custoAjustes = soma('custoExtra');
    const custoTotal = custoMultiplicado + custoAjustes;
    const rendimentoBase = numero(receita && receita.rendimento && receita.rendimento.qtd);
    const rendimento = rendimentoBase > 0 ? rendimentoBase * m : null;

    return {
      multiplicador: m,
      linhas,
      temAjustes: linhas.some((l) => l.ajuste),
      custoMultiplicado,
      custoAjustes,
      custoTotal,
      rendimento,
      porUnidade: rendimento > 0 ? custoTotal / rendimento : null,
      semPreco: linhas.filter((l) => l.ingrediente && l.precoBase == null).length,
      totaisAntes: totaisPorTipo(linhas, 'qtdMultiplicada'),
      totaisFinais: totaisPorTipo(linhas, 'qtdFinal'),
    };
  }

  function montarLinha(l) {
    const qtdFinal = l.qtdMultiplicada + l.extra;
    const custoMultiplicado = custoDe(l.qtdMultiplicada, l.unidade, l.precoBase);
    const custoExtra = l.extra ? custoDe(l.extra, l.unidade, l.precoBase) : 0;
    return {
      ...l,
      qtdFinal,
      custoMultiplicado,
      custoExtra,
      custoFinal: custoMultiplicado == null ? null : custoMultiplicado + (custoExtra || 0),
    };
  }

  /** Soma as quantidades por tipo, na menor unidade: { massa: g, volume: ml, unidade: un }. */
  function totaisPorTipo(linhas, campo) {
    const totais = {};
    for (const l of linhas) {
      const tipo = tipoDaUnidade(l.unidade);
      const valor = converter(l[campo], l.unidade, tipo ? TIPOS[tipo].menor : l.unidade);
      if (!tipo || !Number.isFinite(valor)) continue;
      totais[tipo] = (totais[tipo] || 0) + valor;
    }
    return totais;
  }

  /** Espaço ocupado na produção (ex.: 2 assadeiras × 0,7 = 1,4) e quantos usar na prática. */
  function espacoNaProducao(qtdPorReceita, multiplicador) {
    const q = numero(qtdPorReceita);
    const m = numero(multiplicador);
    if (!(q > 0) || !(m > 0)) return null;
    const exato = q * m;
    const arredondado = Math.round(exato * 1000) / 1000;
    return { exato: arredondado, pratico: Math.ceil(arredondado) };
  }

  return {
    TIPOS,
    tipoDaUnidade,
    unidadesDoTipo,
    paraBase,
    converter,
    parseNumero,
    numero,
    formatarNumero,
    formatarCampo,
    formatarMoeda,
    formatarVariacao,
    formatarQuantidade,
    casasDaUnidade,
    mesDe,
    mesValido,
    deslocarMes,
    nomeMes,
    listaMeses,
    precoPorBase,
    historico,
    registroAtual,
    registroAnterior,
    registroDoMes,
    precoAtual,
    variacaoAtual,
    variacao,
    statusPreco,
    registrarPreco,
    custoDe,
    custoReceita,
    multiplicadorParaRendimento,
    quantidadeDoAjuste,
    calcularProducao,
    totaisPorTipo,
    espacoNaProducao,
  };
});
