// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  // Navigation
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "minus": "remove",
  "ellipsis": "more-horiz",
  "ellipsis.circle": "more-horiz",
  "gear": "settings",
  "gear.circle.fill": "settings",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "arrow.up": "arrow-upward",
  "arrow.down": "arrow-downward",
  "arrow.clockwise": "refresh",
  "square.and.arrow.up": "share",
  "trash": "delete",
  "trash.fill": "delete",
  "pencil": "edit",
  "pencil.circle.fill": "edit",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "checkmark.square.fill": "check-box",
  "square": "check-box-outline-blank",

  // Assistant / Voice
  "speaker.wave.2.fill": "volume-up",
  "mic.fill": "mic",
  "mic": "mic-none",
  "mic.slash.fill": "mic-off",
  "waveform": "graphic-eq",
  "bubble.left.fill": "chat-bubble",
  "bubble.left.and.bubble.right.fill": "chat",
  "message.fill": "message",
  "text.bubble.fill": "chat",
  "sparkles": "auto-awesome",
  "brain.head.profile": "psychology",

  // Family
  "person.fill": "person",
  "person.circle.fill": "account-circle",
  "person.2.fill": "people",
  "person.3.fill": "group",
  "person.crop.circle.fill.badge.plus": "person-add",
  "house.and.flag.fill": "home",
  "building.2.fill": "domain",

  // Reminders
  "bell.fill": "notifications",
  "bell.badge.fill": "notifications-active",
  "bell.slash.fill": "notifications-off",
  "alarm.fill": "alarm",
  "clock.fill": "schedule",
  "calendar": "calendar-today",
  "calendar.badge.plus": "event",
  "calendar.badge.clock": "event-note",

  // Shopping
  "cart.fill": "shopping-cart",
  "cart.badge.plus": "add-shopping-cart",
  "bag.fill": "shopping-bag",
  "list.bullet": "list",
  "list.bullet.clipboard.fill": "assignment",
  "checkmark.circle": "check-circle-outline",

  // Health
  "heart.fill": "favorite",
  "heart.text.square.fill": "monitor-heart",
  "figure.walk": "directions-walk",
  "figure.run": "directions-run",
  "moon.fill": "bedtime",
  "drop.fill": "water-drop",
  "flame.fill": "local-fire-department",
  "chart.bar.fill": "bar-chart",
  "chart.line.uptrend.xyaxis": "trending-up",
  "stethoscope": "medical-services",
  "pills.fill": "medication",

  // Education
  "book.fill": "menu-book",
  "books.vertical.fill": "library-books",
  "graduationcap.fill": "school",
  "pencil.and.ruler.fill": "draw",
  "questionmark.circle.fill": "help",
  "lightbulb.fill": "lightbulb",
  "star.fill": "star",
  "trophy.fill": "emoji-events",

  // Transport / Ride
  "car.fill": "directions-car",
  "car.circle.fill": "local-taxi",
  "location.fill": "location-on",
  "map.fill": "map",
  "mappin.and.ellipse": "place",

  // Telegram / Communication
  "paperplane": "send",
  "envelope.fill": "email",
  "phone.fill": "phone",
  "link": "link",

  // Settings / Config
  "lock.fill": "lock",
  "shield.fill": "security",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility-off",
  "toggle.on": "toggle-on",
  "info.circle.fill": "info",
  "questionmark": "help-outline",
  "moon.stars.fill": "dark-mode",
  "sun.max.fill": "light-mode",
} as unknown as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
