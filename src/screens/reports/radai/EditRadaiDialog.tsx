import { useState } from 'react'
import { X } from 'lucide-react'
import type { RadaiEntry } from '../types'
import { loadReportDefaults } from '../../settings/tabs/ReportDefaultsTab'

interface Props {
    entry: RadaiEntry
    onClose: () => void
    onSave: (entry: RadaiEntry) => void
}

const inp = 'w-full rounded-lg border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition'
const labelCls = 'text-xs font-gmedium text-muted-foreground mb-1'

export default function EditRadaiDialog({ entry, onClose, onSave }: Props) {
    const [form, setForm] = useState<RadaiEntry>({ ...entry })
    const [error, setError] = useState('')

    const set = (k: keyof RadaiEntry, v: string) => setForm(p => ({ ...p, [k]: v }))

    const handleTypeChange = (t: 'regular' | 'special') => {
        const d = loadReportDefaults()
        setForm(p => ({
            ...p,
            mds_type: t,
            fund_cluster: t === 'regular' ? d.regular_fund_cluster : d.special_fund_cluster,
            bank_name_account_no: t === 'regular' ? d.regular_bank_name : d.special_bank_name,
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const hasValidAmt = String(form.amount).split('\n').some(l => !isNaN(parseFloat(l.trim().replace(/,/g, ''))) )
        if (!form.date || !form.serial_no || !form.payee || !form.amount || !hasValidAmt) {
            setError('Date, Serial No., Payee, and a valid Amount are required.')
            return
        }
        onSave(form)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <h2 className="font-gbold text-foreground text-lg">Edit RADAI Entry</h2>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition"><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
                    {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md px-4 py-2">{error}</div>}

                    {/* MDS Type */}
                    <div className="flex flex-col gap-1.5">
                        <span className={labelCls}>Report Type *</span>
                        <div className="flex gap-3">
                            {(['regular', 'special'] as const).map(t => (
                                <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="radio" name="mds_type_edit" value={t}
                                        checked={(form.mds_type ?? 'regular') === t}
                                        onChange={() => handleTypeChange(t)} className="accent-primary" />
                                    <span className="text-sm font-gmedium text-foreground">
                                        {t === 'regular' ? 'MDS Regular' : 'MT Special'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs font-gsemibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">Report Header</p>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Entity Name" value={form.entity_name} onChange={v => set('entity_name', v)} />
                        <Field label="Fund Cluster" value={form.fund_cluster} onChange={v => set('fund_cluster', v)} />
                    </div>
                    <Field label="Bank Name / Account No." value={form.bank_name_account_no} onChange={v => set('bank_name_account_no', v)} />
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Report No." value={form.report_no} onChange={v => set('report_no', v)} />
                        <Field label="Sheet No." value={form.sheet_no} onChange={v => set('sheet_no', v)} />
                    </div>

                    <p className="text-xs font-gsemibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1 mt-1">Transaction Details</p>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Date *" value={form.date} onChange={v => set('date', v)} type="date" />
                        <Field label="Serial No. *" value={form.serial_no} onChange={v => set('serial_no', v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="DV / Payroll No." value={form.dv_payroll_no} onChange={v => set('dv_payroll_no', v)} />
                        <Field label="ORS / BURS No." value={form.ors_burs_no} onChange={v => set('ors_burs_no', v)} textarea rows={2} placeholder="One entry per line" />
                    </div>
                    <Field label="Responsibility Center Code" value={form.responsibility_center_code} onChange={v => set('responsibility_center_code', v)} />
                    <Field label="Payee *" value={form.payee} onChange={v => set('payee', v)} />
                    <Field label="UACS Object Code" value={form.uacs_object_code} onChange={v => set('uacs_object_code', v)} textarea rows={2} placeholder="One code per line, e.g. 5-01-02-110-04" />
                    <Field label="Nature of Payment" value={form.nature_of_payment} onChange={v => set('nature_of_payment', v)} textarea />
                    <Field label="Amount *" value={String(form.amount)} onChange={v => set('amount', v)} textarea rows={2} placeholder="One amount per line, e.g. 399629.69" />

                    <p className="text-xs font-gsemibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1 mt-1">Signatories</p>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Prepared By (Name)" value={form.prepared_by_name} onChange={v => set('prepared_by_name', v)} />
                        <Field label="Position" value={form.prepared_by_position} onChange={v => set('prepared_by_position', v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Certified By (Name)" value={form.certified_by_name} onChange={v => set('certified_by_name', v)} />
                        <Field label="Position / Title" value={form.certified_by_position} onChange={v => set('certified_by_position', v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="ADA Nos. From" value={form.ada_nos_from} onChange={v => set('ada_nos_from', v)} />
                        <Field label="ADA Nos. To" value={form.ada_nos_to} onChange={v => set('ada_nos_to', v)} />
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t border-border mt-2 shrink-0">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-gmedium hover:bg-muted transition">Cancel</button>
                        <button type="submit" className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-gmedium hover:bg-primary/90 transition">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function Field({
    label, value, onChange, placeholder, type = 'text', textarea, rows = 3,
}: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; textarea?: boolean; rows?: number
}) {
    return (
        <div className="flex flex-col">
            <label className={labelCls}>{label}</label>
            {textarea
                ? <textarea className={inp + ' resize-none'} rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
                : <input className={inp} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
            }
        </div>
    )
}
