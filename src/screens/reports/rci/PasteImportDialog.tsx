import { useState, useCallback } from 'react'
import { X, ClipboardPaste, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { RciEntry } from '../types'
import { loadReportDefaults } from '../../settings/tabs/ReportDefaultsTab'

interface Props {
    onClose: () => void
    onImport: (entries: Omit<RciEntry, 'id'>[]) => void
}

interface ParsedRow {
    date: string
    serial_no: string
    dv_payroll_no: string
    ors_burs_no: string
    responsibility_center_code: string
    payee: string
    uacs_object_code: string
    nature_of_payment: string
    amount: string
    error?: string
}

function parseExcelTsv(raw: string): string[][] {
    const rows: string[][] = []
    let i = 0
    while (i <= raw.length) {
        const row: string[] = []
        while (i <= raw.length) {
            let cell = ''
            if (raw[i] === '"') {
                i++
                while (i < raw.length) {
                    if (raw[i] === '"') {
                        if (raw[i + 1] === '"') { cell += '"'; i += 2 }
                        else { i++; break }
                    } else { cell += raw[i++] }
                }
            } else {
                while (i < raw.length && raw[i] !== '\t' && raw[i] !== '\n' && raw[i] !== '\r') {
                    cell += raw[i++]
                }
            }
            row.push(cell)
            if (i >= raw.length || raw[i] === '\n' || raw[i] === '\r') break
            i++
        }
        if (raw[i] === '\r') i++
        if (raw[i] === '\n') i++
        else i++
        if (row.some(c => c.trim())) rows.push(row)
    }
    return rows
}

function parseAmountCell(raw: string): string {
    const lines = raw.split('\n').map(l => l.trim().replace(/,/g, '')).filter(Boolean)
    return lines.map(l => { const n = parseFloat(l); return isNaN(n) ? '' : String(n) }).filter(Boolean).join('\n')
}

function parseTsv(raw: string): ParsedRow[] {
    const grid = parseExcelTsv(raw)
    const result: ParsedRow[] = []

    for (let i = 0; i < grid.length; i++) {
        const cols = grid[i]
        const rawDate  = cols[0]?.trim() ?? ''
        const serialNo = cols[1]?.trim() ?? ''
        const contOrs  = cols[3]?.trim() ?? ''
        const contUacs = cols[6]?.trim() ?? ''
        const contAmt  = cols[8]?.trim() ?? ''

        if (!serialNo && result.length > 0 && (contUacs || contAmt || contOrs)) {
            const prev = result[result.length - 1]
            if (contOrs)  prev.ors_burs_no     = prev.ors_burs_no     ? prev.ors_burs_no     + '\n' + contOrs  : contOrs
            if (contUacs) prev.uacs_object_code = prev.uacs_object_code ? prev.uacs_object_code + '\n' + contUacs : contUacs
            if (contAmt) {
                const parsed = parseAmountCell(contAmt)
                if (parsed) prev.amount = prev.amount ? prev.amount + '\n' + parsed : parsed
            }
            continue
        }

        if (cols.length < 2) {
            result.push({ date: '', serial_no: '', dv_payroll_no: '', ors_burs_no: '', responsibility_center_code: '', payee: '', uacs_object_code: '', nature_of_payment: '', amount: '', error: `Row ${i + 1}: not enough columns` })
            continue
        }

        const isoDate = parseDate(rawDate)
        const rawAmount = (contAmt || cols[8]?.trim()) ?? ''
        const parsedAmount = parseAmountCell(rawAmount)
        const errors: string[] = []
        if (!isoDate) errors.push(`unrecognized date${rawDate ? ` ("${rawDate}")` : ''}`)
        if (rawAmount && !parsedAmount) errors.push('invalid amount')

        result.push({
            date: isoDate,
            serial_no: serialNo,
            dv_payroll_no: cols[2]?.trim() ?? '',
            ors_burs_no: cols[3]?.trim() ?? '',
            responsibility_center_code: cols[4]?.trim() ?? '',
            payee: cols[5]?.trim() ?? '',
            uacs_object_code: contUacs,
            nature_of_payment: cols[7]?.trim() ?? '',
            amount: parsedAmount,
            error: errors.length ? `Row ${i + 1}: ${errors.join(', ')}` : undefined,
        })
    }
    return result
}

function parseDate(raw: string): string {
    if (!raw) return ''
    const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    return ''
}

function fmtDate(iso: string) {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${m}/${d}/${y}`
}

const RCI_TYPES: ['regular' | 'special' | 'tf', string][] = [
    ['regular', 'RCI-MDS REGULAR'],
    ['special', 'RCI-MT SPECIAL'],
    ['tf',      'RCI-TF CHECKS'],
]

export default function PasteImportDialog({ onClose, onImport }: Props) {
    const [mds_type, setMdsType] = useState<'regular' | 'special' | 'tf'>('regular')
    const [raw, setRaw] = useState('')
    const [rows, setRows] = useState<ParsedRow[]>([])
    const [error, setError] = useState('')

    const handlePaste = useCallback((text: string) => {
        setRaw(text)
        setRows(text.trim() ? parseTsv(text) : [])
    }, [])

    const validRows = rows.filter(r => !r.error)
    const errorRows = rows.filter(r => r.error)

    const handleImport = () => {
        if (validRows.length === 0) { setError('No valid rows to import.'); return }
        setError('')
        const d = loadReportDefaults()
        const fundCluster = mds_type === 'regular' ? d.regular_fund_cluster : mds_type === 'special' ? d.special_fund_cluster : d.tf_fund_cluster
        const bankName    = mds_type === 'regular' ? d.regular_bank_name    : mds_type === 'special' ? d.special_bank_name    : d.tf_bank_name
        const base = {
            mds_type,
            period_covered: '',
            entity_name: d.entity_name,
            fund_cluster: fundCluster,
            bank_name_account_no: bankName,
            report_no: '',
            sheet_no: '',
            prepared_by_name: d.prepared_by_name,
            prepared_by_position: d.prepared_by_position,
            certified_by_name: d.certified_by_name,
            certified_by_position: d.certified_by_position,
            check_nos_from: '',
            check_nos_to: '',
        }
        onImport(validRows.map(r => ({ ...base, ...r, error: undefined })))
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                        <ClipboardPaste size={18} className="text-primary" />
                        <h2 className="font-gbold text-foreground text-lg">Paste Import</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition"><X size={18} /></button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
                    {error && (
                        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md px-4 py-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <div className="flex gap-2">
                        {RCI_TYPES.map(([val, label]) => (
                            <button key={val} type="button" onClick={() => setMdsType(val)}
                                className={`px-4 py-2 rounded-lg text-sm font-gmedium border transition ${mds_type === val ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-2">
                            Select and copy rows from the RCI table in Excel, then paste below.
                            Columns: <span className="font-gmedium text-foreground">Date → Serial No. → DV/Payroll No. → ORS/BURS No. → RC Code → Payee → UACS Code → Nature of Payment → Amount</span>
                        </p>
                        <textarea
                            className="w-full rounded-lg border border-border bg-background text-foreground text-xs font-mono px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition resize-none"
                            rows={6}
                            value={raw}
                            onChange={e => handlePaste(e.target.value)}
                            onPaste={e => { e.preventDefault(); handlePaste(e.clipboardData.getData('text/plain')) }}
                            placeholder="Paste copied rows here…"
                            spellCheck={false}
                        />
                    </div>

                    {rows.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between border-b border-border pb-1 mb-3">
                                <p className="text-xs font-gsemibold text-muted-foreground uppercase tracking-wide">Preview</p>
                                <div className="flex items-center gap-3 text-xs">
                                    {validRows.length > 0 && <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-gmedium"><CheckCircle2 size={12} /> {validRows.length} valid</span>}
                                    {errorRows.length > 0 && <span className="flex items-center gap-1 text-destructive font-gmedium"><AlertCircle size={12} /> {errorRows.length} skipped</span>}
                                </div>
                            </div>
                            {errorRows.map((r, i) => <p key={i} className="text-xs text-destructive mb-1">{r.error}</p>)}
                            {validRows.length > 0 && (
                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <table className="w-full text-xs min-w-[900px]">
                                        <thead>
                                            <tr className="bg-muted/60 text-left">
                                                {['Date','Serial No.','DV/Payroll No.','ORS/BURS No.','RC Code','Payee','UACS Code','Nature of Payment','Amount'].map(h => (
                                                    <th key={h} className="px-3 py-2 font-gsemibold text-muted-foreground whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {validRows.map((r, i) => (
                                                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                                                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{r.serial_no || '—'}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{r.dv_payroll_no || '—'}</td>
                                                    <td className="px-3 py-2"><MultiLine value={r.ors_burs_no} /></td>
                                                    <td className="px-3 py-2">{r.responsibility_center_code || '—'}</td>
                                                    <td className="px-3 py-2 max-w-[140px]"><span className="line-clamp-2" title={r.payee}>{r.payee || '—'}</span></td>
                                                    <td className="px-3 py-2 font-mono"><MultiLine value={r.uacs_object_code} /></td>
                                                    <td className="px-3 py-2 max-w-[180px]"><span className="line-clamp-2" title={r.nature_of_payment}>{r.nature_of_payment || '—'}</span></td>
                                                    <td className="px-3 py-2 text-right font-gmedium"><AmountLines value={r.amount} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-gmedium hover:bg-muted transition">Cancel</button>
                    <button type="button" onClick={handleImport} disabled={validRows.length === 0}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-gmedium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
                        <ClipboardPaste size={15} />
                        Import {validRows.length > 0 ? `${validRows.length} row${validRows.length > 1 ? 's' : ''}` : ''}
                    </button>
                </div>
            </div>
        </div>
    )
}

function MultiLine({ value }: { value: string }) {
    if (!value) return <span className="text-muted-foreground">—</span>
    const lines = value.split('\n').filter(Boolean)
    if (lines.length <= 1) return <span>{value}</span>
    return <div className="flex flex-col gap-0.5">{lines.map((l, i) => <span key={i}>{l}</span>)}</div>
}

function AmountLines({ value }: { value: string }) {
    if (!value) return <span className="text-muted-foreground">—</span>
    const lines = value.split('\n').filter(Boolean)
    const fmt = (v: string) => parseFloat(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (lines.length <= 1) return <span className="whitespace-nowrap">{lines[0] ? fmt(lines[0]) : '—'}</span>
    return <div className="flex flex-col gap-0.5 items-end">{lines.map((l, i) => <span key={i} className="whitespace-nowrap">{fmt(l)}</span>)}</div>
}
