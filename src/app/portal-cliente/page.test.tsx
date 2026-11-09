import { redirect } from 'next/navigation';
import PortalClientePage from './page';

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

it('redirects shipped portal links to the single client entry point', () => {
  PortalClientePage();
  expect(redirect).toHaveBeenCalledWith('/area-cliente/login#pedir-codigo');
});
