import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { fetchIfcAsFile, fetchIssuesJsonFromUrl } from "../services/backendIfcFiles";

/**
 * When the agent WebSocket sends `awaiting_review` or `session_complete`, the store
 * receives a sync request; this hook fetches the named IFC + issues from `/output/`.
 */
export function useAgentOutputSync() {
  const agentOutputSync = useAppStore((s) => s.agentOutputSync);
  const setIfcFile = useAppStore((s) => s.setIfcFile);
  const setIssues = useAppStore((s) => s.setIssues);

  useEffect(() => {
    if (!agentOutputSync) return;
    const { outputIfcBasename, issuesJsonBasename, nonce } = agentOutputSync;
    const cb = encodeURIComponent(nonce);
    let cancelled = false;

    async function run() {
      const ifcUrl = `/output/${encodeURIComponent(outputIfcBasename)}?cb=${cb}`;
      const jsonUrl = `/output/${encodeURIComponent(issuesJsonBasename)}?cb=${cb}`;
      try {
        const [ifcFile, issues] = await Promise.all([
          fetchIfcAsFile(ifcUrl, outputIfcBasename),
          fetchIssuesJsonFromUrl(jsonUrl),
        ]);
        if (cancelled) return;
        if (issues) {
          setIfcFile(ifcFile);
          setIssues(issues);
        } else {
          console.warn("Agent sync: failed to parse issues JSON", jsonUrl);
          setIfcFile(ifcFile);
          setIssues(null);
        }
      } catch (e) {
        if (!cancelled) console.warn("Agent sync: failed to load output IFC/issues", e);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    agentOutputSync?.nonce,
    agentOutputSync?.outputIfcBasename,
    agentOutputSync?.issuesJsonBasename,
    setIfcFile,
    setIssues,
  ]);
}
