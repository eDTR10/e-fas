import path from "path"
import { copyFileSync, mkdirSync } from "fs"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/e-fas/",
  plugins: [
    react(),
    {
      name: "github-pages-spa-fallback",
      closeBundle() {
        mkdirSync("dist/admin", { recursive: true })
        copyFileSync("dist/index.html", "dist/admin/index.html")
        copyFileSync("dist/index.html", "dist/404.html")
      },
    },
  ],
  server: {
    host: '0.0.0.0', // IP address, 0.0.0.0 makes it accessible on your local network
    port: 3001, // specify the port you want here
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
