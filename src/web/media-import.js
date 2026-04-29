// F-web: Browser file-picker and drag-and-drop import for media files.
// Replaces the Electron dialog used by ipcMain.handle("media-import").

import { extractWebMediaMetadata } from "./media-metadata-web.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

function getExtension(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function detectMediaType(file) {
  const ext = getExtension(file.name);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

function randomId() {
  return globalThis.crypto.randomUUID();
}

function buildPreviewUrl(file, mediaType) {
  if (mediaType === "image") {
    return URL.createObjectURL(file);
  }
  return null;
}

async function fileToMediaItem(file) {
  const mediaType = detectMediaType(file);
  if (!mediaType) return null;

  const filePath = URL.createObjectURL(file);
  const previewUrl = buildPreviewUrl(file, mediaType);
  const timestampMetadata = await extractWebMediaMetadata(file, mediaType);

  return {
    id: randomId(),
    filePath,
    fileName: file.name,
    mediaType,
    previewUrl,
    ...timestampMetadata,
  };
}

function createHiddenFileInput(accept) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = accept;
  input.style.display = "none";
  document.body.appendChild(input);
  return input;
}

export async function openMediaFilePicker() {
  const accept = [
    ".jpg", ".jpeg", ".png", ".heic",
    ".mp4", ".mov", ".webm",
  ].join(",");

  return new Promise((resolve) => {
    const input = createHiddenFileInput(accept);

    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      document.body.removeChild(input);

      if (!files.length) {
        resolve({ cancelled: true, mediaItems: [] });
        return;
      }

      const results = await Promise.all(files.map(fileToMediaItem));
      const mediaItems = results.filter(Boolean);
      resolve({ cancelled: false, mediaItems });
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve({ cancelled: true, mediaItems: [] });
    });

    input.click();
  });
}

// Drag-and-drop helper — call once on the cesiumContainer or the whole body.
export function setupDragAndDrop(targetElement, onMediaItems) {
  targetElement.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  targetElement.addEventListener("drop", async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;

    const results = await Promise.all(files.map(fileToMediaItem));
    const mediaItems = results.filter(Boolean);
    if (mediaItems.length > 0) {
      onMediaItems(mediaItems);
    }
  });
}
// end F-web
