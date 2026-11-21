import { STATUS_UI } from "@/components/ui/status-badge";
import type { LotStatus } from "@/lib/inventory/summary";

const SIZES = {
  sm: "size-11 rounded-2xl text-base",
  md: "size-14 rounded-2xl text-xl",
  lg: "size-20 rounded-3xl text-3xl",
};

// Miniatura del producto: su fotografía si la tiene; si no, su inicial con el tono del estado.
export function ProductThumb({
  name,
  status,
  size = "md",
  photoUrl,
}: {
  name: string;
  status?: LotStatus | null;
  size?: keyof typeof SIZES;
  photoUrl?: string | null;
}) {
  const tone = status ? STATUS_UI[status].tone : "bg-primary-soft text-primary";
  const initials = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center font-bold ${SIZES[size]} ${photoUrl ? "bg-surface-muted" : tone}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full rounded-[inherit] object-cover"
        />
      ) : (
        initials
      )}
      {status && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface ${STATUS_UI[status].solid}`}
        />
      )}
    </span>
  );
}
