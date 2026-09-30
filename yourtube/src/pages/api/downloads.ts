import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cloudinaryAttachmentUrl, cloudinaryThumbnailUrl } from "@/lib/cloudinary";
import { computeQuota, downloadDayKey } from "@/lib/downloadQuota";
import { FREE_DAILY_DOWNLOADS } from "@/lib/plans";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { withAuth } from "@/lib/server/withAuth";

export interface DownloadRecordDTO {
  id: string;
  videoId: string;
  videotitle: string;
  videoUrl: string;
  thumbnail: string | null;
  downloadedAt: string;
}

// GET  → { downloads, quota }
// POST { videoId } → { url, quota } | 402 { reason: "DAILY_LIMIT" }
export default withAuth(["GET", "POST"], async (req, res) => {
  const db = adminDb();
  const uid = req.user.uid;
  const userRef = db.collection("users").doc(uid);
  const downloadsRef = userRef.collection("downloads");
  const now = new Date();
  const dayRef = userRef.collection("downloadDays").doc(downloadDayKey(now));

  if (req.method === "GET") {
    const [userSnap, daySnap, list] = await Promise.all([
      userRef.get(),
      dayRef.get(),
      downloadsRef.orderBy("downloadedAt", "desc").limit(100).get(),
    ]);
    const downloads: DownloadRecordDTO[] = list.docs.map((d) => ({
      id: d.id,
      videoId: d.get("videoId"),
      videotitle: d.get("videotitle"),
      videoUrl: d.get("videoUrl"),
      thumbnail: d.get("thumbnail") ?? null,
      downloadedAt: (d.get("downloadedAt") as Timestamp).toDate().toISOString(),
    }));
    return res.status(200).json({
      downloads,
      quota: computeQuota(userSnap.get("isPremium") === true, daySnap.get("count") ?? 0, now),
    });
  }

  const videoId = requireString(req.body?.videoId, "videoId", 128);
  const video = await db.collection("videos").doc(videoId).get();
  if (!video.exists) throw new HttpError(404, { error: "Video not found" });
  const videotitle: string = video.get("videotitle") ?? "video";
  const videoUrl: string = video.get("videoUrl");
  if (!videoUrl) throw new HttpError(409, { error: "This video has no downloadable file" });

  // The day counter is read and bumped in the same transaction, so two
  // parallel clicks can't both spend the one free download.
  const quota = await db.runTransaction(async (tx) => {
    const [userSnap, daySnap, already] = await Promise.all([
      tx.get(userRef),
      tx.get(dayRef),
      tx.get(downloadsRef.where("videoId", "==", videoId).limit(1)),
    ]);
    const isPremium = userSnap.get("isPremium") === true;
    const used: number = daySnap.get("count") ?? 0;

    // Re-downloading something already in your Downloads is free.
    if (!already.empty) return computeQuota(isPremium, used, now);

    if (!isPremium && used >= FREE_DAILY_DOWNLOADS) {
      throw new HttpError(402, {
        error: "You've used today's free download. Go Premium for unlimited downloads.",
        reason: "DAILY_LIMIT",
        quota: computeQuota(false, used, now),
      });
    }
    tx.set(dayRef, { count: FieldValue.increment(1), day: downloadDayKey(now) }, { merge: true });
    tx.create(downloadsRef.doc(), {
      videoId,
      videotitle,
      videoUrl,
      thumbnail: cloudinaryThumbnailUrl(videoUrl),
      downloadedAt: Timestamp.fromDate(now),
    });
    return computeQuota(isPremium, used + 1, now);
  });

  res.status(200).json({ url: cloudinaryAttachmentUrl(videoUrl, videotitle), quota });
});
