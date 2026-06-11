import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 180000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.QA_URL ?? "http://localhost:4173",
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: process.env.QA_URL
    ? undefined
    : {
        command: "npx vite preview --port 4173",
        port: 4173,
        reuseExistingServer: true,
      },
});
