const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/leitura.js');

const farinha = { id: 'ing_farinha', nome: 'Farinha de trigo T55', tipo: 'massa', precos: [], medidas: { xicara: 130 } };
const acucar = { id: 'ing_acucar', nome: 'Açúcar refinado', tipo: 'massa', precos: [], medidas: {} };
const leite = { id: 'ing_leite', nome: 'Leite integral', tipo: 'volume', precos: [], medidas: {} };
const ovos = { id: 'ing_ovos', nome: 'Ovos', tipo: 'unidade', precos: [] };
const cadastro = [farinha, acucar, leite, ovos];

/** Um ingrediente como o Claude devolve, com os campos obrigatórios do esquema. */
const item = (campos) => ({
  texto: '', nome: '', ingrediente_id: null, quantidade: null, unidade: '', medida_caseira: 'nenhuma',
  tipo: 'massa', qtd_convertida: null, unidade_convertida: 'nenhuma', estimado: false, observacao: '',
  ...campos,
});

const resposta = {
  eh_receita: true,
  problema: '',
  nome: 'Bolo simples',
  rendimento_qtd: 12,
  rendimento_unidade: 'fatias',
  ingredientes: [
    // Medida caseira com medida cadastrada pela pessoa: vale a dela (130 g), não a estimativa (120 g).
    item({ texto: '2 xícaras de farinha de trigo', nome: 'farinha de trigo', ingrediente_id: 'ing_farinha', quantidade: 2,
      unidade: 'xícaras', medida_caseira: 'xicara', qtd_convertida: 240, unidade_convertida: 'g', estimado: true }),
    // Medida caseira sem medida cadastrada: vale a estimativa, marcada para conferir.
    item({ texto: '1 xícara de açúcar', nome: 'açúcar', ingrediente_id: 'ing_acucar', quantidade: 1, unidade: 'xícara',
      medida_caseira: 'xicara', qtd_convertida: 180, unidade_convertida: 'g', estimado: true }),
    // Conversão métrica exata.
    item({ texto: '0,5 L de leite', nome: 'leite', ingrediente_id: 'ing_leite', quantidade: 0.5, unidade: 'L',
      tipo: 'volume', qtd_convertida: 500, unidade_convertida: 'ml' }),
    // Ingrediente novo.
    item({ texto: '1 colher de sopa de fermento em pó', nome: 'fermento em pó', quantidade: 1, unidade: 'colher de sopa',
      medida_caseira: 'colher_sopa', qtd_convertida: 10, unidade_convertida: 'g', estimado: true }),
    // Sem quantidade.
    item({ texto: 'sal a gosto', nome: 'sal', unidade: 'a gosto' }),
    // Id inventado, mas o nome é igual ao do cadastro.
    item({ texto: '3 ovos', nome: 'ovos', ingrediente_id: 'id_que_nao_existe', quantidade: 3, unidade: '',
      tipo: 'unidade', qtd_convertida: 3, unidade_convertida: 'un' }),
  ],
  modo_de_preparo: '1. Misture tudo.\n2. Asse.',
  tempo: '40 min de forno',
  observacoes: 'Forno a 180 °C.',
};

test('o esquema exige todos os campos e não aceita campos extras', () => {
  assert.equal(L.ESQUEMA.additionalProperties, false);
  assert.deepEqual([...L.ESQUEMA.required].sort(), Object.keys(L.ESQUEMA.properties).sort());
  const itens = L.ESQUEMA.properties.ingredientes.items;
  assert.equal(itens.additionalProperties, false);
  assert.deepEqual([...itens.required].sort(), Object.keys(itens.properties).sort());
});

test('as instruções levam o cadastro de ingredientes', () => {
  const t = L.montarInstrucoes(cadastro, 2);
  assert.ok(t.includes('ing_farinha | Farinha de trigo T55 | massa'));
  assert.ok(t.includes('2 fotos'));
  assert.ok(L.montarInstrucoes([], 1).includes('vazio'));
});

