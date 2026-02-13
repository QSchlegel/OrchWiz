import { Suspense } from "react"
import PersonalPage from "../page"

export default function PersonalToolsPage() {
  return (
    <Suspense fallback={null}>
      <PersonalPage />
    </Suspense>
  )
}
