// Writes the Firestore side of the hardcoded catalogue (src/lib/sampleVideos.ts):
// a videos/{id} doc per video (comments, likes and downloads need it to exist)
// and the "Siddhi Bolaikar" channel card. Videos not in the catalogue are
// removed. Safe to re-run: views and likes are kept.
//
//   npm run seed:samples        (uses the Admin credentials in .env.local)
import { FieldValue } from "firebase-admin/firestore";

const { adminDb } = await import("../src/lib/server/firebaseAdmin");
const { SAMPLE_VIDEOS } = await import("../src/lib/sampleVideos");

const db = adminDb();
const batch = db.batch();

batch.set(db.collection("channels").doc("sample-siddhi-bolaikar"), {
  channelname: "Siddhi Bolaikar",
  name: "Siddhi Bolaikar",
  description: "Sample videos for the YourTube demo.",
  image: "",
});

const ids = new Set(SAMPLE_VIDEOS.map((v) => v.id));
const existing = new Map((await db.collection("videos").get()).docs.map((d) => [d.id, d]));

for (const v of SAMPLE_VIDEOS) {
  const meta = {
    videotitle: v.videotitle,
    videochanel: v.videochanel,
    uploader: v.uploader,
    videoUrl: v.videoUrl,
    poster: v.poster,
    filename: v.filename,
    filetype: v.filetype,
    duration: v.duration,
  };
  batch.set(
    db.collection("videos").doc(v.id),
    { ...meta, ...(!existing.has(v.id) && { views: 0, likes: 0, createdAt: FieldValue.serverTimestamp() }) },
    { merge: true }
  );
}

for (const [id, d] of existing) {
  if (!ids.has(id)) {
    batch.delete(d.ref);
    console.log("removing", id, d.get("videotitle"));
  }
}

await batch.commit();
console.log(`Synced ${SAMPLE_VIDEOS.length} videos.`);
