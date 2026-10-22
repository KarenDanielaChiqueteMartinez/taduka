export const REQUIRED_ENV = [
  "CRON_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const RESEND_URL = "https://api.resend.com/emails";
// RESEND_API_URL solo existe para pruebas locales contra un servidor simulado; fuera de
// estos destinos se rechaza para no enviar la clave de Resend a un host arbitrario.
const LOCAL_TEST_PREFIXES = ["http://localhost", "http://127.0.0.1", "http://host.docker.internal"];

// Devuelve solo NOMBRES de variables con problemas, nunca valores.
export function checkConfig(get: (name: string) => string | undefined): string[] {
  const problems: string[] = REQUIRED_ENV.filter((name) => !get(name)?.trim());

  const appUrl = get("APP_URL")?.trim();
  if (appUrl && !/^https?:\/\/[^\s/]+/.test(appUrl)) problems.push("APP_URL (formato)");

  const from = get("EMAIL_FROM")?.trim();
  if (from && !from.includes("@")) problems.push("EMAIL_FROM (formato)");

  const apiUrl = get("RESEND_API_URL")?.trim();
  if (apiUrl && apiUrl !== RESEND_URL && !LOCAL_TEST_PREFIXES.some((p) => apiUrl.startsWith(p))) {
    problems.push("RESEND_API_URL (destino no permitido)");
  }
  return problems;
}
