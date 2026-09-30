import { useCallback, useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, type ConfirmationResult } from "firebase/auth";
import { Mail, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useUser } from "@/lib/AuthContext";
import { ApiError, apiFetch, errorMessage } from "@/lib/apiClient";
import { getOtpAuth } from "@/lib/firebase";
import { OTP_RESEND_COOLDOWN_MS, normalizeIndianMobile, type OtpChannel } from "@/lib/otpRules";

interface OtpStatus {
  verified: boolean;
  channel: OtpChannel;
  region: string | null;
  city: string | null;
  emailMasked: string | null;
  phone: string | null;
  phoneMasked: string | null;
}

type Step = "loading" | "phone" | "sending" | "code" | "verifying" | "error";

const RECAPTCHA_ID = "otp-recaptcha";

function firebasePhoneError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/invalid-verification-code") return "Incorrect code. Check the SMS and try again.";
  if (code === "auth/code-expired") return "That code has expired. Request a new one.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a while and try again.";
  if (code === "auth/operation-not-allowed") return "SMS sign-in isn't enabled for this app yet (Firebase → Authentication → Phone).";
  if (code === "auth/billing-not-enabled" || code === "auth/quota-exceeded") {
    return "Real SMS needs Firebase's Blaze plan. Use one of the Firebase test phone numbers instead.";
  }
  if (code === "auth/invalid-phone-number") return "That phone number isn't valid.";
  return errorMessage(err);
}

/**
 * Second sign-in step. South Indian states get an emailed code, everywhere
 * else an SMS via Firebase Phone Auth. The user isn't signed in until this passes.
 */
export default function OtpGate() {
  const { pendingUser, completeOtp, logout } = useUser();
  const [status, setStatus] = useState<OtpStatus | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const recaptcha = useRef<RecaptchaVerifier | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () => () => {
      recaptcha.current?.clear();
      signOut(getOtpAuth()).catch(() => {});
    },
    []
  );

  const sendSms = useCallback(async (phone: string) => {
    const otpAuth = getOtpAuth();
    recaptcha.current ??= new RecaptchaVerifier(otpAuth, RECAPTCHA_ID, { size: "invisible" });
    confirmation.current = await signInWithPhoneNumber(otpAuth, phone, recaptcha.current);
  }, []);

  const send = useCallback(
    async (s: OtpStatus) => {
      setError(null);
      setStep("sending");
      try {
        await apiFetch("/api/otp/send", { method: "POST", body: { channel: s.channel } });
        if (s.channel === "sms" && s.phone) await sendSms(s.phone);
        setResendAt(Date.now() + OTP_RESEND_COOLDOWN_MS);
        setStep("code");
        toast.success(s.channel === "email" ? `Code sent to ${s.emailMasked}` : `SMS sent to ${s.phoneMasked}`);
      } catch (err) {
        if (err instanceof ApiError && err.reason === "COOLDOWN" && s.channel === "email") {
          // A code was sent moments ago (e.g. page reload): let them enter it.
          setResendAt(Date.now() + Number(err.data.retryAfterMs ?? OTP_RESEND_COOLDOWN_MS));
          setStep("code");
          return;
        }
        const msg = err instanceof ApiError ? err.message : firebasePhoneError(err);
        setError(msg);
        if (err instanceof ApiError && err.reason === "COOLDOWN") {
          setResendAt(Date.now() + Number(err.data.retryAfterMs ?? OTP_RESEND_COOLDOWN_MS));
        }
        setStep(confirmation.current || s.channel === "email" ? "code" : "error");
      }
    },
    [sendSms]
  );

  useEffect(() => {
    if (!pendingUser) return;
    let cancelled = false;
    apiFetch<OtpStatus>("/api/otp/status")
      .then(async (s) => {
        if (cancelled) return;
        setStatus(s);
        if (s.verified) {
          await completeOtp();
          return;
        }
        if (s.channel === "sms" && !s.phone) {
          setStep("phone");
          return;
        }
        if (!autoSent.current) {
          autoSent.current = true;
          send(s);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setStep("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pendingUser, completeOtp, send]);

  const savePhone = async () => {
    const phone = normalizeIndianMobile(phoneInput);
    if (!phone) {
      setError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    setError(null);
    try {
      await apiFetch("/api/profile/phone", { method: "POST", body: { phone } });
      const next = await apiFetch<OtpStatus>("/api/otp/status");
      setStatus(next);
      send(next);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const verify = async () => {
    if (!status || !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      return;
    }
    setError(null);
    setStep("verifying");
    try {
      if (status.channel === "email") {
        await apiFetch("/api/otp/verify", { method: "POST", body: { code } });
      } else {
        if (!confirmation.current) throw new Error("Request a new SMS code");
        const cred = await confirmation.current.confirm(code);
        const phoneIdToken = await cred.user.getIdToken();
        await apiFetch("/api/otp/verify-phone", { method: "POST", body: { phoneIdToken } });
        await signOut(getOtpAuth());
      }
      await completeOtp();
      toast.success("Verified. Welcome back!");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : firebasePhoneError(err));
      setStep("code");
    }
  };

  if (!pendingUser) return null;

  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const Icon = status?.channel === "email" ? Mail : Smartphone;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className="sm:max-w-md"
        data-testid="otp-gate"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Verify it&apos;s you
          </DialogTitle>
          <DialogDescription>
            {status
              ? status.channel === "email"
                ? `Because you're signing in from ${status.region ?? "South India"}, we'll email your code.`
                : `We'll text a code to your registered mobile${status.region ? ` (signing in from ${status.region})` : ""}.`
              : "Checking your sign-in…"}
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}

        {step === "phone" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              savePhone();
            }}
          >
            <p className="text-sm font-medium">Add your mobile number</p>
            <Label htmlFor="otp-phone" className="sr-only">
              Mobile number
            </Label>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm">+91</span>
              <Input
                id="otp-phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={14}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="rounded-l-none"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">We&apos;ll use this for sign-in codes. It can&apos;t be changed later here.</p>
            <Button type="submit" className="w-full">
              Save and send code
            </Button>
          </form>
        )}

        {(step === "sending" || step === "code" || step === "verifying") && status && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <p className="flex items-center gap-2 text-sm">
              <Icon className="w-4 h-4 text-muted-foreground" />
              {step === "sending"
                ? "Sending your code…"
                : `Enter the 6-digit code sent to ${status.channel === "email" ? status.emailMasked : status.phoneMasked}`}
            </p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em] h-12"
              disabled={step !== "code"}
              autoFocus
              data-testid="otp-code-input"
            />
            <Button type="submit" className="w-full" disabled={step !== "code" || code.length !== 6}>
              {step === "verifying" ? "Verifying…" : "Verify"}
            </Button>
            <div className="flex justify-between text-sm">
              <Button
                type="button"
                variant="link"
                className="px-0"
                disabled={waitSec > 0 || step !== "code"}
                onClick={() => send(status)}
              >
                {waitSec > 0 ? `Resend OTP in ${waitSec}s` : "Resend OTP"}
              </Button>
              <Button type="button" variant="link" className="px-0 text-muted-foreground" onClick={logout}>
                Use another account
              </Button>
            </div>
          </form>
        )}

        {step === "error" && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => status && send(status)} disabled={!status || waitSec > 0}>
              {waitSec > 0 ? `Try again in ${waitSec}s` : "Try again"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={logout}>
              Sign out
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div id={RECAPTCHA_ID} />
      </DialogContent>
    </Dialog>
  );
}
