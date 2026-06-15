import { useCallback, useEffect, useState } from "react";
import type { Expedition, PlayerResources } from "../data/expeditions";
import {
  fetchPlayerExpeditions,
  fetchPlayerResources,
} from "../lib/expeditionApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

const EMPTY_RESOURCES: PlayerResources = {
  playerName: "",
  expeditionTickets: 0,
  gold: 0,
  items: {},
  morale: 70,
  fatigue: 0,
  proficiency: 0,
  trust: 0,
  equipmentKey: "wooden_sword",
  equipmentDurability: 100,
  jobClass: "novice",
  lastTrainedAt: null,
  totalExpeditionSuccess: 0,
  totalExpeditionFailure: 0,
};

export function useExpeditions(playerName: string) {
  const [resources, setResources] = useState<PlayerResources>(EMPTY_RESOURCES);
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const normalizedName = playerName.trim();
    if (!normalizedName) {
      setResources(EMPTY_RESOURCES);
      setExpeditions([]);
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase設定が未完了です。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextResources, nextExpeditions] = await Promise.all([
        fetchPlayerResources(normalizedName),
        fetchPlayerExpeditions(normalizedName),
      ]);
      setResources(nextResources);
      setExpeditions(nextExpeditions);
    } catch {
      setError("遠征情報の読み込みに失敗しました。");
      setResources({ ...EMPTY_RESOURCES, playerName: normalizedName });
      setExpeditions([]);
    } finally {
      setLoading(false);
    }
  }, [playerName]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const normalizedName = playerName.trim();
    if (!isSupabaseConfigured || !normalizedName) return;

    const client = requireSupabase();
    const channel = client
      .channel(`expeditions-${normalizedName}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_resources" },
        () => {
          void reload();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expeditions" },
        () => {
          void reload();
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [playerName, reload]);

  return { resources, expeditions, loading, error, reload };
}
