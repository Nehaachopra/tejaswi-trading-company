"use client";

import { useEffect } from "react";

// a field that takes words: text or search inputs and text areas, but not numbers, phones, emails, or codes already
// typed in capitals or kept as typed (autoCapitalize "characters" or "none"); data-no-capital opts one out
function takesWords(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.hasAttribute("data-no-capital");
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.type !== "text" && el.type !== "search") return false;
  if (["numeric", "decimal", "tel", "email"].includes(el.inputMode)) return false;
  const cap = el.getAttribute("autocapitalize");
  if (cap === "none" || cap === "off" || cap === "characters") return false;
  return !el.hasAttribute("data-no-capital");
}

// every field across the website starts with a capital letter: a phone keyboard opens with Shift on, and a small first
// letter typed on a computer goes in as a capital (inserted as typing, so React sees it like any other keystroke)
export function CapitalFirst() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      if (takesWords(e.target) && !e.target.hasAttribute("autocapitalize")) e.target.setAttribute("autocapitalize", "sentences");
    };
    const onBeforeInput = (e: InputEvent) => {
      const el = e.target;
      if (!takesWords(el) || e.inputType !== "insertText" || !e.data) return;
      if (el.selectionStart !== 0 || !/^\p{Ll}/u.test(e.data)) return;
      if (!document.queryCommandSupported?.("insertText")) return;
      e.preventDefault();
      document.execCommand("insertText", false, e.data[0]!.toUpperCase() + e.data.slice(1));
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("beforeinput", onBeforeInput, true);
    };
  }, []);
  return null;
}
