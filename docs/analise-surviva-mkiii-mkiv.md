# Análise técnica inicial — Surviva MK III e Marine MK IV

## Alcance e limites

Fontes locais: `manuais/Surviva MkIII Liferafts_4.pdf` (300 páginas, manual
251) e `manuais/Service Manual for Marine MK IV.pdf` (680 páginas, M269–00).
Foram extraídos e pesquisados os textos, identificados os capítulos e consultadas
as passagens citadas abaixo e as regras existentes na aplicação. **Não é uma
revisão exaustiva página a página**, nem valida a atualidade das edições. Algumas
tabelas e figuras têm estrutura visual que a extração de texto não preserva.
Nenhuma regra operacional foi aprovada por fabricante ou autoridade nesta análise.
Os manuais contêm revisões por página e apêndices por certificação; confirmar a
edição aplicável e as publicações associadas antes de executar ou automatizar.

## Estrutura global

Ambos abrangem identificação e dados, remoção, limpeza, inspeção, testes,
reparação, packs, montagem, armazenamento, ferramentas e catálogo ilustrado.
O MK IV tem apêndices adicionais, incluindo MED, USCG, Canadá, altura de queda,
variantes especiais e publicações associadas. Não são intercambiáveis.

## Constatações e oportunidades

1. **Identificação e proveniência:** definir por jangada o manual, edição,
   páginas/revisões, apêndice de aprovação, modelo, lotação, lançamento, pack,
   contentor, altura e eventual variante. Guardar fonte e grau de confiança
   para cada regra; suspender automatismos quando faltem dados. O modelo deve
   ser resolvido sem presumir que um modelo desconhecido é MK III ou MK IV.
   Por indicação do utilizador, todas as RFD SeaSava são associadas ao manual
   MK III na matriz; confirmar individualmente variante, aprovação, edição e
   compatibilidade dos componentes antes da inspeção.
2. **Programação dos testes:** MK IV cap. 5 p. 507 (PDF 121) indica GI a cada
   5 anos e NAP/FS acima de 10 anos, depois em cada serviço de 12 meses;
   MK III cap. 5 p. 507 (PDF 77) diz GI acima de 5 anos e a cada 5 anos.
   As secções específicas FS de ambos dizem a partir do décimo ano: há uma
   ambiguidade de fronteira com o texto «over ten years old». O código atual em
   `src/modules/rafts/testRules.ts` usa idade >= 10 e múltiplos de 5, sem regra
   por fabricante nem histórico GI. Rever com técnico/fabricante antes de
   automatizar; não tratar anos exatos nem a interpretação de «over» como
   definitivamente resolvidos. Alertar sobre GI atrasado e dados desconhecidos,
   considerando a data real do último GI e não apenas a idade.
3. **Testes e evidências:** MK IV cap. 5 p. 507–510 (PDF 121–124) descreve
   GI, NAP e WP; WP exige estabilização, medição por compartimento e correção
   térmica/barométrica. Ambos citam falha se queda corrigida superar 5% nas
   condições descritas. As gamas e exceções dependem do modelo, lançamento e
   aprovação. Sugerem-se campos separados por câmara, tempos reais, unidades,
   temperatura, pressão atmosférica, instrumento/calibração e repetição após
   reparação. Validar o cálculo atual em `src/lib/quadro-payload.ts` com
   exemplos aprovados e os apêndices; não usar este relatório como instrução de
   ensaio. No MK IV o próprio texto sobre GI/WP e reparação exige confirmação
   técnica antes de converter em regra automática.
4. **Válvulas, arco e costuras:** registar aplicabilidade de válvula de
   transferência, resultado e observações; verificar PRV, costura do fundo e
   intervenções. MK IV cap. 5 p. 512 (PDF 126) e MK III cap. 5 p. 514 (PDF
   84) detalham FS. O limite de idade e eventuais ensaios antecipados carecem
   de validação contextual, não só da data de fabrico.
5. **Cilindros e inflação:** rastrear por cilindro número, pesos, gás, data e
   prova, perdas, ensaio de fugas, prestador e documentos. MK IV cap. 4 p. 407
   (PDF 101) pede teste de fugas após recarga e menciona prova hidráulica em
   cinco anos, com exceções de aprovação — nunca generalizar a todos os países.
   MK IV apêndice A-14 p. 1–3 (PDF 667–669): determinadas mangueiras Leafield
   têm vida de cinco anos a partir de fabrico ou instalação conforme o desenho,
   com exceções e publicação associada atual. Registar modelo e data correta;
   não aplicar a todas as mangueiras.
