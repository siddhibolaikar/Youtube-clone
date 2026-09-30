import { onAuthStateChanged, signInWithRedirect, getRedirectResult, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { provider, auth, db } from "./firebase";
import { getOrCreateUser, getOwnProfile } from "./userService";
import type { AppUser } from "./types";

interface UserContextValue {
  /** Signed in AND past the OTP step for this sign-in. */
  user: AppUser | null;
  /** Signed in with Google but still needs the OTP; not treated as logged in. */
  pendingUser: AppUser | null;
  /** True once the first auth state has been resolved. */
  ready: boolean;
  login: (profile: AppUser) => void;
  logout: () => Promise<void>;
  handlegooglesignin: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Call after /api/otp/verify succeeds. */
  completeOtp: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

/** Tell the user why Google sign-in failed instead of failing silently. */
function reportSignInError(err: unknown) {
  console.error("Google sign-in failed:", err);
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/unauthorized-domain") {
    toast.error(`Sign-in isn't enabled for ${window.location.hostname} yet. Add it under Firebase → Authentication → Settings → Authorized domains.`, { duration: 15_000 });
  } else if (code === "auth/network-request-failed") {
    toast.error("Couldn't reach Google sign-in. Check your connection or disable blocking extensions.");
  } else if (code !== "auth/redirect-cancelled-by-user" && code !== "auth/popup-closed-by-user") {
    toast.error("Google sign-in failed. Please try again.");
  }
}

/** Has the server recorded an OTP for this exact Google sign-in? */
async function otpVerifiedFor(firebaseUser: User): Promise<boolean> {
  const [token, session] = await Promise.all([
    firebaseUser.getIdTokenResult(),
    getDoc(doc(db, "sessions", firebaseUser.uid)),
  ]);
  return session.exists() && session.get("authTime") === Number(token.claims.auth_time);
}

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  const login = useCallback((profile: AppUser) => {
    setUser(profile);
    setPendingUser(null);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setPendingUser(null);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  }, []);

  const handlegooglesignin = useCallback(async () => {
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      reportSignInError(error);
    }
  }, []);

  // Re-read the private profile (plan, isPremium, phone) after a server-side change.
  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const profile = await getOwnProfile(current.uid);
    if (!profile) return;
    if (user) setUser(profile);
    else setPendingUser(profile);
  }, [user]);

  const completeOtp = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const profile = await getOwnProfile(current.uid);
    if (profile && (await otpVerifiedFor(current))) login(profile);
  }, [login]);

  useEffect(() => {
    // Surface redirect errors (e.g. unauthorized domain); onAuthStateChanged
    // handles the successful case.
    getRedirectResult(auth).catch(reportSignInError);

    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setPendingUser(null);
          return;
        }
        const profile = await getOrCreateUser(firebaseUser.uid, {
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName,
          image: firebaseUser.photoURL || "https://github.com/shadcn.png",
        });
        if (await otpVerifiedFor(firebaseUser)) {
          setUser(profile);
          setPendingUser(null);
        } else {
          setUser(null);
          setPendingUser(profile);
        }
      } catch (error) {
        console.error("Could not load your account:", error);
        setUser(null);
        setPendingUser(null);
        await signOut(auth).catch(() => {});
      } finally {
        setReady(true);
      }
    });
  }, []);

  return (
    <UserContext.Provider
      value={{ user, pendingUser, ready, login, logout, handlegooglesignin, refreshUser, completeOtp }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
};
