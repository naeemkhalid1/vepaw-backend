import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const next = (parseInt(current ?? '0', 10) || 0) + 1;
    const entry = this.store.get(key);
    this.store.set(key, { value: `${next}`, expiresAt: entry?.expiresAt });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  // Seconds remaining until the key expires — 0 if the key is missing, already expired, or has
  // no TTL set at all. Used to hand a real "try again in N seconds" value back to the client
  // instead of just a rate-limited error with no indication of when to retry.
  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return 0;
    const remainingMs = entry.expiresAt - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }
}
