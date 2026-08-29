import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "./confirm-dialog.component";

async function render<T>(
  data: ConfirmDialogData<T>
): Promise<{ fixture: ComponentFixture<ConfirmDialogComponent<T>>; close: jasmine.Spy }> {
  const close = jasmine.createSpy("close");
  await TestBed.configureTestingModule({
    imports: [ConfirmDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ConfirmDialogComponent<T>);
  fixture.detectChanges();
  return { fixture, close };
}

function buttons(fixture: ComponentFixture<unknown>): HTMLButtonElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("button"));
}

describe("ConfirmDialogComponent", () => {
  it("renders a single confirm button that closes with true", async () => {
    const { fixture, close } = await render({
      title: "Clear all votes for everyone?",
      confirmLabel: "Clear votes",
    });

    const labels = buttons(fixture).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Cancel", "Clear votes"]);

    buttons(fixture)[1].click();
    expect(close).toHaveBeenCalledWith(true);
  });

  it("renders one button per choice and closes with that choice's value", async () => {
    const { fixture, close } = await render<"remove" | "zero-points">({
      title: "Clear voting status",
      choices: [
        { label: "Remove all votes", value: "remove", color: "warn" },
        { label: "Keep votes, zero points only", value: "zero-points" },
      ],
    });

    const labels = buttons(fixture).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Cancel", "Remove all votes", "Keep votes, zero points only"]);

    buttons(fixture)[2].click();
    expect(close).toHaveBeenCalledWith("zero-points");
  });

  it("closes with undefined when cancelled", async () => {
    const { fixture, close } = await render({ title: "Anything?" });
    buttons(fixture)[0].click();
    expect(close).toHaveBeenCalledWith(undefined);
  });

  it("omits the message block when no message is given", async () => {
    const { fixture } = await render({ title: "No message" });
    expect((fixture.nativeElement as HTMLElement).querySelector("mat-dialog-content")).toBeNull();
  });
});
