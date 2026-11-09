# Auditoria global — 27/10/2026

## Execução das prioridades — primeira ronda de correções

Os resultados e problemas descritos nas secções seguintes são a fotografia
**anterior às correções**. Nesta primeira ronda foram implementados localmente:

- Proxy: sessões CLIENTE só passam para APIs autenticadas de `/api/portal/`;
  as exceções públicas existentes continuam a validar os seus próprios tokens.
  Páginas internas redirecionam clientes para a área de cliente. Perfis JWT
  ausentes/desconhecidos exigem novo login. Extensões nos caminhos API já não
  contornam a autenticação.
- Autorização local adicional nas rotas de custos, clientes (incluindo lote),
  artigos de inspeção e análise de duplicados. A consulta/edição de clientes e
  artigos é limitada às estações autorizadas; os códigos de login são omitidos
  das consultas de clientes e dos snapshots de auditoria alterados nesta ronda.
  Custos ficam administrativos até revisão do seu fluxo de atribuição por estação.
- Eliminação de clientes em lote: valida IDs e verifica o conjunto autorizado
  dentro de uma transação; contagem de escrita divergente provoca rollback.
- Manutenção de certificados: GET devolve 405 sem operações; POST exige segredo
  Bearer `CRON_SECRET` ou acesso administrativo. Limpeza temporária tem retenção
  inteira entre 7 e 3650 dias. Deduplicação de arquivos está suspensa (409), não
  apenas escondida no interface. Agendamentos externos antigos por GET terão de
  ser revistos; nenhum agendamento real foi alterado.
- Fusão automática de navios suspensa (409), mesmo para administradores. A análise
  sem alterações continua disponível a administradores; o botão deixou de
  anunciar/executar uma fusão.
- Ambos os arranques Docker deixaram de executar migrações/bootstrap/db push.
  Usam `scripts/check-runtime-database.cjs`, apenas de leitura, e falham antes do
  servidor quando os campos verificados não estão disponíveis. O script foi
  incluído nos dois Dockerfiles. Bases novas precisam de preparação aprovada
  antes do arranque; não há criação automática de schema.
- O workflow GitHub de publicação passa a depender de CI concluído com sucesso,
  exclusivamente para push de main no próprio repositório, usando o SHA testado.
  O CI passa também a verificar lint de `src`. Integrações de publicação direta
  configuradas fora destes workflows (por exemplo Vercel Git Integration) não
  foram inspecionadas/alteradas e podem precisar de bloqueios equivalentes.

Validação desta ronda: TypeScript passou; lint dos ficheiros de segurança e
scripts alterados passou; **171 testes direcionados de segurança/auth/portal
passaram** na revisão final; os **8 testes Node** do arranque e dos gates de
publicação passaram. A execução integral da ronda terminou com **3107 testes
aprovados, 11 falhas e 2 ignorados** (antes das duas últimas fixtures positivas,
incluídas e aprovadas na revisão direcionada). As falhas continuam nas duas
suites já identificadas: 10 de ficha/documentos e 1 de OpenWA. O quadro PDF
passou nesta execução; o timeout inicial não se repetiu.
Os testes usam dependências simuladas: não houve migrações, limpeza real,
eliminação/fusão de dados, envio de mensagens, commit, push ou deploy.
O workflow de publicação ficará bloqueado enquanto persistirem os erros de
lint/testes conhecidos. Docker, navegador e build completo desta versão ainda
precisam de validação antes de qualquer publicação.

**Ainda não concluído:** revisão de permissões de todas as restantes rotas para
utilizadores internos, atualização de Node/dependências vulneráveis, erros de
lint/testes da fotografia inicial, TLS, correções funcionais de stock e build
completo/aceitação em staging. Isto não é uma declaração de aplicação totalmente
segura nem de todos os P1 resolvidos.

## Conclusão

A aplicação tem uma implementação funcional extensa, mas o estado local não deve
ser publicado em bloco sem corrigir os controlos de acesso e estabilizar a
validação automática. Os planos da raiz estão desatualizados: várias tarefas
marcadas como pendentes já existem no código.

Esta análise não alterou dados, não executou migrações, não enviou mensagens e não
publicou a aplicação. As provas de segurança usaram módulos transpilados em VM,
sessões sintéticas e substitutos de Prisma/filesystem; nenhuma eliminação real
foi executada. Estado de produção citado abaixo é evidência documental, não uma
nova inspeção da produção.

## Âmbito e verificações

- Inventário local: 92 páginas, 314 rotas API e 214 ficheiros de teste em `src`.
- Git no início: 214 entradas de alterações versionadas e 303 entradas não
  versionadas; algumas entradas representam diretórios com vários ficheiros.
