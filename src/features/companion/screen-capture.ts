import type { CaptureMode } from "./types";

export async function captureFrame(
  mode: CaptureMode,
  targetElement?: HTMLElement | null,
  videoElement?: HTMLVideoElement | null,
): Promise<string | null> {
  if (mode === "display-media" && videoElement) {
    return captureFromVideo(videoElement);
  }
  return captureFromCanvas(targetElement);
}

async function captureFromCanvas(
  targetElement?: HTMLElement | null,
): Promise<string | null> {
  const element = targetElement ?? document.querySelector("main") ?? document.body;
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(element as HTMLElement, {
      scale: 0.5,
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
    return dataUrl.split(",")[1] ?? null;
  } catch {
    return null;
  }
}

function captureFromVideo(video: HTMLVideoElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
  return dataUrl.split(",")[1] ?? null;
}

export async function requestDisplayMedia(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" } as MediaTrackConstraints,
    });
  } catch {
    return null;
  }
}
