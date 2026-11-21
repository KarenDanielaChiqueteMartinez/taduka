import { Icon, type IconName } from "@/components/ui/icons";
import type { LotStatus } from "@/lib/inventory/summary";

// El estado nunca se comunica solo con color: cada uno lleva icono y etiqueta.
export const STATUS_UI: Record<
  LotStatus,
  { label: string; icon: IconName; badge: string; tone: string; text: string; solid: string }
> = {
  vencido: {
    label: "Vencido",
    icon: "x-circle",
    badge: "bg-danger-soft text-danger",
    tone: "bg-danger-soft text-danger",
    text: "text-danger",
    solid: "bg-danger",
  },
  por_vencer: {
    label: "Por vencer",
    icon: "alert-triangle",
    badge: "bg-orange-soft text-orange",
    tone: "bg-orange-soft text-orange",
    text: "text-orange",
    solid: "bg-orange",
  },
  vigente: {
    label: "Vigente",
    icon: "check-circle",
    badge: "bg-action-soft text-action",
    tone: "bg-action-soft text-action",
    text: "text-action",
    solid: "bg-action",
  },
};

export function StatusBadge({
  status,
  label,
  className = "",
}: {
  status: LotStatus;
  label?: string;
  className?: string;
}) {
  const ui = STATUS_UI[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ui.badge} ${className}`}
    >
      <Icon name={ui.icon} className="size-3.5" strokeWidth={2.4} />
      {label ?? ui.label}
    </span>
  );
}
