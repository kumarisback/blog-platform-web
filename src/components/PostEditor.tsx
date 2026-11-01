import { useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import {
  Bold, Italic, Strikethrough, Heading2, Heading3, List, ListOrdered,
  Quote, Code2, Minus, Link2, ImagePlus, Undo2, Redo2
} from 'lucide-react'
import { editorExtensions } from '../extensions'
import type { Post } from '../types'
import { wordCountFromDocument } from '../post-utils'

interface PostEditorProps {
  post: Post
  onContentChange: (content: JSONContent) => void
}

export default function PostEditor({ post, onContentChange }: PostEditorProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const editor = useEditor({
    extensions: editorExtensions,
    content: post.content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        spellcheck: 'true',
        'aria-label': 'Post body'
      }
    },
    onUpdate: ({ editor: current }) => onContentChange(current.getJSON())
  }, [post.id])

  if (!editor) return <div className="editor-loading">Preparing your writing space…</div>

  const addLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const raw = window.prompt('Paste a link', previous ?? 'https://')
    if (raw === null) return
    const href = raw.trim()
    if (!href) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const safeHref = /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: safeHref }).run()
  }

  const addImage = async (file?: File) => {
    if (!file || !editor) return
    if (!file.type.startsWith('image/')) {
      window.alert('Please choose an image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      window.alert('This image is larger than 2 MB. Smaller images keep MongoDB documents within safe size limits.')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image'))
      reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
      reader.readAsDataURL(file)
    }).catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : 'Could not read this image.')
      return null
    })
    if (dataUrl) editor.chain().focus().setImage({ src: dataUrl, alt: file.name.replace(/\.[^.]+$/, '') }).run()
  }

  const ToolButton = ({
    label, active = false, disabled = false, onClick, children
  }: {
    label: string
    active?: boolean
    disabled?: boolean
    onClick: () => void
    children: import('react').ReactNode
  }) => (
    <button
      type="button"
      className={`tool-button${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )

  return (
    <section className="writing-surface">
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
        <div className="toolbar-group">
          <ToolButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></ToolButton>
          <ToolButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></ToolButton>
        </div>
        <span className="toolbar-divider" />
        <div className="toolbar-group">
          <ToolButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolButton>
          <ToolButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolButton>
          <ToolButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolButton>
          <ToolButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolButton>
          <ToolButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolButton>
        </div>
        <span className="toolbar-divider" />
        <div className="toolbar-group">
          <ToolButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolButton>
          <ToolButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton>
          <ToolButton label="Block quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolButton>
          <ToolButton label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={16} /></ToolButton>
          <ToolButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></ToolButton>
        </div>
        <span className="toolbar-divider" />
        <div className="toolbar-group">
          <ToolButton label="Add link" active={editor.isActive('link')} onClick={addLink}><Link2 size={16} /></ToolButton>
          <ToolButton label="Insert image" onClick={() => imageInput.current?.click()}><ImagePlus size={16} /></ToolButton>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              void addImage(file)
              event.target.value = ''
            }}
          />
        </div>
      </div>
      <EditorContent editor={editor} />
      <div className="editor-footnote">
        <span>Write freely. Changes save securely to your Localpress server.</span>
        <span>{wordCountFromDocument(editor.getJSON()).toLocaleString()} words</span>
      </div>
    </section>
  )
}
