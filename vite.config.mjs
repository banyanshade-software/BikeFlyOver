import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, "src/web"),

  // Serve the samples/ directory at /samples/ so the browser can fetch activity files.
  publicDir: path.resolve(__dirname, "src/web/public"),

  build: {
    // Use a relative path so vite-plugin-cesium's path.join(root, outDir) resolves correctly.
    // root = src/web → outDir = ../../dist/web → resolved = dist/web
    outDir: "../../dist/web",
    emptyOutDir: true,
    target: "esnext",
  },

  plugins: [cesium()],

  server: {
    // Cross-Origin-Embedder-Policy: credentialless allows SharedArrayBuffer (needed by
    // ffmpeg.wasm) while still permitting cross-origin requests for Cesium tiles that
    // lack a CORP header (unlike 'require-corp' which would block them).
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },

  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },

  resolve: {
    // Stub Node.js built-ins that appear in CJS shared modules not needed in the
    // browser bundle. Vite normally errors on unresolvable Node.js core modules.
    alias: {
      "node:path": path.resolve(__dirname, "src/web/stubs/node-path.js"),
      "node:fs/promises": path.resolve(
        __dirname,
        "src/web/stubs/node-fs-promises.js",
      ),
      "node:child_process": path.resolve(
        __dirname,
        "src/web/stubs/node-child-process.js",
      ),
      "node:os": path.resolve(__dirname, "src/web/stubs/node-os.js"),
      "node:crypto": path.resolve(__dirname, "src/web/stubs/node-crypto.js"),
      "node:url": path.resolve(__dirname, "src/web/stubs/node-url.js"),
      // The Electron-specific modules below are imported in shared code paths
      // that the web bundle doesn't invoke but Rollup still tries to resolve.
      "electron": path.resolve(__dirname, "src/web/stubs/electron.js"),
      "ffmpeg-static": path.resolve(__dirname, "src/web/stubs/ffmpeg-static.js"),
      "ffprobe-static": path.resolve(
        __dirname,
        "src/web/stubs/ffprobe-static.js",
      ),
    },
  },

  optimizeDeps: {
    // Prevent Vite from pre-bundling CJS modules that reference Node.js APIs
    // which we have already stubbed; let Rollup handle them at build time.
    exclude: ["ffmpeg-static", "ffprobe-static"],
  },
});
