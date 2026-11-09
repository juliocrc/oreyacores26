"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles, X } from "lucide-react";
import { clientCertificateLinks, formatClientInspections, formatClientRequests } from "./cliente-consultas";
import { classifyClientQuestion, CLIENT_GUIDANCE, codeAnswer } from "./cliente-perguntas";
import { getNavioLegalProfile } from "@/modules/navios/legalRequirements";
import { NAVIO_TIPO_PESCA_OPTIONS } from "@/lib/navio-legal-types";
import { raftModelData } from "@/modules/rafts/raftModelData";
import { PACK_TEMPLATES, type PackType } from "@/config/packTemplates";

// Free text is classified locally; there is no microphone or external AI.
// Credentials remain exclusively in the portal's existing login form.
export default function JulinhoCliente() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [question, setQuestion] = useState("");
  const [certificates, setCertificates] = useState<Array<{ label: string; href: string }>>([]);
  const [showRequestLink, setShowRequestLink] = useState(false);
  const [proposalLink, setProposalLink] = useState<"navios" | "dados" | null>(null);
  const [showLoginLink, setShowLoginLink] = useState(false);
  const [awaitingCodeAnswer, setAwaitingCodeAnswer] = useState(false);
  const [showEquipmentGuide, setShowEquipmentGuide] = useState(false);
  const [vesselType, setVesselType] = useState("");
  const [showRaftCatalog, setShowRaftCatalog] = useState(false);
  const [raftBrand, setRaftBrand] = useState("");
  const [raftModel, setRaftModel] = useState("");
  const [packType, setPackType] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadStep, setLeadStep] = useState(0);
  const [leadError, setLeadError] = useState("");
  const [lead, setLead] = useState({ nome: "", telefone: "", email: "", navio: "", descricao: "", ultimaInspecao: "", certificado: "" });
  const [leadConfirmed, setLeadConfirmed] = useState(false);
  const leadLock = useRef(false);
  const sessionEpoch = useRef(0);
  const isClient = status === "authenticated" && session?.user?.role === "CLIENTE";
  useEffect(() => {
    sessionEpoch.current += 1;
    setPhone("");
    setPhoneConfirmed(false);
    setBusy(false);
    setReply("");
    setQuestion("");
    setCertificates([]);
    setShowRequestLink(false);
    setProposalLink(null);
    setShowLoginLink(false);
    setAwaitingCodeAnswer(false);
    setShowEquipmentGuide(false);
    setVesselType("");
    setShowRaftCatalog(false);
    setRaftBrand("");
    setRaftModel("");
    setPackType("");
  }, [session?.user?.id, session?.user?.clienteId, status]);

  async function confirmPhone(event: React.FormEvent) {
    event.preventDefault();
    if (!isClient || busy) return;
    setBusy(true);
    setReply("");
    try {
      const response = await fetch("/api/portal/confirmar-telemovel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      if (!response.ok) throw new Error("invalid");
      setPhone("");
      setPhoneConfirmed(true);
      setReply("Número confirmado com a ficha. Esta confirmação não substitui o código de acesso.");
    } catch {
      setReply("Não foi possível confirmar o telemóvel. Verifique o número ou contacte a equipa.");
    } finally { setBusy(false); }
  }

  async function summary() {
    if (!isClient || busy) return;
    setShowRequestLink(false);
    setBusy(true);
    setReply("");
    try {
      const response = await fetch("/api/portal/cliente", { cache: "no-store" });
      if (!response.ok) throw new Error("portal unavailable");
      const data = await response.json();
      const ships = Array.isArray(data?.cliente?.navios) ? data.cliente.navios : [];
      const rafts = ships.reduce((count: number, ship: { jangadas?: unknown }) => count + (Array.isArray(ship.jangadas) ? ship.jangadas.length : 0), 0);
      setReply(`Na sua área estão associados ${ships.length} navios e ${rafts} jangadas. Consulte os detalhes na área de cliente.`);
    } catch {
      setReply("Não consegui consultar os seus dados. Verifique a sessão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function consult(topic: "inspections" | "requests") {
    if (!isClient || !phoneConfirmed || busy) return;
    setShowRequestLink(false);
    setBusy(true);
    setReply("");
    try {
      const response = await fetch(topic === "inspections" ? "/api/portal/cliente" : "/api/portal/pedidos-assistencia", { cache: "no-store" });
      if (!response.ok) throw new Error("portal unavailable");
      const data = await response.json();
      setReply(topic === "inspections" ? formatClientInspections(data?.cliente?.navios) : formatClientRequests(data?.pedidos));
    } catch {
      setReply("Não consegui consultar os seus dados. Verifique a sessão e tente novamente.");
    } finally { setBusy(false); }
  }

  async function askQuestion(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !question.trim()) return;
    const answer = awaitingCodeAnswer ? codeAnswer(question) : null;
    if (answer === "yes") {
      setQuestion("");
      setAwaitingCodeAnswer(false);
      setShowLoginLink(true);
      setReply("Abra o acesso seguro e peça o código seguindo as instruções do formulário. Introduza o NIF apenas nesse formulário; não o escreva nesta conversa.");
      return;
    }
    if (answer === "no") {
      setQuestion("");
      setAwaitingCodeAnswer(false);
      setShowLoginLink(true);
      setReply("Pode entrar no formulário seguro com os seus dados de acesso. Não escreva o NIF ou o código nesta conversa.");
      return;
    }
    const topic = classifyClientQuestion(question);
    setQuestion("");
    setCertificates([]);
    setShowRequestLink(topic === "new-request");
    setProposalLink(topic === "pyrotechnics" ? "navios" : topic === "personal-data" ? "dados" : null);
    setShowLoginLink(topic === "access" && !isClient);
    setAwaitingCodeAnswer(topic === "access" && !isClient);
    setShowEquipmentGuide(topic === "equipment-guide");
    setShowRaftCatalog(topic === "raft-catalog");
    if (topic === "certificate") {
      if (!isClient || !phoneConfirmed) {
        setReply("Para consultar os certificados, entre na área de cliente e confirme o telemóvel registado.");
      } else {
        const epoch = sessionEpoch.current;
        setBusy(true);
        try {
          const response = await fetch("/api/portal/cliente", { cache: "no-store" });
          if (!response.ok) throw new Error();
          const data = await response.json();
          const links = clientCertificateLinks(data?.cliente?.navios);
          if (sessionEpoch.current !== epoch) return;
          setCertificates(links);
          setReply(links.length ? "Escolha a embarcação e a jangada para descarregar o último certificado disponível. O acesso é verificado pelo portal." : "Não encontrei certificados disponíveis na sua conta. Contacte a equipa para confirmar.");
        } catch { if (sessionEpoch.current === epoch) setReply("Não consegui consultar os certificados. Verifique a sessão e tente novamente."); }
        finally { if (sessionEpoch.current === epoch) setBusy(false); }
      }
      return;
    }
    if (topic === "inspections" || topic === "requests") {
      if (!isClient || !phoneConfirmed) {
        setReply("Para consultar os seus dados, entre na área de cliente e confirme o telemóvel registado.");
      } else {
        await consult(topic);
      }
      return;
    }
    setReply(CLIENT_GUIDANCE[topic] || CLIENT_GUIDANCE.unknown!);
  }

  async function submitLead(event: React.FormEvent) {
    event.preventDefault();
    if (leadLock.current || !leadConfirmed) return;
    leadLock.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/publico/julia-assistencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lead, confirmed: true }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Não foi possível enviar o pedido.");
      setLead({ nome: "", telefone: "", email: "", navio: "", descricao: "", ultimaInspecao: "", certificado: "" });
      setLeadConfirmed(false);
      setLeadOpen(false);
      setLeadStep(0);
      setReply(`Pedido #${result.id} registado para contacto da equipa. Não foi criada uma conta de cliente.`);
    } catch (error) {
      setReply(error instanceof Error ? error.message : "Não foi possível enviar o pedido.");
    } finally { leadLock.current = false; setBusy(false); }
  }

  function nextLeadStep() {
    if (leadStep === 0 && !lead.nome.trim()) return setLeadError("Indique o seu nome.");
    if (leadStep === 1 && !lead.telefone.trim() && !lead.email.trim()) return setLeadError("Indique um telefone ou email para contacto.");
    if (leadStep === 3 && !lead.descricao.trim()) return setLeadError("Descreva o que necessita.");
    setLeadError("");
    setLeadStep(step => Math.min(step + 1, 4));
  }

  return <div className="print:hidden">
    {!open ? <button type="button" aria-label="Abrir a Julia para clientes" onClick={() => setOpen(true)} className="fixed bottom-28 right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl focus-visible:ring-4 focus-visible:ring-indigo-300"><Sparkles aria-hidden /></button> :
      <section role="dialog" aria-label="Julia para clientes" className="fixed inset-x-3 bottom-28 z-[95] max-h-[min(76vh,calc(100dvh-8rem))] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-96">
        <header className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white"><div><p className="font-bold">Julia</p><p className="text-xs">Assistente virtual · área de cliente</p></div><button type="button" aria-label="Fechar a Julia" onClick={() => setOpen(false)} className="rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-white"><X size={20} /></button></header>
        <div className="space-y-3 p-4 text-sm text-slate-700">
          <p>Olá! Sou a Julia, assistente virtual da Orey Tecnica- Serviços Navais, Lda. Para proteger os seus dados, não escreva nem diga o NIF ou o código nesta conversa.</p>
          {!isClient && <><button type="button" onClick={() => setLeadOpen(!leadOpen)} className="rounded-lg border border-indigo-300 px-3 py-2 font-semibold text-indigo-700">Pedir contacto à equipa</button>{leadOpen && <form onSubmit={submitLead} className="space-y-2 rounded-lg border border-indigo-200 p-3">
            <p>Indique como podemos ajudar. A equipa receberá os dados em Pedidos de Assistência; não é criada uma conta.</p>
            <p className="text-xs font-semibold text-indigo-700">Passo {leadStep + 1} de 5</p>
            {([['nome', 'Qual é o seu nome?', 0], ['telefone', 'Qual é o seu telefone? (ou indique email)', 1], ['email', 'Qual é o seu email? (ou indique telefone)', 1], ['navio', 'Qual é o nome da embarcação? (opcional)', 2], ['certificado', 'Número do último certificado (opcional)', 2]] as const).filter(([, , step]) => step === leadStep).map(([key, label]) => <label key={key} className="block">{label}<input maxLength={key === 'email' ? 254 : key === 'telefone' ? 40 : key === 'certificado' ? 100 : 120} type={key === 'email' ? 'email' : key === 'telefone' ? 'tel' : 'text'} value={lead[key]} onChange={event => { setLead({ ...lead, [key]: event.target.value }); setLeadConfirmed(false); }} className="block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>)}
            {leadStep === 2 && <><label className="block">Data da última inspeção (opcional)<input type="date" value={lead.ultimaInspecao} onChange={event => { setLead({ ...lead, ultimaInspecao: event.target.value }); setLeadConfirmed(false); }} className="block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><p className="text-xs text-slate-500">Os dados declarados serão verificados pela equipa e não dão acesso a certificados.</p></>}
            {leadStep === 3 && <label className="block">Como podemos ajudar?<textarea maxLength={1200} value={lead.descricao} onChange={event => { setLead({ ...lead, descricao: event.target.value }); setLeadConfirmed(false); }} className="block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
            {leadStep === 4 && <><div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3"><strong>Reveja o pedido:</strong>{`\nNome: ${lead.nome}\nTelefone: ${lead.telefone || 'não indicado'}\nEmail: ${lead.email || 'não indicado'}\nEmbarcação: ${lead.navio || 'não indicada'}\nÚltima inspeção: ${lead.ultimaInspecao || 'não indicada'}\nCertificado: ${lead.certificado || 'não indicado'}\nPedido: ${lead.descricao}`}</div><label className="flex gap-2"><input type="checkbox" checked={leadConfirmed} onChange={event => setLeadConfirmed(event.target.checked)} /><span>Confirmei os dados e autorizo o envio deste pedido à equipa para me contactar.</span></label></>}
            {leadError && <p role="alert" className="text-red-700">{leadError}</p>}
            <div className="flex gap-2">{leadStep > 0 && <button type="button" onClick={() => { setLeadStep(leadStep - 1); setLeadConfirmed(false); setLeadError(""); }} className="rounded-lg border border-slate-300 px-3 py-2">Voltar</button>}{leadStep < 4 ? <button type="button" onClick={nextLeadStep} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">Continuar</button> : <button type="submit" disabled={busy || !leadConfirmed} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "A enviar…" : "Enviar pedido de contacto"}</button>}</div>
          </form>}</>}
          <form onSubmit={askQuestion} className="space-y-2"><label htmlFor="julinho-client-question" className="block font-semibold">Como posso ajudar?</label><input id="julinho-client-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={300} placeholder="Por exemplo: onde vejo o certificado?" className="w-full rounded-lg border border-slate-300 px-3 py-2" /><button type="submit" disabled={busy || !question.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Perguntar</button></form>
          {status === "loading" ? <p>A verificar sessão…</p> : isClient ? <><p>A sua sessão de cliente está ativa.</p>{!phoneConfirmed ? <form onSubmit={confirmPhone} className="space-y-2"><label className="block font-semibold" htmlFor="julinho-client-phone">Confirme o telemóvel registado</label><input id="julinho-client-phone" type="tel" autoComplete="tel" required maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /><button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "A verificar…" : "Confirmar telemóvel"}</button></form> : <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void summary()} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">O meu resumo</button><button type="button" disabled={busy} onClick={() => void consult("inspections")} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Próximas inspeções</button><button type="button" disabled={busy} onClick={() => void consult("requests")} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Pedidos de assistência</button></div>}<a className="block font-semibold text-indigo-700 underline" href="/area-cliente">Abrir a minha área de cliente</a></> : <><p>Para consultar os seus dados, entre no portal usando o seu NIF e código temporário nos campos seguros de acesso. Depois poderá confirmar o telemóvel registado.</p><a className="inline-block rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white" href="/area-cliente/login">Identificar-me com NIF e código</a></>}
          {isClient && phoneConfirmed && <button type="button" disabled={busy} onClick={() => setReply("Sugestões: consulte as próximas inspeções e os pedidos de assistência na sua área. Confirme os detalhes de cada equipamento e contacte a equipa se precisar de esclarecimentos. Estas sugestões não substituem a avaliação técnica.")} className="rounded-lg border border-indigo-300 px-3 py-2 font-semibold text-indigo-700 disabled:opacity-50">Sugestões para mim</button>}
          {reply && <p role="status" className="whitespace-pre-line rounded-lg bg-slate-50 p-3">{reply}</p>}
          {certificates.length > 0 && <ul className="space-y-2">{certificates.map(item => <li key={item.href}><a href={item.href} className="font-semibold text-indigo-700 underline">{item.label}</a></li>)}</ul>}
          {showEquipmentGuide && <div className="space-y-2 rounded-lg border border-indigo-200 p-3"><label className="block font-semibold">Tipo de embarcação<select value={vesselType} onChange={event => setVesselType(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Escolha o tipo</option>{NAVIO_TIPO_PESCA_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>{vesselType && (() => { const profile = getNavioLegalProfile(vesselType); return <><p className="font-semibold">Guião inicial: {profile.label}</p><p>{profile.legalNote}</p><ul className="list-disc space-y-1 pl-5">{profile.requirements.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}:</strong> {item.detail}</li>)}</ul><p className="text-xs">Não é uma lista certificada de equipamentos obrigatórios ou quantidades. Confirme com a equipa técnica e a autoridade competente.</p><a href="https://www.dgrm.pt/" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 underline">Consultar a DGRM</a></>; })()}</div>}
          {showRaftCatalog && <div className="space-y-2 rounded-lg border border-indigo-200 p-3"><label className="block font-semibold">Marca<select value={raftBrand} onChange={event => { setRaftBrand(event.target.value); setRaftModel(""); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Escolha uma marca</option>{Object.keys(raftModelData).sort().map(brand => <option key={brand} value={brand}>{brand}</option>)}</select></label>{raftBrand && <label className="block font-semibold">Modelo<select value={raftModel} onChange={event => setRaftModel(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Escolha um modelo</option>{(raftModelData[raftBrand] || []).map((model, index) => <option key={`${model.name}-${index}`} value={model.name}>{model.name}</option>)}</select></label>}{raftModel && (() => { const model = (raftModelData[raftBrand] || []).find(item => item.name === raftModel); return <p>{model?.packTypes?.length ? `Packs registados para este modelo: ${model.packTypes.join(", ")}.` : "Não há tipos de pack indicados para este modelo no catálogo técnico."}</p>; })()}<p className="text-xs">Catálogo técnico parcial; não confirma disponibilidade, homologação nem adequação. Confirme com a equipa.</p></div>}
          {showRaftCatalog && <div className="space-y-2 rounded-lg border border-indigo-200 p-3"><label className="block font-semibold">Consultar conteúdo de um pack<select value={packType} onChange={event => setPackType(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Escolha um tipo de pack</option>{Object.keys(PACK_TEMPLATES).sort().map(name => <option key={name} value={name}>{name}</option>)}</select></label>{packType && <><p>Artigos previstos no modelo interno {packType}:</p><ul className="list-disc pl-5">{PACK_TEMPLATES[packType as PackType].map((item, index) => <li key={`${item.nome}-${index}`}>{item.nome}</li>)}</ul><p className="text-xs">Lista indicativa, não o conteúdo confirmado de uma jangada. Quantidades e requisitos variam conforme lotação, fabricante, modelo, normas e inspeção; confirme a ficha aplicável com a equipa técnica.</p></>}</div>}
          {showRequestLink && <a href={isClient ? "/area-cliente#pedido-assistencia" : "/area-cliente/login"} onClick={() => setOpen(false)} className="inline-block rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">{isClient ? "Abrir formulário de assistência" : "Entrar para pedir assistência"}</a>}
          {proposalLink && <a href={isClient ? `/area-cliente#${proposalLink === "navios" ? "navios-cliente" : "dados-cliente"}` : "/area-cliente/login"} onClick={() => setOpen(false)} className="inline-block rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">{isClient ? "Abrir formulário de alteração" : "Entrar para propor alterações"}</a>}
          {showLoginLink && <a href="/area-cliente/login" onClick={() => setOpen(false)} className="inline-block rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">Introduzir NIF no acesso seguro</a>}
          <p className="text-xs text-slate-500">Nesta área, o assistente não envia perguntas, códigos ou dados de cliente para serviços de IA ou de voz.</p>
        </div>
      </section>}
  </div>;
}
