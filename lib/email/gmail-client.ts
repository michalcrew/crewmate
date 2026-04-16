import { google, type gmail_v1 } from "googleapis"
import { JWT } from "google-auth-library"

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

let cachedClient: gmail_v1.Gmail | null = null
let cachedAuth: JWT | null = null

function getServiceAccountKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set")
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON")
  }
}

function getGmailUserEmail(): string {
  const email = process.env.GMAIL_USER_EMAIL
  if (!email) {
    throw new Error("GMAIL_USER_EMAIL environment variable is not set (should be team@crewmate.cz)")
  }
  return email
}

function getAuth(): JWT {
  if (cachedAuth) return cachedAuth

  const key = getServiceAccountKey()

  cachedAuth = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: GMAIL_SCOPES,
    subject: getGmailUserEmail(), // impersonate team@crewmate.cz via domain-wide delegation
  })

  return cachedAuth
}

export function getGmailClient(): gmail_v1.Gmail {
  if (cachedClient) return cachedClient

  const auth = getAuth()
  cachedClient = google.gmail({ version: "v1", auth })

  return cachedClient
}

export function getGmailUserEmail_(): string {
  return getGmailUserEmail()
}

export function getProjectId(): string {
  const key = getServiceAccountKey()
  return key.project_id || "crewmate-493513"
}
