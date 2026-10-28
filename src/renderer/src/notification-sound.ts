const preferenceKey = 'pokeguru.notification-sound.v1'
let enabled = true
let context: AudioContext | null = null

export function notificationSoundEnabled(): boolean {
  try { enabled = localStorage.getItem(preferenceKey) !== 'off' } catch { /* Keep the session preference. */ }
  return enabled
}

export function setNotificationSoundEnabled(value: boolean): void {
  enabled = value
  try { localStorage.setItem(preferenceKey, value ? 'on' : 'off') } catch { /* The current session still works. */ }
}

function audioContext(): AudioContext {
  if (!context || context.state === 'closed') context = new AudioContext()
  return context
}

/** Unlock without playing anything; a suspended notification must never sound on a later click. */
export function prepareNotificationSound(): () => void {
  const unlock = () => {
    if (!notificationSoundEnabled()) return
    try { void audioContext().resume().catch(() => {}) } catch { /* Audio is optional. */ }
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  unlock()
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}

/** One short, quiet chime per group of newly displayed alerts, independent of navigation. */
export async function playNotificationSound(): Promise<void> {
  if (!notificationSoundEnabled()) return
  try {
    const audio = audioContext()
    if (audio.state !== 'running') return
    const start = audio.currentTime
    const gain = audio.createGain()
    const tone = audio.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(660, start)
    tone.frequency.setValueAtTime(880, start + 0.12)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.07, start + 0.015)
    gain.gain.linearRampToValueAtTime(0.025, start + 0.11)
    gain.gain.linearRampToValueAtTime(0.06, start + 0.135)
    gain.gain.linearRampToValueAtTime(0, start + 0.32)
    tone.connect(gain).connect(audio.destination)
    tone.onended = () => { tone.disconnect(); gain.disconnect() }
    tone.start(start)
    tone.stop(start + 0.33)
  } catch { /* Never hide a visual notification if audio is unavailable. */ }
}
