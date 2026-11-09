import { NextRequest } from 'next/server';
import { handleWorkTime } from '@/lib/ordem-work-time';

function handle(req: NextRequest) {
  return handleWorkTime(req, Number(new URL(req.url).pathname.split('/').at(-2)), 'order');
}

export { handle as GET, handle as POST };
