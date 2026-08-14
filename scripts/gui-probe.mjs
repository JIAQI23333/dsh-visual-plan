#!/usr/bin/env node
/**
 * GUI probe for dsh-visual-plan (E2E smoke).
 *
 * Requires a running DSH web profile that composes dsh-visual-plan
 * (`dsh --profile web`). The probe:
 *   1. opens the web app and dismisses onboarding dialogs,
 *   2. activates a session so the header view ring appears,
 *   3. asserts the "Visual Plan" tab sits between Chat and Trajectory,
 *   4. opens the tab and asserts the canvas/empty state mounts,
 *   5. checks for fatal console errors and takes a screenshot.
 *
 * Usage: node scripts/gui-probe.mjs [url]
 */

import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
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

// 1. Dismiss API-key onboarding if present.
await page.getByRole('button', { name: '稍后配置' }).waitFor({ timeout: 20000 }).catch(() => {})
const skip = page.getByRole('button', { name: '稍后配置' })
if (await skip.count()) { await skip.click(); console.log('  dismissed onboarding') }
// 1b. Dismiss the beta disclaimer dialog if present.
await page.getByRole('button', { name: '继续', exact: true }).waitFor({ timeout: 5000 }).catch(() => {})
const beta = page.getByRole('button', { name: '继续', exact: true })
if (await beta.count()) { await beta.click(); console.log('  dismissed beta disclaimer') }
await page.waitForTimeout(2500)

// 2. If no active session (blank header), open one and send a first message.
let tabs = await readTabs(page)
if (tabs.length === 0) {
  const newSession = page.getByRole('button', { name: '新会话', exact: true })
  if (await newSession.count()) {
    await newSession.click()
    await page.waitForTimeout(3500)
  }
  const ta = page.locator('textarea').first()
  if (await ta.count()) {
    await ta.fill('plan a simple todo app')
    await ta.press('Enter')
    console.log('  sent first message to activate session')
  }
  // Let the UI settle, then wait for the current turn to finish: the
  // conversation body must contain the completed-turn stats row ("详情"),
  // and the current sidebar entry must stop reporting running/queued state.
  await page.waitForTimeout(8000)
  await page.waitForFunction(
    () => {
      const ta = document.querySelector('textarea')
      const sessionBody = document.querySelector('[data-slot="conversation.session"]')?.textContent ?? ''
      const head = document.body.innerText.slice(0, 300)
      return ta !== null && !ta.disabled && !/进行中|等待回答/.test(head) && /详情/.test(sessionBody)
    },
    { timeout: 300000 },
  ).catch(() => console.log('  (turn-wait timeout; continuing)'))
  await page.waitForTimeout(2000)
  tabs = await readTabs(page)
}
console.log(`  session tabs: ${JSON.stringify(tabs)}`)

check('header rendered', tabs.length > 0, JSON.stringify(tabs))
check('Chat tab present', tabs.some((t) => t === 'Chat' || t === '对话'), JSON.stringify(tabs))
const planIdx = tabs.findIndex((t) => /Visual Plan|Plan/i.test(t))
const trajIdx = tabs.findIndex((t) => /Trajectory|轨迹/i.test(t))
check('Visual Plan tab present', planIdx !== -1, JSON.stringify(tabs))
check('Visual Plan sits before Trajectory', planIdx !== -1 && (trajIdx === -1 || planIdx < trajIdx), JSON.stringify(tabs))

// 3. Click the Visual Plan tab and verify the view mounts.
if (planIdx !== -1) {
  await page.evaluate((idx) => {
    const header = document.querySelector('[data-slot="conversation.session.header"]')
    const btns = header ? Array.from(header.querySelectorAll('button')) : []
    btns[idx]?.click()
  }, planIdx)
  // The view switch is async; poll until the canvas or the empty state mounts.
  let mounted = false
  let state = null
  for (let i = 0; i < 15; i += 1) {
    state = await page.evaluate(() => ({
      hasCanvas: Boolean(document.querySelector('.react-flow')),
      hasEmpty: /还没有可视化计划|No plan yet/.test(document.body.innerText),
      hasToolbar: /Apply Changes/.test(document.body.innerText),
      bodyHead: document.body.innerText.slice(0, 200),
    }))
    if (state.hasCanvas || state.hasEmpty) { mounted = true; break }
    await page.waitForTimeout(1000)
  }
  check('Visual Plan view mounts (canvas or empty state)', mounted, JSON.stringify(state?.bodyHead ?? null))
  check('toolbar affordance present when canvas shown', state === null || !state.hasCanvas || state.hasToolbar, JSON.stringify(state))
}

const fatal = consoleErrors.filter((e) => !/favicon|net::ERR|ResizeObserver|downloadable font/i.test(e))
check(`no fatal console errors (${fatal.length})`, fatal.length === 0, fatal.slice(0, 3).join(' | '))

await page.screenshot({ path: '/tmp/dsh-visual-plan-gui.png', fullPage: false })
await browser.close()
console.log(failures.length === 0 ? '\nGUI probe passed.' : `\n${failures.length} probe(s) FAILED`)
process.exit(failures.length === 0 ? 0 : 1)

async function readTabs(page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-slot="conversation.session.header"]')
    if (!header) return []
    return Array.from(header.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()).filter(Boolean)
  })
}
