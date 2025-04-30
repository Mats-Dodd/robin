// src/Tiptap.tsx
import { EditorProvider } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const extensions = [StarterKit]

const content = '<p>Suck me</p>'

const Editor = () => {
  return (
    <EditorProvider extensions={extensions} content={content}>
    </EditorProvider>
  )
}

export default Editor
