import { defaultPermissionsForRole } from '../user-permissions';

describe('defaultPermissionsForRole', () => {
  test('inclui a estacao de servico para utilizadores mesmo fora do tema deluxe', () => {
    const permissions = defaultPermissionsForRole('USER');

    expect(permissions.visibleModules).toContain('estacao-servico');
    expect(permissions.visiblePages).toContain('/estacao-servico');
    expect(permissions.editablePages).toContain('/estacao-servico');
  });
});
