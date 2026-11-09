# Inspeções — revisão, registo e emissão

## Fluxo

1. Preencher os passos técnicos. O rascunho local continua a ser protegido pelo
   autosave; isso não é confirmação de gravação no servidor.
2. No **Resumo**, rever alertas e selecionar o técnico responsável. Não existe
   botão de registo/finalização neste passo.
3. No último passo, **Certificados**, pré-visualizar os documentos. Este passo
   não emite, envia ou guarda documentos, nem faz uploads ou grava assinaturas.
   Os PDFs identificam-se como `PRE-VISUALIZACAO - NAO EMITIDO`.
4. Usar o único botão **Guardar e finalizar inspeção**, no rodapé do último
   passo. Durante a gravação, fica desativado. O atalho Ctrl+Enter só funciona
   neste passo e fora da consulta do histórico.
5. Só depois da confirmação do servidor emitir certificados na ficha/histórico.
   Erros e funcionamento offline preservam o rascunho; não autorizam emissão.

## Regras de emissão

- POST OREY Excel/HTML, PDF, carimbado e Survitec requerem uma inspeção guardada
  explicitamente selecionada e pertencente à jangada. Dados técnicos enviados
  pelo cliente não substituem os dados guardados.
- Enviar um certificado também exige essa seleção. A validação antecede geração,
  envio e alteração do registo da fila.
- A geração em lote de um navio valida primeiro as inspeções de todas as jangadas.
  Uma jangada sem inspeção impede o lote, sem emitir/sincronizar um subconjunto.
- GET de certificado por série/jangada exige uma inspeção guardada; mantêm-se as
  verificações de propriedade, estação e tokens dos links existentes.
- Pré-visualização é uma rota separada, autenticada e sem registo de verificação,
  carimbo oficial, armazenamento ou sincronização.
- SOS só apresenta certificado; não apresenta quadro/testes/HRU.

## Validação

Testes direcionados: `ficha-document-integration`, `saved-inspection-documents`,
`certificate-send-route`, `document-preview`, `Step9_Certificados`, `WizardLayout`,
`wizardFlow`, `finalizeInspection`, `sosRules` e `checklistValidation`.

Os testes usam dados e fornecedores simulados. Não emitir documentos, enviar
mensagens ou aplicar movimentos de stock reais como smoke test de publicação.

### Resultado final — 27/10/2026

- Removida a persistência duplicada e inacessível do Resumo; a finalização usa
  exclusivamente a implementação partilhada em `finalizeInspection.ts`.
- TypeScript: passou após a limpeza.
- Suite global: 3129 testes passaram; 2 ignorados; 1 falha preexistente em
  `src/components/shared/OpenWaConnection.test.tsx`, relativa a texto de SMS na
  central de comunicações, fora deste fluxo. As 10 suites direcionadas passaram.
- ESLint dos 13 ficheiros de implementação: sem erros; permanecem avisos de
  tipagem/React já existentes, sem bloquear o build.
- Não foram executadas migrações, emissões ou mensagens reais nestas validações.
