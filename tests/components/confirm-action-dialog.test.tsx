// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

describe("ConfirmActionDialog", () => {
  afterEach(cleanup);
  it("requires explicit confirmation and disables the action while loading", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const props = {
      open: false,
      onOpenChange,
      triggerLabel: "Excluir",
      title: "Excluir objetivo?",
      description: "As posições serão mantidas.",
      confirmLabel: "Confirmar",
      loading: true,
      onConfirm,
    };
    const { rerender } = render(<ConfirmActionDialog {...props} />);
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    rerender(<ConfirmActionDialog {...props} open />);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Confirmar" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<ConfirmActionDialog {...props} open loading={false} />);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("supports an external action as the dialog trigger", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <>
        <button type="button" onClick={() => onOpenChange(true)}>
          Abrir confirmação
        </button>
        <ConfirmActionDialog
          hideTrigger
          open
          onOpenChange={onOpenChange}
          title="Excluir objetivo?"
          description="As posições serão mantidas."
          confirmLabel="Confirmar"
          onConfirm={onConfirm}
        />
      </>,
    );

    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
