import { ContractStage } from "@prisma/client"

export const STAGE_ORDER: ContractStage[] = [
  "Draft",
  "InternalReview",
  "VendorReview",
  "Approved",
  "SentForSignature",
  "Signed",
]

export function getNextAllowedStage(currentStage: ContractStage): ContractStage | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
    return null
  }
  return STAGE_ORDER[currentIndex + 1]
}

export function canAdvanceToStage(currentStage: ContractStage, targetStage: ContractStage): boolean {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)
  const targetIndex = STAGE_ORDER.indexOf(targetStage)
  return targetIndex === currentIndex + 1
}

export function extractGoogleDocId(input: string): string {
  const trimmed = input.trim()
  
  const urlMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{25,})/)
  if (urlMatch) {
    return urlMatch[1]
  }
  
  const idPattern = /^[a-zA-Z0-9_-]{25,}$/
  if (idPattern.test(trimmed)) {
    return trimmed
  }
  
  throw new Error("Invalid Google Doc ID or URL. Please provide a valid Google Docs URL or document ID.")
}
