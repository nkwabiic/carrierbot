export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidTanzaniaPhone = (phone: string): boolean => {
  // Accepts: 07xxxx, 06xxxx, +2557xxxx, 2557xxxx, +2556xxxx, 2556xxxx
  const phoneRegex = /^(?:\+?255|0)[67]\d{8}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
};

export const isValidName = (name: string): boolean => {
  if (!/[a-zA-Z]/.test(name)) return false;
  // Letters, spaces, hyphen, apostrophe
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  return nameRegex.test(name) && name.trim().length > 0;
};

export const isValidGradYear = (year: string): boolean => {
  const yearRegex = /^\d{4}$/;
  if (!yearRegex.test(year)) return false;
  const numYear = parseInt(year, 10);
  return numYear >= 1950 && numYear <= new Date().getFullYear() + 10;
};

export const isMeaningfulText = (text: string): boolean => {
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return false;
  const meaningless = ['yes', 'no', 'ok', 'okay', 'fine', 'good', 'none', 'n/a', 'nothing'];
  if (words.length === 1 && meaningless.includes(text.trim().toLowerCase())) return false;
  return true;
};

export const isNotEmpty = (value: string): boolean => {
  return value.trim().length > 0;
};
