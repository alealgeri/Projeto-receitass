# Receitas com Custo

App web para calcular o custo de receitas a partir do preço dos ingredientes e montar fichas de produção proporcionais.

Funciona no navegador e pode ser instalado como aplicativo no celular e no computador. Há dois modos:

- **Sem conta** (padrão): os dados ficam só no aparelho, com backup em arquivo.
- **Com contas e equipes**: depois de configurar o Supabase (veja [Contas e equipes](#contas-e-equipes-nuvem)), cada negócio tem uma equipe com login, e os dados aparecem iguais em todos os aparelhos.

## Como abrir

- **Pelo GitHub Pages (recomendado):** no GitHub, vá em *Settings → Pages*, escolha *Deploy from a branch*, a branch do projeto e a pasta `/ (root)`. O endereço fica `https://<usuário>.github.io/Projeto-receitass/`.
- **No computador, sem internet:** baixe o projeto e abra o arquivo `index.html` no navegador (só no modo sem conta).

Na primeira vez o app abre com um exemplo de croissant, marcado como exemplo. Dá para apagar com um botão.

### Instalar como aplicativo

Pelo endereço do GitHub Pages:

- **Android (Chrome):** em *Dados e backup* (ou *Equipe e dados*), toque em **Instalar neste aparelho**. Ou, no menu do Chrome, **Instalar app**.
- **iPhone (Safari):** toque em **Compartilhar** (o quadrado com a seta) e depois em **Adicionar à Tela de Início**.
- **Computador (Chrome ou Edge):** clique no ícone de instalar na barra de endereço.

O app instalado tem ícone próprio, abre em tela cheia e funciona sem internet (menos a leitura por foto e a sincronização, que esperam a conexão voltar). Atualizações chegam sozinhas: ao abrir com internet, ele já carrega a versão mais nova.

No iPhone, o app instalado guarda os dados separados do Safari. No modo sem conta, para levar o que já estava no Safari, use o backup.

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

## Contas e equipes (nuvem)

Com o Supabase configurado, o app pede login. Cada negócio é uma **equipe**: o dono convida as pessoas que trabalham com ele, e todos veem e editam os mesmos ingredientes, preços e receitas, em qualquer aparelho.

### Como funciona para quem usa

- **Primeiro acesso:** criar conta com e-mail e senha, confirmar o e-mail e criar a equipe. A equipe pode começar com os dados que já estavam no aparelho, com o exemplo do croissant ou vazia.
- **Convidar:** em **Equipe e dados**, o dono digita o e-mail da pessoa e envia o link gerado (WhatsApp, e-mail…). O link vale 14 dias e só funciona para aquele e-mail.
- **Papéis:** **dono** convida e remove pessoas, renomeia a equipe, importa backup e pode apagar os dados da equipe; **membro** vê e edita ingredientes, preços e receitas e pode sair da equipe.
- **Sincronização:** cada alteração vai para a nuvem em seguida. No topo aparece o estado (“Salvo na nuvem”, “Sem conexão: envia depois”). Sem internet, o app continua funcionando com a cópia do aparelho e envia tudo quando a conexão volta. Ao voltar para o app, ele busca o que a equipe mudou; para buscar na hora, toque no estado no topo.
- **Edição ao mesmo tempo:** se duas pessoas alterarem o mesmo ingrediente ou a mesma receita, vale a última gravação.
- **Sair da conta** apaga do aparelho a cópia dos dados da equipe.
- Os ajustes da produção e a chave da leitura por foto continuam sendo de cada aparelho.

### Como configurar (uma vez, pelo dono do app)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (o plano gratuito serve para começar). Escolha a região **South America (São Paulo)**.
2. No projeto, abra **SQL Editor**, cole o conteúdo de [`supabase/migrations/0001_equipes.sql`](supabase/migrations/0001_equipes.sql) e clique em **Run**. Isso cria as tabelas e as regras que impedem uma equipe de ver os dados de outra.
3. Em **Authentication → URL Configuration**:
   - **Site URL:** o endereço do app, por exemplo `https://alealgeri.github.io/Projeto-receitass/`;
   - **Redirect URLs:** adicione o mesmo endereço seguido de `**` (`https://alealgeri.github.io/Projeto-receitass/**`).
4. Em **Authentication → Sign In / Providers → Email**, deixe **Confirm email** ligado.
5. Em **Project Settings → API Keys**, copie a **URL do projeto** e a chave **publishable** (ou **anon public**). Cole as duas em [`js/config.js`](js/config.js). Essa chave pode ficar no código: quem protege os dados são as regras do passo 2. **Nunca** use a chave secreta (*secret* ou *service_role*).
6. Publique a alteração (commit na branch do GitHub Pages). Pronto: o app passa a pedir login.

**Antes de abrir para o público:**

- Os e-mails de confirmação e de nova senha saem pelo servidor de testes do Supabase, que envia poucos e-mails por hora. Configure um serviço de e-mail próprio em **Authentication → Emails → SMTP Settings**.
- No plano gratuito, o projeto pode ser pausado depois de uma semana sem uso. Com clientes usando, considere o plano pago.
- Publique **termos de uso** e **política de privacidade** (LGPD): o app guarda e-mails e os dados dos negócios.

## Dados e backup

Sem conta, os dados ficam no `localStorage` do navegador, só naquele aparelho. Com conta, ficam na nuvem da equipe, e o backup baixa uma cópia em arquivo. Em **Dados e backup** (ou **Equipe e dados**) você pode:

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

HTML, CSS e JavaScript puro, sem etapa de build. Duas bibliotecas oficiais, com versão fixa, são carregadas da CDN jsDelivr só quando usadas: o SDK da Anthropic (`@anthropic-ai/sdk`, na leitura por foto) e o `@supabase/supabase-js` (no modo com contas).

```
index.html                 estrutura da página
manifest.webmanifest       dados do app instalável (nome, ícones, cores)
sw.js                      service worker: abre sem internet
icones/                    ícone do app (SVG e PNGs)
css/estilo.css             estilo (tema claro e escuro, celular)
js/config.js               endereço e chave publicável do Supabase (vazio = sem conta)
js/calculos.js             cálculos puros: unidades, preços, custos, produção e ajustes
js/leitura.js              leitura por foto: pedido ao Claude, formato da resposta e conversão de medidas
js/dados.js                armazenamento, exemplo, validação, diferenças para sincronizar
js/nuvem.js                login, equipes e gravação no Supabase
js/app.js                  telas e eventos
supabase/migrations/       tabelas e regras de acesso do banco
supabase/testes/           testes das regras de acesso (PostgreSQL local)
tests/                     testes dos cálculos, da leitura e dos dados
```

Testes (Node 18 ou mais recente):

```
npm test
```

Testes das regras de acesso, num PostgreSQL 15+ local e vazio (o arquivo `auth_simulado.sql` imita o login do Supabase; não rode em produção):

```
cd supabase
psql -d banco_vazio -v ON_ERROR_STOP=1 -f testes/auth_simulado.sql -f migrations/0001_equipes.sql -f testes/regras_de_acesso.sql
```
