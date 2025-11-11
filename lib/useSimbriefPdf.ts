import { useEffect, useState } from "react";

export function useSimbriefPdf(username?: string) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!username && !process.env.NEXT_PUBLIC_SIMBRIEF_USERNAME) return;
      setLoading(true);
      setError(null);

      const qs = username
        ? `?username=${encodeURIComponent(username)}`
        : "";

      try {
        const res = await fetch(`/api/simbrief/ofp-latest-pdf${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to fetch latest PDF.");

        // Optional: validate with your existing validator route
        const v = await fetch(`/api/simbrief/validate-pdf?url=${encodeURIComponent(json.url)}`, {
          cache: "no-store",
        });
        const vj = await v.json();
        if (!vj?.ok) throw new Error(vj?.error || "Validation failed.");
        if (!cancelled) setPdfUrl(vj.url);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return { pdfUrl, error, loading };
}
