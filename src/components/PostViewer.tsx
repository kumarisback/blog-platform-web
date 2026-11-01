import { EditorContent, useEditor } from '@tiptap/react'
import type { Post } from '../types'
import { editorExtensions } from '../extensions'

export default function PostViewer({ post }: { post: Post }) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: post.content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap-content public-prose',
        'aria-label': 'Published story'
      }
    }
  }, [post.id])

  if (!editor) return <div className="reader-loading">Loading story…</div>
  return <EditorContent editor={editor} />
}
