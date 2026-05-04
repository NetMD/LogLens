import { describe, it, expect, beforeEach } from "vitest";
import { parseBatch, flushPending, resetParser } from "../logParser";

beforeEach(() => {
  resetParser();
});

// ─────────────────────────────────────────────
// TC-01: 표준 Spring Boot 패턴 파싱
// ─────────────────────────────────────────────
describe("TC-01 | 표준 Spring Boot 로그 패턴 (공백 구분자)", () => {
  it("TC-01-1: 단일 INFO 라인 파싱 성공", () => {
    const lines = [
      "2024-01-15 14:23:45.123  INFO 12345 --- [main] c.example.MyApp : Application started",
    ];
    const result = parseBatch(lines, null);
    // pending에 남아 있음 (배치 내 마지막 엔트리는 flush 전)
    expect(result.pending?.timestamp).toBe("2024-01-15 14:23:45.123");
    expect(result.pending?.level).toBe("INFO");
    expect(result.pending?.pid).toBe(12345);
    expect(result.pending?.thread).toBe("main");
    expect(result.pending?.logger).toBe("c.example.MyApp");
    expect(result.pending?.message).toBe("Application started");
    expect(result.parseFailCount).toBe(0);
  });

  it("TC-01-2: 두 개의 로그 라인 — 첫 번째가 entries에, 두 번째가 pending에", () => {
    const lines = [
      "2024-01-15 14:23:45.123  INFO 1 --- [main] c.A : First",
      "2024-01-15 14:23:46.000  WARN 1 --- [main] c.B : Second",
    ];
    const result = parseBatch(lines, null);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].level).toBe("INFO");
    expect(result.entries[0].message).toBe("First");
    expect(result.pending?.level).toBe("WARN");
  });

  it("TC-01-3: ERROR 레벨 파싱", () => {
    const lines = [
      "2024-01-15 14:23:45.123  ERROR 99 --- [http-nio] c.e.Ctrl : NullPointer",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.level).toBe("ERROR");
  });

  it("TC-01-4: FATAL 레벨 파싱", () => {
    const lines = [
      "2024-01-15 14:23:45.123  FATAL 1 --- [main] c.e.Boot : Fatal error",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.level).toBe("FATAL");
  });
});

// ─────────────────────────────────────────────
// TC-02: T 구분자 타임스탬프
// ─────────────────────────────────────────────
describe("TC-02 | T 구분자 타임스탬프 정규화", () => {
  it("TC-02-1: T 구분자 타임스탬프가 공백으로 정규화됨", () => {
    const lines = [
      "2024-01-15T14:23:45.123  INFO 1 --- [main] c.A : msg",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.timestamp).toBe("2024-01-15 14:23:45.123");
  });

  it("TC-02-2: 쉼표(,) 밀리초 구분자가 점(.)으로 정규화됨", () => {
    const lines = [
      "2024-01-15 14:23:45,123  INFO 1 --- [main] c.A : msg",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.timestamp).toBe("2024-01-15 14:23:45.123");
  });

  it("TC-02-3: ISO-8601 + 콜론 타임존 오프셋(+09:00) — Spring Boot 3.x+ 기본", () => {
    const lines = [
      "2026-05-04T17:38:21.579+09:00  INFO 20555 --- [main] c.v.analysis.AnalysisServerApplication : Starting",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.timestamp).toBe("2026-05-04 17:38:21.579");
    expect(pending?.level).toBe("INFO");
    expect(pending?.pid).toBe(20555);
    expect(pending?.logger).toBe("c.v.analysis.AnalysisServerApplication");
  });

  it("TC-02-4: ISO-8601 + UTC Z", () => {
    const lines = [
      "2024-01-15T14:23:45.123Z  WARN 99 --- [http-nio] o.s.web.X : msg",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.timestamp).toBe("2024-01-15 14:23:45.123");
    expect(pending?.level).toBe("WARN");
  });

  it("TC-02-5: ISO-8601 + 콜론 없는 오프셋(+0900)", () => {
    const lines = [
      "2024-01-15T14:23:45.123+0900  DEBUG 1 --- [main] c.A : msg",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.timestamp).toBe("2024-01-15 14:23:45.123");
    expect(pending?.level).toBe("DEBUG");
  });

  it("TC-02-6: ISO-8601 + 음수 오프셋(-05:00)", () => {
    const lines = [
      "2024-01-15T14:23:45.123-05:00  ERROR 1 --- [main] c.A : msg",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.timestamp).toBe("2024-01-15 14:23:45.123");
    expect(pending?.level).toBe("ERROR");
  });
});

