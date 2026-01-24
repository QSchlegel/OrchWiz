"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { 
  Globe, 
  Eye, 
  Star, 
  Github,
  ExternalLink,
  User,
  Calendar,
  Tag,
  ArrowLeft
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import Link from "next/link"

interface Project {
  id: string
  name: string
  description: string | null
  slug: string
  isPublic: boolean
  tags: string[]
  repository: string | null
  website: string | null
  readme: string | null
  thumbnail: string | null
  category: string | null
  stars: number
  views: number
  createdAt: string
  user: {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
  }
}

const categoryLabels: Record<string, string> = {
  ai_agent: "AI Agent",
  automation: "Automation",
  tool: "Tool",
  library: "Library",
  application: "Application",
  other: "Other",
}

export default function ProjectDetailPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (slug) {
      fetchProject()
    }
  }, [slug])

  const fetchProject = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/projects/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setProject(data)
      }
    } catch (error) {
      console.error("Error fetching project:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStar = async () => {
    if (!project) return
    try {
      await fetch(`/api/projects/${slug}/star`, {
        method: "POST",
      })
      fetchProject()
    } catch (error) {
      console.error("Error starring project:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-orb perspective p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading project...
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen gradient-orb perspective p-8">
        <div className="max-w-4xl mx-auto">
          <OrchestrationSurface level={3} className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Project not found</p>
            <Link href="/projects" className="mt-4 inline-flex items-center gap-2 text-green-400 hover:text-green-300">
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
          </OrchestrationSurface>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-orb perspective p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/projects" className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-300 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        <OrchestrationSurface level={5} className="mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-8 h-8 text-green-400" />
                <h1 className="text-4xl font-bold">{project.name}</h1>
              </div>
              {project.description && (
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            {project.category && (
              <div className="flex items-center gap-2 px-3 py-1.5 glass dark:glass-dark rounded-lg border border-white/20">
                <Tag className="w-4 h-4 text-purple-400" />
                <span>{categoryLabels[project.category] || project.category}</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 glass dark:glass-dark rounded-lg border border-white/20">
              <Star className="w-4 h-4 text-yellow-400" />
              <span>{project.stars}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 glass dark:glass-dark rounded-lg border border-white/20">
              <Eye className="w-4 h-4 text-blue-400" />
              <span>{project.views}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 glass dark:glass-dark rounded-lg border border-white/20">
              <User className="w-4 h-4 text-gray-400" />
              <span>{project.user.name || project.user.email}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 glass dark:glass-dark rounded-lg border border-white/20">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{new Date(project.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {project.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-sm glass dark:glass-dark rounded-lg border border-white/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            {project.repository && (
              <a
                href={project.repository}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all"
              >
                <Github className="w-5 h-5" />
                View on GitHub
              </a>
            )}
            {project.website && (
              <a
                href={project.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                <ExternalLink className="w-5 h-5" />
                Visit Website
              </a>
            )}
            <button
              onClick={handleStar}
              className="flex items-center gap-2 px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20 hover:bg-white/10 transition-all"
            >
              <Star className="w-5 h-5 text-yellow-400" />
              Star
            </button>
          </div>
        </OrchestrationSurface>

        {project.readme && (
          <OrchestrationSurface level={3}>
            <h2 className="text-2xl font-semibold mb-4">README</h2>
            <div className="prose prose-invert max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 dark:text-gray-400">
                {project.readme}
              </pre>
            </div>
          </OrchestrationSurface>
        )}
      </div>
    </div>
  )
}
