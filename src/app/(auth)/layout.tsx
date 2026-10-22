export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-6 flex items-center gap-2 text-xl font-semibold tracking-tight text-primary">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
        TADUKA
      </p>
      <div className="rounded-panel border border-border bg-surface p-5 sm:p-8">
        {children}
      </div>
    </main>
  );
}
