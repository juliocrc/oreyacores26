# Julinho — assistente de voz global

O Julinho está disponível em todas as páginas internas da aplicação. Abre pelo
botão no canto inferior direito ou com `Ctrl+Shift+J`.

## O que faz

- **Voz e texto**: ditado em português (`pt-PT`) pelo microfone do navegador e
  resposta falada. Se o áudio do servidor falhar, usa a voz nativa do navegador.
- **Navegação**: “abre as jangadas”, “vai para a agenda”, “mostra o stock”,
  “abre o estado jangada”, “abre ordens de serviço”.
- **Consultas aos dados da estação**:
  - “resumo da estação”
  - “próximas inspeções” / “jangadas a expirar”
  - “stock em falta”
  - “ordens de serviço abertas”
  - “faturas em atraso”
  - “quantas jangadas / navios / clientes / referências”
- **Fichas**: “abre a jangada 2153”, “procura o navio Atlântida”,
  “cliente João”, “artigo A10”.

Todas as consultas respeitam o utilizador e a estação ativa; nunca cruzam
dados de estações sem permissão.

## Privacidade e funcionamento offline

- O microfone só é ativado quando o utilizador carrega no botão. O ditado do
  navegador (Chrome/Edge) pode requerer internet; o texto funciona sempre.
- Sem servidor, o Julinho continua a abrir páginas através da interpretação
  local de comandos. As consultas de dados exigem ligação.
- O áudio é gerado no servidor com Edge TTS (`src/lib/speech-synthesis.ts`) e
  não é guardado. O texto enviado ao TTS é processado pela Microsoft. O mesmo
  se aplica ao áudio WhatsApp já existente.
- O microfone e a voz podem ser silenciados no cabeçalho do painel; a
  preferência fica guardada no `localStorage`.

## Configuração opcional

| Variável | Efeito |
| --- | --- |
| `JULINHO_VOICE` | Voz Edge TTS do Julinho. Por omissão usa `TTS_VOICE`. |
| `JULINHO_LLM_API_KEY` | Ativa respostas livres por um modelo compatível com OpenAI. |
| `JULINHO_LLM_BASE_URL` | Endpoint do modelo (por omissão `https://api.openai.com/v1`). |
| `JULINHO_LLM_MODEL` | Nome do modelo (por omissão `gpt-4o-mini`). |

Sem `JULINHO_LLM_API_KEY`, apenas as consultas determinísticas são respondidas;
perguntas desconhecidas devolvem a lista de comandos. O modelo recebe somente a
pergunta, a página atual, o nome da estação e um resumo agregado — nunca listas
de clientes nem dados pessoais.

O endpoint de voz (`POST /api/julinho/voice`) exige sessão válida e usa o
limitador partilhado com falha fechada, tal como o áudio WhatsApp. O endpoint de
texto (`POST /api/julinho`) é apenas de leitura e não tem custo externo.

## Ficheiros

- `src/lib/julinho/julinho-intents.ts` — interpretação local dos comandos.
- `src/lib/julinho/julinho-answer.ts` — consultas e respostas por estação.
- `src/lib/julinho/julinho-llm.ts` — integração opcional com modelo.
- `src/app/api/julinho/route.ts` — API de texto.
- `src/app/api/julinho/voice/route.ts` — síntese de voz.
- `src/components/julinho/JulinhoAssistant.tsx` — painel flutuante.
