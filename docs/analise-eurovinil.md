# Análise inicial — manuais Eurovinil

- ISO TYPE1/TYPE2 e MARINER (EV), Ver. 1, junho 2017: modelos M14, tabela 1.1; ensaios 3.2, reparações 3.6, contentores e fecho tabelas 4.1–4.5, etiquetas 4.3 e 5.3–5.4.
- Leisure Syntesy, Crewsaver ISO Type1/2 MK2 e Mariner MK2, Ver. 1, abril 2021: modelos na tabela 1.1; ensaios e calendários 3.2/tabelas 3.1–3.2; reparações 3.6; contentores e cintas tabelas 4.1–4.11; etiquetas tabelas 4.12–4.16.
- As tabelas dependem de variante, aprovação, pack, contentor e geração. Não inferir automaticamente calendários, cargas, peças ou quantidades. Um nome genérico ISO Type 1/2 não identifica com segurança qual manual se aplica.
- Os dois manuais alertam para não utilizar talco nas jangadas Eurovinil e exigem pessoal e estações aprovados. A edição atual e boletins têm de ser confirmados.
- Há divergências internas a esclarecer: no manual 2021, secção 3.4.4.5 menciona dois códigos diferentes de obturador VTE/99; a secção 3.2.5 e 3.2.6 apresenta limites de abertura PRV que exigem esclarecimento. Não automatizar estes valores.
- Os documentos fornecidos restringem reprodução e distribuição; não foram adicionados ao repositório nem à biblioteca externa. O link da aplicação abre apenas a pasta geral e não garante a presença dos PDFs.
- O manual Survitec M283, Ver. 3, abril de 2012, inclui o apêndice 1 para EV ISO e o apêndice 2 para contentores GLR; não é automaticamente aplicável a todas as Eurovinil. O ensaio POPVT e o calendário requerem verificação da configuração e revisão aplicáveis.
- As entradas Crewsaver com “EV 2017” são identificadores internos para distinguir a edição de 2017 de MK2; não são referências de fabricante. Novas variantes sem dados confirmados não têm especificações de carga.
- Os valores de carga Syntesy existentes referem tabelas de embalagem ou histórico e não foram verificados como tabela de cargas; o resolvedor de cargas não os devolve automaticamente. Os valores antigos permanecem no catálogo e não devem ser tratados como confirmados.

## Inventário de modelos nas tabelas 1.1

- Manual 2017, geração M14, designações Crewsaver: ISO TYPE1 >24H, ISO TYPE1 >24H GRAB-BAG, ISO TYPE1 <24H, ISO TYPE2, ISO TYPE1 SOLAS-B, ISO TYPE1 >24H USA, ISO TYPE1 <24H USA, MARINER e MARINER USA. A tabela indica ABS, VTR e/ou valise conforme a variante; não confundir marca comercial com fabricante.
- Manual 2021, marca EUROVINIL: SYNTESY 9650-1 >24H; >24H GRAB-BAG; <24H; 9650-2; 9650-1 SOLAS-B; 9650-1 >24H USA; 9650-1 <24H USA; 9650-IT; 9650-1 IT G/B; SYNTESY-INTL; SYNTESY-USA; SYNTESY-E USA; SYNTESY GREEK; COMPACT-DRY.
- Manual 2021, marca CREWSAVER: ISO TYPE1 MK2 (SYNTESY) >24H, >24H G/B e <24H; ISO TYPE2 MK2 (SYNTESY); MARINER MK2 e MARINER MK2 USC. Não criar automaticamente estes modelos sob a marca EUROVINIL.
- Identificadores como `EV-M14-I1-24-004` existentes no catálogo são identificadores internos, não códigos de fabricante demonstrados pelas tabelas. As designações genéricas existentes não identificam com segurança a geração.

## Verificação da tabela de carga M14

O manual de 2017, tabela 3.5, página 3.25 (página 41 do PDF), apresenta cargas por variante e lotação. Por exemplo, ISO TYPE1 4P: CO₂ 2010 g, N₂ 80 g, cilindro 4 L; ISO TYPE2 8P: CO₂ 2350 g, N₂ 100 g, cilindro 4 L. A correspondência tem de ser confirmada pela identidade da jangada, válvula e edição antes de qualquer utilização operacional.

A tabela enumera ST-USA 4P–6P e 8P, não MARINER USA. Não se deve presumir equivalência entre ST-USA e MARINER USA. Rever a identificação de todos os modelos existentes antes de modificar ou automatizar cargas.
