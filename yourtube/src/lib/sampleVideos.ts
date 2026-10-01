import type { Video } from "./types";

// The fixed catalogue for the demo. Files are served from public/videos.
// Firestore keeps a videos/{id} doc per entry only for live counters (views,
// likes), which comments and likes need to exist; `npm run seed:samples`
// creates them.

const SIDDHI = { videochanel: "Siddhi Bolaikar", uploader: "sample-siddhi-bolaikar" };
const PIUSH = { videochanel: "Piush Gogi", uploader: "39loaUKwPMVFd5M0LwWOpgwCYho1" };

const file = (name: string) => ({
  videoUrl: `/videos/${name}.mp4`,
  poster: `/videos/${name}.jpg`,
  filename: `${name}.mp4`,
  filetype: "video/mp4",
});

export const SAMPLE_VIDEOS: Video[] = [
  { id: "sample-sintel-trailer", videotitle: "Sintel - Official Trailer (Blender, CC-BY)", ...file("sintel-trailer"), duration: 52, ...SIDDHI, createdAt: "2026-10-01T05:01:00Z" },
  { id: "sample-elephants", videotitle: "Elephants in the Wild", ...file("elephants"), duration: 53, ...SIDDHI, createdAt: "2026-10-01T05:02:00Z" },
  { id: "sample-sea-turtle", videotitle: "Sea Turtle Swimming", ...file("sea-turtle"), duration: 15, ...SIDDHI, createdAt: "2026-10-01T05:03:00Z" },
  { id: "sample-happy-dog", videotitle: "Happy Dog", ...file("happy-dog"), duration: 13, ...SIDDHI, createdAt: "2026-10-01T05:04:00Z" },
  { id: "0XqXd6F9O6Dtl6PTcjF3", videotitle: "prototype.mp4", ...file("prototype"), duration: 44, ...PIUSH, createdAt: "2026-10-01T04:45:00Z" },
];
