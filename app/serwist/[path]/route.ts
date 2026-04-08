import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
const revision =
  git.status === 0 && typeof git.stdout === "string" && git.stdout.trim().length > 0
    ? git.stdout.trim()
    : randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
});
