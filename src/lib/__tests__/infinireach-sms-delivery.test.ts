import { sendInfinireachSms } from "../infinireach-sms";

const previousEnv = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => { process.env.INFINIREACH_API_KEY = "test-key"; process.env.INFINIREACH_FROM = "+351912345678"; });
afterEach(() => { process.env = { ...previousEnv }; global.fetch = originalFetch; });

it("não marca como falha definitiva uma resposta HTTP 200 ambígua", async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as jest.Mock;
  expect(await sendInfinireachSms("912345678", "Teste")).toMatchObject({ ok: false, uncertain: true });
});
it("regista o identificador quando o fornecedor confirma a colocação em fila", async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ success: true, queued: true, messageId: "sms-123" }), { status: 201 })) as jest.Mock;
  expect(await sendInfinireachSms("912345678", "Teste")).toMatchObject({ ok: true, providerId: "sms-123" });
});
