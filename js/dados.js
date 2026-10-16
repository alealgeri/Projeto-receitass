/*
 * Receitas com Custo — dados.
 * Guarda tudo no navegador (localStorage), monta o exemplo do croissant
 * e valida arquivos de backup.
 */
(function (raiz) {
  'use strict';

  const C = raiz.Calculos;
  const CHAVE_DADOS = 'receitas-com-custo:v1';
  const CHAVE_TELA = 'receitas-com-custo:tela';
  const VERSAO = 1;

  let armazenamentoOk = true;

  function ler(chave) {
    try {
      const texto = raiz.localStorage.getItem(chave);
      return texto ? JSON.parse(texto) : null;
    } catch (erro) {
      armazenamentoOk = false;
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      raiz.localStorage.setItem(chave, JSON.stringify(valor));
      armazenamentoOk = true;
    } catch (erro) {
      armazenamentoOk = false;
    }
  }

  function novoId(prefixo) {
    return prefixo + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function vazio() {
    return { versao: VERSAO, ingredientes: [], receitas: [] };
  }

  /* ---------- Exemplo ---------- */

  /** Ingredientes e uma receita de croissant, com preços deste mês e do anterior. */
  function exemplo(mesAtual) {
    const anterior = C.deslocarMes(mesAtual, -1);
    const emb = (preco, qtd, unidade) => ({ tipo: 'embalagem', preco, qtd, unidade });
    const direto = (preco) => ({ tipo: 'direto', preco });
    const ing = (id, nome, tipo, antes, agora) => ({
      id: 'ex_' + id,
      nome,
      tipo,
      precos: [{ mes: anterior, entrada: antes }].concat(agora ? [{ mes: mesAtual, entrada: agora }] : []),
      exemplo: true,
    });

    const ingredientes = [
      ing('farinha', 'Farinha de trigo T55', 'massa', emb(110, 25, 'kg'), emb(115, 25, 'kg')),
      ing('manteiga', 'Manteiga sem sal', 'massa', direto(49.9), direto(52)),
      ing('leite', 'Leite integral', 'volume', direto(5.29), direto(5.49)),
      ing('agua', 'Água filtrada', 'volume', emb(6, 20, 'L'), emb(6, 20, 'L')),
      ing('acucar', 'Açúcar refinado', 'massa', emb(23.9, 5, 'kg'), emb(24.9, 5, 'kg')),
      // Sem preço deste mês, para mostrar o aviso de pendente.
      ing('sal', 'Sal refinado', 'massa', emb(3.49, 1, 'kg'), null),
      ing('fermento', 'Fermento biológico seco', 'massa', emb(32.9, 500, 'g'), emb(34.5, 500, 'g')),
      ing('ovos', 'Ovos', 'unidade', emb(21.9, 30, 'un'), emb(22.9, 30, 'un')),
    ];

    const item = (id, qtd, unidade) => ({ ingredienteId: 'ex_' + id, qtd, unidade });
    const croissant = {
      id: 'ex_croissant',
      nome: 'Croissant',
      rendimento: { qtd: 28, unidade: 'croissants' },
      itens: [
        item('farinha', 1000, 'g'),
        item('acucar', 110, 'g'),
        item('sal', 20, 'g'),
        item('fermento', 12, 'g'),
        item('leite', 300, 'ml'),
        item('agua', 260, 'ml'),
        item('manteiga', 550, 'g'),
        item('ovos', 2, 'un'),
      ],
      preparo: [
        '1. Misture a farinha, o açúcar, o sal e o fermento. Junte o leite e a água e sove até a massa ficar lisa. Incorpore 50 g da manteiga.',
        '2. Abra a massa em retângulo, embale em filme e leve à geladeira por 12 h.',
        '3. Lamine com os 500 g de manteiga restantes: 3 dobras simples, com 30 min de geladeira entre elas.',
        '4. Abra a 4 mm de espessura, corte triângulos de 9 × 25 cm e enrole.',
        '5. Deixe fermentar por 2 h a 26 °C, pincele com os ovos batidos e asse.',
      ].join('\n'),
      obs: {
        tempo: '3 h de trabalho + 12 h de descanso + 2 h de fermentação',
        espacoQtd: 2,
        espacoDesc: 'assadeiras 60 × 40 cm',
        texto: 'Forno a 180 °C por 18 a 20 min.',
      },
      exemplo: true,
      atualizadaEm: new Date().toISOString(),
    };

    return { versao: VERSAO, ingredientes, receitas: [croissant] };
  }

  /* ---------- Validação (backup e dados salvos) ---------- */

  const texto = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const numOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  function validarEntrada(e) {
    if (!e || typeof e !== 'object') return null;
    const preco = numOuNull(e.preco);
    if (preco == null || preco < 0) return null;
    if (e.tipo === 'embalagem') {
      const qtd = numOuNull(e.qtd);
      if (!(qtd > 0) || !C.tipoDaUnidade(e.unidade)) return null;
      return { tipo: 'embalagem', preco, qtd, unidade: e.unidade };
    }
    return { tipo: 'direto', preco };
  }

  function validarIngrediente(i) {
    if (!i || typeof i !== 'object' || typeof i.id !== 'string' || !texto(i.nome).trim()) return null;
    const tipo = C.TIPOS[i.tipo] ? i.tipo : null;
    if (!tipo) return null;
    const precos = (Array.isArray(i.precos) ? i.precos : [])
      .map((r) => {
        const entrada = r && C.mesValido(r.mes) ? validarEntrada(r.entrada) : null;
        if (!entrada) return null;
        // Uma embalagem precisa estar na mesma família de unidades do ingrediente.
        if (entrada.tipo === 'embalagem' && C.tipoDaUnidade(entrada.unidade) !== tipo) return null;
        return { mes: r.mes, entrada };
      })
      .filter(Boolean)
      .sort((a, b) => a.mes.localeCompare(b.mes));
    return { id: i.id, nome: texto(i.nome, 200).trim(), tipo, precos, exemplo: i.exemplo === true };
  }

  function validarReceita(r, ingredientesPorId) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !texto(r.nome).trim()) return null;
    const itens = (Array.isArray(r.itens) ? r.itens : [])
      .map((it) => {
        if (!it || !ingredientesPorId.has(it.ingredienteId)) return null;
        const qtd = numOuNull(it.qtd);
        const tipo = ingredientesPorId.get(it.ingredienteId).tipo;
        if (qtd == null || qtd < 0 || C.tipoDaUnidade(it.unidade) !== tipo) return null;
        return { ingredienteId: it.ingredienteId, qtd, unidade: it.unidade };
      })
      .filter(Boolean);
    const rend = r.rendimento || {};
    const obs = r.obs || {};
    const rendQtd = numOuNull(rend.qtd);
    const espacoQtd = numOuNull(obs.espacoQtd);
    return {
      id: r.id,
      nome: texto(r.nome, 200).trim(),
      rendimento: { qtd: rendQtd > 0 ? rendQtd : null, unidade: texto(rend.unidade, 60) },
      itens,
      preparo: texto(r.preparo, 20000),
      obs: {
        tempo: texto(obs.tempo, 300),
        espacoQtd: espacoQtd > 0 ? espacoQtd : null,
        espacoDesc: texto(obs.espacoDesc, 200),
        texto: texto(obs.texto, 5000),
      },
      exemplo: r.exemplo === true,
      atualizadaEm: texto(r.atualizadaEm, 40),
    };
  }

  /** Confere e normaliza um conjunto de dados. Lança erro se não for um backup deste app. */
  function validar(bruto) {
    if (!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.ingredientes) || !Array.isArray(bruto.receitas)) {
      throw new Error('O arquivo não é um backup do Receitas com Custo.');
    }
    const ingredientes = bruto.ingredientes.map(validarIngrediente).filter(Boolean);
    const porId = new Map(ingredientes.map((i) => [i.id, i]));
    const receitas = bruto.receitas.map((r) => validarReceita(r, porId)).filter(Boolean);
    return { versao: VERSAO, ingredientes, receitas };
  }

  /* ---------- API ---------- */

  /** Dados salvos; na primeira visita, o exemplo do croissant. */
  function carregar(mesAtual) {
    const salvo = ler(CHAVE_DADOS);
    if (salvo) {
      try {
        return validar(salvo);
      } catch (erro) {
        return vazio();
      }
    }
    const inicial = exemplo(mesAtual);
    gravar(CHAVE_DADOS, inicial);
    return inicial;
  }

  function salvar(dados) {
    gravar(CHAVE_DADOS, dados);
  }

  function carregarTela() {
    const t = ler(CHAVE_TELA);
    return t && typeof t === 'object' ? t : {};
  }

  function salvarTela(tela) {
    gravar(CHAVE_TELA, tela);
  }

  raiz.Dados = {
    VERSAO,
    carregar,
    salvar,
    carregarTela,
    salvarTela,
    exemplo,
    vazio,
    validar,
    novoId,
    armazenamentoDisponivel: () => armazenamentoOk,
  };
})(typeof self !== 'undefined' ? self : this);
