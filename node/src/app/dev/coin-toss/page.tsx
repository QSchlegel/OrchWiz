import { notFound } from "next/navigation"
import CoinTossDevPageClient from "./page.client"

export default function CoinTossDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return <CoinTossDevPageClient />
}

