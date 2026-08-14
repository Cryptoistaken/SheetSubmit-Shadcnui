import type { StoredFile } from "@sheetsubmit/shared";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      file?: StoredFile;
      files?: StoredFile[];
      fileIdx?: number;
    }
  }
}

export {};
