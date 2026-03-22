import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect } from "vite";
import type { Plugin } from "vite";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));

function backendRoot(): string {
  return path.resolve(pluginDir, "..", "backend");
}

function firstIfcFilename(dir: string): string | null {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".ifc"))
    .sort();
  return names[0] ?? null;
}

function safeIfcBasename(segment: string): string | null {
  const decoded = decodeURIComponent(segment);
  const base = path.basename(decoded);
  if (base !== decoded || base.includes("..")) return null;
  if (!base.toLowerCase().endsWith(".ifc")) return null;
  return base;
}

function attachIfcMiddleware(middlewares: Connect.Server) {
  const root = backendRoot();
  const rscDir = path.join(root, "rsc");
  const outputDir = path.join(root, "output");

  middlewares.use((req, res, next) => {
    const raw = req.url?.split("?")[0] ?? "";

    if (raw === "/api/ifc-meta" && req.method === "GET") {
      const baselineName = firstIfcFilename(rscDir);
      let baseline: { filename: string; mtimeMs: number } | null = null;
      if (baselineName) {
        const full = path.join(rscDir, baselineName);
        try {
          const st = fs.statSync(full);
          baseline = { filename: baselineName, mtimeMs: st.mtimeMs };
        } catch {
          baseline = null;
        }
      }

      let current: { filename: string; mtimeMs: number } | null = null;
      if (baselineName) {
        const outFull = path.join(outputDir, baselineName);
        try {
          const st = fs.statSync(outFull);
          current = { filename: baselineName, mtimeMs: st.mtimeMs };
        } catch {
          current = null;
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ baseline, current }));
      return;
    }

    if (raw.startsWith("/rsc/") && req.method === "GET") {
      const name = safeIfcBasename(raw.slice("/rsc/".length));
      if (!name) return next();
      const full = path.join(rscDir, name);
      if (!fs.existsSync(full)) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      fs.createReadStream(full).pipe(res);
      return;
    }

    if (raw.startsWith("/output/") && req.method === "GET") {
      const name = safeIfcBasename(raw.slice("/output/".length));
      if (!name) return next();
      const full = path.join(outputDir, name);
      if (!fs.existsSync(full)) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      fs.createReadStream(full).pipe(res);
      return;
    }

    next();
  });
}

export function ifcDirsPlugin(): Plugin {
  return {
    name: "ifc-dirs",
    configureServer(server) {
      attachIfcMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachIfcMiddleware(server.middlewares);
    },
  };
}
