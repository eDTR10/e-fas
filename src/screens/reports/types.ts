// ─── RADAI — Report of Advice to Debit Account Issued ─────────────────────────

export interface RadaiEntry {
    id: number
    mds_type: 'regular' | 'special'   // RADAI-MDS REGULAR or RADAI-MT SPECIAL
    date: string                      // ISO date string
    serial_no: string
    dv_payroll_no: string
    ors_burs_no: string
    responsibility_center_code: string
    payee: string
    uacs_object_code: string
    nature_of_payment: string
    amount: string                    // numeric string
    // header / meta fields
    period_covered: string
    entity_name: string
    fund_cluster: string
    bank_name_account_no: string
    report_no: string
    sheet_no: string
    // footer
    prepared_by_name: string
    prepared_by_position: string
    certified_by_name: string
    certified_by_position: string
    ada_nos_from: string
    ada_nos_to: string
    archived?: boolean
    created_at?: string
    updated_at?: string
}

// ─── RCI — Report of Checks Issued ───────────────────────────────────────────

export interface RciEntry {
    id: number
    mds_type: 'regular' | 'special' | 'tf'  // RCI-MDS REGULAR / RCI-MT SPECIAL / RCI-TF CHECKS
    date: string
    serial_no: string
    dv_payroll_no: string
    ors_burs_no: string
    responsibility_center_code: string
    payee: string
    uacs_object_code: string
    nature_of_payment: string
    amount: string
    // header / meta fields
    period_covered: string
    entity_name: string
    fund_cluster: string
    bank_name_account_no: string
    report_no: string
    sheet_no: string
    // footer
    prepared_by_name: string
    prepared_by_position: string
    certified_by_name: string
    certified_by_position: string
    check_nos_from: string
    check_nos_to: string
    archived?: boolean
    created_at?: string
    updated_at?: string
}
