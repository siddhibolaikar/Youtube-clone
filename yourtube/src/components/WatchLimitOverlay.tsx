import Link from "next/link";
import { Lock, Timer } from "lucide-react";
import { Button } from "./ui/button";
import type { PlanConfig } from "@/lib/plans";
import { formatClock } from "@/lib/watchLimit";

export function WatchLimitOverlay({ plan, testLimitSec }: { plan: PlanConfig; testLimitSec?: number }) {
  const minutes = (plan.watchLimitSec ?? 0) / 60;
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center text-white"
      data-testid="watch-limit-overlay"
      role="alertdialog"
      aria-label="Watch limit reached"
    >
      <Lock className="w-10 h-10 text-amber-400" />
      <p className="text-lg font-semibold max-w-md">
        Your {plan.name} plan allows {minutes} minutes per video. Upgrade to keep watching.
      </p>
      {testLimitSec !== undefined && (
        <p className="text-xs font-semibold text-fuchsia-300">Test override: limit shortened to {testLimitSec}s</p>
      )}
      <Button asChild className="bg-amber-500 hover:bg-amber-600 text-black">
        <Link href="/plans">See plans</Link>
      </Button>
    </div>
  );
}

export function TimeRemainingChip({ remaining }: { remaining: number }) {
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white"
      data-testid="time-remaining"
    >
      <Timer className="w-3.5 h-3.5" /> {formatClock(remaining)} left
    </div>
  );
}