6. **Equipamentos e validade:** distinguir ausência de data de artigo sem
   validade; calcular cobertura até à data efetiva da próxima inspeção,
   não apenas se vencido hoje. Apoiar referências, quantidades, lotes,
   substituição, artigos por confirmar e preço ausente; nunca presumir que um
   pack inteiro deve ser substituído. MK IV cap. 4 p. 408–410 contém exemplos
   de lâmpadas e baterias. Identificar apêndices, inspeção técnica e exceções.
7. **Fecho:** MK III cap. 8 p. 837–838 (PDF 179–180) distingue cintas, crimps,
   fita DO NOT CUT, fita opcional e cintas de catraca temporárias. MK IV cap.
   11 p. 1120 (PDF 456) relaciona contentor, pack, lotação e cintas. Usar
   tabelas verificadas de cada manual com fonte e nível de certeza; não cobrar
   todos os materiais genéricos como obrigatórios. Os 6 € por cinta são regra
   comercial informada pelo utilizador, não preço do manual.
8. **Reparações:** capturar tipo, local, extensão, materiais, lote/validade,
   cura, autorização e novo ensaio; apresentar limites e referências por manual
   apenas após transcrição e validação de tabelas/figuras. Não permitir que um
   alerta automático substitua a avaliação de reparabilidade.
9. **Rastreabilidade e registos:** associar versão da regra, técnico,
   certificação, instrumentos, resultados, exceções, peças e fotografias à
   inspeção guardada. MK IV cap. 5 p. 524 (PDF 138) indica conservação mínima
   de 10 anos para registos do ensaio de vácuo do contentor Xtrem; confirmar âmbito, legislação e retenção aplicável
   antes de impor uma política global. PDFs oficiais devem apontar à inspeção e
   revisão guardadas sem revelar informação desnecessária.
10. **Planeamento e custos:** acrescentar testes aplicáveis e respetivos preços
    configuráveis, reparações prováveis separadas das confirmadas, material de
    fecho e artigos com validade. Exibir subtotal conhecido, preços em falta,
    impostos e pressupostos. Não criar ordens nem consumir stock automaticamente.

## Prioridades propostas

P0: matriz de aplicabilidade, dados desconhecidos, revisão técnica das
periodicidades e preservação de registos; P1: evidências dos testes e rastreio de
cilindros/mangueiras; P2: catálogos por modelo, consumíveis e previsão de custos;
P3: ligações aos manuais e testes automatizados com exemplos aprovados.

Para concluir uma análise exaustiva ainda é necessário validar visualmente as
tabelas e figuras de todos os capítulos e apêndices aplicáveis, comparar as
revisões com o portal do fabricante e produzir uma matriz de rastreabilidade
revista por técnico habilitado. Não afirmar conformidade normativa sem isso.

## Autocolantes — limitações por modelo

### Surviva MK III
- Apenas o contentor MK10, tamanhos 3 e 4, lançamento TO têm autocolantes
  identificados (figura 1110 e página 1129 do manual 251): etiqueta de dados
  (04819001), altura máxima/retenida (21196001), DO NOT ROLL (41144001),
  logótipo SURVIVA (20765001), inspeção visual (05656001), marca RFD
  (06231001).
- Outros tamanhos, contentores ou lançamentos do MK III não têm autocolantes
  atribuídos automaticamente; confirmar no manual aplicável.

### Marine MK IV
- TO: etiquetas universais páginas 1152–1153 (04819001, 41144001, 43869001,
  21196001, 43973001, 05656001).
- DL: etiquetas páginas 1168–1169 para MK10, MK14 e MK20 nos tamanhos listados;
  referências distintas para MK20.
- Outros tamanhos ou contentores não listados não têm autocolantes atribuídos
  automaticamente.

### SeaSava Plus e SeaSava Plus R
- Não há manuais locais para estes modelos; não atribuir referências de
  autocolantes por aproximação ao MK III ou MK IV.
- Todas as RFD SeaSava são associadas ao manual MK III na matriz de
  aplicabilidade por indicação do utilizador, mas a identificação dos
  autocolantes deve ser confirmada individualmente (variante, aprovação, edição
  e compatibilidade dos componentes).
- A aplicação retorna `supported: false` para SeaSava Plus e Plus R até que
  haja evidência documental confirmada.

## Estado
Os autocolantes são apresentados como apoio consultivo na ficha da jangada e
na checklist de inspeção; não criam passos independentes nem descontam stock
automaticamente.
