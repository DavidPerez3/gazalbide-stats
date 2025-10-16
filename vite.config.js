import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // En dev: "/" | En build (GH Pages): "/gazalbide-stats/"
  base: process.env.NODE_ENV === "production" ? "/gazalbide-stats/" : "/",
});
