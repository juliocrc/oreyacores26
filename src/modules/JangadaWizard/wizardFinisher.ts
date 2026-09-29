// Registo simples (fora do React) do handler de finalização da inspeção.
// O Step8 (Resumo) regista a função real; o WizardLayout pode invocá-la a partir
// de qualquer passo (ex: último passo "Histórico"), onde o Step8 não está montado.

type WizardFinisher = () => void;

let finisher: WizardFinisher | null = null;

export function setWizardFinisher(fn: WizardFinisher | null) {
  finisher = fn;
}

export function getWizardFinisher(): WizardFinisher | null {
  return finisher;
}

export function hasWizardFinisher(): boolean {
  return finisher !== null;
}

export function runWizardFinisher(): boolean {
  if (finisher) {
    finisher();
    return true;
  }
  return false;
}