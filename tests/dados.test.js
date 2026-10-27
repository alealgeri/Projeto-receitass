const test = require('node:test');
const assert = require('node:assert/strict');
const { Dados: D } = require('../js/dados.js');

const base = () => D.validar(D.exemplo('2026-10'));

test('sem mudanças, nada a enviar', () => {
  const dados = base();
  const m = D.diferencas(D.fotografar(dados), dados);
  assert.equal(m.total, 0);
});

test('primeiro envio manda tudo', () => {
  const dados = base();
  const m = D.diferencas(null, dados);
  assert.equal(m.salvar.ingredientes.length, dados.ingredientes.length);
  assert.equal(m.salvar.receitas.length, 1);
  assert.equal(m.total, dados.ingredientes.length + 1);
});

test('detecta documento alterado, novo e apagado', () => {
  const dados = base();
  const foto = D.fotografar(dados);
  dados.ingredientes[0] = { ...dados.ingredientes[0], nome: 'Farinha especial' };
  dados.ingredientes.push({ id: 'ing_novo', nome: 'Mel', tipo: 'massa', precos: [], medidas: {}, exemplo: false });
  dados.receitas = [];
  const m = D.diferencas(foto, dados);
  assert.deepEqual(m.salvar.ingredientes.map((i) => i.id).sort(), [dados.ingredientes[0].id, 'ing_novo'].sort());
  assert.deepEqual(m.apagar.receitas, ['ex_croissant']);
  assert.equal(m.apagar.ingredientes.length, 0);
  assert.equal(m.total, 3);
});

test('o retrato depois do envio zera as diferenças', () => {
  const dados = base();
  dados.receitas[0] = { ...dados.receitas[0], nome: 'Croissant de manteiga' };
  const fotoNova = D.fotografar(dados);
  assert.equal(D.diferencas(fotoNova, dados).total, 0);
});

test('medidas caseiras: guarda só números positivos e nada para ingrediente por unidade', () => {
  const v = D.validar({
    ingredientes: [
      { id: 'a', nome: 'Farinha', tipo: 'massa', precos: [], medidas: { xicara: 120, colher_sopa: -3, colher_cha: 'x', copo: 200 } },
      { id: 'b', nome: 'Ovos', tipo: 'unidade', precos: [], medidas: { xicara: 50 } },
      { id: 'c', nome: 'Leite', tipo: 'volume', precos: [] },
    ],
    receitas: [],
  });
  assert.deepEqual(v.ingredientes[0].medidas, { xicara: 120 });
  assert.deepEqual(v.ingredientes[1].medidas, {});
  assert.deepEqual(v.ingredientes[2].medidas, {});
});

test('validar recusa o que não é backup e limpa documentos inválidos', () => {
  assert.throws(() => D.validar({ ingredientes: 'x' }), /backup/);
  const v = D.validar({
    ingredientes: [{ id: 'a', nome: 'Sal', tipo: 'massa', precos: [{ mes: '2026-13', entrada: { tipo: 'direto', preco: 1 } }] }, { nome: 'sem id' }],
    receitas: [{ id: 'r', nome: 'Pão', itens: [{ ingredienteId: 'a', qtd: 10, unidade: 'ml' }, { ingredienteId: 'a', qtd: 10, unidade: 'g' }] }],
  });
  assert.equal(v.ingredientes.length, 1);
  assert.equal(v.ingredientes[0].precos.length, 0, 'mês inválido descartado');
  assert.equal(v.receitas[0].itens.length, 1, 'unidade incompatível descartada');
});
