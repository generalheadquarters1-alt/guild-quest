import { useCallback, useEffect, useState } from "react";
import type { Quest } from "../data/quests";
import { rowToQuest, type QuestRow } from "../lib/questMapper";
import { fetchAllQuests } from "../lib/questApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

export function useQuests() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mergeQuest = useCallback((quest: Quest) => {
    setQuests((prev) => {
      const idx = prev.findIndex((q) => q.id === quest.id);
      if (idx === -1) return [...prev, quest];
      const next = [...prev];
      next[idx] = quest;
      return next;
    });
  }, []);

  const removeQuest = useCallback((id: number) => {
    setQuests((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are not set.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllQuests();
      setQuests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quests");
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
      .channel("quests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quests" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id != null) removeQuest(old.id);
            return;
          }
          const row = payload.new as QuestRow;
          if (row?.id != null) mergeQuest(rowToQuest(row));
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [mergeQuest, removeQuest]);

  const findQuest = useCallback(
    (id: number) => quests.find((q) => q.id === id),
    [quests],
  );

  return {
    quests,
    setQuests,
    loading,
    error,
    reload,
    findQuest,
    mergeQuest,
    removeQuest,
  };
}
