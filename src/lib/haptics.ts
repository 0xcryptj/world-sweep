import { MiniKit } from '@worldcoin/minikit-js';

async function sendHaptic(
  options:
    | { hapticsType: 'impact'; style: 'light' | 'medium' | 'heavy' }
    | { hapticsType: 'notification'; style: 'success' | 'warning' | 'error' }
    | { hapticsType: 'selection-changed' },
) {
  if (!MiniKit.isInstalled()) {
    return;
  }

  try {
    await MiniKit.sendHapticFeedback(options);
  } catch {
    // Haptics are optional; ignore failures outside World App.
  }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium') {
  return sendHaptic({ hapticsType: 'impact', style });
}

export function hapticNotification(
  style: 'success' | 'warning' | 'error',
) {
  return sendHaptic({ hapticsType: 'notification', style });
}

export function hapticSelection() {
  return sendHaptic({ hapticsType: 'selection-changed' });
}
