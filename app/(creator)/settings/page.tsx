import type { Metadata } from "next";
import { DeskHeader } from "@/components/creator/CreatorShell";
import { getCreatorProfile } from "@/components/creator/profile";
import { isSalutation } from "@/components/creator/profile-schema";
import { AccountsSection, ChangePasswordForm } from "@/components/creator/settings/AccountsSection";
import { AudioSettings } from "@/components/creator/settings/AudioSettings";
import { BrandAssets } from "@/components/creator/settings/BrandAssets";
import { LanguageSetting } from "@/components/creator/settings/LanguageSetting";
import { MotionNote } from "@/components/creator/settings/MotionNote";
import { ProfileForm } from "@/components/creator/settings/ProfileForm";
import { SettingsSection } from "@/components/creator/settings/SettingsSection";
import { listLecturers } from "@/lib/auth/admin-actions";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("settings.title") };
}

export default async function SettingsPage() {
  const [profile, t] = await Promise.all([getCreatorProfile(), getT()]);
  // Database accounts only: the demo lecturer has no password and no admin role.
  const accounts = profile.source === "db" && profile.role === "admin" ? await listLecturers() : null;
  return (
    <>
      <DeskHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="px-5 pt-6 pb-20 sm:px-10">
        <SettingsSection id="settings-profile" title={t("settings.profile")} description={t("settings.profileHint")}>
          <ProfileForm
            fullName={profile.fullName}
            salutation={isSalutation(profile.salutation) ? profile.salutation : "Bu"}
            email={profile.email}
            demo={profile.source === "demo"}
          />
        </SettingsSection>

        {profile.source === "db" && (
          <SettingsSection
            id="settings-password"
            title={t("settings.accounts.passwordTitle")}
            description={t("settings.accounts.passwordHint")}
          >
            <ChangePasswordForm />
          </SettingsSection>
        )}

        {accounts && (
          <SettingsSection
            id="settings-accounts"
            title={t("settings.accounts.title")}
            description={t("settings.accounts.hint")}
          >
            <AccountsSection accounts={accounts} currentUserId={profile.id} />
          </SettingsSection>
        )}

        <SettingsSection id="settings-language" title={t("settings.language")} description={t("settings.languageHint")}>
          <LanguageSetting />
        </SettingsSection>

        <SettingsSection id="settings-audio" title={t("settings.audio")} description={t("settings.audioHint")}>
          <AudioSettings />
        </SettingsSection>

        <SettingsSection
          id="settings-motion"
          title={t("settings.motion")}
          description={t("settings.reducedMotionHint")}
        >
          <MotionNote />
        </SettingsSection>

        <SettingsSection id="settings-brand" title={t("settings.brand")} description={t("settings.brandHint")}>
          <BrandAssets t={t} />
        </SettingsSection>
      </div>
    </>
  );
}
