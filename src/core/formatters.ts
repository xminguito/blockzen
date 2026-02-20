/**
 * Number formatters
 *
 * Uses Intl.NumberFormat so thousands separators are locale-correct:
 *   EN → 66,860
 *   ES → 66.860
 */

const formatters: Record<string, Intl.NumberFormat> = {};

function getFormatter(language: string): Intl.NumberFormat {
  if (!formatters[language]) {
    formatters[language] = new Intl.NumberFormat(
      language === 'es' ? 'es-ES' : 'en-US',
    );
  }
  return formatters[language];
}

export function formatScore(value: number, language: string): string {
  return getFormatter(language).format(value);
}
