import type { ReactNode, SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

export function IconSvg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconEye(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </IconSvg>
  )
}

export function IconPencil(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </IconSvg>
  )
}

export function IconShield(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    </IconSvg>
  )
}

export function IconShieldOff(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M19.4 14.6A8.4 8.4 0 0 0 19 12V6l-7-3-2.3 1" />
      <path d="M5 6v6c0 4.5 3 7.5 7 9 1.2-.45 2.3-1.1 3.3-1.9" />
      <path d="m3 3 18 18" />
    </IconSvg>
  )
}

export function IconCircleCheck(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </IconSvg>
  )
}

export function IconBan(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m6.2 6.2 11.6 11.6" />
    </IconSvg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </IconSvg>
  )
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <IconSvg strokeWidth="1.85" {...props}>
      <path d="M10.29 5.05 3.12 17.4A1.85 1.85 0 0 0 4.73 20.1h14.54a1.85 1.85 0 0 0 1.61-2.7L13.71 5.05a1.85 1.85 0 0 0-3.42 0Z" />
      <path d="M12 9.15v4.2" />
      <circle cx="12" cy="16.55" r="0.85" fill="currentColor" stroke="none" />
    </IconSvg>
  )
}

export function IconStar(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m12 3 2.7 5.5 6 .9-4.4 4.3 1 6L12 16.8 6.7 19.7l1-6L3.3 9.4l6-.9L12 3Z" />
    </IconSvg>
  )
}

export function IconShieldCheck(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m8.7 12.1 2.2 2.2 4.4-4.5" />
    </IconSvg>
  )
}

export function IconX(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </IconSvg>
  )
}

export function IconSun(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.6M12 19.4V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.6M19.4 12H21M4.9 19.1 6 18M18 6l1.1-1.1" />
    </IconSvg>
  )
}

export function IconMoon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6.2 6.2 0 0 0 20 14.5Z" />
    </IconSvg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.2 16.2 4.3 4.3" />
    </IconSvg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconSvg>
  )
}

export function IconSend(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 6 5.5-6 5.5" />
    </IconSvg>
  )
}

export function IconPaperclip(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12.5 7.5 8 12a3.5 3.5 0 0 0 5 5l5-5a5 5 0 0 0-7-7l-5 5a7 7 0 0 0 10 10l3-3" />
    </IconSvg>
  )
}

export function IconSpark(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
    </IconSvg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </IconSvg>
  )
}

export function IconPin(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3.5v7" />
      <path d="M8 17.5h8" />
      <path d="M7.5 10.5h9l-1.5 4.5h-6z" />
    </IconSvg>
  )
}

export function IconExternalLink(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
    </IconSvg>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconSvg>
  )
}