- `npm run typecheck`: passou.
- `npm audit --omit=dev --json`: 47 entradas vulneráveis — 4 críticas, 33 altas,
  9 moderadas e 1 baixa. São alertas da árvore de dependências, não 47 explorações
  demonstradas. Há também ferramentas de build nesta árvore.
- Sete templates embutidos: todos presentes e idênticos aos binários locais,
  verificados por SHA-256 sem regenerar ficheiros.
- Testes Node de infraestrutura, migração de lotes e associação ESV/HOR:
  **30/30 passaram**, com dependências simuladas.
- Jest integral concluído em ~211 segundos: **3034 testes passaram, 12 falharam
  e 2 foram ignorados**; 213 suites passaram, 3 falharam e 1 foi ignorada.
  A primeira tentativa tinha sido interrompida aos 120 segundos.
- Lint de `src` concluído: **11 erros e 1337 avisos**, em 1294 ficheiros analisados.
  Dez erros estão em testes e um em `src/lib/stock-utils.ts:132` (tipo `{}`).
  Não equivale ao lint de todo o repositório, cuja tentativa inicial expirou.
- Build Next/Webpack com URLs de base de dados substituídas por um destino local
  inoperante e upload Sentry desativado: compilação passou (~5,8 min), TypeScript
  passou (~2,4 min) e geração estática terminou (227/227). O comando excedeu o
  limite de 10 minutos durante `Collecting build traces`; **build completo não
  confirmado**, sem erro de compilação observado. Não equivale a um deploy Vercel
  nem valida integrações reais. Antes da publicação, concluir o empacotamento e
  verificar o artefacto standalone num ambiente dedicado, sem lint/testes paralelos.
- Não foram executados testes E2E no navegador, restauros de backup nem provas
  reais de entrega de email/WhatsApp.

## Problemas por prioridade

### P0 — Manutenção destrutiva acessível sem autenticação

- `src/proxy.ts:119-124` deixa passar `/api/cron/*` para validação própria.
- `src/app/api/cron/certificados-maintenance/route.ts:6-40` não verifica sessão,
  perfil ou segredo. GET também executa POST.
- Os auxiliares em `src/lib/certificados-organizados.ts:301-368` removem ficheiros
  temporários e cópias consideradas duplicadas. O prazo de limpeza vem do pedido
  sem validação de intervalo.
- Ensaio sintético confirmou passagem anónima pelo proxy e HTTP 200 com chamada
  aos dois auxiliares simulados. Em ambientes de filesystem só de leitura, o
  impacto pode ser diferente; isso não corrige a falta de autorização.

**Falta:** autenticação própria de cron/admin, validação de parâmetros, remoção
de efeitos destrutivos por GET e testes de negação. Considerar desativar esta
operação até revisão da retenção documental.

### P0 — Sessão de cliente aceita em APIs internas sem autorização local

- `src/proxy.ts:167-186` aceita qualquer JWT com `sub`; não distingue CLIENTE de
  utilizador interno.
- `src/app/api/custos/route.ts:4-42` lê, cria e elimina custos sem validar acesso.
- `src/app/api/clientes/[id]/route.ts:58-105` consulta e atualiza clientes por ID
  sem verificar propriedade, perfil ou estação.
- `src/app/api/inspecaoartigo/route.ts:9-25` consulta artigos com inspeção e stock
  sem um controlo local equivalente.
- O controlo correto existe em `getAccessContext`, que rejeita CLIENTE, mas não
  é chamado por todas estas rotas.
- Ensaio sintético: JWT CLIENTE passou pelo proxy; GET e DELETE de custos
  devolveram 200 e chegaram ao Prisma simulado.

**Falta:** separar autenticação de autorização, aplicar verificações de perfil,
permissão, estação e objeto em cada rota; testar cliente contra API interna,
técnico sem permissão e acesso entre estações. A pesquisa textual de guards foi
apenas triagem: não classifica automaticamente todas as rotas sem correspondência
como vulneráveis, pois algumas delegam a autorização a auxiliares.

### P1 — Fusão automática de navios pode misturar entidades e deixar trabalho parcial

`src/app/api/navios/merge-duplicates/route.ts:54-155` agrupa todos os navios só por
nome normalizado; não exige administrador nem separa cliente/estação/matrícula.
As atualizações e eliminações não estão numa transação global ou por grupo.
Homónimos podem ser navios diferentes; uma falha intermédia deixa migração parcial.

**Falta:** restringir acesso, apresentar candidatos e conflitos de identidade,
aprovar IDs concretos, rever todas as relações e executar atomicamente com
backup/auditoria. Não executar o botão existente como forma de corrigir dados.

### P1 — Arranque de infraestrutura admite perda de dados

