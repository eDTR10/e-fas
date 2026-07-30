import { useState } from 'react'
import { X, FileSpreadsheet } from 'lucide-react'
import type { RadaiEntry } from '../types'
import { generateRadaiReport } from '../reportGenerator'
import { loadReportDefaults, saveReportDefaults } from '../../settings/tabs/ReportDefaultsTab'

interface Props {
    entries: RadaiEntry[]
    onClose: () => void
}

const inp = 'w-full rounded-lg border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition'
const labelCls = 'text-xs font-gmedium text-muted-foreground mb-1'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs font-gsemibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">{title}</p>
            {children}
        </div>
    )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <div className="flex flex-col">
            <label className={labelCls}>{label}</label>
            <input className={inp} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        </div>
    )
}

export default function GenerateReportDialog({ entries, onClose }: Props) {
    const d = loadReportDefaults()

    const [entityName, setEntityName] = useState(d.entity_name)
    const [regularFundCluster, setRegularFundCluster] = useState(d.regular_fund_cluster)
    const [regularBankName, setRegularBankName] = useState(d.regular_bank_name)
    const [specialFundCluster, setSpecialFundCluster] = useState(d.special_fund_cluster)
    const [specialBankName, setSpecialBankName] = useState(d.special_bank_name)
    const [preparedByName, setPreparedByName] = useState(d.prepared_by_name)
    const [preparedByPosition, setPreparedByPosition] = useState(d.prepared_by_position)
    const [certifiedByName, setCertifiedByName] = useState(d.certified_by_name)
    const [certifiedByPosition, setCertifiedByPosition] = useState(d.certified_by_position)
    const [reportNo, setReportNo] = useState('')
    const [sheetNo, setSheetNo] = useState('')
    const [adaFrom, setAdaFrom] = useState('')
    const [adaTo, setAdaTo] = useState('')
    const [loading, setLoading] = useState(false)

    const hasRegular = entries.some(e => (e.mds_type ?? 'regular') === 'regular')
    const hasSpecial = entries.some(e => e.mds_type === 'special')

    const handleGenerate = async () => {
        setLoading(true)

        // Persist the updated defaults for next time
        const existing = loadReportDefaults()
        saveReportDefaults({
            ...existing,
            entity_name: entityName,
            regular_fund_cluster: regularFundCluster,
            regular_bank_name: regularBankName,
            special_fund_cluster: specialFundCluster,
            special_bank_name: specialBankName,
            prepared_by_name: preparedByName,
            prepared_by_position: preparedByPosition,
            certified_by_name: certifiedByName,
            certified_by_position: certifiedByPosition,
        })

        // Merge report-level values into each entry before generating
        const merged = entries.map(e => {
            const isRegular = (e.mds_type ?? 'regular') === 'regular'
            return {
                ...e,
                entity_name: entityName,
                fund_cluster: isRegular ? regularFundCluster : specialFundCluster,
                bank_name_account_no: isRegular ? regularBankName : specialBankName,
                prepared_by_name: preparedByName,
                prepared_by_position: preparedByPosition,
                certified_by_name: certifiedByName,
                certified_by_position: certifiedByPosition,
                report_no: reportNo.trim() || e.report_no,
                sheet_no: sheetNo.trim() || e.sheet_no,
                ada_nos_from: adaFrom.trim() || e.ada_nos_from,
                ada_nos_to: adaTo.trim() || e.ada_nos_to,
            }
        })

        await generateRadaiReport(merged, merged[0]?.period_covered || '')
        setLoading(false)
        onClose()
    }

    const periodLabel = entries[0]?.period_covered || ''

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">

                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet size={18} className="text-primary" />
                        <h2 className="font-gbold text-foreground text-lg">Generate Report</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition"><X size={18} /></button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
                    {periodLabel && (
                        <p className="text-xs text-muted-foreground">
                            Period: <span className="font-gmedium text-foreground">{periodLabel}</span>
                            {' · '}{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
                        </p>
                    )}

                    <Section title="Report Details">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Report No." value={reportNo} onChange={setReportNo} />
                            <Field label="Sheet No." value={sheetNo} onChange={setSheetNo} />
                            <Field label="ADA Nos. From" value={adaFrom} onChange={setAdaFrom} placeholder="e.g. 101-10-193-2025" />
                            <Field label="ADA Nos. To" value={adaTo} onChange={setAdaTo} placeholder="e.g. 101-10-217-2025" />
                        </div>
                    </Section>

                    <Section title="Entity">
                        <Field label="Entity Name" value={entityName} onChange={setEntityName} />
                    </Section>

                    {hasRegular && (
                        <Section title="MDS Regular">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Fund Cluster" value={regularFundCluster} onChange={setRegularFundCluster} />
                                <Field label="Bank Name / Account No." value={regularBankName} onChange={setRegularBankName} />
                            </div>
                        </Section>
                    )}

                    {hasSpecial && (
                        <Section title="MT Special">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Fund Cluster" value={specialFundCluster} onChange={setSpecialFundCluster} />
                                <Field label="Bank Name / Account No." value={specialBankName} onChange={setSpecialBankName} />
                            </div>
                        </Section>
                    )}

                    <Section title="Signatories">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Prepared By (Name)" value={preparedByName} onChange={setPreparedByName} />
                            <Field label="Position" value={preparedByPosition} onChange={setPreparedByPosition} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Certified By (Name)" value={certifiedByName} onChange={setCertifiedByName} />
                            <Field label="Position / Title" value={certifiedByPosition} onChange={setCertifiedByPosition} />
                        </div>
                    </Section>

                    <p className="text-xs text-muted-foreground">
                        These values will be saved as your defaults for next time.
                    </p>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-border text-sm font-gmedium hover:bg-muted transition">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-gmedium hover:bg-primary/90 transition disabled:opacity-60"
                    >
                        <FileSpreadsheet size={15} />
                        {loading ? 'Generating…' : 'Generate'}
                    </button>
                </div>
            </div>
        </div>
    )
}
