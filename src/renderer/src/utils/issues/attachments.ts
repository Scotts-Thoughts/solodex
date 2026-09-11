// Turns dropped/browsed Files into attachment payloads, applying the shared
// limits so the user hears about a problem before submitting.
import {
  ISSUE_LIMITS,
  formatBytes,
  isImageName,
  mimeFromName,
  sanitizeAttachmentName,
  dedupeAttachmentName,
} from '../../../../shared/issues'

export interface PendingAttachment {
  name: string
  mime: string
  data: Uint8Array
  /** Object URL for image thumbnails; revoke when the attachment is dropped. */
  previewUrl?: string
}

export interface Rejected { name: string; reason: string }

export async function filesToAttachments(
  files: Iterable<File>,
  existing: PendingAttachment[]
): Promise<{ accepted: PendingAttachment[]; rejected: Rejected[] }> {
  const accepted: PendingAttachment[] = []
  const rejected: Rejected[] = []
  const taken = existing.map(a => a.name)
  let total = existing.reduce((n, a) => n + a.data.byteLength, 0)

  for (const file of files) {
    const original = file.name
    const mime = mimeFromName(original)
    if (!mime) { rejected.push({ name: original, reason: 'unsupported file type (images and text files only)' }); continue }
    if (file.size > ISSUE_LIMITS.maxFileBytes) { rejected.push({ name: original, reason: `larger than ${formatBytes(ISSUE_LIMITS.maxFileBytes)}` }); continue }
    if (existing.length + accepted.length >= ISSUE_LIMITS.maxFiles) { rejected.push({ name: original, reason: `up to ${ISSUE_LIMITS.maxFiles} files can be attached` }); continue }
    if (total + file.size > ISSUE_LIMITS.maxTotalBytes) { rejected.push({ name: original, reason: `attachments would exceed ${formatBytes(ISSUE_LIMITS.maxTotalBytes)} in total` }); continue }
    const name = dedupeAttachmentName(sanitizeAttachmentName(original), taken)
    const data = new Uint8Array(await file.arrayBuffer())
    taken.push(name)
    total += data.byteLength
    accepted.push({ name, mime, data, previewUrl: isImageName(name) ? URL.createObjectURL(file) : undefined })
  }
  return { accepted, rejected }
}

export function releaseAttachment(a: PendingAttachment): void {
  if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
}
