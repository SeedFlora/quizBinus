/**
 * Setup for the jsdom (component) project.
 *
 * jsdom lacks a few browser APIs our components touch. The polyfills below are
 * deliberately minimal and mimic platform behaviour instead of stubbing it away:
 * the <dialog> polyfill fires a cancelable `cancel` event on Escape exactly like
 * Chromium does, so ConfirmDialog is exercised through its real code path.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest runs without globals, so RTL cannot register its own auto-cleanup.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }),
  });
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;

// jsdom's scrollTo only logs "not implemented".
window.scrollTo = (() => undefined) as typeof window.scrollTo;

/* ------------------------------------------------------------------ */
/* <dialog>: showModal / close / Escape → cancel                       */
/* ------------------------------------------------------------------ */

const dialogProto = window.HTMLDialogElement?.prototype;
if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.dataset.modal = "true";
  };
  dialogProto.show = function show(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute("open")) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute("open");
    delete this.dataset.modal;
    this.dispatchEvent(new Event("close"));
  };

  // Browsers turn Escape into a `cancel` event on the top-most modal dialog and
  // close it unless the event is cancelled.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open][data-modal]"));
    const top = open.at(-1);
    if (!top) return;
    const cancel = new Event("cancel", { cancelable: true });
    if (top.dispatchEvent(cancel)) top.close();
  });
}
