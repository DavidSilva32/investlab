"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiRequest } from "@/lib/api-client";
import {
  formatBrazilianPhone,
  normalizeBrazilianPhone,
} from "@/lib/brazilian-phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserLearningBadges,
  type LearningProgressSummary,
} from "@/components/user-learning-badges";

type LearningProgressResponse = { courses: LearningProgressSummary[] };

type UserProfileDialogProps = {
  name: string;
  email: string;
  phone?: string | null;
  role: "USER" | "ADMIN";
  onNameUpdated: (name: string) => void;
  onPhoneUpdated?: (phone: string | null) => void;
};

export function UserProfileDialog({
  name,
  email,
  phone,
  role,
  onNameUpdated,
  onPhoneUpdated,
}: UserProfileDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(name);
  const [displayPhone, setDisplayPhone] = useState(formatBrazilianPhone(phone));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<{
    field: "newPassword" | "confirmPassword";
    message: string;
  } | null>(null);
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [profileTab, setProfileTab] = useState("account");
  const [learningCourses, setLearningCourses] = useState<
    LearningProgressSummary[]
  >([]);
  const [loadingLearning, setLoadingLearning] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);

  async function loadLearningProgress() {
    setLoadingLearning(true);
    setLearningError(null);
    try {
      const response = await apiRequest<LearningProgressResponse>(
        "/api/learning/progress",
        undefined,
        "Não foi possível carregar seus emblemas.",
      );
      setLearningCourses(response.courses);
    } catch (error) {
      setLearningError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível carregar seus emblemas.",
      );
    } finally {
      setLoadingLearning(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDisplayName(name);
      setDisplayPhone(formatBrazilianPhone(phone));
      setProfileTab("account");
      return;
    }
    setDisplayName(name);
    setDisplayPhone(formatBrazilianPhone(phone));
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPasswordVisible(false);
    setNewPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setNameError(null);
    setPhoneError(null);
    setPasswordError(null);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setPhoneError(null);
    const normalizedName = displayName.trim();
    if (!normalizedName || normalizedName.length > 120) {
      setNameError("Informe um nome com até 120 caracteres.");
      return;
    }
    const normalizedPhone = normalizeBrazilianPhone(displayPhone);
    if (normalizedPhone === undefined) {
      setPhoneError("Informe DDD e 8 dígitos para fixo ou 9 para celular.");
      return;
    }
    setSavingName(true);
    try {
      const response = await apiRequest<{
        ok: true;
        name: string;
        phone: string | null;
      }>(
        "/api/auth/profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            name: normalizedName,
            phone: normalizedPhone,
          }),
        },
        "Não foi possível atualizar seu perfil.",
      );
      onNameUpdated(response.name);
      onPhoneUpdated?.(response.phone);
      toast.success("Seu perfil foi atualizado.");
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label="Abrir menu da conta"
            className="h-10 w-10 justify-center gap-0 rounded-lg border-border bg-background p-1 text-foreground shadow-sm hover:border-primary/40 hover:bg-accent focus-visible:ring-2 sm:h-11 sm:w-44 sm:justify-between sm:gap-3 sm:px-3"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <UserRound aria-hidden="true" className="size-4" />
            </span>
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-44 truncate text-sm font-medium leading-5">
                {name || email}
              </span>
              <span className="block text-xs leading-4 text-muted-foreground">
                Minha conta
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="hidden size-4 shrink-0 text-muted-foreground sm:block"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">
              {name || email}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleOpenChange(true)}>
            <UserRound aria-hidden="true" className="size-4" />
            Meu perfil
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/privacidade-conta">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Privacidade
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/mcp">
              <Sparkles aria-hidden="true" className="size-4" />
              MCP
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/assinatura">
              <CreditCard aria-hidden="true" className="size-4" />
              Assinatura
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Meu perfil</DialogTitle>
            <DialogDescription>
              Atualize seu nome e telefone ou altere sua senha. O e-mail
              permanece somente para leitura.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={profileTab}
            onValueChange={(value) => {
              setProfileTab(value);
              if (value === "learning") void loadLearningProgress();
            }}
          >
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger
                value="account"
                className="min-h-10 px-2 text-xs sm:text-sm"
              >
                Conta
              </TabsTrigger>
              <TabsTrigger
                value="learning"
                className="min-h-10 px-2 text-xs sm:text-sm"
              >
                Cursos
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="min-h-10 px-2 text-xs sm:text-sm"
              >
                Segurança
              </TabsTrigger>
            </TabsList>
            <TabsContent value="account" className="mt-4">
              <section
                aria-labelledby="profile-account-title"
                className="grid gap-4"
              >
                <h2
                  id="profile-account-title"
                  className="text-sm font-semibold"
                >
                  Dados da conta
                </h2>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={saveProfile}
                >
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
                    <Label htmlFor="profile-phone">Telefone</Label>
                    <Input
                      id="profile-phone"
                      type="tel"
                      autoComplete="tel-national"
                      inputMode="tel"
                      placeholder="(11) 99999-9999"
                      value={displayPhone}
                      onChange={(event) =>
                        setDisplayPhone(
                          formatBrazilianPhone(event.target.value),
                        )
                      }
                      aria-invalid={Boolean(phoneError)}
                      aria-describedby={
                        phoneError ? "profile-phone-error" : undefined
                      }
                    />
                    {phoneError && (
                      <p
                        id="profile-phone-error"
                        className="text-sm text-destructive"
                      >
                        {phoneError}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-email">E-mail</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={email}
                      readOnly
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={savingName}>
                      {savingName ? "Salvando…" : "Salvar perfil"}
                    </Button>
                  </div>
                </form>
              </section>
            </TabsContent>
            <TabsContent value="learning" className="mt-4">
              <UserLearningBadges
                courses={learningCourses}
                loading={loadingLearning}
                error={learningError}
                onRetry={() => void loadLearningProgress()}
              />
            </TabsContent>
            <TabsContent value="security" className="mt-4">
              <section
                aria-labelledby="profile-password-title"
                className="grid gap-4"
              >
                <div>
                  <h2
                    id="profile-password-title"
                    className="text-sm font-semibold"
                  >
                    Trocar senha
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use esta opção se você lembra da senha atual. As outras
                    sessões serão encerradas após a troca.
                  </p>
                </div>
                <form className="grid gap-4" onSubmit={changePassword}>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-current-password">
                      Senha atual
                    </Label>
                    <div className="relative">
                      <Input
                        id="profile-current-password"
                        type={currentPasswordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) =>
                          setCurrentPassword(event.target.value)
                        }
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
                        onClick={() =>
                          setNewPasswordVisible((visible) => !visible)
                        }
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
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        required
                        className="pr-11"
                        aria-invalid={
                          passwordError?.field === "confirmPassword"
                        }
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
                      {savingPassword ? "Trocando…" : "Trocar senha"}
                    </Button>
                  </div>
                </form>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h3 className="text-sm font-medium">
                    Esqueceu a senha atual?
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Peça ao administrador do InvestLab um link seguro de
                    redefinição. Ele confirma sua identidade e o link permite
                    criar uma nova senha sem informar a atual.
                  </p>
                  {role === "ADMIN" && (
                    <Button
                      asChild
                      className="mt-3"
                      size="sm"
                      variant="outline"
                    >
                      <Link href="/admin/usuarios#password-reset">
                        Abrir redefinição assistida
                      </Link>
                    </Button>
                  )}
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
