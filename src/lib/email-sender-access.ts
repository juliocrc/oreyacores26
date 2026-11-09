/** Only the authenticated email grants access; roles and display names do not. */
export function canUseEmailSenderProfiles(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === "julio.correia@orey.com";
}
