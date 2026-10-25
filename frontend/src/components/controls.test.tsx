import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Meta } from "../api/types";
import metaFixture from "../test/fixtures/meta.json";
import { DecisionDatePicker, DecisionTimePicker } from "./controls";

const presets = (metaFixture as Meta).decision_time_presets;

describe("DecisionTimePicker", () => {
  it("marks the active preset and switches presets", async () => {
    const onChange = vi.fn();
    render(<DecisionTimePicker presets={presets} value="09:20" onChange={onChange} />);

    expect(screen.getByRole("button", { name: /EPEX/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /N2EX/ }));
    expect(onChange).toHaveBeenCalledWith("09:50");
  });

  it("accepts a custom time", async () => {
    const onChange = vi.fn();
    render(<DecisionTimePicker presets={presets} value="09:20" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    const input = screen.getByLabelText("Custom decision time");
    await userEvent.clear(input);
    await userEvent.type(input, "06:00");
    expect(onChange).toHaveBeenLastCalledWith("06:00");
  });

  it("starts in custom mode for a non-preset time", () => {
    render(<DecisionTimePicker presets={presets} value="14:00" onChange={() => {}} />);
    expect(screen.getByLabelText("Custom decision time")).toHaveValue("14:00");
  });
});

describe("DecisionDatePicker", () => {
  it("steps between days and stops at the range edges", async () => {
    const onChange = vi.fn();
    render(
      <DecisionDatePicker
        value="2026-01-01"
        min="2026-01-01"
        max="2026-01-31"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith("2026-01-02");
  });

  it("names the delivery day", () => {
    render(
      <DecisionDatePicker
        value="2026-01-14"
        min="2026-01-01"
        max="2026-01-31"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/delivers Thu 15 Jan/)).toBeInTheDocument();
  });
});
