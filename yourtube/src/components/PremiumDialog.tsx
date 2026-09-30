import React, { useState } from "react";
import { Crown, Download, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useUser } from "@/lib/AuthContext";
import { errorMessage } from "@/lib/apiClient";
import { CheckoutCancelled, purchase } from "@/lib/checkout";
import { FREE_DAILY_DOWNLOADS, PREMIUM, formatInr } from "@/lib/plans";

interface PremiumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown above the pitch, e.g. why the dialog opened. */
  reason?: string;
  onPurchased?: () => void;
}

export default function PremiumDialog({ open, onOpenChange, reason, onPurchased }: PremiumDialogProps) {
  const { user, refreshUser } = useUser();
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    if (!user) {
      toast.info("Sign in to go Premium");
      return;
    }
    setBusy(true);
    try {
      const result = await purchase("premium");
      await refreshUser();
      toast.success(`You're Premium! Invoice ${result.invoiceNumber} is being emailed to you.`);
      onOpenChange(false);
      onPurchased?.();
    } catch (err) {
      if (!(err instanceof CheckoutCancelled)) toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="premium-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" /> Go Premium
          </DialogTitle>
          <DialogDescription>{reason ?? "Download as many videos as you like."}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3">
            <InfinityIcon className="w-5 h-5 shrink-0 text-primary" />
            Unlimited downloads, every day
          </li>
          <li className="flex gap-3">
            <Download className="w-5 h-5 shrink-0 text-muted-foreground" />
            Free accounts get {FREE_DAILY_DOWNLOADS} download per day (resets at midnight IST)
          </li>
        </ul>
        <p className="text-3xl font-bold">
          {formatInr(PREMIUM.pricePaise)} <span className="text-sm font-normal text-muted-foreground">one-time</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Test mode: use card 4111 1111 1111 1111 (any future expiry, any CVV) or UPI success@razorpay.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={buy} disabled={busy} className="bg-amber-500 hover:bg-amber-600 text-black">
            {busy ? "Processing…" : `Pay ${formatInr(PREMIUM.pricePaise)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
