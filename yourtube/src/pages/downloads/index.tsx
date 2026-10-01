import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Crown, Download, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PremiumDialog from "@/components/PremiumDialog";
import { useUser } from "@/lib/AuthContext";
import { apiFetch, errorMessage } from "@/lib/apiClient";
import { quotaLabel, type DownloadQuota } from "@/lib/downloadQuota";
import type { DownloadRecordDTO } from "../api/downloads";

export default function DownloadsPage() {
  const { user } = useUser();
  const [downloads, setDownloads] = useState<DownloadRecordDTO[]>([]);
  const [quota, setQuota] = useState<DownloadQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [premiumOpen, setPremiumOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ downloads: DownloadRecordDTO[]; quota: DownloadQuota }>("/api/downloads");
      setDownloads(data.downloads);
      setQuota(data.quota);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  if (!user) {
    return (
      <main className="flex-1 p-6">
        <h1 className="text-2xl font-semibold mb-2">Downloads</h1>
        <p className="text-muted-foreground">Sign in to see the videos you&apos;ve downloaded.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Downloads</h1>
          {quota && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="download-quota">
              {quota.isPremium ? (
                <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                  <Crown className="w-4 h-4" /> {quotaLabel(quota)}
                </span>
              ) : (
                <>
                  {quotaLabel(quota)} · resets at midnight IST
                </>
              )}
            </p>
          )}
        </div>
        {quota && !quota.isPremium && (
          <Button onClick={() => setPremiumOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
            <Crown className="w-4 h-4" /> Go Premium
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : downloads.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Download className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No downloads yet. Use the Download button under any video.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {downloads.map((d) => (
            <li key={d.id} className="flex gap-4 items-center rounded-lg border p-2">
              <div className="w-40 aspect-video rounded overflow-hidden bg-muted shrink-0">
                {d.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element -- small static poster
                  <img src={d.thumbnail} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium line-clamp-2">{d.videotitle}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Downloaded {format(new Date(d.downloadedAt), "d MMM yyyy, h:mm a")}
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/watch/${d.videoId}`}>
                  <Play className="w-4 h-4" /> Play
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PremiumDialog open={premiumOpen} onOpenChange={setPremiumOpen} onPurchased={load} />
    </main>
  );
}
