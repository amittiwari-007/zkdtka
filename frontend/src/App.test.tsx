import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createQueryClient } from "./api/hooks";
import { App } from "./App";
import accuracy from "./test/fixtures/accuracy-week1.json";
import day from "./test/fixtures/day-2026-01-15.json";
import meta from "./test/fixtures/meta.json";

function respond(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderApp() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.replaceState(null, "", "/?view=decision&date=2026-01-14&time=09:20");
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/meta")) return respond(meta);
      if (url.startsWith("/api/day")) return respond(day);
      if (url.startsWith("/api/accuracy")) return respond(accuracy);
      return respond({ detail: "Not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows what was known at decision time for the linked day", async () => {
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "Buying on Wed 14 Jan at 09:20 for Thu 15 Jan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/published Wed 14 Jan, 07:30, 1 h 50 min before the deadline/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/day?delivery_date=2026-01-15&decision_time=09%3A20",
      expect.anything(),
    );
  });

  it("switches to the accuracy view and keeps the URL in sync", async () => {
    renderApp();
    await screen.findByRole("heading", { name: /Buying on/ });

    await userEvent.click(screen.getByRole("button", { name: "Forecast accuracy" }));
    expect(await screen.findByText("+1.49 GW")).toBeInTheDocument();
    expect(window.location.search).toContain("view=accuracy");
  });

  it("offers the table view of a chart", async () => {
    renderApp();
    await screen.findByRole("heading", { name: /Buying on/ });

    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.getByRole("region", { name: /Hourly forecast and actual/ })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(25);
  });

  it("explains API errors", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).startsWith("/api/meta")
        ? respond(meta)
        : respond({ detail: "Delivery date 2026-01-15 is outside the analysed range." }, 422),
    );
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("outside the analysed range");
  });
});
