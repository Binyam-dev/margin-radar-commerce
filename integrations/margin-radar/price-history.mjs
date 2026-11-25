import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

// Stores observations we actually collect. Advertised prices never become sold evidence.
export class PriceHistory {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY, source TEXT NOT NULL, product_id TEXT NOT NULL,
        variant_id TEXT NOT NULL, currency TEXT NOT NULL, price REAL NOT NULL,
        observed_at INTEGER NOT NULL, evidence_type TEXT NOT NULL DEFAULT 'SUPPLIER_OFFER'
      );
      CREATE INDEX IF NOT EXISTS observations_lookup
      ON observations(source, variant_id, currency, observed_at);`);
  }
  record({source,productId,variantId,currency,price,observedAt=Date.now()}) {
    if (!source || !productId || !variantId || !/^[A-Z]{3}$/.test(currency) ||
        !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(observedAt) || observedAt > Date.now()) {
      throw new Error('Invalid price observation');
    }
    const prior=this.db.prepare(`SELECT price FROM observations WHERE source=? AND variant_id=? AND currency=? ORDER BY observed_at DESC,id DESC LIMIT 1`).get(source,variantId,currency);
    this.db.prepare(`INSERT INTO observations(source,product_id,variant_id,currency,price,observed_at) VALUES(?,?,?,?,?,?)`).run(source,productId,variantId,currency,price,observedAt);
    return {price,previousPrice:prior?.price ?? null,dropPercent:prior ? +(100*(prior.price-price)/prior.price).toFixed(2) : null};
  }
  history({source,variantId,currency,limit=100}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid history limit');
    return this.db.prepare(`SELECT price,observed_at AS observedAt,evidence_type AS evidenceType FROM observations WHERE source=? AND variant_id=? AND currency=? ORDER BY observed_at DESC,id DESC LIMIT ?`).all(source,variantId,currency,limit);
  }
  close() { this.db.close(); }
}
