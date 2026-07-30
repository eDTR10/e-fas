import { useState } from 'react'
import RADAIContainer from './radai/RADAIContainer'
import RCIContainer from './rci/RCIContainer'

type Tab = 'radai' | 'rci'

export default function ReportsMainContainer() {
    const [tab, setTab] = useState<Tab>('radai')

    return (
        <div className="flex flex-col gap-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-gbold text-foreground">Reports</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                    Generate RADAI and RCI reports for the cashier's office
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
                <TabBtn active={tab === 'radai'} onClick={() => setTab('radai')}>
                    RADAI
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">Report of Advice to Debit Account Issued</span>
                </TabBtn>
                <TabBtn active={tab === 'rci'} onClick={() => setTab('rci')}>
                    RCI
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">Report of Checks Issued</span>
                </TabBtn>
            </div>

            {tab === 'radai' ? <RADAIContainer /> : <RCIContainer />}
        </div>
    )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center px-4 py-2.5 text-sm font-gmedium border-b-2 transition -mb-px ${active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
        >
            {children}
        </button>
    )
}
