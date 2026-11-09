"use client";

import { useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { canUseEmailSenderProfiles } from '@/lib/email-sender-access';
import { buildLocalEmailUri } from '@/lib/local-email-compose';
import { EMAIL_SENDER_PROFILES, type SenderAccount } from './EmailSenderSelect';

export default function LocalOutlookCompose({ recipient, subject, body, senderAccount, onSenderChange, children }: {
  recipient: string;
  subject: string;
  body: string;
  senderAccount: SenderAccount;
  onSenderChange: (account: SenderAccount) => void;
  children?: ReactNode;
}) {
  const { data: session, status } = useSession();
  const [notice, setNotice] = useState('');
  if (status !== 'authenticated' || !canUseEmailSenderProfiles(session?.user?.email)) return null;

  function open() {
    try {
      const uri = buildLocalEmailUri(recipient, subject, body);
      window.location.assign(uri);
      setNotice('Pedido de abertura enviado ao Windows. Nada foi enviado nem registado como enviado nesta aplicacao. Confirme os anexos e envie manualmente no Outlook.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nao foi possivel abrir o email. Copie o texto para o Outlook manualmente.');
    }
  }

  return <section aria-label="Email local no Outlook" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
    <p>Esta opcao abre a aplicacao de email predefinida do Windows por mailto, sem exigir SMTP/OAuth. Para abrir o Outlook, defina-o como aplicacao predefinida para MAILTO nas Definicoes do Windows. O navegador nao consegue impor o Outlook nem a conta de envio.</p>
    <label className="block space-y-1 font-semibold">Conta pretendida (apenas orientacao)
      <select value={senderAccount} onChange={event => { if (event.target.value === 'julio' || event.target.value === 'tecnica') onSenderChange(event.target.value); }} className="block w-full rounded-lg border border-slate-200 bg-white p-2">
        {EMAIL_SENDER_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.email}</option>)}
      </select>
    </label>
    <p>Escolha manualmente o campo De no Outlook: {EMAIL_SENDER_PROFILES.find(profile => profile.id === senderAccount)?.email}. Nenhum anexo e adicionado automaticamente. Descarregue os documentos selecionados e anexe-os manualmente antes de enviar. Esta acao nao confirma envio ou entrega e nao atualiza o historico de comunicacoes.</p>
    {children}
    <button type="button" onClick={open} className="min-h-10 rounded-lg border border-indigo-200 bg-white px-4 py-2 font-bold text-indigo-700">Abrir no Outlook</button>
    {notice && <p role="status" className="break-words text-amber-800">{notice}</p>}
  </section>;
}
