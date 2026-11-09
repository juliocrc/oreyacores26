import { notFound } from 'next/navigation';
import { WorkOrderDetail } from '@/modules/WorkOrdersWorkspace';

export default async function OrdemServicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) notFound();
  return <WorkOrderDetail id={Number(id)} />;
}
