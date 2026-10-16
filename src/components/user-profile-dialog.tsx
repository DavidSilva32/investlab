"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type UserProfileDialogProps = {
  name: string;
  email: string;
  onNameUpdated: (name: string) => void;
};

export function UserProfileDialog({
  name,
  email,
  onNameUpdated,
}: UserProfileDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<{
    field: "newPassword" | "confirmPassword";
    message: string;
  } | null>(null);
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;
    setDisplayName(name);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPasswordVisible(false);
    setNewPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setNameError(null);
    setPasswordError(null);
  }

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    const normalizedName = displayName.trim();
    if (!normalizedName || normalizedName.length > 120) {
      setNameError("Informe um nome com até 120 caracteres.");
      return;
    }
    setSavingName(true);
    try {
      await apiRequest<{ ok: true }>(
        "/api/auth/profile",
        { method: "PATCH", body: JSON.stringify({ name: normalizedName }) },
        "Não foi possível atualizar seu perfil.",
      );
      onNameUpdated(normalizedName);
      toast.success("Seu nome foi atualizado.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível atualizar seu perfil.",
      );
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError({
        field: "newPassword",
        message: "A nova senha deve ter entre 12 e 128 caracteres.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError({
        field: "confirmPassword",
        message: "A confirmação não corresponde à nova senha.",
      });
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest<{ ok: true }>(
        "/api/auth/profile/password",
        {
          method: "POST",
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmPassword,
          }),
        },
        "Não foi possível alterar sua senha.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPasswordVisible(false);
      setNewPasswordVisible(false);
      setConfirmPasswordVisible(false);
      toast.success("Sua senha foi alterada.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível alterar sua senha.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label="Meu perfil"
          className="h-9 min-w-9 gap-0 px-0 text-foreground hover:bg-accent sm:h-auto sm:gap-3 sm:px-3"
        >
          <UserRound aria-hidden="true" className="size-5 sm:hidden" />
          <span className="sr-only sm:hidden">Meu perfil</span>
          <span className="hidden min-w-0 border-l border-border/70 pl-4 text-right sm:block">
            <span
              className="block max-w-52 truncate text-sm font-medium"
              title={name || email}
            >
              {name || email}
            </span>
            <span
              className="block max-w-52 truncate text-xs text-muted-foreground"
              title={email}
            >
              {email}
            </span>
            <span className="block text-xs text-muted-foreground">
              Meu perfil
            </span>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>
            Atualize seu nome ou altere sua senha. O e-mail permanece somente
            para leitura.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          <section
            aria-labelledby="profile-account-title"
            className="grid gap-4"
          >
            <h2 id="profile-account-title" className="text-sm font-semibold">
              Dados da conta
            </h2>
            <form className="grid gap-4" onSubmit={saveName}>
              <div className="grid gap-2">
                <Label htmlFor="profile-name">Nome</Label>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  maxLength={120}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={
                    nameError ? "profile-name-error" : undefined
                  }
                />
                {nameError && (
                  <p
                    id="profile-name-error"
                    className="text-sm text-destructive"
                  >
                    {nameError}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-email">E-mail</Label>
                <Input id="profile-email" type="email" value={email} readOnly />
              </div>
              <div>
                <Button type="submit" disabled={savingName}>
                  {savingName ? "Salvando…" : "Salvar nome"}
                </Button>
              </div>
            </form>
          </section>
          <section
            aria-labelledby="profile-password-title"
            className="grid gap-4 border-t border-border pt-5"
          >
            <div>
              <h2 id="profile-password-title" className="text-sm font-semibold">
                Alterar senha
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Confirme sua senha atual. As outras sessões serão encerradas
                após a alteração.
              </p>
            </div>
            <form className="grid gap-4" onSubmit={changePassword}>
              <div className="grid gap-2">
                <Label htmlFor="profile-current-password">Senha atual</Label>
                <div className="relative">
                  <Input
                    id="profile-current-password"
                    type={currentPasswordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    className="pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9"
                    aria-label={
                      currentPasswordVisible
                        ? "Ocultar senha atual"
                        : "Mostrar senha atual"
                    }
                    aria-pressed={currentPasswordVisible}
                    onClick={() =>
                      setCurrentPasswordVisible((visible) => !visible)
                    }
                  >
                    {currentPasswordVisible ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-new-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="profile-new-password"
                    type={newPasswordVisible ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    className="pr-11"
                    aria-invalid={passwordError?.field === "newPassword"}
                    aria-describedby={
                      passwordError?.field === "newPassword"
                        ? "profile-new-password-error"
                        : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9"
                    aria-label={
                      newPasswordVisible
                        ? "Ocultar nova senha"
                        : "Mostrar nova senha"
                    }
                    aria-pressed={newPasswordVisible}
                    onClick={() => setNewPasswordVisible((visible) => !visible)}
                  >
                    {newPasswordVisible ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {passwordError?.field === "newPassword" && (
                  <p
                    id="profile-new-password-error"
                    className="text-sm text-destructive"
                  >
                    {passwordError.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-confirm-password">
                  Confirmar nova senha
                </Label>
                <div className="relative">
                  <Input
                    id="profile-confirm-password"
                    type={confirmPasswordVisible ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    className="pr-11"
                    aria-invalid={passwordError?.field === "confirmPassword"}
                    aria-describedby={
                      passwordError?.field === "confirmPassword"
                        ? "profile-confirm-password-error"
                        : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9"
                    aria-label={
                      confirmPasswordVisible
                        ? "Ocultar confirmação da nova senha"
                        : "Mostrar confirmação da nova senha"
                    }
                    aria-pressed={confirmPasswordVisible}
                    onClick={() =>
                      setConfirmPasswordVisible((visible) => !visible)
                    }
                  >
                    {confirmPasswordVisible ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {passwordError?.field === "confirmPassword" && (
                  <p
                    id="profile-confirm-password-error"
                    className="text-sm text-destructive"
                  >
                    {passwordError.message}
                  </p>
                )}
              </div>
              <div>
                <Button type="submit" disabled={savingPassword}>
                  {savingPassword ? "Alterando…" : "Alterar senha"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
