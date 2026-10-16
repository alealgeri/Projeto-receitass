# Receitas com Custo

App web para calcular o custo de receitas a partir do preço dos ingredientes e montar fichas de produção proporcionais.

Funciona direto no navegador, sem servidor e sem instalação. Os dados ficam salvos no próprio navegador, com backup em arquivo.

## Como abrir

- **No computador:** baixe o projeto e abra o arquivo `index.html` no navegador.
- **Pelo GitHub Pages (celular e computador):** depois que o código estiver na branch `main`, vá em *Settings → Pages*, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`. O endereço fica `https://<usuário>.github.io/Projeto-receitass/`.

Na primeira vez o app abre com um exemplo de croissant, marcado como exemplo. Dá para apagar com um botão.

## Os três painéis

### 1. Ingredientes

O custo de compra de cada ingrediente, atualizado uma vez por mês.

- O preço pode ser informado de dois jeitos:
  - **direto:** farinha a R$ 6,50 por kg;
  - **pela embalagem:** saco de 25 kg por R$ 120. O app calcula R$ 4,80/kg e R$ 0,0048/g.
- Cada ingrediente é medido por **peso** (g, kg), **volume** (ml, L) ou **unidade** (un).
- **Histórico mensal:** cada mês guarda o seu preço, com a variação em relação ao mês anterior.
- **Atualizar preços do mês:** uma tela com todos os ingredientes para digitar os preços novos. O botão “Manter” repete o preço anterior quando ele não mudou.
- Ingredientes sem preço do mês atual aparecem como **Pendente**.

### 2. Receitas

Onde cada receita é cadastrada (ex.: croissant).

- Cada linha mostra o cálculo enquanto você digita, como no rascunho de uma receita nova: `1,5 g × R$ 4,80/kg = R$ 0,0072`.
- Mostra o custo total, o custo por unidade de rendimento e quanto cada ingrediente pesa no custo (%).
- Um ingrediente que ainda não existe pode ser criado ali mesmo, em “+ Novo ingrediente…”.
- **Modo de preparo** e **Obs** no final, com campos opcionais:
  - **Tempo de produção:** texto livre, fica igual em qualquer multiplicador;
  - **Espaço ocupado por receita:** ex.: 2 assadeiras. Na produção acompanha o multiplicador (0,7× = 1,4 assadeira, “na prática, 2”);
  - **Observações:** texto livre.

  Campos vazios não aparecem na produção.

### 3. Produção

Escolha a receita e quantas vezes vai produzir.

- **Multiplicador** (ex.: 0,7) ou **rendimento desejado** (ex.: 40 croissants, e o app calcula 1,4286×). Os dois campos ficam sincronizados.
- Quantidades, custo total, custo por unidade e rendimento são recalculados na hora.
- **Ajustar ingrediente** (pop-up): aumenta um ingrediente só nesta produção, sem mudar a receita salva.
  - **% sobre a quantidade:** +10% de água sobre a quantidade já multiplicada;
  - **quantidade por receita base:** +50 ml por receita, que em 0,7× vira +35 ml;
  - **ingrediente fora da receita:** acrescenta um ingrediente que a receita não leva, com custo.

  A coluna “Ajuste” só aparece quando há algum ajuste. A prévia mostra o efeito no custo antes de aplicar. Para reduzir, use valor negativo.
- **Imprimir ficha:** versão limpa para levar para a cozinha.

## Dados e backup

Os dados ficam no `localStorage` do navegador, só naquele aparelho. Em **Dados e backup** você pode:

- baixar um backup (`.json`);
- importar um backup, por exemplo para passar os dados para outro aparelho;
- apagar os dados de exemplo ou carregar o exemplo de novo;
- apagar tudo.

Limpar os dados do navegador apaga as receitas, por isso convém baixar um backup de vez em quando.

## Números

- Use vírgula como separador decimal: `0,7`, `1,5`, `6,50`.
- Ponto seguido de três dígitos é separador de milhar: `1.250` = mil duzentos e cinquenta.
- Valores pequenos em reais aparecem com quatro casas (R$ 0,0072) para não sumirem no arredondamento.

## Para desenvolvedores

HTML, CSS e JavaScript puro, sem dependências nem etapa de build.

```
index.html          estrutura da página
css/estilo.css      estilo (tema claro e escuro, celular)
js/calculos.js      cálculos puros: unidades, preços, custos, produção e ajustes
js/dados.js         armazenamento, exemplo do croissant e validação de backup
js/app.js           telas e eventos
tests/              testes dos cálculos
```

Testes (Node 18 ou mais recente):

```
npm test
```
