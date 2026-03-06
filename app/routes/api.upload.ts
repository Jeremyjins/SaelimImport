// Resource route — Signed Upload URL 발급
// POST /api/upload
// Body: { bucket, fileName, contentType, documentType, parentId }
// Returns: { signedUrl, token, path, publicUrl? }
export { action } from "~/loaders/upload.server";
