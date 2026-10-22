import type { Mailer } from "./types.ts";

type Options = {
  apiKey: string;
  from: string;
  // Solo para pruebas locales contra un servidor simulado.
  apiUrl?: string;
  fetchFn?: typeof fetch;
};

export function createResendMailer(options: Options): Mailer {
  const url = options.apiUrl ?? "https://api.resend.com/emails";
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async send(message) {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      // El error solo lleva el estado HTTP y el código corto de Resend (p. ej.
      // invalid_idempotent_request); nunca la clave ni el cuerpo completo.
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { name?: unknown } | null;
        const name =
          typeof failure?.name === "string" && /^[a-z_]{1,60}$/.test(failure.name)
            ? `_${failure.name}`
            : "";
        throw new Error(`resend_http_${response.status}${name}`);
      }
      const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
      if (!body || typeof body.id !== "string" || body.id === "") {
        throw new Error("resend_respuesta_invalida");
      }
      return { id: body.id };
    },
  };
}
