export class MemoryCache {
  constructor() { this.values = new Map(); this.pending = new Map(); }
  async getOrLoad(key, ttl, load) {
    const entry = this.values.get(key);
    if (entry && entry.expires > Date.now()) return entry.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = Promise.resolve().then(load).then(value => {
      this.values.set(key, { value, expires: Date.now() + ttl });
      if (this.values.size > 1000) {
        for (const [k, v] of this.values) if (v.expires <= Date.now() || this.values.size > 1000) this.values.delete(k);
      }
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}

export const cache = new MemoryCache();
