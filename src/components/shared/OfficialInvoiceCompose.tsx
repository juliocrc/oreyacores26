"use client";

import { useState } from 'react';
import LocalOutlookCompose from './LocalOutlookCompose';
import type { SenderAccount } from './EmailSenderSelect';
import { useWhatsAppAllowed } from '@/lib/use-whatsapp-allowed';

export default function OfficialInvoiceCompose({ invoiceId, officialNumber, clientName, portalUrl }: {
  invoiceId: number; officialNumber: string; clientName: string; portalUrl: string;
}) {
  const [recipient, setRecipient] = useState('');
  const [sender, setSender] = useState<SenderAccount>('tecnica');
  const [notice, setNotice] = useState('');
  const { allowed: whatsappAllowed } = useWhatsAppAllowed();
  const subject = `Fatura oficial Navision ${officialNumber}`;
  const body = `Exmos. Senhores ${clientName},\n\nDisponibilizamos a fatura oficial Navision ${officialNumber} em PDF. Pode consulta-la e descarrega-la na sua area de cliente, apos iniciar sessao:\n${portalUrl}\n\nCom os melhores cumprimentos,\nOrey Tecnica- Serviços Navais, Lda`;

  return <section aria-label="Modelos da fatura oficial" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
    <p className="font-bold">Preparar mensagem: {officialNumber}</p>
    <p>Descarregue o PDF oficial abaixo e anexe-o manualmente no Outlook ou WhatsApp. Nenhum anexo e adicionado automaticamente. Reveja o destinatario e o texto antes de enviar. Preparar nao envia nem regista envio ou entrega.</p>
    <a href={`/api/faturas/${invoiceId}/oficial`} className="block font-semibold text-indigo-700 underline">Descarregar PDF oficial para anexar manualmente</a>
    <label className="block">Email do destinatario (confirmar manualmente)
      <input type="email" value={recipient} onChange={event => setRecipient(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
    </label>
    <label className="block">Assunto<input readOnly value={subject} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
    <label className="block">Modelo de email / WhatsApp<textarea readOnly value={body} rows={9} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
    <LocalOutlookCompose recipient={recipient} subject={subject} body={body} senderAccount={sender} onSenderChange={setSender} />
    {whatsappAllowed && <button type="button" onClick={() => {
      window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
      setNotice('Pedido de abertura do WhatsApp. Selecione o contacto e anexe manualmente o PDF oficial descarregado. Nada foi enviado nem registado pela aplicacao.');
    }} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 font-semibold text-emerald-700">Preparar no WhatsApp</button>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
