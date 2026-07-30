import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Search, X, FileSpreadsheet, ClipboardPaste, Archive, ArchiveRestore, ChevronLeft, ChevronRight } from 'lucide-react'
import type { RadaiEntry } from '../types'
import AddRadaiDialog from './AddRadaiDialog'
import EditRadaiDialog from './EditRadaiDialog'
import PasteImportDialog from './PasteImportDialog'
import GenerateReportDialog from './GenerateReportDialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' }) }
    catch { return d }
}

function derivePeriod(isoDate: string): string {
    if (!isoDate) return ''
    const [y, m] = isoDate.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const monthName = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' })
    return `${monthName} 1-${lastDay}, ${y}`
}

function fmtPHP(val: string | number | null) {
    if (val === null || val === undefined || val === '') return '—'
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''))
    if (isNaN(n)) return '—'
    return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STORAGE_KEY = 'efas_radai_entries'

function loadEntries(): RadaiEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch { return [] }
}

function saveEntries(entries: RadaiEntry[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

let _nextId = (() => {
    const entries = loadEntries()
    return entries.length ? Math.max(...entries.map(e => e.id)) + 1 : 1
})()

function nextId() { return _nextId++ }

const inpSm = 'rounded-lg border border-border bg-background text-foreground text-xs font-gmedium px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary transition'

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RADAIContainer() {
    const [entries, setEntries] = useState<RadaiEntry[]>(loadEntries)
    const [search, setSearch] = useState('')
    const [filterMonth, setFilterMonth] = useState('')
    const [filterType, setFilterType] = useState<'' | 'regular' | 'special'>('')
    const [showArchived, setShowArchived] = useState(false)
    const [selected, setSelected] = useState<Set<number>>(new Set())
    const [showAdd, setShowAdd] = useState(false)
    const [showPaste, setShowPaste] = useState(false)
    const [showGenerate, setShowGenerate] = useState(false)
    const [editTarget, setEditTarget] = useState<RadaiEntry | null>(null)
    const [viewEntry, setViewEntry] = useState<RadaiEntry | null>(null)
    const [panelWidth, setPanelWidth] = useState(380)

    const tableRef = useRef<HTMLDivElement>(null)
    const isDragging = useRef(false)
    const dragStartX = useRef(0)
    const scrollStartX = useRef(0)
    const isResizing = useRef(false)
    const resizeStartX = useRef(0)
    const resizeStartW = useRef(0)

    // Panel resize handlers
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizing.current) return
            const delta = resizeStartX.current - e.clientX
            setPanelWidth(Math.max(300, Math.min(600, resizeStartW.current + delta)))
        }
        const onUp = () => { isResizing.current = false }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    }, [])

    const onDragStart = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
        isDragging.current = true
        dragStartX.current = e.clientX
        scrollStartX.current = tableRef.current?.scrollLeft ?? 0
    }
    const onDragMove = (e: React.MouseEvent) => {
        if (!isDragging.current || !tableRef.current) return
        tableRef.current.scrollLeft = scrollStartX.current - (e.clientX - dragStartX.current)
    }
    const onDragEnd = () => { isDragging.current = false }

    const persist = (updated: RadaiEntry[]) => { setEntries(updated); saveEntries(updated) }

    const handleAdd = (e: RadaiEntry) => {
        persist([...entries, { ...e, period_covered: derivePeriod(e.date), id: nextId() }])
        setShowAdd(false)
    }

    const handlePasteImport = (newEntries: Omit<RadaiEntry, 'id'>[]) => {
        const withIds = newEntries.map(e => ({ ...e, period_covered: derivePeriod(e.date), id: nextId() }))
        persist([...entries, ...withIds])
        setShowPaste(false)
    }

    const handleEdit = (updated: RadaiEntry) => {
        const withPeriod = { ...updated, period_covered: derivePeriod(updated.date) }
        persist(entries.map(e => e.id === updated.id ? withPeriod : e))
        setEditTarget(null)
        if (viewEntry?.id === updated.id) setViewEntry(withPeriod)
    }

    const handleDelete = (id: number) => {
        if (!window.confirm('Delete this RADAI entry?')) return
        persist(entries.filter(e => e.id !== id))
        setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
        if (viewEntry?.id === id) setViewEntry(null)
    }

    // ─── Bulk actions ──────────────────────────────────────────────────────────

    const handleBulkDelete = () => {
        if (!window.confirm(`Permanently delete ${effectiveSelected.size} selected entr${effectiveSelected.size === 1 ? 'y' : 'ies'}?`)) return
        persist(entries.filter(e => !effectiveSelected.has(e.id)))
        if (viewEntry && effectiveSelected.has(viewEntry.id)) setViewEntry(null)
        setSelected(new Set())
    }

    const handleBulkArchive = () => {
        if (!window.confirm(`Archive ${effectiveSelected.size} selected entr${effectiveSelected.size === 1 ? 'y' : 'ies'}?`)) return
        persist(entries.map(e => effectiveSelected.has(e.id) ? { ...e, archived: true } : e))
        setSelected(new Set())
    }

    const handleBulkRestore = () => {
        persist(entries.map(e => effectiveSelected.has(e.id) ? { ...e, archived: false } : e))
        setSelected(new Set())
    }

    // ─── Filter & derived ──────────────────────────────────────────────────────

    const periods = [...new Set(entries.filter(e => !e.archived).map(e => e.date?.slice(0, 7)).filter(Boolean))].sort()

    const q = search.toLowerCase()
    const filtered = entries.filter(e => {
        if (!showArchived && e.archived) return false
        if (showArchived && !e.archived) return false
        if (filterMonth && e.date?.slice(0, 7) !== filterMonth) return false
        if (filterType && (e.mds_type ?? 'regular') !== filterType) return false
        if (q && !(
            e.serial_no.toLowerCase().includes(q) ||
            e.dv_payroll_no.toLowerCase().includes(q) ||
            e.payee.toLowerCase().includes(q) ||
            e.nature_of_payment.toLowerCase().includes(q) ||
            e.uacs_object_code.toLowerCase().includes(q)
        )) return false
        return true
    })

    const toAmt = (e: RadaiEntry) =>
        String(e.amount).split('\n')
            .map(l => parseFloat(l.trim().replace(/,/g, '')) || 0)
            .reduce((s, n) => s + n, 0)

    const total = filtered.reduce((s, e) => s + toAmt(e), 0)
    const regularEntries = filtered.filter(e => (e.mds_type ?? 'regular') === 'regular')
    const specialEntries = filtered.filter(e => e.mds_type === 'special')
    const regularTotal = regularEntries.reduce((s, e) => s + toAmt(e), 0)
    const specialTotal = specialEntries.reduce((s, e) => s + toAmt(e), 0)

    const filteredIds = new Set(filtered.map(e => e.id))
    const effectiveSelected = new Set([...selected].filter(id => filteredIds.has(id)))
    const allSelected = filtered.length > 0 && effectiveSelected.size === filtered.length
    const someSelected = effectiveSelected.size > 0 && !allSelected

    const toggleAll = () => {
        if (allSelected) {
            setSelected(prev => { const n = new Set(prev); filtered.forEach(e => n.delete(e.id)); return n })
        } else {
            setSelected(prev => new Set([...prev, ...filtered.map(e => e.id)]))
        }
    }

    const toggleOne = (id: number) => {
        setSelected(prev => {
            const n = new Set(prev)
            n.has(id) ? n.delete(id) : n.add(id)
            return n
        })
    }

    const hasFilter = search || filterMonth || filterType
    const clearFilters = () => { setSearch(''); setFilterMonth(''); setFilterType('') }

    const archivedCount = entries.filter(e => e.archived).length

    const handleGenerate = () => {
        if (filtered.length === 0) { alert('No entries to generate a report for.'); return }
        setShowGenerate(true)
    }

    // Panel navigation (prev/next in filtered list)
    const viewIdx = viewEntry ? filtered.findIndex(e => e.id === viewEntry.id) : -1
    const canPrev = viewIdx > 0
    const canNext = viewIdx >= 0 && viewIdx < filtered.length - 1

    return (
        <>
            {/* ── Summary ── */}
            <div className="grid grid-cols-2 gap-3">
                <TypeCard label="RADAI-MDS REGULAR" count={regularEntries.length} amount={regularTotal} accent="text-blue-600 dark:text-blue-400" />
                <TypeCard label="RADAI-MT SPECIAL" count={specialEntries.length} amount={specialTotal} accent="text-purple-600 dark:text-purple-400" />
            </div>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Total Entries" value={String(filtered.length)} />
                <SummaryCard label="Total Amount" value={`₱${fmtPHP(total)}`} accent="text-green-600 dark:text-green-400" />
                <SummaryCard label="Periods" value={String(periods.length)} />
            </div>

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input className={inpSm + ' pl-7 w-52'} placeholder="Search serial, DV#, payee…" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={inpSm} title="Filter by month" />
                    {([['', 'All'], ['regular', 'RADAI-MDS REGULAR'], ['special', 'RADAI-MT SPECIAL']] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setFilterType(val)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-gmedium border transition ${filterType === val ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                            {label}
                        </button>
                    ))}
                    {hasFilter && (
                        <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
                            <X size={12} /> Clear
                        </button>
                    )}
                    {archivedCount > 0 && (
                        <button
                            onClick={() => { setShowArchived(v => !v); setSelected(new Set()) }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-gmedium border transition ${showArchived ? 'bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-400' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >
                            <Archive size={12} /> {showArchived ? 'Hide Archived' : `Archived (${archivedCount})`}
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={handleGenerate} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary text-sm font-gmedium hover:bg-primary/10 transition">
                        <FileSpreadsheet size={15} /> Generate Report
                    </button>
                    <button onClick={() => setShowPaste(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-gmedium hover:bg-muted transition">
                        <ClipboardPaste size={15} /> Paste Import
                    </button>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-gmedium hover:bg-primary/90 transition">
                        <Plus size={15} /> Add Entry
                    </button>
                </div>
            </div>

            {/* ── Bulk action bar ── */}
            {effectiveSelected.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-sm">
                    <span className="font-gsemibold text-primary">{effectiveSelected.size} selected</span>
                    <div className="h-4 w-px bg-border" />
                    {showArchived ? (
                        <button onClick={handleBulkRestore} className="flex items-center gap-1.5 text-sm font-gmedium text-foreground hover:text-primary transition">
                            <ArchiveRestore size={14} /> Restore
                        </button>
                    ) : (
                        <button onClick={handleBulkArchive} className="flex items-center gap-1.5 text-sm font-gmedium text-foreground hover:text-amber-600 transition">
                            <Archive size={14} /> Archive
                        </button>
                    )}
                    <button onClick={handleBulkDelete} className="flex items-center gap-1.5 text-sm font-gmedium text-destructive hover:opacity-80 transition">
                        <Trash2 size={14} /> Delete
                    </button>
                    <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── Table + Side Panel ── */}
            <div className="flex gap-4 items-start">
                {/* Table */}
                <div className="flex-1 min-w-0">
                    <div
                        ref={tableRef}
                        className="overflow-x-auto rounded-xl border border-border bg-card cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={onDragStart}
                        onMouseMove={onDragMove}
                        onMouseUp={onDragEnd}
                        onMouseLeave={onDragEnd}
                    >
                        <table className="w-full text-sm min-w-[1100px]">
                            <thead>
                                <tr className="bg-muted/60 text-left">
                                    <th className="px-4 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            ref={el => { if (el) el.indeterminate = someSelected }}
                                            onChange={toggleAll}
                                            className="accent-primary cursor-pointer"
                                        />
                                    </th>
                                    <Th>Type</Th>
                                    <Th>Date</Th>
                                    <Th>Serial No.</Th>
                                    <Th>DV / Payroll No.</Th>
                                    <Th>ORS / BURS No.</Th>
                                    <Th>RC Code</Th>
                                    <Th>Payee</Th>
                                    <Th>UACS Object Code</Th>
                                    <Th>Nature of Payment</Th>
                                    <Th right>Amount</Th>
                                    <Th>Period Covered</Th>
                                    <Th>Actions</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={13} className="text-center py-10 text-muted-foreground text-sm">
                                            {showArchived ? 'No archived entries.' : hasFilter ? 'No entries match the current filters.' : 'No RADAI entries yet. Click "Add Entry" to begin.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map(e => {
                                        const isViewed = viewEntry?.id === e.id
                                        return (
                                            <tr
                                                key={e.id}
                                                onClick={() => setViewEntry(isViewed ? null : e)}
                                                className={`border-t border-border transition cursor-pointer ${isViewed ? 'bg-primary/10 dark:bg-primary/15' : effectiveSelected.has(e.id) ? 'bg-primary/5' : 'hover:bg-muted/30'} ${e.archived ? 'opacity-60' : ''}`}
                                            >
                                                <td className="px-4 py-3 w-10" onClick={ev => ev.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={effectiveSelected.has(e.id)}
                                                        onChange={() => toggleOne(e.id)}
                                                        className="accent-primary cursor-pointer"
                                                    />
                                                </td>
                                                <Td className="whitespace-nowrap w-[90px]">
                                                    <span className={`inline-block max-w-[80px] truncate text-xs font-gmedium px-2 py-0.5 rounded-full ${(e.mds_type ?? 'regular') === 'regular' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}
                                                        title={(e.mds_type ?? 'regular') === 'regular' ? 'MDS Regular' : 'MT Special'}>
                                                        {(e.mds_type ?? 'regular') === 'regular' ? 'MDS Reg' : 'MT Spl'}
                                                    </span>
                                                </Td>
                                                <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                                                <Td className="font-gmedium whitespace-nowrap">{e.serial_no}</Td>
                                                <Td className="whitespace-nowrap">{e.dv_payroll_no}</Td>
                                                <Td><MultiLine value={e.ors_burs_no} /></Td>
                                                <Td>{e.responsibility_center_code || '—'}</Td>
                                                <Td className="max-w-[160px]">
                                                    <span className="line-clamp-2 text-xs" title={e.payee}>{e.payee}</span>
                                                </Td>
                                                <Td className="font-mono text-xs"><MultiLine value={e.uacs_object_code} /></Td>
                                                <Td className="max-w-[220px]">
                                                    <span className="line-clamp-2 text-xs" title={e.nature_of_payment}>{e.nature_of_payment}</span>
                                                </Td>
                                                <Td right className="font-gmedium"><AmountLines value={e.amount} /></Td>
                                                <Td className="whitespace-nowrap text-xs text-muted-foreground">{e.period_covered}</Td>
                                                <Td>
                                                    <div className="flex items-center gap-1.5" onClick={ev => ev.stopPropagation()}>
                                                        {!e.archived && (
                                                            <ActionBtn title="Edit" onClick={() => setEditTarget(e)}>
                                                                <Pencil size={13} />
                                                            </ActionBtn>
                                                        )}
                                                        <ActionBtn title="Delete" danger onClick={() => handleDelete(e.id)}>
                                                            <Trash2 size={13} />
                                                        </ActionBtn>
                                                    </div>
                                                </Td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                            {filtered.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-border bg-muted/30">
                                        <td colSpan={10} className="px-4 py-3 text-xs font-gsemibold text-right text-muted-foreground uppercase tracking-wide">Total</td>
                                        <td className="px-4 py-3 text-sm font-gbold text-right text-foreground whitespace-nowrap">₱{fmtPHP(total)}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Side Panel */}
                {viewEntry && (
                    <div className="flex shrink-0" style={{ width: panelWidth }}>
                        {/* Resize handle */}
                        <div
                            className="w-1 self-stretch cursor-col-resize hover:bg-primary/40 transition rounded-full mr-1"
                            onMouseDown={e => {
                                e.preventDefault()
                                isResizing.current = true
                                resizeStartX.current = e.clientX
                                resizeStartW.current = panelWidth
                            }}
                        />
                        <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 180px)' }}>
                            {/* Panel header */}
                            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card shrink-0">
                                <span
                                    className={`min-w-0 truncate whitespace-nowrap text-xs font-gsemibold px-2.5 py-1 rounded-full ${(viewEntry.mds_type ?? 'regular') === 'regular' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}
                                    title={(viewEntry.mds_type ?? 'regular') === 'regular' ? 'RADAI-MDS REGULAR' : 'RADAI-MT SPECIAL'}
                                >
                                    {(viewEntry.mds_type ?? 'regular') === 'regular' ? 'RADAI-MDS REGULAR' : 'RADAI-MT SPECIAL'}
                                </span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                        disabled={!canPrev}
                                        onClick={() => setViewEntry(filtered[viewIdx - 1])}
                                        title="Previous entry"
                                        className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="text-xs text-muted-foreground px-1">{viewIdx + 1} / {filtered.length}</span>
                                    <button
                                        disabled={!canNext}
                                        onClick={() => setViewEntry(filtered[viewIdx + 1])}
                                        title="Next entry"
                                        className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                    {!viewEntry.archived && (
                                        <button onClick={() => setEditTarget(viewEntry)} title="Edit"
                                            className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground ml-1">
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                    <button onClick={() => setViewEntry(null)} title="Close"
                                        className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Panel body */}
                            <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-5">

                                {/* Date & Period */}
                                <PanelSection title="Date">
                                    <PanelRow label="Date" value={fmtDate(viewEntry.date)} />
                                    <PanelRow label="Period Covered" value={viewEntry.period_covered} />
                                </PanelSection>

                                {/* Transaction */}
                                <PanelSection title="Transaction">
                                    <PanelRow label="Serial No." value={viewEntry.serial_no} />
                                    <PanelRow label="DV / Payroll No." value={viewEntry.dv_payroll_no} />
                                    <PanelRow label="ORS / BURS No.">
                                        <MultiLinePanelValue value={viewEntry.ors_burs_no} />
                                    </PanelRow>
                                    <PanelRow label="RC Code" value={viewEntry.responsibility_center_code} />
                                </PanelSection>

                                {/* Payee */}
                                <PanelSection title="Payee">
                                    <PanelRow label="Name" value={viewEntry.payee} wrap />
                                    <PanelRow label="Nature of Payment" value={viewEntry.nature_of_payment} wrap />
                                </PanelSection>

                                {/* UACS & Amount */}
                                <PanelSection title="UACS & Amount">
                                    <UacsAmountTable uacs={viewEntry.uacs_object_code} amount={viewEntry.amount} />
                                </PanelSection>

                                {/* Report Header */}
                                <PanelSection title="Report Header">
                                    <PanelRow label="Entity Name" value={viewEntry.entity_name} wrap />
                                    <PanelRow label="Fund Cluster" value={viewEntry.fund_cluster} />
                                    <PanelRow label="Bank / Account No." value={viewEntry.bank_name_account_no} wrap />
                                    <PanelRow label="Report No." value={viewEntry.report_no} />
                                    <PanelRow label="Sheet No." value={viewEntry.sheet_no} />
                                    {(viewEntry.ada_nos_from || viewEntry.ada_nos_to) && (
                                        <PanelRow label="ADA Nos."
                                            value={[viewEntry.ada_nos_from, viewEntry.ada_nos_to].filter(Boolean).join(' – ')}
                                        />
                                    )}
                                </PanelSection>

                                {/* Signatories */}
                                <PanelSection title="Signatories">
                                    <PanelRow label="Prepared By" value={viewEntry.prepared_by_name} />
                                    <PanelRow label="" value={viewEntry.prepared_by_position} muted />
                                    <PanelRow label="Certified By" value={viewEntry.certified_by_name} />
                                    <PanelRow label="" value={viewEntry.certified_by_position} muted />
                                </PanelSection>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showAdd && <AddRadaiDialog onClose={() => setShowAdd(false)} onSave={handleAdd} />}
            {showPaste && <PasteImportDialog onClose={() => setShowPaste(false)} onImport={handlePasteImport} />}
            {showGenerate && <GenerateReportDialog entries={filtered} onClose={() => setShowGenerate(false)} />}
            {editTarget && <EditRadaiDialog entry={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} />}
        </>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-gmedium">{label}</p>
            <p className={`text-lg font-gbold mt-1 ${accent ?? 'text-foreground'}`}>{value}</p>
        </div>
    )
}

function TypeCard({ label, count, amount, accent }: { label: string; count: number; amount: number; accent: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <p className={`text-xs font-gsemibold mb-3 ${accent}`}>{label}</p>
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs text-muted-foreground font-gmedium">Entries</p>
                    <p className="text-2xl font-gbold text-foreground">{count}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground font-gmedium">Total Amount</p>
                    <p className={`text-lg font-gbold ${accent}`}>₱{fmtPHP(amount)}</p>
                </div>
            </div>
        </div>
    )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return <th className={`px-4 py-3 text-xs font-gsemibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : ''}`}>{children}</th>
}

function Td({ children, right, className, title }: { children: React.ReactNode; right?: boolean; className?: string; title?: string }) {
    return <td className={`px-4 py-3 text-sm text-foreground ${right ? 'text-right' : ''} ${className ?? ''}`} title={title}>{children}</td>
}

function AmountLines({ value }: { value: string }) {
    const lines = value ? value.split('\n').filter(Boolean) : []
    if (lines.length <= 1) return <span className="whitespace-nowrap">{fmtPHP(value)}</span>
    return (
        <div className="flex flex-col gap-0.5 items-end">
            {lines.map((l, i) => (
                <span key={i} className="whitespace-nowrap">{fmtPHP(parseFloat(l))}</span>
            ))}
        </div>
    )
}

function MultiLine({ value }: { value: string }) {
    const lines = value ? value.split('\n').filter(Boolean) : []
    if (lines.length <= 1) return <span className="whitespace-nowrap">{value || '—'}</span>
    return (
        <div className="flex flex-col gap-0.5">
            {lines.map((l, i) => <span key={i} className="whitespace-nowrap">{l}</span>)}
        </div>
    )
}

function ActionBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
    return (
        <button title={title} onClick={onClick}
            className={`p-1.5 rounded transition ${danger ? 'hover:bg-destructive/10 text-destructive' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}>
            {children}
        </button>
    )
}

// ─── Panel sub-components ─────────────────────────────────────────────────────

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-gsemibold text-muted-foreground uppercase tracking-widest mb-2.5">{title}</p>
            <div className="flex flex-col gap-2">{children}</div>
        </div>
    )
}

function PanelRow({ label, value, wrap, muted, children }: {
    label: string; value?: string; wrap?: boolean; muted?: boolean; children?: React.ReactNode
}) {
    return (
        <div className="flex gap-2 text-xs">
            {label && <span className="text-muted-foreground shrink-0 w-28 pt-0.5">{label}</span>}
            {children ?? (
                <span className={`font-gmedium break-words min-w-0 ${muted ? 'text-muted-foreground font-gnormal italic' : 'text-foreground'} ${wrap ? '' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}>
                    {value || '—'}
                </span>
            )}
        </div>
    )
}

function MultiLinePanelValue({ value }: { value: string }) {
    const lines = value ? value.split('\n').filter(Boolean) : []
    if (lines.length === 0) return <span className="text-xs text-muted-foreground">—</span>
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            {lines.map((l, i) => (
                <span key={i} className="text-xs font-mono text-foreground">{l}</span>
            ))}
        </div>
    )
}

function UacsAmountTable({ uacs, amount }: { uacs: string; amount: string }) {
    const uacsLines = uacs ? uacs.split('\n').filter(Boolean) : []
    const amtLines = amount ? amount.split('\n').filter(Boolean) : []
    const rowCount = Math.max(uacsLines.length, amtLines.length, 1)
    const total = amtLines.reduce((s, l) => s + (parseFloat(l) || 0), 0)

    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
                <thead>
                    <tr className="bg-muted/50">
                        <th className="px-3 py-1.5 text-left font-gsemibold text-muted-foreground">UACS Code</th>
                        <th className="px-3 py-1.5 text-right font-gsemibold text-muted-foreground">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: rowCount }).map((_, i) => (
                        <tr key={i} className="border-t border-border">
                            <td className="px-3 py-1.5 font-mono text-foreground">{uacsLines[i] || '—'}</td>
                            <td className="px-3 py-1.5 text-right font-gmedium text-foreground whitespace-nowrap">
                                {amtLines[i] ? fmtPHP(parseFloat(amtLines[i])) : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
                {amtLines.length > 1 && (
                    <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                            <td className="px-3 py-1.5 text-xs font-gsemibold text-muted-foreground text-right">Total</td>
                            <td className="px-3 py-1.5 text-right font-gbold text-foreground whitespace-nowrap">
                                ₱{fmtPHP(total)}
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    )
}
