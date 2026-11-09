import { normalizeJulinhoText } from "@/lib/julinho/julinho-intents";

export type ClientQuestion = "inspections" | "requests" | "new-request" | "pyrotechnics" | "personal-data" | "certificate" | "equipment-guide" | "raft-catalog" | "equipment" | "invoice" | "access" | "support" | "unknown" | "sensitive";

export function codeAnswer(question: string): "yes" | "no" | null {
  const answer = normalizeJulinhoText(question);
  if (/^(?:sim|claro|preciso|necessito)$/.test(answer)) return "yes";
  if (/^(?:nao|ja tenho|nao preciso)$/.test(answer)) return "no";
  return null;
}

// Local classification only: no free text or credentials are sent to a service.
export function classifyClientQuestion(question: string): ClientQuestion {
  if (/\d[\d\s.-]{7,}\d/.test(question)) return "sensitive";
  const text = normalizeJulinhoText(question);
  if (/\b(?:obrigatorio|obrigatorios|obrigatoria|exigido|exigidos|recomendado|recomendados|dotacao)\b/.test(text) && /\b(?:equipamento|equipamentos|material|materiais|embarcacao|barco|navio)\b/.test(text)) return "equipment-guide";
  if (/\b(?:marcas?|modelos?|packs?)\b/.test(text) && /\b(?:jangadas?|packs?|salva vidas)\b/.test(text)) return "raft-catalog";
  if (/\b(?:sou cliente|ja sou cliente|tenho conta)\b/.test(text)) return "access";
  if (/\b(?:pirotecnicos?|pirotecnia|foguetes?|fachos?)\b/.test(text)) return "pyrotechnics";
  if (/\b(?:dados pessoais|meus dados|morada|telemovel|telefone|contactos|email)\b/.test(text) && /\b(?:alterar|atualizar|corrigir|mudar|editar|actualizar)\b/.test(text)) return "personal-data";
  if (/\b(?:pedido|assistencia|vistoria|inspecao|reparacao)\b/.test(text) && /\b(?:pedir|preciso|solicitar|criar|novo|nova|abrir|agendar|marcar)\b/.test(text)) return "new-request";
  if (/\b(?:codigo|nif|entrar|acesso|login|palavra passe)\b/.test(text)) return "access";
  if (/\b(?:fatura|faturas|pagamento|pagar|recibo)\b/.test(text)) return "invoice";
  if (/\b(?:certificado|certificados|documento|documentos)\b/.test(text)) return "certificate";
  if (/\b(?:pedido|pedidos|assistencia|reparacao|orcamento)\b/.test(text)) return "requests";
  if (/\b(?:inspecao|inspecoes|vistoria|vistorias|validade|vencimento)\b/.test(text)) return "inspections";
  if (/\b(?:jangada|jangadas|navio|navios|embarcacao|embarcacoes|equipamento|equipamentos)\b/.test(text)) return "equipment";
  if (/\b(?:contacto|contactar|contacto|ajuda|suporte|falar)\b/.test(text)) return "support";
  return "unknown";
}

export const CLIENT_GUIDANCE: Partial<Record<ClientQuestion, string>> = {
  certificate: "Pode consultar os documentos disponíveis na sua área de cliente, na ficha da embarcação ou do equipamento. Se não encontrar o certificado, contacte a equipa.",
  equipment: "Na sua área de cliente pode consultar as embarcações e os equipamentos associados à sua conta. Se faltar algum, contacte a equipa para verificar a associação.",
  invoice: "Consulte as faturas disponibilizadas na sua área de cliente. Para esclarecer valores ou pagamentos, contacte a equipa; não consigo confirmar um pagamento por esta conversa.",
  access: "Posso ajudar. Entre na sua área de cliente para consultar os seus dados ou preparar um pedido de assistência. Necessita de um código de acesso? Abra o formulário seguro, indique o seu NIF e siga as instruções para pedir ou usar o código. Não diga nem escreva o NIF ou o código nesta conversa.",
  support: "Pode consultar ou criar um pedido de assistência na sua área de cliente. Para outros esclarecimentos, contacte a equipa da Orey Tecnica- Serviços Navais, Lda.",
  "new-request": "Para pedir assistência, abra o formulário, escolha o assunto e a prioridade, indique a embarcação ou jangada quando aplicável e descreva o que necessita. Pode indicar uma data preferida. Reveja os dados e clique em Enviar pedido; a Julia não envia por si.",
  pyrotechnics: "Para propor uma validade, abra as embarcações, selecione o navio correto e indique o artigo e a data na secção Pirotécnicos a bordo. Reveja os dados e envie as alterações para aprovação; a ficha não é atualizada diretamente.",
  "personal-data": "Pode propor alterações de morada e contactos na ficha de cliente. Reveja os campos e envie para aprovação. Para alterar o nome ou NIF, contacte a equipa. Não escreva NIF ou códigos nesta conversa.",
  "equipment-guide": "Selecione o tipo de embarcação para obter um guião inicial. A dotação obrigatória deve ser confirmada para a embarcação concreta, a zona de navegação, lotação, licença e legislação aplicável.",
  "raft-catalog": "Pode consultar marcas, modelos e packs registados no catálogo técnico. Selecione uma marca e um modelo; a listagem não confirma disponibilidade comercial nem compatibilidade com a sua embarcação.",
  sensitive: "Para proteger os seus dados, não escreva números de identificação, códigos ou números longos nesta conversa. Use os campos seguros do portal.",
  unknown: "Ainda não sei responder a essa pergunta. Pode consultar a sua área de cliente ou contactar a equipa para obter ajuda.",
};
