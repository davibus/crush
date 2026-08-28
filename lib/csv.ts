import Papa from "papaparse";

export type CsvValue = string | null;
export type CsvRecord = Record<string, CsvValue>;

export type CsvImportErrorCode =
  | "EMPTY_FILE"
  | "EMPTY_HEADER"
  | "MISSING_HEADER"
  | "DUPLICATE_HEADER"
  | "PARSE_ERROR"
  | "INVALID_ROW"
  | "DUPLICATE_ROW";

export type CsvImportError = {
  code: CsvImportErrorCode;
  message: string;
  severity: "error" | "warning";
  row?: number;
  field?: string;
  value?: CsvValue;
};

export type CsvRowContext = {
  headers: readonly string[];
  row: number;
};

export type CsvParseOptions<T extends object> = {
  requiredHeaders?: readonly string[];
  transformRow?: (row: CsvRecord, context: CsvRowContext) => T;
  validateRow?: (
    row: T,
    context: CsvRowContext,
  ) => string | readonly string[] | null | undefined;
  getDuplicateKey?: (row: T) => string;
  nullValues?: readonly string[];
};

export type CsvImportResult<T extends object> = {
  data: T[];
  errors: CsvImportError[];
  headers: string[];
  rowCount: number;
  duplicateCount: number;
  isValid: boolean;
};

export class CsvValueError extends Error {
  readonly field?: string;
  readonly value: CsvValue;

  constructor(message: string, value: CsvValue, field?: string) {
    super(message);
    this.name = "CsvValueError";
    this.field = field;
    this.value = value;
  }
}

const DEFAULT_NULL_VALUES = ["", "--"] as const;

function normalizeValue(value: string, nullValues: ReadonlySet<string>): CsvValue {
  const trimmedValue = value.trim();
  return nullValues.has(trimmedValue.toLowerCase()) ? null : trimmedValue;
}

function createRowKey(row: object): string {
  return JSON.stringify(
    Object.entries(row)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
  );
}

function toImportError(
  error: Papa.ParseError,
  headers: readonly string[],
): CsvImportError {
  const row = typeof error.row === "number" ? error.row + 2 : undefined;
  const field =
    typeof error.index === "number" ? headers[error.index] : undefined;

  return {
    code: "PARSE_ERROR",
    message: error.message,
    severity: "error",
    row,
    field,
  };
}

