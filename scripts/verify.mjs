#!/usr/bin/env node
/**
 * Offline smoke verification for dsh-visual-plan.
 *
 * Verifies the packaging contract and runs the pure plan-logic rules
 * (markdown parsing, schema validation, diff, revisions, DSH adapter)
 * against fixture input. Requires a prior `npm run build` (lib/ present).
 * Does not touch any running DSH instance or profile.
 *
 * Usage: node scripts/verify.mjs
 */

import { readFile } from 'node:fs/promises'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('dsh-visual-plan offline verification')

// 1/4 packaging contract
console.log('1/4 packaging contract')
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patchText = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patchName = patchText
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .find((line) => /^\s*name:\s*\S/.test(line))
  ?.match(/^\s*name:\s*(.+?)\s*$/)?.[1]
  ?.replace(/^(['"])(.*)\1$/, '$2')
check(
  'cordis.patch.yml name matches the published package name',
  patchName === pkg.name,
  `patch has ${JSON.stringify(patchName)}, package.json has ${JSON.stringify(pkg.name)}`,
)
check(
  'files[] ships the bundle patch and lib',
  ['lib', 'cordis.patch.yml'].every((entry) => pkg.files?.includes(entry)),
  `files = ${JSON.stringify(pkg.files)}`,
)
check(
  'client entry exists in exports',
  typeof pkg.exports?.['./client'] === 'object',
  `exports = ${JSON.stringify(pkg.exports)}`,
)
check(
  'dsh.client manifest declares web platform',
  pkg.dsh?.client?.platform === 'web',
  `dsh.client = ${JSON.stringify(pkg.dsh?.client)}`,
)

// 2/4 built artifacts
console.log('2/4 built artifacts')
const artifactChecks = [
  ['lib/index.js', 'host entry'],
  ['lib/client.js', 'client bundle (tsdown output)'],
  ['lib/types/index.d.ts', 'host types'],
  ['lib/client/state.js', 'client pure logic (compiled)'],
]
for (const [rel, label] of artifactChecks) {
  try {
    await readFile(new URL(`../${rel}`, import.meta.url))
    check(`${rel} present (${label})`, true)
  } catch {
    check(`${rel} present (${label})`, false, 'run `npm run build` first')
  }
}
try {
  const clientBundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  check(
    'client bundle inlines React Flow base styles',
    clientBundle.includes('dsh-visual-plan/react-flow') && clientBundle.includes('react-flow__attribution'),
    're-add the @xyflow/react/dist/style.css import in src/client/index.tsx',
  )
  check(
    'client bundle uses the __ModuleLoader__ protocol',
    clientBundle.includes('window.__ModuleLoader__.load'),
    'banner/footer are missing in tsdown.config.ts',
  )
} catch {
  check('client bundle inlines React Flow base styles', false, 'run `npm run build` first')
}

// 3/4 pure plan rules
console.log('3/4 pure plan rules')
const { parsePlanMarkdown, serializePlanMarkdown, deriveEdges } = await import('../lib/engine/markdown.js')
const { diffPlans, isDiffEmpty } = await import('../lib/engine/diff.js')
const { createPlanVersion } = await import('../lib/engine/revision.js')
const { validatePlan, hasCycle } = await import('../lib/schema/validate.js')
const { deepseekHarnessAdapter, buildRevisedPlanMessage, parsePlanArgs, extractPlanMarkdowns } = await import('../lib/adapter/dsh.js')
const { planReducer, createEditorState } = await import('../lib/client/state.js')
const { saveRevision, readStoredPlan, readRevisionMetas } = await import('../lib/host/store.js')
const { visualPlanEn, visualPlanZh } = await import('../lib/client/i18n.js')

// --- i18n ---
const zhKeys = Object.keys(visualPlanZh).sort()
const enKeys = Object.keys(visualPlanEn).sort()
check('i18n zh/en key sets are balanced', JSON.stringify(zhKeys) === JSON.stringify(enKeys),
  `zh=${zhKeys.length} en=${enKeys.length}`)
check('i18n dictionaries are non-empty', zhKeys.length > 30, String(zhKeys.length))
check('i18n default tab label is Chinese', visualPlanZh.tab === '可视化计划', visualPlanZh.tab)

// --- Markdown parsing ---
const fixture = `# 实现用户登录功能

## 分析现有用户系统
检查当前项目的用户、权限和认证结构

## 设计登录接口 (depends on: 分析现有用户系统)
设计登录 API 和认证流程

## 实现登录 API
实现后端登录接口

- [x] 实现前端登录页面
- 测试登录功能
`
const parsed = parsePlanMarkdown(fixture)
check('plan title parsed from # heading', parsed.title === '实现用户登录功能', parsed.title)
check('five tasks parsed', parsed.tasks.length === 5, String(parsed.tasks.length))
check('heading tasks get inferred types', parsed.tasks[0]?.type === 'analysis' && parsed.tasks[1]?.type === 'design' && parsed.tasks[2]?.type === 'coding', JSON.stringify(parsed.tasks.map((t) => [t.title, t.type])))
check('list task checkbox → completed', parsed.tasks[3]?.status === 'completed', String(parsed.tasks[3]?.status))
check('prose becomes task description', parsed.tasks[0]?.description === '检查当前项目的用户、权限和认证结构', String(parsed.tasks[0]?.description))
check('explicit depends-on annotation parsed', parsed.tasks[1]?.depRefs.includes('分析现有用户系统'), JSON.stringify(parsed.tasks[1]?.depRefs))
check('annotation stripped from visible title', parsed.tasks[1]?.title === '设计登录接口', parsed.tasks[1]?.title)

// --- Adapter: markdown → VisualPlan ---
const result = deepseekHarnessAdapter.extract({
  sessionId: 's1',
  latestUserText: '帮我给这个项目增加用户登录功能。',
  events: [
    { kind: 'user', seq: 1, text: '帮我给这个项目增加用户登录功能。' },
    { kind: 'tool-result', seq: 5, toolName: 'exit_plan_mode', argsRaw: JSON.stringify({ plan: fixture }) },
  ],
})
check('adapter extracts a plan from exit_plan_mode events', result !== null)
const plan = result.plan
check('plan goal comes from latest user text', plan.goal.includes('登录'), plan.goal)
check('plan status starts as reviewing', plan.status === 'reviewing', plan.status)
check('plan starts at version 1', plan.version === 1, String(plan.version))
check('plan has no approved version until Apply', plan.approvedVersion === null, String(plan.approvedVersion))
check('plan has no execution version until Apply', plan.executionVersion === null, String(plan.executionVersion))
check('plan id is seq-derived', plan.id === 'plan_5', plan.id)
check('edges are derived from dependencies', plan.edges.length === plan.tasks.reduce((n, t) => n + t.dependencies.length, 0), JSON.stringify(plan.edges))
check('explicit dependency resolved by title', plan.tasks[1]?.dependencies.some((d) => plan.tasks[0]?.id === d), JSON.stringify(plan.tasks[1]?.dependencies))
check('default sequential chain applies to unannotated tasks', plan.tasks[2]?.dependencies.includes(plan.tasks[1]?.id ?? ''), JSON.stringify(plan.tasks[2]?.dependencies))
check('no adapter issues for a clean plan', result.issues.length === 0, JSON.stringify(result.issues))
check('no plan when events are empty', deepseekHarnessAdapter.extract({ events: [] }) === null)
check('parsePlanArgs rejects non-plan JSON', parsePlanArgs('{"foo": 1}') === null)
check('extractPlanMarkdowns dedupes call+result pairs', extractPlanMarkdowns([
  { kind: 'tool-call', seq: 4, toolName: 'exit_plan_mode', argsRaw: JSON.stringify({ plan: fixture }) },
  { kind: 'tool-result', seq: 5, toolName: 'exit_plan_mode', argsRaw: JSON.stringify({ plan: fixture }) },
]).length === 1)

// --- Roundtrip: VisualPlan → markdown ---
const roundtrip = parsePlanMarkdown(serializePlanMarkdown(plan))
check('serialize → parse keeps title', roundtrip.title === plan.title)
check('serialize keeps task count', roundtrip.tasks.length === plan.tasks.length)

// --- Validation ---
const valid = validatePlan(plan, { repair: false })
check('clean plan validates', valid.ok === true, JSON.stringify(valid.issues))

const broken = JSON.parse(JSON.stringify(plan))
broken.tasks[0].dependencies = ['task_999']
broken.tasks[1].dependencies = ['task_001']
broken.tasks[0].dependencies = ['task_001']
const selfDep = validatePlan(broken, { repair: false })
check('self-dependency is detected', selfDep.issues.some((i) => i.code === 'self-dependency'), JSON.stringify(selfDep.issues))

const cyclePlan = JSON.parse(JSON.stringify(plan))
cyclePlan.tasks[1].dependencies = ['task_001']
cyclePlan.tasks[0].dependencies = ['task_002']
const cycle = validatePlan(cyclePlan, { repair: false })
check('circular dependency is detected', cycle.issues.some((i) => i.code === 'circular-dependency'), JSON.stringify(cycle.issues))
check('hasCycle helper agrees', hasCycle(cycle.plan ?? cyclePlan))

const badBounds = JSON.parse(JSON.stringify(plan))
badBounds.approvedVersion = 0
badBounds.executionVersion = 2.5
const boundsIssues = validatePlan(badBounds, { repair: true })
check('invalid version bounds are repaired to null', boundsIssues.plan?.approvedVersion === null && boundsIssues.plan?.executionVersion === null, JSON.stringify(boundsIssues.plan))
check('invalid version bounds are reported as warnings', boundsIssues.issues.some((i) => i.code === 'invalid-version-bound'), JSON.stringify(boundsIssues.issues))
const overBound = JSON.parse(JSON.stringify(plan))
overBound.approvedVersion = 5
const overIssues = validatePlan(overBound, { repair: true })
check('approvedVersion above current version is repaired', overIssues.plan?.approvedVersion === null, String(overIssues.plan?.approvedVersion))

// --- Diff ---
const edited = JSON.parse(JSON.stringify(plan))
edited.tasks[2].title = '实现登录 API v2'
edited.tasks[2].status = 'running'
edited.tasks[3].dependencies = ['task_001', 'task_002']
edited.tasks.push({
  id: 'task_006',
  title: '添加认证测试',
  description: '',
  type: 'testing',
  status: 'pending',
  dependencies: ['task_003'],
  metadata: {},
})
edited.tasks.splice(4, 1)
edited.comments.push({ id: 'comment_001', taskId: 'task_002', content: '使用现有用户表', author: 'user', createdAt: 1 })
const diff = diffPlans(plan, edited)
check('diff detects added task', diff.added.length === 1 && diff.added[0]?.title === '添加认证测试', JSON.stringify(diff.added))
check('diff detects removed task', diff.removed.length === 1, JSON.stringify(diff.removed))
check('diff detects modified fields', diff.modified.length === 1 && diff.modified[0]?.fields.includes('title'), JSON.stringify(diff.modified))
check('diff detects dependency changes', diff.dependencyChanges.length >= 1, JSON.stringify(diff.dependencyChanges))
check('diff detects comment changes', diff.commentChanges.length === 1 && diff.commentChanges[0]?.added === 1, JSON.stringify(diff.commentChanges))
check('unchanged plans diff to empty', isDiffEmpty(diffPlans(plan, JSON.parse(JSON.stringify(plan)))))

// --- Revision ---
const version = createPlanVersion(plan, edited, 'user', diff)
check('revision version increments', version.version === 2, String(version.version))
check('revision snapshots the approved plan', version.plan.tasks.length === edited.tasks.length)
check('revision keeps author and timestamp', version.author === 'user' && typeof version.timestamp === 'number')

// --- Reducer ---
let editor = createEditorState(plan)
editor = planReducer(editor, { type: 'addDependency', taskId: 'task_001', dependencyId: 'task_002' })
check('cycle-forming dependency is rejected', editor.error?.code === 'circular', JSON.stringify(editor.error))
editor = planReducer(editor, { type: 'addTask', task: { title: '新任务', description: '', type: 'other', status: 'pending', dependencies: [], metadata: {} } })
check('addTask appends with a generated id', editor.current.tasks.some((t) => t.id === 'task_006' && t.title === '新任务'))
editor = planReducer(editor, { type: 'editTask', taskId: 'task_006', patch: { title: '改名' } })
check('editTask updates the working copy', editor.current.tasks.find((t) => t.id === 'task_006')?.title === '改名')
editor = planReducer(editor, { type: 'addComment', taskId: 'task_001', content: '不要重新设计数据库', author: 'user' })
check('addComment creates a comment id', editor.current.comments.some((c) => c.id === 'comment_001' && c.content === '不要重新设计数据库'))
check('edits mark the editor dirty', editor.dirty === true)
editor = planReducer(editor, { type: 'discard' })
check('discard restores the base plan', editor.dirty === false && editor.current.tasks.length === plan.tasks.length)

// Apply bumps the version and moves the plan to executing (v1 → v2).
let applier = createEditorState(plan)
applier = planReducer(applier, { type: 'addTask', task: { title: '新增步骤', description: '', type: 'other', status: 'pending', dependencies: [], metadata: {} } })
applier = planReducer(applier, { type: 'applied' })
check('applied bumps version v1 → v2', applier.base.version === 2 && applier.dirty === false, `version=${applier.base.version}`)
check('applied moves status to executing', applier.base.status === 'executing', applier.base.status)
check('applied binds approved version to v2', applier.base.approvedVersion === 2, String(applier.base.approvedVersion))
check('applied binds execution to v2', applier.base.executionVersion === 2, String(applier.base.executionVersion))

// --- Write-back message ---
const approved = { ...edited, version: 2, status: 'executing', approvedVersion: 2, executionVersion: 2 }
const message = buildRevisedPlanMessage(approved, diff)
check('write-back message announces user approval', message.includes('explicitly approved by the user'))
check('write-back message binds the approved version', message.includes('Plan v2') && message.includes('Execute Plan v2 exactly'))
check('write-back message forbids silent plan modification', message.includes('do not silently modify the approved plan'))
check('write-back message embeds full revised markdown', message.includes('# 实现用户登录功能') && message.includes('添加认证测试'))
check('write-back message lists changes', message.includes('REMOVED') && message.includes('ADDED') && message.includes('MODIFIED'))

// 4/4 host persistence (temp-dir round trip)
console.log('4/4 host persistence')
const scratch = await mkdtemp(join(tmpdir(), 'dsh-visual-plan-verify-'))
try {
  const v1 = await saveRevision(scratch, plan, { added: [], removed: [], modified: [], dependencyChanges: [], commentChanges: [] }, 'user')
  check('first save creates v1', v1.version === 1, String(v1.version))
  const files = (await readdir(join(scratch, '.plan'))).sort()
  check('.plan contains plan.json + plan.md + revisions/', files.includes('plan.json') && files.includes('plan.md') && files.includes('revisions'), JSON.stringify(files))
  const planMd = await readFile(join(scratch, '.plan', 'plan.md'), 'utf8')
  check('plan.md contains the plan title', planMd.includes('# 实现用户登录功能'))
  const stored = await readStoredPlan(scratch)
  check('stored plan round-trips through plan.json', stored !== null && stored.tasks.length === plan.tasks.length)
  check('stored v1 keeps unbound version fields', stored?.approvedVersion === null && stored?.executionVersion === null, JSON.stringify(stored))

  const v2 = await saveRevision(scratch, approved, diff, 'user')
  check('second save creates v2 (version bump)', v2.version === 2, String(v2.version))
  const metas = await readRevisionMetas(scratch)
  check('revision listing is ordered v1, v2', metas.length === 2 && metas[0]?.version === 1 && metas[1]?.version === 2, JSON.stringify(metas.map((m) => m.version)))
  check('revision listing carries change summaries', metas[1]?.changes.added.some((t) => t.title === '添加认证测试'), JSON.stringify(metas[1]?.changes.added))
  const storedV2 = await readStoredPlan(scratch)
  check('stored plan.json is now v2 content', storedV2?.tasks.some((t) => t.title === '添加认证测试'))
  check('stored v2 keeps approved/execution version bounds', storedV2?.approvedVersion === 2 && storedV2?.executionVersion === 2, JSON.stringify(storedV2))
} finally {
  await import('node:fs/promises').then(({ rm }) => rm(scratch, { recursive: true, force: true }))
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
