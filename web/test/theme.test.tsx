import { readFileSync } from "node:fs";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider, ThemeToggle } from "../src/lib/theme";
import { renderAt } from "./helpers/render";

let dark: boolean;
let change: (()=>void) | undefined;
const boot = readFileSync("public/theme-init.js","utf8");
function mount() { return render(<ThemeProvider><ThemeToggle /></ThemeProvider>); }
beforeEach(()=>{
  dark = false; change = undefined; localStorage.clear();
  vi.stubGlobal("matchMedia",vi.fn(()=>({get matches(){return dark;},addEventListener:(_name:string,fn:()=>void)=>{change=fn;},removeEventListener:vi.fn()})));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
it("applies a saved preference before React renders",()=>{
  dark=true; localStorage.setItem("hypestamp.theme","light");
  window.eval(boot);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
});
it("follows system changes only until explicitly toggled",async()=>{
  mount();
  act(()=>{dark=true;change?.();});
  expect(screen.getByRole("button",{name:"Switch to light mode"})).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button",{name:"Switch to light mode"}));
  expect(localStorage.getItem("hypestamp.theme")).toBe("light");
  act(()=>{dark=false;change?.();dark=true;change?.();});
  expect(document.documentElement.dataset.theme).toBe("light");
});
it("persists an explicit choice across reloads",async()=>{
  const view = mount();
  await userEvent.click(screen.getByRole("button",{name:"Switch to dark mode"}));
  view.unmount(); window.eval(boot); mount();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("button",{name:"Switch to light mode"})).toBeInTheDocument();
});
it("works when storage is unavailable during initialization and toggling",async()=>{
  vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new Error("blocked");});
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("blocked");});
  dark=true; window.eval(boot); mount();
  expect(document.documentElement.dataset.theme).toBe("dark");
  await userEvent.click(screen.getByRole("button",{name:"Switch to light mode"}));
  expect(document.documentElement.dataset.theme).toBe("light");
});
it("ignores invalid storage values and follows system on first visit",()=>{
  localStorage.setItem("hypestamp.theme","untrusted"); dark=true; window.eval(boot); mount();
  expect(document.documentElement.dataset.theme).toBe("dark");
});
it("keeps a shared choice when navigating from landing to dashboard",async()=>{
  renderAt("/");
  await userEvent.click(screen.getByRole("button",{name:"Switch to dark mode"}));
  await userEvent.click(screen.getByRole("link",{name:"Explore dashboard"}));
  expect(await screen.findByRole("heading",{name:"A clear view of the trading record."})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Switch to light mode"})).toBeInTheDocument();
});
it("loads the initialization script before the application module",()=>{
  const html=readFileSync("index.html","utf8");
  expect(html.indexOf('src="/theme-init.js"')).toBeLessThan(html.indexOf('type="module"'));
});
