import { describe, expect, it } from "vitest";

import {
  buildDecodeExpression,
  buildDryRunSql,
  buildExecuteSql,
  render,
} from "./decode-legacy-html";

describe("buildDecodeExpression", () => {
  it("허용 식별자에 대해 REPLACE 중첩식을 반환한다 (escape 역순)", () => {
    const expression = buildDecodeExpression("nickname");
    expect(expression).toBe(
      "REPLACE(REPLACE(REPLACE(REPLACE(nickname, '&quot;', '\"'), '&gt;', '>'), '&lt;', '<'), '&amp;', '&')"
    );
  });

  it.each(["drop table", "nick; --", "nickname'", "\n"])(
    "안전하지 않은 식별자 %s 는 거부한다",
    (column) => {
      expect(() => buildDecodeExpression(column)).toThrow(/Unsafe column/);
    }
  );
});

describe("buildExecuteSql", () => {
  const sql = buildExecuteSql();

  it("BEGIN/COMMIT 트랜잭션 래퍼를 포함한다", () => {
    expect(sql).toMatch(/^-- BRI-20/);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("nickname · message 컬럼 모두 디코드 대상이다", () => {
    expect(sql).toContain("SET nickname = REPLACE(REPLACE(");
    expect(sql).toContain("message  = REPLACE(REPLACE(");
  });

  it("WHERE 절로 인코딩된 행만 대상으로 한다", () => {
    expect(sql).toMatch(/WHERE[\s\S]*&\(amp\|lt\|gt\|quot\);/);
  });
});

describe("buildDryRunSql", () => {
  const sql = buildDryRunSql();

  it("UPDATE 문이 포함되지 않는다 (읽기 전용)", () => {
    // SQL 코멘트에 'UPDATE' 단어가 등장할 수 있으므로, 실제 UPDATE 구문을 탐지한다.
    expect(sql).not.toMatch(/UPDATE\s+comments/i);
    expect(sql).not.toContain("COMMIT;");
    expect(sql).not.toContain("BEGIN;");
  });

  it("COUNT · 샘플 LIMIT 조회만 수행한다", () => {
    expect(sql).toContain("SELECT COUNT(*)");
    expect(sql).toMatch(/LIMIT\s+20/);
  });
});

describe("render mode dispatch", () => {
  it("'dry-run' → buildDryRunSql", () => {
    expect(render("dry-run")).toBe(buildDryRunSql());
  });

  it("'execute' → buildExecuteSql", () => {
    expect(render("execute")).toBe(buildExecuteSql());
  });
});
