"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icons";

type Tone = "success" | "warning" | "error";
type Item = { id: number; message: string; tone: Tone };
type ToastApi = { show: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<Tone, { box: string; icon: "check-circle" | "alert-triangle"; iconClass: string }> = {
  success: { box: "bg-primary-deep text-white", icon: "check-circle", iconClass: "text-accent" },
  warning: { box: "border border-warning/30 bg-warning-soft text-warning", icon: "alert-triangle", iconClass: "" },
  error: { box: "border border-danger/30 bg-danger-soft text-danger", icon: "alert-triangle", iconClass: "" },
};

const DURATION: Record<Tone, number> = { success: 4000, warning: 7000, error: 7000 };

// Avisos breves. Viven en el diseño raíz, así que siguen visibles después de cambiar de pantalla
// (por ejemplo, al volver a la lista tras crear un producto).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = ++nextId.current;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[6.5rem] z-50 flex flex-col items-center gap-2 md:bottom-6"
      >
        {items.map((item) => {
          const tone = TONE[item.tone];
          return (
            <div
              key={item.id}
              className={`tadu-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card px-4 py-3.5 text-sm font-semibold shadow-float ${tone.box}`}
            >
              <Icon name={tone.icon} className={`mt-0.5 size-5 ${tone.iconClass}`} strokeWidth={2.4} />
              <p className="min-w-0 flex-1 break-words">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Cerrar aviso"
                className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
              >
                <Icon name="x" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

const NOOP: ToastApi = { show: () => undefined };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
