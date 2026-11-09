import { askJulinhoLlm, isJulinhoLlmConfigured } from '../julinho/julinho-llm';

describe('Julinho language model configuration', () => {
  const original = process.env;
  const fetchOriginal = global.fetch;
  beforeEach(() => {
    process.env = { ...original };
    for (const name of ['JULINHO_LLM_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'JULINHO_LLM_BASE_URL', 'JULINHO_LLM_MODEL']) delete process.env[name];
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'Olá!' } }] }) });
  });
  afterEach(() => { process.env = original; global.fetch = fetchOriginal; });

  it('uses Gemini when its key is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    expect(isJulinhoLlmConfigured()).toBe(true);
    expect(await askJulinhoLlm('Olá', {})).toBe('Olá!');
    expect(global.fetch).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      body: expect.stringContaining('gemini-2.5-flash'),
    }));
  });
  it('preserves explicit OpenAI configuration precedence', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    await askJulinhoLlm('Olá', {});
    expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer openai-key' }) }));
  });
});
