import { useState } from 'react'
import { notificationSoundEnabled, playNotificationSound, setNotificationSoundEnabled } from './notification-sound'

export function NotificationSoundSettings() {
  const [enabled, setEnabled] = useState(notificationSoundEnabled)
  return <details>
    <summary>Suono delle notifiche</summary>
    <label className="notification-sound-setting">
      <input type="checkbox" checked={enabled} onChange={(event) => {
        setEnabled(event.target.checked)
        setNotificationSoundEnabled(event.target.checked)
      }} /> Suono per i nuovi avvisi di attività
    </label>
    <p className="content-note">Un breve suono accompagna gli avvisi di Catalogo, Eventi e analisi AI. La scelta viene salvata su questo dispositivo.</p>
    <button type="button" className="secondary-button" disabled={!enabled}
      onClick={() => void playNotificationSound()}>Prova suono</button>
  </details>
}
