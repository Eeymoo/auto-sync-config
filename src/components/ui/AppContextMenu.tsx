import { useEffect, useRef, useState } from "react";
import { Clipboard, ClipboardPaste, MousePointer2, Scissors } from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
  x: number;
  y: number;
  target: EditableElement | HTMLElement | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectedText: string;
}

interface MenuAction {
  label: string;
  shortcut: string;
  icon: typeof Clipboard;
  disabled: boolean;
  run: () => void | Promise<void>;
}

function isTextControl(element: Element | null): element is EditableElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;

  return ["email", "password", "search", "tel", "text", "url"].includes(element.type);
}

function findEditableTarget(element: Element | null) {
  if (isTextControl(element)) return element;
  return element?.closest<HTMLElement>("[contenteditable='true']") ?? null;
}

function isReadOnly(target: EditableElement | HTMLElement | null) {
  if (!target) return true;
  if (isTextControl(target)) return target.disabled || target.readOnly;
  return target.getAttribute("contenteditable") !== "true";
}

function writeText(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyWithFallback(text));
  }

  copyWithFallback(text);
  return Promise.resolve();
}

function copyWithFallback(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function setTextControlValue(
  target: EditableElement,
  value: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  setter?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
  target.setSelectionRange(selectionStart, selectionEnd);
}

function replaceTextControlSelection(
  target: EditableElement,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
) {
  const availableLength = target.maxLength < 0
    ? replacement.length
    : Math.max(0, target.maxLength - (target.value.length - (selectionEnd - selectionStart)));
  const acceptedReplacement = replacement.slice(0, availableLength);
  const nextValue =
    target.value.slice(0, selectionStart) + acceptedReplacement + target.value.slice(selectionEnd);
  const nextPosition = selectionStart + acceptedReplacement.length;
  setTextControlValue(target, nextValue, nextPosition, nextPosition);
}

function AppContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();

      const eventTarget = event.target instanceof Element ? event.target : null;
      const target = findEditableTarget(eventTarget);
      if (!target) {
        setMenu(null);
        return;
      }

      let selectionStart: number | null = null;
      let selectionEnd: number | null = null;
      let selectedText = "";

      if (isTextControl(target)) {
        selectionStart = target.selectionStart;
        selectionEnd = target.selectionEnd;
        if (selectionStart !== null && selectionEnd !== null) {
          selectedText = target.value.slice(selectionStart, selectionEnd);
        }
      } else {
        const selection = window.getSelection();
        if (
          selection?.anchorNode &&
          selection.focusNode &&
          target.contains(selection.anchorNode) &&
          target.contains(selection.focusNode)
        ) {
          selectedText = selection.toString();
        }
      }

      setMenu({
        x: event.clientX,
        y: event.clientY,
        target,
        selectionStart,
        selectionEnd,
        selectedText,
      });
    };

    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    const close = () => setMenu(null);

    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("mousedown", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("mousedown", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  useEffect(() => {
    if (!menu || !menuRef.current) return;

    const bounds = menuRef.current.getBoundingClientRect();
    const padding = 8;
    const x = Math.min(menu.x, window.innerWidth - bounds.width - padding);
    const y = Math.min(menu.y, window.innerHeight - bounds.height - padding);
    menuRef.current.style.left = `${Math.max(padding, x)}px`;
    menuRef.current.style.top = `${Math.max(padding, y)}px`;
  }, [menu]);

  if (!menu) return null;

  const hasSelection = menu.selectedText.length > 0;
  const editable = menu.target !== null && !isReadOnly(menu.target);

  const closeAfter = (action: () => void | Promise<void>) => async () => {
    try {
      await action();
    } catch {
      // Clipboard access can be denied by the host; closing keeps the menu responsive.
    } finally {
      setMenu(null);
    }
  };

  const cut = async () => {
    if (!editable || !hasSelection || !menu.target) return;
    await writeText(menu.selectedText);

    if (
      isTextControl(menu.target) &&
      menu.selectionStart !== null &&
      menu.selectionEnd !== null
    ) {
      replaceTextControlSelection(menu.target, menu.selectionStart, menu.selectionEnd, "");
      return;
    }

    menu.target.focus();
    document.execCommand("delete");
  };

  const copy = () => writeText(menu.selectedText);

  const paste = async () => {
    if (!editable || !menu.target || !navigator.clipboard?.readText) return;

    const text = await navigator.clipboard.readText();
    if (
      isTextControl(menu.target) &&
      menu.selectionStart !== null &&
      menu.selectionEnd !== null
    ) {
      replaceTextControlSelection(menu.target, menu.selectionStart, menu.selectionEnd, text);
      return;
    }

    menu.target.focus();
    document.execCommand("insertText", false, text);
  };

  const selectAll = () => {
    if (isTextControl(menu.target)) {
      menu.target.focus();
      menu.target.select();
      return;
    }

    if (!menu.target) return;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(menu.target);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const actions: MenuAction[] = [
    { label: "剪切", shortcut: "Ctrl+X", icon: Scissors, disabled: !editable || !hasSelection, run: cut },
    { label: "复制", shortcut: "Ctrl+C", icon: Clipboard, disabled: !hasSelection, run: copy },
    { label: "粘贴", shortcut: "Ctrl+V", icon: ClipboardPaste, disabled: !editable, run: paste },
    { label: "全选", shortcut: "Ctrl+A", icon: MousePointer2, disabled: false, run: selectAll },
  ];

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="编辑菜单"
      className="fixed z-[100] min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            onClick={closeAfter(action.run)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
              "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{action.label}</span>
            <span className="text-xs text-muted-foreground">{action.shortcut}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export { AppContextMenu };
