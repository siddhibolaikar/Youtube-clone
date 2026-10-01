import { useCallback, useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoThumbnail from "@/components/VideoThumbnail";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/lib/AuthContext";
import { toDate, type FirestoreDate, type VideoListEntry } from "@/lib/types";

const ago = (value: FirestoreDate) => {
  const d = toDate(value);
  return isNaN(d.getTime()) ? "" : `${formatDistanceToNow(d)} ago`;
};

interface VideoListProps {
  icon: ComponentType<{ className?: string }>;
  load: (uid: string) => Promise<VideoListEntry[]>;
  remove: (entry: VideoListEntry, uid: string) => Promise<void>;
  signedOut: { title: string; body: string };
  empty: { title: string; body: string };
  /** e.g. "Watched", "Liked", "Added" */
  verb: string;
  removeLabel: string;
}

/** Shared body of the History, Liked videos and Watch later pages. */
export default function VideoList({ icon: Icon, load, remove, signedOut, empty, verb, removeLabel }: VideoListProps) {
  const { user } = useUser();
  const [items, setItems] = useState<VideoListEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (uid: string) => {
      try {
        setItems(await load(uid));
      } catch (error) {
        console.error("Error loading list:", error);
      } finally {
        setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    if (user) refresh(user.uid);
    else setLoading(false);
  }, [user, refresh]);

  const handleRemove = async (entry: VideoListEntry) => {
    if (!user) return;
    try {
      await remove(entry, user.uid);
      setItems((prev) => prev.filter((i) => i.id !== entry.id));
    } catch (error) {
      console.error("Error removing item:", error);
    }
  };

  const message = (m: { title: string; body: string }) => (
    <div className="text-center py-12">
      <Icon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">{m.title}</h2>
      <p className="text-muted-foreground">{m.body}</p>
    </div>
  );

  if (!user) return message(signedOut);
  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (items.length === 0) return message(empty);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{items.length} videos</p>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 group">
            <Link href={`/watch/${item.videoid.id}`} className="flex-shrink-0">
              <div className="relative w-40 aspect-video bg-muted rounded overflow-hidden">
                <VideoThumbnail video={item.videoid} className="group-hover:scale-105 transition-transform duration-200" />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/watch/${item.videoid.id}`}>
                <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary mb-1">
                  {item.videoid.videotitle}
                </h3>
              </Link>
              <p className="text-sm text-muted-foreground">{item.videoid.videochanel}</p>
              <p className="text-sm text-muted-foreground">
                {item.videoid.views?.toLocaleString()} views • {ago(item.videoid.createdAt)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {verb} {ago(item.createdAt)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleRemove(item)}>
                  <X className="w-4 h-4 mr-2" />
                  {removeLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}
