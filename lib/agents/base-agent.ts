import { createServerClient } from "@/lib/supabase";
import type { AgentTaskRow } from "@/lib/db-types";

// Répliques Dikkenek pour les logs de Claudy
const CLAUDY_QUOTES = [
  "Moi c'est Claudy, je fais la veille.",
  "Pas de bras, pas de chocolat.",
  "C'est pas faux.",
  "Faut pas pousser mémé dans les orties.",
  "On est pas bien là ? Paisibles, à la fraîche...",
  "La chance, c'est comme le Tour de France, tu l'attends longtemps et ça passe vite.",
];

function randomQuote(): string {
  return CLAUDY_QUOTES[Math.floor(Math.random() * CLAUDY_QUOTES.length)];
}

export abstract class BaseAgent {
  protected taskId: string;
  protected supabase: ReturnType<typeof createServerClient>;
  private startedAt: number;

  protected maxRuntimeMs = 30 * 60 * 1000;

  constructor(taskId: string) {
    this.taskId = taskId;
    this.supabase = createServerClient();
    this.startedAt = Date.now();
  }

  protected checkTimeout(): void {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed > this.maxRuntimeMs) {
      throw new Error(
        `Timeout: Claudy a dépassé ${Math.round(this.maxRuntimeMs / 60_000)}min (${Math.round(elapsed / 60_000)}min écoulées). ${randomQuote()}`
      );
    }
  }

  protected async log(
    level: "info" | "warn" | "error",
    message: string
  ): Promise<void> {
    try {
      const { data: task } = await this.supabase
        .from("agent_tasks")
        .select("logs")
        .eq("id", this.taskId)
        .single();

      const logs = [
        ...((task?.logs as AgentTaskRow["logs"]) ?? []),
        { timestamp: new Date().toISOString(), level, message },
      ];

      await this.supabase
        .from("agent_tasks")
        .update({ logs, updated_at: new Date().toISOString() })
        .eq("id", this.taskId);
    } catch (err) {
      console.error(`[${this.taskId}] log() failed:`, err);
    }
  }

  protected async setProgress(progress: number): Promise<void> {
    try {
      await this.supabase
        .from("agent_tasks")
        .update({ progress, updated_at: new Date().toISOString() })
        .eq("id", this.taskId);
    } catch (err) {
      console.error(`[${this.taskId}] setProgress(${progress}) failed:`, err);
    }
  }

  protected async complete(
    result: Record<string, unknown>
  ): Promise<void> {
    try {
      const durationMs = Date.now() - this.startedAt;
      await this.supabase
        .from("agent_tasks")
        .update({
          status: "completed",
          progress: 100,
          result,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.taskId);
    } catch (err) {
      console.error(`[${this.taskId}] complete() failed:`, err);
    }
  }

  async fail(error: string): Promise<void> {
    await this.log("error", error);

    try {
      const durationMs = Date.now() - this.startedAt;
      await this.supabase
        .from("agent_tasks")
        .update({
          status: "failed",
          error_message: error,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.taskId);
    } catch (err) {
      console.error(`[${this.taskId}] CRITICAL: fail() DB update failed:`, err);
    }
  }

  protected async getTask(): Promise<AgentTaskRow | null> {
    try {
      const { data } = await this.supabase
        .from("agent_tasks")
        .select("*")
        .eq("id", this.taskId)
        .single();
      return data as AgentTaskRow | null;
    } catch (err) {
      console.error(`[${this.taskId}] getTask() failed:`, err);
      return null;
    }
  }

  abstract run(): Promise<void>;
}
