import { classifyClientQuestion, CLIENT_GUIDANCE, codeAnswer } from "../cliente-perguntas";

it.each([
  ["Quando é a próxima vistoria?", "inspections"],
  ["Qual é o estado do pedido de assistência?", "requests"],
  ["Preciso de pedir assistência", "new-request"],
  ["Quero agendar inspeção", "new-request"],
  ["Atualizar a validade dos pirotécnicos", "pyrotechnics"],
  ["Quero alterar a minha morada", "personal-data"],
  ["Que equipamentos são obrigatórios para o meu barco?", "equipment-guide"],
  ["Quais as marcas e modelos de jangadas?", "raft-catalog"],
  ["Que tipos de pack existem?", "raft-catalog"],
  ["Onde encontro o meu certificado?", "certificate"],
  ["Onde vejo as faturas?", "invoice"],
  ["Como entrar no portal?", "access"],
  ["Sou cliente", "access"],
  ["A minha embarcação não aparece", "equipment"],
  ["Como contacto a equipa?", "support"],
  ["O meu NIF é 123456789", "sensitive"],
  ["Qual é o tempo amanhã?", "unknown"],
])("classifica localmente %s", (question, expected) => {
  expect(classifyClientQuestion(question)).toBe(expected);
});

it("não promete confirmar pagamentos ou dados desconhecidos", () => {
  expect(CLIENT_GUIDANCE.invoice).toContain("não consigo confirmar");
  expect(CLIENT_GUIDANCE.unknown).toContain("não sei responder");
  expect(CLIENT_GUIDANCE.access).toContain("Necessita de um código de acesso?");
  expect(CLIENT_GUIDANCE.access).toContain("Não diga nem escreva o NIF");
});

it("reconhece respostas à pergunta sobre o código", () => {
  expect(codeAnswer("Sim! ")).toBe("yes");
  expect(codeAnswer("Não, já tenho")).toBeNull();
  expect(codeAnswer("Não preciso")).toBe("no");
  expect(codeAnswer("certificado")).toBeNull();
});
