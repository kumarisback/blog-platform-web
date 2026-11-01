import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
  ArrowLeft, BookOpen, Check, ChevronDown, Cloud, Feather, FileDown, FileText,
  KeyRound, LogOut, Plus, Search, Send, Tag, Trash2, Upload, X
} from 'lucide-react'
import { api } from './api'
import PostEditor from './components/PostEditor'
import PostViewer from './components/PostViewer'
import type { AuthUser, Post, PostRequest, PostStatus, PublicPostSummary } from './types'
import {
  downloadText, jsonToMarkdown, makeEmptyDocument, markdownToJson,
  slugify, wordCountFromDocument
} from './post-utils'

function formatDate(value?: string | null) {
  if (!value) return 'Not published'
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function postRequest(post: Pick<Post, 'title' | 'content' | 'status' | 'tags'>): PostRequest {
  return { title: post.title, content: post.content, status: post.status, tags: post.tags }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)
  const [publicPosts, setPublicPosts] = useState<PublicPostSummary[]>([])
  const [publicPost, setPublicPost] = useState<Post | null>(null)
  const [publicTags, setPublicTags] = useState<string[]>([])
  const [publicQuery, setPublicQuery] = useState('')
  const [publicTag, setPublicTag] = useState('')
  const [publicLoading, setPublicLoading] = useState(false)
  const [publicError, setPublicError] = useState('')

  const [authChecked, setAuthChecked] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const postsRef = useRef<Post[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | PostStatus>('all')
  const [adminQuery, setAdminQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [notice, setNotice] = useState('')
  const saveTimers = useRef<Record<string, number>>({})
  const pendingSaves = useRef<Record<string, PostRequest>>({})
  const saveChains = useRef<Record<string, Promise<void>>>({})
  const importRef = useRef<HTMLInputElement>(null)

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path)
    setPathname(path)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const slugMatch = pathname.match(/^\/posts\/([^/]+)\/?$/)
  const isPostRoute = Boolean(slugMatch)

  // Public pages never request the administrator's private draft collection.
  useEffect(() => {
    if (isAdminRoute) return
    let cancelled = false
    setPublicLoading(true)
    setPublicError('')
    if (slugMatch?.[1]) {
      setPublicPost(null)
      api.publicPost(decodeURIComponent(slugMatch[1]))
        .then((result) => { if (!cancelled) setPublicPost(result) })
        .catch((error) => { if (!cancelled) setPublicError(getErrorMessage(error)) })
        .finally(() => { if (!cancelled) setPublicLoading(false) })
    } else {
      setPublicPost(null)
      api.publicPosts(publicQuery, publicTag)
        .then((result) => { if (!cancelled) setPublicPosts(result) })
        .catch((error) => { if (!cancelled) setPublicError(getErrorMessage(error)) })
        .finally(() => { if (!cancelled) setPublicLoading(false) })
    }
    return () => { cancelled = true }
  }, [isAdminRoute, pathname, publicQuery, publicTag])

  useEffect(() => {
    if (isAdminRoute) return
    api.publicTags().then(setPublicTags).catch(() => setPublicTags([]))
  }, [isAdminRoute])

  // Resolve the session whenever the visitor enters /admin or returns there.
  useEffect(() => {
    if (!isAdminRoute) return
    let cancelled = false
    setAuthChecked(false)
    api.me()
      .then((result) => { if (!cancelled) setUser(result) })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setAuthChecked(true) })
    return () => { cancelled = true }
  }, [isAdminRoute])

  useEffect(() => {
    if (!isAdminRoute || !user) return
    let cancelled = false
    api.adminPosts()
      .then((result) => {
        if (cancelled) return
        setPosts(result)
        postsRef.current = result
        if (selectedId && !result.some((post) => post.id === selectedId)) setSelectedId(null)
      })
      .catch((error) => { if (!cancelled) setNotice(getErrorMessage(error)) })
    return () => { cancelled = true }
  }, [isAdminRoute, user])

  const selectedPost = posts.find((post) => post.id === selectedId) ?? null
  const adminTags = useMemo(() => [...new Set(posts.flatMap((post) => post.tags))].sort((a, b) => a.localeCompare(b)), [posts])
  const filteredAdminPosts = useMemo(() => posts.filter((post) => {
    const matchesStatus = filter === 'all' || post.status === filter
    const matchesTag = !selectedTag || post.tags.includes(selectedTag)
    const q = adminQuery.trim().toLowerCase()
    const matchesQuery = !q || `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLowerCase().includes(q)
    return matchesStatus && matchesTag && matchesQuery
  }), [posts, filter, selectedTag, adminQuery])
  const counts = useMemo(() => ({
    all: posts.length,
    draft: posts.filter((post) => post.status === 'draft').length,
    published: posts.filter((post) => post.status === 'published').length
  }), [posts])

  const saveInOrder = (id: string, payload: PostRequest) => {
    const previous = saveChains.current[id] ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      await api.updatePost(id, payload)
    })
    saveChains.current[id] = next
    void next.then(
      () => { if (saveChains.current[id] === next) delete saveChains.current[id] },
      () => { if (saveChains.current[id] === next) delete saveChains.current[id] }
    )
    return next
  }

  const scheduleSave = (id: string, patch: Partial<PostRequest>) => {
    const current = postsRef.current.find((post) => post.id === id)
    if (!current) return
    const optimistic: Post = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }
    const nextPosts = postsRef.current.map((post) => post.id === id ? optimistic : post)
    postsRef.current = nextPosts
    setPosts(nextPosts)
    pendingSaves.current[id] = postRequest({ ...current, ...patch })
    setSaveState('saving')
    if (saveTimers.current[id]) window.clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = window.setTimeout(async () => {
      const payload = pendingSaves.current[id]
      delete pendingSaves.current[id]
      delete saveTimers.current[id]
      if (!payload) return
      try {
        await saveInOrder(id, payload)
        if (Object.keys(pendingSaves.current).length === 0) setSaveState('saved')
      } catch (error) {
        setSaveState('error')
        setNotice(getErrorMessage(error))
      }
    }, 650)
  }

  const flushAndSetStatus = async (status: PostStatus) => {
    if (!selectedPost) return
    const id = selectedPost.id
    if (saveTimers.current[id]) window.clearTimeout(saveTimers.current[id])
    delete saveTimers.current[id]
    const current = postsRef.current.find((post) => post.id === id) ?? selectedPost
    const payload = { ...postRequest(current), status }
    pendingSaves.current[id] = payload
    const nextPosts = postsRef.current.map((post) => post.id === id ? { ...post, status } : post)
    postsRef.current = nextPosts
    setPosts(nextPosts)
    setSaveState('saving')
    try {
      await saveInOrder(id, payload)
      delete pendingSaves.current[id]
      setSaveState('saved')
      setNotice(status === 'published' ? 'Story published to your public blog' : 'Story moved back to drafts')
    } catch (error) {
      setSaveState('error')
      setNotice(getErrorMessage(error))
    }
  }

  const createPost = async () => {
    try {
      const created = await api.createPost({ title: '', content: makeEmptyDocument(), status: 'draft', tags: [] })
      const next = [created, ...postsRef.current]
      postsRef.current = next
      setPosts(next)
      setFilter('all')
      setSelectedTag('')
      setSelectedId(created.id)
      setSaveState('saved')
      setNotice('New draft created')
    } catch (error) { setNotice(getErrorMessage(error)) }
  }

  const deleteSelectedPost = async () => {
    if (!selectedPost) return
    if (!window.confirm(`Delete “${selectedPost.title || 'Untitled story'}”? This cannot be undone.`)) return
    try {
      if (saveTimers.current[selectedPost.id]) window.clearTimeout(saveTimers.current[selectedPost.id])
      delete saveTimers.current[selectedPost.id]
      delete pendingSaves.current[selectedPost.id]
      await (saveChains.current[selectedPost.id] ?? Promise.resolve()).catch(() => undefined)
      await api.deletePost(selectedPost.id)
      const next = postsRef.current.filter((post) => post.id !== selectedPost.id)
      postsRef.current = next
      setPosts(next)
      setSelectedId(null)
      setNotice('Story deleted')
    } catch (error) { setNotice(getErrorMessage(error)) }
  }

  const addTag = async (value: string) => {
    if (!selectedPost) return
    const tag = value.trim().replace(/^#/, '').slice(0, 32)
    if (!tag || selectedPost.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return
    scheduleSave(selectedPost.id, { tags: [...selectedPost.tags, tag] })
  }

  const removeTag = async (tag: string) => {
    if (!selectedPost) return
    scheduleSave(selectedPost.id, { tags: selectedPost.tags.filter((value) => value !== tag) })
  }

  const exportMarkdown = () => {
    if (!selectedPost) return
    const markdown = `---\ntitle: "${selectedPost.title.replace(/"/g, '\\"')}"\nstatus: ${selectedPost.status}\ntags: [${selectedPost.tags.map((tag) => `"${tag.replace(/"/g, '\\"')}"`).join(', ')}]\n---\n\n${jsonToMarkdown(selectedPost.content)}`
    downloadText(`${slugify(selectedPost.title)}.md`, markdown, 'text/markdown;charset=utf-8')
  }

  const exportBackup = () => {
    const archive = { format: 'localpress-archive', version: 2, exportedAt: new Date().toISOString(), posts }
    downloadText(`localpress-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(archive, null, 2), 'application/json')
    setNotice(`Exported ${posts.length} stories`)
  }

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const contents = await file.text()
      let imports: Array<{ title: string; content: JSONContent; tags: string[]; status: PostStatus }> = []
      if (/\.(md|markdown)$/i.test(file.name) || file.type === 'text/markdown') {
        const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
        const metadata = frontmatter?.[1] ?? ''
        const body = frontmatter ? contents.slice(frontmatter[0].length) : contents
        const title = metadata.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1] || file.name.replace(/\.(md|markdown)$/i, '')
        const status: PostStatus = /^status:\s*published\s*$/mi.test(metadata) ? 'published' : 'draft'
        const tagsLine = metadata.match(/^tags:\s*\[(.*?)\]\s*$/m)?.[1] ?? ''
        const tags = [...tagsLine.matchAll(/["']([^"']+)["']/g)].map((match) => match[1])
        imports = [{ title, content: markdownToJson(body), tags, status }]
      } else {
        const parsed = JSON.parse(contents) as { posts?: unknown[] } | unknown[]
        const candidates = Array.isArray(parsed) ? parsed : (parsed as { posts?: unknown[] }).posts ?? []
        imports = candidates.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const post = item as Record<string, unknown>
          if (typeof post.title !== 'string' || !post.content || typeof post.content !== 'object'
            || (post.content as Record<string, unknown>).type !== 'doc') return []
          return [{
            title: post.title,
            content: post.content as JSONContent,
            tags: Array.isArray(post.tags) ? post.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 40) : [],
            status: post.status === 'published' ? 'published' : 'draft'
          }]
        })
      }
      if (!imports.length) throw new Error('No Localpress-compatible stories were found in this file.')
      for (const post of imports) await api.createPost(post)
      const refreshed = await api.adminPosts()
      postsRef.current = refreshed
      setPosts(refreshed)
      setNotice(`Imported ${imports.length} ${imports.length === 1 ? 'story' : 'stories'}`)
    } catch (error) { setNotice(getErrorMessage(error)) }
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setLoginBusy(true)
    setLoginError('')
    try {
      const result = await api.login(username.trim(), password)
      setUser(result)
      setPassword('')
    } catch (error) { setLoginError(getErrorMessage(error)) }
    finally { setLoginBusy(false) }
  }

  const handleLogout = async () => {
    try { await api.logout() }
    catch { /* Clear the local admin UI even if the server session already expired. */ }
    setUser(null)
    setPosts([])
    postsRef.current = []
    setSelectedId(null)
    setNotice('You have been signed out')
  }

  if (isAdminRoute) {
    if (!authChecked) return <div className="screen-loading"><div className="brand-mark"><Feather size={19} /></div><span>Checking your session…</span></div>
    if (!user) {
      return (
        <div className="auth-screen">
          <button className="brand-inline" onClick={() => navigate('/')}><span className="brand-mark"><Feather size={18} /></span><span>local<span>press</span></span></button>
          <form className="auth-card" onSubmit={handleLogin}>
            <div className="auth-icon"><KeyRound size={21} /></div>
            <div className="eyebrow">PRIVATE ADMIN ACCESS</div>
            <h1>Welcome back.</h1>
            <p>Sign in to write, edit and publish stories.</p>
            {loginError && <div className="form-error" role="alert">{loginError}</div>}
            <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="primary-button auth-submit" type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in'} <ChevronDown size={15} className="login-arrow" /></button>
            <button className="back-link" type="button" onClick={() => navigate('/')}><ArrowLeft size={14} /> Back to public blog</button>
          </form>
          <p className="auth-footer">LOCALPRESS · PRIVATE WRITING WORKSPACE</p>
        </div>
      )
    }

    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <button className="brand-inline" onClick={() => navigate('/')}><span className="brand-mark"><Feather size={18} /></span><span>local<span>press</span></span></button>
          <button className="primary-button new-post-button" onClick={() => void createPost()}><Plus size={16} /> New story</button>
          <div className="eyebrow admin-side-label">YOUR LIBRARY</div>
          <div className="filter-stack">
            {(['all', 'draft', 'published'] as const).map((id) => (
              <button key={id} className={`filter-button${filter === id ? ' active' : ''}`} onClick={() => { setFilter(id); setSelectedTag('') }}>
                {id === 'all' ? <BookOpen size={15} /> : id === 'draft' ? <FileText size={15} /> : <Send size={15} />}
                <span>{id === 'all' ? 'All stories' : id === 'draft' ? 'Drafts' : 'Published'}</span><small>{counts[id]}</small>
              </button>
            ))}
          </div>
          <div className="eyebrow admin-side-label tag-heading"><Tag size={12} /> TAGS</div>
          <div className="filter-stack tag-filter-stack">
            {adminTags.map((tag) => <button key={tag} className={`filter-button tag-filter${selectedTag === tag ? ' active' : ''}`} onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}># {tag}</button>)}
          </div>
          <div className="admin-sidebar-bottom">
            <div className="admin-profile"><span className="avatar-mark">{user.username.slice(0, 1).toUpperCase()}</span><span><strong>{user.username}</strong><small>Administrator</small></span></div>
            <button className="side-action" onClick={() => importRef.current?.click()}><Upload size={14} /> Import backup</button>
            <button className="side-action" onClick={exportBackup}><FileDown size={14} /> Export backup</button>
            <button className="side-action logout-action" onClick={() => void handleLogout()}><LogOut size={14} /> Sign out</button>
            <input ref={importRef} className="visually-hidden" type="file" accept=".json,.md,.markdown,application/json,text/markdown" onChange={(event) => void importBackup(event)} />
          </div>
        </aside>

        <main className="admin-main">
          <section className="admin-library">
            <header className="admin-library-header">
              <div className="eyebrow">ADMIN WORKSPACE / {filter.toUpperCase()}</div>
              <h1>{selectedTag ? `#${selectedTag}` : filter === 'all' ? 'Your stories' : filter === 'draft' ? 'Drafts' : 'Published'}</h1>
              <p>Write privately. Publish when you’re ready.</p>
            </header>
            <div className="search-wrap admin-search"><Search size={15} /><input value={adminQuery} onChange={(event) => setAdminQuery(event.target.value)} placeholder="Search your stories…" /></div>
            <div className="list-meta"><span>{filteredAdminPosts.length} STORIES</span><span>UPDATED</span></div>
            <div className="post-list">
              {filteredAdminPosts.map((post) => (
                <button key={post.id} className={`post-card${selectedId === post.id ? ' selected' : ''}`} onClick={() => setSelectedId(post.id)}>
                  <div className="post-card-top"><span className={`status-dot ${post.status}`} /><span className="post-status-label">{post.status}</span><span className="post-card-date">{formatDate(post.updatedAt)}</span></div>
                  <h3>{post.title || 'Untitled story'}</h3><p>{post.excerpt || 'A blank page is full of possibility…'}</p>
                  {post.tags.length > 0 && <div className="post-card-tags">{post.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
                </button>
              ))}
              {filteredAdminPosts.length === 0 && <div className="empty-list"><div className="empty-list-icon"><FileText size={19} /></div><strong>No stories found</strong><p>Try another filter or create a new story.</p><button onClick={() => void createPost()}><Plus size={14} /> Write a story</button></div>}
            </div>
            <footer className="library-footer"><span>SERVER-SAVED CONTENT</span><span>✳</span></footer>
          </section>

          <section className="editor-panel">
            {selectedPost ? (
              <>
                <header className="workspace-topbar">
                  <div className="breadcrumb"><span>STORIES</span><span className="crumb-slash">/</span><span>{selectedPost.status.toUpperCase()}</span></div>
                  <div className="workspace-actions">
                    <span className="saved-indicator"><span className="saved-check"><Check size={11} /></span>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved to server'}</span>
                    <button className="topbar-button" onClick={exportMarkdown}><FileDown size={15} /><span>Export .md</span></button>
                    <button className="icon-button" aria-label="Delete story" onClick={() => void deleteSelectedPost()}><Trash2 size={16} /></button>
                  </div>
                </header>
                <div className="document-scroll">
                  <div className="document-inner">
                    <div className="document-kicker"><span className={`status-pill ${selectedPost.status}`}>{selectedPost.status === 'published' ? 'PUBLISHED' : 'DRAFT'}</span><span>·</span><span>UPDATED {formatDate(selectedPost.updatedAt).toUpperCase()}</span></div>
                    <input className="title-input" value={selectedPost.title} onChange={(event) => scheduleSave(selectedPost.id, { title: event.target.value })} placeholder="Give your story a title…" aria-label="Story title" maxLength={180} />
                    <TagEditor tags={selectedPost.tags} onAdd={addTag} onRemove={removeTag} />
                    <div className="document-rule" />
                    <PostEditor key={selectedPost.id} post={selectedPost} onContentChange={(content) => scheduleSave(selectedPost.id, { content })} />
                  </div>
                </div>
                <footer className="editor-bottom-bar">
                  <div className="bottom-note"><Cloud size={14} /><span>Saved in MongoDB</span><span className="bottom-separator">·</span><span>{wordCountFromDocument(selectedPost.content)} words</span></div>
                  <div className="publish-actions">
                    {selectedPost.status === 'draft'
                      ? <button className="publish-button" onClick={() => void flushAndSetStatus('published')}><Send size={14} /> Publish publicly</button>
                      : <button className="unpublish-button" onClick={() => void flushAndSetStatus('draft')}>Move to drafts <ChevronDown size={14} /></button>}
                  </div>
                </footer>
              </>
            ) : (
              <div className="welcome-state">
                <div className="welcome-orbit"><div className="welcome-paper"><Feather size={29} strokeWidth={1.3} /></div><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" /></div>
                <div className="welcome-overline">YOUR PRIVATE WORKSPACE</div>
                <h2>Every good story<br /><em>starts somewhere.</em></h2>
                <p>Your drafts are private until you publish them.<br />Your published stories appear on the public blog.</p>
                <button className="welcome-cta" onClick={() => void createPost()}><Plus size={16} /> Start a new story</button>
                <div className="welcome-footnote"><KeyRound size={12} /> ADMIN ACCESS ONLY</div>
              </div>
            )}
          </section>
        </main>
        {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}
      </div>
    )
  }

  return (
    <div className="public-site">
      <header className="public-header">
        <button className="brand-inline" onClick={() => navigate('/')}><span className="brand-mark"><Feather size={18} /></span><span>local<span>press</span></span></button>
        <nav><a href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}>Stories</a><a href="/admin" onClick={(event) => { event.preventDefault(); navigate('/admin') }}>Admin</a></nav>
      </header>
      {isPostRoute ? (
        <main className="public-article-wrap">
          <button className="back-link article-back" onClick={() => navigate('/')}><ArrowLeft size={14} /> All stories</button>
          {publicLoading && <div className="public-state">Loading story…</div>}
          {publicError && !publicLoading && <div className="public-state"><h2>Story unavailable</h2><p>{publicError}</p><button className="primary-button" onClick={() => navigate('/')}>Back to stories</button></div>}
          {publicPost && !publicLoading && <article className="public-article">
            <div className="eyebrow">A LOCALPRESS STORY</div>
            <h1>{publicPost.title}</h1>
            <div className="article-meta">Published {formatDate(publicPost.publishedAt)}{publicPost.tags.length > 0 && <span> · {publicPost.tags.map((tag) => `#${tag}`).join(' ')}</span>}</div>
            <div className="article-rule" />
            <PostViewer post={publicPost} />
            <div className="article-endmark">✳</div>
          </article>}
        </main>
      ) : (
        <main className="public-home">
          <section className="public-hero"><div className="eyebrow">NOTES, IDEAS & STORIES</div><h1>Words worth<br /><em>spending time with.</em></h1><p>A collection of thoughts, stories and things learned along the way.</p></section>
          <section className="public-content">
            <div className="public-list-heading"><div><div className="eyebrow">THE JOURNAL</div><h2>Latest stories</h2></div><div className="public-search"><Search size={15} /><input value={publicQuery} onChange={(event) => setPublicQuery(event.target.value)} placeholder="Search stories" /></div></div>
            {publicTags.length > 0 && <div className="public-tags"><button className={!publicTag ? 'active' : ''} onClick={() => setPublicTag('')}>All topics</button>{publicTags.map((tag) => <button key={tag} className={publicTag === tag ? 'active' : ''} onClick={() => setPublicTag(publicTag === tag ? '' : tag)}>#{tag}</button>)}</div>}
            {publicLoading && <div className="public-state">Finding stories…</div>}
            {publicError && !publicLoading && <div className="public-state"><h2>Could not load the blog</h2><p>{publicError}</p><p>Check that the Localpress API is running and the frontend is configured to reach it.</p></div>}
            {!publicLoading && !publicError && <div className="public-post-grid">
              {publicPosts.map((post, index) => <article key={post.id} className={`public-post-card${index === 0 ? ' featured' : ''}`}>
                <div className="eyebrow">{formatDate(post.publishedAt).toUpperCase()}</div>
                <h3><a href={`/posts/${post.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/posts/${post.slug}`) }}>{post.title}</a></h3>
                <p>{post.excerpt || 'A story waiting to be read.'}</p>
                <div className="public-card-bottom"><div>{post.tags.map((tag) => <button key={tag} onClick={() => setPublicTag(tag)}>#{tag}</button>)}</div><a href={`/posts/${post.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/posts/${post.slug}`) }}>Read story <span>↗</span></a></div>
              </article>)}
            </div>}
            {!publicLoading && !publicError && publicPosts.length === 0 && <div className="public-state"><div className="welcome-paper"><Feather size={25} /></div><h2>No published stories yet.</h2><p>Check back soon. The next story is being written.</p></div>}
          </section>
        </main>
      )}
      <footer className="public-footer"><span>LOCALPRESS</span><span>Made for slow thoughts.</span><button onClick={() => navigate('/admin')}>Admin sign in</button></footer>
      {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}
    </div>
  )
}

function TagEditor({ tags, onAdd, onRemove }: { tags: string[]; onAdd: (tag: string) => Promise<void>; onRemove: (tag: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const submit = () => {
    const next = value.trim().replace(/,$/, '')
    if (!next) return
    void onAdd(next)
    setValue('')
  }
  return (
    <div className="tag-editor">
      <Tag size={14} />
      {tags.map((tag) => <span className="document-tag" key={tag}>#{tag}<button onClick={() => void onRemove(tag)} aria-label={`Remove ${tag} tag`}><X size={11} /></button></span>)}
      <input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); submit() } }} onBlur={submit} placeholder={tags.length ? 'Add another…' : 'Add tags…'} aria-label="Add tag" />
    </div>
  )
}

export default App
