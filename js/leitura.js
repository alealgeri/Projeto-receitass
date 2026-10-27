/*
 * Receitas com Custo — leitura de receitas por foto.
 * Monta o pedido ao Claude (API da Anthropic, com a chave da própria pessoa),
 * interpreta a resposta e converte as quantidades para g, ml ou un.
 * As funções de interpretação são puras e testadas no Node; só `lerReceita`
 * e `testarChave` usam a rede.
 */
(function (raiz, fabrica) {
  const api = fabrica(raiz.Calculos || (typeof require === 'function' ? require('./calculos.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Leitura = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const MODELO = 'claude-opus-5-5';
  // Versão fixa do SDK oficial, carregada da CDN só quando a pessoa lê uma foto.
  const URL_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
  const MAX_FOTOS = 4;
  const LADO_MAXIMO = 2000; // px no lado maior: legível para letra de mão, sem pesar no custo

  /** Medidas caseiras que a pessoa pode cadastrar por ingrediente (em g ou ml). */
  const MEDIDAS = {
    xicara: 'xícara',
    colher_sopa: 'colher de sopa',
    colher_cha: 'colher de chá',
  };

  const numeroOuNulo = { anyOf: [{ type: 'number' }, { type: 'null' }] };

  /** Formato exigido da resposta (saída estruturada da API). */
  const ESQUEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['eh_receita', 'problema', 'nome', 'rendimento_qtd', 'rendimento_unidade',
      'ingredientes', 'modo_de_preparo', 'tempo', 'observacoes'],
    properties: {
      eh_receita: { type: 'boolean' },
      problema: { type: 'string' },
      nome: { type: 'string' },
      rendimento_qtd: numeroOuNulo,
      rendimento_unidade: { type: 'string' },
      ingredientes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['texto', 'nome', 'ingrediente_id', 'quantidade', 'unidade', 'medida_caseira',
            'tipo', 'qtd_convertida', 'unidade_convertida', 'estimado', 'observacao'],
          properties: {
            texto: { type: 'string' },
            nome: { type: 'string' },
            ingrediente_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            quantidade: numeroOuNulo,
            unidade: { type: 'string' },
            medida_caseira: { type: 'string', enum: [...Object.keys(MEDIDAS), 'nenhuma'] },
            tipo: { type: 'string', enum: ['massa', 'volume', 'unidade'] },
            qtd_convertida: numeroOuNulo,
            unidade_convertida: { type: 'string', enum: ['g', 'ml', 'un', 'nenhuma'] },
            estimado: { type: 'boolean' },
            observacao: { type: 'string' },
          },
        },
      },
      modo_de_preparo: { type: 'string' },
      tempo: { type: 'string' },
      observacoes: { type: 'string' },
    },
  };

  /** Instruções enviadas junto com as fotos, com o cadastro de ingredientes da pessoa. */
  function montarInstrucoes(ingredientes, quantasFotos) {
    const cadastro = (ingredientes || [])
      .map((i) => `${i.id} | ${i.nome.replace(/\s+/g, ' ')} | ${i.tipo}`)
      .join('\n');
    return [
      `Leia a receita culinária ${quantasFotos > 1 ? `nas ${quantasFotos} fotos (páginas da mesma receita, em ordem)` : 'na foto'} e preencha o JSON pedido.`,
      '',
      'Regras gerais:',
      '- Transcreva o que está escrito, em português. Não invente ingredientes, quantidades nem passos.',
      '- Se não houver uma receita ou ela estiver ilegível, use eh_receita = false e explique em "problema" numa frase curta. Caso contrário, "problema" fica "".',
      '- Frações viram decimal: 1/2 = 0.5; 1 1/2 = 1.5.',
      '',
      'Para cada ingrediente:',
      '- "texto": a linha como está escrita.',
      '- "nome": só o ingrediente, sem quantidade e sem preparo (ex.: "farinha de trigo").',
      '- "ingrediente_id": o id do cadastro abaixo quando for o mesmo ingrediente, mesmo com nome um pouco diferente ("farinha" = "Farinha de trigo T55"). Não ligue ingredientes diferentes (açúcar refinado não é açúcar mascavo; manteiga não é margarina). Sem correspondência: null.',
      '- "quantidade" e "unidade": como escritas (2 e "xícaras"). Sem quantidade ("a gosto", "pitada"): quantidade null e a expressão em "unidade".',
      '- "medida_caseira": "xicara", "colher_sopa" ou "colher_cha" quando a unidade for xícara, colher de sopa ou colher de chá; senão "nenhuma".',
      '- "tipo": como o ingrediente é medido: "massa" (g, kg), "volume" (ml, L) ou "unidade" (ovos, unidades). Se ligou ao cadastro, use o tipo do cadastro.',
      '- "qtd_convertida" e "unidade_convertida": a quantidade em g (massa), ml (volume) ou un (unidade). Conversões métricas (kg para g, L para ml) são exatas. Medidas caseiras convertidas pela densidade típica do ingrediente (1 xícara de farinha de trigo ≈ 120 g) são estimativas: "estimado" = true. Sem quantidade: null e "nenhuma".',
      '- "observacao": o preparo do ingrediente ("peneirada", "em temperatura ambiente") ou "".',
      '',
      'Receita:',
      '- "rendimento_qtd" e "rendimento_unidade": se a receita disser quanto rende ("rende 20 pães" = 20 e "pães"); senão null e "".',
      '- "modo_de_preparo": os passos, numerados, um por linha.',
      '- "tempo": tempo de preparo, descanso ou forno, se informado; senão "".',
      '- "observacoes": dicas, temperatura do forno e outras notas; senão "".',
      '',
      'Cadastro de ingredientes (id | nome | tipo):',
      cadastro || '(vazio: todos os ingredientes são novos)',
    ].join('\n');
  }

  /* ---------- Interpretação da resposta ---------- */

  const texto = (v, max = 20000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const numeroValido = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  function normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function arredondar(qtd, unidade) {
    const casas = unidade === 'un' ? 2 : 1;
    return Math.round(qtd * 10 ** casas) / 10 ** casas;
  }

  /**
   * Quantidade a usar no sistema, para o ingrediente escolhido (ou para um ingrediente novo do tipo dado).
   * Ordem: a medida caseira da pessoa → a conversão do Claude → sem quantidade.
   * Devolve { qtd, unidade, origem } com origem:
   *   'sua-medida' | 'exata' | 'estimada' | 'sem-quantidade' | 'tipo-diferente'
   */
  function resolverQuantidade(bruto, ingrediente, tipoNovo) {
    const tipo = ingrediente ? ingrediente.tipo : tipoNovo;
    const menor = C.TIPOS[tipo] ? C.TIPOS[tipo].menor : 'g';
    const medida = ingrediente && ingrediente.medidas && bruto.medida ? ingrediente.medidas[bruto.medida] : null;

    if (medida > 0 && bruto.quantidade != null) {
      return { qtd: arredondar(bruto.quantidade * medida, menor), unidade: menor, origem: 'sua-medida', medida };
    }
    if (bruto.qtdConvertida != null && bruto.unidadeConvertida) {
      if (C.tipoDaUnidade(bruto.unidadeConvertida) !== tipo) {
        return { qtd: null, unidade: menor, origem: 'tipo-diferente' };
      }
      return {
        qtd: arredondar(bruto.qtdConvertida, bruto.unidadeConvertida),
        unidade: bruto.unidadeConvertida,
        origem: bruto.estimado ? 'estimada' : 'exata',
      };
    }
    return { qtd: null, unidade: menor, origem: 'sem-quantidade' };
  }

  /** Liga ao cadastro pelo id que o Claude indicou ou, na falta dele, pelo nome igual. */
  function encontrarIngrediente(item, ingredientes) {
    const porId = ingredientes.find((i) => i.id === item.ingrediente_id);
    if (porId) return porId;
    const nome = normalizar(item.nome);
    return nome ? ingredientes.find((i) => normalizar(i.nome) === nome) || null : null;
  }

  /**
   * Converte a resposta do Claude no rascunho da tela de revisão.
   * Confere cada campo: a resposta vem de fora e pode ter valores inesperados.
   */
  function interpretarLeitura(resposta, ingredientes) {
    const r = resposta && typeof resposta === 'object' ? resposta : {};
    const lista = ingredientes || [];
    const linhas = (Array.isArray(r.ingredientes) ? r.ingredientes : [])
      .filter((item) => item && typeof item === 'object' && (texto(item.nome) || texto(item.texto)))
      .map((item) => {
        const unidadeConvertida = ['g', 'ml', 'un'].includes(item.unidade_convertida) ? item.unidade_convertida : null;
        const bruto = {
          texto: texto(item.texto, 300) || texto(item.nome, 200),
          nome: texto(item.nome, 200) || texto(item.texto, 200),
          quantidade: numeroValido(item.quantidade),
          unidadeOriginal: texto(item.unidade, 60),
          medida: Object.prototype.hasOwnProperty.call(MEDIDAS, item.medida_caseira) ? item.medida_caseira : null,
          qtdConvertida: unidadeConvertida ? numeroValido(item.qtd_convertida) : null,
          unidadeConvertida,
          estimado: item.estimado === true,
          observacao: texto(item.observacao, 200),
        };
        const ingrediente = encontrarIngrediente(item, lista);
        const tipoNovo = C.TIPOS[item.tipo] ? item.tipo : C.tipoDaUnidade(unidadeConvertida) || 'massa';
        return {
          bruto,
          ingredienteId: ingrediente ? ingrediente.id : null,
          tipoNovo,
          ...resolverQuantidade(bruto, ingrediente, tipoNovo),
        };
      });
    const rendimento = numeroValido(r.rendimento_qtd);
    return {
      ehReceita: r.eh_receita !== false && linhas.length > 0,
      problema: texto(r.problema, 300),
      nome: texto(r.nome, 200),
      rendimento: { qtd: rendimento > 0 ? rendimento : null, unidade: texto(r.rendimento_unidade, 60) },
      linhas,
      preparo: texto(r.modo_de_preparo),
      tempo: texto(r.tempo, 300),
      observacoes: texto(r.observacoes, 5000),
    };
  }

  /** Frase curta sobre como a quantidade foi obtida, para a tela de revisão. */
  function explicarOrigem(linha) {
    const b = linha.bruto;
    const medidaTxt = b.medida ? '1 ' + MEDIDAS[b.medida] : '';
    switch (linha.origem) {
      case 'sua-medida': return `Sua medida: ${medidaTxt} = ${C.formatarNumero(linha.medida, 1)} ${linha.unidade}`;
      case 'estimada': {
        const porUnidade = b.quantidade > 0 && b.qtdConvertida != null ? b.qtdConvertida / b.quantidade : null;
        return b.medida && porUnidade
          ? `Estimado: ${medidaTxt} ≈ ${C.formatarNumero(porUnidade, 1)} ${b.unidadeConvertida}. Confira`
          : 'Quantidade estimada. Confira';
      }
      case 'sem-quantidade': return b.unidadeOriginal ? `“${b.unidadeOriginal}”: informe a quantidade` : 'Informe a quantidade';
      case 'tipo-diferente': return 'A medida lida não combina com o cadastro: informe a quantidade';
      default: return '';
    }
  }

  /* ---------- Rede (só no navegador) ---------- */

  let carregandoSdk = null;
  function carregarSdk() {
    if (!carregandoSdk) {
      carregandoSdk = import(URL_SDK).then((m) => m.default || m.Anthropic).catch((erro) => {
        carregandoSdk = null;
        throw Object.assign(new Error('Não foi possível carregar o leitor. Confira a conexão com a internet e tente de novo.'), { codigo: 'sem-sdk', causa: erro });
      });
    }
    return carregandoSdk;
  }

  /** Traduz os erros da API para mensagens que a pessoa consegue resolver. */
  function traduzirErro(erro, Anthropic) {
    if (erro && erro.codigo) return erro;
    const msg = (m, codigo) => Object.assign(new Error(m), { codigo, causa: erro });
    if (Anthropic && erro instanceof Anthropic.APIUserAbortError) return msg('Leitura cancelada.', 'cancelada');
    if (Anthropic && erro instanceof Anthropic.AuthenticationError) return msg('A Anthropic recusou a chave. Confira a chave em “Dados e backup” → “Leitura por foto”.', 'chave');
    if (Anthropic && erro instanceof Anthropic.PermissionDeniedError) return msg('Esta chave não tem permissão para usar o modelo. Confira a conta na Anthropic.', 'permissao');
    if (Anthropic && erro instanceof Anthropic.NotFoundError) return msg('O modelo de leitura não está disponível para esta chave.', 'modelo');
    if (Anthropic && erro instanceof Anthropic.RateLimitError) return msg('Muitas leituras em pouco tempo. Espere um minuto e tente de novo.', 'limite');
    if (Anthropic && erro instanceof Anthropic.BadRequestError) {
      const detalhe = erro.error && erro.error.error && erro.error.error.message;
      return msg('A Anthropic não aceitou o pedido' + (detalhe ? `: ${detalhe}` : '.') + ' Se for falta de crédito, adicione créditos na conta da API.', 'pedido');
    }
    if (Anthropic && erro instanceof Anthropic.APIConnectionError) return msg('Sem conexão com a Anthropic. Confira a internet e tente de novo.', 'conexao');
    if (Anthropic && erro instanceof Anthropic.APIError) return msg(`A Anthropic está instável agora (erro ${erro.status || '?'}). Tente de novo em alguns minutos.`, 'servico');
    return msg('Algo deu errado na leitura. Tente de novo.', 'desconhecido');
  }

  function novoCliente(Anthropic, chave) {
    return new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true, maxRetries: 1 });
  }

  /** Confere a chave sem gastar créditos (consulta os dados do modelo). */
  async function testarChave(chave) {
    const Anthropic = await carregarSdk();
    try {
      await novoCliente(Anthropic, chave).models.retrieve(MODELO);
    } catch (erro) {
      throw traduzirErro(erro, Anthropic);
    }
  }

  /**
   * Envia as fotos ao Claude e devolve o rascunho interpretado.
   * imagens: [{ base64, tipo }] já reduzidas no aparelho.
   */
  async function lerReceita({ chave, imagens, ingredientes, signal }) {
    const Anthropic = await carregarSdk();
    let resposta;
    try {
      const conteudo = imagens.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.tipo, data: img.base64 },
      }));
      conteudo.push({ type: 'text', text: montarInstrucoes(ingredientes, imagens.length) });
      resposta = await novoCliente(Anthropic, chave).beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        // Se o modelo recusar por engano, a própria API tenta outro modelo adequado.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
        messages: [{ role: 'user', content: conteudo }],
      }, { signal });
    } catch (erro) {
      throw traduzirErro(erro, Anthropic);
    }
    if (resposta.stop_reason === 'refusal') {
      throw Object.assign(new Error('O Claude não leu esta imagem. Tente outra foto da receita.'), { codigo: 'recusa' });
    }
    if (resposta.stop_reason === 'max_tokens') {
      throw Object.assign(new Error('A receita é longa demais para ler de uma vez. Tente com menos fotos.'), { codigo: 'longa' });
    }
    const textoResposta = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let json;
    try {
      json = JSON.parse(textoResposta);
    } catch (erro) {
      throw Object.assign(new Error('Não consegui entender a resposta da leitura. Tente de novo.'), { codigo: 'resposta' });
    }
    return interpretarLeitura(json, ingredientes);
  }

  return {
    MODELO,
    URL_SDK,
    MAX_FOTOS,
    LADO_MAXIMO,
    MEDIDAS,
    ESQUEMA,
    montarInstrucoes,
    resolverQuantidade,
    interpretarLeitura,
    explicarOrigem,
    testarChave,
    lerReceita,
  };
});
