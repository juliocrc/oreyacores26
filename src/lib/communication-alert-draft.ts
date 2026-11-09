// One-time, in-memory handoff between client-side pages; no personal data in the URL.
let pending: { recipient: string; body: string } | null = null;

export function prepareCommunicationAlert(draft: { recipient: string; body: string }) {
  pending = draft;
}

export function takeCommunicationAlert() {
  const draft = pending;
  pending = null;
  return draft;
}
