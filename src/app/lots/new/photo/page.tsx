import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { MethodSwitch } from "@/components/lots/method-switch";
import { PhotoCapture } from "@/components/lots/photo-capture";

export const metadata: Metadata = { title: "Registrar lote con fotografía · TADUKA" };

export default function PhotoLotPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <PhotoLot />
      </Suspense>
    </AppShell>
  );
}

async function PhotoLot() {
  await connection();
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;

  return (
    <>
      <ScreenHeader title="Registrar lote" storeName={membership.store.name} backHref="/lots" />
      <MethodSwitch active="photo" />
      <PhotoCapture />
    </>
  );
}
