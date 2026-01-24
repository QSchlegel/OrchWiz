"use client"

import { useEffect, useState } from "react"
import { 
  Globe, 
  Eye, 
  Star, 
  Plus,
  Search,
  Tag,
  Github,
  ExternalLink,
  User,
  Calendar,
  TrendingUp
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { FlipCard } from "@/components/orchestration/FlipCard"
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    slug: "",
    isPublic: false,
    tags: "",
    repository: "",
    website: "",
    readme: "",
    category: "",
  })

  useEffect(() => {
    fetchProjects()
  }, [searchQuery, selectedCategory])

  const fetchProjects = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("public", "true")
      if (searchQuery) params.append("search", searchQuery)
      if (selectedCategory) params.append("category", selectedCategory)

      const response = await fetch(`/api/projects?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      }
    } catch (error) {
      console.error("Error fetching projects:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const tagsArray = formData.tags.split(",").map(t => t.trim()).filter(Boolean)
      
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          tags: tagsArray,
          category: formData.category || null,
        }),
      })

      if (response.ok) {
        setShowCreateForm(false)
        setFormData({
          name: "",
          description: "",
          slug: "",
          isPublic: false,
          tags: "",
          repository: "",
          website: "",
          readme: "",
          category: "",
        })
        fetchProjects()
      }
    } catch (error) {
      console.error("Error creating project:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleStar = async (slug: string) => {
    try {
      await fetch(`/api/projects/${slug}/star`, {
        method: "POST",
      })
      fetchProjects()
    } catch (error) {
      console.error("Error starring project:", error)
    }
  }

  return (
    <div className="min-h-screen gradient-orb perspective p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <Globe className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Public Projects
            </h1>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 stack-2 transform hover:scale-105"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>

        {/* Search and Filter */}
        <div className="mb-8 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-12 pr-4 py-3 glass dark:glass-dark rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-green-400/50"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-3 glass dark:glass-dark rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-green-400/50"
          >
            <option value="">All Categories</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {showCreateForm && (
          <OrchestrationSurface level={5} className="mb-8">
            <h2 className="text-2xl font-semibold mb-6">Create New Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Project Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="My Awesome Project"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Slug (optional)</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="my-awesome-project"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="Project description..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                  >
                    <option value="">Select category</option>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="ai, automation, tool"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Repository URL</label>
                  <input
                    type="url"
                    value={formData.repository}
                    onChange={(e) => setFormData({ ...formData, repository: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Website URL</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="https://example.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">README (Markdown)</label>
                  <textarea
                    value={formData.readme}
                    onChange={(e) => setFormData({ ...formData, readme: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20 font-mono text-sm"
                    placeholder="# Project Title&#10;&#10;Project description..."
                  />
                </div>
                <div className="md:col-span-2 flex items-center">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="isPublic" className="text-sm">
                    Make this project public
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 disabled:opacity-50 stack-2"
                >
                  {isCreating ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 glass dark:glass-dark rounded-xl border border-white/20 hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </OrchestrationSurface>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <OrchestrationSurface level={3} className="text-center py-12">
            <Globe className="w-16 h-16 text-green-400 mx-auto mb-4 opacity-50" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery || selectedCategory 
                ? "No projects found matching your criteria." 
                : "No public projects yet. Be the first to share your project!"}
            </p>
          </OrchestrationSurface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, index) => {
              const stackLevel = ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5

              const frontContent = (
                <div className="h-full flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-5 h-5 text-green-400" />
                        <h3 className="text-xl font-semibold">{project.name}</h3>
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 flex-1">
                    {project.category && (
                      <div className="flex items-center gap-2 text-sm">
                        <Tag className="w-4 h-4 text-purple-400" />
                        <span className="text-gray-600 dark:text-gray-400">
                          {categoryLabels[project.category] || project.category}
                        </span>
                      </div>
                    )}

                    {project.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {project.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs glass dark:glass-dark rounded border border-white/20"
                          >
                            {tag}
                          </span>
                        ))}
                        {project.tags.length > 3 && (
                          <span className="px-2 py-1 text-xs text-gray-400">
                            +{project.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-auto">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span>{project.stars}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4 text-blue-400" />
                        <span>{project.views}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )

              const backContent = (
                <div className="h-full flex flex-col">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-5 h-5 text-green-400" />
                      <h3 className="text-lg font-semibold">{project.name}</h3>
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {project.description}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-400">
                        {project.user.name || project.user.email}
                      </span>
                    </div>

                    {project.tags.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Tags</div>
                        <div className="flex flex-wrap gap-2">
                          {project.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 text-xs glass dark:glass-dark rounded border border-white/20"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span>{project.stars} stars</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4 text-blue-400" />
                        <span>{project.views} views</span>
                      </div>
                    </div>

                    <div className="mt-auto pt-4 space-y-2">
                      {project.repository && (
                        <a
                          href={project.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 w-full px-3 py-2 glass dark:glass-dark rounded-lg border border-white/20 hover:bg-white/10 transition-all text-sm"
                        >
                          <Github className="w-4 h-4" />
                          View Repository
                        </a>
                      )}
                      {project.website && (
                        <a
                          href={project.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 w-full px-3 py-2 glass dark:glass-dark rounded-lg border border-white/20 hover:bg-white/10 transition-all text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Visit Website
                        </a>
                      )}
                      <Link
                        href={`/projects/${project.slug}`}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all text-sm"
                      >
                        View Details
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          handleStar(project.slug)
                        }}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 glass dark:glass-dark rounded-lg border border-white/20 hover:bg-white/10 transition-all text-sm"
                      >
                        <Star className="w-4 h-4 text-yellow-400" />
                        Star Project
                      </button>
                    </div>
                  </div>
                </div>
              )

              return (
                <FlipCard
                  key={project.id}
                  front={frontContent}
                  back={backContent}
                  level={stackLevel}
                  className="h-full min-h-[300px]"
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
