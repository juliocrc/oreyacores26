import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('does not fabricate NAP times or persist an inferred previous GI date', () => {
  const source = readFileSync(join(process.cwd(), 'src/modules/JangadaWizard/Step6_Testes.tsx'), 'utf8');
  expect(source).not.toContain('Introduzir automaticamente');
  expect(source).not.toMatch(/nextTestes\.napHora(?:Inicio|Fim)\s*=\s*nowHHMM/);
  expect(source).toContain('sem histórico confirmado');
});
