'use client'

import { QRCodeSVG } from 'qrcode.react'

const TELEGRAM_URL = 'https://t.me/Bevocal_bot'

export function QRCard() {
  return (
    <div className="flex flex-col items-center gap-3 p-6 bg-white border border-gray-200 rounded-2xl">
      <div className="p-3 bg-gray-50 rounded-xl">
        <QRCodeSVG
          value={TELEGRAM_URL}
          size={148}
          bgColor="#F9FAFB"
          fgColor="#1A1A1A"
          level="M"
          marginSize={0}
        />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">Scan to Start</p>
        <p className="text-xs text-gray-500 mt-0.5">Opens Telegram automatically</p>
      </div>
    </div>
  )
}
