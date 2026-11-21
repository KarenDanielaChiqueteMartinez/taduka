import { Icon } from "@/components/ui/icons";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-8 pb-10">
      <div className="mb-6 flex flex-col items-start gap-4">
        <span className="flex size-14 items-center justify-center rounded-3xl bg-primary-deep text-accent shadow-card">
          <Icon name="store" className="size-7" />
        </span>
        <div>
          <p className="text-3xl font-bold tracking-tight text-primary">TADUKA</p>
          <p className="mt-1 text-sm text-text-secondary">
            Control de caducidades para tu tiendita.
          </p>
        </div>
      </div>
      <div className="tadu-rise rounded-panel border border-border/70 bg-surface p-5 shadow-card sm:p-7">
        {children}
      </div>
    </main>
  );
}
