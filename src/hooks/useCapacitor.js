import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Initializes Capacitor native plugins when running on iOS/Android.
 * Returns { isNative, platform, keyboardVisible }.
 */
export default function useCapacitor() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

  useEffect(() => {
    if (!isNative) return;

    // Configure dark status bar for our dark theme
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#030712' }).catch(() => {});

    // Track keyboard show/hide so we can adjust bottom nav
    const showListener = Keyboard.addListener('keyboardWillShow', () => {
      setKeyboardVisible(true);
    });
    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showListener.then(h => h.remove());
      hideListener.then(h => h.remove());
    };
  }, [isNative]);

  return { isNative, platform, keyboardVisible };
}
