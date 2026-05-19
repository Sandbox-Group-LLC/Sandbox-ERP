"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { StripePayoutStatus } from "@prisma/client"
import { createStripeRecipient, createOnboardingLink, refreshAccountStatus, isStripeConfigured } from "@/lib/stripe"

export async function createVendor(formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.vendor.create({
    data: {
      name: formData.get("name") as string,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      categories: (formData.get("categories") as string) || null,
      contactName: (formData.get("contactName") as string) || null,
      website: (formData.get("website") as string) || null,
      billingAddress: (formData.get("billingAddress") as string) || null,
      billingCity: (formData.get("billingCity") as string) || null,
      billingState: (formData.get("billingState") as string) || null,
      billingZip: (formData.get("billingZip") as string) || null,
      billingCountry: (formData.get("billingCountry") as string) || null,
      shippingAddress: (formData.get("shippingAddress") as string) || null,
      shippingCity: (formData.get("shippingCity") as string) || null,
      shippingState: (formData.get("shippingState") as string) || null,
      shippingZip: (formData.get("shippingZip") as string) || null,
      shippingCountry: (formData.get("shippingCountry") as string) || null,
      taxId: (formData.get("taxId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      paymentTerms: (formData.get("paymentTerms") as string) || null,
      organizationId: user.organizationId,
    },
  })

  revalidatePath("/vendors")
}

export async function updateVendor(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.vendor.update({
    where: { id, organizationId: user.organizationId },
    data: {
      name: formData.get("name") as string,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      categories: (formData.get("categories") as string) || null,
      contactName: (formData.get("contactName") as string) || null,
      website: (formData.get("website") as string) || null,
      billingAddress: (formData.get("billingAddress") as string) || null,
      billingCity: (formData.get("billingCity") as string) || null,
      billingState: (formData.get("billingState") as string) || null,
      billingZip: (formData.get("billingZip") as string) || null,
      billingCountry: (formData.get("billingCountry") as string) || null,
      shippingAddress: (formData.get("shippingAddress") as string) || null,
      shippingCity: (formData.get("shippingCity") as string) || null,
      shippingState: (formData.get("shippingState") as string) || null,
      shippingZip: (formData.get("shippingZip") as string) || null,
      shippingCountry: (formData.get("shippingCountry") as string) || null,
      taxId: (formData.get("taxId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      paymentTerms: (formData.get("paymentTerms") as string) || null,
    },
  })

  revalidatePath("/vendors")
}

export async function deleteVendor(id: string) {
  const user = await requireAuthWithOrg()

  await prisma.vendor.delete({
    where: { id, organizationId: user.organizationId },
  })

  revalidatePath("/vendors")
}

export async function checkStripeConfigured(): Promise<boolean> {
  return isStripeConfigured()
}

export async function setupVendorStripeRecipient(vendorId: string): Promise<{ success: boolean; error?: string; onboardingUrl?: string }> {
  const user = await requireAuthWithOrg()

  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe is not configured. Please add your Stripe API key in Settings." }
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
  })

  if (!vendor) {
    return { success: false, error: "Vendor not found" }
  }

  if (!vendor.email) {
    return { success: false, error: "Email address is required for payout setup" }
  }

  try {
    let stripeAccountId = vendor.stripeAccountId

    if (!stripeAccountId) {
      stripeAccountId = await createStripeRecipient({
        email: vendor.email,
        displayName: vendor.name,
        entityType: "company",
      })

      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          stripeAccountId,
          stripePayoutStatus: "PENDING",
        },
      })
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DEPLOYMENT_URL || "http://localhost:5000"

    const onboardingUrl = await createOnboardingLink({
      accountId: stripeAccountId,
      returnUrl: `${baseUrl}/vendors?stripe=success&vendorId=${vendorId}`,
      refreshUrl: `${baseUrl}/vendors?stripe=refresh&vendorId=${vendorId}`,
    })

    revalidatePath("/vendors")
    return { success: true, onboardingUrl }
  } catch (error) {
    console.error("Stripe vendor setup error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to setup payout recipient" }
  }
}

export async function refreshVendorStripeStatus(vendorId: string): Promise<{ success: boolean; status?: StripePayoutStatus; error?: string }> {
  const user = await requireAuthWithOrg()

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
  })

  if (!vendor || !vendor.stripeAccountId) {
    return { success: false, error: "No Stripe account linked" }
  }

  try {
    const status = await refreshAccountStatus(vendor.stripeAccountId)

    await prisma.vendor.update({
      where: { id: vendorId },
      data: { stripePayoutStatus: status },
    })

    revalidatePath("/vendors")
    return { success: true, status }
  } catch (error) {
    console.error("Stripe vendor refresh error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to refresh status" }
  }
}
