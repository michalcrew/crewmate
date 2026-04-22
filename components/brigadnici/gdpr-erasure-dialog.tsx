"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShieldAlert, Download, Clock } from "lucide-react"
import { recordErasureRequest, anonymizeBrigadnik } from "@/lib/actions/gdpr-erasure"
import { toast } from "sonner"

/**
 * F-0021e — GDPR erasure UI (čl. 17).
 *
 * Dva kroky:
 *  1) "Zaznamenat žádost" → `recordErasureRequest` startuje 30denní lhůtu.
 *     Samo o sobě anonymizaci neprovádí.
 *  2) "Provést anonymizaci" → `anonymizeBrigadnik`. Confirm dialog
 *     vysvětlí co zmizí a co NELZE smazat podle existence DPP.
 *
 * Admin vidí i GDPR export link (MD-11 endpoint).
 */

type Props = {
  brigadnikId: string
  erasureRequestedAt: string | null
  anonymizovanAt: string | null
}

export function GdprErasureDialog({
  brigadnikId,
  erasureRequestedAt,
  anonymizovanAt,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const jeAnonymizovan = Boolean(anonymizovanAt)
  const jeZazadano = Boolean(erasureRequestedAt)

  async function handleRecordRequest() {
    if (!confirm(
      `Zaznamenat GDPR žádost o výmaz?\n\n` +
      `Startuje 30denní lhůtu (čl. 12 odst. 3 GDPR). Sama o sobě nic nemaže ` +
      `— následně spusťte „Provést anonymizaci".`,
    )) return
    setPending(true)
    const res = await recordErasureRequest(brigadnikId)
    setPending(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("GDPR žádost zaznamenána")
  }

  async function handleAnonymize() {
    setPending(true)
    const res = await anonymizeBrigadnik(brigadnikId)
    setPending(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    const modeLabel =
      res.mode === "dpp_preserved"
        ? "Anonymizováno (kontakt smazán, core identity zachována pro daňovou retenci)"
        : "Anonymizováno (plná pseudonymizace, bez retence)"
    toast.success(modeLabel)
    setOpen(false)
  }

  if (jeAnonymizovan) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-muted-foreground/20 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" />
        GDPR anonymizováno {new Date(anonymizovanAt!).toLocaleDateString("cs-CZ")}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <ShieldAlert className="h-4 w-4 mr-1" />
          GDPR výmaz
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>GDPR čl. 17 — právo na výmaz</DialogTitle>
          <DialogDescription>
            Postup se liší podle toho, zda brigádník měl uzavřenou DPP:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {jeZazadano && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-3">
              <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">Žádost zaznamenána</p>
                <p className="text-amber-800 text-xs mt-0.5">
                  {new Date(erasureRequestedAt!).toLocaleString("cs-CZ")} — 30denní lhůta na provedení podle čl. 12 odst. 3 GDPR.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-md border p-3 space-y-2">
            <p className="font-medium">Pokud má brigádník DPP historii:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
              <li>Smaže se: e-mail, telefon, kor. adresa, pojišťovna, foto, CV, banka, OSVČ údaje, poznámky.</li>
              <li>Zachová se: jméno, příjmení, RČ, OP, datum narození, trvalá adresa (daňová retence 10 let).</li>
              <li>Nastaví se <code>uchovat_do = poslední rok DPP + 10</code> — po tomto datu scheduled job hard-delete.</li>
            </ul>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <p className="font-medium">Pokud DPP nikdy neměl:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
              <li>Všechna osobní pole smazána včetně RČ a OP.</li>
              <li>Jméno → „Smazaný brigádník #XXXXXXXX"; <code>uchovat_do = NULL</code>.</li>
              <li>Lze hard-delete kdykoliv.</li>
            </ul>
          </div>

          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <p className="font-medium">Zachováno vždy:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
              <li>Historie (audit log, včetně této erasure entry) — nepopiratelnost.</li>
              <li>Pipeline entries, přiřazení, docházka, smluvní stavy — bez brigadnikových poznámek.</li>
              <li>Dokumenty v Storage (DPP PDF) — daňová retence, nutno samostatně v Storage UI.</li>
            </ul>
          </div>

          <a
            href={`/api/brigadnici/${brigadnikId}/gdpr-export`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Download className="h-3 w-3" />
            Stáhnout GDPR export (JSON, čl. 15) před provedením výmazu
          </a>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          {!jeZazadano && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRecordRequest}
              disabled={pending}
            >
              Jen zaznamenat žádost
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (confirm("Opravdu provést anonymizaci? Akci NELZE vrátit.")) {
                handleAnonymize()
              }
            }}
            disabled={pending}
          >
            {pending ? "Anonymizuji…" : "Provést anonymizaci"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
