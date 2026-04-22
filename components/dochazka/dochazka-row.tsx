"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Phone } from "lucide-react"
import {
  DokumentacniStavBadge,
  type DokumentacniStav,
} from "@/components/brigadnici/dokumentacni-stav-badge"
import { FieldStatusIndicator, type FieldStatus } from "./field-status-indicator"
import { NepriselButton, UndoNepriselButton } from "./neprisel-button"
import {
  upsertDochazkaField,
  type DochazkaField,
  type DochazkaEditor,
} from "@/lib/actions/dochazka"

export type DochazkaRowEntry = {
  prirazeniId: string
  brigadnik: {
    id: string
    jmeno: string
    prijmeni: string
    telefon?: string | null
  }
  status: string // prirazeni.status
  dochazka: {
    id?: string
    prichod: string | null
    odchod: string | null
    hodnoceni: number | null
    poznamka: string | null
  } | null
  dokumentacniStav: DokumentacniStav | string | null
}

type Props = DochazkaRowEntry & {
  editor: DochazkaEditor
  onFieldFailed?: (fieldKey: string) => void
  onFieldRecovered?: (fieldKey: string) => void
  onRowChanged?: () => void
}

type FieldState = {
  value: string
  status: FieldStatus
  attempt: number
  lastServerValue: string
}

type RowState = Record<DochazkaField, FieldState>

type Action =
  | { type: "EDIT"; field: DochazkaField; value: string }
  | { type: "SAVING"; field: DochazkaField; attempt: number }
  | { type: "SAVED"; field: DochazkaField; serverValue: string }
  | { type: "ERROR"; field: DochazkaField; attempt: number }
  | { type: "RESET_SAVED"; field: DochazkaField }

function init(d: DochazkaRowEntry["dochazka"]): RowState {
  const prichod = d?.prichod ? d.prichod.slice(0, 5) : ""
  const odchod = d?.odchod ? d.odchod.slice(0, 5) : ""
  const hodnoceni = d?.hodnoceni != null ? String(d.hodnoceni) : ""
  const poznamka = d?.poznamka ?? ""
  const mk = (v: string): FieldState => ({
    value: v,
    status: "idle",
    attempt: 0,
    lastServerValue: v,
  })
  return {
    prichod: mk(prichod),
    odchod: mk(odchod),
    hodnoceni: mk(hodnoceni),
    poznamka: mk(poznamka),
  }
}

function reducer(state: RowState, action: Action): RowState {
  switch (action.type) {
    case "EDIT":
      return {
        ...state,
        [action.field]: { ...state[action.field], value: action.value },
      }
    case "SAVING":
      return {
        ...state,
        [action.field]: {
          ...state[action.field],
          status: "saving",
          attempt: action.attempt,
        },
      }
    case "SAVED":
      return {
        ...state,
        [action.field]: {
          ...state[action.field],
          status: "saved",
          attempt: 0,
          lastServerValue: action.serverValue,
        },
      }
    case "ERROR":
      return {
        ...state,
        [action.field]: {
          ...state[action.field],
          status: "error",
          attempt: action.attempt,
        },
      }
    case "RESET_SAVED":
      if (state[action.field].status !== "saved") return state
      return {
        ...state,
        [action.field]: { ...state[action.field], status: "idle" },
      }
    default:
      return state
  }
}

function normalizeValue(field: DochazkaField, raw: string): string | number | null {
  const v = raw.trim()
  if (v === "") return null
  if (field === "hodnoceni") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return v
}

