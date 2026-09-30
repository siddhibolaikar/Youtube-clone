import { describe, expect, it } from "vitest";
import { recordingFilename } from "./callRecorder";

describe("recordingFilename", () => {
  it("is yourtube-call-YYYYMMDD-HHmm.webm in IST", () => {
    // 18:45 UTC = 00:15 IST the next day
    expect(recordingFilename(new Date("2026-09-30T18:45:00Z"))).toBe("yourtube-call-20261001-0015.webm");
    expect(recordingFilename(new Date("2026-01-05T03:30:00Z"))).toBe("yourtube-call-20260105-0900.webm");
  });
});
