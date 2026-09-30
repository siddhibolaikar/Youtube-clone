import { useRouter } from "next/router";
import CallRoom from "@/components/call/CallRoom";
import FriendsPanel from "@/components/call/FriendsPanel";
import { useUser } from "@/lib/AuthContext";

// /call            → friends list
// /call?to=<uid>   → ring a friend
// /call?id=<call>  → answer an incoming call
export default function CallPage() {
  const router = useRouter();
  const { user } = useUser();
  const to = typeof router.query.to === "string" ? router.query.to : undefined;
  const id = typeof router.query.id === "string" ? router.query.id : undefined;
  const inCall = !!(to || id);

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6">
      <div className={inCall ? "max-w-5xl" : "max-w-2xl"}>
        <h1 className="mb-6 text-2xl font-semibold">{inCall ? "Video call" : "Friends & calls"}</h1>
        {inCall && user ? <CallRoom key={to ?? id} to={to} callId={id} /> : <FriendsPanel />}
      </div>
    </main>
  );
}
