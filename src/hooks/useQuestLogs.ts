import { useCallback, useEffect, useState } from "react";
import { fetchQuestLogs, rowToQuestLog, type QuestLog } from "../lib/questLogApi";
import type { QuestLogRow } from "../lib/questLogApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

export function useQuestLogs() {
  const [logs, setLogs] = useState<QuestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mergeLog = useCallback((log: QuestLog) => {
    setLogs((prev) => {
      if (prev.some((l) => l.id === log.id)) return prev;
      return [log, ...prev].slice(0, 40);
    });
  }, []);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuestLogs();
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const client = requireSupabase();
    const channel = client
      .channel("quest-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quest_logs" },
        (payload) => {
          const row = payload.new as QuestLogRow;
          if (row?.id != null) mergeLog(rowToQuestLog(row));
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [mergeLog]);

  return { logs, loading, error, reload };
}
