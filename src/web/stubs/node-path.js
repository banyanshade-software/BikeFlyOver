// Stub: node:path — exposes only the basename/extname helpers used by shared
// modules that the browser bundle may import transitively.
export function basename(p, ext) {
  const base = p.replace(/\\/g, "/").split("/").pop() ?? "";
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
  return base;
}
export function extname(p) {
  const base = basename(p);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}
export function join(...parts) {
  return parts.join("/").replace(/\/+/g, "/");
}
export function resolve(...parts) {
  return join(...parts);
}
export function dirname(p) {
  return p.replace(/\\/g, "/").replace(/\/[^/]*$/, "") || ".";
}
export default { basename, extname, join, resolve, dirname };
