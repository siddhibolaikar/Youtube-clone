import { useUser } from "@/lib/AuthContext";
import { usePresence } from "@/lib/usePresence";

export default function PresenceHeartbeat() {
  const { user } = useUser();
  usePresence(user?.uid ?? null);
  return null;
}
