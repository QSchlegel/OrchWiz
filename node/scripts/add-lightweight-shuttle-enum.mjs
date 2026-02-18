#!/usr/bin/env node
/**
 * One-off: add 'lightweight_shuttle' to the DeploymentProfile enum in PostgreSQL.
 * Run with: node scripts/add-lightweight-shuttle-enum.mjs
 * Or apply the SQL yourself (see below).
 */
import pg from "pg"
import "dotenv/config"

const sql = `ALTER TYPE "DeploymentProfile" ADD VALUE IF NOT EXISTS 'lightweight_shuttle';`
const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
try {
  await client.connect()
  await client.query(sql)
  console.log("Added DeploymentProfile value 'lightweight_shuttle' (or already present).")
} catch (e) {
  console.error(e.message)
  process.exit(1)
} finally {
  await client.end()
}
