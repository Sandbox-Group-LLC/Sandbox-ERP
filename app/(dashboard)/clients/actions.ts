"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  clientCode: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  industry: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
})

const contactSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().optional(),
})

export async function createClient(formData: FormData) {
  const user = await requireAuthWithOrg()

  const data = clientSchema.parse({
    name: formData.get("name"),
    clientCode: formData.get("clientCode") || undefined,
    website: formData.get("website") || undefined,
    industry: formData.get("industry") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    country: formData.get("country") || undefined,
    notes: formData.get("notes") || undefined,
  })

  await prisma.client.create({
    data: {
      name: data.name,
      clientCode: data.clientCode || null,
      website: data.website || null,
      industry: data.industry || null,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.postalCode || null,
      country: data.country || null,
      notes: data.notes || null,
      organizationId: user.organizationId,
    },
  })

  revalidatePath("/clients")
}

export async function updateClient(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  const data = clientSchema.parse({
    name: formData.get("name"),
    clientCode: formData.get("clientCode") || undefined,
    website: formData.get("website") || undefined,
    industry: formData.get("industry") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    country: formData.get("country") || undefined,
    notes: formData.get("notes") || undefined,
  })

  await prisma.client.update({
    where: { id, organizationId: user.organizationId },
    data: {
      name: data.name,
      clientCode: data.clientCode || null,
      website: data.website || null,
      industry: data.industry || null,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.postalCode || null,
      country: data.country || null,
      notes: data.notes || null,
    },
  })

  revalidatePath("/clients")
  revalidatePath(`/clients/${id}`)
}

export async function deleteClient(id: string) {
  const user = await requireAuthWithOrg()

  await prisma.client.delete({
    where: { id, organizationId: user.organizationId },
  })

  revalidatePath("/clients")
}

export async function createContact(formData: FormData) {
  await requireAuthWithOrg()

  const data = contactSchema.parse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    role: formData.get("role") || undefined,
  })

  await prisma.contact.create({
    data: {
      ...data,
      email: data.email || null,
    },
  })

  revalidatePath(`/clients/${data.clientId}`)
}

export async function updateContact(id: string, formData: FormData) {
  await requireAuthWithOrg()

  const clientId = formData.get("clientId") as string

  const data = {
    name: formData.get("name") as string,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    role: (formData.get("role") as string) || null,
  }

  await prisma.contact.update({
    where: { id },
    data,
  })

  revalidatePath(`/clients/${clientId}`)
}

export async function deleteContact(id: string, clientId: string) {
  await requireAuthWithOrg()

  await prisma.contact.delete({
    where: { id },
  })

  revalidatePath(`/clients/${clientId}`)
}
