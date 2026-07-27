// Shared between StorePortalService's upload/mapping/preview/confirm import endpoints — one
// place owns column-mapping auto-detection and row validation so all four steps agree on what
// counts as "ready" vs "needs review" vs "error", instead of drifting the way the appointments/
// consultations state machines once did (see appointment-transitions.util.ts's own comment).

export const IMPORT_FIELDS = [
  'productName',
  'category',
  'description',
  'price',
  'stockQuantity',
  'sku',
  'batchNumber',
  'expiryDate',
  'requiresPrescription',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

// Matches the columns in StorePortalService.getImportTemplate()'s CSV header — used to
// auto-detect a column mapping from the uploaded file's own header row.
const FIELD_LABELS: Record<ImportField, string> = {
  productName: 'Product Name',
  category: 'Category',
  description: 'Description',
  price: 'Price',
  stockQuantity: 'Stock Quantity',
  sku: 'SKU',
  batchNumber: 'Batch Number',
  expiryDate: 'Expiry Date',
  requiresPrescription: 'Requires Prescription',
};

export interface ColumnMapping {
  columnIndex: number;
  csvColumn: string;
  mappedField: ImportField | null;
}

export interface ImportRowRecord {
  rowNumber: number;
  values: string[];
}

export interface ValidatedRow {
  rowNumber: number;
  mapped: Partial<Record<ImportField, string>>;
  requiresPrescription: boolean | null;
  errors: string[];
}

function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Best-effort guess at upload time — the user can always correct it via the mapping step before
// confirming, so a wrong guess here is recoverable, not a hard failure.
export function detectColumnMappings(headers: string[]): ColumnMapping[] {
  const normalizedFieldByLabel = new Map<string, ImportField>(
    IMPORT_FIELDS.map((field) => [normalize(FIELD_LABELS[field]), field]),
  );

  return headers.map((csvColumn, columnIndex) => ({
    columnIndex,
    csvColumn,
    mappedField: normalizedFieldByLabel.get(normalize(csvColumn)) ?? null,
  }));
}

function mapRowValues(
  row: ImportRowRecord,
  columnMappings: ColumnMapping[],
): Partial<Record<ImportField, string>> {
  const mapped: Partial<Record<ImportField, string>> = {};
  for (const mapping of columnMappings) {
    if (!mapping.mappedField) continue;
    mapped[mapping.mappedField] = row.values[mapping.columnIndex]?.trim() ?? '';
  }
  return mapped;
}

function validateMappedRow(mapped: Partial<Record<ImportField, string>>): {
  errors: string[];
  requiresPrescription: boolean | null;
} {
  const errors: string[] = [];

  if (!mapped.productName?.trim()) errors.push('Product Name is required');
  if (!mapped.category?.trim()) errors.push('Category is required');
  if (!mapped.description?.trim()) errors.push('Description is required');

  const price = Number(mapped.price);
  if (!mapped.price?.trim() || isNaN(price) || price <= 0)
    errors.push('Price must be a positive number');

  const stock = Number(mapped.stockQuantity);
  if (
    !mapped.stockQuantity?.trim() ||
    isNaN(stock) ||
    stock < 0 ||
    !Number.isInteger(stock)
  ) {
    errors.push('Stock Quantity must be a whole number, 0 or more');
  }

  let requiresPrescription: boolean | null = false;
  const rxRaw = (mapped.requiresPrescription ?? '').trim().toLowerCase();
  if (rxRaw === '' || ['no', 'false', '0'].includes(rxRaw)) {
    requiresPrescription = false;
  } else if (['yes', 'true', '1'].includes(rxRaw)) {
    requiresPrescription = true;
  } else {
    requiresPrescription = null;
    errors.push('Requires Prescription must be Yes or No');
  }

  return { errors, requiresPrescription };
}

export function validateRows(
  rows: ImportRowRecord[],
  columnMappings: ColumnMapping[],
): ValidatedRow[] {
  return rows.map((row) => {
    const mapped = mapRowValues(row, columnMappings);
    const { errors, requiresPrescription } = validateMappedRow(mapped);
    return { rowNumber: row.rowNumber, mapped, requiresPrescription, errors };
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
