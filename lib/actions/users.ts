"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

export async function getUsers() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("users")
    .select("*")
    .order("role", { ascending: true })
    .order("prijmeni", { ascending: true })

  return data ?? []
}

export async function getCurrentUserRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single()

  return data?.role ?? null
}

const createUserSchema = z.object({
  email: z.string().email("Neplatný email"),
  jmeno: z.string().min(1, "Jméno je povinné"),
  prijmeni: z.string().min(1, "Příjmení je povinné"),
  role: z.enum(["admin", "naborar"]),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků"),
})

export async function createUser(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Check if current user is admin
  const role = await getCurrentUserRole()
  if (role !== "admin") return { error: "Nemáte oprávnění" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = createUserSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const adminClient = createAdminClient()

  // Create auth user
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })

  if (authError) return { error: authError.message }
  if (!authUser.user) return { error: "Nepodařilo se vytvořit účet" }

  // Create public.users record
  const { error: insertError } = await adminClient.from("users").insert({
    auth_user_id: authUser.user.id,
    email: parsed.data.email,
    jmeno: parsed.data.jmeno,
    prijmeni: parsed.data.prijmeni,
    role: parsed.data.role,
  })

  if (insertError) return { error: insertError.message }

  revalidatePath("/app/nastaveni")
  return { success: true }
}

export async function toggleUserActive(userId: string, aktivni: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const role = await getCurrentUserRole()
  if (role !== "admin") return { error: "Nemáte oprávnění" }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from("users")
    .update({ aktivni })
    .eq("id", userId)

  if (error) return { error: error.message }

  revalidatePath("/app/nastaveni")
  return { success: true }
}
