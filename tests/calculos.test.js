const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calculos.js');

const perto = (real, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(real - esperado) < tolerancia, `esperado ${esperado}, recebido ${real}`);

const farinha = {
  id: 'farinha',
  nome: 'Farinha',
  tipo: 'massa',
  precos: [
    { mes: '2026-09', entrada: { tipo: 'embalagem', preco: 110, qtd: 25, unidade: 'kg' } },
    { mes: '2026-10', entrada: { tipo: 'embalagem', preco: 115, qtd: 25, unidade: 'kg' } },
  ],
};
const agua = {
  id: 'agua',
  nome: 'Água',
  tipo: 'volume',
  precos: [{ mes: '2026-10', entrada: { tipo: 'embalagem', preco: 6, qtd: 20, unidade: 'L' } }],
};
const ovos = {
  id: 'ovos',
  nome: 'Ovos',
  tipo: 'unidade',
  precos: [{ mes: '2026-10', entrada: { tipo: 'embalagem', preco: 22.5, qtd: 30, unidade: 'un' } }],
};
const sal = {
  id: 'sal',
  nome: 'Sal',
  tipo: 'massa',
  precos: [{ mes: '2026-09', entrada: { tipo: 'direto', preco: 3.5 } }],
};
const baunilha = { id: 'baunilha', nome: 'Baunilha', tipo: 'volume', precos: [] };
const ingredientes = [farinha, agua, ovos, sal, baunilha];

const receita = {
  id: 'r1',
  nome: 'Massa teste',
  rendimento: { qtd: 10, unidade: 'pães' },
  itens: [
    { ingredienteId: 'farinha', qtd: 1000, unidade: 'g' },
    { ingredienteId: 'agua', qtd: 600, unidade: 'ml' },
    { ingredienteId: 'ovos', qtd: 2, unidade: 'un' },
    { ingredienteId: 'sal', qtd: 20, unidade: 'g' },
  ],
};

test('lê números no formato brasileiro', () => {
  assert.equal(C.parseNumero('0,7'), 0.7);
  assert.equal(C.parseNumero('1,5'), 1.5);
  assert.equal(C.parseNumero('1.250,5'), 1250.5);
  assert.equal(C.parseNumero('1.250'), 1250);
  assert.equal(C.parseNumero('12.500'), 12500);
  assert.equal(C.parseNumero('1.5'), 1.5);
  assert.equal(C.parseNumero('0.250'), 0.25);
  assert.equal(C.parseNumero('R$ 6,50'), 6.5);
  assert.equal(C.parseNumero(' 42 '), 42);
  assert.equal(C.parseNumero('-10'), -10);
  assert.ok(Number.isNaN(C.parseNumero('')));
  assert.ok(Number.isNaN(C.parseNumero('abc')));
  assert.ok(Number.isNaN(C.parseNumero('1,2,3')));
});

test('formata valores em reais e quantidades', () => {
  const semEspacoFixo = (s) => s.replace(/ /g, ' ');
  assert.equal(semEspacoFixo(C.formatarMoeda(37.856)), 'R$ 37,86');
  assert.equal(semEspacoFixo(C.formatarMoeda(0.0072, true)), 'R$ 0,0072');
  assert.equal(semEspacoFixo(C.formatarMoeda(0.0072)), 'R$ 0,01');
  assert.equal(C.formatarQuantidade(1250, 'g'), '1.250 g');
  assert.equal(C.formatarQuantidade(8.44, 'g'), '8,4 g');
  assert.equal(C.formatarCampo(1250.5), '1250,5');
  assert.equal(C.formatarVariacao(0.04545), '+4,5%');
  assert.equal(C.formatarVariacao(-0.1), '−10%');
  assert.equal(C.formatarVariacao(0), '0%');
});

test('converte unidades do mesmo tipo e recusa tipos diferentes', () => {
  assert.equal(C.converter(1500, 'g', 'kg'), 1.5);
  assert.equal(C.converter(0.25, 'L', 'ml'), 250);
  assert.ok(Number.isNaN(C.converter(1, 'g', 'ml')));
  assert.equal(C.tipoDaUnidade('ml'), 'volume');
  assert.equal(C.tipoDaUnidade('xícara'), null);
});

test('calcula o preço por unidade base a partir do preço direto ou da embalagem', () => {
  assert.equal(C.precoPorBase({ tipo: 'direto', preco: 6.5 }), 6.5);
  assert.equal(C.precoPorBase({ tipo: 'embalagem', preco: 120, qtd: 25, unidade: 'kg' }), 4.8);
  perto(C.precoPorBase({ tipo: 'embalagem', preco: 32.9, qtd: 500, unidade: 'g' }), 65.8);
  assert.equal(C.precoPorBase({ tipo: 'embalagem', preco: 10, qtd: 0, unidade: 'kg' }), null);
  assert.equal(C.precoPorBase({ tipo: 'direto', preco: -1 }), null);
});

test('exemplo do pedido: 1,5 g × preço por kg', () => {
  // 1,5 g de um ingrediente a R$ 4,80/kg = R$ 0,0072
  perto(C.custoDe(1.5, 'g', 4.8), 0.0072);
});

test('histórico mensal: preço atual, variação e status', () => {
  perto(C.precoAtual(farinha), 4.6);
  perto(C.variacaoAtual(farinha), 115 / 110 - 1);
  assert.equal(C.variacaoAtual(agua), null);
  assert.equal(C.statusPreco(farinha, '2026-10'), 'atualizado');
  assert.equal(C.statusPreco(sal, '2026-10'), 'pendente');
  assert.equal(C.statusPreco(baunilha, '2026-10'), 'sem-preco');
  assert.equal(C.registroAnterior(farinha, '2026-10').mes, '2026-09');
});

