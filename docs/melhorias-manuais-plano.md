# Melhorias orientadas pelos manuais — estado

## Implementado localmente

- Matriz consultiva de aplicabilidade e identificação de dados em falta na
  previsão; RFD SeaSava associado ao manual MK III por indicação operacional.
- Previsão de testes e artigos, separando preços desconhecidos e material de
  fecho não confirmado; a estimativa não é orçamento.
- Referências de autocolantes verificadas para um subconjunto MK IV; consulta
  do stock pelo código do fabricante, sem afirmar cobertura universal.
- Referências de mangueiras e adaptadores Leafield do MK IV apenas quando a
  mangueira é identificada; válvulas são as registadas na ficha.
- Não preencher horas de NAP automaticamente ao marcar o resultado nem gravar
  uma data de GI inferida como histórico. A idade, por si só, já não declara
  um GI atrasado nos anos intermédios. Aviso de revisão técnica no passo de testes.
- A previsão consulta o último GI com resultado PASSOU numa inspeção concluída
  da jangada, apresentando a data da inspeção e uma estimativa de cinco anos,
  com ressalvas sobre a data efetiva e a regra aplicável. Não é decisão automática.
- O passo de testes avisa quando os registos WP ou NAP marcados como realizados
  não incluem tempos, leituras, unidades ou instrumentos; o aviso não certifica
  o ensaio nem bloqueia a gravação.
- A verificação de calibração compara a data da inspeção com a validade do
  instrumento e avisa quando não é possível confirmar datas ou equipamento.
  O passo não apresenta uma data presumida de GI como próximo teste confirmado.
- Os passos de testes e reparações indicam o capítulo correspondente e abrem
  a biblioteca externa geral; a aplicação não garante a edição nem a página.

## Por implementar e validar

- Plano completo de GI baseado em histórico efetivo, variantes e regras de fronteira
  revistas por técnico habilitado; calendário de testes por manual e aprovação.
- Evidência estruturada e persistida por ensaio e compartimento, rastreio de
  instrumentos/calibração e comprovação após reparação.
- Ficha persistente por mangueira, lote, desenho, datas, válvulas e adaptadores,
  com intervalos específicos validados e migração segura de dados existentes.
- Revisão visual e catálogo completo dos autocolantes e materiais de fecho para
  cada manual, modelo, marca, contentor e aprovação.
- Registo estruturado de reparações, lotes, cura, fotografias e reensaios.
- Links contextuais às versões corretas dos manuais e preços configuráveis para
  testes, serviços e reparações na previsão.

Estas tarefas não estão concluídas nem devem ser inferidas das sugestões
consultivas existentes. Novos campos persistidos exigem conceção e validação de
esquema, migração e testes antes de qualquer alteração em produção.
