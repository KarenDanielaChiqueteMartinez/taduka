import { isAuthorized } from "./auth.ts";
import { runJob } from "./core.ts";
import type { Deps, Job } from "./types.ts";

const JOBS: Job[] = ["daily_summary", "urgent_alerts"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createHandler(options: {
  secret: string;
  // Nombres de variables mal configuradas; solo se registran en logs del servidor.
  configProblems: () => string[];
  buildDeps: () => Deps;
  now?: () => Date;
}) {
  return async (request: Request): Promise<Response> => {
    // 1. Autorización primero: un llamador sin secreto válido no aprende nada (ni método
    //    permitido ni estado de la configuración) y no se toca ninguna tienda.
    if (!isAuthorized(request.headers.get("x-cron-secret"), options.secret)) {
      return json({ error: "unauthorized" }, 401);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    // 2. Configuración: detalle solo en logs; la respuesta es genérica.
    const problems = options.configProblems();
    if (problems.length > 0) {
      console.error("notificaciones: configuración incompleta:", problems.join(", "));
      return json({ error: "configuration_error" }, 500);
    }

    const body = (await request.json().catch(() => null)) as { job?: unknown } | null;
    const job = JOBS.find((j) => j === body?.job);
    if (!job) return json({ error: "invalid_job" }, 400);

    try {
      const result = await runJob(job, options.buildDeps(), options.now?.() ?? new Date());
      return json(result);
    } catch (error) {
      console.error("notificaciones: fallo general", {
        job,
        error: error instanceof Error ? error.message.slice(0, 120) : "desconocido",
      });
      return json({ error: "internal_error" }, 500);
    }
  };
}
