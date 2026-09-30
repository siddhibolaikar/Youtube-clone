import { Clock } from "lucide-react";
import VideoList from "./VideoList";
import { getWatchLater, removeFromWatchLater } from "@/lib/watchlaterService";

export default function WatchLaterContent() {
  return (
    <VideoList
      icon={Clock}
      load={getWatchLater}
      remove={(entry) => removeFromWatchLater(entry.id)}
      signedOut={{ title: "Save videos for later", body: "Sign in to access your Watch later playlist." }}
      empty={{ title: "No videos saved", body: "Videos you save for later will appear here." }}
      verb="Added"
      removeLabel="Remove from Watch later"
    />
  );
}
