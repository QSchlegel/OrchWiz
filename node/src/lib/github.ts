import { Octokit } from "@octokit/rest"

export function createGitHubClient(token?: string) {
  return new Octokit({
    auth: token,
  })
}

export async function getPRComments(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
) {
  const octokit = createGitHubClient(token)
  const { data } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  })
  return data
}

export async function createPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token?: string
) {
  const octokit = createGitHubClient(token)
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  })
  return data
}

export async function getPRsWithClaudeTag(
  owner: string,
  repo: string,
  token?: string
) {
  const octokit = createGitHubClient(token)
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
  })

  // Filter PRs that mention @claude in comments or description
  const prsWithClaude = []
  for (const pr of data) {
    if (pr.body?.includes("@claude")) {
      prsWithClaude.push(pr)
      continue
    }

    const comments = await getPRComments(owner, repo, pr.number, token)
    if (comments.some((comment) => comment.body?.includes("@claude"))) {
      prsWithClaude.push(pr)
    }
  }

  return prsWithClaude
}
