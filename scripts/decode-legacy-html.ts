#!/usr/bin/env -S node --loader tsx
/**
 * Legacy HTML entity decoder for `comments` (BRI-20, RFC-SEC Q2).
 *
 * server.js L17-23 (`escapeHtml`) 는 저장 시점에 `&`, `<`, `>`, `"` 를 escape 했다.
 * Next.js 에서는 React 가 렌더 시점에 자동 escape 하므로 정책을 **저장 raw / 렌더 escape** 로 전환한다.
 *
 * 이 스크립트는 기존 DB 에 이미 escape 된 데이터 (`&amp;`, `&lt;`, `&gt;`, `&quot;`) 를 1회 디코드한다.
 *
 * 사용법:
 *   # 드라이런 (DB 에 영향 없음 — diff 카운트 SQL 출력)
 *   node --loader tsx scripts/decode-legacy-html.ts --dry-run
 *
 *   # 실행 대상 SQL 생성 + psql 파이프
 *   node --loader tsx scripts/decode-legacy-html.ts | psql "$DATABASE_URL"
 *
 *   # 백업 필수:
 *   pg_dump "$DATABASE_URL" --table=comments > /tmp/comments-backup.sql
 *
 * 디코드는 escape 역순 (`&quot;` → `"`, `&gt;` → `>`, `&lt;` → `<`, `&amp;` → `&`) 으로
 * 수행해야 `&amp;lt;` 같은 이중 escape 도 원문으로 복구된다.
 */

import { argv, stderr, stdout } from "node:process";

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
    "BEGIN;",
    "UPDATE comments",
    `   SET nickname = ${nickname},`,
    `       message  = ${message}`,
    " WHERE nickname ~ '&(amp|lt|gt|quot);'",
    "    OR message  ~ '&(amp|lt|gt|quot);';",
    "-- 변경 행 수 확인 후 COMMIT 또는 ROLLBACK",
    "SELECT COUNT(*) AS remaining_encoded FROM comments",
    " WHERE nickname ~ '&(amp|lt|gt|quot);'",
    "    OR message  ~ '&(amp|lt|gt|quot);';",
    "COMMIT;",
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

// ESM entrypoint check — tsx 와 ts-node 모두에서 동작
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? "");
if (invokedDirectly) {
  main();
}
