import React from 'react';
import { getRaftManualApplicability } from '@/lib/raft-manual-applicability';

export default function ManualReferenceNotice({ brand, model, topic }: { brand?: string | null; model?: string | null; topic: 'testes' | 'reparacoes' }) {
  const { manual, identificationNote } = getRaftManualApplicability({ brand, model });
  const isEurovinil = brand?.trim().toUpperCase() === 'EUROVINIL';
  const isViking = manual?.includes('VIKING') === true;
  const isDuarry = manual?.includes('DUARRY') === true;
  return <aside className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950" aria-label="Referência do manual">
    <p className="font-semibold">Manual técnico: {manual || 'modelo por confirmar'}</p>
    <p className="mt-1">{isEurovinil ? (topic === 'testes' ? 'Consultar a secção de ensaios do manual aplicável; a numeração varia entre manuais.' : 'Consultar a secção de reparações do manual aplicável; a numeração varia entre manuais.') : 'Consultar a secção aplicável do manual para este passo.'} Confirme modelo, aprovação, edição e publicações associadas. A biblioteca abre na pasta geral, não numa página específica; não é garantido que contenha este manual.</p>
    {identificationNote && <p className="mt-1">{identificationNote}</p>}
    {manual?.includes('Ocean Safety Ocean ISO') && <p className="mt-1">O manual de 2020 distingue cilindros ISO antes e depois de 2013 e UltraLite com ar comprimido. Confirme a etiqueta e o sistema instalado; não selecione carga ou método apenas pela lotação.</p>}
    {isDuarry && <p className="mt-1">DUARRY: verificar o tipo de liferaft (SOLAS/ISO - Coast/Dynamic ISO). Alguns modelos SOLAS exigem certificação da estação de serviço; confirmar autorização aplicável antes da inspeção.</p>}
    {isEurovinil && <div className="mt-2 space-y-1">
      <p className="font-semibold">EUROVINIL LEISURE SYNTESY — ensaios Eurovinil (Ver. Apr/21)</p>
      <p>WP: pelo menos a cada 2 anos (serviço ≤36 meses após a última inspeção). NAP: 0,5 bar no tubo superior, 5 minutos; se as costuras do piso/subida superarem 2 cm, pode tolerar-se até 2 cm, e a falha implica rejeição/condenação das costuras.</p>
      <p>GI: de 5 em 5 anos, se aplicável. FS: a partir do 5.º ano, anualmente. OP (sobrepresão 0,206 bar / 2,17 psi): obrigatório/apenas nos ISO9650-1 Type 1 e só nos primeiros 5 anos, salvo degradação.</p>
      <p>Tabelas: ISO — NAP/FS+WP a partir do 13.º ano; não-ISO + Compact-Dry — GI+FS+WP aos 10 anos e NAP aos 11 anos, depois anual. Confirmar o modelo exato nas tabelas 3.1 e 3.2 do manual antes da inspeção.</p>
      <p>Preliminar: inspeção visual completa, blast test, PRV, cilindros, válvulas, costuras, luzes/fusíveis e pacote. NAP realizado ao fim da prestação do serviço. Easy-Dry: serviço a cada 4 anos (ou intervalo aplicável do documento).</p>
    </div>}
    {manual?.includes('Surviva MK III') && <div className="mt-2 space-y-1">
      <p className="font-semibold">SURVIVA MK III (Service Manual) — NAP/pressure test</p>
      <p>Pressão de trabalho nominal: 2,8 psi (1970-2100 mm WG). O NAP test é executado a <strong>duas vezes a pressão de trabalho</strong>, com os dois PRV tampados, manutenção mínima de 5 minutos; não pode haver deslizamento de costuras ou fissuração, e a perda de pressão (corrigida para temperatura e barométrica) não pode exceder 5%.</p>
      <p>Para o WP test: insuflar cada compartimento entre 1970 e 2100 mm WG, manter 60 min, olhar leaks/porosidade; manter 30 min + 60 min (norma do manual). NAP é obrigatório em jangadas com mais de 10 anos (ou quando aplicável).</p>
      <p>Regras básicas: não insuflar através dos hoses; remover tampas dos PRV após teste; usar manómetro; registar temperaturas e pressão barométrica; se falha, reparar dentro dos limites (cap. 6) e repetir.</p>
    </div>}
    {manual?.includes('Marine MK IV') && <div className="mt-2 space-y-1">
      <p className="font-semibold">RFD Surviva MK IV / Marine MK IV (M269-00) — NAP/pressure test</p>
      <p>Pressão de trabalho nominal: throw-over <strong>2,8 psi</strong> (1970-2250 mm WG / 193-221 mb) e davit-launch <strong>3,5 psi</strong> (2441-2814 mm WG / 239-276 mb). O NAP test é executado a <strong>duas vezes a pressão de trabalho</strong>, com os dois PRV tampados, manutenção mínima de 5 minutos; não pode haver deslizamento de costuras ou fissuração, e a perda de pressão corrigida não pode exceder 5%.</p>
      <p>Para o WP (hemispherical) test: throw-over insuflar entre 2,8 psi / 1970 mm WG / 193 mb e 3,2 psi / 2250 mm WG / 221 mb; davit-launch entre 3,5 psi / 2441 mm WG / 239 mb e 4 psi / 2814 mm WG / 276 mb; manter 60 min, olhar leaks/porosidade (tubos não devem ser insuflados via hoses). NAP obrigatório em jangadas com mais de 10 anos (ou quando aplicável).</p>
      <p>Avisos: não insuflar os compartimentos através dos hoses; desinsuflar arcos/ituríngia/bancos abaixo da WP conforme o manual; retirar tampas dos PRV após teste e re-insuflar à WP; regista temperatura e barométrica; a abrupta queda + “cracking” pode condenar a jangada.</p>
    </div>}
    {isViking && <div className="mt-2 space-y-1">
      <p className="font-semibold">VIKING — secção 2.2.3 (NAP test, IMO Res. A.761(18))</p>
      <p>Ensaio para detetar jangadas já não funcionais por deterioração/idade das lonas e costuras. <strong>Não ensaiar o piso inflável.</strong></p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Registar a <strong>pressão inicial</strong> na checklist de serviço. Fechar as válvulas de alívio e subir a pressão, de forma gradual, até ao <strong>dobro da pressão de trabalho</strong> (ver tabela abaixo).</li>
        <li>Após 5 minutos não pode haver deslizamento de costuras, fissuração ou queda significativa de pressão. Registar a <strong>pressão final</strong> na checklist.</li>
        <li>Se passou, desinsuflar arco (arch tube), rampa de embarque e bancos (thwarts) pelas tampas de desinsuflação para baixar a pressão abaixo da WP.</li>
        <li>Retirar as tampas das válvulas de alívio de pressão e re-insuflar a jangada até à pressão de trabalho.</li>
        <li>Registar na log card, no plano de inspeções e no certificado de reinspeção que o NAP test foi efetuado.</li>
        <li>Com resultados satisfatórios, prosseguir com os procedimentos de serviço normais.</li>
      </ol>
      <p className="mt-1 font-semibold">Pressões de ensaio (dobro da WP)</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Throw-over, lotações 4/6/8/10/12/16/20/25: <strong>294 mbar / 220 mmHg / 4,25 psi</strong>.</li>
        <li>DKS por davit — lotação 12: <strong>480 mbar / 360 mmHg / 6,96 psi</strong> (reversível throw-over/davit).</li>
        <li>DKS por davit — lotação 12/16/20/25: <strong>480 mbar / 360 mmHg / 6,96 psi</strong> (davit).</li>
      </ul>
      <p>Queda significativa de pressão: perda imediata de pressão audível, visível ou desinsuflação acelerada perceptível dos tubos de flutuação.</p>
    </div>}
    <a className="mt-2 inline-block font-semibold text-indigo-700 underline" href="/api/manuais/biblioteca" target="_blank" rel="noopener noreferrer">Abrir biblioteca de manuais</a>
  </aside>;
}