test('interpreta a receita e liga os ingredientes ao cadastro', () => {
  const r = L.interpretarLeitura(resposta, cadastro);
  assert.equal(r.ehReceita, true);
  assert.equal(r.nome, 'Bolo simples');
  assert.deepEqual(r.rendimento, { qtd: 12, unidade: 'fatias' });
  assert.equal(r.linhas.length, 6);
  assert.deepEqual(r.linhas.map((l) => l.ingredienteId), ['ing_farinha', 'ing_acucar', 'ing_leite', null, null, 'ing_ovos']);
  assert.equal(r.tempo, '40 min de forno');
});

test('a medida caseira da pessoa vence a estimativa', () => {
  const [farinhaLinha] = L.interpretarLeitura(resposta, cadastro).linhas;
  assert.equal(farinhaLinha.origem, 'sua-medida');
  assert.equal(farinhaLinha.qtd, 260);
  assert.equal(farinhaLinha.unidade, 'g');
  assert.equal(L.explicarOrigem(farinhaLinha), 'Sua medida: 1 xícara = 130 g');
});

test('sem medida cadastrada, usa a estimativa e pede conferência', () => {
  const linhas = L.interpretarLeitura(resposta, cadastro).linhas;
  assert.equal(linhas[1].origem, 'estimada');
  assert.equal(linhas[1].qtd, 180);
  assert.equal(L.explicarOrigem(linhas[1]), 'Estimado: 1 xícara ≈ 180 g. Confira');
  assert.equal(linhas[2].origem, 'exata');
  assert.equal(linhas[2].qtd, 500);
  assert.equal(linhas[2].unidade, 'ml');
});

test('ingrediente novo guarda o tipo e sem quantidade fica para preencher', () => {
  const linhas = L.interpretarLeitura(resposta, cadastro).linhas;
  assert.equal(linhas[3].tipoNovo, 'massa');
  assert.equal(linhas[3].qtd, 10);
  assert.equal(linhas[4].origem, 'sem-quantidade');
  assert.equal(linhas[4].qtd, null);
  assert.equal(L.explicarOrigem(linhas[4]), '“a gosto”: informe a quantidade');
});

test('trocar o ingrediente recalcula com a medida dele', () => {
  const linha = L.interpretarLeitura(resposta, cadastro).linhas[1]; // 1 xícara de açúcar
  const comFarinha = L.resolverQuantidade(linha.bruto, farinha, 'massa');
  assert.equal(comFarinha.origem, 'sua-medida');
  assert.equal(comFarinha.qtd, 130);
  // Medida em g não serve para um ingrediente medido em volume.
  const comLeite = L.resolverQuantidade(linha.bruto, leite, 'volume');
  assert.equal(comLeite.origem, 'tipo-diferente');
  assert.equal(comLeite.qtd, null);
  assert.equal(comLeite.unidade, 'ml');
});

test('resposta que não é receita ou com campos estranhos não quebra', () => {
  const nao = L.interpretarLeitura({ eh_receita: false, problema: 'A foto mostra um gato.', ingredientes: [] }, cadastro);
  assert.equal(nao.ehReceita, false);
  assert.equal(nao.problema, 'A foto mostra um gato.');
  const estranha = L.interpretarLeitura({
    eh_receita: true,
    ingredientes: [null, 7, item({ nome: 'água', quantidade: 'muito', qtd_convertida: 'x', unidade_convertida: 'kg', tipo: '???' })],
    rendimento_qtd: -3,
  }, cadastro);
  assert.equal(estranha.linhas.length, 1);
  assert.equal(estranha.linhas[0].origem, 'sem-quantidade');
  assert.equal(estranha.linhas[0].tipoNovo, 'massa');
  assert.equal(estranha.rendimento.qtd, null);
  assert.equal(L.interpretarLeitura(null, cadastro).ehReceita, false);
});
