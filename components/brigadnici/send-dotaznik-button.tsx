"use client"

/**
 * F-0014 1E — thin wrapper over SendDotaznikDialog for backward compat.
 * Old callers passed only `brigadnikId`; the dialog handles warning flow.
 */
import { SendDotaznikDialog } from "./send-dotaznik-dialog"

export function SendDotaznikButton({
  brigadnikId,
  brigadnikEmail,
}: {
  brigadnikId: string
  brigadnikEmail?: string | null
}) {
  return (
    <SendDotaznikDialog
      brigadnikId={brigadnikId}
      brigadnikEmail={brigadnikEmail}
    />
  )
}
