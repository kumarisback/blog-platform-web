import type { JSONContent } from '@tiptap/core'

export type PostStatus = 'draft' | 'published'

export interface Post {
  id: string
  slug: string
  title: string
  content: JSONContent
  status: PostStatus
  tags: string[]
  excerpt: string
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export interface PublicPostSummary {
  id: string
  slug: string
  title: string
  excerpt: string
  tags: string[]
  publishedAt: string
}

export interface PostRequest {
  title: string
  content: JSONContent
  status: PostStatus
  tags: string[]
}

export interface AuthUser {
  username: string
  role: string
}
