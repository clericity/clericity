'use client'

import { type CSSProperties } from 'react'

interface TimingSelectorProps {
  triggerType: string
  delayMinutes: number
  onChangeTrigger: (type: string) => void
  onChangeDelay: (minutes: number) => void
}

export default function TimingSelector({ triggerType, delayMinutes, onChangeTrigger, onChangeDelay }: TimingSelectorProps) {
  const presets =
    triggerType === 'booking_confirmed' ? [0, 30, 60, 120] :
    triggerType === 'before_appointment' ? [60, 120, 1440, 2880] :
    [60, 120, 1440, 2880]

  const labelFor = (m: number) => {
    if (triggerType === 'booking_confirmed' && m === 0) return 'Azonnal'
    if (m < 60) return `${m} perc`
    if (m < 1440) return `${m / 60} óra`
    return `${m / 1440} nap`
  }

  const btn = (m: number): CSSProperties => ({
    padding: '0.3rem 0.75rem',
    borderRadius: '8px',
    border: '2px solid',
    borderColor: delayMinutes === m ? '#2563eb' : '#e5e7eb',
    backgroundColor: delayMinutes === m ? '#eff6ff' : 'white',
    color: delayMinutes === m ? '#2563eb' : '#6b7280',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: '500',
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Mikor küldje?</label>
        <select
          value={triggerType}
          onChange={e => { onChangeTrigger(e.target.value); onChangeDelay(0) }}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', backgroundColor: 'white', fontSize: '0.875rem' }}
        >
          <option value="booking_confirmed">✅ Esemény után</option>
          <option value="before_appointment">⏰ Időpont előtt</option>
          <option value="after_appointment">🔄 Időpont után</option>
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>
          {triggerType === 'booking_confirmed' ? 'Késés (0 = azonnal)' : triggerType === 'before_appointment' ? 'Mennyivel előtte?' : 'Mennyivel utána?'}
        </label>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {presets.map(m => (
            <button key={m} type="button" onClick={() => onChangeDelay(m)} style={btn(m)}>
              {labelFor(m)}
            </button>
          ))}
          <input
            type="number"
            value={delayMinutes}
            onChange={e => onChangeDelay(parseInt(e.target.value) || 0)}
            min="0"
            style={{ width: '70px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.3rem 0.5rem', color: '#111827', outline: 'none', fontSize: '0.8rem' }}
            placeholder="perc"
          />
        </div>
      </div>
    </div>
  )
}