`docker-entrypoint-cloudrun.sh:12-16` tenta migrações e, perante erro, executa
`prisma db push --accept-data-loss`, permitindo depois o arranque mesmo com falha.
`docker-entrypoint.sh:8-10` também aplica o bootstrap SQL e tolera erros.

**Falta:** migrações aprovadas fora do arranque, sem fallback destrutivo,
compatibilidade de schema verificada e interrupção perante erro relevante.
Estes ficheiros não demonstram que Cloud Run seja o ambiente atualmente ativo.

### P1 — Dependências e versão Node incompatíveis

- Críticas na auditoria: `next`, `@sentry/nextjs`, `dompurify` e `proxy-addr`.
- Outras dependências diretas sinalizadas incluem `pdfjs-dist`, `nodemailer`,
  `xlsx`, `zod`, `tar` e `undici`.
- `xlsx` não tem correção disponível pela resolução atual do npm audit.
- Ambiente local: Node 20.20.0. Workflows e Dockerfiles também usam Node 20.
- Instalado: `@supabase/supabase-js` 2.114.0 exige Node >=22;
  `pdfjs-dist` 6.1.200 exige >=22.13.0 ou >=24.

**Falta:** escolher Node suportado em todos os alvos e atualizar dependências com
testes de regressão. Não aplicar `npm audit fix --force` indiscriminadamente:
algumas sugestões envolvem majors ou até downgrades incompatíveis.

### P1 — Publicação não depende do sucesso da validação

`.github/workflows/deploy.yml` publica diretamente em push para main, num workflow
independente de `ci.yml`. Pode publicar enquanto o outro job falha. O passo chamado
smoke test só imprime uma mensagem. O workflow CI não executa lint nem Playwright,
apesar do título mencionar E2E.

**Falta:** uma cadeia de validação bloqueante (tipos, lint, testes, build), seguida
de deploy e smoke tests reais com dados sintéticos.

### P1 — Testes de documentos estão desajustados

Dez falhas observadas em `src/lib/__tests__/ficha-document-integration.test.ts`:
oito expectativas de fetch não cumpridas e duas referências a `saveConflict`
ausente no contexto VM. O componente define esse estado; este erro do teste não
demonstra uma variável indefinida na aplicação. Os handlers dependem ainda de
auxiliares não injetados pela VM.

**Falta:** completar os contextos ou testar os componentes/serviços através das
suas interfaces. Depois distinguir regressões reais de fixtures obsoletas.

Outras duas falhas na execução integral:

- `src/lib/__tests__/quadro-pdf-template.test.ts:66`: geração excedeu o timeout
  de 5 segundos. Como build/lint estavam em paralelo, repetir isoladamente antes
  de concluir que existe regressão de desempenho ou geração.
- `src/components/shared/OpenWaConnection.test.tsx:284-286`: teste de pesquisa
  textual rejeita `Enviar SMS`, ainda presente numa expressão condicional do
  componente de comunicações. Confirmar comportamento efetivamente renderizado e
  alinhar o contrato de canais/teste; presença no texto não prova botão acessível.

### P2 — Densidade do stock não altera o layout

Em `src/app/stock/page.tsx:3001-3024`, `compact` é sempre verdadeiro. `listDensity`
só afeta persistência, estilo e texto do botão.

**Falta:** ligar `compact` ao estado e testar a alteração visual/persistência.

### P2 — Exportações e seleção em lote usam universos diferentes

O stock passa `itensFiltrados` à DataTable, mas o checkbox de selecionar todos e o
Excel usam a lista do pai (`src/app/stock/page.tsx:1540-1551,3026-3031`). Pesquisa
e filtros internos da DataTable não são devolvidos ao pai. O CSV usa `sortedData`
do componente (`src/components/shared/DataTable.tsx:265-290`).

**Falta:** definir se cada ação atua na página, resultados filtrados ou catálogo;
sincronizar os resultados internos antes de permitir ações destrutivas em lote.
Testar que artigos escondidos por filtros não são selecionados inadvertidamente.

### P2 — TLS e manutenção preventiva

- `src/app/api/setup-db/route.ts:39-42`, `src/database/postgres.ts:10` e
  `src/lib/import-sqlite-to-postgres.ts:97` desativam a validação do certificado.
  Não foi demonstrado que todos estes caminhos sejam usados em produção.
- Páginas muito extensas: ficha de jangada ~6907 linhas, navio ~4197,
  stock ~3622. Aumentam o custo de testes e a probabilidade de regressão.
- `DataTable` exporta texto CSV sem neutralizar prefixos de fórmula; rever para
  campos de entrada não confiável antes da abertura em Excel.

