/**
 * Browser client bundle for dsh-visual-plan, following the DeepSeek Harness
 * clientBundle protocol:
 *
 * - CJS closure-factory artifact: `window.__ModuleLoader__.load({ id,
 *   factory: (require) => ... })`; externals resolve through the loader
 *   module table (platform seed entries + the runtime store exemption).
 * - CSS Modules compiled by lightningcss into hashed class maps; the CSS text
 *   auto-injects a `<style data-plugin>` tag at factory execution.
 * - Every other @deepseek-ai value import is a build error (purity gate):
 *   cross-plugin value imports would inline a duplicate runtime instance.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import { defineConfig, type UserConfig } from 'tsdown'

/** Platform seed entries the browser module table answers (external). */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** Runtime store engine: documented exemption, external at runtime. */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** Externals resolved from the loader module table. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

/** Wire/type layers a client bundle may inline (no shared runtime identity). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Vendored framework libraries (no cross-plugin runtime identity). */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Plain stylesheet specifier inlined as a runtime `<style>` injection. */
const REACT_FLOW_STYLE_SPECIFIER = '@xyflow/react/dist/style.css'
const REACT_FLOW_STYLE_TAG = 'dsh-visual-plan/react-flow'
const REACT_FLOW_STYLE_VIRTUAL_PREFIX = '\0dsh-rf-style:'
const requireFromConfig = createRequire(import.meta.url)

const PLUGIN_ID = 'dsh-visual-plan'

const config: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (VENDORED_LIBRARY.test(source)) return null
      if (INLINE_SAFE.test(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS), an inline-safe wire layer, or a vendored library — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }, {
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = readFileSync(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(fileId)}`)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }, {
    name: 'dsh-react-flow-style-inline',
    resolveId(source: string) {
      if (source !== REACT_FLOW_STYLE_SPECIFIER) return null
      return REACT_FLOW_STYLE_VIRTUAL_PREFIX + REACT_FLOW_STYLE_TAG
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(REACT_FLOW_STYLE_VIRTUAL_PREFIX)) return null
      const fileId = requireFromConfig.resolve(REACT_FLOW_STYLE_SPECIFIER)
      this.addWatchFile(fileId)
      const { code } = transform({
        filename: fileId,
        code: readFileSync(fileId),
        minify: true,
      })
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(REACT_FLOW_STYLE_TAG)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  // tsc output mirrors `src/` under `lib/`; the CSS sources live in `src/`.
  const marker = `${sep}lib${sep}`
  const srcIndex = emitted.indexOf(marker)
  if (srcIndex !== -1) {
    const srcPath = `${emitted.slice(0, srcIndex)}${sep}src${sep}${emitted.slice(srcIndex + marker.length)}`
    if (existsSync(srcPath)) return srcPath
  }
  return source
}

export default config
