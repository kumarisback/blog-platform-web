import type { AuthUser, Post, PostRequest, PublicPostSummary } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
let csrfToken: string | null = null

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function refreshCsrf(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new ApiError('Could not initialize the secure session.', response.status)
  const payload = await response.json() as { token: string }
  csrfToken = payload.token
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const unsafe = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)
  if (unsafe && !csrfToken) await refreshCsrf()

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (unsafe && csrfToken) headers.set('X-XSRF-TOKEN', csrfToken)

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include'
  })

  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    try {
      const body = await response.json() as { error?: string; detail?: string; message?: string }
      message = body.error ?? body.detail ?? body.message ?? message
    } catch {
      if (response.status === 401) message = 'Your session has expired. Please sign in again.'
      else if (response.status === 403) message = 'The request was rejected. Refresh the page and try again.'
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  csrf: refreshCsrf,
  me: () => request<AuthUser>('/api/auth/me'),
  async login(username: string, password: string) {
    csrfToken = null
    const result = await request<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    // A new server session is created at login; fetch the matching CSRF token.
    csrfToken = null
    await refreshCsrf()
    return result
  },
  async logout() {
    await request<void>('/api/auth/logout', { method: 'POST' })
    csrfToken = null
  },
  adminPosts: () => request<Post[]>('/api/posts'),
  createPost: (post: PostRequest) => request<Post>('/api/posts', {
    method: 'POST', body: JSON.stringify(post)
  }),
  updatePost: (id: string, post: PostRequest) => request<Post>(`/api/posts/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(post)
  }),
  deletePost: (id: string) => request<void>(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  publicPosts: (query = '', tag = '') => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (tag) params.set('tag', tag)
    const suffix = params.size ? `?${params.toString()}` : ''
    return request<PublicPostSummary[]>(`/api/public/posts${suffix}`)
  },
  publicPost: (slug: string) => request<Post>(`/api/public/posts/${encodeURIComponent(slug)}`),
  publicTags: () => request<string[]>('/api/public/tags')
}
