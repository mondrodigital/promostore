export const COMPANY_EMAIL_DOMAIN = '@vellummortgage.com';

export function isCompanyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(COMPANY_EMAIL_DOMAIN);
}