export function DochazkaRow({
  prirazeniId,
  brigadnik,
  status,
  dochazka,
  dokumentacniStav,
  editor,
  onFieldFailed,
  onFieldRecovered,
  onRowChanged,
}: Props) {
  const [state, dispatch] = useReducer(reducer, dochazka, init)
  const debounceTimers = useRef<Record<DochazkaField, ReturnType<typeof setTimeout> | null>>({
    prichod: null,
    odchod: null,
    hodnoceni: null,
    poznamka: null,
  })
  const savedFadeTimers = useRef<Record<DochazkaField, ReturnType<typeof setTimeout> | null>>({
    prichod: null,
    odchod: null,
    hodnoceni: null,
    poznamka: null,
  })

  // Clean up timers on unmount
  useEffect(() => {
    const debounce = debounceTimers.current
    const saved = savedFadeTimers.current
    return () => {
      Object.values(debounce).forEach((t) => t && clearTimeout(t))
      Object.values(saved).forEach((t) => t && clearTimeout(t))
    }
  }, [])

  // User feedback 22.4.: sync state když se `dochazka` prop změní na
  // serveru (např. po re-login z sessionStorage, periodický refresh,
  // nebo po "nepřišel" vymazání časů). Sync jen pro pole která uživatel
  // nedrží rozpracovaná (value === lastServerValue && status idle).
  const prichodServer = dochazka?.prichod ? dochazka.prichod.slice(0, 5) : ""
  const odchodServer = dochazka?.odchod ? dochazka.odchod.slice(0, 5) : ""
  const hodnoceniServer = dochazka?.hodnoceni != null ? String(dochazka.hodnoceni) : ""
  const poznamkaServer = dochazka?.poznamka ?? ""
  useEffect(() => {
    const syncField = (field: DochazkaField, serverVal: string) => {
      const current = state[field]
      if (current.status !== "idle") return
      if (current.value !== current.lastServerValue) return
      if (current.value === serverVal) return
      dispatch({ type: "EDIT", field, value: serverVal })
      dispatch({ type: "SAVED", field, serverValue: serverVal })
    }
    syncField("prichod", prichodServer)
    syncField("odchod", odchodServer)
    syncField("hodnoceni", hodnoceniServer)
    syncField("poznamka", poznamkaServer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prichodServer, odchodServer, hodnoceniServer, poznamkaServer])

  const attemptSave = useCallback(
    async (field: DochazkaField, attempt: number) => {
      const fieldKey = `${prirazeniId}:${field}`
      dispatch({ type: "SAVING", field, attempt })
      const rawValue = state[field].value
      const value = normalizeValue(field, rawValue)
      try {
        const result = await upsertDochazkaField(prirazeniId, field, value, editor)
        if ("success" in result && result.success) {
          const sv =
            result.serverValue == null
              ? ""
              : typeof result.serverValue === "number"
                ? String(result.serverValue)
                : String(result.serverValue).slice(0, 5) // time HH:mm
          // For poznamka don't slice
          const serverStr =
            field === "poznamka"
              ? result.serverValue == null
                ? ""
                : String(result.serverValue)
              : sv
          dispatch({ type: "SAVED", field, serverValue: serverStr })
          onFieldRecovered?.(fieldKey)
          onRowChanged?.()
          // Fade saved back to idle after 1s
          if (savedFadeTimers.current[field]) {
            clearTimeout(savedFadeTimers.current[field]!)
          }
          savedFadeTimers.current[field] = setTimeout(() => {
            dispatch({ type: "RESET_SAVED", field })
          }, 1200)
          return
        }
        throw new Error(("error" in result && result.error) || "Chyba ukládání")
      } catch {
        // Retry with exp backoff
        if (attempt < 3) {
          const delay = 500 * Math.pow(2, attempt - 1) // 500, 1000, 2000
          setTimeout(() => {
            void attemptSave(field, attempt + 1)
          }, delay)
          // stays in 'saving' state with attempt badge
          dispatch({ type: "SAVING", field, attempt: attempt + 1 })
        } else {
          dispatch({ type: "ERROR", field, attempt })
          onFieldFailed?.(fieldKey)
        }
      }
    },
    [prirazeniId, editor, state, onFieldFailed, onFieldRecovered, onRowChanged],
  )

  const scheduleSave = useCallback(
    (field: DochazkaField) => {
      if (debounceTimers.current[field]) {
        clearTimeout(debounceTimers.current[field]!)
      }
      debounceTimers.current[field] = setTimeout(() => {
        void attemptSave(field, 1)
      }, 500)
    },
    [attemptSave],
  )

  const handleChange = (field: DochazkaField, value: string) => {
    dispatch({ type: "EDIT", field, value })
    scheduleSave(field)
  }

  const handleManualRetry = (field: DochazkaField) => {
    const fieldKey = `${prirazeniId}:${field}`
    onFieldRecovered?.(fieldKey)
    void attemptSave(field, 1)
  }

  const celeJmeno = `${brigadnik.prijmeni} ${brigadnik.jmeno}`.trim()
  const isVypadl = status === "vypadl"
  // User feedback 22.4.: tlačítko "Nepřišel" viditelné vždy pro non-vypadl
  // status. Koordinátor má právo opravit omylem zapsaný příchod — server
  // vymaže existující časy při přechodu na status=vypadl.
  const showNeprisel = !isVypadl

  return (
    <div
      className={`border-b px-3 py-3 sm:px-4 sm:py-3 ${
        isVypadl ? "bg-muted/40 opacity-70" : ""
      }`}
      data-prirazeni-id={prirazeniId}
    >
      {/* Row 1: badge + jméno + telefon.
          User feedback 22.4.: Dokumentační status (nevyplněné údaje /
          podepsaná DPP / ...) skrytý pro koordinátora — ten nemusí vědět
          kdo je OSVČ, kdo brigádník a v jakém stavu jsou DPP. */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {dokumentacniStav && editor.type === "admin" ? (
          <DokumentacniStavBadge stav={dokumentacniStav} />
        ) : null}
        <span className="font-semibold text-base">{celeJmeno}</span>
        {brigadnik.telefon ? (
          <a
            href={`tel:${brigadnik.telefon}`}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            aria-label={`Zavolat ${celeJmeno}`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>{brigadnik.telefon}</span>
          </a>
        ) : null}
        {isVypadl && (
          <span className="text-xs text-red-600 font-medium uppercase">Nepřišel</span>
        )}
      </div>

      {/* Row 2: 4 inputs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(["prichod", "odchod"] as const).map((f) => (
          <div key={f} className="space-y-1">
            <Label htmlFor={`${f}-${prirazeniId}`} className="text-xs">
              {f === "prichod" ? "Příchod" : "Odchod"}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id={`${f}-${prirazeniId}`}
                type="time"
                value={state[f].value}
                disabled={isVypadl}
                onChange={(e) => handleChange(f, e.target.value)}
                className="h-12 text-base flex-1"
              />
              <FieldStatusIndicator
                status={state[f].status}
                attempt={state[f].attempt}
                onManualRetry={() => handleManualRetry(f)}
                ariaLabel={`Stav ukládání ${f === "prichod" ? "příchodu" : "odchodu"}`}
              />
            </div>
          </div>
        ))}

        <div className="space-y-1">
          <Label htmlFor={`hodnoceni-${prirazeniId}`} className="text-xs">
            Hodnocení 1–5
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id={`hodnoceni-${prirazeniId}`}
              type="number"
              min={1}
              max={5}
              inputMode="numeric"
              value={state.hodnoceni.value}
              disabled={isVypadl}
              onChange={(e) => handleChange("hodnoceni", e.target.value)}
              className="h-12 text-base flex-1"
            />
            <FieldStatusIndicator
              status={state.hodnoceni.status}
              attempt={state.hodnoceni.attempt}
              onManualRetry={() => handleManualRetry("hodnoceni")}
              ariaLabel="Stav ukládání hodnocení"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`poznamka-${prirazeniId}`} className="text-xs">
            Poznámka
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id={`poznamka-${prirazeniId}`}
              type="text"
              maxLength={500}
              value={state.poznamka.value}
              disabled={isVypadl}
              onChange={(e) => handleChange("poznamka", e.target.value)}
              className="h-12 text-base flex-1"
            />
            <FieldStatusIndicator
              status={state.poznamka.status}
              attempt={state.poznamka.attempt}
              onManualRetry={() => handleManualRetry("poznamka")}
              ariaLabel="Stav ukládání poznámky"
            />
          </div>
        </div>
      </div>

      {/* Row 3: conditional action buttons */}
      {(showNeprisel || isVypadl) && (
        <div className="mt-2 flex">
          {showNeprisel && (
            <NepriselButton
              prirazeniId={prirazeniId}
              brigadnikName={celeJmeno}
              editor={editor}
              onDone={onRowChanged}
            />
          )}
          {isVypadl && (
            <UndoNepriselButton
              prirazeniId={prirazeniId}
              brigadnikName={celeJmeno}
              editor={editor}
              onDone={onRowChanged}
            />
          )}
        </div>
      )}
    </div>
  )
}