// ─────────────────────────────────────────────
// TC-03: 멀티라인 스택트레이스 처리
// ─────────────────────────────────────────────
describe("TC-03 | 멀티라인 스택트레이스", () => {
  it("TC-03-1: 스택트레이스 포함 엔트리 파싱", () => {
    const lines = [
      "2024-01-15 14:23:45.123  ERROR 1 --- [main] c.A : NPE occurred",
      "java.lang.NullPointerException: some message",
      "	at com.example.MyService.doSomething(MyService.java:42)",
      "	at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:898)",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.exceptionClass).toBe("java.lang.NullPointerException");
    expect(pending?.exceptionMessage).toBe("some message");
    expect(pending?.stacktrace).toHaveLength(2);
  });

  it("TC-03-2: 사용자 코드 / 프레임워크 코드 구분", () => {
    const lines = [
      "2024-01-15 14:23:45.123  ERROR 1 --- [main] c.A : err",
      "java.lang.RuntimeException: test",
      "	at com.example.MyService.method(MyService.java:10)",
      "	at org.springframework.web.servlet.DispatcherServlet.dispatch(DispatcherServlet.java:1067)",
    ];
    const { pending } = parseBatch(lines, null);
    expect(pending?.stacktrace?.[0].isUserCode).toBe(true);
    expect(pending?.stacktrace?.[1].isUserCode).toBe(false);
  });

  it("TC-03-3: Caused by 체이닝 — 최초 exceptionClass가 유지됨", () => {
    const lines = [
      "2024-01-15 14:23:45.123  ERROR 1 --- [main] c.A : err",
      "org.springframework.dao.DataIntegrityViolationException: primary key violation",
      "	at com.example.Repo.save(Repo.java:20)",
      "Caused by: java.sql.SQLException: Duplicate entry",
      "	at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:213)",
    ];
    const { pending } = parseBatch(lines, null);
    // 최초 예외가 유지돼야 함
    expect(pending?.exceptionClass).toBe(
      "org.springframework.dao.DataIntegrityViolationException"
    );
  });
});

