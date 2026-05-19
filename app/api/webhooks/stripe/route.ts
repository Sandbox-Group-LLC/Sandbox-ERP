import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-12-15.clover" })
  : null

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  if (!stripe) {
    console.warn("Stripe webhook received but STRIPE_SECRET_KEY not configured")
    return NextResponse.json({ received: true })
  }

  if (!webhookSecret) {
    console.warn("Stripe webhook received but STRIPE_WEBHOOK_SECRET not configured - skipping signature verification")
    return NextResponse.json({ received: true })
  }

  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    const accountId = account.id

    let status: "NOT_SETUP" | "PENDING" | "ACTIVE" | "RESTRICTED" = "PENDING"

    if (account.requirements?.disabled_reason) {
      status = "RESTRICTED"
    } else if (account.payouts_enabled && account.details_submitted) {
      status = "ACTIVE"
    } else if (account.requirements?.currently_due && account.requirements.currently_due.length > 0) {
      status = "PENDING"
    } else if (!account.payouts_enabled) {
      status = "PENDING"
    }

    await Promise.all([
      prisma.person.updateMany({
        where: { stripeAccountId: accountId },
        data: { stripePayoutStatus: status },
      }),
      prisma.vendor.updateMany({
        where: { stripeAccountId: accountId },
        data: { stripePayoutStatus: status },
      }),
    ])

    console.log(`Stripe webhook: Updated account ${accountId} to status ${status}`)
  }

  return NextResponse.json({ received: true })
}