test('registrar preço substitui o registro do mesmo mês e mantém a ordem', () => {
  const lista = C.registrarPreco(farinha.precos, '2026-10', { tipo: 'direto', preco: 5 });
  assert.equal(lista.length, 2);
  assert.equal(lista[1].entrada.preco, 5);
  const nova = C.registrarPreco(lista, '2026-08', { tipo: 'direto', preco: 4 });
  assert.deepEqual(nova.map((r) => r.mes), ['2026-08', '2026-09', '2026-10']);
  assert.equal(farinha.precos.length, 2, 'não altera a lista original');
});

test('custo da receita soma as linhas e calcula o custo por unidade', () => {
  const r = C.custoReceita(receita, ingredientes);
  // farinha 1 kg × 4,60 + água 0,6 L × 0,30 + 2 ovos × 0,75 + sal 0,02 kg × 3,50
  perto(r.total, 4.6 + 0.18 + 1.5 + 0.07);
  perto(r.porUnidade, r.total / 10);
  assert.equal(r.semPreco, 0);
});

test('custo da receita aceita quantidades digitadas e conta ingredientes sem preço', () => {
  const rascunho = {
    itens: [
      { ingredienteId: 'farinha', qtd: '1,5', unidade: 'kg' },
      { ingredienteId: 'baunilha', qtd: '5', unidade: 'ml' },
    ],
    rendimento: { qtd: '' },
  };
  const r = C.custoReceita(rascunho, ingredientes);
  perto(r.total, 6.9);
  assert.equal(r.semPreco, 1);
  assert.equal(r.linhas[1].custo, null);
  assert.equal(r.porUnidade, null);
});

test('produção multiplica quantidades, custo e rendimento (0,7×)', () => {
  const p = C.calcularProducao(receita, ingredientes, 0.7);
  const base = C.custoReceita(receita, ingredientes).total;
  perto(p.linhas[0].qtdFinal, 700);
  perto(p.linhas[2].qtdFinal, 1.4);
  perto(p.custoTotal, base * 0.7);
  perto(p.rendimento, 7);
  perto(p.porUnidade, base / 10);
  assert.equal(p.temAjustes, false);
  perto(p.totaisFinais.massa, 714);
  perto(p.totaisFinais.volume, 420);
});

test('multiplicador a partir do rendimento desejado', () => {
  perto(C.multiplicadorParaRendimento(28, 40), 40 / 28);
  perto(C.multiplicadorParaRendimento('10', '7'), 0.7);
  assert.ok(Number.isNaN(C.multiplicadorParaRendimento(0, 5)));
});

test('ajuste em % incide sobre a quantidade já multiplicada', () => {
  const ajustes = [{ alvo: 'item', indice: 1, modo: 'pct', valor: 10 }];
  const p = C.calcularProducao(receita, ingredientes, 0.7, ajustes);
  const aguaLinha = p.linhas[1];
  perto(aguaLinha.qtdMultiplicada, 420);
  perto(aguaLinha.extra, 42);
  perto(aguaLinha.qtdFinal, 462);
  perto(aguaLinha.custoExtra, 0.042 * 0.3);
  perto(p.custoAjustes, 0.042 * 0.3);
  assert.equal(p.temAjustes, true);
  perto(p.totaisAntes.volume, 420);
  perto(p.totaisFinais.volume, 462);
});

test('ajuste em quantidade é por receita base e acompanha o multiplicador', () => {
  // +50 ml de água por receita; em 0,7× vira +35 ml. Informado em L para testar a conversão.
  const ajustes = [{ alvo: 'item', indice: 1, modo: 'qtd', valor: 0.05, unidade: 'L' }];
  const p = C.calcularProducao(receita, ingredientes, 0.7, ajustes);
  perto(p.linhas[1].extra, 35);
  perto(p.linhas[1].qtdFinal, 455);
});

test('ajuste com ingrediente fora da receita vira uma linha extra', () => {
  const ajustes = [{ alvo: 'extra', ingredienteId: 'agua', modo: 'qtd', valor: 100, unidade: 'ml' }];
  const semAgua = { ...receita, itens: receita.itens.filter((i) => i.ingredienteId !== 'agua') };
  const p = C.calcularProducao(semAgua, ingredientes, 2, ajustes);
  const extra = p.linhas[p.linhas.length - 1];
  assert.equal(extra.origem, 'extra');
  perto(extra.qtdFinal, 200);
  perto(extra.custoFinal, 0.2 * 0.3);
  perto(p.custoAjustes, 0.06);
});

test('ajuste não altera a receita salva', () => {
  const copia = JSON.stringify(receita);
  C.calcularProducao(receita, ingredientes, 1.5, [{ alvo: 'item', indice: 0, modo: 'pct', valor: 20 }]);
  assert.equal(JSON.stringify(receita), copia);
});

test('espaço na produção é proporcional e indica o arredondamento para cima', () => {
  assert.deepEqual(C.espacoNaProducao(2, 0.7), { exato: 1.4, pratico: 2 });
  assert.deepEqual(C.espacoNaProducao('2', '1,5'), { exato: 3, pratico: 3 });
  assert.equal(C.espacoNaProducao('', 1), null);
});

test('meses: nome, deslocamento e lista', () => {
  assert.equal(C.nomeMes('2026-10'), 'outubro/2026');
  assert.equal(C.nomeMes('2026-03', true), 'mar/26');
  assert.equal(C.deslocarMes('2026-01', -1), '2025-12');
  assert.equal(C.deslocarMes('2026-12', 1), '2027-01');
  const lista = C.listaMeses('2026-10', 2, 1);
  assert.deepEqual(lista, ['2026-11', '2026-10', '2026-09', '2026-08']);
  assert.equal(C.mesDe(new Date(2026, 9, 16)), '2026-10');
});
