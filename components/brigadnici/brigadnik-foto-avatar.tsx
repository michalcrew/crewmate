"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { User, Upload, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { uploadBrigadnikFoto } from "@/lib/actions/brigadnici"

/**
 * Avatar + lightbox + upload pro foto brigádníka.
 *
 *  - Bez fotky: kolečko s ikonou, klik otevře dialog pro nahrání
 *  - S fotkou: malý kulatý avatar, klik otevře dialog se zvětšenou verzí
 *    + tlačítkem 'Nahrát nové foto' (pro admin/náborářku přepsání)
 *
 * Upload volá server action uploadBrigadnikFoto, která dělá role check,
 * upload do storage a update brigadnici.foto_url.
 */
export function BrigadnikFotoAvatar({
  brigadnikId,
  url,
  alt,
}: {
  brigadnikId: string
  url: string | null
  alt: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.set("foto", file)

    startTransition(async () => {
      const result = await uploadBrigadnikFoto(brigadnikId, formData)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Fotka nahrána")
        setOpen(false)
        router.refresh()
      }
      if (fileInputRef.current) fileInputRef.current.value = ""
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-12 rounded-full overflow-hidden bg-muted shrink-0 cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center justify-center"
        aria-label={url ? `Zobrazit fotografii — ${alt}` : `Nahrát fotografii — ${alt}`}
      >
        {url ? (
          <img src={url} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <User className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-4">
          <DialogHeader>
            <DialogTitle>Fotografie — {alt}</DialogTitle>
          </DialogHeader>

          {url ? (
            <img
              src={url}
              alt={alt}
              className="w-full h-auto max-h-[70vh] object-contain rounded bg-muted"
            />
          ) : (
            <div className="w-full aspect-square max-h-[40vh] flex items-center justify-center bg-muted rounded">
              <div className="text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-2" />
                <p className="text-sm">Brigádník zatím nemá fotografii</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              JPG, PNG nebo HEIC, max 20 MB
            </p>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
                onChange={handleFileChange}
                className="hidden"
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Nahrávám…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {url ? "Nahrát nové foto" : "Nahrát foto"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
