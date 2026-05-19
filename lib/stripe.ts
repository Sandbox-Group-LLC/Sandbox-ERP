import Stripe from "stripe"

let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured")
  }
  
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-12-15.clover",
    })
  }
  
  return stripeClient
}

interface StripeRecipientConfig {
  email: string
  displayName: string
  country?: string
  entityType?: "individual" | "company"
  firstName?: string
  lastName?: string
}

interface StripeOnboardingLinkConfig {
  accountId: string
  returnUrl: string
  refreshUrl: string
}

export async function createStripeRecipient(config: StripeRecipientConfig): Promise<string> {
  const stripe = getStripe()
  
  const accountParams: Stripe.AccountCreateParams = {
    type: "express",
    country: config.country || "US",
    email: config.email,
    business_type: config.entityType || "individual",
    capabilities: {
      transfers: { requested: true },
    },
  }

  if (config.entityType === "company") {
    accountParams.business_profile = {
      name: config.displayName,
    }
  }

  const account = await stripe.accounts.create(accountParams)
  return account.id
}

export async function createOnboardingLink(config: StripeOnboardingLinkConfig): Promise<string> {
  const stripe = getStripe()
  
  const link = await stripe.accountLinks.create({
    account: config.accountId,
    type: "account_onboarding",
    return_url: config.returnUrl,
    refresh_url: config.refreshUrl,
  })

  return link.url
}

export async function getAccountStatus(accountId: string): Promise<{
  id: string
  payoutsEnabled: boolean
  requirementsCurrentlyDue: string[]
  requirementsPastDue: string[]
  disabledReason: string | null
}> {
  const stripe = getStripe()
  
  const account = await stripe.accounts.retrieve(accountId)

  return {
    id: account.id,
    payoutsEnabled: account.payouts_enabled || false,
    requirementsCurrentlyDue: account.requirements?.currently_due || [],
    requirementsPastDue: account.requirements?.past_due || [],
    disabledReason: account.requirements?.disabled_reason || null,
  }
}

export async function refreshAccountStatus(accountId: string): Promise<"ACTIVE" | "PENDING" | "RESTRICTED"> {
  try {
    const status = await getAccountStatus(accountId)

    if (status.payoutsEnabled) {
      return "ACTIVE"
    } else if (status.disabledReason || status.requirementsPastDue.length > 0) {
      return "RESTRICTED"
    } else {
      return "PENDING"
    }
  } catch (error) {
    console.error("Failed to refresh account status:", error)
    return "PENDING"
  }
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim()
}
