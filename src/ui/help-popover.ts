import { help } from "./help";

/**
 * One shared native popover (top layer, closes on Escape or outside click, never moves the layout). Every
 * `[data-help]` button fills it from `help` and opens it next to itself.
 */
export function installHelp(popover: HTMLElement, root: ParentNode = document): void {
  const title = popover.querySelector<HTMLElement>(".help-title");
  const body = popover.querySelector<HTMLElement>(".help-body");
  if (!title || !body) throw new Error("Help popover is missing its title or body element.");
  let opener: HTMLElement | null = null;
  let closedAt = 0, closedOpener: HTMLElement | null = null;

  // beforetoggle is synchronous; "toggle" is queued and would arrive after the click that dismissed us.
  popover.addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState === "closed" && opener) {
      opener.setAttribute("aria-expanded", "false");
      closedAt = performance.now(); closedOpener = opener; opener = null;
    }
  });

  for (const button of root.querySelectorAll<HTMLElement>("[data-help]")) {
    const entry = help[button.dataset.help ?? ""];
    if (!entry) continue;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", popover.id);
    if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", `Help: ${entry.title}`);
    button.addEventListener("click", () => {
      // The outside-click that closed this popover also lands here; do not reopen it straight away.
      if (closedOpener === button && performance.now() - closedAt < 250) return;
      title.textContent = entry.title;
      body.replaceChildren(...entry.body.map((text) => Object.assign(document.createElement("p"), { textContent: text })));
      if (entry.steps) {
        const list = document.createElement("ol");
        for (const step of entry.steps) list.append(Object.assign(document.createElement("li"), { textContent: step }));
        body.append(list);
      }
      opener = button;
      button.setAttribute("aria-expanded", "true");
      popover.setAttribute("aria-labelledby", "helpTitle");
      if (!popover.matches(":popover-open")) popover.showPopover();
      place(popover, button);
      popover.focus({ preventScroll: true });
    });
  }
}

/** Below the button, shifted to stay inside the window (above it when there is no room underneath). */
function place(popover: HTMLElement, anchor: HTMLElement): void {
  const margin = 12, a = anchor.getBoundingClientRect(), p = popover.getBoundingClientRect();
  const left = Math.max(margin, Math.min(a.left, window.innerWidth - p.width - margin));
  const below = a.bottom + 8, fits = below + p.height + margin <= window.innerHeight;
  const top = fits ? below : Math.max(margin, a.top - p.height - 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}
