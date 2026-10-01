import { onAuthStateChanged, signInWithRedirect, getRedirectResult, signOut } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { provider, auth } from "./firebase";
import { getOrCreateUser, getOwnProfile } from "./userService";
import type { AppUser } from "./types";

interface UserContextValue {
  user: AppUser | null;
  /** True once the first auth state has been resolved. */
  ready: boolean;
  login: (profile: AppUser) => void;
  logout: () => Promise<void>;
  handlegooglesignin: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  const login = useCallback((profile: AppUser) => setUser(profile), []);

  const logout = useCallback(async () => {
    setUser(null);
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

  // Re-read the private profile (plan, isPremium) after a server-side change.
  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const profile = await getOwnProfile(current.uid);
    if (profile) setUser(profile);
  }, []);

  useEffect(() => {
    // Surface redirect errors (e.g. unauthorized domain); onAuthStateChanged
    // handles the successful case.
    getRedirectResult(auth).catch(reportSignInError);

    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }
        const profile = await getOrCreateUser(firebaseUser.uid, {
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName,
          image: firebaseUser.photoURL || "https://github.com/shadcn.png",
        });
        setUser(profile);
      } catch (error) {
        console.error("Could not load your account:", error);
        setUser(null);
        await signOut(auth).catch(() => {});
      } finally {
        setReady(true);
      }
    });
  }, []);

  return (
    <UserContext.Provider value={{ user, ready, login, logout, handlegooglesignin, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
};
