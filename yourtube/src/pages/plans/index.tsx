import React, { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Crown, Mail, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/AuthContext";
import { errorMessage } from "@/lib/apiClient";
import { CheckoutCancelled, purchase } from "@/lib/checkout";
import { getMyPayments, resendInvoice, type PaymentSummary } from "@/lib/paymentService";
import {
  FREE_DAILY_DOWNLOADS,
  PLAN_ORDER,
  PLANS,
  canUpgrade,
  formatInr,
  getPlan,
  watchLimitLabel,
  type ProductId,
} from "@/lib/plans";
import type { PlanId } from "@/lib/types";

export default function PlansPage() {
  const { user, refreshUser, handlegooglesignin } = useUser();
  const current = getPlan(user?.plan);
  const [buying, setBuying] = useState<PlanId | null>(null);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [resending, setResending] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    if (!user) return;
    try {
      setPayments(await getMyPayments(user.uid));
    } catch (err) {
      console.error("Could not load payments:", err);
    }
  }, [user]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const upgrade = async (id: PlanId) => {
    if (!user) {
      handlegooglesignin();
      return;
    }
    setBuying(id);
    try {
      const result = await purchase(id as ProductId);
      await refreshUser();
      await loadPayments();
      toast.success(`You're on ${PLANS[id].name}! Invoice ${result.invoiceNumber} is being emailed to ${user.email}.`);
      // The email goes out in the background; pick up its final status.
      for (const ms of [6000, 15000]) setTimeout(loadPayments, ms);
    } catch (err) {
      if (!(err instanceof CheckoutCancelled)) toast.error(errorMessage(err));
    } finally {
      setBuying(null);
    }
  };

  const resend = async (paymentId: string) => {
    setResending(paymentId);
    try {
      await resendInvoice(paymentId);
      toast.success("Invoice sent");
      await loadPayments();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setResending(null);
    }
  };

  return (
    <main className="flex-1 p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">Plans</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Watch-time limits apply to each video you open. Upgrades are one-time payments (Razorpay test mode).
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const isCurrent = plan.id === current.id;
          const allowed = canUpgrade(current.id, plan.id);
          return (
            <div
              key={id}
              data-testid={`plan-${id}`}
              className={`relative flex flex-col rounded-xl border p-5 ${
                isCurrent ? "border-primary ring-2 ring-primary/40 bg-primary/5" : ""
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-3 left-4 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  Current plan
                </span>
              )}
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {id === "gold" && <Crown className="w-5 h-5 text-amber-500" />}
                {plan.name}
              </h2>
              <p className="text-3xl font-bold mt-2">{plan.pricePaise ? formatInr(plan.pricePaise) : "Free"}</p>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  {watchLimitLabel(plan)}
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  {FREE_DAILY_DOWNLOADS} download per day (Premium: unlimited)
                </li>
              </ul>
              <Button
                className="mt-5"
                variant={allowed ? "default" : "secondary"}
                disabled={!allowed || buying !== null}
                onClick={() => upgrade(plan.id)}
              >
                {isCurrent
                  ? "Your plan"
                  : !allowed
                    ? "Included"
                    : buying === plan.id
                      ? "Processing…"
                      : `Upgrade for ${formatInr(plan.pricePaise)}`}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Test mode: card 4111 1111 1111 1111, any future expiry, any CVV · or UPI success@razorpay
      </p>

      {user && payments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Your payments</h2>
          <ul className="divide-y rounded-lg border">
            {payments.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="flex-1 min-w-48">
                  <p className="font-medium">
                    {p.productName} · {formatInr(p.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.invoiceNumber} · {format(p.createdAt, "d MMM yyyy, h:mm a")}
                  </p>
                </div>
                {p.emailStatus === "failed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resending === p.paymentId}
                    onClick={() => resend(p.paymentId)}
                  >
                    <MailWarning className="w-4 h-4 text-destructive" />
                    {resending === p.paymentId ? "Sending…" : "Resend invoice"}
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" /> {p.emailStatus === "sent" ? "Invoice emailed" : "Sending…"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
