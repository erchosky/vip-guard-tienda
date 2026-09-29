import type { Metadata } from "next";
import { MiniApp } from "@/components/miniapp/mini-app";

export const metadata: Metadata = { title: "Tienda" };

export default function Page() {
  return <MiniApp />;
}
