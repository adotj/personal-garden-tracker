import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-desert-page px-6 text-center text-desert-ink">
      <WifiOff className="h-14 w-14 text-oasis" aria-hidden />
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold text-oasis">You&apos;re offline</h1>
        <p className="text-sm text-desert-dust">
          This page isn&apos;t available without a network connection. Reconnect and try again — cached
          screens may still work if you&apos;ve opened them before.
        </p>
      </div>
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "default", size: "default" }),
          "bg-oasis text-white hover:bg-oasis-hover",
        )}
      >
        Back to garden
      </Link>
    </div>
  );
}