export function parseCsv<T extends object = CsvRecord>(
  csv: string,
  options: CsvParseOptions<T> = {},
): CsvImportResult<T> {
  const errors: CsvImportError[] = [];
  const source = csv.trim();

  if (!source) {
    return {
      data: [],
      errors: [
        {
          code: "EMPTY_FILE",
          message: "The CSV file is empty.",
          severity: "error",
        },
      ],
      headers: [],
      rowCount: 0,
      duplicateCount: 0,
      isValid: false,
    };
  }

  const nullValues = new Set(
    [...DEFAULT_NULL_VALUES, ...(options.nullValues ?? [])].map((value) =>
      value.trim().toLowerCase(),
    ),
  );
  const result = Papa.parse<CsvRecord>(source, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => normalizeValue(value, nullValues),
  });
  const headers = result.meta.fields ?? [];
  const invalidRowIndexes = new Set(
    result.errors
      .filter((error) => typeof error.row === "number")
      .map((error) => error.row),
  );

  errors.push(...result.errors.map((error) => toImportError(error, headers)));

  headers.forEach((header, index) => {
    if (!header) {
      errors.push({
        code: "EMPTY_HEADER",
        message: `Header in column ${index + 1} is empty.`,
        severity: "error",
      });
    }
  });

  const renamedHeaders = result.meta.renamedHeaders ?? {};
  for (const [renamedHeader, originalHeader] of Object.entries(renamedHeaders)) {
    errors.push({
      code: "DUPLICATE_HEADER",
      message: `Header "${originalHeader}" is duplicated and was renamed to "${renamedHeader}".`,
      severity: "error",
      field: originalHeader,
    });
  }

  const headerLookup = new Set(headers.map((header) => header.toLowerCase()));
  for (const requiredHeader of options.requiredHeaders ?? []) {
    if (!headerLookup.has(requiredHeader.trim().toLowerCase())) {
      errors.push({
        code: "MISSING_HEADER",
        message: `Required header "${requiredHeader}" is missing.`,
        severity: "error",
        field: requiredHeader,
      });
    }
  }

  const data: T[] = [];
  const seenRows = new Set<string>();
  let duplicateCount = 0;

  result.data.forEach((rawRow, rowIndex) => {
    const context: CsvRowContext = { headers, row: rowIndex + 2 };

    if (invalidRowIndexes.has(rowIndex)) return;

    try {
      const row = options.transformRow
        ? options.transformRow(rawRow, context)
        : (rawRow as T);
      const validationMessages = options.validateRow?.(row, context);

      if (validationMessages) {
        const messages = Array.isArray(validationMessages)
          ? validationMessages
          : [validationMessages];

        for (const message of messages) {
          errors.push({
            code: "INVALID_ROW",
            message,
            severity: "error",
            row: context.row,
          });
        }

        return;
      }

      const duplicateKey = options.getDuplicateKey?.(row) ?? createRowKey(row);
      if (seenRows.has(duplicateKey)) {
        duplicateCount += 1;
        errors.push({
          code: "DUPLICATE_ROW",
          message: `Duplicate row ${context.row} was removed.`,
          severity: "warning",
          row: context.row,
        });
        return;
      }

      seenRows.add(duplicateKey);
      data.push(row);
    } catch (error) {
      const valueError = error instanceof CsvValueError ? error : null;
      errors.push({
        code: "INVALID_ROW",
        message:
          error instanceof Error
            ? error.message
            : `Row ${context.row} could not be imported.`,
        severity: "error",
        row: context.row,
        field: valueError?.field,
        value: valueError?.value,
      });
    }
  });

  return {
    data,
    errors,
    headers,
    rowCount: result.data.length,
    duplicateCount,
    isValid: !errors.some((error) => error.severity === "error"),
  };
}

function parseFormattedNumber(
  value: CsvValue | number,
  field?: string,
): number | null {
  if (value === null) return null;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new CsvValueError("Expected a finite number.", String(value), field);
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue === "--") return null;

  const isNegative = /^\(.*\)$/.test(trimmedValue);
  const normalizedValue = trimmedValue
    .replace(/^\((.*)\)$/, "$1")
    .replace(/[,$%\s]/g, "");
  const parsedValue = Number(normalizedValue);

  if (!normalizedValue || !Number.isFinite(parsedValue)) {
    throw new CsvValueError(`Could not convert "${value}" to a number.`, value, field);
  }

  return isNegative ? -parsedValue : parsedValue;
}

export function parseNumericValue(
  value: CsvValue | number,
  field?: string,
): number | null {
  return parseFormattedNumber(value, field);
}

export function parseCurrencyValue(
  value: CsvValue | number,
  field?: string,
): number | null {
  return parseFormattedNumber(value, field);
}

export function parsePercentageValue(
  value: CsvValue | number,
  options: { asDecimal?: boolean; field?: string } = {},
): number | null {
  const parsedValue = parseFormattedNumber(value, options.field);
  if (parsedValue === null) return null;

  return options.asDecimal ? parsedValue / 100 : parsedValue;
}

export function parseDateValue(
  value: CsvValue | Date,
  field?: string,
): Date | null {
  if (value === null) return null;
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return new Date(value.getTime());
    throw new CsvValueError("Expected a valid date.", value.toString(), field);
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue === "--") return null;

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new CsvValueError(`Could not convert "${value}" to a date.`, value, field);
  }

  return parsedDate;
}
