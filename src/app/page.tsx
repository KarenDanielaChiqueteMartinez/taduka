import { redirect } from "next/navigation";

// La raíz no tiene contenido propio: lleva al Inicio. Sin sesión, el proxy redirige de ahí a /login.
export default function Home() {
  redirect("/dashboard");
}