**Falta:** TLS verificado nos caminhos usados, reduzir superfície de administração
em runtime, modularizar fluxos críticos e testar o componente de tabela diretamente.

### P2 — Lint ainda falha

Erros confirmados pelo ESLint em `src`:

- `src/app/stock/page.test.tsx:217,218,252,253,284,285`: tipo genérico `Function`.
- `src/lib/__tests__/julinho-llm.test.ts:8` e
  `src/lib/__tests__/rate-limit.test.ts:51`: acesso dinâmico a `process.env`
  proibido pela regra local. Rever se a regra deve abranger estas fixtures.
- `src/lib/__tests__/stock-lots.test.ts:13` e `src/lib/stock-utils.ts:132`:
  tipo `{}` demasiado abrangente.
- `src/lib/__tests__/stock-reversals.test.ts:53`: `let` que deve ser `const`.

**Falta:** corrigir os 11 erros e classificar os 1337 avisos por risco, começando
pelos relacionados com hooks/estado; o total de avisos não significa igual número
de defeitos funcionais demonstrados.

## Estado dos planos

| Item | Estado encontrado | Falta |
| --- | --- | --- |
| Listas de navios/jangadas em DataTable | Implementadas no código | Smoke tests e regressão das ações/permissões |
| Stock: tabela única, filtros via accessor, colunas persistentes | Implementado | Corrigir densidade e coerência seleção/Excel |
| Stock: cartões compactos e prateleiras recolhíveis | Implementado no código | Validação visual e de persistência |
| Templates embutidos e geração no build Vercel | Implementados e versionados; 7/7 consistentes | Build/release e provas dos documentos no ambiente alvo |
| Três erros TS de KPIs/rentabilidade | Não reproduzidos; typecheck passou | Atualizar o plano para não continuar a listar este bloqueio |
| Commit/push/deploy e probes | Muito trabalho local por publicar/rever | Separar alterações, aprovar release e verificar versão efetiva |
| Isolamento MAINLAND/Açores | Não validado nos dados nesta auditoria | Rever requisito e acessos; backup e plano aprovado antes de qualquer limpeza |
| Wizard da jangada 2153 / inspeção 2815 | Não reproduzido aqui | Fixture anonimizada e teste de regressão sem escrita real |
| Fusão de cliente 830 em 746 | Não verificada | Confirmar identidade e referências; decisão explícita, não fusão automática |
| Lotes de stock | Código e testes presentes; documentação regista índices aplicados em 25/10 | Validação da versão publicada, concorrência e recuperação em staging |
| Estornos de stock | Ativação ainda pendente segundo `docs/pending-activation.md` | Confirmar pré-requisitos e executar rollout aprovado |
| IVA e PDF assinado | Código presente; documentação regista pré-requisitos DB aplicados em 27/10 | Deploy e testes sintéticos, incluindo negação entre clientes |
| Limitação de pedidos partilhada | Implementada com falha fechada | Confirmar Redis/segredos em cada ambiente; ausência causa HTTP 503 |
| PDFs oficiais no portal | Implementados | Confirmar Blob e chave estável de encriptação; testar upload/download autorizado |
| OpenWA | Adaptador e controlos presentes | Confirmar serviço, configuração, QR e entrega consentida; guia ainda contém texto antigo sobre adaptador em falta |

Não confundir migração de lotes com estornos: a documentação regista a primeira
como aplicada e a segunda como pendente. Não repetir migrações por causa de planos
antigos. Os backups e envelopes de recuperação documentados em Temp devem ser
conservados em armazenamento seguro e duradouro; não foi testado um restauro aqui.

## Ordem de trabalho recomendada

1. **Segurança:** fechar manutenção anónima e acesso de clientes a APIs internas;
   suspender fusões automáticas inseguras; adicionar testes negativos.
2. **Publicação segura:** remover fallback destrutivo, alinhar Node, atualizar
   dependências e tornar o CI bloqueante.
3. **Estabilização funcional:** corrigir testes/documentos, densidade e seleção do
   stock; completar regressões de wizard e isolamento por estação.
4. **Ativação controlada:** confirmar Redis, estornos, Blob/chaves e comunicações;
   verificar o estado real antes de aplicar qualquer pré-requisito.
5. **Aceitação:** staging independente, restauro ensaiado, navegador autenticado
   por perfis, exportações PDF/XLSX, movimentos/estornos e smoke pós-deploy.
6. **Plano único atualizado:** marcar implementado, validado e publicado como
   estados distintos; atribuir critérios de aceitação e responsável a cada item.

Não é possível atribuir uma percentagem de conclusão fiável só pelo código e pelos
planos atuais. O principal défice é de segurança, integração/ativação e validação,
não a ausência das listas e templates originalmente planeados.
