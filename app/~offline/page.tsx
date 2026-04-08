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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-desert-page px-6 text-center text-desert-ink dark:bg-zinc-950 dark:text-zinc-100">
      <WifiOff className="h-14 w-14 text-oasis dark:text-emerald-400" aria-hidden />
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold text-oasis dark:text-emerald-400">You&apos;re offline</h1>
        <p className="text-sm text-desert-dust dark:text-zinc-400">
          This page isn&apos;t available without a network connection. Reconnect and try again — cached
          screens may still work if you&apos;ve opened them before.
        </p>
      </div>
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "default", size: "default" }),
          "bg-oasis text-white hover:bg-oasis-hover dark:bg-emerald-600 dark:hover:bg-emerald-500",
        )}
      >
        Back to garden
      </Link>
    </div>
  );
}
