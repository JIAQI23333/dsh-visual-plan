#!/usr/bin/env node
/**
 * Full E2E plan flow for dsh-visual-plan.
 *
 * Requires a running DSH web profile with a working model. The script:
 *   1. opens the web app, activates a session,
 *   2. enters plan mode with `/plan <task>`,
 *   3. waits for the plan-review question and approves it,
 *   4. opens the Visual Plan tab and asserts the canvas rendered real nodes,
 *   5. takes a screenshot and reports fatal console errors.
 *
 * Usage: node scripts/e2e-plan-flow.mjs [url]
 */

import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://127.0.0.1:3080/'
const failures = []
function check(label, condition, detail = '') {
  if (condition) console.log(`  PASS  ${label}`)
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: '稍后配置' }).waitFor({ timeout: 20000 }).catch(() => {})
const skip = page.getByRole('button', { name: '稍后配置' })
if (await skip.count()) { await skip.click(); console.log('  dismissed onboarding') }
await page.getByRole('button', { name: '继续', exact: true }).waitFor({ timeout: 5000 }).catch(() => {})
const beta = page.getByRole('button', { name: '继续', exact: true })
if (await beta.count()) { await beta.click(); console.log('  dismissed beta disclaimer') }
await page.waitForTimeout(2500)

// 1. Activate a session if none is open.
let tabs = await readTabs(page)
if (tabs.length === 0) {
  const newSession = page.getByRole('button', { name: '新会话', exact: true })
  if (await newSession.count()) {
    await newSession.click()
    await page.waitForTimeout(3500)
  }
}

// 2. Enter plan mode.
const ta = page.locator('textarea').first()
check('composer textarea available', await ta.count() > 0)
await ta.fill('/plan 帮我规划一个用户登录功能：分析、设计、实现、测试')
await ta.press('Enter')
console.log('  sent /plan request')

// 3. Wait for the plan-review approval question (up to 4 minutes), approve it.
let approved = false
const approve = page.getByRole('button', { name: /Approve|批准/ })
for (let i = 0; i < 240; i += 1) {
  if (await approve.count()) {
    await approve.first().click()
    approved = true
    console.log('  approved the plan review')
    break
  }
  // The composer may be replaced by the review question; poll patiently.
  await page.waitForTimeout(1000)
}
check('plan review appeared and was approved', approved)

// 4. Wait for the turn to finish and open the Visual Plan tab.
await page.waitForFunction(
  () => {
    const ta = document.querySelector('textarea')
    const sessionBody = document.querySelector('[data-slot="conversation.session"]')?.textContent ?? ''
    const head = document.body.innerText.slice(0, 300)
    return ta !== null && !ta.disabled && !/进行中|等待回答/.test(head) && /详情/.test(sessionBody)
  },
  { timeout: 300000 },
).catch(() => console.log('  (turn-wait timeout; continuing)'))
await page.waitForTimeout(3000)
tabs = await readTabs(page)
const planIdx = tabs.findIndex((t) => /Visual Plan/i.test(t))
check('Visual Plan tab present', planIdx !== -1, JSON.stringify(tabs))
if (planIdx !== -1) {
  await page.evaluate((idx) => {
    const header = document.querySelector('[data-slot="conversation.session.header"]')
    const btns = header ? Array.from(header.querySelectorAll('button')) : []
    btns[idx]?.click()
  }, planIdx)

  let nodes = 0
  let edges = 0
  for (let i = 0; i < 30; i += 1) {
    const state = await page.evaluate(() => ({
      nodes: document.querySelectorAll('.react-flow__node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
    }))
    nodes = state.nodes
    edges = state.edges
    if (nodes > 0) break
    await page.waitForTimeout(1000)
  }
  check('canvas mounted with real plan nodes', nodes > 0, `nodes=${nodes} edges=${edges}`)
  check('canvas has dependency edges', edges > 0, `edges=${edges}`)
  const hasToolbar = await page.evaluate(() => /Apply Changes/.test(document.body.innerText))
  check('Apply Changes affordance present', hasToolbar)
}

const fatal = consoleErrors.filter((e) => !/favicon|net::ERR|ResizeObserver|downloadable font/i.test(e))
check(`no fatal console errors (${fatal.length})`, fatal.length === 0, fatal.slice(0, 3).join(' | '))

await page.screenshot({ path: '/tmp/dsh-visual-plan-e2e.png', fullPage: false })
await browser.close()
console.log(failures.length === 0 ? '\nE2E plan flow passed.' : `\n${failures.length} check(s) FAILED`)
process.exit(failures.length === 0 ? 0 : 1)

async function readTabs(page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-slot="conversation.session.header"]')
    if (!header) return []
    return Array.from(header.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()).filter(Boolean)
  })
}
