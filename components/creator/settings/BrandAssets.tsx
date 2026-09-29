import { BinusLogo } from "@/components/brand/BinusLogo";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { brand } from "@/lib/brand";
import type { Translator } from "@/lib/i18n/config";

/**
 * Where the institutional logo comes from, shown on both surfaces it appears on
 * (the navy stage and the light desk), plus the one variable that replaces it.
 */
export function BrandAssets({ t }: { t: Translator }) {
  const custom = Boolean(brand.logoSrc);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="nf nf-md nf-solid grid h-28 place-items-center">
          <BinusLogo height={34} tone="light" />
        </div>
        <div className="nf nf-md nf-desk grid h-28 place-items-center">
          <BinusLogo height={34} tone="dark" />
        </div>
      </div>

      <NusaBadge tone={custom ? "desk-primary" : "desk"} className="justify-self-start">
        {custom ? t("settings.brandCustom", { src: brand.logoSrc }) : t("settings.brandPlaceholder")}
      </NusaBadge>

      <p className="max-w-[60ch] text-[15px] leading-relaxed text-desk-text">{t("settings.brandBody")}</p>

      <pre className="overflow-x-auto rounded-[8px_2px_14px_2px] bg-desk-rail px-4 py-3.5 text-[13px] leading-relaxed text-kapas">
        <code>
          <span className="text-kapas/55"># .env.local</span>
          {"\n"}NEXT_PUBLIC_BINUS_LOGO_SRC=<span className="text-sun">/brand/binus-logo.svg</span>
        </code>
      </pre>

      <p className="max-w-[60ch] text-[13px] leading-relaxed text-desk-muted">{t("settings.brandTokens")}</p>
    </div>
  );
}
