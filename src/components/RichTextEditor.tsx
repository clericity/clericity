'use client'

import { useRef, useEffect, useCallback, useState, type CSSProperties } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, rows = 5, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValue = useRef(value)
  const savedRange = useRef<Range | null>(null)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value
      lastValue.current = value
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editorRef.current && value !== lastValue.current) {
      editorRef.current.innerHTML = value
      lastValue.current = value
    }
  }, [value])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      lastValue.current = html
      onChange(html)
    }
  }, [onChange])

  const execFormat = (command: string, val?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, val)
    handleInput()
  }

  const openLinkInput = (e: React.MouseEvent) => {
    e.preventDefault()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
    setLinkUrl('https://')
    setShowLinkInput(true)
  }

  const insertLink = () => {
    const url = linkUrl.trim()
    setShowLinkInput(false)
    setLinkUrl('')
    if (!url || url === 'https://') return

    editorRef.current?.focus()

    const sel = window.getSelection()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }

    const selectedText = savedRange.current?.toString() || ''
    savedRange.current = null

    if (selectedText) {
      document.execCommand('createLink', false, url)
      editorRef.current?.querySelectorAll('a').forEach(a => {
        if (!a.target) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
      })
    } else {
      document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
    }
    handleInput()
  }

  const btn: CSSProperties = {
    padding: '0.2rem 0.55rem',
    borderRadius: '5px',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    color: '#374151',
  }

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '0.25rem', padding: '0.4rem 0.6rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center' }}>
        {showLinkInput ? (
          <>
            <input
              autoFocus
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insertLink() } if (e.key === 'Escape') { setShowLinkInput(false) } }}
              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '5px', padding: '0.2rem 0.5rem', fontSize: '0.8rem', outline: 'none', minWidth: 0, color: '#111827', backgroundColor: 'white' }}
              placeholder="https://..."
            />
            <button type="button" onClick={insertLink}
              style={{ padding: '0.2rem 0.6rem', borderRadius: '5px', border: '1px solid #2563eb', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap' }}>
              ✓ Beillesztés
            </button>
            <button type="button" onClick={() => setShowLinkInput(false)}
              style={{ padding: '0.2rem 0.5rem', borderRadius: '5px', border: '1px solid #e5e7eb', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280' }}>
              ✕
            </button>
          </>
        ) : (
          <>
            <button type="button" onMouseDown={e => { e.preventDefault(); execFormat('bold') }} style={btn} title="Félkövér"><strong>B</strong></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); execFormat('italic') }} style={btn} title="Dőlt"><em>I</em></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); execFormat('underline') }} style={btn} title="Aláhúzott"><u>U</u></button>
            <button type="button" onMouseDown={openLinkInput} style={btn} title="Link hozzáadása">🔗</button>
          </>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        style={{
          minHeight: `${rows * 1.6}rem`,
          padding: '0.625rem 1rem',
          outline: 'none',
          fontSize: '0.875rem',
          lineHeight: '1.6',
          color: '#111827',
          backgroundColor: 'white',
          overflowY: 'auto',
        }}
      />
    </div>
  )
}
