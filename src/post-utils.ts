import { Editor, type JSONContent } from '@tiptap/core'
import { editorExtensions } from './extensions'

export function makeEmptyDocument(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function plainTextFromDocument(node: JSONContent | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? [])
    .map((child) => plainTextFromDocument(child))
    .join(node.type === 'paragraph' || node.type === 'heading' ? ' ' : '\n')
}

export function wordCountFromDocument(doc: JSONContent): number {
  const text = plainTextFromDocument(doc).trim()
  return text ? text.split(/\s+/).length : 0
}

export function markdownToJson(markdown: string): JSONContent {
  const editor = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' })
  const result = editor.getJSON()
  editor.destroy()
  return result
}

export function jsonToMarkdown(content: JSONContent): string {
  const editor = new Editor({ extensions: editorExtensions, content })
  const result = editor.getMarkdown()
  editor.destroy()
  return result
}

export function downloadText(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function slugify(value: string): string {
  return value.toLocaleLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'untitled'
}
