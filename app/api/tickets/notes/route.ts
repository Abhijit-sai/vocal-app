/**
 * POST /api/tickets/notes
 *
 * Appends a note to a ticket. Accepts either:
 *   • application/json — original shape: { ticket_id, content, note_type, is_internal }
 *   • multipart/form-data — same fields plus an optional `image` File. The
 *     image (if present) is uploaded to ticket-attachments storage and
 *     persisted as a `ticket_attachments` row linked to this ticket.
 *
 * Enforces:
 *   - User must be authenticated and active
 *   - Only owner or privileged roles can add notes
 *   - Notes are immutable after creation (append-only)
 *   - Images on notes go through attachmentService.uploadWorkerAttachment
 *     so they share the bucket + signed-URL viewing pipeline as citizen
 *     uploads (E1).
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { addTicketNote } from '@/services/ticketService'
import { uploadWorkerAttachment } from '@/services/attachmentService'

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  // ── Parse body — JSON or multipart ──────────────────────────────────────
  const contentType = req.headers.get('content-type') ?? ''
  let ticket_id: string | undefined
  let content: string | undefined
  let note_type = 'general'
  let is_internal = true
  let imageFile: File | null = null

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData()
    ticket_id   = String(form.get('ticket_id') ?? '')
    content     = String(form.get('content') ?? '')
    note_type   = String(form.get('note_type') ?? 'general')
    is_internal = String(form.get('is_internal') ?? 'true') !== 'false'
    const f = form.get('image')
    if (f instanceof File && f.size > 0) imageFile = f
  } else {
    const body = await req.json().catch(() => ({}))
    ticket_id   = body.ticket_id
    content     = body.content
    note_type   = body.note_type ?? 'general'
    is_internal = body.is_internal ?? true
  }

  if (!ticket_id || !content?.trim()) {
    return Response.json({ error: 'ticket_id and content are required' }, { status: 400 })
  }

  // ── Validate the image if present ───────────────────────────────────────
  if (imageFile) {
    if (!ALLOWED_IMAGE_MIMES.includes(imageFile.type)) {
      return Response.json({ error: `Image MIME type not allowed: ${imageFile.type}` }, { status: 400 })
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: `Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)` }, { status: 400 })
    }
  }

  // ── Authorise ───────────────────────────────────────────────────────────
  const supabase = createSupabaseServiceClient()
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, owner_user_id')
    .eq('id', ticket_id)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const roleName = (user as any).roles?.name
  const isPrivileged = ['super_admin', 'central_support'].includes(roleName)
  const isOwner = ticket.owner_user_id === user.id
  const isWorker = roleName === 'ground_worker'

  if (!isPrivileged && !(isWorker && isOwner)) {
    return Response.json({ error: 'Access denied' }, { status: 403 })
  }

  const allowedTypes = ['general', 'worker_update', 'escalation', 'system', 'closure']
  if (!allowedTypes.includes(note_type)) {
    return Response.json({ error: 'Invalid note_type' }, { status: 400 })
  }

  if (note_type === 'closure') {
    const { data: history } = await supabase
      .from('ticket_stage_history')
      .select('id')
      .eq('ticket_id', ticket_id)
      .eq('to_sub_status', 'citizen_contacted')
      .limit(1)
      .single()
    if (!history) {
      return Response.json({
        error: 'Cannot close ticket: citizen_contacted sub-status has not been reached'
      }, { status: 422 })
    }
  }

  // ── Append the note ─────────────────────────────────────────────────────
  const result = await addTicketNote(
    ticket_id,
    user.id,
    content.trim(),
    note_type as 'general' | 'worker_update' | 'escalation' | 'system' | 'closure',
    is_internal,
  )
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  // ── Upload + link the image, if any ─────────────────────────────────────
  // Errors here are non-fatal: the note is already saved. We just report
  // back so the UI can warn the user the image didn't attach.
  let attachmentResult: { ok: boolean; error?: string; attachment_id?: string } | undefined
  if (imageFile) {
    const bytes = Buffer.from(await imageFile.arrayBuffer())
    const stored = await uploadWorkerAttachment({
      bytes,
      filename: imageFile.name,
      mime: imageFile.type,
      org_id: user.organization_id,
      ticket_id: ticket_id,
    })
    if (!stored) {
      attachmentResult = { ok: false, error: 'Image upload failed — note saved without it' }
    } else {
      const { data: attRow, error: attErr } = await supabase
        .from('ticket_attachments')
        .insert({
          ticket_id,
          file_name: imageFile.name,
          storage_path: stored.storage_path,
          mime_type: stored.mime_type,
          file_size_bytes: stored.size_bytes,
          attachment_type: stored.attachment_type,
          uploaded_by: user.id,
        })
        .select('id')
        .single()
      attachmentResult = attErr
        ? { ok: false, error: `Image stored but DB insert failed: ${attErr.message}` }
        : { ok: true, attachment_id: attRow?.id }
    }
  }

  return Response.json({ ok: true, note_id: result.noteId, attachment: attachmentResult })
}
