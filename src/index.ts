/**
 * @rayact/mmkv — typed JS API over the librayact_mmkv native plugin (bus module
 * "mmkv"). Reaches native via the global __rayact_invoke, so it works in any
 * rayact runtime context (main QuickJS or JS workers) with no native rebuild.
 *
 * Values are stored with a one-byte type tag ('s' | 'n' | 'b') so getString /
 * getNumber / getBoolean can round-trip the original JS type.
 */

declare const __rayact_invoke: (
  name: string,
  method: string,
  args?: ArrayBufferLike
) => ArrayBuffer;

const MODULE = 'mmkv';
const enc = new TextEncoder();
const dec = new TextDecoder();

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export class MMKV {
  private readonly idBytes: Uint8Array;

  constructor(id: string = 'default') {
    this.idBytes = enc.encode(id);
  }

  private header(): Uint8Array {
    return concat([u32le(this.idBytes.length), this.idBytes]);
  }

  private invoke(method: string, payload: Uint8Array): Uint8Array {
    const args = concat([this.header(), payload]);
    return new Uint8Array(__rayact_invoke(MODULE, method, args.buffer));
  }

  private rawSet(key: string, tagged: string): void {
    const keyBytes = enc.encode(key);
    const valBytes = enc.encode(tagged);
    this.invoke('set', concat([u32le(keyBytes.length), keyBytes, valBytes]));
  }

  /** Store a string, number, or boolean. */
  set(key: string, value: string | number | boolean): void {
    if (typeof value === 'number') this.rawSet(key, 'n' + String(value));
    else if (typeof value === 'boolean') this.rawSet(key, 'b' + (value ? '1' : '0'));
    else this.rawSet(key, 's' + value);
  }

  private rawGet(key: string): string | undefined {
    const res = this.invoke('get', enc.encode(key));
    if (res.length === 0 || res[0] === 0) return undefined;
    return dec.decode(res.subarray(1));
  }

  getString(key: string): string | undefined {
    const v = this.rawGet(key);
    if (v === undefined || v[0] !== 's') return undefined;
    return v.slice(1);
  }

  getNumber(key: string): number | undefined {
    const v = this.rawGet(key);
    if (v === undefined || v[0] !== 'n') return undefined;
    return Number(v.slice(1));
  }

  getBoolean(key: string): boolean | undefined {
    const v = this.rawGet(key);
    if (v === undefined || v[0] !== 'b') return undefined;
    return v.slice(1) === '1';
  }

  contains(key: string): boolean {
    const res = this.invoke('has', enc.encode(key));
    return res.length > 0 && res[0] === 1;
  }

  delete(key: string): void {
    this.invoke('delete', enc.encode(key));
  }

  getAllKeys(): string[] {
    const res = this.invoke('keys', new Uint8Array(0));
    const keys: string[] = [];
    let i = 0;
    const view = new DataView(res.buffer, res.byteOffset, res.byteLength);
    while (i + 4 <= res.length) {
      const len = view.getUint32(i, true);
      i += 4;
      if (i + len > res.length) break;
      keys.push(dec.decode(res.subarray(i, i + len)));
      i += len;
    }
    return keys;
  }

  clearAll(): void {
    this.invoke('clear', new Uint8Array(0));
  }
}

export default MMKV;
