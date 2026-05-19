"use server"

import { prisma } from "@/lib/prisma"
import { requireAuthWithOrg } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function createPerson(formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.person.create({
    data: {
      name: formData.get("name") as string,
      type: formData.get("type") as any,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      defaultCostRate: parseFloat(formData.get("defaultCostRate") as string) || 0,
      defaultBillRate: parseFloat(formData.get("defaultBillRate") as string) || 0,
      clientBillRate: parseFloat(formData.get("clientBillRate") as string) || 0,
      portfolioUrl: (formData.get("portfolioUrl") as string) || null,
      emergencyContactName: (formData.get("emergencyContactName") as string) || null,
      emergencyContactPhone: (formData.get("emergencyContactPhone") as string) || null,
      organizationId: user.organizationId,
    },
  })

  revalidatePath("/people")
}

export async function updatePerson(id: string, formData: FormData) {
  const user = await requireAuthWithOrg()

  await prisma.person.update({
    where: { id, organizationId: user.organizationId },
    data: {
      name: formData.get("name") as string,
      type: formData.get("type") as any,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      defaultCostRate: parseFloat(formData.get("defaultCostRate") as string) || 0,
      defaultBillRate: parseFloat(formData.get("defaultBillRate") as string) || 0,
      clientBillRate: parseFloat(formData.get("clientBillRate") as string) || 0,
      portfolioUrl: (formData.get("portfolioUrl") as string) || null,
      emergencyContactName: (formData.get("emergencyContactName") as string) || null,
      emergencyContactPhone: (formData.get("emergencyContactPhone") as string) || null,
    },
  })

  revalidatePath("/people")
  revalidatePath(`/people/${id}`)
}

export async function deletePerson(id: string) {
  const user = await requireAuthWithOrg()

  await prisma.person.delete({
    where: { id, organizationId: user.organizationId },
  })

  revalidatePath("/people")
}
