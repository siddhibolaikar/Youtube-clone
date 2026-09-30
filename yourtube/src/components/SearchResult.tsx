import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAllVideos } from "@/lib/videoService";
import { toDate, type Video } from "@/lib/types";

/** Case-insensitive match on title or channel name. */
export function matchesQuery(video: Video, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    (video.videotitle ?? "").toLowerCase().includes(q) || (video.videochanel ?? "").toLowerCase().includes(q)
  );
}

const SearchResult = ({ query }: { query: string }) => {
  const [results, setResults] = useState<Video[] | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    setResults(null);
    // The catalogue is small; filter client-side (Firestore has no substring search).
    getAllVideos()
      .then((all) => !cancelled && setResults(all.filter((v) => matchesQuery(v, query))))
      .catch((err) => {
        console.error("Search failed:", err);
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!query.trim()) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Enter a search term to find videos and channels.</p>
      </div>
    );
  }

  if (results === null) return <p className="text-muted-foreground">Searching…</p>;

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">No results found</h2>
        <p className="text-muted-foreground">Try different keywords or remove search filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {results.map((video) => {
          const created = toDate(video.createdAt);
          return (
            <div key={video.id} className="flex flex-col sm:flex-row gap-4 group">
              <Link href={`/watch/${video.id}`} className="flex-shrink-0">
                <div className="relative w-full sm:w-80 aspect-video bg-muted rounded-lg overflow-hidden">
                  <video
                    src={video.videoUrl}
                    preload="metadata"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
              </Link>

              <div className="flex-1 min-w-0 py-1">
                <Link href={`/watch/${video.id}`}>
                  <h3 className="font-medium text-lg line-clamp-2 group-hover:text-primary mb-2">{video.videotitle}</h3>
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>{(video.views ?? 0).toLocaleString()} views</span>
                  {!isNaN(created.getTime()) && (
                    <>
                      <span>•</span>
                      <span>{formatDistanceToNow(created)} ago</span>
                    </>
                  )}
                </div>
                <Link
                  href={`/channel/${video.uploader}`}
                  className="flex items-center gap-2 mb-2 hover:text-primary"
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs">{video.videochanel?.[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">{video.videochanel}</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center py-8 text-muted-foreground">
        Showing {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
      </p>
    </div>
  );
};

export default SearchResult;
