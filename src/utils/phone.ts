/**
 * Iranian Phone Normalization & Validation Utility
 * Supports Persian (۰-۹), Arabic (٠-٩), and English digits
 * Handles standard formats: 0912..., +98912..., 0098912..., 98912..., 912...
 */

export function toEnglishDigits(str: string): string {
  if (!str) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(farsiDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return res;
}

export function normalizeIranianPhone(raw: string): string {
  if (!raw) return '';
  const english = toEnglishDigits(raw);
  let digits = english.replace(/\D/g, '');

  if (digits.startsWith('00989')) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('989')) {
    digits = '0' + digits.slice(2);
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '0' + digits;
  }

  return digits;
}

export function isValidIranianMobile(phone: string): boolean {
  const normalized = normalizeIranianPhone(phone);
  return /^09\d{9}$/.test(normalized);
}

export function maskIranianPhone(phone: string): string {
  const norm = normalizeIranianPhone(phone);
  if (norm.length === 11) {
    return `${norm.slice(0, 4)}***${norm.slice(-4)}`;
  }
  return phone;
}
