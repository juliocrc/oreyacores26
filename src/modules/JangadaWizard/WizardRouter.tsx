"use client";
import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { getWizardSteps } from './steps';
import WizardLayout from './WizardLayout';

import Step1_DadosGerais from './Step1_DadosGerais';
import Step2_Checklist from './Step2_Checklist';
import Step3_Componentes from './Step3_Componentes';
import Step4_PackMascara from './Step4_PackMascara';
import Step5_Cilindros from './Step5_Cilindros';
import Step6_Testes from './Step6_Testes';
import Step6B_Reparacoes from './Step6B_Reparacoes';
import Step6C_BoletinsServico from './Step6C_BoletinsServico';
import Step7_Orcamento from './Step7_Orcamento';
import Step8_ResumoFinal from './Step8_ResumoFinal';
import Step9_Certificados from './Step9_Certificados';
import Step10_Historico from './Step10_Historico';

export default function WizardRouter() {
  const { currentStep, inspectionData, hideOrcamento, setHideOrcamento } = useJangadaWizardStore();
  const { data: session } = useSession();

  useEffect(() => {
    const isTechnician = session?.user?.role === 'USER';
    if (isTechnician !== hideOrcamento) setHideOrcamento(isTechnician);
  }, [session?.user?.role, hideOrcamento, setHideOrcamento]);

  const steps = getWizardSteps(inspectionData, { hideOrcamento });
  const stepKey = steps[currentStep - 1]?.key ?? 'dados';

  const renderStep = () => {
    switch (stepKey) {
      case 'dados': return <Step1_DadosGerais />;
      case 'checklist': return <Step2_Checklist />;
      case 'componentes': return <Step3_Componentes />;
      case 'pack': return <Step4_PackMascara />;
      case 'cilindros': return <Step5_Cilindros />;
      case 'testes': return <Step6_Testes />;
      case 'boletins': return <Step6C_BoletinsServico />;
      case 'reparacoes': return <Step6B_Reparacoes />;
      case 'orcamento': return <Step7_Orcamento />;
      case 'resumo': return <Step8_ResumoFinal />;
      case 'certificados': return <Step9_Certificados />;
      case 'historico': return <Step10_Historico />;
      default: return <Step1_DadosGerais />;
    }
  };

  return (
    <WizardLayout>
      {renderStep()}
    </WizardLayout>
  );
}
