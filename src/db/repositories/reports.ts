import type { Database } from '../client.js'
import { reports, type NewReport, type Report } from '../schema.js'

export function reportsRepo(db: Database) {
  return {
    async insert(input: NewReport): Promise<Report> {
      const [row] = await db.insert(reports).values(input).returning()
      if (!row) {
        throw new Error('INSERT into reports returned no rows')
      }
      return row
    },
  }
}
