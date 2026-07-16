import { randomUUID } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { runNegotiationRound } from './negotiation-engine';
import { loadState, getEmergency, saveBids, saveResult, broadcast, getLLMKeys } from './data';
import type { Bid } from './types';

// ── Config ────────────────────────────────────────────────────
const DEBOUNCE_MS = parseInt(process.env.DEBOUNCE_MS || '3000', 10);
const ROUND_COOLDOWN_MS = parseInt(process.env.ROUND_COOLDOWN_MS || '5000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

// ── In-memory debounce timers ─────────────────────────────────
const timers = new Map<string, NodeJS.Timeout>();

function debounce(key: string, callback: () => void | Promise<void>, ms: number): void {
  if (timers.has(key)) clearTimeout(timers.get(key)!);
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    const result = callback();
    if (result instanceof Promise) result.catch(err => console.error(`[Debounce] Error in "${key}":`, err));
  }, ms));
}

function cancelDebounce(key: string): boolean {
  if (timers.has(key)) {
    clearTimeout(timers.get(key)!);
    timers.delete(key);
    return true;
  }
  return false;
}

// ── In-memory locks (replaces Redis) ──────────────────────────
const locks = new Map<string, string>(); // key → roundId

function acquireLock(key: string, value: string, _ttlSeconds: number): boolean {
  if (locks.has(key)) return false;
  locks.set(key, value);
  return true;
}

function releaseLock(key: string, value: string): void {
  if (locks.get(key) === value) locks.delete(key);
}

// ── Active round tracking ─────────────────────────────────────
const activeRound = new Map<string, boolean>();
const cancelled = new Map<string, boolean>();

// ── Public API ────────────────────────────────────────────────

/**
 * Schedule a negotiation round for an emergency.
 * Debounces rapid-fire case additions (individual scope).
 * Runs a repeating loop for mass scope.
 */
export function scheduleEmergency(emergencyId: string, hospitalId: string): void {
  const debounceKey = `emergency:${emergencyId}`;

  debounce(debounceKey, async () => {
    if (activeRound.get(emergencyId)) {
      console.log(`[Scheduler] Round already active for ${emergencyId}, skipping`);
      return;
    }

    try {
      const emergency = await getEmergency(emergencyId, hospitalId);
      if (!emergency || emergency.status !== 'active') {
        console.log(`[Scheduler] Emergency ${emergencyId} is not active, skipping`);
        return;
      }

      if (emergency.scope === 'mass') {
        await runMassLoop(emergencyId, hospitalId);
      } else {
        activeRound.set(emergencyId, true);
        try {
          await triggerRound(emergencyId, hospitalId);
        } finally {
          activeRound.set(emergencyId, false);
        }
      }
    } catch (err) {
      console.error(`[Scheduler] Error processing ${emergencyId}:`, err);
    }
  }, DEBOUNCE_MS);
}

/**
 * Cancel any pending debounce and active rounds for this emergency.
 */
export function cancelSchedule(emergencyId: string): boolean {
  cancelDebounce(`emergency:${emergencyId}`);
  cancelled.set(emergencyId, true);
  return activeRound.delete(emergencyId);
}

/**
 * Check if a negotiation round is currently running for this emergency.
 */
export function isActive(emergencyId: string): boolean {
  return activeRound.get(emergencyId) === true;
}

// ── Internal: trigger a single negotiation round ──────────────

async function triggerRound(emergencyId: string, hospitalId: string): Promise<string | null> {
  const lockKey = `lock:emergency:${emergencyId}`;
  const roundId = uuidv4();

  if (!acquireLock(lockKey, roundId, 30)) {
    console.log(`[Scheduler] Could not acquire lock for ${emergencyId}, another round is running`);
    return null;
  }

  try {
    console.log(`[Scheduler] Starting round ${roundId} for emergency ${emergencyId}`);

    const state = await loadState(emergencyId, hospitalId);

    if (state.cases.length === 0) {
      console.log(`[Scheduler] No cases for ${emergencyId}, skipping round`);
      return null;
    }

    if (state.resources.length === 0) {
      console.log(`[Scheduler] No resources for ${emergencyId}, skipping round`);
      return null;
    }

    // Resolve LLM keys for this hospital
    const llmKeys = await getLLMKeys(hospitalId);

    const onBid = (bid: Bid) => {
      try {
        broadcast(emergencyId, 'bid_submitted', { ...bid, round_id: roundId });
      } catch (err) {
        console.error(`[Scheduler] broadcast(bid_submitted) failed:`, err);
      }
    };

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await runNegotiationRound(
          state.cases,
          state.resources,
          state.dependencies,
          onBid,
          roundId,
          llmKeys
        );

        await saveBids(roundId, result.bids, hospitalId);
        const savedAllocs = await saveResult(roundId, result.allocations, result.explanation, hospitalId);

        try {
          broadcast(emergencyId, 'round:completed', {
            roundId,
            emergencyId,
            allocations: savedAllocs,
            explanation: result.explanation,
          });
        } catch (broadcastErr) {
          console.error(`[Scheduler] broadcast(round:completed) failed:`, broadcastErr);
        }

        console.log(`[Scheduler] Round ${roundId} completed successfully`);
        return roundId;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Scheduler] Attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`[Scheduler] All ${MAX_RETRIES} attempts failed for round ${roundId}`);
    return null;
  } finally {
    releaseLock(lockKey, roundId);
  }
}

// ── Internal: mass-scope repeating loop ───────────────────────

async function runMassLoop(emergencyId: string, hospitalId: string): Promise<void> {
  cancelled.delete(emergencyId);
  activeRound.set(emergencyId, true);

  try {
    while (!cancelled.get(emergencyId)) {
      const emergency = await getEmergency(emergencyId, hospitalId);
      if (!emergency || emergency.status !== 'active') {
        console.log(`[Scheduler] Emergency ${emergencyId} resolved, stopping mass loop`);
        break;
      }

      await triggerRound(emergencyId, hospitalId);

      // Cooldown between rounds (check cancellation during wait)
      const cooldownEnd = Date.now() + ROUND_COOLDOWN_MS;
      while (Date.now() < cooldownEnd && !cancelled.get(emergencyId)) {
        await delay(Math.min(200, cooldownEnd - Date.now()));
      }
    }
  } finally {
    activeRound.set(emergencyId, false);
    cancelled.delete(emergencyId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
