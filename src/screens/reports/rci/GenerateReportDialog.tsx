import { useState } from 'react'
import { X, FileSpreadsheet } from 'lucide-react'
import type { RciEntry } from '../types'
import { loadReportDefaults, saveReportDefaults } from '../../settings/tabs/ReportDefaultsTab'
import { generateRciReport } from '../reportGenerator'

interface Props {
    entries: RciEntry[]
    onClose: () => void
}

export default function GenerateReportDialog({ entries, onClose }: Props) {
    const d = loadReportDefaults()

    const hasRegular = entries.some(e => (e.mds_type ?? 'regular') === 'regular')
    const hasSpecial  = entries.some(e => e.mds_type === 'special')
    const hasTf       = entries.some(e => e.mds_type === 'tf')

    const period = entries[0]?.period_covered || ''

    const [entityName, setEntityName]               = useState(d.entity_name)
    const [regularFundCluster, setRegularFundCluster] = useState(d.regular_fund_cluster)
    const [regularBankName, setRegularBankName]       = useState(d.regular_bank_name)
    const [specialFundCluster, setSpecialFundCluster] = useState(d.special_fund_cluster)
    const [specialBankName, setSpecialBankName]       = useState(d.special_bank_name)
    const [tfFundCluster, setTfFundCluster]           = useState(d.tf_fund_cluster)
    const [tfBankName, setTfBankName]                 = useState(d.tf_bank_name)
    const [preparedByName, setPreparedByName]         = useState(d.prepared_by_name)
    const [preparedByPosition, setPreparedByPosition] = useState(d.prepared_by_position)
    const [certifiedByName, setCertifiedByName]       = useState(d.certified_by_name)
    const [certifiedByPosition, setCertifiedByPosition] = useState(d.certified_by_position)
    const [reportNo, setReportNo]     = useState('')
    const [sheetNo, setSheetNo]       = useState('')
    const [checkFrom, setCheckFrom]   = useState('')
    const [checkTo, setCheckTo]       = useState('')
    const [loading, setLoading]       = useState(false)

    const handleGenerate = async () => {
        setLoading(true)
        saveReportDefaults({
            entity_name: entityName,
            regular_fund_cluster: regularFundCluster,
            regular_bank_name: regularBankName,
            special_fund_cluster: specialFundCluster,
            special_bank_name: specialBankName,
            tf_fund_cluster: tfFundCluster,
            tf_bank_name: tfBankName,
            prepared_by_name: preparedByName,
            prepared_by_position: preparedByPosition,
            certified_by_name: certifiedByName,
            certified_by_position: certifiedByPosition,
        })
        const merged = entries.map(e => {
            const isRegular = (e.mds_type ?? 'regular') === 'regular'
            const isSpecial = e.mds_type === 'special'
            return {
                ...e,
                entity_name: entityName,
                fund_cluster: isRegular ? regularFundCluster : isSpecial ? specialFundCluster : tfFundCluster,
                bank_name_account_no: isRegular ? regularBankName : isSpecial ? specialBankName : tfBankName,
                prepared_by_name: preparedByName,
                prepared_by_position: preparedByPosition,
                certified_by_name: certifiedByName,
                certified_by_position: certifiedByPosition,
                report_no: reportNo.trim() || e.report_no,
                sheet_no: sheetNo.trim() || e.sheet_no,
                check_nos_from: checkFrom.trim() || e.check_nos_from,
                check_nos_to: checkTo.trim() || e.check_nos_to,
            }
        })
        await generateRciReport(merged, period)
        setLoading(false)
        onClose()
    }

    const inp = 'w-full rounded-lg border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition'
    const lbl = 'text-xs font-gmedium text-muted-foreground mb-1 block'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet size={18} className="text-primary" />
                        <h2 className="font-gbold text-foreground text-lg">Generate RCI Report</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition"><X size={18} /></button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
                    {period && (
                        <p className="text-xs text-muted-foreground">
                            Generating for <span className="font-gsemibold text-foreground">{period}</span> — {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
                            {hasRegular && ` · ${entries.filter(e => (e.mds_type ?? 'regular') === 'regular').length} Regular`}
                            {hasSpecial  && ` · ${entries.filter(e => e.mds_type === 'special').length} Special`}
                            {hasTf       && ` · ${entries.filter(e => e.mds_type === 'tf').length} TF`}
                        </p>
                    )}

                    <Section title="Report Details">
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Report No." value={reportNo} onChange={setReportNo} inp={inp} lbl={lbl} placeholder="Leave blank to keep per-entry value" />
                            <Field label="Sheet No." value={sheetNo} onChange={setSheetNo} inp={inp} lbl={lbl} placeholder="Leave blank to keep per-entry value" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Check Nos. From" value={checkFrom} onChange={setCheckFrom} inp={inp} lbl={lbl} placeholder="e.g. 1810022" />
                            <Field label="Check Nos. To" value={checkTo} onChange={setCheckTo} inp={inp} lbl={lbl} placeholder="e.g. 18110023" />
                        </div>
                    </Section>

                    <Section title="Entity">
                        <Field label="Entity Name" value={entityName} onChange={setEntityName} inp={inp} lbl={lbl} />
                    </Section>

                    {hasRegular && (
                        <Section title="MDS Regular">
                            <Field label="Fund Cluster" value={regularFundCluster} onChange={setRegularFundCluster} inp={inp} lbl={lbl} />
                            <Field label="Bank Name / Account No." value={regularBankName} onChange={setRegularBankName} inp={inp} lbl={lbl} />
                        </Section>
                    )}
                    {hasSpecial && (
                        <Section title="MT Special">
                            <Field label="Fund Cluster" value={specialFundCluster} onChange={setSpecialFundCluster} inp={inp} lbl={lbl} />
                            <Field label="Bank Name / Account No." value={specialBankName} onChange={setSpecialBankName} inp={inp} lbl={lbl} />
                        </Section>
                    )}
                    {hasTf && (
                        <Section title="TF Checks">
                            <Field label="Fund Cluster" value={tfFundCluster} onChange={setTfFundCluster} inp={inp} lbl={lbl} />
                            <Field label="Bank Name / Account No." value={tfBankName} onChange={setTfBankName} inp={inp} lbl={lbl} />
                        </Section>
                    )}

                    <Section title="Signatories">
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Prepared By (Name)" value={preparedByName} onChange={setPreparedByName} inp={inp} lbl={lbl} />
                            <Field label="Position" value={preparedByPosition} onChange={setPreparedByPosition} inp={inp} lbl={lbl} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Certified By (Name)" value={certifiedByName} onChange={setCertifiedByName} inp={inp} lbl={lbl} />
                            <Field label="Position / Title" value={certifiedByPosition} onChange={setCertifiedByPosition} inp={inp} lbl={lbl} />
                        </div>
                    </Section>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-gmedium hover:bg-muted transition">Cancel</button>
                    <button type="button" onClick={handleGenerate} disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-gmedium hover:bg-primary/90 transition disabled:opacity-60">
                        <FileSpreadsheet size={15} /> {loading ? 'Generating…' : 'Generate & Download'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs font-gsemibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">{title}</p>
            {children}
        </div>
    )
}

function Field({ label, value, onChange, inp, lbl, placeholder }: {
    label: string; value: string; onChange: (v: string) => void; inp: string; lbl: string; placeholder?: string
}) {
    return (
        <div className="flex flex-col">
            <label className={lbl}>{label}</label>
            <input className={inp} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        </div>
    )
}
