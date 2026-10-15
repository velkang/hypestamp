import type { SVGProps } from "react";

// One stroke icon set at a 16px grid; sizes and colours come from the caller.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, strokeWidth = 1.7, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => <Icon strokeWidth={2.2} {...p}><path d="M3.5 8.5l3 3 6-7" /></Icon>;
export const CrossIcon = (p: IconProps) => <Icon strokeWidth={2.2} {...p}><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
export const ChevronIcon = (p: IconProps) => <Icon strokeWidth={1.8} {...p}><path d="M6 3.5L10.5 8 6 12.5" /></Icon>;
export const ExternalIcon = (p: IconProps) => <Icon {...p}><path d="M6.5 3.5H3.5v9h9v-3M9 2.5h4.5V7M13.5 2.5L7.5 8.5" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></Icon>;
export const DownloadIcon = (p: IconProps) => <Icon strokeWidth={1.8} {...p}><path d="M8 2v8m-3-3l3 3 3-3M3 13h10" /></Icon>;
export const InfoIcon = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6.5" /><path d="M8 7v4M8 4.8v.2" /></Icon>;
export const FlagIcon = (p: IconProps) => <Icon {...p}><path d="M3 2v12M3 2.5h8.5l-1.8 3 1.8 3H3" /></Icon>;
export const ShieldIcon = (p: IconProps) => <Icon {...p}><path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4z" /></Icon>;
export const CopyIcon = (p: IconProps) => <Icon {...p}><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M11 5V3.5A1 1 0 0010 2.5H3.5a1 1 0 00-1 1V10a1 1 0 001 1H5" /></Icon>;

const TOKEN_COLOURS: Record<string, string> = { ETH: "#627EEA", LINK: "#2A5ADA", BTC: "#F7931A", SOL: "#7B5BE6" };

// ETH gets its diamond; other tickers their initial on the token's brand colour.
export function TokenMark({ token, size = 24 }: { token: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
      style={{ width: size, height: size, background: TOKEN_COLOURS[token] ?? "#4A4E57" }} aria-hidden="true">
      {token === "ETH" ? (
        <svg width={size * 0.38} height={size * 0.58} viewBox="0 0 10 16">
          <path d="M5 0l5 8-5 3-5-3z" fill="#fff" />
          <path d="M5 12l5-3-5 7-5-7z" fill="#fff" opacity=".7" />
        </svg>
      ) : (
        token.slice(0, 1)
      )}
    </span>
  );
}
