import type { ReactNode, SVGProps } from 'react'
import { IconSvg as Svg } from '@/components/icons/Icons'

type IconProps = SVGProps<SVGSVGElement>

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  )
}

export function IconBuilding(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h16" />
      <path d="M6 20V8l6-4 6 4v12" />
      <path d="M9 20v-4h6v4" />
      <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
    </Svg>
  )
}

export function IconStore(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9h16l-1 11H5L4 9Z" />
      <path d="M4 9 6 4h12l2 5" />
      <path d="M10 13h4" />
    </Svg>
  )
}

export function IconStar(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3 2.7 5.5 6 .9-4.4 4.3 1 6L12 16.8 6.7 19.7l1-6L3.3 9.4l6-.9L12 3Z" />
    </Svg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </Svg>
  )
}

export function IconLayout(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </Svg>
  )
}

export function IconSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m6.5 6.5 2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />
      <circle cx="12" cy="12" r="2.5" />
    </Svg>
  )
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M14 19a4.5 4.5 0 0 1 6.5-4" />
    </Svg>
  )
}

export function IconCart(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
      <path d="M3 4h2l2.4 11h10.2l2-8H7" />
    </Svg>
  )
}

export function IconBox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M12 12 4 7M12 12l8-5M12 12v10" />
    </Svg>
  )
}

export function IconWallet(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M16 14h2" />
    </Svg>
  )
}

export function IconBriefcase(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </Svg>
  )
}

export function IconCpu(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </Svg>
  )
}

export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    </Svg>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  )
}

export function IconAdmin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 4 7v4c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V7l-8-4Z" />
      <path d="M9 12h6M12 9v6" />
    </Svg>
  )
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  )
}

export function IconPanelLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m15 9-3 3 3 3" />
    </Svg>
  )
}

export function IconPanelRight(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m12 9 3 3-3 3" />
    </Svg>
  )
}

export function IconDot(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconCrm(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </Svg>
  )
}

export function IconPos(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </Svg>
  )
}

export function IconMegaphone(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 11v2a3 3 0 0 0 3 3h1l2 3h2v-3.2L20 18V6L10 8.2V5H9a3 3 0 0 0-3 3v1H4Z" />
    </Svg>
  )
}

export function IconHeadset(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2Z" />
      <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2Z" />
    </Svg>
  )
}

export function IconTruck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7V10Z" />
      <circle cx="7" cy="17" r="1.5" />
      <circle cx="17" cy="17" r="1.5" />
    </Svg>
  )
}

export function IconFactory(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V10l5 3V10l5 3V8l6 4v8H4Z" />
    </Svg>
  )
}

export function IconPeople(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M2.5 19a5.5 5.5 0 0 1 11 0M13.5 19a4.5 4.5 0 0 1 8 0" />
    </Svg>
  )
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Svg>
  )
}

export function IconChat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </Svg>
  )
}

export function IconZap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3 6 13h5l-1 8 7-10h-5l1-8Z" />
    </Svg>
  )
}

export function IconPlug(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 7V3M15 7V3M8 7h8v4a4 4 0 0 1-8 0V7Z" />
      <path d="M12 15v6" />
    </Svg>
  )
}

export function IconApps(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </Svg>
  )
}

export function IconDatabase(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </Svg>
  )
}

export function IconCloud(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 18h11a4 4 0 0 0 .3-8 6 6 0 0 0-11.5-1.5A3.5 3.5 0 0 0 7 18Z" />
    </Svg>
  )
}

const SECTION_ICONS: Record<string, (props: IconProps) => ReactNode> = {
  overview: IconLayout,
  ai: IconSpark,
  'customer-revenue': IconUsers,
  operations: IconBox,
  'finance-people': IconWallet,
  'work-management': IconBriefcase,
  platform: IconCpu,
  system: IconShield,
  'platform-admin': IconAdmin,
}

const UTILITY_ICONS: Record<string, (props: IconProps) => ReactNode> = {
  search: IconSearch,
  'tenant-switcher': IconBuilding,
  'company-switcher': IconStore,
  favorites: IconStar,
  recent: IconClock,
}

const MODULE_ICONS: Record<string, (props: IconProps) => ReactNode> = {
  Dashboard: IconLayout,
  AI: IconSpark,
  CRM: IconCrm,
  Sales: IconCart,
  POS: IconPos,
  Commerce: IconStore,
  Marketing: IconMegaphone,
  'Help Desk': IconHeadset,
  Inventory: IconBox,
  Procurement: IconTruck,
  'Supply Chain': IconTruck,
  Manufacturing: IconFactory,
  'Asset Management': IconSettings,
  Finance: IconWallet,
  HRM: IconPeople,
  Projects: IconBriefcase,
  Documents: IconFolder,
  Communication: IconChat,
  Automation: IconZap,
  'Developer Platform': IconCpu,
  'Integration Hub': IconPlug,
  'App Marketplace': IconApps,
  'Data Platform': IconDatabase,
  Core: IconSettings,
  Security: IconShield,
  'Cloud Platform': IconCloud,
  'Admin / Super Admin': IconAdmin,
}

export function getUtilityIcon(id: string) {
  return UTILITY_ICONS[id] ?? IconDot
}

export function getSectionIcon(id: string) {
  return SECTION_ICONS[id] ?? IconDot
}

export function getModuleIcon(label: string) {
  return MODULE_ICONS[label] ?? IconFolder
}

export function getLinkIcon() {
  return IconDot
}
