import { Clock } from "lucide-react";
import VideoList from "./VideoList";
import { getHistory, removeFromHistory } from "@/lib/historyService";

export default function HistoryContent() {
  return (
    <VideoList
      icon={Clock}
      load={getHistory}
      remove={(entry) => removeFromHistory(entry.id)}
      signedOut={{ title: "Keep track of what you watch", body: "Watch history isn't viewable when signed out." }}
      empty={{ title: "No watch history yet", body: "Videos you watch will appear here." }}
      verb="Watched"
      removeLabel="Remove from watch history"
    />
  );
}
