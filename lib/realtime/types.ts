/**
 * Socket.IO 이벤트 계약.
 * 기존 public/index.html 클라이언트와 100% 호환되도록 이름·payload 스키마를 유지한다.
 * RFC-BE D1~D8 및 BRI-21 DoD 기준.
 */

export interface CommentRow {
  id: number
  nickname: string
  message: string
  created_at: string | Date
}

export interface ServerToClientEvents {
  online: (count: number) => void
  'flower:update': (count: number) => void
  'flower:animation': (payload: Record<string, never>) => void
  'comment:new': (comment: CommentRow) => void
  'comment:error': (payload: { error: string }) => void
  'rate:limited': (payload: { seconds: number }) => void
  'report:ack': () => void
  'incense:state': (payload: { replacing: boolean; durationMs: number; count: number }) => void
  'incense:busy': (payload: { endsAt: number }) => void
  'incense:replacing:start': (payload: { durationMs: number; count: number }) => void
  'incense:replacing:end': (payload: { count: number }) => void
}

export interface ClientFlowerPayload {
  deviceToken?: string | null
}

export interface ClientCommentPayload {
  nickname?: string
  message?: string
  deviceToken?: string | null
}

export interface ClientReportPayload {
  reason?: string
  commentId?: number
  deviceToken?: string | null
}

export interface ClientToServerEvents {
  flower: (data: ClientFlowerPayload) => void
  comment: (data: ClientCommentPayload) => void
  report: (data: ClientReportPayload) => void
  'incense:replace': () => void
}

export type InterServerEvents = Record<string, never>

export interface SocketData {
  ip: string
  userAgent: string
}
