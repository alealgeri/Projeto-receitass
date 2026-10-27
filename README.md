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
- **Medidas caseiras (opcional):** quanto pesa 1 xícara, 1 colher de sopa e 1 colher de chá daquele ingrediente (ex.: 1 xícara de farinha = 120 g). São usadas na leitura de receitas por foto.

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

#### Ler receita de foto

Em **Receitas → Ler receita de foto**, tire ou escolha a foto da receita (até 4 fotos, para receitas em mais de uma página). O Claude, da Anthropic, lê a receita e o app mostra uma tela de revisão antes de qualquer coisa ser salva:

- cada ingrediente lido é ligado ao seu cadastro do painel 1 (“farinha” → “Farinha de trigo T55”) ou marcado como **novo**, para ser criado sem preço;
- medidas caseiras viram g ou ml. Se o ingrediente tem a sua medida cadastrada, vale a sua; senão, vale uma estimativa do Claude, marcada **para conferir**;
- “a gosto”, “pitada” e outras quantidades indefinidas ficam em branco para você preencher.

Depois da revisão, a receita abre no editor, já com o custo calculado, e só é salva quando você clicar em **Salvar receita**.

**O que é preciso:**

- Uma conta na API da Anthropic, em [platform.claude.com](https://platform.claude.com/), com créditos pré-pagos. É separada da assinatura do app Claude.
- Uma chave de API (“API Keys”), cadastrada em **Dados e backup → Leitura por foto**. O app testa a chave antes de salvar, sem gastar créditos.
- Internet no momento da leitura.

**Custo:** cerca de US$ 0,05 a 0,10 por receita lida, com o modelo Claude Opus 5.5. Convém definir um limite de gasto mensal na conta da API.

**Privacidade e segurança:**

- As fotos são reduzidas no próprio aparelho, enviadas à Anthropic só para a leitura e não ficam guardadas no app.
- A chave fica salva só no navegador (fora do arquivo de backup). Quem usar o mesmo navegador consegue vê-la. No GitHub Pages, outras páginas publicadas na mesma conta do GitHub (`<usuário>.github.io`) também conseguiriam lê-la.
- A leitura não funciona na prévia publicada dentro do Claude, que bloqueia chamadas externas. Use pelo GitHub Pages ou abrindo o `index.html`.

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

HTML, CSS e JavaScript puro, sem etapa de build. A única dependência é o SDK oficial da Anthropic (`@anthropic-ai/sdk`, versão fixa), carregado da CDN jsDelivr só quando alguém lê uma foto.

```
index.html          estrutura da página
css/estilo.css      estilo (tema claro e escuro, celular)
js/calculos.js      cálculos puros: unidades, preços, custos, produção e ajustes
js/leitura.js       leitura por foto: pedido ao Claude, formato da resposta e conversão de medidas
js/dados.js         armazenamento, exemplo do croissant e validação de backup
js/app.js           telas e eventos
tests/              testes dos cálculos e da interpretação da leitura
```

Testes (Node 18 ou mais recente):

```
npm test
```
