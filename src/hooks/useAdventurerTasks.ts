import { useCallback, useEffect, useState } from "react";
import type { AdventurerTask } from "../data/adventurerTasks";
import {
  fetchAdventurerTasks,
  rowToAdventurerTask,
  type AdventurerTaskRow,
} from "../lib/adventurerTaskApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

export function useAdventurerTasks() {
  const [tasks, setTasks] = useState<AdventurerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mergeTask = useCallback((task: AdventurerTask) => {
    setTasks((prev) => {
      const index = prev.findIndex((item) => item.id === task.id);
      if (index === -1) return [...prev, task];
      const next = [...prev];
      next[index] = task;
      return next;
    });
  }, []);

  const removeTask = useCallback((id: number) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
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
      setTasks(await fetchAdventurerTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
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
      .channel("adventurer-tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "adventurer_tasks" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id != null) removeTask(old.id);
            return;
          }
          const row = payload.new as AdventurerTaskRow;
          if (row?.id != null) mergeTask(rowToAdventurerTask(row));
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [mergeTask, removeTask]);

  const findTask = useCallback(
    (id: number) => tasks.find((task) => task.id === id),
    [tasks],
  );

  return {
    tasks,
    loading,
    error,
    reload,
    findTask,
    mergeTask,
    removeTask,
  };
}
