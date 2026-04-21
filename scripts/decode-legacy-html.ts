#!/usr/bin/env -S node --loader tsx
/**
 * Legacy HTML entity decoder for `comments` (BRI-20, RFC-SEC Q2).
 *
 * server.js L17-23 (`escapeHtml`) 는 저장 시점에 `&`, `<`, `>`, `"` 를 escape 했다.
 * Next.js 에서는 React 가 렌더 시점에 자동 escape 하므로 정책을 **저장 raw / 렌더 escape** 로 전환한다.
 *
 * 이 스크립트는 기존 DB 에 이미 escape 된 데이터 (`&amp;`, `&lt;`, `&gt;`, `&quot;`) 를 1회 디코드한다.
 *
 * 사용법 (운영 안전성 — execute SQL 은 COMMIT 을 자동 실행하지 않음):
 *
 *   # 1. dry-run 으로 영향 행 수·샘플 확인
 *   node --import tsx scripts/decode-legacy-html.ts --dry-run | psql "$DATABASE_URL"
 *
 *   # 2. 백업 필수
 *   pg_dump "$DATABASE_URL" --table=comments > /tmp/comments-backup.sql
 *
 *   # 3. psql 세션 안에서 수동 검증 후 COMMIT/ROLLBACK
 *   psql "$DATABASE_URL" -f <(node --import tsx scripts/decode-legacy-html.ts)
 *   # or 단일 트랜잭션 강제:
 *   node --import tsx scripts/decode-legacy-html.ts | psql -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL"
 *
 *   스크립트 출력은 `BEGIN; ... SELECT remaining_encoded ...; -- COMMIT;` 로 끝난다.
 *   operator 가 `remaining_encoded` 값을 확인하고 **수동으로 `COMMIT;` 을 입력**해야 반영된다.
 *   단일 파이프로 실수 실행 시 트랜잭션이 열린 채로 세션이 닫히면 Postgres 는 자동 ROLLBACK.
 *
 * 디코드는 escape 역순 (`&quot;` → `"`, `&gt;` → `>`, `&lt;` → `<`, `&amp;` → `&`) 으로
 * 수행해야 `&amp;lt;` 같은 이중 escape 도 원문으로 복구된다.
 */

import { argv, stderr, stdout } from "node:process";
import { pathToFileURL } from "node:url";

type Mode = "execute" | "dry-run";

function parseMode(args: readonly string[]): Mode {
  for (const arg of args) {
    if (arg === "--dry-run") return "dry-run";
    if (arg === "--execute") return "execute";
  }
  return "execute";
}

/**
 * escape 역순으로 SQL REPLACE 를 중첩한다. 컬럼 단위로 UPDATE 에 그대로 삽입 가능하다.
 */
export function buildDecodeExpression(column: string): string {
  const safe = column.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safe || safe !== column) {
    throw new Error(`Unsafe column identifier: ${column}`);
  }
  // &quot; → " → &gt; → > → &lt; → < → &amp; → & (역순)
  return (
    `REPLACE(REPLACE(REPLACE(REPLACE(${safe},` +
    ` '&quot;', '"'),` +
    ` '&gt;', '>'),` +
    ` '&lt;', '<'),` +
    ` '&amp;', '&')`
  );
}

export function buildExecuteSql(): string {
  const nickname = buildDecodeExpression("nickname");
  const message = buildDecodeExpression("message");
  return [
    "-- BRI-20: escape 정책 전환 (저장 raw / 렌더 escape)",
    "-- 백업 필수: pg_dump \"$DATABASE_URL\" --table=comments > /tmp/comments-backup.sql",
    "-- 안전 장치: 이 스크립트는 COMMIT 을 실행하지 않는다. operator 가 수동으로 입력해야 반영됨.",
    "BEGIN;",
    "UPDATE comments",
    `   SET nickname = ${nickname},`,
    `       message  = ${message}`,
    " WHERE nickname ~ '&(amp|lt|gt|quot);'",
    "    OR message  ~ '&(amp|lt|gt|quot);';",
    "-- 변경 행 수 확인 후 operator 가 수동으로 COMMIT 또는 ROLLBACK 을 입력한다.",
    "SELECT COUNT(*) AS remaining_encoded FROM comments",
    " WHERE nickname ~ '&(amp|lt|gt|quot);'",
    "    OR message  ~ '&(amp|lt|gt|quot);';",
    "-- COMMIT;   -- remaining_encoded 확인 후 주석을 해제하거나 psql 세션에서 직접 입력",
    "-- ROLLBACK; -- 문제 발견 시",
    "",
  ].join("\n");
}

export function buildDryRunSql(): string {
  return [
    "-- BRI-20 dry-run: 영향받을 행 수와 샘플을 조회만 한다 (UPDATE 없음).",
    "SELECT COUNT(*) AS affected_rows FROM comments",
    " WHERE nickname ~ '&(amp|lt|gt|quot);'",
    "    OR message  ~ '&(amp|lt|gt|quot);';",
    "SELECT id, nickname, LEFT(message, 120) AS message_preview, created_at",
    "  FROM comments",
    " WHERE nickname ~ '&(amp|lt|gt|quot);'",
    "    OR message  ~ '&(amp|lt|gt|quot);'",
    " ORDER BY created_at DESC",
    " LIMIT 20;",
    "",
  ].join("\n");
}

export function render(mode: Mode): string {
  return mode === "dry-run" ? buildDryRunSql() : buildExecuteSql();
}

function main(): void {
  const mode = parseMode(argv.slice(2));
  stderr.write(
    mode === "dry-run"
      ? "[decode-legacy-html] dry-run: pipe this SQL into psql for a count + preview.\n"
      : "[decode-legacy-html] execute: pipe this SQL into psql. Run pg_dump first.\n"
  );
  stdout.write(render(mode));
}

// ESM entrypoint check — tsx 와 ts-node 모두에서 동작.
// `process.argv[1]` 가 undefined/empty 일 때 false positive 방지를 위해 명시적으로 검사.
const argv1 = process.argv[1];
const invokedDirectly =
  typeof argv1 === "string" &&
  argv1.length > 0 &&
  import.meta.url === pathToFileURL(argv1).href;
if (invokedDirectly) {
  main();
}