// ─────────────────────────────────────────────
// TC-04: 배치 경계에서 스택트레이스가 잘리는 경우
// ─────────────────────────────────────────────
describe("TC-04 | 배치 경계 처리 (pending 전파)", () => {
  it("TC-04-1: 배치1 pending이 배치2에 정상 연결됨", () => {
    const batch1 = [
      "2024-01-15 14:23:45.123  ERROR 1 --- [main] c.A : err",
      "java.lang.NullPointerException: msg",
      "	at com.example.A.method(A.java:1)",
    ];
    const r1 = parseBatch(batch1, null);
    expect(r1.entries).toHaveLength(0); // 아직 flush 전

    const batch2 = [
      "	at com.example.B.method(B.java:2)",
      "2024-01-15 14:23:46.000  INFO 1 --- [main] c.B : ok",
    ];
    const r2 = parseBatch(batch2, r1.pending);
    // 이전 ERROR 엔트리가 entries에 flush됨
    expect(r2.entries).toHaveLength(1);
    expect(r2.entries[0].stacktrace).toHaveLength(2);
    expect(r2.entries[0].exceptionClass).toBe("java.lang.NullPointerException");
  });

  it("TC-04-2: 마지막 배치 후 flushPending이 잔여 엔트리 반환", () => {
    const lines = [
      "2024-01-15 14:23:45.123  WARN 1 --- [main] c.A : last",
    ];
    const { pending } = parseBatch(lines, null);
    const flushed = flushPending(pending);
    expect(flushed).toHaveLength(1);
    expect(flushed[0].level).toBe("WARN");
  });

  it("TC-04-3: flushPending(null)은 빈 배열 반환", () => {
    expect(flushPending(null)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// TC-05: 빈 라인 / 패턴 불일치 처리
// ─────────────────────────────────────────────
describe("TC-05 | 빈 라인 및 패턴 불일치", () => {
  it("TC-05-1: 빈 라인은 파싱 실패로 집계되지 않음", () => {
    const lines = ["", "   ", "\t"];
    const result = parseBatch(lines, null);
    expect(result.parseFailCount).toBe(0);
    expect(result.entries).toHaveLength(0);
    expect(result.pending).toBeNull();
  });

  it("TC-05-2: 엔트리 시작 전 불일치 라인은 parseFailCount 증가", () => {
    const lines = [
      "This is not a spring log line",
      "Neither is this",
    ];
    const result = parseBatch(lines, null);
    expect(result.parseFailCount).toBe(2);
  });

  it("TC-05-3: 일반 텍스트 파일 (Spring 패턴 없음) — 모두 parseFailCount로 집계", () => {
    const lines = [
      "Hello World",
      "This is a plain text file",
      "No log patterns here",
    ];
    const result = parseBatch(lines, null);
    expect(result.parseFailCount).toBe(3);
    expect(result.entries).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// TC-06: 엣지 케이스
// ─────────────────────────────────────────────
describe("TC-06 | 엣지 케이스", () => {
  it("TC-06-1: 1줄짜리 로그 파일", () => {
    const lines = [
      "2024-01-15 14:23:45.123  INFO 1 --- [main] c.A : single line",
    ];
    const r = parseBatch(lines, null);
    const flushed = flushPending(r.pending);
    expect(flushed).toHaveLength(1);
    expect(flushed[0].message).toBe("single line");
  });

  it("TC-06-2: 빈 파일 (빈 배열)", () => {
    const r = parseBatch([], null);
    expect(r.entries).toHaveLength(0);
    expect(r.pending).toBeNull();
    expect(r.parseFailCount).toBe(0);
  });

  it("TC-06-3: PID가 정수로 파싱됨", () => {
    const lines = [
      "2024-01-15 14:23:45.123  INFO 98765 --- [main] c.A : pid test",
    ];
    const { pending } = parseBatch(lines, null);
    expect(typeof pending?.pid).toBe("number");
    expect(pending?.pid).toBe(98765);
  });

  it("TC-06-4: 스택 프레임 파싱 정확도 — 클래스명/메서드명/파일/라인번호", () => {
    const lines = [
      "2024-01-15 14:23:45.123  ERROR 1 --- [main] c.A : err",
      "java.lang.RuntimeException: test",
      "	at com.example.MyService.processRequest(MyService.java:123)",
    ];
    const { pending } = parseBatch(lines, null);
    const frame = pending?.stacktrace?.[0];
    expect(frame?.className).toBe("com.example.MyService");
    expect(frame?.methodName).toBe("processRequest");
    expect(frame?.fileName).toBe("MyService.java");
    expect(frame?.lineNumber).toBe(123);
  });

  it("TC-06-5: resetParser 호출 후 ID 카운터 재시작", () => {
    const lines1 = ["2024-01-15 14:23:45.123  INFO 1 --- [main] c.A : first"];
    const r1 = parseBatch(lines1, null);
    const id1 = flushPending(r1.pending)[0].id;

    resetParser();

    const lines2 = ["2024-01-15 14:23:45.123  INFO 1 --- [main] c.A : second"];
    const r2 = parseBatch(lines2, null);
    const id2 = flushPending(r2.pending)[0].id;

    // 같은 타임스탬프 + 카운터 1이면 동일 ID
    expect(id1).toBe(id2);
  });
});
