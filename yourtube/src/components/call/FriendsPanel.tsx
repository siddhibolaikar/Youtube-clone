import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Phone, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useUser } from "@/lib/AuthContext";
import { errorMessage } from "@/lib/apiClient";
import {
  ONLINE_WINDOW_MS,
  listenFriends,
  listenPresence,
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  type Friend,
} from "@/lib/friendsService";

function FriendRow({ friend, children, online }: { friend: Friend; children: React.ReactNode; online?: boolean }) {
  return (
    <li className="flex items-center gap-3 p-3" data-testid={`friend-${friend.status}`}>
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={friend.image} />
          <AvatarFallback>{friend.name?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        {online !== undefined && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${online ? "bg-green-500" : "bg-muted-foreground/50"}`}
            title={online ? "Online" : "Offline"}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{friend.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {online === undefined ? friend.email : online ? "Online" : "Offline"}
        </p>
      </div>
      <div className="flex gap-1">{children}</div>
    </li>
  );
}

export default function FriendsPanel() {
  const { user } = useUser();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => (user ? listenFriends(user.uid, setFriends) : undefined), [user]);

  const accepted = useMemo(() => friends.filter((f) => f.status === "accepted"), [friends]);
  const acceptedIds = accepted.map((f) => f.uid).sort().join(",");
  useEffect(() => {
    if (!acceptedIds) return;
    return listenPresence(acceptedIds.split(","), setLastSeen);
  }, [acceptedIds]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!user) {
    return <p className="text-muted-foreground">Sign in to add friends and make video calls.</p>;
  }

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await sendFriendRequest(email);
      toast.success(r.status === "accepted" ? "You're now friends!" : "Friend request sent");
      setEmail("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const run = (p: Promise<unknown>, ok?: string) =>
    p.then(() => ok && toast.success(ok)).catch((err) => toast.error(errorMessage(err)));

  const incoming = friends.filter((f) => f.status === "incoming");
  const outgoing = friends.filter((f) => f.status === "outgoing");
  const isOnline = (uid: string) => now - (lastSeen[uid] ?? 0) < ONLINE_WINDOW_MS;
  const sorted = [...accepted].sort((a, b) => Number(isOnline(b.uid)) - Number(isOnline(a.uid)) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="flex max-w-lg gap-2">
        <Input
          type="email"
          placeholder="Friend's email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Friend's email"
        />
        <Button type="submit" disabled={busy}>
          <UserPlus className="h-4 w-4" /> Add friend
        </Button>
      </form>

      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Friend requests</h2>
          <ul className="divide-y rounded-lg border">
            {incoming.map((f) => (
              <FriendRow key={f.uid} friend={f}>
                <Button size="sm" onClick={() => run(respondToRequest(f.uid, true), `You're now friends with ${f.name}`)}>
                  <Check className="h-4 w-4" /> Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(respondToRequest(f.uid, false))}>
                  <X className="h-4 w-4" /> Decline
                </Button>
              </FriendRow>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Friends</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No friends yet. Add someone by the email they sign in with.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sorted.map((f) => (
              <FriendRow key={f.uid} friend={f} online={isOnline(f.uid)}>
                <Button size="sm" asChild>
                  <Link href={`/call?to=${f.uid}`}>
                    <Phone className="h-4 w-4" /> Call
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(removeFriend(f.uid))} aria-label={`Remove ${f.name}`}>
                  <UserMinus className="h-4 w-4" />
                </Button>
              </FriendRow>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Sent requests</h2>
          <ul className="divide-y rounded-lg border">
            {outgoing.map((f) => (
              <FriendRow key={f.uid} friend={f}>
                <Button size="sm" variant="ghost" onClick={() => run(removeFriend(f.uid))}>
                  Cancel
                </Button>
              </FriendRow>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
