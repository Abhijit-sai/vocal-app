'use client'

import { tenantBots } from '@/config/tenant.config'

// Env override wins for staging/dev flexibility; otherwise we fall back to
// the worker bot username from the tenant config so a clone-and-config
// deployment works without setting this env var.
const BOT_USERNAME = process.env.NEXT_PUBLIC_WORKER_BOT_USERNAME ?? tenantBots.worker.username

interface Props {
  userId: string
  linked: boolean
}

export function TelegramLinkBanner({ userId, linked }: Props) {
  if (linked) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm"
        style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46' }}
      >
        <span className="text-base">✅</span>
        <span>
          <strong>Telegram connected.</strong> You will receive assignment alerts and daily reminders on Telegram.
        </span>
      </div>
    )
  }

  const deepLink = `https://t.me/${BOT_USERNAME}?start=link_${userId}`

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-lg text-sm"
      style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E' }}
    >
      <span className="text-base flex-shrink-0">💬</span>
      <div className="flex-1">
        <strong>Connect Telegram</strong> to receive assignment alerts and daily reminders on your phone.
      </div>
      <a
        href={deepLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 px-4 py-1.5 rounded-md text-sm font-semibold text-white"
        style={{ background: '#0088CC' }}
      >
        Link Telegram
      </a>
    </div>
  )
}
