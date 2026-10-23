export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('8') && digits.length === 11) digits = '7' + digits.slice(1);
  if (digits.startsWith('9') && digits.length === 10) digits = '7' + digits;
  if (!digits.startsWith('7') && digits.length === 10) digits = '7' + digits;
  return '+' + digits;
}

export function formatPhoneDisplay(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return e164;
}

export function isValidRuPhone(input: string): boolean {
  return /^\+7\d{10}$/.test(normalizePhone(input));
}
