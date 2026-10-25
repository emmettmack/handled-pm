// Languages tenants and vendors can use. Codes follow BCP 47. One list drives the forms, the templates, the AI prompts
// and the tests, so adding a language means adding one entry here and its translations in templates.js.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'hy', name: 'Armenian', native: 'Հայերեն' },
  { code: 'tl', name: 'Tagalog', native: 'Tagalog' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const isSupported = (code) => LANGUAGE_CODES.includes(code);
export const normalizeLanguage = (code, fallback = 'en') => (isSupported(code) ? code : fallback);
export const languageName = (code) => LANGUAGES.find((l) => l.code === code)?.name || 'another language';
