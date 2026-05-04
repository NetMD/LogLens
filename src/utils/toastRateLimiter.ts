// 에러 토스트 rate limiter
// - 같은 exception class는 3초 간격 내에 1회만 허용
// - leaky bucket: 최대 2 토큰, 초당 2 토큰 충전 (전역 burst 제한)

const PER_CLASS_COOLDOWN_MS = 3000;
const BUCKET_CAPACITY = 2;
const REFILL_PER_SEC = 2;

export class ToastRateLimiter {
  private lastByClass = new Map<string, number>();
  private tokens: number = BUCKET_CAPACITY;
  private lastRefillMs: number = Date.now();

  private refill(now: number): void {
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    const add = elapsedSec * REFILL_PER_SEC;
    this.tokens = Math.min(BUCKET_CAPACITY, this.tokens + add);
    this.lastRefillMs = now;
  }

  /** 해당 exception class 의 토스트를 허용할지 반환. 허용 시 토큰 1 소비 */
  allow(exClass: string): boolean {
    const now = Date.now();

    // per-class cooldown 검사
    const last = this.lastByClass.get(exClass) ?? 0;
    if (now - last < PER_CLASS_COOLDOWN_MS) {
      return false;
    }

    // leaky bucket 토큰 검사
    this.refill(now);
    if (this.tokens < 1) {
      return false;
    }

    this.tokens -= 1;
    this.lastByClass.set(exClass, now);
    return true;
  }

  reset(): void {
    this.lastByClass.clear();
    this.tokens = BUCKET_CAPACITY;
    this.lastRefillMs = Date.now();
  }
}
