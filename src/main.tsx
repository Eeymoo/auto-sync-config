import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppContextMenu } from "@/components/ui/AppContextMenu";
import "./index.css";

// 桌面应用不需要浏览器快捷键(Ctrl+F/R/P 等),交给 keydown 统一拦截。
// 保留:输入框编辑、复制粘贴剪切全选、页面缩放、F5 刷新、F12 开发工具。
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable);

document.addEventListener(
  "keydown",
  (event) => {
    if (event.defaultPrevented) {
      return;
    }

    // F12 开发工具 / F5 刷新保留;浏览器默认已禁用其余 F 键功能
    if (event.key === "F12") {
      return;
    }

    // Ctrl/Cmd 组合键统一处理
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      const withShift = event.shiftKey;
      const editable = isEditableTarget(event.target);

      // 输入框内编辑操作:撤销 / 重做
      if (withShift && key === "z" && editable) {
        return;
      }
      if (!withShift && key === "z" && editable) {
        return;
      }

      // 保留:复制 / 粘贴 / 剪切 / 全选 / 页面缩放
      if (!withShift && ["c", "v", "x", "a", "=", "+", "-", "0"].includes(key)) {
        return;
      }

      // 其余(查找、打印、另存为、历史、书签、切换标签等)全部拦截
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <AppContextMenu />
  </React.StrictMode>,
);
