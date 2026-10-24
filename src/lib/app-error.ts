/** Reviewed diagnostic vocabulary. Never use file values in these definitions. */
export const errorDefinitions = {
  UNEXPECTED_ERROR: ["Unexpected application failure", "application", "error"],
  JS_TYPE_ERROR: ["Unexpected JavaScript type error", "application", "error"],
  JS_REFERENCE_ERROR: ["Unexpected JavaScript reference error", "application", "error"],
  JS_RANGE_ERROR: ["Unexpected JavaScript range error", "application", "error"],
  JS_SYNTAX_ERROR: ["Unexpected JavaScript syntax error", "application", "error"],
  FILE_TYPE_UNSUPPORTED: ["Unsupported genome file format", "validation", "warning"],
  FILE_SELECTION_INVALID: ["Choose one genome file at a time", "validation", "warning"],
  FILE_SIZE_INVALID: ["DNA file is empty or exceeds the supported size", "validation", "warning"],
  DNA_HEADER_MISSING: ["Unsupported DNA file: expected header missing", "validation", "warning"],
  DNA_FORMAT_UNSUPPORTED: ["Unsupported DNA provider or column layout", "validation", "warning"],
  DNA_HEADER_TOO_LARGE: ["DNA header exceeds the supported size", "validation", "warning"],
  DNA_COLUMNS_INVALID: ["DNA row has an unexpected number of columns", "validation", "warning"],
  DNA_POSITION_INVALID: ["DNA row contains an invalid position", "validation", "warning"],
  DNA_GENOTYPE_INVALID: ["DNA row contains an unsupported genotype", "validation", "warning"],
  DNA_ROW_TOO_LONG: ["DNA row exceeds the supported length", "validation", "warning"],
  DNA_ROW_LIMIT: ["DNA export exceeds the supported row count", "validation", "warning"],
  DNA_NO_ROWS: ["DNA export contains no data rows", "validation", "warning"],
  ARCHIVE_INVALID: ["DNA archive is incomplete or invalid", "validation", "warning"],
  ARCHIVE_UNSUPPORTED: ["Unsupported DNA archive format", "validation", "warning"],
  ARCHIVE_PAYLOAD_INVALID: [
    "Archive must contain one supported DNA text file",
    "validation",
    "warning",
  ],
  VCF_BGZF_REQUIRED: ["VCF must use BGZF compression", "validation", "warning"],
  VCF_BLOCK_INVALID: ["VCF compressed block is invalid", "validation", "warning"],
  VCF_TRUNCATED: ["VCF compressed file is incomplete", "validation", "warning"],
  VCF_SAMPLE_MISSING: ["VCF has no sample genotype column", "validation", "warning"],
  VCF_HEADER_INVALID: ["VCF header or column layout is invalid", "validation", "warning"],
  FILE_READ_FAILED: ["Genome file could not be read", "file-read", "error"],
  NETWORK_FAILED: ["Public data download failed: network request failed", "network", "error"],
  NETWORK_TIMEOUT: ["Public data download timed out", "network", "error"],
  HTTP_ERROR: ["Public data download returned an HTTP error", "network", "error"],
  RANGE_REQUEST_INVALID: ["Application requested an invalid byte range", "application", "error"],
  RANGE_RESPONSE_INVALID: [
    "Host returned an invalid byte-range response",
    "range-response",
    "error",
  ],
  RANGE_RESPONSE_INCOMPLETE: ["Host returned an incomplete byte range", "range-response", "error"],
  REFERENCE_INDEX_INVALID: ["Public reference index is invalid", "reference-data", "error"],
  REFERENCE_INTEGRITY_FAILED: [
    "Public reference files failed integrity checks",
    "reference-data",
    "error",
  ],
  REFERENCE_BUILD_MISMATCH: [
    "Public reference files use inconsistent builds",
    "reference-data",
    "error",
  ],
  REFERENCE_DECODE_FAILED: [
    "Public reference data could not be decoded",
    "reference-data",
    "error",
  ],
  GRAPHICS_UNAVAILABLE: ["Interactive illustration could not be loaded", "graphics", "warning"],
} as const;

export type ErrorCode = keyof typeof errorDefinitions;
export const errorResources = [
  "public-sample",
  "catalogue-index",
  "catalogue-entries",
  "consumer-lookup",
  "markers",
  "publication-index",
  "publication-labels",
] as const;
export type ErrorResource = (typeof errorResources)[number];
export interface ErrorDetails {
  resource?: ErrorResource;
  httpStatus?: number;
}

/** The message is for the local UI. Reporting uses only the reviewed code and details. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;
  constructor(
    code: ErrorCode,
    message: string = errorDefinitions[code][0],
    details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}
