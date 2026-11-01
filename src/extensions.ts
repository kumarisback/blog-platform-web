import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Markdown } from '@tiptap/markdown'

// Tiptap v3 includes Link in StarterKit. Images are embedded as data URLs in
// the post document and stored in MongoDB with the story.
export const editorExtensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true
    }
  }),
  Image.configure({ allowBase64: true }),
  Markdown
]
