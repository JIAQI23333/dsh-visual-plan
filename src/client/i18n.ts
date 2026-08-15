/**
 * Visual Plan locale namespace (zh / en).
 *
 * The DSH app owns the language preference (Settings → General → Language,
 * stored as `locale.preference`). This plugin registers its dictionary under
 * the `visual-plan` namespace so every surface follows that switch; Chinese
 * is the default because it is the app's default for zh environments.
 *
 * The typed `t` seat is injected into the view entry by declaring
 * `locale: 'visual-plan'` on the slot registration.
 */

import type { LocaleNamespaceMap, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'

const zh = {
  tab: '可视化计划',
  'empty.title': '还没有可视化计划',
  'empty.hint': '在计划模式下让模型产出计划（例如 /plan），计划会以节点画布的形式出现在这里。',
  'toolbar.addTask': '添加任务',
  'toolbar.autoLayout': '自动布局',
  'toolbar.discard': '放弃修改',
  'toolbar.apply': '应用修改',
  'toolbar.edited': '已修改',
  'toolbar.map': '地图',
  'toolbar.theme': '主题',
  'toolbar.themeFollow': '跟随',
  'toolbar.themeDay': '白天',
  'toolbar.themeNight': '黑夜',
  'toolbar.fullscreen': '全屏',
  'toolbar.exitFullscreen': '退出全屏',
  'planStatus.draft': '草稿',
  'planStatus.reviewing': '评审中',
  'planStatus.approved': '已批准',
  'planStatus.executing': '执行中',
  'planStatus.completed': '已完成',
  'planStatus.failed': '失败',
  'taskStatus.pending': '待处理',
  'taskStatus.running': '进行中',
  'taskStatus.completed': '已完成',
  'taskStatus.failed': '失败',
  'taskStatus.skipped': '已跳过',
  'taskType.analysis': '分析',
  'taskType.design': '设计',
  'taskType.coding': '编码',
  'taskType.testing': '测试',
  'taskType.refactor': '重构',
  'taskType.other': '其他',
  'node.depends': '依赖',
  'editor.newTask': '新任务',
  'editor.taskEditor': '任务编辑器',
  'editor.title': '标题',
  'editor.description': '描述',
  'editor.type': '类型',
  'editor.status': '状态',
  'editor.dependencies': '依赖关系',
  'editor.noOtherTasks': '没有其他任务。',
  'editor.cancel': '取消',
  'editor.save': '保存',
  'editor.delete': '删除',
  'editor.deleteConfirm': '此任务被 {count} 个其他任务依赖：{names}。仍然删除？',
  'editor.deleteConfirmSimple': '删除此任务？此操作不可撤销。',
  'comment.title': '评论',
  'comment.none': '暂无评论。',
  'comment.add': '添加',
  'comment.placeholder': '为 {taskId} 添加评论…',
  'comment.removeAria': '删除评论',
  'diff.title': '计划变更',
  'diff.removed': '已删除',
  'diff.modified': '已修改',
  'diff.added': '新增',
  'diff.dependencyChanged': '依赖变更',
  'diff.comments': '评论变更',
  'diff.noChanges': '没有需要报告的变更。',
  'diff.cancel': '取消',
  'diff.submit': '提交修改',
  'diff.submitting': '提交中…',
  'error.circular': '检测到循环依赖。该连接未生效。',
  'error.selfDependency': '任务不能依赖自身。',
  'error.taskNotFound': '找不到任务 {id}。',
  'error.duplicateId': '任务 id 重复：{id}。',
}

type VisualPlanKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'visual-plan': VisualPlanKey
  }
}

/** Bilingual dictionaries, key-balanced at compile time. */
export const visualPlanZh: Readonly<Record<VisualPlanKey, string>> = zh
export const visualPlanEn: Record<VisualPlanKey, string> = {
  tab: 'Visual Plan',
  'empty.title': 'No plan yet',
  'empty.hint': 'Enter plan mode (/plan) and ask for a plan — it will appear here as nodes.',
  'toolbar.addTask': 'Add Task',
  'toolbar.autoLayout': 'Auto layout',
  'toolbar.discard': 'Discard',
  'toolbar.apply': 'Apply Changes',
  'toolbar.edited': 'Edited',
  'toolbar.map': 'Map',
  'toolbar.theme': 'Theme',
  'toolbar.themeFollow': 'Follow',
  'toolbar.themeDay': 'Day',
  'toolbar.themeNight': 'Night',
  'toolbar.fullscreen': 'Fullscreen',
  'toolbar.exitFullscreen': 'Exit fullscreen',
  'planStatus.draft': 'Draft',
  'planStatus.reviewing': 'Reviewing',
  'planStatus.approved': 'Approved',
  'planStatus.executing': 'Executing',
  'planStatus.completed': 'Completed',
  'planStatus.failed': 'Failed',
  'taskStatus.pending': 'Pending',
  'taskStatus.running': 'Running',
  'taskStatus.completed': 'Completed',
  'taskStatus.failed': 'Failed',
  'taskStatus.skipped': 'Skipped',
  'taskType.analysis': 'Analysis',
  'taskType.design': 'Design',
  'taskType.coding': 'Coding',
  'taskType.testing': 'Testing',
  'taskType.refactor': 'Refactor',
  'taskType.other': 'Other',
  'node.depends': 'Depends:',
  'editor.newTask': 'New Task',
  'editor.taskEditor': 'Task Editor',
  'editor.title': 'Title',
  'editor.description': 'Description',
  'editor.type': 'Type',
  'editor.status': 'Status',
  'editor.dependencies': 'Dependencies',
  'editor.noOtherTasks': 'No other tasks.',
  'editor.cancel': 'Cancel',
  'editor.save': 'Save',
  'editor.delete': 'Delete',
  'editor.deleteConfirm': 'This task is required by {count} other tasks: {names}. Delete anyway?',
  'editor.deleteConfirmSimple': 'Delete this task? This cannot be undone.',
  'comment.title': 'Comment',
  'comment.none': 'No comments yet.',
  'comment.add': 'Add',
  'comment.placeholder': 'Add a comment to {taskId}…',
  'comment.removeAria': 'Remove comment',
  'diff.title': 'Plan Changes',
  'diff.removed': 'REMOVED',
  'diff.modified': 'MODIFIED',
  'diff.added': 'ADDED',
  'diff.dependencyChanged': 'DEPENDENCY CHANGED',
  'diff.comments': 'COMMENTS',
  'diff.noChanges': 'No structural changes to report.',
  'diff.cancel': 'Cancel',
  'diff.submit': 'Submit Changes',
  'diff.submitting': 'Submitting…',
  'error.circular': 'Circular dependency detected. This connection was not applied.',
  'error.selfDependency': 'A task cannot depend on itself.',
  'error.taskNotFound': 'Task {id} not found.',
  'error.duplicateId': 'Duplicate task id {id}.',
}

/** The typed translate function handed to the view entry via the `t` seat. */
export type VisualPlanT = TranslateNS<'visual-plan'>
