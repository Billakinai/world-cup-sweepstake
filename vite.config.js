import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Reads Supabase credentials from any of the common variable names, so the
// Vercel x Supabase marketplace integration works with zero manual setup.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const url =
    env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(key),
    },
  };
});
