import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';

/**
 * Institution logo on the sign-in screen.
 *
 * Uses the official SIIT logo from `apps/mobile/assets/brand/siit-logo.png` (1920 × 523, transparent PNG).
 * Set OFFICIAL_LOGO to null to fall back to the app's own map-pin mark.
 */
const OFFICIAL_LOGO: ImageSourcePropType | null = require('../../assets/brand/siit-logo.png');
/** Width ÷ height of the official logo file (1920 × 523). */
const OFFICIAL_LOGO_RATIO = 1920 / 523;
export const HAS_OFFICIAL_LOGO = OFFICIAL_LOGO !== null;

/** `size` is the mark's size; the official (wide) logo is drawn `width` wide instead. */
export function BrandLogo({ size = 88, width = 260, label }: { size?: number; width?: number; label?: string }) {
  if (OFFICIAL_LOGO) {
    return (
      <Image
        source={OFFICIAL_LOGO}
        style={{ width, height: width / OFFICIAL_LOGO_RATIO }}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <MaterialCommunityIcons name="map-marker-check" size={size * 0.52} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#702C8B',
    borderWidth: 4,
    borderColor: '#EDE9FE',
    elevation: 6,
  },
});
